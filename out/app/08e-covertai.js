"use strict";

// ---- Phase Cov2：隐蔽行动的 AI 侧（去 RNG 之后的对手还手）--------------------
// R13A 给了玩家完整的谍战沙盒，但对手此前几乎只靠 C2 自动欺敌「擦边还手」。
// 本模块补上对手侧：确定性规则选棋、确定性哈希判定、真实消费者落点。
//
// 三条（及以上）规则：
//   1. 对等还手 —— 玩家近期对对手/其代理战场有成功进攻性行动 → 还手
//   2. 养不起收手 —— 预算/AP 紧或经济压力高 → standDown
//   3. 粘性 —— MIN_MONTHS 内不再加新行动（防逐月翻烧饼）
//   附：被压且反间偏低 → 先加固 counter_intel；玩家丑闻冻结中 → coast
//
// 门控与 F2/E2/I2/C2 同族：只有 ?cov2probe=1 或真实有玩家局才开；旁观零回写。
// 不变量：零引擎 RNG、不升存档版本（sanitize 缺省补齐）、史实门白名单。

function covertAiTable() {
  return (typeof window !== "undefined" && window.W1980_INTEL && window.W1980_INTEL.AI_POLICY) || null;
}

function covertAiBlank() {
  return { slots: {}, log: [] };
}

function initCovertAiState(force) {
  if (force || !ST.covertAi || typeof ST.covertAi !== "object") ST.covertAi = covertAiBlank();
  const s = ST.covertAi;
  if (!s.slots || typeof s.slots !== "object") s.slots = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

function sanitizeCovertAiState(d) {
  const s = covertAiBlank();
  const P = covertAiTable();
  const knownActs = {};
  if (window.W1980_INTEL && Array.isArray(window.W1980_INTEL.ACTIONS)) {
    for (const a of window.W1980_INTEL.ACTIONS) knownActs[a.id] = true;
  }
  if (!d || typeof d !== "object") return s;
  if (d.slots && typeof d.slots === "object") {
    for (const k in d.slots) {
      if (!CM.countries[k]) continue;
      const raw = d.slots[k];
      if (!raw || typeof raw !== "object") continue;
      const slot = {
        budget: (typeof raw.budget === "number" && isFinite(raw.budget)) ? +raw.budget.toFixed(1) : (P ? P.INITIAL_BUDGET : 18),
        ap: (typeof raw.ap === "number" && isFinite(raw.ap)) ? clamp(Math.round(raw.ap), 0, P ? P.MAX_AP : 10) : (P ? P.INITIAL_AP : 6),
        counterLevel: (typeof raw.counterLevel === "number" && isFinite(raw.counterLevel))
          ? clamp(Math.round(raw.counterLevel), 10, 100) : (P ? P.INITIAL_COUNTER : 60),
        lastYm: (typeof raw.lastYm === "number" && isFinite(raw.lastYm)) ? Math.round(raw.lastYm) : null,
        cooldown: (typeof raw.cooldown === "number" && isFinite(raw.cooldown)) ? Math.max(0, Math.round(raw.cooldown)) : 0,
        lastAct: (typeof raw.lastAct === "string" && knownActs[raw.lastAct]) ? raw.lastAct : null
      };
      s.slots[k] = slot;
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(P ? P.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

function covertAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]cov2probe=1/.test(location.search));
}

function covertAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  // 对手：威望/感召力口径的对手优先，再兜底美苏
  if (typeof prestigeRivalOf === "function") push(prestigeRivalOf(player));
  else if (typeof ideologyRivalOf === "function") push(ideologyRivalOf(player));
  push("USA");
  push("SUN");
  return out;
}

function aiCovertSlotOf(k) {
  const s = initCovertAiState();
  const P = covertAiTable();
  if (!s.slots[k] || typeof s.slots[k] !== "object") {
    s.slots[k] = {
      budget: P ? P.INITIAL_BUDGET : 18,
      ap: P ? P.INITIAL_AP : 6,
      counterLevel: P ? P.INITIAL_COUNTER : 60,
      lastYm: null,
      cooldown: 0,
      lastAct: null
    };
  }
  return s.slots[k];
}

function covertAiRecord(kind, zh, extra) {
  const P = covertAiTable();
  const s = initCovertAiState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const x in extra) e[x] = extra[x];
  s.log.push(e);
  if (s.log.length > (P ? P.LOG_MAX : 24)) s.log.shift();
  return e;
}

// 玩家近期是否对某对手（或其阵营代理）打出过成功的进攻性隐蔽行动
function covertAiPlayerProvoked(actor, y, m) {
  const P = covertAiTable();
  if (!P || !ST.intel || !Array.isArray(ST.intel.history)) return false;
  const now = y * 12 + m;
  const offensive = { proxy_insurgency: 1, coup_attempt: 1, tech_smuggle: 1 };
  for (const h of ST.intel.history) {
    if (!h || !h.success || !offensive[h.id]) continue;
    const ym = (typeof h.y === "number" ? h.y : 1980) * 12 + (typeof h.m === "number" ? h.m : 1);
    if (now - ym > P.RETALIATE_LOOKBACK) continue;
    // 档案里 target 是中文名；对手执政国或任意非本土目标都算挑衅
    const actorZh = (CM.countries[actor] || {}).zh || actor;
    if (!h.target || h.target === actorZh || h.target.indexOf(actorZh) >= 0) return true;
    // 打向玩家自己以外的第三方（代理战场）也算对对手的压力
    const playerZh = (CM.countries[ST.player] || {}).zh || ST.player;
    if (h.target !== playerZh) return true;
  }
  return false;
}

// 纯规则选棋：同状态同结果，不碰 RNG。
function aiPickCovertOp(k, y, m) {
  const P = covertAiTable();
  if (!P || !window.W1980_INTEL) return null;
  const slot = aiCovertSlotOf(k);
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;

  // 规则 3：粘性 —— 窗口内不再加新行动
  if (typeof slot.lastYm === "number" && ym - slot.lastYm < P.MIN_MONTHS) {
    return null;
  }
  // 丑闻式冷却（AI 自己翻车后）
  if (slot.cooldown > 0) return null;

  // 规则 2：养不起收手（预算/AP/经济压力）
  if (slot.budget < P.BUDGET_FLOOR || slot.ap < P.AP_FLOOR || strain >= P.STRAIN_MAX) {
    return { standDown: true, reason: "strain", strain: strain, budget: slot.budget, ap: slot.ap };
  }

  // 附：玩家已在丑闻冻结中 → coast（别赶尽杀绝）
  if (ST.intel && ST.intel.scandalCooldown > 0) {
    return { standDown: true, reason: "coast" };
  }

  const provoked = covertAiPlayerProvoked(k, yy, mm);

  // 被压且反间偏低 → 先加固
  if (provoked && slot.counterLevel < P.COUNTER_LOW) {
    const def = window.W1980_INTEL.getActionById(P.DEFEND_ACT);
    if (def && slot.budget >= def.cost && slot.ap >= def.apCost) {
      return { act: P.DEFEND_ACT, target: k, reason: "defend", provoked: true };
    }
  }

  // 规则 1：对等还手 —— 对玩家执政国施压
  if (provoked && ST.player) {
    for (const id of P.RETALIATE_ACTS) {
      const act = window.W1980_INTEL.getActionById(id);
      if (!act) continue;
      if (slot.budget < act.cost || slot.ap < act.apCost) continue;
      return { act: id, target: ST.player, reason: "retaliate", provoked: true };
    }
    // 钱不够进攻但还能加固
    const def = window.W1980_INTEL.getActionById(P.DEFEND_ACT);
    if (def && slot.budget >= def.cost && slot.ap >= def.apCost) {
      return { act: P.DEFEND_ACT, target: k, reason: "defend-fallback", provoked: true };
    }
  }

  return null;
}

// 把 AI 行动的真实代价写进既有通道（禁止纯装饰 toast）
function covertAiApplyPressure(actor, actionId, success, y, m, silent) {
  const P = covertAiTable();
  if (!P || !ST.player) return { touched: [] };
  const touched = [];
  const player = ST.player;

  if (actionId === "counter_intel") {
    const slot = aiCovertSlotOf(actor);
    slot.counterLevel = clamp(slot.counterLevel + 15, 10, 100);
    touched.push("counterLevel");
    return { touched: touched };
  }

  if (!success) return { touched: touched };

  // 动荡 / 合法性 / 国会 —— 走既有内政字段
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(player) : null;
  if (dom) {
    if (typeof dom.unrest === "number") {
      dom.unrest = clamp(dom.unrest + P.UNREST_HIT, 0, 100);
      touched.push("unrest");
    }
    if (typeof dom.legitimacy === "number") {
      dom.legitimacy = clamp(dom.legitimacy - P.LEGIT_HIT, 0, 100);
      touched.push("legitimacy");
    }
    if (typeof dom.congressApproval === "number") {
      dom.congressApproval = clamp(dom.congressApproval - P.CONGRESS_HIT, 15, 90);
      touched.push("congressApproval");
    }
  }

  // 特情预算 —— 抽走玩家黑金（对手特工网在烧你的钱）
  if (ST.intel && typeof ST.intel.budget === "number") {
    ST.intel.budget = Math.max(0, +(ST.intel.budget - P.BUDGET_DRAIN).toFixed(1));
    touched.push("intel.budget");
  }

  // 阵营张力
  if (ST.ai && ST.ai.tensions && typeof ST.ai.tensions["USA:SUN"] === "number") {
    ST.ai.tensions["USA:SUN"] = clamp(ST.ai.tensions["USA:SUN"] + P.TENSION_HIT, 0, 100);
    touched.push("tension");
  }

  // 威望 / 感召力（小额可见扣分）
  if (typeof prestigeAdd === "function") {
    prestigeAdd(player, -P.PRESTIGE_HIT, "敌方特工压力");
    touched.push("prestige");
  }
  if (typeof ideologyAppealOf === "function" && ST.ideology && ST.ideology.appeal) {
    const before = ideologyAppealOf(player);
    ST.ideology.appeal[player] = clamp(before - P.APPEAL_HIT, 0, 100);
    touched.push("appeal");
  }

  return { touched: touched };
}

function executeCovertAiAction(actor, actionId, target, y, m, silent) {
  const P = covertAiTable();
  if (!P || !window.W1980_INTEL) return { ok: false, reason: "no-table" };
  const act = window.W1980_INTEL.getActionById(actionId);
  if (!act) return { ok: false, reason: "unknown" };
  const slot = aiCovertSlotOf(actor);
  if (slot.budget < act.cost || slot.ap < act.apCost) return { ok: false, reason: "afford" };

  slot.budget = +(slot.budget - act.cost).toFixed(1);
  slot.ap = slot.ap - act.apCost;
  slot.lastYm = y * 12 + m;
  slot.lastAct = actionId;

  // 目标安定度（玩家执政国）
  let tgtStab = 50;
  const tgt = target || ST.player;
  if (ST.domestic) {
    if (tgt === "SUN" && ST.domestic.sun) tgtStab = Math.max(10, 100 - ST.domestic.sun.unrest);
    else if (tgt === "USA" && ST.domestic.usa) tgtStab = ST.domestic.usa.congressApproval;
    else if (ST.domestic.generals && ST.domestic.generals[tgt]) tgtStab = ST.domestic.generals[tgt].stability;
  }
  // 玩家反间等级会压低对手成功率
  const playerCounter = (ST.intel && typeof ST.intel.counterLevel === "number") ? ST.intel.counterLevel : 50;
  const odds = window.W1980_INTEL.calcOperationOdds(actionId, actor, tgt, slot.counterLevel, tgtStab);
  // 玩家反间越高，对手越难得逞（在表内成功率上再扣一层）
  const adjSuccess = Math.max(0.1, odds.successRate - Math.max(0, playerCounter - 50) * 0.003);
  const success = actionId === "counter_intel" ? true
    : (covertRoll("ai-ok", y, m, actionId + ":" + actor, tgt) < adjSuccess);
  const blowback = !success && actionId !== "counter_intel"
    && (covertRoll("ai-bk", y, m, actionId + ":" + actor, tgt) < odds.blowbackRate);

  const applied = covertAiApplyPressure(actor, actionId, success, y, m, silent);
  if (blowback) {
    slot.cooldown = 6;
    // 曝光：对手自己丢脸 —— 小扣威望
    if (typeof prestigeAdd === "function") prestigeAdd(actor, -1.2, "特工败露");
  }

  const actorZh = (CM.countries[actor] || {}).zh || actor;
  const tgtZh = (CM.countries[tgt] || {}).zh || tgt;
  covertAiRecord(success ? "hit" : (blowback ? "blowback" : "miss"),
    actorZh + "·" + act.name + (success ? "得手" : "受挫") + " → " + tgtZh,
    { act: actionId, by: actor, target: tgt, success: success, blowback: !!blowback, touched: applied.touched });

  if (!silent && success && actionId !== "counter_intel") {
    const item = {
      y: y, m: m,
      zh: "【敌方特工】" + actorZh + "的" + act.name + "指向" + tgtZh,
      note: "对手不再只靠欺敌擦边 —— 动荡/合法性/特情预算都可能被烧掉。"
    };
    EV.items.push(item);
    EV.unread++;
    renderInbox();
    toast(item);
  } else if (!silent && blowback) {
    const item = {
      y: y, m: m,
      zh: "【敌特败露】" + actorZh + "的" + act.name + "曝光",
      note: "对手的丑闻是你的窗口 —— 但其反间网也可能因此加固。"
    };
    EV.items.push(item);
    EV.unread++;
    renderInbox();
    toast(item);
  }

  return { ok: true, success: success, blowback: !!blowback, touched: applied.touched, act: actionId };
}

function updateMonthlyCovertAi(y, m, silent) {
  const P = covertAiTable();
  if (!P) return null;
  if (!covertAiActive()) return null;
  initCovertAiState();

  for (const k of covertAiActors()) {
    const slot = aiCovertSlotOf(k);
    // 月度补给（与玩家特情同节奏，但独立账本）
    if (slot.cooldown > 0) slot.cooldown -= 1;
    else slot.budget = +(slot.budget + P.MONTHLY_BUDGET).toFixed(1);
    if (slot.ap < P.MAX_AP) slot.ap = Math.min(P.MAX_AP, slot.ap + P.MONTHLY_AP);

    const pick = aiPickCovertOp(k, y, m);
    if (!pick) continue;
    if (pick.standDown) {
      // 收手是显式决策，记一笔审计（探针可断言），不刷收件箱
      if (pick.reason === "strain" || pick.reason === "coast") {
        covertAiRecord("standDown", (CM.countries[k] || {}).zh + "收手", { by: k, reason: pick.reason });
      }
      continue;
    }
    if (pick.act) executeCovertAiAction(k, pick.act, pick.target, y, m, silent);
  }
  return ST.covertAi;
}

function covertAiSnapshot() {
  const s = initCovertAiState();
  const actors = {};
  for (const k of Object.keys(s.slots)) {
    const slot = s.slots[k];
    actors[k] = {
      budget: slot.budget, ap: slot.ap, counterLevel: slot.counterLevel,
      lastAct: slot.lastAct, lastYm: slot.lastYm, cooldown: slot.cooldown
    };
  }
  return {
    active: covertAiActive(),
    actors: actors,
    hits: s.log.filter((e) => e.kind === "hit").length,
    standDowns: s.log.filter((e) => e.kind === "standDown").length
  };
}
