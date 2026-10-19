"use strict";

// ---- R5C' T3：决策区渲染（本国面板：代价行 + 制裁/军援名单；他国面板：快捷操作行） ----
function decFillSelect(sel, kind) {
  if (!sel) return;
  const list = kind === "san" ? ST.sanctions : ST.aid;
  const full = list.length >= DEC_MAX[kind];
  const ks = Object.keys(CM.countries).sort((a, b) =>
    String(CM.countries[a].zh).localeCompare(String(CM.countries[b].zh), "zh"));
  let h = "";
  for (const k of ks) {
    const fb = decForbidden(kind, k);
    const c = CM.countries[k];
    let suffix = "";
    if (fb === 1) suffix = "（你自己）";
    else if (fb === 2) suffix = c.parent === ST.player ? "（你的附属）" : "（你的宗主）";
    else if (fb === 3) suffix = "（本国成员）";
    else if (fb === 4) suffix = kind === "san" ? "（已在军援名单）" : "（已在制裁名单）";
    h += '<option value="' + k + '"' + (fb ? " disabled" : "") + ">" + c.zh + " · " + k + suffix + "</option>";
  }
  sel.innerHTML = h;
  sel.disabled = full && !list.some((x) => x.t === ST.sel);
  if (!sel.disabled && ST.sel && !decForbidden(kind, ST.sel)) sel.value = ST.sel;   // 默认 = 当前选中实体
}
function decListRow(kind, e) {
  const tier = DEC_TIERS[kind][e.l], c = CM.countries[e.t] || { zh: e.t };
  return "<b>" + c.zh + "</b> · " + tier.zh +
    "（对方 " + (kind === "san" ? "-" : "+") + tier.tgt.toFixed(1) + "pp / 我方 -" + tier.self.toFixed(1) + "pp）" +
    '<button class="btn dundo" data-kind="' + kind + '" data-t="' + e.t + '">撤销</button>';
}
function refreshDecBox(isMine) {
  const cost = decSelfCost();
  const dc = $("p-dec-cost");
  if (dc) {
    if (cost.total > 0) {
      dc.innerHTML = "当前决策使本国年增速 <b>-" + cost.total.toFixed(1) + "pp</b>" +
        "（军费 " + cost.mil + " · 制裁反噬 " + cost.san.toFixed(1) + " · 军援损耗 " + cost.aid.toFixed(1) + "）" +
        (cost.total >= 8 ? '<div class="dwarn">你的经济正在被自己的决策拖垮</div>' : "");
      dc.classList.toggle("bad", cost.total >= 8);
    } else { dc.innerHTML = "当前决策对本国年增速无影响"; dc.classList.remove("bad"); }
  }
  for (const kind of ["san", "aid"]) {
    const pre = kind === "san" ? "p-san" : "p-aid";
    const list = kind === "san" ? ST.sanctions : ST.aid;
    const cnt = $(pre + "-cnt"); if (cnt) cnt.textContent = list.length + "/" + DEC_MAX[kind];
    const sel = $(pre + "-sel"); if (sel) decFillSelect(sel, kind);
    const lv = $(pre + "-lvls");
    if (lv) lv.querySelectorAll("button").forEach((b) => {
      const t = sel ? sel.value : ST.sel;              // 档位按钮作用于下拉当前选中的目标
      b.disabled = !t || !!decForbidden(kind, t) ||
        (list.length >= DEC_MAX[kind] && !list.some((x) => x.t === t));
      b.classList.toggle("on", list.some((x) => x.t === t && x.l === +b.dataset.l));
    });
    const lb = $(pre + "-list");
    if (lb) lb.innerHTML = list.map((e) => '<div class="drow">' + decListRow(kind, e) + "</div>").join("");
    if (lb) lb.querySelectorAll(".dundo").forEach((b) => {
      b.onclick = () => decSet(b.dataset.kind, b.dataset.t, -1);
    });
  }
  // 他国面板快捷行（§3.1）：点谁就能对谁动手；下拉只是备选入口
  const q = $("p-dec-quick");
  if (!q) return;
  if (isMine || !ST.player || !ST.sel || ST.sel === ST.player) { q.style.display = "none"; q.innerHTML = ""; return; }
  const fbS = decForbidden("san", ST.sel), fbA = decForbidden("aid", ST.sel);
  if ((fbS && fbS !== 4) || (fbA && fbA !== 4)) { q.style.display = "none"; q.innerHTML = ""; return; }
  const zh = CM.countries[ST.sel].zh;
  let h = '<div class="dq-h">对该国（' + zh + "）：</div>";
  for (const kind of ["san", "aid"]) {
    const list = kind === "san" ? ST.sanctions : ST.aid;
    const cur = list.find((x) => x.t === ST.sel);
    h += '<div class="dq-r"><span class="dq-k">' + (kind === "san" ? "制裁 ▸" : "军援 ▸") + "</span>";
    if (cur) {
      h += "<b>已" + DEC_TIERS[kind][cur.l].zh + "</b>";
      h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="-1">撤销</button>';
      for (let l = 0; l < 3; l++) if (l !== cur.l)
        h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="' + l + '">' +
          DEC_TIERS[kind][l].zh.replace("制裁", "").replace("军援", "") + "</button>";
    } else {
      for (let l = 0; l < 3; l++)
        h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="' + l + '">' +
          DEC_TIERS[kind][l].zh.replace("制裁", "").replace("军援", "") + "</button>";
    }
    h += "</div>";
  }
  q.style.display = ""; q.innerHTML = h;
  q.querySelectorAll(".dqv").forEach((b) => {
    b.onclick = () => decSet(b.dataset.kind, b.dataset.t, +b.dataset.l);
  });
}
function wireDecUI() {
  for (const kind of ["san", "aid"]) {
    const pre = kind === "san" ? "p-san" : "p-aid";
    const sel = $(pre + "-sel");
    if (sel) sel.onchange = () => { if (ST.sel !== sel.value) select(sel.value); };
    const lv = $(pre + "-lvls");
    if (lv) lv.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        const t = $(pre + "-sel") ? $(pre + "-sel").value : ST.sel;
        if (t) decSet(kind, t, +b.dataset.l);
      };
    });
  }
}
function setPlayer(k, refresh) {
  ST.player = (k && CM.countries[k]) ? k : null;
  // R5C' §1.3：切换玩家国后必须清洗名单（丢弃新本国/附属/宗主项与互斥冲突项），再重挂
  sanitizeAllDecisions();
  ST.blocOverride = {};                // R5E：换国即清阵营迁移（归属属于「这一局的你」）
  ST.blocSince = null;                 // R7A：换国同时清空阵营时间戳
  if (ST.ai) { ST.ai.decisions = {}; ST.ai.tensions = {}; }
  if (refresh !== false) {
    if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, true);
    else applyPlayerDecisions();
    rebuildBlocTable(); updPlayerTag(); refreshMilBox(); if (ST.sel) select(ST.sel);
  }
}
function setMil(v) {
  ST.mil = clamp(Number(v) || 0, 0, 10);
  if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, false);
  else applyPlayerDecisions();
  updPlayerTag(); refreshMilBox();
  if (ST.sel) select(ST.sel);
  fillTop();
}
// ------------------------------------------------- R4 终局判定（1991-12 结算）
// 范围：只消费 R3 落地的 ST.player / ST.mil；**不改引擎、不改存档格式（仍为 v2）**。
// 判定不是"胜负"而是"结算 + 评分"——本作尚无战争/外交模型，评分只由可计算量构成（见 renderEnd 口径）。
const END_Y = 1991, END_M = 12;
// E（玩法评审）：沙盒模式 —— 解除 1991-12 终局，允许无限期继续推演。
// 实现要点：simAtEnd() 是所有终局判定的唯一入口，故只需在此短路；
// 沙盒开关存于 ST.sandbox（随存档持久化），URL ?sandbox=1 或 UI 切换均可开启。
function isSandbox() { return !!(ST && ST.sandbox); }
function simAtEnd() {
  if (isSandbox()) return false;                 // 沙盒：永不触发终局
  return SIM.ready && SIM.S.year === END_Y && Math.max(1, SIM.S.month) >= END_M;
}
function setSandbox(on) {
  ST.sandbox = !!on;
  // 关闭沙盒且已越过终点 → 立即结算，避免停在「已过期」的中间态
  if (!ST.sandbox && SIM.S && simAtEnd()) simEndOpen();
  updateSandboxBadge();
}
function updateSandboxBadge() {
  const b = $("b-sandbox");
  if (b) {
    b.classList.toggle("on", isSandbox());
    b.title = isSandbox() ? "沙盒模式：已解除 1991-12 终局（点击关闭）" : "沙盒模式：解除 1991-12 终局（点击开启）";
  }
}
const BLOC_ORDER = [["NATO", "北约"], ["WP", "华约"], ["SOV", "亲苏"], ["CHN", "中国阵营"],
  ["W", "西方(非北约)"], ["NA", "不结盟/第三世界"], ["NE", "中立"]];
// GDP 名次：useSim=false → 1980 基准；true → 末期（当前仿真值）。54 实体口径。
function gdpRankOf(k, useSim) {
  const keys = Object.keys(CM.countries);
  const val = (x) => useSim ? simVal(x).gdp_bn : CM.countries[x].gdp_bn;
  keys.sort((a, b) => val(b) - val(a));
  return keys.indexOf(k) + 1;
}
// 末期同比（近 12 个月）在 54 实体中的分位 ∈ [0,1]。
// 为什么用分位而不用「与世界的差 / 固定带宽」：首版 rubric 用 ±3pp 带宽，
// 实测苏东阵营在 1991 年末同比整体为负（SUN −0.8% ~ −10.3%），**E 项在全程恒为 0** —— 死项。
// 分位是数据驱动、无魔法带宽，且对不同量级的经济体都可比。（两条曲线都记在 docs/SIM.md §11）
function growthPctl(k) {
  const g = growthOf(entKeys(k));
  if (g === null) return null;
  const keys = Object.keys(CM.countries);
  let lo = 0, n = 0;
  for (let i = 0; i < keys.length; i++) {
    const gx = growthOf(entKeys(keys[i]));
    if (gx === null) continue;
    n++; if (gx < g) lo++;
  }
  return n > 1 ? lo / (n - 1) : 0.5;
}
// 纯计算（无 DOM）：阵营 GDP 占比 / 人口结构 / 玩家评分。探针与面板共用同一份口径。
// 世界合计成立的前提：54 实体的成员 key 是对 133 成员的一个**划分**（实测实体 gdp 合计 == 成员 gdp1980 合计 == 12355.40）
function endStats() {
  const keys = Object.keys(CM.countries);
  const blocs = BLOC_ORDER.map((b) => ({ b: b[0], zh: b[1], gdp: 0, pop: 0, gdp0: 0, pop0: 0 }));
  const idx = {};
  blocs.forEach((o, i) => { idx[o.b] = i; });
  let wg = 0, wp = 0, wg0 = 0, wp0 = 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], c = CM.countries[k], j = idx[blocOf(k)];   // R5E：分组读 override（计数字段/公式零改动）
    if (j === undefined) continue;
    const v = simVal(k);
    blocs[j].gdp += v.gdp_bn; blocs[j].pop += v.pop_m;
    blocs[j].gdp0 += c.gdp_bn; blocs[j].pop0 += c.pop_m;
    wg += v.gdp_bn; wp += v.pop_m; wg0 += c.gdp_bn; wp0 += c.pop_m;
  }
  blocs.forEach((o) => {
    o.gdpShare = wg ? o.gdp / wg * 100 : 0;
    o.gdpShare0 = wg0 ? o.gdp0 / wg0 * 100 : 0;
    o.popShare = wp ? o.pop / wp * 100 : 0;
    o.popShare0 = wp0 ? o.pop0 / wp0 * 100 : 0;
  });
  const out = { date: SIM.S ? SIM.S.year + "-" + Math.max(1, SIM.S.month) : "—",
    world: { gdp: wg, pop: wp, gdp0: wg0, pop0: wp0,
      gdpDelta: wg0 ? (wg / wg0 - 1) * 100 : 0, popDelta: wp0 ? (wp / wp0 - 1) * 100 : 0 },
    blocs: blocs, player: null };
  const pk = ST.player;
  if (pk && CM.countries[pk]) {
    const c = CM.countries[pk], v = simVal(pk);
    const gSelf = growthOf(entKeys(pk)), gWorld = growthWorld();
    const pctl = growthPctl(pk);
    const rank0 = gdpRankOf(pk, false), rank1 = gdpRankOf(pk, true), dr = rank0 - rank1;
    // R6A 战略评分 Rubric 2.0（tasks/016）：E(40) + R(20) + M(15) + G(25) = 100
    const E = 40 * (pctl === null ? 0.5 : pctl);          // 经济表现：末期同比的世界分位（0→满分 40）
    const R = 20 * clamp(0.5 + dr / 8, 0, 1);             // 国力位次：上升 4 名满分 / 下降 4 名归零（0→满分 20）
    // 国防适度（tasks/012 方案 A，0→满分 15）：军费 ≈4% 满分，0% 与 ≥10% 归零
    const M = 15 * Math.max(0, 1 - Math.abs(ST.mil - 4) / 6);

    // 地缘战略分 G（tasks/016，0→满分 25）：阵营消长分 G_bloc (10分) + 战略作为分 G_act (15分)
    // (1) 阵营消长分：本国阵营 global GDP 份额变动（Δs >= +3pp 满分10，Δs=0 得5分，<= -3pp 归零）
    const pBloc = blocOf(pk);
    const bObj = blocs.find((x) => x.b === pBloc) || { gdpShare: 0, gdpShare0: 0 };
    const deltaShare = bObj.gdpShare - bObj.gdpShare0;
    const G_bloc = 10 * clamp(0.5 + deltaShare / 6.0, 0, 1);

    // (2) 战略作为分：未干预享和平发展红利(8分)；有干预考察制裁遏制与军援扶植成效(0~15分)
    let G_act = 0;
    if (!ST.sanctions.length && !ST.aid.length) {
      G_act = 8.0;   // 和平专注基准红利（专注内政建设与中立安全）
    } else {
      let gSan = 0;
      for (const s of ST.sanctions) {
        const tgtC = CM.countries[s.t];
        if (!tgtC) continue;
        let pts = s.l === 0 ? 2.0 : s.l === 1 ? 4.5 : 7.0;
        if (blocOf(s.t) !== pBloc) pts += 1.0;            // 异营对抗加成
        if (gdpRankOf(s.t, false) <= 10) pts += 1.5;     // 遏制 1980 十大大国加成
        gSan += pts;
      }
      let gAid = 0;
      for (const a of ST.aid) {
        const tgtC = CM.countries[a.t];
        if (!tgtC) continue;
        let pts = a.l === 0 ? 2.0 : a.l === 1 ? 4.5 : 7.0;
        const tgtBloc = blocOf(a.t);
        if (tgtBloc === pBloc || tgtBloc === "NA") pts += 1.0; // 同盟/第三世界扶持加成
        const tgtDr = gdpRankOf(a.t, false) - gdpRankOf(a.t, true);
        if (tgtDr >= 0) pts += 1.5;                       // 扶植成效（受援国名次未下降或上升）
        gAid += pts;
      }
      G_act = clamp(gSan + gAid, 0, 15);
    }
    const G = clamp(G_bloc + G_act, 0, 25);
    const total = E + R + M + G;

    // F（威望竞赛）：威望**不进**满分 100 的评分（那套是物质记分卡，已校准并有文档）。
    // 它作为独立的「裁决」呈现，并且已经通过真实渠道影响局面：
    // 领先导致的第三世界漂移直接改变了上面 G_bloc 的阵营份额。
    let pres = null;
    if (typeof prestigeSnapshot === "function") {
      const ps = prestigeSnapshot();
      if (ps && ps.player) {
        const rvZh = ps.rival ? ((CM.countries[ps.rival] || {}).zh || ps.rival) : "—";
        pres = {
          score: ps.score, rival: rvZh, rivalScore: ps.rivalScore, gap: ps.gap,
          drifted: ps.drifted, fired: ps.fired, drag: ps.drag,
          verdict: ps.gap === null ? "无对手" : (ps.gap >= 8 ? "赢得威望竞赛"
            : ps.gap <= -8 ? "输掉威望竞赛" : "威望大致持平")
        };
      }
    }

    out.player = { k: pk, zh: c.zh, mil: ST.mil,
      gdp: v.gdp_bn, gdp0: c.gdp_bn, gdpDelta: c.gdp_bn ? (v.gdp_bn / c.gdp_bn - 1) * 100 : 0,
      pop: v.pop_m, pop0: c.pop_m, popDelta: c.pop_m ? (v.pop_m / c.pop_m - 1) * 100 : 0,
      gSelf: gSelf, gWorld: gWorld, pctl: pctl, rank0: rank0, rank1: rank1, dr: dr,
      E: E, R: R, M: M, G: G, G_bloc: G_bloc, G_act: G_act, total: total,
      prestige: pres };
  }
  return out;
}
// ---- R11C：终局后日谈史诗长卷与历史编年史系统 ----
function generateEpilogue(st) {
  if (!st) st = endStats();
  const res = {
    title: "1980–1991 冷战终局后日谈长卷",
    subtitle: "十二年大国博弈终章 · 历史纵深与治国评述",
    rankTitle: "★ 冷战宏观观察者 ★",
    sections: []
  };
  const p = st.player;
  const blocs = st.blocs || [];
  const topBloc = blocs.slice().sort((a, b) => b.gdpShare - a.gdpShare)[0] || { zh: "西方", gdpShare: 0, gdpShare0: 0 };
  const dShare = (topBloc.gdpShare - topBloc.gdpShare0).toFixed(1);

  // G（收尾评审）：头衔判定与两套卷宗正文已抽为独立构建器（见下方 epilogue*）。
  if (p) {
    res.rankTitle = epilogueRankTitleOf(p);
    epiloguePlayerCoreVolumes(res, st, p, topBloc, dShare);
    epiloguePlayerDiplomacyVolumes(res, st, p);
  } else {
    epilogueSpectatorVolumes(res, st, topBloc, dShare);
  }
  return res;
}

// G（收尾评审）：generateEpilogue 的「历史评价头衔」判定抽为纯函数（原样搬运，仅把写入 res 改为返回值）
function epilogueRankTitleOf(p) {
  let title;
  if (p.total >= 85) title = "★ 冷战奇迹 · 大国擎天 ★";
  else if (p.total >= 70) title = "★ 定海神针 · 破浪前行 ★";
  else if (p.total >= 55) title = "★ 风雨同舟 · 守成维稳 ★";
  else title = "★ 沉浮动荡 · 时代阵痛 ★";

  // R12B 专属历史议程专属头衔联动：若达成 2 项及以上专属议程且评级良好
  if (ST.agendas && ST.agendas[p.k] && ST.agendas[p.k].completed && ST.agendas[p.k].completed.length >= 2 && p.total >= 60) {
    if (p.k === "CHN") title = "★ 改革开放与和平崛起总设计师 ★";
    else if (p.k === "JPN") title = "★ 技术立国与东亚雁阵领航者 ★";
    else if (p.k === "DEU") title = "★ 欧洲大市场奠基者与防务新支柱 ★";
    else if (p.k === "GBR") title = "★ 金融城大爆炸与结构转型总设计师 ★";
    else if (p.k === "FRA") title = "★ 高卢战略自主与欧洲单一市场统帅 ★";
    else if (p.k === "SUN") title = "★ 新联盟体制守护者与改革破局者 ★";
    else if (p.k === "USA") title = "★ 供给学派繁荣与天基高边疆统帅 ★";
  }
  return title;
}

// G（收尾评审）：玩家卷宗 A —— 卷首/卷一/卷二（时代综评、国运兴衰、国防战略）
function epiloguePlayerCoreVolumes(res, st, p, topBloc, dShare) {
  const pc = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  const rankTxt = p.dr > 0 ? ("上升 " + p.dr + " 位") : p.dr < 0 ? ("下降 " + (-p.dr) + " 位") : "维持原位";
  const pctlTxt = p.pctl !== null ? Math.round(p.pctl * 100) + "%" : "—";

  // 卷首 · 时代终局综评
  res.sections.push({
    sec: "卷首 · 时代终局综评",
    body: "在 1980 至 1991 年的风云激荡中，" + p.zh + "经历了波澜壮阔的十二年国运推演。GDP 总量由 1980 年的 " +
      p.gdp0.toFixed(0) + " 十亿扩张至 " + p.gdp.toFixed(0) + " 十亿（" + pc(p.gdpDelta) + "），世界排位由第 " +
      p.rank0 + " 名变为第 " + p.rank1 + " 名（" + rankTxt + "），经济增速位居全球第 " + pctlTxt +
      " 分位。大战略综合评分定格于 " + p.total.toFixed(1) + " / 100 分，荣膺【" + res.rankTitle.replace(/★/g, "").trim() + "】历史评价。",
    quote: "十二年间执政定策，每一项防务开支与地缘抉择，皆在世界版图上刻下了不可磨灭的印记。"
  });

  // 卷一 · 国运兴衰与阵营消长
  let sec1Body = "";
  if (p.k === "SUN") {
    const isDissolved = SIM.S && SIM.S.ussrDissolved;
    if (isDissolved) {
      sec1Body = "1991 年 12 月 25 日，莫斯科红场飘扬的红旗悄然滑落，长达半个世纪的冷战双极对峙宣告落幕。尽管执政期间进行了诸多战略周旋与政策调整，但在长期经济停滞、军备重负与各加盟共和国离心力的合力撕扯下，庞大的苏维埃大厦终告解体。新生的十五个独立国家在休克疗法的骤雨中艰难探索转型之路，亚欧大陆的地缘重心面临空前重构。";
    } else {
      sec1Body = "在关键的历史十字路口，联盟体制在改革的惊涛骇浪中得以保全。《新联盟条约》的签署与结构性调整使这艘庞然巨舰避免了四分五裂的悲剧命运。进入 1990 年代，一个保持着庞大工业底座与广袤地缘纵深的苏维埃联盟，将继续作为全球多极化格局中举足轻重的一极，打破了‘历史终结论’的单一剧本。";
    }
  } else if (p.k === "USA") {
    sec1Body = "经历 1980 年代里根经济学的复苏扩张与冷战终局的地缘胜势，美利坚合众国登上了全球单极霸权的顶峰。西方阵营在全球经济总量中的主导地位空前巩固，‘新世界秩序’成为华盛顿外交的核心叙事。然而，巨额双赤字的累积与冷战后多边体系的复杂利益诉求，预示着后冷战时代的世界并非坦途。";
  } else if (p.k === "CHN") {
    sec1Body = "从 1980 到 1991，改革开放的浩荡春风席卷神州大地。面对外部地缘风云变幻与苏东剧变的剧烈震荡，中国始终保持战略定力，坚持独立自主与对内深化改革。国民经济实现了历史性的快速跃升与民生改善，为跨入 21 世纪重返世界舞台中央奠定了坚不可摧的物质基石。";
  } else {
    sec1Body = p.zh + "作为国际舞台上的关键力量，在两大阵营激荡的夹缝与机遇中展现了非凡的韧性。经济位次" + rankTxt +
      "，在全球产业与资源贸易分工中占据了不可忽视的战略身位。";
  }
  sec1Body += " 全球格局方面，" + topBloc.zh + "阵营占据了全球 " + topBloc.gdpShare.toFixed(1) + "% 的产出份额（变动 " +
    (dShare >= 0 ? "+" : "") + dShare + "pp），冷战铁幕呈现出深刻的结构性消长。";
  res.sections.push({
    sec: "卷一 · 国运兴衰与阵营消长",
    body: sec1Body,
    quote: "阵营的兴替印证着大国兴衰的铁律：唯有内政昌明与战略清醒，方能立于不败之地。"
  });

  // 卷二 · 国防战略与军备路线
  let sec2Body = "";
  if (ST.mil >= 7) {
    sec2Body = "在防务与安全治理上，采取了高度戒备的重兵威慑学说，军费占比常年维持在 " + ST.mil + "% 的超高水平。钢铁长城虽筑牢了坚不可摧的国防壁垒，然而沉重的非生产性开支对民生与民间资本形成显著挤出，长期年均产出增速承受了累积惩罚，国防适度评分定格为 " + p.M.toFixed(1) + " / 15 分。";
  } else if (ST.mil >= 3 && ST.mil <= 5) {
    sec2Body = "防务决策展现了卓越的中庸智慧与战略定力，将国防预算严谨锚定在 " + ST.mil + "% 的适度区间。既有效威慑了潜在敌对势力、巩固了国家主权，又最大限度为工业投资与民生造血让渡了发展空间，达成了国防建设与经济繁荣的黄金平衡，国防适度分高达 " + p.M.toFixed(1) + " / 15 分。";
  } else {
    sec2Body = "推行了极其果断的紧缩裁军战略，军费占比压缩至仅 " + ST.mil + "%。刀枪入库为民生经济全力让路，带来了惊人的低负担增长红利；但在冷战充满不确定性的地缘博弈中，偏低的防务开支在突发安全风险面前面临着严峻的威慑韧性考验，国防适度评分定格为 " + p.M.toFixed(1) + " / 15 分。";
  }
  res.sections.push({
    sec: "卷二 · 国防战略与军备路线",
    body: sec2Body,
    quote: "国虽大，好战必亡；天下虽平，忘战必危。治国者的最高艺术正在于张弛之间。"
  });
}

// G（收尾评审）：玩家卷宗 B —— 卷三/卷四/卷五/卷尾（地缘前线、峰会军控、专属议程、历史回响）
function epiloguePlayerDiplomacyVolumes(res, st, p) {
  // 卷三 · 地缘前线与冲突痕迹
  let sec3Body = "";
  const hasUnsc598 = ST.ai && ST.ai.unsc && ST.ai.unsc.resolutions && ST.ai.unsc.resolutions.includes("res598");
  if (hasUnsc598) {
    sec3Body += "中东热点方面，在联合国安理会 598 号决议的强力斡旋下，两伊长达八年的堑壕拉锯与油轮战得以平息停火，波斯湾与霍尔木兹海峡重新迎来航运生机。";
  } else {
    sec3Body += "中东战局方面，两伊战争的长年消耗深刻撕裂了海湾原油动脉，油轮战的阴云笼罩霍尔木兹海峡，重塑了世界能源供应版图。";
  }
  if (ST.sanctions.length || ST.aid.length) {
    const sTargets = ST.sanctions.map((s) => (CM.countries[s.t] || { zh: s.t }).zh).join("、");
    const aTargets = ST.aid.map((a) => (CM.countries[a.t] || { zh: a.t }).zh).join("、");
    sec3Body += " 在多边博弈棋盘上，主动推行了对外干预路线" +
      (sTargets ? "（对 " + sTargets + " 实施制裁封锁）" : "") +
      (aTargets ? "（对 " + aTargets + " 注入战略军援）" : "") +
      "，虽承受了每年 -" + decSelfCost().total.toFixed(1) + "pp 的自身增长代价，却在地缘天平上斩获了 " +
      p.G_act.toFixed(1) + " 分战略作为成效。";
  } else {
    sec3Body += " 在对外政策上，奉行了独立自主与和平克制的内政专注路线，未卷入盲目的对外制裁或军援泥潭，收获了 8.0 分稳健的和平专注战略红利。";
  }
  res.sections.push({
    sec: "卷三 · 地缘前线与冲突痕迹",
    body: sec3Body,
    quote: "远方的烽烟从未真正远离，地缘棋局上的每一步落子，都在重塑世界的均势。"
  });

  // 卷四 · 峰会军控与多边秩序
  let sec4Body = "";
  const hasTreaties = ST.ai && ST.ai.treaties && Object.keys(ST.ai.treaties).length > 0;
  const activeTreaties = hasTreaties ? Object.entries(ST.ai.treaties).filter(([k, v]) => v.status === "active") : [];
  if (activeTreaties.length > 0) {
    const tNames = activeTreaties.map(([k, v]) => v.name || k).join("与");
    sec4Body += "在多边外交与大国关系领域，首脑峰会破冰机制催生了《" + tNames + "》等划时代军控条约的落地履约，大国间的互信赤字得以扭转，战略核阴云逐步消散，为世界赢得了宝贵的冷战和平红利。";
  } else {
    sec4Body += "在多边外交领域，大国首脑会晤几经周折，互信赤字与战略疑虑仍如阴云笼罩，军控博弈在妥协与坚守之间艰难前行。";
  }
  if (ST.ai && ST.ai.unsc && ST.ai.unsc.vetoCount > 0) {
    sec4Body += " 作为安理会常任理事国，在核心利益受到冲击的关键时刻果断行使了一票否决权（Veto），坚决捍卫了同盟阵营的地缘底线。";
  }
  res.sections.push({
    sec: "卷四 · 峰会军控与多边秩序",
    body: sec4Body,
    quote: "谈判桌前的握手虽无法立刻消弭铁幕，却在核阴霾之下点亮了理性的微光。"
  });

  // R12B 卷五 · 专属国家战略路线
  if (ST.agendas && ST.agendas[p.k] && Array.isArray(ST.agendas[p.k].completed) && ST.agendas[p.k].completed.length > 0) {
    const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(p.k) : [];
    const titles = ST.agendas[p.k].completed.map((id) => {
      const item = agList.find((a) => a.id === id);
      return item ? ("【" + item.title + "】") : id;
    }).join("、");
    res.sections.push({
      sec: "卷五 · 专属国家战略路线与历史答卷",
      body: "执政期间始终坚持战略定力与顶层谋划，成功达成了 " + titles + " 等具有划时代意义的专属国家议程。所开辟的独特发展路径不仅释放了深层的结构性经济红利，更使国家在复杂动荡的冷战大变局中确立了无可替代的地缘身位与制度韧性。",
      quote: "战略路线的清醒坚守是大国破局之源，非凡之策方能成就长治久安。"
    });
  }

  // 卷尾 · 历史回响
  res.sections.push({
    sec: "卷尾 · 历史回响",
    body: "1991 年的风雪渐次消散，冷战的旧时代已然落幕，但大国博弈的巨轮从未停歇。从波斯湾的石油管道到柏林墙坍塌的废墟，从日内瓦的谈判长桌到安理会的审议大厅，历史的车轮滚滚向前。1991 的终局并非历史的终结，而是人类文明在新世纪谱写多极新篇章的恢弘序曲。",
    quote: "往事如烟，青史不泯。十二年大战略激荡，终成一家之言。"
  });
}

// G（收尾评审）：旁观模式三卷正文抽为独立构建器（原样搬运，无逻辑改动）
function epilogueSpectatorVolumes(res, st, topBloc, dShare) {
  // 旁观模式
  res.sections.push({
    sec: "卷首 · 时代终局综评",
    body: "在 1980 至 1991 年的风云激荡中，全球 54 个国家与实体经历了波澜壮阔的冷战终局推演。全球经济总量由 1980 年的 " +
      (st.world.gdp0 / 1000).toFixed(2) + " 万亿扩张至 " + (st.world.gdp / 1000).toFixed(2) + " 万亿（+" +
      st.world.gdpDelta.toFixed(1) + "%），全球总人口由 " + (st.world.pop0 / 1000).toFixed(2) + " 十亿增长至 " +
      (st.world.pop / 1000).toFixed(2) + " 十亿。两极争霸的铁幕在十二年间经历了空前的剧变与重塑。",
    quote: "以超然的全知视角旁观冷战十二载，见证大国沉浮与时代更迭。"
  });
  res.sections.push({
    sec: "卷一 · 阵营消长与铁幕重塑",
    body: "各大阵营中，" + topBloc.zh + "阵营占据了全球 " + topBloc.gdpShare.toFixed(1) + "% 的经济份额（较 1980 变动 " +
      (dShare >= 0 ? "+" : "") + dShare + "pp）。苏东剧变与两极格局的演进改写了半个世纪的地缘均势，新旧秩序在阵痛中加速交替。",
    quote: "世界的重心在流动，历史的罗盘指向了不可逆转的多极化未来。"
  });
  res.sections.push({
    sec: "卷尾 · 历史回响",
    body: "1991 年的风雪落幕，冷战大时代自此告一段落。选择一个国家作为执政者重开推演，即可亲手制定军备开支、实施外交干预并检验你的大战略成就。",
    quote: "千帆过尽，唯有历史永恒。"
  });
}


function renderEpilogueHTML(ep) {
  if (!ep) return "";
  let h = '<div class="epilogue-scroll">';
  h += '<div class="epilogue-header">';
  h += '<div class="epilogue-title">' + ep.title + '</div>';
  h += '<div class="epilogue-sub">' + ep.subtitle + '</div>';
  if (ep.rankTitle) {
    h += '<div class="epilogue-badge">' + ep.rankTitle + '</div>';
  }
  h += '</div>';

  for (const sec of ep.sections) {
    h += '<div class="epilogue-section">';
    h += '<div class="epilogue-sec-title"><span>📜</span>' + sec.sec + '</div>';
    h += '<div class="epilogue-sec-body">' + sec.body + '</div>';
    if (sec.quote) {
      h += '<div class="epilogue-quote">“' + sec.quote + '”</div>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function generateChronicle() {
  const items = [];

  // G（收尾评审）：各来源的条目收集抽为独立函数（见下方 chronicle*），本函数只负责编排与排序。
  chronicleGlobalItems(items);
  chronicleDiplomacyItems(items);
  chroniclePlayerItems(items);

  // 排序：按时间升序
  items.sort((a, b) => (a.y * 12 + a.m) - (b.y * 12 + b.m));
  return items;
}

// G（收尾评审）：时间锚点 + 历史事件与时代特刊，原样搬运
function chronicleGlobalItems(items) {
// 0. 全局时间锚点：1980-01 冷战大格局确立
items.push({
  y: 1980,
  m: 1,
  time: "1980-01",
  tag: "历史大事件",
  tagClass: "event",
  title: "冷战终局推演启幕",
  desc: "两极对峙与铁幕并立，1980 全球 54 实体与 133 成员进入十二年大战略演进"
});

// 1. 历史事件与时代特刊 (来自 EV.items)
if (typeof EV !== "undefined" && EV.items && EV.items.length) {
  for (const e of EV.items) {
    const isNews = !!(window.W1980_NEWS && window.W1980_NEWS[e.id]);
    items.push({
      y: e.y,
      m: e.m,
      time: e.y + "-" + String(e.m).padStart(2, "0"),
      tag: isNews ? "时代特刊" : "历史大事件",
      tagClass: isNews ? "news" : "event",
      title: e.zh,
      desc: e.note || (isNews ? "时代标志性历史转折点" : "国际地缘与经济事件")
    });
  }
}
}

// G（收尾评审）：十字路口决断 + 军控条约 + 安理会决议，原样搬运
function chronicleDiplomacyItems(items) {
// 2. 架空十字路口决断 (来自 CR.picks)
if (typeof CR !== "undefined" && Array.isArray(CR.choices) && CR.choices.length) {
  const crMeta = {
    cr_gulf: { y: 1980, m: 9, zh: "波斯湾十字路口" },
    cr_able: { y: 1983, m: 11, zh: "优秀射手演习核危机" },
    cr_plaza: { y: 1985, m: 9, zh: "广场协议汇率谈判" },
    cr_chernobyl: { y: 1986, m: 4, zh: "切尔诺贝利核事故处置" },
    cr_east: { y: 1989, m: 6, zh: "东欧的历史抉择" },
    cr_ussr: { y: 1991, m: 3, zh: "苏维埃联盟命运公投" }
  };
  for (const pair of CR.choices) {
    if (!pair || !pair[0]) continue;
    const crId = pair[0], ci = pair[1];
    const meta = crMeta[crId] || { y: 1985, m: 1, zh: crId };
    items.push({
      y: meta.y,
      m: meta.m,
      time: meta.y + "-" + String(meta.m).padStart(2, "0"),
      tag: "历史抉择",
      tagClass: "player",
      title: meta.zh,
      desc: "做出历史十字路口决断（选项: " + ci + "）"
    });
  }
}

// 3. 军控条约签署 (来自 ST.ai.treaties)
if (ST.ai && ST.ai.treaties) {
  for (const tid in ST.ai.treaties) {
    const tr = ST.ai.treaties[tid];
    const y = tr.signedYear || 1987;
    const m = tr.signedMonth || 12;
    items.push({
      y: y,
      m: m,
      time: y + "-" + String(m).padStart(2, "0"),
      tag: "军控条约",
      tagClass: "treaty",
      title: "签署《" + (tr.name || tid) + "》",
      desc: "美苏首脑峰会达成历史性妥协，条约生效并释放和平红利"
    });
  }
}

// 4. 联合国安理会决议通过 (来自 ST.ai.unsc.resolutions)
if (ST.ai && ST.ai.unsc && ST.ai.unsc.resolutions) {
  const unscMeta = {
    res598: { y: 1987, m: 7, zh: "安理会 598 号决议（两伊停火）" },
    res660: { y: 1990, m: 8, zh: "安理会 660/678 号决议（海湾集体多边制裁）" },
    res502: { y: 1982, m: 4, zh: "安理会 502 号决议（马岛冲突调停）" }
  };
  for (const rid of ST.ai.unsc.resolutions) {
    const meta = unscMeta[rid] || { y: 1988, m: 1, zh: "安理会决议 " + rid };
    items.push({
      y: meta.y,
      m: meta.m,
      time: meta.y + "-" + String(meta.m).padStart(2, "0"),
      tag: "安理会决议",
      tagClass: "unsc",
      title: meta.zh,
      desc: "联合国安理会表决通过多边调停/制裁草案"
    });
  }
}
}

// G（收尾评审）：玩家执政决策 + 突发危机决断，原样搬运
function chroniclePlayerItems(items) {
// 5. 玩家执政核心决策
if (ST.player && CM.countries && CM.countries[ST.player]) {
  const pzh = CM.countries[ST.player].zh;
  items.push({
    y: 1980,
    m: 1,
    time: "1980-01",
    tag: "国家决策",
    tagClass: "player",
    title: pzh + " 执政启程",
    desc: "设定初始防务预算为 GDP 的 " + ST.mil + "%，确立冷战大战略施政方针"
  });
  if (ST.sanctions && ST.sanctions.length) {
    for (const s of ST.sanctions) {
      const tgtName = (CM.countries[s.t] || { zh: s.t }).zh;
      items.push({
        y: 1980,
        m: 1,
        time: "1980-01",
        tag: "国家决策",
        tagClass: "player",
        title: "对 " + tgtName + " 启动" + (DEC_TIERS.san[s.l] ? DEC_TIERS.san[s.l].zh : "制裁"),
        desc: "对外实施经贸制裁遏制（目标增速 -" + (DEC_TIERS.san[s.l] ? DEC_TIERS.san[s.l].tgt : 1) + "pp/年）"
      });
    }
  }
  if (ST.aid && ST.aid.length) {
    for (const a of ST.aid) {
      const tgtName = (CM.countries[a.t] || { zh: a.t }).zh;
      items.push({
        y: 1980,
        m: 1,
        time: "1980-01",
        tag: "国家决策",
        tagClass: "player",
        title: "向 " + tgtName + " 提供" + (DEC_TIERS.aid[a.l] ? DEC_TIERS.aid[a.l].zh : "军援"),
        desc: "提供战略防务与经济军援扶植（受援增速 +" + (DEC_TIERS.aid[a.l] ? DEC_TIERS.aid[a.l].tgt : 1) + "pp/年）"
      });
    }
  }
}

// 6. 突发危机历史决断 (来自 ST.crises.history)
if (ST.crises && Array.isArray(ST.crises.history) && ST.crises.history.length) {
  for (const h of ST.crises.history) {
    const cr = window.W1980_CRISES ? window.W1980_CRISES.getCrisisById(h.id) : null;
    const opt = cr ? (cr.options || []).find((o) => o.tier === h.tier) : null;
    items.push({
      y: h.y,
      m: h.m,
      time: h.y + "-" + String(h.m).padStart(2, "0"),
      tag: "突发危机",
      tagClass: "crisis",
      title: (cr ? cr.title : h.id) + " · 阶梯 " + h.tier + " " + (opt ? opt.title : ""),
      desc: opt ? (opt.icon + " " + (opt.effects && opt.effects.summary ? opt.effects.summary : opt.desc)) : "做出中局突发危机升级阶梯裁决"
    });
  }
}
}


function renderChronicleHTML(items) {
  if (!items || !items.length) {
    return '<div class="epilogue-section"><div class="epilogue-sec-body">暂无大事记记录。推进推演至终局即可生成十二年时代编年史。</div></div>';
  }
  let h = '<div class="chronicle-timeline">';
  for (const it of items) {
    h += '<div class="chronicle-item ' + (it.tagClass || "event") + '">';
    h += '<span class="chronicle-date">' + it.time + '</span>';
    h += '<span class="chronicle-tag ' + (it.tagClass || "event") + '">' + it.tag + '</span>';
    h += '<span class="chronicle-title">' + it.title + '</span>';
    if (it.desc) {
      h += '<div class="chronicle-desc">' + it.desc + '</div>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function exportMemoirs(st) {
  if (!st) st = endStats();
  const ep = generateEpilogue(st);
  const ch = generateChronicle();
  const sep = "========================================================";
  const subSep = "--------------------------------------------------------";
  let txt = "";
  txt += sep + "\n";
  txt += "        1980–1991 冷战大战略 · 执政回忆录与时代长卷        \n";
  txt += sep + "\n\n";

  if (st.player) {
    const p = st.player;
    txt += "【执政档案】\n";
    txt += "执政实体: " + p.zh + " (" + p.k + ")\n";
    txt += "终局评分: " + p.total.toFixed(1) + " / 100 分  " + (ep.rankTitle || "") + "\n";
    txt += "四维评分: 经济表现 " + p.E.toFixed(1) + "/40 · 国力位次 " + p.R.toFixed(1) + "/20 · 国防适度 " + p.M.toFixed(1) + "/15 · 地缘战略 " + p.G.toFixed(1) + "/25\n";
    txt += "宏观轨迹: GDP " + p.gdp0.toFixed(0) + " → " + p.gdp.toFixed(0) + " 十亿 (" + (p.gdpDelta >= 0 ? "+" : "") + p.gdpDelta.toFixed(1) + "%)\n";
    txt += "国力排位: 第 " + p.rank0 + " 名 → 第 " + p.rank1 + " 名 (" + (p.dr > 0 ? "▲" + p.dr : p.dr < 0 ? "▼" + (-p.dr) : "—") + ")\n";
    txt += "国防军费: " + p.mil + "% GDP\n\n";
  } else {
    txt += "【旁观纪要】\n";
    txt += "模式: 宏观历史观察者（旁观推演）\n";
    txt += "世界经济: " + (st.world.gdp0 / 1000).toFixed(2) + " 万亿 → " + (st.world.gdp / 1000).toFixed(2) + " 万亿 (" + (st.world.gdpDelta >= 0 ? "+" : "") + st.world.gdpDelta.toFixed(1) + "%)\n\n";
  }

  txt += subSep + "\n";
  txt += "【历史终局后日谈】\n";
  txt += subSep + "\n\n";
  for (const s of ep.sections) {
    txt += "■ " + s.sec + "\n";
    txt += s.body + "\n";
    if (s.quote) txt += "  “" + s.quote + "”\n";
    txt += "\n";
  }

  txt += subSep + "\n";
  txt += "【十二年时代大事记编年史（精选）】\n";
  txt += subSep + "\n\n";
  for (const item of ch) {
    txt += "[" + item.time + "] [" + item.tag + "] " + item.title + (item.desc ? " —— " + item.desc : "") + "\n";
  }
  txt += "\n" + sep + "\n";
  txt += "由 1980 冷战大战略模拟器（world1980）生成\n";
  txt += sep + "\n";
  return txt;
}

function fallbackCopy(txt) {
  try {
    const ta = document.createElement("textarea");
    ta.value = txt;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast({ y: 1991, m: 12, zh: "《执政回忆录》已复制", note: "已成功导出至系统剪贴板，可粘贴分享！" });
  } catch (e) {
    toast({ y: 1991, m: 12, zh: "复制失败", note: "无法访问剪贴板，请手动选取内容" });
  }
}

function copyMemoirs(st) {
  const txt = exportMemoirs(st);
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => {
        toast({ y: 1991, m: 12, zh: "《执政回忆录》已复制", note: "已成功导出至系统剪贴板，可粘贴分享！" });
      }).catch(() => fallbackCopy(txt));
      ok = true;
    } else {
      fallbackCopy(txt);
      ok = true;
    }
  } catch (err) {
    fallbackCopy(txt);
    ok = true;
  }
  return ok;
}

function setEndTab(tab) {
  ST.endTab = tab || "rubric";
  document.querySelectorAll("#end-tabs .end-tab-btn").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.endtab === ST.endTab);
  });
  const panes = {
    rubric: $("end-pane-rubric"),
    epilogue: $("end-pane-epilogue"),
    chronicle: $("end-pane-chronicle")
  };
  for (const k in panes) {
    if (panes[k]) panes[k].classList.toggle("on", k === ST.endTab);
  }
}

function wireEndTabs() {
  document.querySelectorAll("#end-tabs .end-tab-btn").forEach((btn) => {
    btn.onclick = () => setEndTab(btn.dataset.endtab);
  });
}

function renderEnd(st) {
  const box = $("end-body"); if (!box) return;
  const pc = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  const dc = (d) => '<td class="v ' + (d >= 0 ? "up" : "dn") + '">' + (d >= 0 ? "+" : "") + d.toFixed(1) + "</td>";
  // 顺序：先「你的评分」（玩家最先要看自己的结果），再世界两块；按钮在页脚（不随正文滚动）
  let h = "<h4>决策评分</h4>";
  if (st.player) {
    const p = st.player;
    h += "<table>" +
      "<tr><td>" + p.zh + " · 产出</td><td class=\"v\">" + p.gdp0.toFixed(0) + " → " + p.gdp.toFixed(0) +
        " 十亿 (" + pc(p.gdpDelta) + ")</td></tr>" +
      '<tr><td>人口</td><td class="v">' + p.pop0.toFixed(1) + " → " + p.pop.toFixed(1) + " 百万 (" + pc(p.popDelta) + ")</td></tr>" +
      '<tr><td>GDP 名次（54 实体）</td><td class="v">' + p.rank0 + " → " + p.rank1 + " (" +
        (p.dr > 0 ? "▲" + p.dr : p.dr < 0 ? "▼" + (-p.dr) : "—") + ")</td></tr>" +
      '<tr><td>末期同比 / 世界同比</td><td class="v">' + growthText(p.gSelf) + " / " + growthText(p.gWorld) +
        "（世界第 " + (p.pctl === null ? "—" : Math.round(p.pctl * 100) + "%") + " 分位）</td></tr>" +
      '<tr><td>军费占比（你的决策）</td><td class="v">' + p.mil + "%</td></tr></table>" +
      '<div class="score">' +
      '<div class="s"><b>' + p.E.toFixed(1) + "</b><span>经济表现 /40</span></div>" +
      '<div class="s"><b>' + p.R.toFixed(1) + "</b><span>国力位次 /20</span></div>" +
      '<div class="s"><b>' + p.M.toFixed(1) + "</b><span>国防适度 /15</span></div>" +
      '<div class="s"><b>' + p.G.toFixed(1) + "</b><span>地缘战略 /25</span></div></div>" +
      '<div class="tot">总分 <b>' + p.total.toFixed(1) + "</b> / 100</div>";
    // F（威望竞赛）裁决：独立于物质记分卡呈现 —— 因为它是位置性的，不是累积的。
    // 但它不是装饰：领先带来的第三世界漂移已经改变了上面 G_bloc 的阵营份额。
    if (p.prestige) {
      const pr = p.prestige;
      const pcol = pr.gap === null ? "" : (pr.gap >= 0 ? "#8fd18f" : "#e0a35a");
      h += '<div class="note"><b>🏅 威望裁决：' + pr.verdict + "</b>　你的威望 <b style=\"color:" + pcol +
        '">' + pr.score.toFixed(1) + "</b> vs " + pr.rival + " " + pr.rivalScore.toFixed(1) +
        "（" + (pr.gap >= 0 ? "+" : "") + pr.gap.toFixed(1) + "）。" +
        "已结算史实威望事件 " + pr.fired + " 起，第三世界倒向我国 " + pr.drifted + " 国。" +
        (pr.drag !== 0 ? "在建工程牺牲 GDP 增速 " + pr.drag.toFixed(2) + "pp/年。" : "") +
        "威望不进满分 100 的物质评分 —— 它是另一把尺子；它的作用通过阵营份额与执政合法性体现。</div>";
    }
    // R5C'/R6A：对外干预叙事行（含地缘战略分说明）
    if (ST.sanctions.length || ST.aid.length) {
      const yrs = (e, kind) => Math.max(0, curMonthIdx() - (e.since || 0)) / 12;
      const est = (e, kind) => {
        const pp = kind === "san" ? -DEC_TIERS.san[e.l].tgt : DEC_TIERS.aid[e.l].tgt;
        return (Math.exp(pp * yrs(e, kind) / 100) - 1) * 100;
      };
      const names = ST.sanctions.map((e) => "制裁 " + (CM.countries[e.t] || { zh: e.t }).zh + "（" + DEC_TIERS.san[e.l].zh + "）")
        .concat(ST.aid.map((e) => "军援 " + (CM.countries[e.t] || { zh: e.t }).zh + "（" + DEC_TIERS.aid[e.l].zh + "）")).join(" · ");
      const effs = ST.sanctions.map((e) => est(e, "san")).concat(ST.aid.map((e) => est(e, "aid")))
        .map((v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%").join(" / ");
      h += '<div class="note"><b>对外干预</b>：' + names + " —— 对手产出 " + effs +
        "（闭式估算），你承担 <b>-" + decSelfCost().total.toFixed(1) + "pp/年</b> 本国增速代价，换取 <b>" +
        p.G_act.toFixed(1) + "分</b> 战略作为成效分（计入地缘战略）。</div>";
    }
  } else {
    h += '<div class="note">旁观模式 · 无个人评分。在欢迎层或国家面板选一个国家，再重开一局即可获得评分。</div>';
  }
  h += '<div class="note"><b>评分口径 Rubric 2.0（作者设定，非史实校准）</b>：' +
    '经济表现 = 40×末期同比在 54 实体中的<b>分位</b>；' +
    '国力位次 = 20×clamp(0.5+名次上升/8,0,1)；' +
    '国防适度 = 15×max(0, 1−|军费−4%|/6)（军费 ≈4% 满分，过度穷兵黩武或不设防均扣分）；' +
    '地缘战略 = 25分（阵营份额消长分 10分 + 战略作为分 15分；和平专注内政享 8分基准红利，' +
    '对外有效制裁敌国与扶植盟友可获取高额战略作为分，平衡自身经济代价；见 REPORT_R6A）。</div>';
  h += "<h4>世界格局 · 阵营 GDP 占比（1980 → " + st.date + "）</h4>" +
    '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
  for (const b of st.blocs.slice().sort((a, b) => (b.gdpShare || 0) - (a.gdpShare || 0)))
    h += "<tr><td>" + b.zh + '</td><td class="v">' + ((b.gdpShare0 || 0).toFixed(1)) + '%</td><td class="v">' +
      ((b.gdpShare || 0).toFixed(1)) + "%</td>" + dc((b.gdpShare || 0) - (b.gdpShare0 || 0)) + "</tr>";
  h += '<tr><td>世界合计</td><td class="v">' + (st.world.gdp0 / 1000).toFixed(2) + ' 万亿</td><td class="v">' +
    (st.world.gdp / 1000).toFixed(2) + " 万亿</td>" + dc(st.world.gdpDelta) + "</tr></table>";
  h += "<h4>人口结构 · 阵营占比</h4>" +
    '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
  for (const b of st.blocs.slice().sort((a, b) => (b.popShare || 0) - (a.popShare || 0)))
    h += "<tr><td>" + b.zh + '</td><td class="v">' + ((b.popShare0 || 0).toFixed(1)) + '%</td><td class="v">' +
      ((b.popShare || 0).toFixed(1)) + "%</td>" + dc((b.popShare || 0) - (b.popShare0 || 0)) + "</tr>";
  h += '<tr><td>世界人口</td><td class="v">' + (st.world.pop0 / 1000).toFixed(2) + ' 十亿</td><td class="v">' +
    (st.world.pop / 1000).toFixed(2) + " 十亿</td>" + dc(st.world.popDelta) + "</tr></table>";

  const rPane = $("end-pane-rubric");
  const ePane = $("end-pane-epilogue");
  const cPane = $("end-pane-chronicle");
  if (rPane && ePane && cPane) {
    rPane.innerHTML = h;
    const ep = generateEpilogue(st);
    ePane.innerHTML = renderEpilogueHTML(ep);
    const ch = generateChronicle();
    cPane.innerHTML = renderChronicleHTML(ch);
    wireEndTabs();
    setEndTab(ST.endTab || "rubric");
  } else {
    box.innerHTML = h;
  }
  const btnCopy = $("e-copy");
  if (btnCopy) btnCopy.onclick = () => copyMemoirs(st);
}
function simEndOpen() {
  ["stats", "help", "inbox"].forEach((o) => { const e2 = $(o); if (e2) e2.classList.remove("open"); });
  renderEnd(endStats());
  const el = $("end"); if (el) el.classList.add("open");
}
function simEndClose() { const el = $("end"); if (el) el.classList.remove("open"); }
function updateDate() {
  const e = $("r-date"); if (!e) return;
  e.textContent = SIM.ready ? (SIM.S.year + "年" + Math.max(1, SIM.S.month) + "月") : "1980年1月";
  const p = $("t-play"); if (p) p.textContent = SIM.playing ? "❚❚" : "▶";
  document.querySelectorAll("#r-time .spd").forEach((b) => b.classList.toggle("on", +b.dataset.spd === SIM.speed));
  // R2 T2：时间轴进度 = 已结算月数 / 144（1980-01 → 1991-12）
  const af = $("r-axis-fill");
  if (af) {
    const mm = SIM.ready ? ((SIM.S.year - 1980) * 12 + Math.max(1, SIM.S.month)) : 0;
    af.style.width = clamp(mm / 144 * 100, 0, 100).toFixed(2) + "%";
  }
}
// 人口/工业色阶随仿真值重建（仅当该模式已烘焙时重烘）
function rebuildValueTables() {
  if (!SIM.S) return;
  const keys = Object.keys(CM.countries);
  const lp = keys.map((k) => Math.log(Math.max(1e-6, simVal(k).pop_m)));
  const li = keys.map((k) => Math.log(Math.max(1e-6, simVal(k).industry_bn)));
  const p0 = Math.min.apply(null, lp), p1 = Math.max.apply(null, lp);
  const i0 = Math.min.apply(null, li), i1 = Math.max.apply(null, li);
  keys.forEach((k, i) => {
    const id = playIdOfKey[k] || CM.countries[k].polity_id;
    tables.pop[id] = ramp((lp[i] - p0) / (p1 - p0 || 1));
    tables.ind[id] = ramp((li[i] - i0) / (i1 - i0 || 1));
    tables.delta[id] = divRamp(deltaOf(k) / DELTA_SPAN);     // R2 T4
  });
}
function onSimAdvance(yearChanged) {
  updateDate();
  fillTop();
  if (ST.sel) select(ST.sel);
  if ($("stats").classList.contains("open")) fillStats();
  // R2 T4：delta 每月都在变（不像 pop/ind 可按年重建）；pop/ind 仍按年重建以省开销
  const live = ST.mode === "delta";
  if (live || (yearChanged && (ST.mode === "pop" || ST.mode === "ind"))) {
    rebuildValueTables();
    if (bakedNow === ST.mode) { bakeNow(ST.mode); render(); drawMini(); }
  }
}
let simLoopLive = false;               // B（架构评审）：rAF 仅在播放态调度 —— 暂停时完全静止，不再每帧空转
function simLoop(ts) {
  simLoopLive = false;
  if (!SIM.ready || !SIM.playing) { SIM.lastTs = ts; return; }
  // R4：1991-12 到站 —— 停播 + 结算（P3-2：原 simLoop 无上界，时间可无限越过 1991-12）
  if (simAtEnd()) { SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0; updateDate(); simEndOpen(); return; }
  if (!SIM.lastTs) SIM.lastTs = ts;
  const dt = Math.min(0.25, (ts - SIM.lastTs) / 1000);
  SIM.lastTs = ts;
  SIM.acc += dt * SIM.speed * SIM.monthsPerSec;
  const n = Math.floor(SIM.acc);
  if (n > 0) {
    SIM.acc -= n;
    const y0 = SIM.S.year;
    for (let i = 0; i < n; i++) {
      if (simAtEnd()) break;
      if (ST.player && ST.blocOverride[ST.player] && typeof ST.blocSince === "number") applyPlayerDecisions();
      W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), false);
    }
    onSimAdvance(y0 !== SIM.S.year);
    if (simAtEnd()) { SIM.playing = false; SIM.acc = 0; updateDate(); simEndOpen(); }
  }
  if (SIM.playing) { simLoopLive = true; requestAnimationFrame(simLoop); }
}
function simKick() {                   // B：所有「恢复播放」路径必须唤醒主循环（暂停期已无空转帧可依赖）
  if (SIM.playing && !simLoopLive) { SIM.lastTs = 0; simLoopLive = true; requestAnimationFrame(simLoop); }
}
function simSetSpeed(sp) { SIM.speed = sp; updateDate(); }
function simTogglePlay() {
  if (SIM.playing) { SIM.playing = false; }
  else { if (simAtEnd()) simEndOpen(); SIM.playing = !simAtEnd(); }   // 到站后 ▶ 只重看结算，不再推进
  SIM.lastTs = 0; updateDate();
  simKick();
}
function simReset() {
  if (!SIM.ready) return;
  const D = window.W1980_SIMDATA;
  SIM.S = W1980_SIM.initState(D, 1980, 0);
  W1980_SIM.seedState(SIM.S, Object.keys(D.popStart), D.popStart);
  SIM.S.noiseSigma = SIM.vol;      // 难度 → 噪声幅度
  CR.pending = null; CR.choices = []; CR.decided.clear(); CR.deny.clear(); hideCrossroad();   // R5D：重置清空十字路口
  ST.sanctions.forEach((e) => { e.since = 0; }); ST.aid.forEach((e) => { e.since = 0; });     // R5C'：重置=1980-01 重施
  ST.blocOverride = {}; ST.blocSince = null; rebuildBlocTable();                              // R5E/R7A：重置清空阵营迁移与时间戳
  ST.frontlines = {}; rebuildFrontlinesMap();                                                 // R8A：重置清空交战前线占领
  initTradeState();                                                                           // R9B：重置清空贸易航线与外汇池至 1980 基准
  ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } }; // R10A/B/C：重置清空反应式 AI、军控条约与安理会决议
  initDomesticState();                                                                        // R12A：重置内政生态与派系权力天平至 1980 基准
  initPolEcon(true);                                                                         // P1：重置经济账单（期望锚/连续计数/已入账记录）
  initPrestigeState(true);                                                                   // F：重置威望竞赛（分数/工程/漂移/里程碑）
  initPoliticalCapital(true);                                                                 // L：重置玩家施政预算（政治资本）
  initPosture(true);                                                                          // L：重置施政方针为均衡（中性）
  initDirectiveState(true);                                                                   // L：重置国家战略指令板
  initAgendaState();                                                                          // R12B：重置专属国家战略议程至 1980 基准
  initCrisisState(); hideCrisisModal();                                                       // R12C：重置突发危机状态并收起弹窗
  initIntelState();                                                                           // R13A：重置全球谍战与隐蔽行动至 1980 基准
  initAfghanState();                                                                          // R13B：重置阿富汗战争泥潭与失血槽至 1980 基准
  applyPlayerDecisions();         // R3：重置后按当前决策重挂 pmods（否则重置会静默丢掉玩家决策）
  simEndClose();                  // R4：重置同时收起上一局结算
  SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0;
  evInit(); evRun(1980, 1, true);
  rebuildValueTables();
  if (bakedNow) { bakeNow(bakedNow); render(); drawMini(); }
  onSimAdvance(false);
}
function simFastForward(y, m) {
  if (!SIM.ready) return;
  const n0 = EV.items.length;
  let guard = 0;
  // R4：加 `!simAtEnd()` —— ?t=1992-* 不再越界（?t=1991-12 的结果与此前逐字一致）
  while (guard++ < 400 && !simAtEnd() &&
    (SIM.S.year < y || (SIM.S.year === y && Math.max(1, SIM.S.month) < m))) {
    if (ST.player && ST.blocOverride[ST.player] && typeof ST.blocSince === "number") applyPlayerDecisions();
    W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), true);
    if (CR.pending) break;            // R5D：快进遇十字路口（有玩家）→ 停下等选择
  }
  rebuildValueTables();
  if (bakedNow === "pop" || bakedNow === "ind" || bakedNow === "delta") { bakeNow(bakedNow); render(); drawMini(); }
  onSimAdvance(true);
  // R2 T3 / P1-5：快进全程走 silent（不弹 toast），补一条聚合提示，避免「11 年过去却毫无反馈」
  const evN = EV.items.length - n0;
  if (evN > 0) toast({ y: SIM.S.year, m: Math.max(1, SIM.S.month),
    zh: "快进期间发生 " + evN + " 件历史事件", note: "点顶栏 🔔 查看事件收件箱" });
}
function wireTimeControls() {
  const p = $("t-play"); if (p) p.onclick = simTogglePlay;
  const r = $("t-reset"); if (r) r.onclick = simReset;
  document.querySelectorAll("#r-time .spd").forEach((b) => b.onclick = () => simSetSpeed(+b.dataset.spd));
}
