"use strict";

// ---- Phase F：威望竞赛（Positional Prestige Race）----------------------------
// 冷战的身份不只是物质，而是竞赛。本模块补上缺的那一轴：**位置性的威望**。
//
// 三条与本项目既有子系统不同的设计约束：
//   1. **位置性**：威望只看「相对对手」。对手的灾难不需要奖励你 —— 你自动领先。
//      所以里程碑表里很少有 rivalLoss，位置性计分本身已经把相对关系处理掉了。
//   2. **会衰减**：得分朝 50 回归。昨天的凯旋变成今天的常态，所以必须持续表演。
//      这也堵住了「一次性冲榜然后躺赢」。
//   3. **可见的失败**：工程每月有确定性哈希掷出的失败概率，失败会当众扣分。
//      威望是唯一一条「花钱也可能赔本」的投资轴。
//
// 不变量（与 P1/P2 同一套路）：
//   · 不消费引擎 RNG（风险用哈希，不用 SIM.S.rngState）；
//   · 无执政者时不产生任何回写（史实轨迹一字不变）；
//   · 只写威望分、内政既有字段、以及第三世界阵营归属。
function prestigeTable() {
  return (typeof window !== "undefined" && window.W1980_PRESTIGE) || null;
}

function prestigeBlank() {
  return {
    scores: {},      // { 实体键: 0..100 }
    active: [],      // 玩家正在运行的工程 id（最多 MAX_ACTIVE）
    since: {},       // { 工程 id: 起跑的月索引 }
    fired: [],       // 已结算的里程碑 id
    drift: [],       // 已发生漂移的实体键
    leadMonths: 0,   // 连续领先对手的月数（漂移的前置条件）
    log: [],         // 最近发生的事（UI / 终局年鉴）
    lastGap: null,   // 最近一次「我方 − 对手」的落差
    // F2（威望的 AI 侧）：各选手的工程 { 实体键: { active: [], since: {} } }
    // 与反向漂移计数（对手领先 → 第三世界倒向对手阵营）
    ai: {},
    rivalLeadMonths: 0
  };
}

function initPrestigeState(force) {
  if (force || !ST.prestige || typeof ST.prestige !== "object") ST.prestige = prestigeBlank();
  const p = ST.prestige;
  if (!p.scores || typeof p.scores !== "object") p.scores = {};
  if (!Array.isArray(p.active)) p.active = [];
  if (!p.since || typeof p.since !== "object") p.since = {};
  if (!Array.isArray(p.fired)) p.fired = [];
  if (!Array.isArray(p.drift)) p.drift = [];
  if (!Array.isArray(p.log)) p.log = [];
  if (typeof p.leadMonths !== "number" || !isFinite(p.leadMonths)) p.leadMonths = 0;
  if (!p.ai || typeof p.ai !== "object") p.ai = {};
  if (typeof p.rivalLeadMonths !== "number" || !isFinite(p.rivalLeadMonths)) p.rivalLeadMonths = 0;
  return p;
}

// F2：某选手的工程槽（惰性建档，缺省即空仓）
function aiPrestigeSlotOf(k) {
  const p = initPrestigeState();
  if (!p.ai[k] || typeof p.ai[k] !== "object") p.ai[k] = { active: [], since: {} };
  if (!Array.isArray(p.ai[k].active)) p.ai[k].active = [];
  if (!p.ai[k].since || typeof p.ai[k].since !== "object") p.ai[k].since = {};
  return p.ai[k];
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePolEcon 同一约定）
function sanitizePrestigeState(d) {
  const p = prestigeBlank();
  if (!d || typeof d !== "object") return p;
  const T = prestigeTable();
  const lo = T ? T.PARAMS.SCORE_MIN : 0, hi = T ? T.PARAMS.SCORE_MAX : 100;
  if (d.scores && typeof d.scores === "object") {
    for (const k in d.scores) {
      const v = d.scores[k];
      if (typeof v === "number" && isFinite(v)) p.scores[k] = clamp(v, lo, hi);
    }
  }
  const known = T ? T.PROGRAMS : {};
  if (Array.isArray(d.active)) {
    p.active = d.active.filter((id) => typeof id === "string" && !!known[id]).slice(0, T ? T.PARAMS.MAX_ACTIVE : 2);
  }
  if (d.since && typeof d.since === "object") {
    for (const id of p.active) {
      const v = d.since[id];
      if (typeof v === "number" && isFinite(v)) p.since[id] = v;
    }
  }
  if (Array.isArray(d.fired)) {
    p.fired = d.fired.filter((id) => typeof id === "string");
  }
  if (Array.isArray(d.drift)) {
    p.drift = d.drift.filter((k) => typeof k === "string" && !!CM.countries[k]);
  }
  if (Array.isArray(d.log)) {
    p.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 40)).filter((e) => e && typeof e === "object" && typeof e.zh === "string");
  }
  if (typeof d.leadMonths === "number" && isFinite(d.leadMonths)) p.leadMonths = Math.max(0, Math.round(d.leadMonths));
  if (typeof d.lastGap === "number" && isFinite(d.lastGap)) p.lastGap = d.lastGap;
  // F2：各选手的工程与反向漂移计数（旧档缺该项 → 空状态）
  if (d.ai && typeof d.ai === "object") {
    const aiKnown = T ? T.PROGRAMS : {};
    const aiMax = T ? T.PARAMS.MAX_ACTIVE : 2;
    for (const k in d.ai) {
      if (!CM.countries[k]) continue;                 // 幽灵选手直接丢弃
      const slot = d.ai[k];
      if (!slot || typeof slot !== "object") continue;
      const act = Array.isArray(slot.active)
        ? slot.active.filter((id) => typeof id === "string" && !!aiKnown[id]).slice(0, aiMax)
        : [];
      const since = {};
      if (slot.since && typeof slot.since === "object") {
        for (const id of act) {
          const v = slot.since[id];
          if (typeof v === "number" && isFinite(v)) since[id] = v;
        }
      }
      p.ai[k] = { active: act, since: since };
    }
  }
  if (typeof d.rivalLeadMonths === "number" && isFinite(d.rivalLeadMonths)) {
    p.rivalLeadMonths = Math.max(0, Math.round(d.rivalLeadMonths));
  }
  return p;
}

function prestigeOf(k) {
  const T = prestigeTable();
  const p = initPrestigeState();
  const start = T ? T.PARAMS.SCORE_START : 50;
  if (typeof p.scores[k] !== "number" || !isFinite(p.scores[k])) p.scores[k] = start;
  return p.scores[k];
}

// 某个实体的对手：超级大国用固定表 → 本阵营领袖 → 当前威望最高的超级大国。
// 最后一级回退是必需的：CHN / IND / BRA 这类既非美苏、其阵营也没有领袖映射的实体
// 如果拿不到对手，威望系统对它们就完全失效（分数照样涨，但没有任何「竞赛」）。
function prestigeRivalOf(k) {
  const T = prestigeTable();
  if (!T) return null;
  if (T.PARAMS.RIVAL[k]) return T.PARAMS.RIVAL[k];
  const b = (typeof blocOf === "function") ? blocOf(k) : (CM.countries[k] || {}).bloc;
  let r = T.PARAMS.BLOC_LEADER[b];
  if (!r || r === k) r = prestigeLeaderOf(["USA", "SUN"].filter((x) => x !== k)).k;
  return (r && r !== k && CM.countries[r]) ? r : null;
}

// 直接加减威望（危机卡、里程碑、工程失败都走这一个落点）
function prestigeAdd(k, delta, reason) {
  const T = prestigeTable();
  const p = initPrestigeState();
  if (!k || !CM.countries[k] || typeof delta !== "number" || !isFinite(delta) || delta === 0) return 0;
  const before = prestigeOf(k);
  const after = clamp(before + delta, T.PARAMS.SCORE_MIN, T.PARAMS.SCORE_MAX);
  p.scores[k] = after;
  if (reason) {
    p.log.push({ y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1,
      k: k, d: +(after - before).toFixed(2), zh: reason });
    if (p.log.length > T.PARAMS.LOG_MAX) p.log.shift();
  }
  return after - before;
}

// 确定性「掷骰」：只用 (年, 月, 工程 id) 的哈希，不碰 SIM.S.rngState。
// 这是刻意的 —— 威望工程的风险不应该改变仿真轨迹的随机流。
function prestigeRoll(y, m, id) {
  let h = 2166136261;
  const s = String(y) + "|" + String(m) + "|" + String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function prestigeProgramDrag() {
  const T = prestigeTable();
  const p = ST.prestige;
  if (!T || !p || !Array.isArray(p.active) || !p.active.length) return 0;
  let drag = 0;
  for (const id of p.active) {
    const def = T.PROGRAMS[id];
    if (def) drag += def.drag;
  }
  return -drag;      // 负值：工程挤占的是经济增长
}

// ---- F2（威望的 AI 侧）：对手也下棋 -----------------------------------------
// 玩家能跑工程，对手此前只会被动吃里程碑+衰减 —— 竞赛是单方面的。
// 与 D2 / C2 同族的白名单门控：探针会话默认关闭（既有探针逐位不变），
// 只有 ?f2probe=1 或真实游戏才打开；旁观模式永远关闭。
function prestigeAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]f2probe=1/.test(location.search));
}

// 对手的对手：玩家的对手盯玩家，其余选手盯各自的对手（美苏互盯）
function aiPrestigeOpponentOf(k) {
  const player = ST.player;
  if (player && prestigeRivalOf(player) === k) return player;
  return prestigeRivalOf(k);
}

// F2 的选手集合：玩家的对手 + 美苏（竞赛的核心是超级大国之争与「你 vs 你的对手」）。
// 53 国全跑工程是噪声 —— 威望榜单要回答的是「谁在赢」。
// 旁观者没有竞赛（与 prestigeAiActive 同一个门）。
function prestigeAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  if (player) push(prestigeRivalOf(player));
  push("USA");
  push("SUN");
  return out;
}

// 确定性选棋（零 RNG）：落后追赶 / 领先收手 / 养不起就砍最贵的 / 粘性防翻烧饼。
// 输入只有三个真实读数：对位落差、经济压力、在跑工程。规则表见 data/prestige.js。
// (y, m) 显式传入（与 updatePrestigeRace 同一结算月）—— 否则探针与引擎会用
// 不同的日期算粘性窗口，测试就是漂的。
function aiPickPrestigeProgram(k, y, m) {
  const T = prestigeTable();
  if (!T || !T.AI_POLICY) return null;
  const P = T.AI_POLICY;
  const slot = aiPrestigeSlotOf(k);
  const opp = aiPrestigeOpponentOf(k);
  if (!opp) return null;
  const gap = prestigeOf(k) - prestigeOf(opp);          // 正 = k 领先
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;
  const active = slot.active;

  // 1. 领先够多 → 全部收手（威望会衰减回来，GDP 省下来是真钱）
  if (gap >= P.COAST_GAP && active.length) return { stopAll: true, reason: "coast", gap: gap };
  // 2. 养不起 → 停掉拖累最大的一项
  if (strain >= P.STRAIN_MAX && active.length) {
    let worst = active[0];
    for (const id of active) {
      const a = T.PROGRAMS[id], b = T.PROGRAMS[worst];
      if (a && b && a.drag > b.drag) worst = id;
    }
    return { stop: worst, reason: "strain", gap: gap };
  }
  // 3. 满仓 / 粘性窗口（最近一项工程不满 MIN_MONTHS 月 → 不再加新的）
  if (active.length >= (T.PARAMS.MAX_ACTIVE || 2)) return null;
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  for (const id of active) {
    const since = slot.since[id];
    if (typeof since === "number" && ym - since < P.MIN_MONTHS) return null;
  }
  // 4. 落后够多 → 按经济压力挑档开工程（档内取第一个未在跑的）
  if (gap <= -P.CATCHUP_GAP) {
    const tier = strain < P.PICK_HI_STRAIN ? "hi" : (strain < P.PICK_MID_STRAIN ? "mid" : "lo");
    for (const id of (P.PICK[tier] || [])) {
      if (active.indexOf(id) < 0 && T.PROGRAMS[id]) return { start: id, reason: "catchup", gap: gap, tier: tier };
    }
  }
  return null;
}

// AI 停一项工程（收手 / 砍预算）。确定性，不回滚已得威望 —— 已经表演过的就是历史。
function aiStopPrestigeProgram(k, id) {
  const slot = aiPrestigeSlotOf(k);
  const i = slot.active.indexOf(id);
  if (i < 0) return false;
  slot.active.splice(i, 1);
  delete slot.since[id];
  return true;
}

// AI 工程的 GDP 拖累：走既有 pmods 累加链（applyPlayerDecisions 是唯一写者）。
// 真实消费者：拖累 → polEconStrainOf 升 → P2 经济目标与 D2 战争 AI 都看得见 ——
// 「为威望烧钱」对 AI 也是真实的取舍。
function aiPrestigeDragFor(k) {
  const T = prestigeTable();
  if (!T || !prestigeAiActive()) return 0;
  const p = ST.prestige;
  if (!p || !p.ai || !p.ai[k]) return 0;
  let drag = 0;
  for (const id of p.ai[k].active) {
    const def = T.PROGRAMS[id];
    if (def) drag += def.drag;
  }
  return -drag;
}

function startPrestigeProgram(id) {
  const T = prestigeTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  const def = T.PROGRAMS[id];
  if (!def) return { ok: false, reason: "unknown" };
  const p = initPrestigeState();
  if (p.active.indexOf(id) >= 0) return { ok: false, reason: "already", def: def };
  if (p.active.length >= T.PARAMS.MAX_ACTIVE) return { ok: false, reason: "full", def: def };
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(def.cost)) {
    return { ok: false, reason: "capital", def: def, cost: def.cost };
  }
  p.active.push(id);
  p.since[id] = curMonthIdx();
  if (!CR.probeMode) {
    toast({ zh: "【威望工程启动】" + def.icon + " " + def.zh,
      note: def.note + "（每月威望 +" + def.gain.toFixed(2) + "，GDP 增速 −" + def.drag.toFixed(2) +
        "pp/年；同时最多运行 " + T.PARAMS.MAX_ACTIVE + " 项）" });
  }
  applyPlayerDecisions();
  return { ok: true, def: def };
}

function stopPrestigeProgram(id) {
  const T = prestigeTable();
  const p = ST.prestige;
  if (!T || !p || !Array.isArray(p.active)) return { ok: false, reason: "no-state" };
  const i = p.active.indexOf(id);
  if (i < 0) return { ok: false, reason: "inactive" };
  p.active.splice(i, 1);
  delete p.since[id];
  applyPlayerDecisions();
  return { ok: true };
}

function prestigeLeaderOf(keys) {
  let best = null, bestV = -1;
  for (const k of keys) {
    const v = prestigeOf(k);
    if (v > bestV) { best = k; bestV = v; }
  }
  return { k: best, v: bestV };
}

function prestigeSnapshot() {
  const T = prestigeTable();
  if (!T) return null;
  const p = initPrestigeState();
  const player = ST.player || null;
  const rival = player ? prestigeRivalOf(player) : null;
  const out = {
    player: player,
    score: player ? +prestigeOf(player).toFixed(2) : null,
    rival: rival,
    rivalScore: rival ? +prestigeOf(rival).toFixed(2) : null,
    gap: (player && rival) ? +(prestigeOf(player) - prestigeOf(rival)).toFixed(2) : null,
    active: p.active.slice(),
    // F2：对手在跑的工程（公开情报 —— 载人航天上天是藏不住的）
    rivalActive: (rival && p.ai && p.ai[rival]) ? p.ai[rival].active.slice() : [],
    drag: +prestigeProgramDrag().toFixed(3),
    leadMonths: p.leadMonths,
    drifted: p.drift.length,
    fired: p.fired.length
  };
  if (!player) {
    const lead = prestigeLeaderOf(Object.keys(CM.countries));
    out.worldLeader = lead.k;
    out.worldLeaderScore = +lead.v.toFixed(2);
    const sun = prestigeOf("SUN"), usa = prestigeOf("USA");
    out.superGap = +(sun - usa).toFixed(2);      // 正 = 苏联领先
  }
  return out;
}

// 里程碑：按史实日期生效。**旁观模式也生效**（它是世界状态的一部分），
// 但它只改威望分，不碰 gdp / pmods / 内政 —— 所以史实轨迹一字不变。
function prestigeFireMilestones(y, m, silent) {
  const T = prestigeTable();
  const p = initPrestigeState();
  const now = y * 12 + m;
  for (const ms of T.MILESTONES) {
    if (p.fired.indexOf(ms.id) >= 0) continue;
    if (ms.y * 12 + ms.m > now) continue;
    p.fired.push(ms.id);
    if (ms.owner === "BOTH") {
      prestigeAdd("USA", ms.gain, ms.zh);
      prestigeAdd("SUN", ms.gain, ms.zh);
    } else {
      prestigeAdd(ms.owner, ms.gain, ms.zh);
      if (ms.rival && ms.rivalLoss) prestigeAdd(ms.rival, -ms.rivalLoss, ms.zh);
    }
    p.log.push({ y: ms.y, m: ms.m, k: ms.owner, d: ms.gain, zh: ms.zh, ms: ms.id, note: ms.note });
    if (p.log.length > T.PARAMS.LOG_MAX) p.log.shift();
    if (!silent) {
      const ownerZh = ms.owner === "BOTH" ? "美苏双方" : (CM.countries[ms.owner] || { zh: ms.owner }).zh;
      const jolt = (function () {
        for (const x of T.MILESTONES) if (x.id === ms.id) return x;
        return null;
      })();
      const item = { y: ms.y, m: ms.m,
        zh: "【威望竞赛】" + ms.zh,
        note: ownerZh + " " + (ms.gain >= 0 ? "威望 +" + ms.gain : "威望 " + ms.gain) +
          "。" + (jolt ? jolt.note : "") };
      EV.items.push(item);
      EV.unread++;
      renderInbox();
      toast(item);
    }
  }
}

// 月度推进。无执政者时只跑里程碑 + 衰减，**零回写**（这是史实轨迹不变量）。
function updatePrestigeRace(y, m, silent) {
  const T = prestigeTable();
  if (!T) return null;
  const p = initPrestigeState();

  prestigeFireMilestones(y, m, silent);

  const player = ST.player;
  const rival = player ? prestigeRivalOf(player) : null;
  // 玩家工程：产威望、掷失败、烧预算（预算通过 playerSelfDelta 的 drag 进入 pmods）
  if (player) {
    for (const id of p.active.slice()) {
      const def = T.PROGRAMS[id];
      if (!def) continue;
      prestigeAdd(player, def.gain, null);
      if (prestigeRoll(y, m, id) < def.risk) {
        prestigeAdd(player, -def.failLoss, "【" + def.zh + "】当众失败");
        p.log.push({ y: y, m: m, k: player, d: -def.failLoss, zh: def.zh + " 失败", fail: id });
        if (!silent) {
          const item = { y: y, m: m, zh: "【威望工程受挫】" + def.icon + " " + def.zh + "发生公开事故",
            note: "威望 −" + def.failLoss + "。全国直播的失败比没有工程更伤 —— 但停手意味着把「第一」让给对手。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }
  }

  // F2（威望的 AI 侧）：选手们也跑工程 —— 选棋、执行、产威望、掷失败。
  // 走与玩家完全相同的口径（prestigeAdd + prestigeRoll，零引擎 RNG），
  // 但不花政治资本（那是玩家的节流阀）—— 拖累进 pmods 由 accPrestigeAiDrag 结算。
  if (prestigeAiActive()) {
    for (const k of prestigeAiActors()) {
      const slot = aiPrestigeSlotOf(k);
      const pick = aiPickPrestigeProgram(k, y, m);
      if (pick && pick.stopAll) {
        for (const id of slot.active.slice()) aiStopPrestigeProgram(k, id);
      } else if (pick && pick.stop) {
        aiStopPrestigeProgram(k, pick.stop);
      } else if (pick && pick.start) {
        slot.active.push(pick.start);
        slot.since[pick.start] = y * 12 + m;
        if (!silent) {
          const item = { y: y, m: m, zh: "【威望竞赛】" + (CM.countries[k] || {}).zh + "启动" + T.PROGRAMS[pick.start].zh,
            note: "对手不再满足于守成 —— 竞赛的另一侧开始行动了。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
      // 在跑工程：产威望、掷失败（与玩家同一套哈希口径）
      for (const id of slot.active.slice()) {
        const def = T.PROGRAMS[id];
        if (!def) continue;
        prestigeAdd(k, def.gain, null);
        if (prestigeRoll(y, m, id + ":" + k) < def.risk) {
          prestigeAdd(k, -def.failLoss, "【" + def.zh + "】当众失败");
          p.log.push({ y: y, m: m, k: k, d: -def.failLoss, zh: def.zh + " 失败", fail: id });
          if (!silent) {
            const item = { y: y, m: m, zh: "【威望工程受挫】" + (CM.countries[k] || {}).zh + "的" + def.zh + "发生公开事故",
              note: "对手的失败就是你的机会 —— 威望是位置性的，此消即彼长。" };
            EV.items.push(item);
            EV.unread++;
            renderInbox();
            toast(item);
          }
        }
      }
    }
  }

  // 衰减：所有已登场的分数朝 50 回归（昨天的凯旋 = 今天的常态）
  const keys = Object.keys(p.scores);
  for (const k of keys) {
    const v = p.scores[k];
    if (!isFinite(v)) { p.scores[k] = T.PARAMS.SCORE_START; continue; }
    p.scores[k] = clamp(v + (T.PARAMS.SCORE_START - v) * T.PARAMS.DECAY, T.PARAMS.SCORE_MIN, T.PARAMS.SCORE_MAX);
  }

  if (!player || !rival) { p.lastGap = null; p.leadMonths = 0; return prestigeSnapshot(); }

  // ---- 以下全部只在有执政者时执行：威望的**政治后果** ----
  const gap = prestigeOf(player) - prestigeOf(rival);
  p.lastGap = +gap.toFixed(2);
  const norm = clamp(Math.abs(gap) / 24, 0, 1);

  // 落回内政：国民自豪 vs 民族羞辱（系数刻意小，经济账单才是主因）
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(player) : null;
  if (dom && norm > 0) {
    if (gap > 0) {
      dom.unrest = clamp(dom.unrest - T.PARAMS.UNREST_PRIDE * norm, 0, 100);
      if (typeof dom.legitimacy === "number") {
        dom.legitimacy = clamp(dom.legitimacy + norm * 0.35, 0, 100);
      }
    } else {
      dom.unrest = clamp(dom.unrest + T.PARAMS.UNREST_GAP * norm, 0, 100);
      if (typeof dom.legitimacy === "number") {
        dom.legitimacy = clamp(dom.legitimacy - norm * 0.45, 0, 100);
      }
    }
  }

  // 第三世界漂移：威望领先足够大且**持续**时，不结盟国家用脚投票。
  // 连续领先计数、总额上限、确定性挑选（按 key 字典序 + 月索引轮转），全部不用 RNG。
  const lead = prestigeLeaderOf([player, rival]);
  if (gap > 0 && lead.k === player) p.leadMonths += 1;
  else p.leadMonths = 0;

  // F2：反向漂移 —— 对手领先同样会拉走第三世界。竞赛是双向的：
  // 你不跑工程，对手跑，世界就朝对手那边漂。共用 DRIFT_TOTAL 总额。
  if (prestigeAiActive()) {
    if (gap < 0 && lead.k === rival) p.rivalLeadMonths += 1;
    else p.rivalLeadMonths = 0;
    if (p.rivalLeadMonths >= T.PARAMS.DRIFT_MONTHS && -gap >= T.PARAMS.DRIFT_GAP &&
        p.drift.length < T.PARAMS.DRIFT_TOTAL) {
      const rivalBloc = (typeof blocOf === "function") ? blocOf(rival) : null;
      const eligible = Object.keys(CM.countries)
        .filter((k) => k !== player && k !== rival && !ST.blocOverride[k] &&
          T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[k].bloc) >= 0)
        .sort();
      if (eligible.length && rivalBloc) {
        const pick = eligible[(y * 12 + m) % eligible.length];
        ST.blocOverride[pick] = rivalBloc;
        p.drift.push(pick);
        p.rivalLeadMonths = 0;
        p.log.push({ y: y, m: m, k: pick, d: 0, zh: "倒向" + (BLOC_ZH[rivalBloc] || rivalBloc), drift: rivalBloc });
        if (typeof rebuildBlocTable === "function") rebuildBlocTable();
        if (typeof select === "function" && ST.sel) select(ST.sel);
        if (!silent) {
          const c = CM.countries[pick];
          const item = { y: y, m: m, zh: "【威望漂移】" + c.zh + "倒向" + (BLOC_ZH[rivalBloc] || rivalBloc),
            note: "对手的持续威望优势开始改变第三世界的选择 —— 竞赛的输赢不只在榜单上。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }
  }

  if (p.leadMonths >= T.PARAMS.DRIFT_MONTHS && gap >= T.PARAMS.DRIFT_GAP &&
      p.drift.length < T.PARAMS.DRIFT_TOTAL) {
    const targetBloc = (typeof blocOf === "function") ? blocOf(player) : null;
    const eligible = Object.keys(CM.countries)
      .filter((k) => k !== player && k !== rival && !ST.blocOverride[k] &&
        T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[k].bloc) >= 0)
      .sort();
    if (eligible.length && targetBloc) {
      const pick = eligible[(y * 12 + m) % eligible.length];
      ST.blocOverride[pick] = targetBloc;
      p.drift.push(pick);
      p.leadMonths = 0;                      // 每次漂移后重新积累，避免一月连翻多国
      p.log.push({ y: y, m: m, k: pick, d: 0, zh: "倒向" + (BLOC_ZH[targetBloc] || targetBloc), drift: targetBloc });
      if (typeof rebuildBlocTable === "function") rebuildBlocTable();
      if (typeof select === "function" && ST.sel) select(ST.sel);
      if (!silent) {
        const c = CM.countries[pick];
        const item = { y: y, m: m, zh: "【威望漂移】" + c.zh + "倒向" + (BLOC_ZH[targetBloc] || targetBloc),
          note: "连续的威望优势开始改变第三世界的选择 —— 没有条约，没有胁迫，只是「谁看起来代表未来」。" };
        EV.items.push(item);
        EV.unread++;
        renderInbox();
        toast(item);
      }
    }
  }

  return prestigeSnapshot();
}

// 声望榜 UI：只列**真的动过**的实体（分数离开基准），外加玩家与对手。
// 否则开局会列出六个停在 50.0 的国家，把面板变成噪声 ——
// 榜单要回答的是「谁在赢」，不是「谁存在」。
// C（情报估算）：对手的分数显示**估计值**（± 误差），玩家自己的分数是精确的 ——
// 你知道自己的账本。榜单因此从「读数」变成「判断」。
function prestigeBoardHtml(limit) {
  const T = prestigeTable();
  if (!T) return "";
  const p = initPrestigeState();
  const base = T.PARAMS.SCORE_START;
  const mine = ST.player ? [ST.player, prestigeRivalOf(ST.player)] : [];
  const scoreText = (k) => {
    const v = p.scores[k];
    if (!isFinite(v)) return "—";
    if (k === ST.player) return v.toFixed(1);
    const e = (typeof estimateOf === "function") ? estimateOf(k, "prestige") : null;
    return (e && !e.exact) ? ("≈ " + e.est.toFixed(1) + " ±" + e.err.toFixed(1)) : v.toFixed(1);
  };
  const rows = Object.keys(p.scores)
    .map((k) => ({ k: k, v: p.scores[k] }))
    .filter((r) => isFinite(r.v) && (Math.abs(r.v - base) >= 0.5 || mine.indexOf(r.k) >= 0))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit || 5);
  let h = '<div class="pdb-prestige"><div class="pdb-meter-row"><span class="pdb-meter-lbl">🏅 威望竞赛</span>';
  if (ST.player) {
    const rv = prestigeRivalOf(ST.player);
    const gap = rv ? prestigeOf(ST.player) - prestigeOf(rv) : 0;
    const gapTxt = rv ? (() => {
      const e = (typeof estimateOf === "function") ? estimateOf(rv, "prestige") : null;
      const shown = (e && !e.exact) ? (prestigeOf(ST.player) - e.est) : gap;
      return (shown >= 0 ? "+" : "") + shown.toFixed(1);
    })() : "";
    const col = gap >= 0 ? "#4ade80" : "#f87171";
    h += '<span class="pdb-meter-val" style="color:' + col + '">' + prestigeOf(ST.player).toFixed(1) +
      (rv ? " vs " + scoreText(rv) + "（" + gapTxt + "）" : "") + '</span>';
  } else {
    h += '<span class="pdb-meter-val">' + (rows.length ? rows[0].v.toFixed(1) : "—") + '</span>';
  }
  h += '</div>';
  for (const r of rows) {
    const c = CM.countries[r.k] || { zh: r.k };
    h += '<div class="pdb-prestige-row"><span>' + c.zh + '</span><b>' + scoreText(r.k) + '</b></div>';
  }
  if (ST.player) {
    h += '<div class="pdb-prestige-row"><span>工程（最多 ' + T.PARAMS.MAX_ACTIVE + ' 项）</span><b>' +
      (p.active.length ? p.active.map((id) => T.PROGRAMS[id].icon).join("") : "—") + '</b></div>';
    // F2：对手在跑的工程 —— 竞赛是双向的，你必须看得见对方在表演什么
    const rvK = prestigeRivalOf(ST.player);
    const rvSlot = (rvK && p.ai && p.ai[rvK]) ? p.ai[rvK].active : [];
    if (rvSlot && rvSlot.length) {
      h += '<div class="pdb-prestige-row"><span>对手工程</span><b style="color:#f87171">' +
        rvSlot.map((id) => T.PROGRAMS[id].icon).join("") + '</b></div>';
    }
    if (p.active.length) {
      h += '<div class="pdb-prestige-note">每月威望 +' +
        p.active.reduce((s, id) => s + T.PROGRAMS[id].gain, 0).toFixed(2) +
        '，GDP 增速 ' + prestigeProgramDrag().toFixed(2) + 'pp/年</div>';
    }
    if (p.lastGap !== null && Math.abs(p.lastGap) >= 8) {
      h += '<div class="pdb-prestige-note">' + (p.lastGap > 0
        ? '领先 ' + p.lastGap.toFixed(1) + ' 点：连续 ' + p.leadMonths + '/' + T.PARAMS.DRIFT_MONTHS +
          ' 个月后，第三世界开始倒向我国'
        : '落后 ' + (-p.lastGap).toFixed(1) + ' 点：民族羞辱正在侵蚀执政合法性') + '</div>';
    }
  }
  h += '</div>';
  return h;
}

// 工程按钮：与内政动作抢同一份政治资本 —— 这就是取舍本身
function prestigeProgramsHtml() {
  const T = prestigeTable();
  if (!T || !ST.player) return "";
  const p = initPrestigeState();
  const pc = (typeof initPoliticalCapital === "function") ? initPoliticalCapital() : { value: 0, cap: 100 };
  let h = '<div class="pdb-programs"><div class="pdb-meter-lbl">🏅 威望工程（消耗政治资本）</div><div class="pdb-prog-grid">';
  for (const id in T.PROGRAMS) {
    const d = T.PROGRAMS[id];
    const on = p.active.indexOf(id) >= 0;
    const full = p.active.length >= T.PARAMS.MAX_ACTIVE && !on;
    const poor = pc.value < d.cost;
    const cls = "pdb-prog-btn" + (on ? " active" : "") + ((full || (!on && poor)) ? " disabled" : "");
    h += '<button class="' + cls + '" data-prog="' + id + '"' + ((full || (!on && poor)) ? " disabled" : "") +
      ' title="' + d.note + '">' + d.icon + " " + d.zh + " <i>" + (on ? "运行中" : "-" + d.cost) + "</i></button>";
  }
  h += '</div>';
  h += '<div class="pdb-prestige-note">每项工程都有 GDP 增速拖累与「当众失败」风险：' +
    '威望是唯一一条花钱也可能赔本的投资轴。</div></div>';
  return h;
}
