"use strict";

// ---- Phase C：情报估算（把「精确读数」变成「带着误差的判断」）----------------
// 在这之前玩家看到的敌方数字全是**精确值**：对手的威望分、对手的军费、
// 战线的精确优势。于是「情报」不存在 —— 信息没有质量，也就没有不确定性，
// 决策不是在赌判断，而是在照着读数调参。
//
// 本模块补上的是**雾**：你能准确知道自己的账本，但对手的数字只能靠估。
//
//   err = base[field] × (1 − quality(subject))
//   est = truth + uniform(−1, 1) × err        // 哈希取自 (subject, field, 季度)
//
// **误差区间永远罩住真值**（|est − truth| ≤ err），这是可断言的诚实性：
// 面板给的不是「猜」，是一个真的可信区间。
//
// quality 的来源是真实资源，不是装饰：
//   · 特情预算（ST.intel.budget）→ 长期侦察能力；
//   · 「情报评估」花政治资本给单个目标加一层定向提升（与内政/威望工程/作战
//     方针抢同一份预算 —— 四选一的取舍）；
//   · 玩家自己的国家 quality = 1：你知道自己的账本。
//
// 为什么这不是纯展示：估计值有**两个真实消费者** ——
//   1. 地面战争的冒进惩罚（04a）：基于过度乐观的估计发动攻势 = 撞进有备之敌；
//   2. 核风险轴的威慑可信度（07f）：读的是**估计的**对手军费，不是真值。
// 「买情报」因此是战略投资，不是界面装饰。
//
// 不变量：零 RNG（哈希）、无执政者零回写（focus 只由玩家动作产生）、
// 存档走 sanitize 缺省补齐、估计值从不出现在面板的真值位置（endgame 终局除外 ——
// 那是复盘，理应揭示真相）。
function estimateTable() {
  return (typeof window !== "undefined" && window.W1980_ESTIMATES) || null;
}

function estimateBlank() {
  return { focus: {}, log: [] };
}

function initEstimateState(force) {
  if (force || !ST.estimates || typeof ST.estimates !== "object") ST.estimates = estimateBlank();
  const s = ST.estimates;
  if (!s.focus || typeof s.focus !== "object") s.focus = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePolEcon / sanitizeNukeState 同一约定）
function sanitizeEstimateState(d) {
  const s = estimateBlank();
  const T = estimateTable();
  if (!d || typeof d !== "object") return s;
  if (d.focus && typeof d.focus === "object") {
    const max = T ? T.PARAMS.FOCUS_MONTHS : 12;
    for (const k in d.focus) {
      const v = d.focus[k];
      if (typeof v === "number" && isFinite(v) && v > 0 && !!CM.countries[k]) {
        s.focus[k] = Math.min(Math.round(v), max);
      }
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-24).filter((e) => e && typeof e === "object" && typeof e.k === "string");
  }
  return s;
}

// 确定性哈希（与 nukeRoll 同族）：不碰 SIM.S.rngState，估算的运气
// 不得扰动仿真轨迹。
function estHash01(subject, field, quarter) {
  let h = 2166136261;
  const s = String(subject) + "|" + String(field) + "|" + String(quarter);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function curEstimateQuarter() {
  const t = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;
  return Math.floor((t - (1980 * 12 + 1)) / (estimateTable() ? estimateTable().PARAMS.QUARTER : 3));
}

// 真值读数（只给引擎与探针用；面板**永远不显示这个值**）
function trueMilOf(k) {
  if (!k) return 4.0;
  if (k === ST.player) return ST.mil;
  if (ST.ai && ST.ai.decisions && ST.ai.decisions[k] && typeof ST.ai.decisions[k].mil === "number") {
    return ST.ai.decisions[k].mil;
  }
  return 4.0;
}

// 估算质量：自己的账本是精确的；对手的账本看侦察投入。
// 战争 control 的质量取「交战对手」那一侧 —— 你的情报能力决定你看不看得清前线。
function estimateQualityOf(subject, warId) {
  const T = estimateTable();
  if (!T) return 0;
  const P = T.PARAMS;

  // 先解析「情报对象」：战线的对手侧优先（战争没有「自己的账本」这回事）
  let key = subject;
  if (warId && window.W1980_WARS && window.W1980_WARS.WARS && window.W1980_WARS.WARS[warId]) {
    const def = window.W1980_WARS.WARS[warId];
    // 玩家是交战方 → 看对手；否则看侧 A（主动方）
    key = (def.sideA === ST.player) ? def.sideB : (def.sideB === ST.player ? def.sideA : def.sideA);
  }
  if (!key || key === ST.player) return 1;

  let q = 0;
  const budget = (ST.intel && typeof ST.intel.budget === "number") ? ST.intel.budget : 0;
  q = clamp((budget - P.BUDGET_Q0) / P.BUDGET_Q_SPAN, 0, 1) * P.BUDGET_Q_MAX;

  const s = initEstimateState();
  if (s.focus[key] > 0) q += P.FOCUS_Q;

  return clamp(q, 0, P.QUALITY_CAP);
}

// 核心：对 (subject, field) 给出估计。truth 永远不外泄到显示层。
// C2：读数叠加**欺敌偏差** —— 诚实的雾只在没人撒谎时成立。
// 撒谎者（planter === reader）读到 0：自己造的谣自己不会信。
function estimateOf(subject, field) {
  const T = estimateTable();
  if (!T) return null;
  const F = T.FIELDS[field];
  if (!F) return null;
  const quality = estimateQualityOf(subject);
  const err = F.base * (1 - quality);
  const bias = (typeof deceptionBiasRaw === "function")
    ? deceptionBiasRaw(subject, field, ST.player) : 0;
  let truth;
  if (field === "prestige") truth = (typeof prestigeOf === "function") ? prestigeOf(subject) : 50;
  else if (field === "mil") truth = trueMilOf(subject);
  else return null;

  const shifted = truth + bias;
  if (!(err > 0)) {
    return { est: shifted, err: 0, lo: shifted, hi: shifted, quality: quality, exact: bias === 0, biased: bias !== 0 };
  }
  const q = curEstimateQuarter();
  const off = (estHash01(subject, field, q) - 0.5) * 2 * err;
  const est = clamp(shifted + off, F.lo, F.hi);
  return {
    est: +est.toFixed(3),
    err: +err.toFixed(3),
    lo: +clamp(est - err, F.lo, F.hi).toFixed(3),
    hi: +clamp(est + err, F.lo, F.hi).toFixed(3),
    quality: +quality.toFixed(3),
    exact: false,
    biased: bias !== 0
  };
}

// 战线优势估计（雾最重的量）。playerSide 用于换算「对我方的读数」。
// C2：假战报把整个区间推离真值 —— 「区间永远罩住真值」只在没人撒谎时成立。
function estimateControlOf(warId, playerSide) {
  const T = estimateTable();
  if (!T || typeof groundWarControl !== "function") return null;
  const F = T.FIELDS.control;
  const quality = estimateQualityOf(null, warId);
  const err = F.base * (1 - quality);
  const bias = (typeof deceptionBiasRaw === "function")
    ? deceptionBiasRaw(warId, "control", ST.player) : 0;
  const truth = groundWarControl(warId);
  const shifted = truth + bias;
  if (!(err > 0)) {
    return { est: shifted, err: 0, quality: quality, exact: bias === 0, biased: bias !== 0 };
  }
  const q = curEstimateQuarter();
  const off = (estHash01(warId, "control", q) - 0.5) * 2 * err;
  const est = clamp(shifted + off, F.lo, F.hi);
  return {
    est: +est.toFixed(2),
    err: +err.toFixed(2),
    quality: +quality.toFixed(3),
    exact: false,
    biased: bias !== 0
  };
}

// ---- 冒进惩罚（估计值变成代价的地方）---------------------------------------
// 估计把己方形势高估超过 OPTIMISM_BAND 的时候，攻势会一头撞进有备之敌：
// 推进强度被削、自身消耗加重。**买情报能消掉这个惩罚**（quality=1 → err=0
// → 永远不冒进），这是「情报评估」花钱的真正理由。
function estimateOpFogFactor(optimism) {
  const T = estimateTable();
  if (!T) return { cut: 0, attr: 0, sev: 0 };
  const P = T.PARAMS;
  if (!(typeof optimism === "number" && isFinite(optimism)) || optimism <= P.OPTIMISM_BAND) {
    return { cut: 0, attr: 0, sev: 0 };
  }
  const sev = clamp((optimism - P.OPTIMISM_BAND) / P.OPTIMISM_BAND, 0, 1);
  return {
    cut: +(P.OP_STRENGTH_CUT * sev).toFixed(3),
    attr: +(P.OP_ATTR_PENALTY * sev).toFixed(3),
    sev: +sev.toFixed(3)
  };
}

// 一场战争里「玩家有多乐观」：估计 - 真值，换算到己方视角
function estimateWarOptimism(warId, playerSide) {
  const e = estimateControlOf(warId, playerSide);
  if (!e) return 0;
  const truth = (typeof groundWarControl === "function") ? groundWarControl(warId) : 0;
  const sign = playerSide === "B" ? -1 : 1;
  return (e.est - truth) * sign;
}

// ---- 情报评估行动：花政治资本，换 12 个月的定向质量提升 ---------------------
function focusIntelligence(targetKey) {
  const T = estimateTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  if (!targetKey || !CM.countries[targetKey]) return { ok: false, reason: "unknown" };
  if (targetKey === ST.player) return { ok: false, reason: "self" };
  const s = initEstimateState();
  if (s.focus[targetKey] > 0) return { ok: false, reason: "already", def: targetKey };
  const active = Object.keys(s.focus).filter((k) => s.focus[k] > 0);
  if (active.length >= T.PARAMS.FOCUS_MAX) return { ok: false, reason: "full", max: T.PARAMS.FOCUS_MAX };
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(T.PARAMS.FOCUS_COST_PC)) {
    return { ok: false, reason: "capital", cost: T.PARAMS.FOCUS_COST_PC };
  }
  s.focus[targetKey] = T.PARAMS.FOCUS_MONTHS;
  s.log.push({ k: targetKey, y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1 });
  if (!CR.probeMode) {
    toast({ zh: "【情报评估启动】对" + (CM.countries[targetKey] || {}).zh + "的专项评估",
      note: "未来 " + T.PARAMS.FOCUS_MONTHS + " 个月该目标的估算误差大幅收窄。" +
        "（消耗政治资本 " + T.PARAMS.FOCUS_COST_PC + " 点；同时最多 " + T.PARAMS.FOCUS_MAX + " 个目标）" });
  }
  return { ok: true };
}

// 月度推进：定向评估到期
function updateMonthlyEstimates(y, m, silent) {
  const T = estimateTable();
  if (!T || !ST.player) return;          // 无执政者：没有情报行动，也就没有到期
  const s = initEstimateState();
  for (const k in s.focus) {
    if (s.focus[k] > 0) {
      s.focus[k] -= 1;
      if (s.focus[k] <= 0) delete s.focus[k];
    }
  }
}

// ---- 面板（情报机构面板里的一节）-------------------------------------------
// 只显示估计：est ± err。真值永远不进 HTML。
function estimatesPanelHtml() {
  const T = estimateTable();
  if (!T) return "";
  const s = initEstimateState();
  let h = '<div class="est-block"><div class="est-hd">🎯 情报评估 · 带误差的读数</div>';
  const rows = [];

  // 对手（威望 + 军费）
  const rival = (typeof prestigeRivalOf === "function" && ST.player) ? prestigeRivalOf(ST.player) : null;
  if (rival && CM.countries[rival]) {
    const eP = estimateOf(rival, "prestige");
    const eM = estimateOf(rival, "mil");
    if (eP) rows.push([CM.countries[rival].zh + " · 威望", "≈ " + eP.est.toFixed(1) + " ± " + eP.err.toFixed(1), eP.exact]);
    if (eM) rows.push([CM.countries[rival].zh + " · 军费", "≈ " + eM.est.toFixed(2) + "% ± " + eM.err.toFixed(2), eM.exact]);
    rows.push(["__focus__" + rival, "", false]);
  }
  // 进行中的战争（战线优势）
  if (window.W1980_WARS && window.W1980_WARS.WARS && typeof groundWarActive === "function") {
    for (const id in window.W1980_WARS.WARS) {
      if (!groundWarActive(id)) continue;
      const eC = estimateControlOf(id, "A");
      if (eC) rows.push([window.W1980_WARS.WARS[id].zh + " · 战线",
        "≈ " + eC.est.toFixed(0) + " ± " + eC.err.toFixed(0), eC.exact]);
    }
  }

  for (const r of rows) {
    if (r[0].indexOf("__focus__") === 0) {
      const target = r[0].slice(9);
      const left = s.focus[target] > 0 ? s.focus[target] : 0;
      if (left > 0) {
        h += '<div class="est-row"><span>🔍 专项评估进行中（' + left + ' 月）</span><b class="est-good">误差已收窄</b></div>';
      } else if (ST.player) {
        h += '<div class="est-row"><span>🔍 专项评估（误差收窄 ' + T.PARAMS.FOCUS_MONTHS + ' 月）</span>' +
          '<button class="est-focus-btn" data-est="' + target + '">-' + T.PARAMS.FOCUS_COST_PC + ' 政治资本</button></div>';
      }
      continue;
    }
    h += '<div class="est-row"><span>' + r[0] + '</span><b class="' + (r[2] ? "est-good" : "") + '">' + r[1] + '</b></div>';
  }
  h += '<div class="est-note">读数是估计而非真值：误差随特情预算与专项评估收窄，' +
    '但永远不为零。基于乐观估计发动进攻会撞进有备之敌。</div></div>';
  return h;
}
