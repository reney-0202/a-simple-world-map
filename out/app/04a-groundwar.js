"use strict";

// ---- Phase D：地面战争（把日期状态机变成可争夺的战局）----------------------
// 此前三场局部战争是纯日期状态机：到某个月就换一批省份的 occupier，
// 玩家能影响的只有停火日期提前/延后几个月。于是「谁在赢」这个概念**不存在**，
// 胜负对经济与威望零影响 —— 面板在描述战局，代码在翻日历。
//
// 本模块补上一个真正可争夺的量：control（战线优势，−100..100，正 = 侧 A 占优）。
//
//   control = 史实阶段基线(phases) + 偏离(deviation)
//
// 关键建模决定（史实不变量能保住的唯一办法）：历史路径的**战争经济代价
// 已经被校准进 `gdpBase`** —— 伊拉克的锚点是 −0.76%/年，那就是两伊战争与
// 海湾战争的代价。所以引擎只对 `attrDev`（**偏离史实的那部分**）计费，
// 不对战争总代价二次收费。不干预 → attrDev = 0 → 零 pmods → 史实轨迹一字不变。
//
// 不变量：
//   · 不消费引擎 RNG（战局是确定性的：基线 + 干预分 + 作战方针）；
//   · 无执政者时不写 pmods / 内政 / 威望（`ST.wars` 照样推进，供旁观观战）；
//   · 存档走 sanitize 缺省补齐，不升版本。
function warTable() {
  return (typeof window !== "undefined" && window.W1980_WARS) || null;
}

function groundWarBlank() {
  return { wars: {}, log: [] };
}

function initGroundWarState(force) {
  if (force || !ST.wars || typeof ST.wars !== "object") ST.wars = groundWarBlank();
  const s = ST.wars;
  if (!s.wars || typeof s.wars !== "object") s.wars = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePolEcon / sanitizePrestigeState 同一约定）
function sanitizeGroundWarState(d) {
  const s = groundWarBlank();
  const T = warTable();
  if (!d || typeof d !== "object") return s;
  const known = T ? T.WARS : {};
  const num = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v)) ? clamp(v, lo, hi) : dflt;
  if (d.wars && typeof d.wars === "object") {
    for (const id in d.wars) {
      if (!known[id]) continue;
      const w = d.wars[id] || {};
      const op = (typeof w.op === "string" && known && T && T.OPS[w.op]) ? w.op : null;
      const aiOpA = (typeof w.aiOpA === "string" && T && T.OPS[w.aiOpA]) ? w.aiOpA : null;
      const aiOpB = (typeof w.aiOpB === "string" && T && T.OPS[w.aiOpB]) ? w.aiOpB : null;
      s.wars[id] = {
        dev: num(w.dev, -100, 100, 0),
        attrA: num(w.attrA, 0, 999, 0),
        attrB: num(w.attrB, 0, 999, 0),
        attrDevA: num(w.attrDevA, 0, 999, 0),
        attrDevB: num(w.attrDevB, 0, 999, 0),
        wearA: num(w.wearA, 0, 100, 0),
        wearB: num(w.wearB, 0, 100, 0),
        op: op,
        aiOpA: aiOpA,
        aiOpB: aiOpB,
        settled: !!w.settled,
        outcome: (typeof w.outcome === "string") ? w.outcome : null,
        finalControl: num(w.finalControl, -100, 100, null),
        endM: num(w.endM, 0, 4000, null)
      };
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.id === "string");
  }
  return s;
}

function warStateOf(id) {
  const s = initGroundWarState();
  if (!s.wars[id]) {
    s.wars[id] = { dev: 0, attrA: 0, attrB: 0, attrDevA: 0, attrDevB: 0,
      wearA: 0, wearB: 0, op: null, aiOpA: null, aiOpB: null,
      settled: false, outcome: null, finalControl: null, endM: null };
  }
  return s.wars[id];
}

// D2：AI 交战方是否在决策。沿用既有 AI 的探针白名单模式 ——
// 探针模式下默认关闭（否则 warprobe / groundwarprobe 的既有断言会因
// AI 变招而漂移），只有显式 ?warai=1 的探针会话才打开；
// 旁观模式永远关闭：旁观看的是史实，不是博弈。
function warAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]warai=1/.test(location.search));
}

// D2：AI 交战方的作战决策（确定性规则，零 RNG、零政治资本）。
// 输入只有三个真实读数：己方战线优势、己方厌战、己方经济压力。
// 规则表见 data/wars.js 的 AI_POLICY 注释。
// now 显式传入（与 updateGroundWars 同一个结算月）——否则探针与引擎会用
// 不同的日期算 control，测试就是漂的。
function aiPickWarOp(id, side, now) {
  const T = warTable();
  if (!T || !T.AI_POLICY) return null;
  const P = T.AI_POLICY;
  const def = T.WARS[id];
  if (!def) return null;
  const w = warStateOf(id);
  const control = groundWarControl(id, now);
  const myEdge = side === "A" ? control : -control;
  const wear = side === "A" ? w.wearA : w.wearB;
  const key = side === "A" ? def.sideA : def.sideB;
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(key) : 0;
  const cur = side === "A" ? w.aiOpA : w.aiOpB;

  // 1. 止损优先：劣势 +（厌战高 或 经济吃紧）→ 停火
  if (myEdge < 0 && (wear >= P.WEAR_SETTLE || strain >= P.STRAIN_SETTLE)) return "seek_settlement";
  // 2. 优势推进：明显领先且还有余力
  if (myEdge >= P.ADVANTAGE && wear < P.WEAR_SETTLE) return "ground_offensive";
  // 3. 劣势稳住：明显落后 → 厌战高就守、还能磨就磨
  if (myEdge <= -P.ADVANTAGE) return wear >= P.WEAR_HALF ? "hold_line" : "attrition_siege";
  // 4. 僵持施压：经济吃紧时选便宜的空中施压（drag 0.20 < 攻势 0.30）
  if (strain >= P.STRAIN_PRESS) return "air_campaign";
  // 5. 粘性：灰区维持现状 —— 否则方针逐月翻烧饼
  return (cur && T.OPS[cur]) ? cur : "hold_line";
}

function curWarMonth(y, m) {
  if (typeof y === "number" && typeof m === "number") return y * 12 + m;
  return SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;
}

function warMonthOf(pair) { return pair[0] * 12 + pair[1]; }

// 史实 control 基线：阶梯函数。到达某个月份后，基线至少是那个值。
// 选择阶梯而非插值，是因为史实战局本来就是「阶段」而非连续曲线；
// 插值会凭空造出「逐月稳定推进」的假象。
function groundWarHistoricControl(def, now) {
  let v = 0;
  for (let i = 0; i < def.phases.length; i++) {
    const p = def.phases[i];
    if (now >= warMonthOf([p[0], p[1]])) v = p[2];
  }
  return v;
}

// 安理会决议是否已让这场战争提前停火
function warCeased(def) {
  if (!def.ceaseRes) return false;
  return !!(typeof isAIActive === "function" && isAIActive() && ST.ai &&
    ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes(def.ceaseRes));
}

// 战争何时结束 —— 时间线（`FL.endOf`）是唯一事实源。
// 回退到 data 里的史实停火日只在时间线尚未跑过时使用（例如探针直接调用引擎）。
function warEndMonth(id) {
  const T = warTable();
  const def = T && T.WARS[id];
  if (!def) return null;
  const published = (typeof FL !== "undefined" && FL.endOf) ? FL.endOf[id] : undefined;
  return (typeof published === "number") ? published : warMonthOf(def.historicEnd);
}

// 战争是否仍在进行。**单一事实源** —— 面板与推进共用它，
// 避免出现「面板说在打、模拟说结束了」这种最典型的脱节。
function groundWarActive(id, now) {
  const T = warTable();
  if (!T) return false;
  const def = T.WARS[id];
  if (!def) return false;
  const w = warStateOf(id);
  if (w.outcome || w.settled) return false;
  const t = (typeof now === "number") ? now : curWarMonth();
  if (t < warMonthOf(def.start)) return false;
  const endT = warEndMonth(id);
  if (typeof endT === "number" && t > endT) return false;
  if (warCeased(def)) return false;
  return true;
}

// 干预分差 → 偏离。军援/制裁的作用从「挪动停火日期」变成「真的推战线」。
function groundWarSupport(actualKey) {
  if (typeof getInterventionScore !== "function") return 0;
  return getInterventionScore(actualKey);
}

// 当前 control = 史实基线 + 累积偏离
// 战争结束后返回**结算时的定格战线** —— 否则面板会在终局后突然归零，
// 玩家看到的战果与他们刚刚打下来的东西不符。
function groundWarControl(id, now) {
  const T = warTable();
  if (!T) return 0;
  const def = T.WARS[id];
  if (!def) return 0;
  const w = warStateOf(id);
  if (w.outcome) return typeof w.finalControl === "number" ? w.finalControl : 0;
  const t = (typeof now === "number") ? now : curWarMonth();
  const base = groundWarHistoricControl(def, t);
  return clamp(base + w.dev, T.PARAMS.CONTROL_MIN, T.PARAMS.CONTROL_MAX);
};

// 玩家作为交战方时选择的作战方针
function setWarOp(id, opId) {
  const T = warTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  const def = T.WARS[id];
  if (!def) return { ok: false, reason: "unknown-war" };
  const op = T.OPS[opId];
  if (!op) return { ok: false, reason: "unknown-op" };
  // 先判身份再判是否进行中：「你不是交战方」比「战争不活跃」信息量更大。
  if (ST.player !== def.sideA && ST.player !== def.sideB) return { ok: false, reason: "not-belligerent" };
  if (!groundWarActive(id)) return { ok: false, reason: "not-active" };
  const w = warStateOf(id);
  if (w.op === opId) return { ok: true, def: op, unchanged: true };
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(op.pc)) {
    return { ok: false, reason: "capital", cost: op.pc };
  }
  w.op = opId;
  if (!CR.probeMode) {
    toast({ zh: "【作战方针】" + op.icon + " " + op.zh,
      note: op.note + "（消耗政治资本 " + op.pc + " 点；同时只执行一项）" });
  }
  return { ok: true, def: op };
}

function clearWarOp(id) {
  const T = warTable();
  if (!T || !ST.wars || !ST.wars.wars || !ST.wars.wars[id]) return { ok: false };
  if (!ST.wars.wars[id].op) return { ok: false, reason: "none" };
  ST.wars.wars[id].op = null;
  return { ok: true };
}

// 厌战/消耗造成的拖累（pp/年，负值）。只对 **attrDev**（偏离部分）计费。
function groundWarDragOf(attrDev) {
  const T = warTable();
  if (!T || !(attrDev > 0)) return 0;
  return -Math.min(T.PARAMS.ATTR_DRAG, attrDev * (T.PARAMS.ATTR_DRAG / T.PARAMS.ATTR_DRAG_DIV));
}

// 写进 P.pmods 的唯一入口（applyPlayerDecisions 调用；它本身就是唯一写者）。
// 无执政者时 applyPlayerDecisions 会提前返回，所以史实路径天然零影响。
function accWarAttrition(acc) {
  const T = warTable();
  if (!T || !acc || !ST.wars || !ST.wars.wars) return;
  for (const id in ST.wars.wars) {
    const def = T.WARS[id];
    if (!def) continue;
    const w = ST.wars.wars[id];
    const dA = groundWarDragOf(w.attrDevA);
    const dB = groundWarDragOf(w.attrDevB);
    if (dA === 0 && dB === 0) continue;
    if (def.sideA !== ST.player) {
      for (const k of entKeys(def.sideA)) acc[k] = (acc[k] || 0) + dA;
    }
    if (def.sideB !== ST.player) {
      for (const k of entKeys(def.sideB)) acc[k] = (acc[k] || 0) + dB;
    }
  }
}

// 玩家自己作为交战方的战争消耗（并进 playerSelfDelta 的同一条链）
function groundWarSelfDrag() {
  const T = warTable();
  if (!T || !ST.player || !ST.wars || !ST.wars.wars) return 0;
  let drag = 0;
  for (const id in ST.wars.wars) {
    const def = T.WARS[id];
    if (!def) continue;
    const w = ST.wars.wars[id];
    if (def.sideA === ST.player) drag += groundWarDragOf(w.attrDevA);
    if (def.sideB === ST.player) drag += groundWarDragOf(w.attrDevB);
  }
  return drag;
}

function groundWarRecord(id, def, outcome, control, y, m) {
  const s = initGroundWarState();
  const T = warTable();
  s.log.push({ id: id, y: y, m: m, outcome: outcome, control: +control.toFixed(1) });
  if (s.log.length > T.PARAMS.LOG_MAX) s.log.shift();
}

// 结算：判定胜负 → 威望赌注 → 清空战线
function groundWarSettle(id, def, y, m, silent, reason) {
  const T = warTable();
  const w = warStateOf(id);
  if (w.outcome) return null;
  const control = groundWarControl(id, y * 12 + m);
  let outcome;
  if (control > T.PARAMS.STALEMATE_BAND) outcome = "A";
  else if (control < -T.PARAMS.STALEMATE_BAND) outcome = "B";
  else outcome = "stalemate";
  w.outcome = outcome;
  w.finalControl = +control.toFixed(2);
  w.endM = y * 12 + m;
  w.op = null;
  groundWarRecord(id, def, outcome, control, y, m);

  // 威望赌注（F 集成）：胜方得、负方失。
  // 僵持**不给分也不扣分** —— 位置性计分本来就意味着「谁都没赢」时相对关系不变，
  // 硬塞一个零头反而会造出「拖成僵持更划算」的漏洞。
  if (typeof prestigeAdd === "function") {
    if (outcome === "A") {
      prestigeAdd(def.sideA, +def.stake, def.zh + "：战胜");
      prestigeAdd(def.sideB, -def.stake, def.zh + "：战败");
    } else if (outcome === "B") {
      prestigeAdd(def.sideB, +def.stake, def.zh + "：战胜");
      prestigeAdd(def.sideA, -def.stake, def.zh + "：战败");
    }
  }

  // 战线清空：战争结束了，地图上不该继续挂着占领区
  if (typeof ST.frontlines === "object" && ST.frontlines) {
    for (const pid of def.provinces) {
      if (ST.frontlines[pid] && ST.frontlines[pid].warId === id) delete ST.frontlines[pid];
    }
    if (typeof timelineRepaint === "function") timelineRepaint();
  }

  if (!silent && ST.player) {
    const mine = (def.sideA === ST.player) ? outcome === "A" : (def.sideB === ST.player ? outcome === "B" : null);
    const item = { y: y, m: m,
      zh: "【战局终局】" + def.zh + " · " + (outcome === "stalemate" ? "僵持停火"
        : ((CM.countries[outcome === "A" ? def.sideA : def.sideB] || {}).zh + "获胜")),
      note: (reason === "settlement" ? "在你寻求的停火下战事终止。"
        : reason === "enemy-settlement" ? "敌方主动求和，战事终止。" : "战线定格于 " + control.toFixed(0) + "。") +
        (mine === null ? "" : (mine ? "我国赢得这场战争。" : "我国输掉了这场战争。")) };
    EV.items.push(item);
    EV.unread++;
    renderInbox();
    toast(item);
  }
  return outcome;
}

// ---- 月度推进 ---------------------------------------------------------------
function updateGroundWars(y, m, silent) {
  const T = warTable();
  if (!T) return null;
  initGroundWarState();
  const now = y * 12 + m;
  for (const id in T.WARS) {
    const def = T.WARS[id];
    const w = warStateOf(id);
    const started = now >= warMonthOf(def.start);
    if (!started) continue;

    // 已结束：只做厌战消退（战后宿醉）
    if (w.outcome) {
      w.wearA = Math.max(0, w.wearA - T.PARAMS.WEAR_DECAY);
      w.wearB = Math.max(0, w.wearB - T.PARAMS.WEAR_DECAY);
      continue;
    }

    const active = groundWarActive(id, now);
    if (!active) {
      // 史实停火日已到（或决议停火）：结算这一场
      groundWarSettle(id, def, y, m, silent, warCeased(def) ? "resolution" : "historic");
      continue;
    }

    // --- deviation：干预分差 ---
    const supA = groundWarSupport(def.sideA);
    const supB = groundWarSupport(def.sideB);
    const supDiff = clamp((supA - supB) * T.PARAMS.DEVIATION_PER_SUPPORT,
      -T.PARAMS.DEVIATION_CLAMP, T.PARAMS.DEVIATION_CLAMP);

    // --- deviation：双方作战方针（D2）---
    // 侧 A 的推进方向为正；两侧方针互相抵消：同一时间只有一方能推得动。
    // 玩家侧用 setWarOp 的结果（w.op）；AI 侧按 D2 规则自选（w.aiOpA/aiOpB）。
    // 旁观与常规探针里 warAiActive() 为假：AI 不动 → 行为与 D2 之前逐位一致。
    const playerSide = def.sideA === ST.player ? "A" : (def.sideB === ST.player ? "B" : null);
    const pickSideOp = (side) => {
      if (playerSide === side) return w.op ? T.OPS[w.op] : null;
      if (!warAiActive()) return null;
      const pick = aiPickWarOp(id, side, now);
      if (side === "A") w.aiOpA = pick; else w.aiOpB = pick;
      return pick ? T.OPS[pick] : null;
    };
    const opA = pickSideOp("A");
    const opB = pickSideOp("B");

    let strengthA = opA ? opA.strength : 0;
    let strengthB = opB ? opB.strength : 0;
    let selfAttrA = opA ? opA.selfAttr : 0;
    let selfAttrB = opB ? opB.selfAttr : 0;
    const enemyAttrA = opB ? opB.enemyAttr : 0;   // B 的方针伤 A
    const enemyAttrB = opA ? opA.enemyAttr : 0;   // A 的方针伤 B
    const wearA = opA ? opA.wear : 0;
    const wearB = opB ? opB.wear : 0;

    // C（情报估算）：冒进惩罚 —— 基于**过度乐观的估计**发动进攻，会一头
    // 撞进有备之敌：推进强度被削、自身消耗加重。买情报（quality→1）就能
    // 消掉它 —— 这是「情报评估」花钱的真正理由，而不是界面装饰。
    // 它刻画的是**玩家的误判**（玩家的估计），所以只作用于玩家的方针；
    // AI 参谋部的误判没有被建模（它按规则行动，模式可观察）。
    const fogPenalty = (side, op) => {
      if (!op || !(op.strength > 0) || playerSide !== side) return null;
      if (typeof estimateWarOptimism !== "function") return null;
      const optimism = estimateWarOptimism(id, side);
      return (typeof estimateOpFogFactor === "function")
        ? estimateOpFogFactor(optimism) : { cut: 0, attr: 0 };
    };
    const fogA = fogPenalty("A", opA);
    if (fogA && (fogA.cut > 0 || fogA.attr > 0)) {
      strengthA *= (1 - fogA.cut);
      selfAttrA += fogA.attr;
    }
    const fogB = fogPenalty("B", opB);
    if (fogB && (fogB.cut > 0 || fogB.attr > 0)) {
      strengthB *= (1 - fogB.cut);
      selfAttrB += fogB.attr;
    }

    // 目标的 dev 是**可以回落**的：干预撤了、方针停了，偏离会朝 0 收
    const targetDev = supDiff + (strengthA - strengthB) * 6;
    w.dev += (targetDev - w.dev) * 0.55;

    // --- 消耗：总消耗（展示用）与额外消耗（只对偏离计费）---
    const intensity = 1 + Math.abs(w.dev) / 20;
    const attrA = 0.30 * intensity + selfAttrA + enemyAttrA;
    const attrB = 0.30 * intensity + selfAttrB + enemyAttrB;
    w.attrA += attrA;
    w.attrB += attrB;
    // attrDev：只有偏离史实的那部分才收费（历史总代价已在校准曲线里）
    w.attrDevA += T.PARAMS.ATTR_PER_DEV * Math.abs(w.dev) + selfAttrA + enemyAttrA;
    w.attrDevB += T.PARAMS.ATTR_PER_DEV * Math.abs(w.dev) + selfAttrB + enemyAttrB;

    // --- 厌战：劣势一方涨得更快 ---
    const control = groundWarControl(id, now);
    w.wearA = clamp(w.wearA + 1.0 + (control < 0 ? 0.6 : 0) + wearA, 0, T.PARAMS.WEAR_MAX);
    w.wearB = clamp(w.wearB + 1.0 + (control > 0 ? 0.6 : 0) + wearB, 0, T.PARAMS.WEAR_MAX);

    // --- 厌战落到内政（仅执政者；无玩家时内政写入毫无意义，直接跳过）---
    if (ST.player) {
      for (const side of ["A", "B"]) {
        const k = side === "A" ? def.sideA : def.sideB;
        const wear = side === "A" ? w.wearA : w.wearB;
        if (typeof polEconDomesticOf !== "function") continue;
        const dom = polEconDomesticOf(k);
        // 厌战门槛 8：约半年苦战就开始咬人。设成 20 会让短战争完全无感 ——
        // 而史实上马岛只打了两个月，那场战争也该有国内回声。
        if (dom && typeof dom.unrest === "number" && wear > 8) {
          dom.unrest = clamp(dom.unrest + T.PARAMS.WEAR_UNREST * (wear / 100), 0, 100);
        }
      }
    }

    // --- 决胜 / 停火 ---
    // D2：双方都可能止损 —— 谁选 seek_settlement 停火就以谁的名义（玩家的
    // 劣势停火仍付威望代价；AI 的止损不付（它没有威望预算的取舍界面），
    // 但同样立刻终止战争 —— 对手也必须能认输。
    const settleSide = (opA && opA.endEarly) ? "A" : ((opB && opB.endEarly) ? "B" : null);
    if (settleSide) {
      const myEdge = settleSide === "A" ? control : -control;
      const disadvantage = -myEdge;
      if (settleSide === playerSide && disadvantage > 0 && typeof prestigeAdd === "function") {
        prestigeAdd(ST.player, -T.PARAMS.SETTLE_PRESTIGE * disadvantage * 0.1,
          def.zh + "：劣势停火");
      }
      groundWarSettle(id, def, y, m, silent, settleSide === playerSide ? "settlement" : "enemy-settlement");
      continue;
    }
    if (Math.abs(control) >= def.decisive && Math.abs(w.dev) >= T.PARAMS.DECISIVE_DEV) {
      groundWarSettle(id, def, y, m, silent, "decisive");
    }
  }
  return groundWarSnapshot();
}

function groundWarSnapshot() {
  const T = warTable();
  if (!T) return null;
  const now = curWarMonth();
  const out = { now: now, wars: {} };
  for (const id in T.WARS) {
    const def = T.WARS[id];
    const w = ST.wars && ST.wars.wars ? ST.wars.wars[id] : null;
    if (!w) continue;
    out.wars[id] = {
      zh: def.zh, control: +groundWarControl(id, now).toFixed(1),
      active: groundWarActive(id, now),
      dev: +w.dev.toFixed(2), op: w.op,
      aiOpA: w.aiOpA || null, aiOpB: w.aiOpB || null,   // D2：对手的方针也可见
      outcome: w.outcome,
      attrA: +w.attrA.toFixed(1), attrB: +w.attrB.toFixed(1),
      attrDevA: +w.attrDevA.toFixed(2), attrDevB: +w.attrDevB.toFixed(2),
      wearA: +w.wearA.toFixed(1), wearB: +w.wearB.toFixed(1),
      dragA: +groundWarDragOf(w.attrDevA).toFixed(3),
      dragB: +groundWarDragOf(w.attrDevB).toFixed(3)
    };
  }
  return out;
}

// ---- 面板 -------------------------------------------------------------------
// 与既有战局面板同址渲染：避免出现「两个面板各说各话」。
// C（情报估算）：战线优势显示**估计值**（≈ est ± err），不是真值 ——
// 玩家在雾里做判断，而不是照着读数调参。
function groundWarPanelHtml(selKey) {
  const T = warTable();
  if (!T || !selKey) return "";
  const actual = resolvePlayableKey(selKey);
  const now = curWarMonth();
  const ids = Object.keys(T.WARS).filter((id) => {
    const d = T.WARS[id];
    return d.sideA === actual || d.sideB === actual;
  });
  if (!ids.length) return "";
  let h = "";
  for (const id of ids) {
    const def = T.WARS[id];
    const w = warStateOf(id);
    const mine = def.sideA === actual ? "A" : "B";
    // 读数：战斗中用估计（雾），战后用定格真值（战果要准）
    const est = (typeof estimateControlOf === "function") ? estimateControlOf(id, mine) : null;
    const control = groundWarControl(id, now);
    const shown = (w.outcome || !est || est.exact) ? control : est.est;
    const band = (w.outcome || !est || est.exact) ? 0 : est.err;
    const myEdge = mine === "A" ? shown : -shown;
    const tone = myEdge >= T.PARAMS.STALEMATE_BAND ? "#4ade80"
      : myEdge <= -T.PARAMS.STALEMATE_BAND ? "#f87171" : "#fbbf24";
    const pct = Math.round((clamp(myEdge, -100, 100) + 100) / 2);
    h += '<div class="gw-block">';
    h += '<div class="gw-row"><span>' + def.short + ' · 战线优势</span><b style="color:' + tone + '">' +
      (band > 0 ? "≈ " : "") + (myEdge >= 0 ? "+" : "") + myEdge.toFixed(0) +
      (band > 0 ? " ± " + band.toFixed(0) : "") + '</b></div>';
    h += '<div class="gw-bar"><i style="width:' + pct + '%;background:' + tone + '"></i></div>';
    if (w.outcome) {
      const win = (w.outcome === "A" && mine === "A") || (w.outcome === "B" && mine === "B");
      h += '<div class="gw-note">' + (w.outcome === "stalemate" ? "僵持停火"
        : (win ? "我国获胜（威望 +" + def.stake + "）" : "我国战败（威望 −" + def.stake + "）")) + '</div>';
    } else {
      const myWear = mine === "A" ? w.wearA : w.wearB;
      const myAttr = mine === "A" ? w.attrDevA : w.attrDevB;
      h += '<div class="gw-note">厌战 ' + myWear.toFixed(0) + ' · 额外消耗 ' + myAttr.toFixed(1) +
        '（增速拖累 ' + groundWarDragOf(myAttr).toFixed(2) + 'pp/年）</div>';
      if (band > 0) {
        h += '<div class="gw-note">读数为情报估计（±' + band.toFixed(0) +
          '）：按过于乐观的估计发动攻势会撞进有备之敌。</div>';
      }
      // D2：对手的方针必须可观察 —— 博弈的前提是看得见对方在下哪步棋
      const enemySide = mine === "A" ? "B" : "A";
      const enemyOpId = enemySide === "A" ? w.aiOpA : w.aiOpB;
      const enemyOp = enemyOpId ? T.OPS[enemyOpId] : null;
      if (enemyOp) {
        h += '<div class="gw-note">敌方方针：' + enemyOp.icon + ' ' + enemyOp.zh + '</div>';
      }
      if (ST.player === actual) {
        h += '<div class="gw-ops">';
        for (const opId in T.OPS) {
          const op = T.OPS[opId];
          const on = w.op === opId;
          h += '<button class="gw-op-btn' + (on ? " active" : "") + '" data-war="' + id +
            '" data-op="' + opId + '" title="' + op.note + '">' + op.icon + " " + op.zh +
            " <i>-" + op.pc + "</i></button>";
        }
        h += '</div>';
      }
    }
    h += '</div>';
  }
  return h;
}
