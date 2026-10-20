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
  return { burning: {}, bonuses: [], log: [] };
}

function initFuseState(force) {
  if (force || !ST.fuses || typeof ST.fuses !== "object") ST.fuses = fuseBlank();
  const s = ST.fuses;
  if (!s.burning || typeof s.burning !== "object") s.burning = {};
  if (!Array.isArray(s.bonuses)) s.bonuses = [];
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePrestigeState 同一约定）
function sanitizeFuseState(d) {
  const s = fuseBlank();
  const T = fuseTable();
  if (!d || typeof d !== "object") return s;
  const known = T ? T.FUSES : {};
  if (d.burning && typeof d.burning === "object") {
    for (const id in d.burning) {
      const v = d.burning[id];
      // 有效存档永远存 >= 1（0 会在当月引爆，负数是垃圾）——直接丢弃
      if (!known[id] || typeof v !== "number" || !isFinite(v) || v < 1) continue;
      s.burning[id] = clamp(Math.round(v), 1, known[id].months);
    }
  }
  if (Array.isArray(d.bonuses)) {
    s.bonuses = d.bonuses.slice(-12).map((b) => ({
      gdpBonus: (b && typeof b.gdpBonus === "number" && isFinite(b.gdpBonus)) ? b.gdpBonus : 0,
      months: (b && typeof b.months === "number" && isFinite(b.months)) ? Math.max(0, Math.round(b.months)) : 0
    })).filter((b) => b.gdpBonus !== 0 && b.months > 0);
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.id === "string");
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
  const T = fuseTable();
  if (!T) return "muddle";
  const P = T.PARAMS;
  const snap = (typeof polEconSnapshot === "function") ? polEconSnapshot() : null;
  const surprise = (snap && typeof snap.surprise === "number") ? snap.surprise : 0;
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(ST.player) : null;
  const unrest = (dom && typeof dom.unrest === "number") ? dom.unrest : 50;
  if (surprise >= P.GOOD_SURPRISE && unrest <= P.GOOD_UNREST) return "triumph";
  if (surprise <= P.BAD_SURPRISE || unrest >= P.BAD_UNREST) return "fiasco";
  return "muddle";
}

// 兑现一枚引信的效果（跨四条既有轴）
function fuseApplyOutcome(id, outcome) {
  const T = fuseTable();
  const def = T.FUSES[id];
  const s = initFuseState();
  const scale = outcome === "triumph" ? 1 : (outcome === "muddle" ? T.PARAMS.PARTIAL_SCALE : 0);
  const good = outcome === "fiasco" ? null : def.good;
  const bad = outcome === "fiasco" ? def.bad : null;
  const fx = bad || good || {};
  const k = bad ? 1 : scale;

  // F：威望
  if (typeof fx.prestige === "number" && fx.prestige && typeof prestigeAdd === "function") {
    prestigeAdd(ST.player, fx.prestige * k, def.zh + (outcome === "fiasco" ? "：惨败" : "：兑现"));
  }
  // S-17：感召力
  if (typeof fx.appeal === "number" && fx.appeal && typeof ideologyAppealOf === "function") {
    const cur = ideologyAppealOf(ST.player);
    ST.ideology.appeal[ST.player] = clamp(cur + fx.appeal * k, 0, 100);
  }
  // N1：威慑可信度（同盟深化/武器现代化的底牌）
  if (typeof fx.credBonus === "number" && fx.credBonus && ST.nuke) {
    initNukeState();
    ST.nuke.credBonus = clamp(ST.nuke.credBonus + fx.credBonus * k, -100, 100);
  }
  // P1：合法性 / 动荡
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(ST.player) : null;
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
    s.bonuses.push({ gdpBonus: def.bonus.gdpBonus * k, months: def.bonus.months });
    if (s.bonuses.length > 12) s.bonuses.shift();
  }
  fuseRecord(id, def.zh, outcome, {});
  return { outcome: outcome, effects: fx, scale: k };
}

// ---- 月度推进 ---------------------------------------------------------------
function updateMonthlyFuse(y, m, silent) {
  const T = fuseTable();
  if (!T) return null;
  const s = initFuseState();
  const now = y * 12 + m;

  // 增长红利过期
  for (let i = s.bonuses.length - 1; i >= 0; i--) {
    s.bonuses[i].months -= 1;
    if (s.bonuses[i].months <= 0) s.bonuses.splice(i, 1);
  }

  // 无执政者：没有引信，也就没有引爆（旁观零回写）
  if (!ST.player) return fuseSnapshot();

  for (const id of Object.keys(s.burning)) {
    s.burning[id] -= 1;
    if (s.burning[id] > 0) continue;
    delete s.burning[id];
    const outcome = fuseOutcomeNow();
    fuseApplyOutcome(id, outcome);
    if (!silent) {
      const def = T.FUSES[id];
      const zh = outcome === "triumph" ? "辉煌兑现" : outcome === "fiasco" ? "惨败收场" : "不了了之";
      const item = { y: y, m: m,
        zh: "【长引信引爆】" + def.icon + " " + def.zh + " · " + zh,
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
    applyPlayerDecisions();   // 红利/拖累变了 → 重挂 pmods
  }
  return fuseSnapshot();
}

function fuseSnapshot() {
  const T = fuseTable();
  if (!T) return null;
  const s = initFuseState();
  const out = {
    player: ST.player || null,
    active: Object.keys(s.burning).length,
    burning: {},
    bonusGdp: +fuseGdpBonus().toFixed(3),
    drag: +fuseProgramDrag().toFixed(3),
    outcomeNow: ST.player ? fuseOutcomeNow() : null,
    logged: s.log.length
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
