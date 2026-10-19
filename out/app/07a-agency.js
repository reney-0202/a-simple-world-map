"use strict";

// ---- L（参与感/战略灵活性）：政治资本 —— 玩家施政的稀缺行动预算 ----------------
// 评审发现的缺口：K 之后七大国各有 2 个内政动作，但
//   ① 动作零代价、可无限点击 —— 连点同一按钮即可把派系天平拉满，「选择」形同虚设；
//   ② 47/54 个实体（所有非大国）内政面板里一个可点的按钮都没有。
// 这里引入一个玩家专属的行动预算来同时解决两者：
//   · 每月按「执政合法性 / 社会动荡」结算（稳则多、乱则少），上限 100；
//   · 每个施政动作消耗固定点数，不足则动作被**拒绝且不产生任何副作用**；
//   · 通用实体获得 3 个施政动作，使「能做的事」从 7 国扩展到全部 54 个可玩实体。
// 资本只约束玩家动作，不参与任何经济计算（不写 P.pmods），因此对既有仿真数值零影响。
const PC_CAP = 100;
const PC_START = 55;
const PC_BASE_ACCRUAL = 3.0;
const DOMESTIC_ACTION_COST = {
  // 通用实体施政
  gen_austerity: 12, gen_welfare: 14, gen_crackdown: 16,
  // 大国施政：路线级动作更贵，使「两条路线都走」在预算上不可持续
  rebalance_consumer: 16, placate_vpk: 14, compromise_budget: 15,
  chn_expand_sez: 18, chn_price_reform: 20,
  deu_ostpolitik: 18, deu_nato_pledge: 16,
  jpn_domestic_demand: 18, jpn_export_push: 18,
  fra_industrial_policy: 18, fra_hard_franc: 20,
  gbr_tight_money: 20, gbr_welfare_compromise: 16
};
const DOMESTIC_ACTION_DEFAULT_COST = 14;

// ---- L（战略灵活性）：施政方针 —— 玩家自选治理路线 -------------------------------
// 政治资本解决了「能做的事有限」，但还没解决「为什么这样选」。这里给玩家一个
// 显式的治理路线开关，让同一份预算在不同路线下产生不同的机会成本：
//   · 强硬路线：压制动荡、行政效率高（部分动作更便宜），但消耗合法性（预算结算变慢）
//   · 改革路线：民意授权更多（预算结算更快），但改革阵痛抬升动荡（部分动作更便宜）
//   · 均衡施政：默认，零漂移零折扣 —— 保证既有行为逐位不变
// 路线只影响玩家自己的国家，且默认值完全中性，因此对 AI 与史实路径零影响。
const POSTURE_SWITCH_COST = 15;
const POSTURES = {
  balanced: {
    zh: "均衡施政", icon: "⚖️",
    desc: "不偏不倚地推进各项议程：无额外漂移，也无成本折扣。",
    unrestDrift: 0, capitalMod: 0, costMod: {}
  },
  hardline: {
    zh: "强硬路线", icon: "🛡️",
    desc: "以行政与治安力量压制动荡，并降低强硬类动作的成本；代价是民意授权流失，政治资本结算变慢。",
    unrestDrift: -0.15, capitalMod: -0.8,
    costMod: {
      gen_crackdown: 0.7, gen_austerity: 0.8,
      gbr_tight_money: 0.8, fra_hard_franc: 0.8,
      deu_nato_pledge: 0.8, placate_vpk: 0.8
    }
  },
  reformist: {
    zh: "改革路线", icon: "🌱",
    desc: "以开放与让利换取民意授权，改革类动作成本更低、政治资本结算更快；代价是改革阵痛抬升社会动荡。",
    unrestDrift: 0.10, capitalMod: 1.0,
    costMod: {
      gen_welfare: 0.8,
      chn_expand_sez: 0.8, chn_price_reform: 0.85,
      jpn_domestic_demand: 0.8, fra_industrial_policy: 0.8,
      gbr_welfare_compromise: 0.8, deu_ostpolitik: 0.85,
      rebalance_consumer: 0.8
    }
  }
};

function initPosture(force) {
  if (force || typeof ST.posture !== "string" || !POSTURES[ST.posture]) {
    ST.posture = "balanced";
  }
  return ST.posture;
}

function sanitizePosture(p) {
  return (typeof p === "string" && POSTURES[p]) ? p : "balanced";
}

function currentPosture() {
  const k = initPosture(false);
  return POSTURES[k] || POSTURES.balanced;
}

function postureCostMultiplier(actType) {
  const mods = currentPosture().costMod || {};
  const m = mods[actType];
  return typeof m === "number" ? m : 1;
}

function setPosture(key) {
  if (!POSTURES[key]) return false;
  if (initPosture(false) === key) return false;
  if (!spendPoliticalCapital(POSTURE_SWITCH_COST)) {
    const pc = initPoliticalCapital();
    toast({
      zh: "【方针调整受阻】",
      note: "调整施政方针需 " + POSTURE_SWITCH_COST + " 点政治资本，当前仅 " + pc.value.toFixed(1) + " 点。"
    });
    return false;
  }
  ST.posture = key;
  toast({ zh: "【施政方针确立】" + POSTURES[key].icon + " " + POSTURES[key].zh, note: POSTURES[key].desc });
  refreshDomesticBox(ST.sel);
  return true;
}

// 施政方针的月度漂移：只动玩家自己国家的社会动荡（各国都有的通用字段）
function adjustPlayerUnrest(delta) {
  const p = ST.player;
  const dom = ST.domestic || {};
  if (!p || !delta) return;
  let obj = null;
  if (p === "SUN") obj = dom.sun;
  else if (p === "USA") obj = dom.usa;
  else if (p === "CHN") obj = dom.chn;
  else if (p === "DEU") obj = dom.deu;
  else if (p === "JPN") obj = dom.jpn;
  else if (p === "FRA") obj = dom.fra;
  else if (p === "GBR") obj = dom.gbr;
  else if (dom.generals && dom.generals[p]) obj = dom.generals[p];
  if (obj && typeof obj.unrest === "number") {
    obj.unrest = clamp(obj.unrest + delta, 0, 100);
  }
}

function updatePostureDrift() {
  if (!ST.player) return;
  const drift = currentPosture().unrestDrift || 0;
  if (drift) adjustPlayerUnrest(drift);
}

// ---- L（参与感）：国家战略指令 —— 玩家自选的长周期目标 --------------------------
// 政治资本解决「每步怎么花」，施政方针解决「用什么路线」，但玩家仍缺一个
// **跨年度**的目标：所有既有玩法都是当月见效的，没有一个「我要在四年内做到什么」的承诺。
// 指令板补上这一层：同时最多 2 项，采纳消耗政治资本，达成给回预算，逾期则受罚。
// 全部指标都读既有状态（动荡/合法性/军费/外汇/议程数），因此不新增任何经济通道。
const DIRECTIVE_ADOPT_COST = 10;
const DIRECTIVE_MAX_ACTIVE = 2;
const DIRECTIVES = [
  { id: "dir_calm", zh: "社会和解", icon: "🕊️", desc: "把社会动荡压到 15 以下",
    metric: "unrest", dir: "le", target: 15, months: 24, reward: 20, penalty: { capital: -10, unrest: 4 } },
  { id: "dir_mandate", zh: "民意授权", icon: "🗳️", desc: "把执政合法性提到 70 以上",
    metric: "legit", dir: "ge", target: 70, months: 30, reward: 22, penalty: { capital: -10, unrest: 3 } },
  { id: "dir_reserves", zh: "储备积累", icon: "💰", desc: "外汇储备净增 15 亿美元",
    metric: "reserves", delta: true, target: 15, months: 36, reward: 18, penalty: { capital: -8 } },
  { id: "dir_agenda", zh: "战略落地", icon: "🎯", desc: "完成 1 项国家议程",
    metric: "agendas", delta: true, target: 1, months: 36, reward: 25, penalty: { capital: -12 } },
  { id: "dir_retrench", zh: "军费收缩", icon: "✂️", desc: "把军费占比压到 3.0% 以下",
    metric: "mil", dir: "le", target: 3, months: 24, reward: 20, penalty: { capital: -10, unrest: 2 } },
  { id: "dir_buildup", zh: "军备扩张", icon: "⚔️", desc: "把军费占比提到 6.0% 以上",
    metric: "mil", dir: "ge", target: 6, months: 24, reward: 20, penalty: { capital: -10, unrest: 5 } }
];

function initDirectiveState(force) {
  if (force || !ST.directives || typeof ST.directives !== "object") {
    ST.directives = { active: [], done: [] };
  }
  if (!Array.isArray(ST.directives.active)) ST.directives.active = [];
  if (!Array.isArray(ST.directives.done)) ST.directives.done = [];
  return ST.directives;
}

function sanitizeDirectiveState(d) {
  const fresh = { active: [], done: [] };
  if (!d || typeof d !== "object") return fresh;
  const valid = {};
  for (let i = 0; i < DIRECTIVES.length; i++) valid[DIRECTIVES[i].id] = true;
  if (Array.isArray(d.done)) {
    for (let i = 0; i < d.done.length; i++) {
      if (valid[d.done[i]] && fresh.done.indexOf(d.done[i]) < 0) fresh.done.push(d.done[i]);
    }
  }
  if (Array.isArray(d.active)) {
    for (let i = 0; i < d.active.length && fresh.active.length < DIRECTIVE_MAX_ACTIVE; i++) {
      const a = d.active[i];
      if (!a || !valid[a.id] || fresh.done.indexOf(a.id) >= 0) continue;
      if (fresh.active.some((x) => x.id === a.id)) continue;
      fresh.active.push({
        id: a.id,
        start: typeof a.start === "number" ? a.start : 0,
        base: typeof a.base === "number" ? a.base : 0
      });
    }
  }
  return fresh;
}

function directiveDef(id) {
  for (let i = 0; i < DIRECTIVES.length; i++) if (DIRECTIVES[i].id === id) return DIRECTIVES[i];
  return null;
}

function simMonthIndex() {
  const y = SIM.S ? SIM.S.year : 1980;
  const m = SIM.S ? Math.max(1, SIM.S.month) : 1;
  return y * 12 + m;
}

function directiveMetricValue(metric) {
  if (metric === "unrest") return clamp(politicalUnrest(), 0, 100);
  if (metric === "legit") return clamp(politicalLegitimacy(), 0, 100);
  if (metric === "mil") return ST.mil || 0;
  if (metric === "reserves") {
    return (ST.reserves && ST.reserves[ST.player] && typeof ST.reserves[ST.player].usd === "number")
      ? ST.reserves[ST.player].usd : 0;
  }
  if (metric === "agendas") {
    const st = ST.agendas && ST.agendas[ST.player];
    return (st && Array.isArray(st.completed)) ? st.completed.length : 0;
  }
  return 0;
}

function directiveSatisfied(entry, def) {
  const v = directiveMetricValue(def.metric);
  if (def.delta) return (v - entry.base) >= def.target;
  if (def.dir === "ge") return v >= def.target;
  return v <= def.target;
}

// 0~1 的展示用进度（达标即 1）
function directiveProgress(entry, def) {
  if (directiveSatisfied(entry, def)) return 1;
  const v = directiveMetricValue(def.metric);
  let p;
  if (def.delta) p = (v - entry.base) / Math.max(def.target, 0.0001);
  else if (def.dir === "ge") p = v / Math.max(def.target, 0.0001);
  else p = def.target / Math.max(v, 0.0001);
  return clamp(p, 0, 1);
}

function directiveMonthsLeft(entry, def) {
  return def.months - (simMonthIndex() - entry.start);
}

function adoptDirective(id) {
  if (!ST.player) return false;
  const def = directiveDef(id);
  if (!def) return false;
  const st = initDirectiveState(false);
  if (st.done.indexOf(id) >= 0) return false;
  if (st.active.some((x) => x.id === id)) return false;
  if (st.active.length >= DIRECTIVE_MAX_ACTIVE) {
    toast({ zh: "【指令受阻】", note: "同时最多推进 " + DIRECTIVE_MAX_ACTIVE + " 项国家战略指令。" });
    return false;
  }
  if (!spendPoliticalCapital(DIRECTIVE_ADOPT_COST)) {
    const pc = initPoliticalCapital();
    toast({
      zh: "【指令受阻】",
      note: "采纳战略指令需 " + DIRECTIVE_ADOPT_COST + " 点政治资本，当前仅 " + pc.value.toFixed(1) + " 点。"
    });
    return false;
  }
  st.active.push({ id: id, start: simMonthIndex(), base: directiveMetricValue(def.metric) });
  toast({ zh: "【战略指令确立】" + def.icon + " " + def.zh, note: def.desc + "（期限 " + def.months + " 个月）" });
  refreshDomesticBox(ST.sel);
  return true;
}

function abandonDirective(id) {
  const st = initDirectiveState(false);
  const i = st.active.findIndex((x) => x.id === id);
  if (i < 0) return false;
  st.active.splice(i, 1);
  refreshDomesticBox(ST.sel);
  return true;
}

// 月度结算：达标即奖励并归档；逾期未达标则施加惩罚
function updateMonthlyDirectives(y, m) {
  if (!ST.player) return;
  const st = initDirectiveState(false);
  if (!st.active.length) return;
  const nowIdx = simMonthIndex();
  for (let i = st.active.length - 1; i >= 0; i--) {
    const entry = st.active[i];
    const def = directiveDef(entry.id);
    if (!def) { st.active.splice(i, 1); continue; }
    const met = directiveSatisfied(entry, def);
    const expired = (nowIdx - entry.start) >= def.months;
    if (!met && !expired) continue;
    st.active.splice(i, 1);
    const pc = initPoliticalCapital();
    if (met) {
      if (st.done.indexOf(def.id) < 0) st.done.push(def.id);
      pc.value = clamp(pc.value + def.reward, 0, pc.cap);
      toast({ zh: "🎯 战略指令达成：" + def.icon + " " + def.zh, note: def.desc + " —— 政治资本 +" + def.reward + "。" });
      EV.items.push({
        y: y, m: m,
        zh: "🎯 战略指令达成 · " + def.zh,
        note: "（" + (CM.countries[ST.player] || {}).zh + "）" + def.desc + "，政治资本 +" + def.reward + "。"
      });
      EV.unread++;
      renderInbox();
    } else {
      const pen = def.penalty || {};
      if (typeof pen.capital === "number") pc.value = clamp(pc.value + pen.capital, 0, pc.cap);
      if (typeof pen.unrest === "number") adjustPlayerUnrest(pen.unrest);
      toast({
        zh: "⚠️ 战略指令逾期：" + def.icon + " " + def.zh,
        note: "未在 " + def.months + " 个月内达成「" + def.desc + "」，政治资本 " +
          (pen.capital || 0) + "，社会动荡 +" + (pen.unrest || 0) + "。"
      });
    }
  }
}

function initPoliticalCapital(force) {
  if (force || !ST.politicalCapital || typeof ST.politicalCapital.value !== "number") {
    ST.politicalCapital = { value: PC_START, cap: PC_CAP };
  }
  return ST.politicalCapital;
}

function sanitizePoliticalCapital(d) {
  const fresh = { value: PC_START, cap: PC_CAP };
  if (d && typeof d === "object") {
    if (typeof d.value === "number" && isFinite(d.value)) fresh.value = clamp(d.value, 0, PC_CAP);
    if (typeof d.cap === "number" && isFinite(d.cap)) fresh.cap = clamp(d.cap, 10, PC_CAP);
  }
  return fresh;
}

function domesticActionCost(actType) {
  const c = DOMESTIC_ACTION_COST[actType];
  const base = typeof c === "number" ? c : DOMESTIC_ACTION_DEFAULT_COST;
  // L：施政方针给出机会成本折扣（均衡路线 = 1.0，即完全中性）
  const m = postureCostMultiplier(actType);
  return m === 1 ? base : Math.round(base * m);
}

// 执政合法性：各国用自己最能代表「施政授权」的指标，统一折算到 0~100
function politicalLegitimacy() {
  const p = ST.player;
  const dom = ST.domestic || {};
  if (p === "SUN" && dom.sun) {
    const sun = dom.sun;
    // 天平越撕裂、短缺越重，政治局越难达成新的施政共识
    return 70 - Math.abs(sun.conservative - sun.reformist) * 0.4 - sun.shortage * 0.25;
  }
  if (p === "USA" && dom.usa) return dom.usa.congressApproval;
  if (p === "CHN" && dom.chn) {
    const chn = dom.chn;
    return 55 + (chn.reformist - chn.planned) * 0.3 - chn.dualTrackPrice * 0.2;
  }
  if (p === "DEU" && dom.deu) {
    return 50 + dom.deu.detenteDepth * 0.25 - dom.deu.energyPressure * 0.2;
  }
  if (p === "JPN" && dom.jpn) return 65 - dom.jpn.tradeFriction * 0.3;
  if (p === "FRA" && dom.fra) {
    return 45 + dom.fra.francStrength * 0.3 - dom.fra.externalPressure * 0.2;
  }
  if (p === "GBR" && dom.gbr) {
    return 60 + dom.gbr.cityStrength * 0.2 - dom.gbr.inflation * 0.3;
  }
  if (dom.generals && dom.generals[p]) return dom.generals[p].legitimacy;
  return 60;
}

function politicalUnrest() {
  const p = ST.player;
  const dom = ST.domestic || {};
  if (p === "SUN" && dom.sun) return dom.sun.unrest;
  if (p === "USA" && dom.usa) return dom.usa.unrest;
  if (p === "CHN" && dom.chn) return dom.chn.unrest;
  if (p === "DEU" && dom.deu) return dom.deu.unrest;
  if (p === "JPN" && dom.jpn) return dom.jpn.unrest;
  if (p === "FRA" && dom.fra) return dom.fra.unrest;
  if (p === "GBR" && dom.gbr) return dom.gbr.unrest;
  if (dom.generals && dom.generals[p]) return dom.generals[p].unrest;
  return 0;
}

// 月度结算：基准 3.0；合法性高于 60 线性加、低于 40 线性减；社会动荡直接扣减。
// 上下限 [-1.5, +6.0] —— 乱世里施政预算会缩水，但不会彻底归零（保留最低操作空间）。
function politicalCapitalAccrual() {
  if (!ST.player) return 0;
  const leg = clamp(politicalLegitimacy(), 0, 100);
  const unrest = clamp(politicalUnrest(), 0, 100);
  // L：施政方针直接影响民意授权（强硬路线结算更慢、改革路线更快）
  const postureMod = currentPosture().capitalMod || 0;
  const g = PC_BASE_ACCRUAL + postureMod + ((leg - 60) / 40) * 2.5 - (unrest / 100) * 3.0;
  return clamp(g, -1.5, 6.0);
}

function updatePoliticalCapital() {
  const pc = initPoliticalCapital();
  const gain = politicalCapitalAccrual();
  if (gain === 0) return;
  pc.value = clamp(pc.value + gain, 0, pc.cap);
}

// 扣费：不足则**不做任何扣减**并返回 false，调用方必须在此之前不产生副作用
function spendPoliticalCapital(n) {
  const pc = initPoliticalCapital();
  if (pc.value < n) return false;
  pc.value = clamp(pc.value - n, 0, pc.cap);
  return true;
}
