"use strict";

// ---- Phase E：长引信（现在点火、数年后引爆的战略工程）----------------------
// 44 年里只有 14 个剧本决策点（约每 10 个月一次）。六条机制轴已经把被动月数
// 变成有意义的「等待」，但玩家主动「点火」的时刻仍然稀少。
//
// 长引信补的就是这个节奏：大战略不是被历史推着走，而是**现在埋下引信，
// 三年后收割**。三项时间尺度：
//
//   点火 → 一次性政治资本（第六条取舍轴：与内政/威望工程/作战方针/
//          主张输出/情报评估抢同一份预算）
//   燃烧 → 36–72 个月的 GDP 拖累（真金白银的机会成本，走既有 pmods 链）
//   引爆 → **结局由引爆当月的国势决定，不掷骰**：
//          经济兑现（P1 落差）+ 社会安定（动荡）= 辉煌 / 惨败 / 不了了之
//
// 所以「什么时候点火」本身就是决策：经济好时点火稳赢，
// 经济差时点火是在赌翻盘。
//
// 引爆落点跨全部既有轴：威望（F）、感召力（S-17）、合法性/动荡（P1）、
// 威慑可信度（N1 的 credBonus）、增长红利（P1 的 pmods 链）。
//
// 不变量：零 RNG（结局由国势决定）、旁观零回写（无玩家无引信）、
// 不消费引擎随机流、存档 sanitize 缺省补齐、史实门不受影响（无点火 = 零拖累）。
function fuseTable() {
  return (typeof window !== "undefined" && window.W1980_FUSES) || null;
}

function fuseBlank() {
  return { burning: {}, bonuses: [], log: [], ai: {} };
}

function initFuseState(force) {
  if (force || !ST.fuses || typeof ST.fuses !== "object") ST.fuses = fuseBlank();
  const s = ST.fuses;
  if (!s.burning || typeof s.burning !== "object") s.burning = {};
  if (!Array.isArray(s.bonuses)) s.bonuses = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (!s.ai || typeof s.ai !== "object") s.ai = {};
  return s;
}

function fuseSanitizeBonuses(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(-12).map((b) => ({
    gdpBonus: (b && typeof b.gdpBonus === "number" && isFinite(b.gdpBonus)) ? b.gdpBonus : 0,
    months: (b && typeof b.months === "number" && isFinite(b.months)) ? Math.max(0, Math.round(b.months)) : 0
  })).filter((b) => b.gdpBonus !== 0 && b.months > 0);
}

function fuseSanitizeBurning(src, known) {
  const out = {};
  if (!src || typeof src !== "object") return out;
  for (const id in src) {
    const v = src[id];
    // 有效存档永远存 >= 1（0 会在当月引爆，负数是垃圾）——直接丢弃
    if (!known[id] || typeof v !== "number" || !isFinite(v) || v < 1) continue;
    out[id] = clamp(Math.round(v), 1, known[id].months);
  }
  return out;
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePrestigeState 同一约定）
function sanitizeFuseState(d) {
  const s = fuseBlank();
  const T = fuseTable();
  if (!d || typeof d !== "object") return s;
  const known = T ? T.FUSES : {};
  s.burning = fuseSanitizeBurning(d.burning, known);
  s.bonuses = fuseSanitizeBonuses(d.bonuses);
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.id === "string");
  }
  // E2：对手引信槽（缺省 {}；幽灵选手 / 未知引信 / 非数字倒计时全部丢弃）
  if (d.ai && typeof d.ai === "object") {
    for (const k in d.ai) {
      if (!CM || !CM.countries || !CM.countries[k]) continue;
      const raw = d.ai[k];
      if (!raw || typeof raw !== "object") continue;
      const slot = { burning: fuseSanitizeBurning(raw.burning, known),
        bonuses: fuseSanitizeBonuses(raw.bonuses), since: {} };
      if (raw.since && typeof raw.since === "object") {
        for (const id in raw.since) {
          const v = raw.since[id];
          if (!known[id] || typeof v !== "number" || !isFinite(v) || v < 0) continue;
          slot.since[id] = Math.round(v);
        }
      }
      s.ai[k] = slot;
    }
  }
  return s;
}

function fuseRecord(id, zh, outcome, extra) {
  const T = fuseTable();
  const s = initFuseState();
  const e = { id: id, y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1,
    zh: zh, outcome: outcome };
  if (extra) for (const k in extra) e[k] = extra[k];
  s.log.push(e);
  if (s.log.length > (T ? T.PARAMS.LOG_MAX : 24)) s.log.shift();
  return e;
}

// 点火
function startFuse(id) {
  const T = fuseTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  const def = T.FUSES[id];
  if (!def) return { ok: false, reason: "unknown" };
  const s = initFuseState();
  if (s.burning[id] !== undefined) return { ok: false, reason: "already", def: def };
  const n = Object.keys(s.burning).length;
  if (n >= T.PARAMS.MAX_ACTIVE) return { ok: false, reason: "full", def: def };
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(def.cost)) {
    return { ok: false, reason: "capital", def: def, cost: def.cost };
  }
  s.burning[id] = def.months;
  if (!CR.probeMode) {
    toast({ zh: "【长引信点火】" + def.icon + " " + def.zh,
      note: def.note + "（引信 " + def.months + " 个月，GDP 增速 −" + def.drag.toFixed(2) +
        "pp/年；结局由引爆当月的国势决定）" });
  }
  applyPlayerDecisions();
  return { ok: true, def: def };
}

// 撤回（点火后可以反悔，但政治资本不退还 —— 沉没成本）
function cancelFuse(id) {
  const s = initFuseState();
  if (s.burning[id] === undefined) return { ok: false, reason: "inactive" };
  delete s.burning[id];
  applyPlayerDecisions();
  return { ok: true };
}

// 燃烧期的 GDP 拖累（走 playerSelfDelta 的同一条 pmods 累加链）
function fuseProgramDrag() {
  const T = fuseTable();
  const s = ST.fuses;
  if (!T || !s || !s.burning) return 0;
  let drag = 0;
  for (const id in s.burning) {
    const def = T.FUSES[id];
    if (def) drag += def.drag;
  }
  return -drag;
}

// 引爆后兑现的增长红利（如能源自主的 36 个月红利），同样走 pmods 链
function fuseGdpBonus() {
  const s = ST.fuses;
  if (!s || !Array.isArray(s.bonuses) || !s.bonuses.length) return 0;
  let b = 0;
  for (const x of s.bonuses) b += x.gdpBonus;
  return b;
}

// 引爆判定：由**引爆当月的国势**决定，不掷骰
//   辉煌：经济兑现（polEcon 落差 ≥ GOOD_SURPRISE）且社会安定（动荡 ≤ GOOD_UNREST）
//   惨败：经济失约（≤ BAD_SURPRISE）或社会失控（≥ BAD_UNREST）
//   其余：不了了之（good 效果减半）
function fuseOutcomeNow() {
  return fuseOutcomeFor(ST.player);
}

// 国别引爆判定。玩家走 P1 落差快照；对手走「增速 − 史实锚」代理落差
// （对手没有政治账单回路，但国势读数仍是真实的 growthOf + unrest）。
function fuseOutcomeFor(owner) {
  const T = fuseTable();
  if (!T || !owner) return "muddle";
  const P = T.PARAMS;
  let surprise = 0;
  if (owner === ST.player) {
    const snap = (typeof polEconSnapshot === "function") ? polEconSnapshot() : null;
    surprise = (snap && typeof snap.surprise === "number") ? snap.surprise : 0;
  } else {
    const actual = (typeof growthOf === "function") ? growthOf(entKeys(owner)) : null;
    const TE = (typeof polEconTable === "function") ? polEconTable() : null;
    const row = (TE && TE.ANCHOR && (TE.ANCHOR[owner] || TE.ANCHOR.DEFAULT)) || [2, 1];
    surprise = (actual !== null && isFinite(actual)) ? (actual - row[0]) : 0;
  }
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(owner) : null;
  const unrest = (dom && typeof dom.unrest === "number") ? dom.unrest : 50;
  if (surprise >= P.GOOD_SURPRISE && unrest <= P.GOOD_UNREST) return "triumph";
  if (surprise <= P.BAD_SURPRISE || unrest >= P.BAD_UNREST) return "fiasco";
  return "muddle";
}

// 兑现一枚引信的效果（跨四条既有轴）。owner 缺省 = 玩家（兼容既有调用）。
function fuseApplyOutcome(id, outcome, owner) {
  const T = fuseTable();
  const def = T.FUSES[id];
  const s = initFuseState();
  const who = owner || ST.player;
  const scale = outcome === "triumph" ? 1 : (outcome === "muddle" ? T.PARAMS.PARTIAL_SCALE : 0);
  const good = outcome === "fiasco" ? null : def.good;
  const bad = outcome === "fiasco" ? def.bad : null;
  const fx = bad || good || {};
  const k = bad ? 1 : scale;

  // F：威望
  if (typeof fx.prestige === "number" && fx.prestige && typeof prestigeAdd === "function") {
    prestigeAdd(who, fx.prestige * k, def.zh + (outcome === "fiasco" ? "：惨败" : "：兑现"));
  }
  // S-17：感召力
  if (typeof fx.appeal === "number" && fx.appeal && typeof ideologyAppealOf === "function") {
    const cur = ideologyAppealOf(who);
    if (!ST.ideology) ST.ideology = { appeal: {} };
    if (!ST.ideology.appeal) ST.ideology.appeal = {};
    ST.ideology.appeal[who] = clamp(cur + fx.appeal * k, 0, 100);
  }
  // N1：威慑可信度 —— 全局单一字段，只对执政者生效（对手引爆不改玩家的核威慑表）
  if (who === ST.player && typeof fx.credBonus === "number" && fx.credBonus && ST.nuke) {
    initNukeState();
    ST.nuke.credBonus = clamp(ST.nuke.credBonus + fx.credBonus * k, -100, 100);
  }
  // P1：合法性 / 动荡
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(who) : null;
  if (dom) {
    if (typeof fx.legitimacy === "number" && fx.legitimacy && typeof dom.legitimacy === "number") {
      dom.legitimacy = clamp(dom.legitimacy + fx.legitimacy * k, 0, 100);
    }
    if (typeof fx.unrest === "number" && fx.unrest && typeof dom.unrest === "number") {
      dom.unrest = clamp(dom.unrest + fx.unrest * (bad ? 1 : k), 0, 100);
    }
  }
  // 增长红利（能源自主等）：持续 months 的 pmods 加成
  if (outcome !== "fiasco" && def.bonus && def.bonus.gdpBonus) {
    const bag = (who === ST.player) ? s.bonuses : aiFuseSlotOf(who).bonuses;
    bag.push({ gdpBonus: def.bonus.gdpBonus * k, months: def.bonus.months });
    if (bag.length > 12) bag.shift();
  }
  fuseRecord(id, def.zh, outcome, { owner: who });
  return { outcome: outcome, effects: fx, scale: k, owner: who };
}

// ---- E2（长引信的 AI 侧）：对手也埋下战略工程 --------------------------------
// 玩家能点火，对手此前只会旁观 —— 36–72 月的时间赌注是单方面的。
// 与 F2 / D2 / C2 同族的白名单门控：探针会话默认关闭（既有探针逐位不变），
// 只有 ?e2probe=1 或真实游戏才打开；旁观模式永远关闭。
function fuseAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]e2probe=1/.test(location.search));
}

function fuseRivalOf(k) {
  if (typeof prestigeRivalOf === "function") return prestigeRivalOf(k);
  if (k === "USA") return "SUN";
  if (k === "SUN") return "USA";
  return null;
}

// 选手集合：玩家的对手 + 美苏（与 F2 同口径 —— 超级大国之争与「你 vs 你的对手」）
function fuseAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  push(fuseRivalOf(player));
  push("USA");
  push("SUN");
  return out;
}

function aiFuseSlotOf(k) {
  const s = initFuseState();
  if (!s.ai[k] || typeof s.ai[k] !== "object") {
    s.ai[k] = { burning: {}, bonuses: [], since: {} };
  }
  const slot = s.ai[k];
  if (!slot.burning || typeof slot.burning !== "object") slot.burning = {};
  if (!Array.isArray(slot.bonuses)) slot.bonuses = [];
  if (!slot.since || typeof slot.since !== "object") slot.since = {};
  return slot;
}

function aiStopFuse(k, id) {
  const slot = aiFuseSlotOf(k);
  if (slot.burning[id] === undefined) return false;
  delete slot.burning[id];
  delete slot.since[id];
  return true;
}

// 确定性选棋（零 RNG）：养得起就维持 WANT_ACTIVE 条 / 养不起砍最贵的 / 粘性防翻烧饼。
// (y, m) 显式传入 —— 否则探针与引擎会用不同的日期算粘性窗口。
function aiPickFuse(k, y, m) {
  const T = fuseTable();
  if (!T || !T.AI_POLICY) return null;
  const P = T.AI_POLICY;
  const slot = aiFuseSlotOf(k);
  const active = Object.keys(slot.burning);
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;

  // 1. 养不起 → 停掉拖累最大的一项
  if (strain >= P.STRAIN_MAX && active.length) {
    let worst = active[0];
    for (const id of active) {
      const a = T.FUSES[id], b = T.FUSES[worst];
      if (a && b && a.drag > b.drag) worst = id;
    }
    return { stop: worst, reason: "strain", strain: strain };
  }
  // 2. 满仓 / 已达目标条数
  const want = Math.min(P.WANT_ACTIVE || 1, T.PARAMS.MAX_ACTIVE || 2);
  if (active.length >= (T.PARAMS.MAX_ACTIVE || 2)) return null;
  if (active.length >= want) return null;
  // 3. 粘性窗口
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  for (const id of active) {
    const since = slot.since[id];
    if (typeof since === "number" && ym - since < P.MIN_MONTHS) return null;
  }
  // 4. 按经济压力挑档点火
  const tier = strain < P.PICK_HI_STRAIN ? "hi" : (strain < P.PICK_MID_STRAIN ? "mid" : "lo");
  for (const id of (P.PICK[tier] || [])) {
    if (slot.burning[id] === undefined && T.FUSES[id]) {
      return { start: id, reason: "ignite", strain: strain, tier: tier };
    }
  }
  return null;
}

// AI 引信的 GDP 净效应（拖累 + 红利）：走既有 pmods 累加链。
function aiFuseDragFor(k) {
  const T = fuseTable();
  if (!T || !fuseAiActive()) return 0;
  const s = ST.fuses;
  if (!s || !s.ai || !s.ai[k]) return 0;
  const slot = s.ai[k];
  let v = 0;
  if (slot.burning) {
    for (const id in slot.burning) {
      const def = T.FUSES[id];
      if (def) v -= def.drag;
    }
  }
  if (Array.isArray(slot.bonuses)) {
    for (const b of slot.bonuses) v += b.gdpBonus || 0;
  }
  return v;
}

function fuseExpireBonuses(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].months -= 1;
    if (list[i].months <= 0) list.splice(i, 1);
  }
}

function fuseDetonateNotify(y, m, id, outcome, owner, silent) {
  if (silent) return;
  const T = fuseTable();
  const def = T.FUSES[id];
  const zh = outcome === "triumph" ? "辉煌兑现" : outcome === "fiasco" ? "惨败收场" : "不了了之";
  const who = (owner === ST.player) ? "" : ((CM.countries[owner] || {}).zh || owner) + "的";
  const item = { y: y, m: m,
    zh: "【长引信引爆】" + who + def.icon + " " + def.zh + " · " + zh,
    note: outcome === "triumph"
      ? "国势正好：经济兑现、社会安定，工程成果全额兑现。"
      : outcome === "fiasco"
        ? "国势糜烂：经济失约或社会失控，投入打了水漂 —— 长引信赌的是点火时的国运。"
        : "时过境迁：成果半数兑现。不亏，但也说不上赢。" };
  EV.items.push(item);
  EV.unread++;
  renderInbox();
  toast(item);
}

// ---- 月度推进 ---------------------------------------------------------------
function updateMonthlyFuse(y, m, silent) {
  const T = fuseTable();
  if (!T) return null;
  const s = initFuseState();

  // 增长红利过期（玩家）
  fuseExpireBonuses(s.bonuses);

  // 无执政者：没有引信，也就没有引爆（旁观零回写）
  if (!ST.player) return fuseSnapshot();

  // 玩家燃烧倒计时
  let dirty = false;
  for (const id of Object.keys(s.burning)) {
    s.burning[id] -= 1;
    if (s.burning[id] > 0) continue;
    delete s.burning[id];
    const outcome = fuseOutcomeFor(ST.player);
    fuseApplyOutcome(id, outcome, ST.player);
    fuseDetonateNotify(y, m, id, outcome, ST.player, silent);
    dirty = true;
  }

  // E2：对手也埋引信 —— 先燃烧既有，再选棋点火（同月新点火不倒计时）。
  // 不花政治资本；拖累由 accFuseAiDrag 结算。
  if (fuseAiActive()) {
    for (const k of fuseAiActors()) {
      const slot = aiFuseSlotOf(k);
      fuseExpireBonuses(slot.bonuses);
      for (const id of Object.keys(slot.burning)) {
        slot.burning[id] -= 1;
        if (slot.burning[id] > 0) continue;
        delete slot.burning[id];
        delete slot.since[id];
        const outcome = fuseOutcomeFor(k);
        fuseApplyOutcome(id, outcome, k);
        fuseDetonateNotify(y, m, id, outcome, k, silent);
        dirty = true;
      }
      const pick = aiPickFuse(k, y, m);
      if (pick && pick.stop) {
        aiStopFuse(k, pick.stop);
        dirty = true;
      } else if (pick && pick.start) {
        slot.burning[pick.start] = T.FUSES[pick.start].months;
        slot.since[pick.start] = y * 12 + m;
        dirty = true;
        if (!silent) {
          const item = { y: y, m: m,
            zh: "【长引信】" + (CM.countries[k] || {}).zh + "点火" + T.FUSES[pick.start].zh,
            note: "对手也开始赌国运了 —— 战略工程不再是你一个人的节奏。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }
  }

  if (dirty) applyPlayerDecisions();   // 红利/拖累变了 → 重挂 pmods
  return fuseSnapshot();
}

function fuseSnapshot() {
  const T = fuseTable();
  if (!T) return null;
  const s = initFuseState();
  const rival = ST.player ? fuseRivalOf(ST.player) : null;
  const rivalSlot = (rival && s.ai && s.ai[rival]) ? s.ai[rival] : null;
  const out = {
    player: ST.player || null,
    active: Object.keys(s.burning).length,
    burning: {},
    bonusGdp: +fuseGdpBonus().toFixed(3),
    drag: +fuseProgramDrag().toFixed(3),
    outcomeNow: ST.player ? fuseOutcomeNow() : null,
    logged: s.log.length,
    // E2：对手燃烧中的引信（公开 —— 航母下水、核电开工藏不住）
    rivalBurning: rivalSlot ? Object.keys(rivalSlot.burning) : []
  };
  for (const id in s.burning) {
    out.burning[id] = { left: s.burning[id], months: T.FUSES[id].months };
  }
  return out;
}

// ---- 面板 -------------------------------------------------------------------
function fusePanelHtml() {
  const T = fuseTable();
  if (!T || !ST.player) return "";
  const s = initFuseState();
  const hint = fuseOutcomeNow();
  const hintZh = hint === "triumph" ? "国势向好（引爆即辉煌）"
    : hint === "fiasco" ? "国势糜烂（引爆即惨败）" : "时过境迁（引爆只兑现一半）";
  const hintCol = hint === "triumph" ? "#4ade80" : hint === "fiasco" ? "#f87171" : "#fbbf24";
  let h = '<div class="fuse-block">';
  h += '<div class="fuse-row"><span>🧨 长引信 · 战略工程</span><b style="color:' + hintCol + '">' +
    Object.keys(s.burning).length + '/' + T.PARAMS.MAX_ACTIVE + '</b></div>';
  h += '<div class="fuse-note">引爆当月的国势决定结局：<b style="color:' + hintCol + '">' + hintZh + '</b></div>';

  for (const id in s.burning) {
    const def = T.FUSES[id];
    const left = s.burning[id];
    const pct = Math.round((1 - left / def.months) * 100);
    h += '<div class="fuse-row"><span>' + def.icon + ' ' + def.zh + '</span><b>' + left + ' 月</b></div>';
    h += '<div class="fuse-bar"><i style="width:' + pct + '%"></i></div>';
  }

  // E2：对手燃烧中的引信公开上榜
  const rival = fuseRivalOf(ST.player);
  const rivalSlot = (rival && s.ai && s.ai[rival]) ? s.ai[rival] : null;
  if (rivalSlot && Object.keys(rivalSlot.burning).length) {
    const rzh = (CM.countries[rival] || {}).zh || rival;
    h += '<div class="fuse-row"><span>对手工程 · ' + rzh + '</span><b>' +
      Object.keys(rivalSlot.burning).length + '</b></div>';
    for (const id in rivalSlot.burning) {
      const def = T.FUSES[id];
      h += '<div class="fuse-row"><span>' + def.icon + ' ' + def.zh + '</span><b>' +
        rivalSlot.burning[id] + ' 月</b></div>';
    }
  }

  h += '<div class="fuse-grid">';
  for (const id in T.FUSES) {
    const d = T.FUSES[id];
    const on = s.burning[id] !== undefined;
    const full = Object.keys(s.burning).length >= T.PARAMS.MAX_ACTIVE && !on;
    h += '<button class="fuse-btn' + (on ? " active" : "") + (full ? " disabled" : "") +
      '" data-fuse="' + id + '"' + (full ? " disabled" : "") + ' title="' + d.note + '">' +
      d.icon + " " + d.zh + " <i>" + (on ? "燃烧中" : d.months + "月·" + d.cost) + "</i></button>";
  }
  h += '</div>';
  h += '<div class="fuse-note">点火花政治资本，燃烧期拖累 GDP，引爆换跨轴成果。' +
    '何时点火就是赌哪段国运。</div></div>';
  return h;
}
