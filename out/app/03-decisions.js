"use strict";


// ---- R3/R5C'/R7A：玩家决策（实体选择 + 军费占比 + 制裁/军援名单 + 阵营经贸网络）----
function isAIActive() {
  return !!(ST.ai && ST.ai.enabled && ST.player && (!CR.probeMode || /[?&](aiprobe|summitprobe|unscprobe)=1/.test(location.search)));
}
// 全部走引擎 P.pmods 玩家决策层（与事件层 P.mods 分离 → 不会互相覆盖，这是 R3 的关键设计）。
// R5C'（tasks/015）：applyPlayerMil 扩展为 applyPlayerDecisions —— **先全清再重挂**（幂等，与现状逐字同构）：
// 同一 key 被多条决策命中 → 求和（本国成员必然被「军费 + 各条自损 + 阵营网络」同时命中）；无决策时结果与旧版逐位相同（生命线）。
function applyPlayerDecisions() {
  if (!SIM.S) return;
  Object.keys(W1980_SIM.pmap(SIM.S)).forEach((k) => W1980_SIM.clearPMod(SIM.S, k));
  if (!ST.player) return;                       // 旁观：清空后即退出（不施加任何 pmods）
  const acc = {};
  let selfPP = -ST.mil;                         // 军费
  // R7A（C2 经济网络）：并入阵营经贸协作与脱钩震荡（单位 pp/年）
  const be = curBlocEffect();
  if (be.net !== 0) selfPP += be.net;
  // R9C（能源短缺冲击）：若遭受严重能源供给休克（如海峡全面封锁），叠加结构性经济折损
  if (typeof calcResourcePenalty === "function") {
    const rp = calcResourcePenalty(ST.player);
    if (rp.penalty !== 0) selfPP += rp.penalty;
  }
  // R12B（次极大国与专属国家议程）：并入已达成战略议程结构性 GDP 增速加成
  if (ST.agendas && ST.agendas[ST.player]) {
    const agState = ST.agendas[ST.player];
    if (agState && agState.bonuses && typeof agState.bonuses.gdpBonus === "number" && agState.bonuses.gdpBonus !== 0) {
      selfPP += agState.bonuses.gdpBonus;
    }
  }
  // R12A（大国内政生态与派系权力天平）：并入国内动荡与工潮折损（仅玩家自身实体）
  if (ST.domestic) {
    let unrestVal = 0;
    if (ST.player === "SUN" && ST.domestic.sun) unrestVal = ST.domestic.sun.unrest || 0;
    else if (ST.player === "USA" && ST.domestic.usa) unrestVal = ST.domestic.usa.unrest || 0;
    else if (ST.domestic.generals && ST.domestic.generals[ST.player]) unrestVal = ST.domestic.generals[ST.player].unrest || 0;
    if (unrestVal > 30) {
      const drag = -Math.min(0.35, ((unrestVal - 30) / 70) * 0.35);
      selfPP += drag;
    }
    if (ST.player === "USA" && ST.domestic.usa && ST.domestic.usa.budgetCapActive) {
      if (ST.mil > 6.0) {
        ST.mil = 6.0;
        selfPP = -6.0;
      }
    }
  }
  // R13B: 阿富汗战争撤军和平红利（仅苏联玩家完成撤军后生效）
  if (ST.player === "SUN" && ST.afghan && ST.afghan.withdrawn) {
    selfPP += 0.35;
  }
  for (let i = 0; i < ST.sanctions.length; i++) {
    const s = ST.sanctions[i], ek = entKeys(s.t);
    for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) - DEC_TIERS.san[s.l].tgt;
    selfPP -= DEC_TIERS.san[s.l].self;          // 自身反噬（逐个目标累加）
  }
  for (let i = 0; i < ST.aid.length; i++) {
    const a = ST.aid[i], ek = entKeys(a.t);
    for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + DEC_TIERS.aid[a.l].tgt;
    selfPP -= DEC_TIERS.aid[a.l].self;          // 转移损耗（逐个目标累加）
  }
  if (selfPP !== 0) {
    const ek = entKeys(ST.player);
    for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + selfPP;   // 本国全部成员（求和）
  }
  // R10A：并入 AI 反应式对抗决策（通过单一事实源 P.pmods 驱动）
  if (isAIActive() && ST.ai && ST.ai.decisions) {
    for (const aiKey in ST.ai.decisions) {
      const dec = ST.ai.decisions[aiKey];
      if (!dec) continue;
      let selfPP_ai = 0;
      const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(aiKey, CM.countries[aiKey]) : null;
      const baseMil = doc ? doc.baseMil : 2.0;
      if (typeof dec.mil === "number" && dec.mil > baseMil) {
        selfPP_ai -= (dec.mil - baseMil);
      }
      if (Array.isArray(dec.sanctions)) {
        for (let i = 0; i < dec.sanctions.length; i++) {
          const s = dec.sanctions[i], ek = entKeys(s.t);
          for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) - DEC_TIERS.san[s.l].tgt;
          selfPP_ai -= DEC_TIERS.san[s.l].self;
        }
      }
      if (Array.isArray(dec.aid)) {
        for (let i = 0; i < dec.aid.length; i++) {
          const a = dec.aid[i], ek = entKeys(a.t);
          for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + DEC_TIERS.aid[a.l].tgt;
          selfPP_ai -= DEC_TIERS.aid[a.l].self;
        }
      }
      if (selfPP_ai !== 0) {
        const ek = entKeys(aiKey);
        for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + selfPP_ai;
      }
    }
  }
  // R10B：并入生效军控条约释放的结构性和平红利（Détente Dividend）
  if (isAIActive() && ST.ai && Array.isArray(ST.ai.treaties)) {
    for (let i = 0; i < ST.ai.treaties.length; i++) {
      const tr = ST.ai.treaties[i];
      if (tr && tr.status === "active" && tr.dividend) {
        acc[ST.player] = (acc[ST.player] || 0) + tr.dividend;
        if (tr.with) acc[tr.with] = (acc[tr.with] || 0) + tr.dividend;
      }
    }
  }
  // R10C：并入联合国安理会（UNSC）生效决议效应
  if (isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed)) {
    for (let i = 0; i < ST.ai.unsc.passed.length; i++) {
      const resId = ST.ai.unsc.passed[i];
      const resDef = (window.W1980_AI && window.W1980_AI.UNSC_RESOLUTIONS) ? window.W1980_AI.UNSC_RESOLUTIONS[resId] : null;
      if (resDef && resDef.effects) {
        if (resDef.effects.multilateralEmbargo && resDef.effects.embargoPenalty) {
          const tgtKeys = entKeys(resDef.effects.multilateralEmbargo);
          for (let j = 0; j < tgtKeys.length; j++) {
            acc[tgtKeys[j]] = (acc[tgtKeys[j]] || 0) + resDef.effects.embargoPenalty;
          }
        }
        if (resDef.effects.economicRelief && Array.isArray(resDef.parties)) {
          for (let p = 0; p < resDef.parties.length; p++) {
            const pKeys = entKeys(resDef.parties[p]);
            for (let j = 0; j < pKeys.length; j++) {
              acc[pKeys[j]] = (acc[pKeys[j]] || 0) + resDef.effects.economicRelief;
            }
          }
        }
      }
    }
  }
  for (const k in acc) {
    if (acc[k] !== 0) W1980_SIM.setPMod(SIM.S, k, acc[k]);
  }
}
// 战区/成员至所属联邦可玩实体映射（如 ARG -> LAP, KWT -> ARA）
const MAP_FED_TARGET = { ARG: "LAP", KWT: "ARA" };
function resolvePlayableKey(k) {
  if (!k) return k;
  if (CM.countries && CM.countries[k]) return k;
  return MAP_FED_TARGET[k] || k;
}

// 目标合法性（§3.3 禁用规则 1–4）：返回 0=合法，否则规则号
function decForbidden(kind, t) {
  t = resolvePlayableKey(t);
  if (!ST.player || !CM.countries[t]) return 1;
  if (t === ST.player) return 1;                                   // ① 你自己
  const tc = CM.countries[t];
  if (tc.parent === ST.player || (CM.countries[ST.player] || {}).parent === t) return 2;   // ② 附属/宗主
  const mine = entKeys(ST.player), tk = entKeys(t);
  for (let i = 0; i < tk.length; i++) if (mine.indexOf(tk[i]) >= 0) return 3;              // ③ 本国成员（防御性）
  const other = kind === "san" ? ST.aid : ST.sanctions;
  for (let i = 0; i < other.length; i++) if (other[i].t === t) return 4;                   // ④ 已在另一类名单
  return 0;
}
// 存档/切国清洗（§5，六项过滤，不抛异常）：非对象项 / 未知 key / l 越界 / 违反禁用规则 / 重复（留先者）/ 超长（截断）
function sanitizeDecisions(list, kind) {
  if (!Array.isArray(list) || !ST.player) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (!it || typeof it !== "object") continue;
    const t = resolvePlayableKey(it.t), l = it.l;
    if (!CM.countries[t]) continue;
    if (l !== 0 && l !== 1 && l !== 2) continue;
    if (decForbidden(kind, t)) { console.warn("sanitizeDecisions: 丢弃非法决策项", kind, t, l); continue; }
    if (out.some((x) => x.t === t)) continue;
    if (out.length >= DEC_MAX[kind]) break;
    const e = { t: t, l: l };
    if (typeof it.since === "number") e.since = it.since;   // 叙事行用（施用时点），旧档缺省
    out.push(e);
  }
  return out;
}
// 清洗两类名单并保持「制裁↔军援互斥」（先出现者保留）；玩家国切换 / 读档后调用
function sanitizeAllDecisions() {
  ST.sanctions = sanitizeDecisions(ST.sanctions, "san");
  ST.aid = sanitizeDecisions(ST.aid, "aid");
}
function curMonthIdx() { return SIM.S ? (SIM.S.year - 1980) * 12 + Math.max(1, SIM.S.month) - 1 : 0; }
// 施加 / 改档 / 撤销（l=-1 或 点当前档）——UI 与探针共用的唯一入口
function decSet(kind, t, l) {
  t = resolvePlayableKey(t);
  if (!ST.player || !CM.countries[t]) return false;
  const fb = decForbidden(kind, t);
  if (fb && l >= 0) return false;
  const list = kind === "san" ? ST.sanctions : ST.aid;
  const i = list.findIndex((x) => x.t === t);
  if (l < 0 || l > 2) { if (i >= 0) list.splice(i, 1); else return false; }
  else if (i >= 0) { if (list[i].l === l) list.splice(i, 1); else { list[i].l = l; list[i].since = curMonthIdx(); } }
  else {
    if (list.length >= DEC_MAX[kind]) return false;
    list.push({ t: t, l: l, since: curMonthIdx() });
  }
  if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, false);
  else applyPlayerDecisions();
  updPlayerTag(); refreshMilBox();
  if (SIM.ready && SIM.S) updateTimelineFrontlines(SIM.S.year, Math.max(1, SIM.S.month), false);
  if (ST.sel) select(ST.sel);
  fillTop();
  if (i >= 0 || l >= 0) {
    const zh = (CM.countries[t] || {}).zh || t;
    const tier = l >= 0 ? DEC_TIERS[kind][l] : null;
    const d = { y: SIM.S ? SIM.S.year : "—", m: SIM.S ? Math.max(1, SIM.S.month) : "" };
    if (!tier) d.zh = "撤销对 " + zh + " 的" + (kind === "san" ? "制裁" : "军援");
    else d.zh = "对 " + zh + " 实施" + tier.zh + "：对方年增速 " + (kind === "san" ? "-" : "+") +
      tier.tgt.toFixed(1) + "pp，我方 -" + tier.self.toFixed(1) + "pp（" + (kind === "san" ? "贸易损失" : "转移损耗") + "）";
    toast(d);
  }
  return true;
}
function sanctionSet(t, l) { return decSet("san", t, l); }
function aidSet(t, l) { return decSet("aid", t, l); }
// 代价行数据（§3.5）：本国年增速总代价 = 军费 + Σ制裁反噬 + Σ军援损耗
function decSelfCost() {
  let san = 0, aid = 0;
  for (let i = 0; i < ST.sanctions.length; i++) san += DEC_TIERS.san[ST.sanctions[i].l].self;
  for (let i = 0; i < ST.aid.length; i++) aid += DEC_TIERS.aid[ST.aid[i].l].self;
  return { mil: ST.mil, san: san, aid: aid, total: ST.mil + san + aid };
}
// ---- R5E/R7A：结盟（R5E 归属 + R7A C2 经济网络） ----
// 生效面：阵营模式着色、终局结算阵营占比分组、面板 badge、P.pmods 经济协作与脱钩震荡。
function blocOf(k) { return ST.blocOverride[k] || CM.countries[k].bloc; }
function rebuildBlocTable() {          // 阵营色表随 override 重建（54 实体，代价可忽略）
  if (!tables.bloc) return;
  for (const k in CM.countries) {
    const c = CM.countries[k], id = playIdOfKey[k] || c.polity_id;
    if (id) tables.bloc[id] = u32c(BLOC[blocOf(k)] || "#9B9B9B");
  }
  if (bakedNow === "bloc") { bakeNow("bloc"); render(); drawMini(); drawOverlay(); }   // M2 教训：画布正显示该模式必须立即重烘
}
function setBloc(b) {                  // b=null → 退出（回原阵营）；只允许玩家自己
  if (!ST.player || (b && !BLOC_ZH[b])) return false;
  const orig = CM.countries[ST.player].bloc;
  const zh0 = BLOC_ZH[orig] || orig;
  if (!b || b === orig) {
    delete ST.blocOverride[ST.player];
    ST.blocSince = null;
  } else {
    ST.blocOverride[ST.player] = b;
    ST.blocSince = curMonthIdx();
  }
  applyPlayerDecisions();
  rebuildBlocTable();
  if (ST.sel) select(ST.sel);          // badge 随 select 刷新
  updPlayerTag();
  refreshBlocCtl();
  const zh1 = BLOC_ZH[blocOf(ST.player)] || blocOf(ST.player);
  const be = curBlocEffect();
  let noteText = "";
  if (b && b !== orig) {
    noteText = "经贸网络：" + (be.deltaB >= 0 ? "+" : "") + be.deltaB.toFixed(2) + "pp/年";
    if (be.friction < 0) noteText += "（脱钩震荡 " + be.friction.toFixed(2) + "pp，持续2年）";
  } else {
    noteText = "已恢复史实阵营经贸基准（无附加偏离）";
  }
  toast({ y: SIM.S ? SIM.S.year : "—", m: SIM.S ? Math.max(1, SIM.S.month) : "",
    zh: b && b !== orig ? ((CM.countries[ST.player] || {}).zh || ST.player) + " 迁入阵营 " + zh1
                        : ((CM.countries[ST.player] || {}).zh || ST.player) + " 退出阵营，回到 " + zh1,
    note: noteText });
  return true;
}
