"use strict";

// ---- Phase N1：核风险轴（把 6 个展示键变成一条真实的机制）-------------------
// 起点是一个诚实的数字：`data/effects.js` 里有 6 个键没有任何引擎分支消费它们。
// 本模块不去做「单点接线」（那只会得到没人会遇到的计数器），而是把整条轴补上：
//
//   升级 escalation ──┐
//                     ├──> 误判概率/月 ──> 事故 ──> 三选一 ──> 升级或降温
//   可信度 credibility ──┘                        │
//                                                └──> DEFCON 1 连持 ──> 核战争
//
// 三条不变量：
//   · 不消费引擎 RNG（误判用确定性哈希）；
//   · 无执政者时零回写（旁观/史实探针只读计算，不触发事故、不写内政）；
//   · 核战争只能是**战略性失败**，不能是掷骰失败（需要 DEFCON 1 连持 3 个月）。
function nukeTable() {
  return (typeof window !== "undefined" && window.W1980_NUKE) || null;
}

function nukeBlank() {
  return {
    esc: 0,             // 升级 0..100
    cred: 50,           // 威慑可信度 0..95
    credBonus: 0,       // 来自展示键（natoCohesion）的累积加成
    defcon: 5,          // 派生量，缓存以便面板/存档一致
    doomsday: 0,        // DEFCON 1 连续月数
    pending: null,      // 待裁决的事故 { id, y, m }
    fired: [],          // 已触发的事故 id 序列（去重与冷却）
    lastIncidentM: null,
    log: [],            // 最近事件（UI / 终局年鉴）
    over: null          // 核战争终局标记
  };
}

function initNukeState(force) {
  if (force || !ST.nuke || typeof ST.nuke !== "object") ST.nuke = nukeBlank();
  const s = ST.nuke;
  const num = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v)) ? clamp(v, lo, hi) : dflt;
  s.esc = num(s.esc, 0, 100, 0);
  s.cred = num(s.cred, 5, 95, 50);
  s.credBonus = num(s.credBonus, -100, 100, 0);
  s.defcon = num(s.defcon, 1, 5, 5);
  s.doomsday = num(s.doomsday, 0, 500, 0);
  if (!Array.isArray(s.fired)) s.fired = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (s.pending && (typeof s.pending !== "object" || typeof s.pending.id !== "string")) s.pending = null;
  return s;
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePolEcon / sanitizePrestigeState 同一约定）
function sanitizeNukeState(d) {
  const s = nukeBlank();
  const T = nukeTable();
  if (!d || typeof d !== "object") return s;
  const num = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v)) ? clamp(v, lo, hi) : dflt;
  s.esc = num(d.esc, 0, 100, 0);
  s.cred = num(d.cred, 5, 95, 50);
  s.credBonus = num(d.credBonus, -100, 100, 0);
  s.defcon = Math.round(num(d.defcon, 1, 5, 5));
  s.doomsday = Math.round(num(d.doomsday, 0, 500, 0));
  s.lastIncidentM = num(d.lastIncidentM, -1e6, 1e6, null);
  if (Array.isArray(d.fired)) s.fired = d.fired.filter((x) => typeof x === "string").slice(-60);
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.zh === "string");
  }
  if (d.pending && typeof d.pending === "object" && typeof d.pending.id === "string") {
    const known = T ? T.INCIDENTS.some((i) => i.id === d.pending.id) : false;
    if (known) s.pending = { id: d.pending.id, y: num(d.pending.y, 1900, 2100, 1980), m: num(d.pending.m, 1, 12, 1) };
  }
  if (typeof d.over === "string" && d.over) s.over = d.over;
  return s;
}

function nukeDefconOf(esc) {
  const T = nukeTable();
  if (!T) return 5;
  for (const band of T.DEFCON) if (esc >= band.from) return band.level;
  return 5;
}

function nukeDefconInfo(level) {
  const T = nukeTable();
  if (!T) return { level: 5, zh: "五号战备", note: "" };
  for (const band of T.DEFCON) if (band.level === level) return band;
  return T.DEFCON[T.DEFCON.length - 1];
}

// 单月误判概率。平方项让低升级时几乎为零 —— 平时你不该担心核战争。
function nukeRiskOf(esc, cred) {
  const T = nukeTable();
  if (!T) return 0;
  const P = T.PARAMS;
  const e = clamp(esc, 0, 100) / 100;
  const c = Math.max(P.CRED_MIN, cred);
  return Math.min(P.RISK_CAP, P.RISK_BASE * e * e * (P.CRED_START / c));
}

// 确定性掷骰：只用 (年, 月, 盐) 的 FNV-1a 哈希，不碰 SIM.S.rngState。
function nukeRoll(y, m, salt) {
  let h = 2166136261;
  const s = String(y) + "|" + String(m) + "|" + String(salt);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// 威慑可信度：军费落差 + 威望落差 + 同盟凝聚。
// 这一层让「裁军」第一次有战略风险：pmods 里省钱，但可信度下降会把误判概率抬高。
// C（情报估算）：对手的军费/威望读**估计值**而不是真值 —— 威慑是双方的**认知**。
// C2（情报误报）：两个项都是**感知**，所以反向也算：
//   差距 = （对方眼里的我方军力）−（我方眼里的对方军力）
// 我方撒谎示强 → 对方以为我更强 → 威慑更可信；对方示弱 → 我方以为差距更大。
// 认知战第一次能双向打。
function nukeCredibilityNow() {
  const T = nukeTable();
  if (!T) return 50;
  const P = T.PARAMS;
  const s = initNukeState();
  let cred = P.CRED_START;

  const me = ST.player;
  const rival = (typeof prestigeRivalOf === "function" && me) ? prestigeRivalOf(me) : null;
  const milOf = (k) => {
    if (!k) return 4.0;
    if (k === me) return ST.mil;
    if (typeof estimateOf === "function") {
      const e = estimateOf(k, "mil");
      if (e && typeof e.est === "number") return e.est;
    }
    if (ST.ai && ST.ai.decisions && ST.ai.decisions[k] && typeof ST.ai.decisions[k].mil === "number") {
      return ST.ai.decisions[k].mil;
    }
    return 4.0;
  };
  // 「对方眼里的我方军力」：真值 + 针对对方的欺敌偏差（撒谎者不算自己的谣）
  const myMilAsSeen = () => {
    const bias = (typeof deceptionBiasRaw === "function")
      ? deceptionBiasRaw(me, "mil", rival) : 0;
    return ST.mil + bias;
  };
  const myPresAsSeen = () => {
    const bias = (typeof deceptionBiasRaw === "function")
      ? deceptionBiasRaw(me, "prestige", rival) : 0;
    return (typeof prestigeOf === "function" ? prestigeOf(me) : 50) + bias;
  };
  if (me) {
    const gap = myMilAsSeen() - milOf(rival);
    cred += gap * P.CRED_MIL;
    // 威望落差（Phase F + C2 的双向感知）：位置性的「谁代表未来」也买得到威慑力
    if (rival && typeof prestigeOf === "function") {
      const rivalPres = (typeof estimateOf === "function")
        ? (() => { const e = estimateOf(rival, "prestige"); return e && typeof e.est === "number" ? e.est : prestigeOf(rival); })()
        : prestigeOf(rival);
      cred += (myPresAsSeen() - rivalPres) * P.CRED_PRESTIGE;
    }
  }
  cred += s.credBonus * P.CRED_COHESION;
  return clamp(cred, P.CRED_MIN, P.CRED_MAX);
}

// ---- 展示键的真实消费者 ------------------------------------------------------
// 这 6 个键此前只存在于数据里。现在每一个都落到一条真实机制上：
//   defconRisk / middleEastTension / cubanTension / usSanctionPressure → 升级
//   natoCohesion → 威慑可信度（同盟凝聚就是威慑的一部分）
//   gbrPopularity → 英国国内动荡（打赢一场战争会让政府更稳，被羞辱则反之）
function nukeApplyEffect(eff, label) {
  const T = nukeTable();
  if (!T || !eff) return { esc: 0, cred: 0, unrest: 0 };
  const s = initNukeState();
  const before = { esc: s.esc, cred: s.credBonus };
  let unrest = 0;

  const escKeys = ["defconRisk", "middleEastTension", "cubanTension", "usSanctionPressure"];
  // usSanctionPressure 在数据里是布尔（true）—— 词表声明为 number，这里两种都接受，
  // 布尔按 4 点升级计（经济战本身就是升级）。这是类型漂移的兜底，不是纵容。
  for (const k of escKeys) {
    const v = eff[k];
    if (v === true) s.esc += 4;
    else if (typeof v === "number" && isFinite(v) && v !== 0) s.esc += v;
  }
  if (typeof eff.natoCohesion === "number" && isFinite(eff.natoCohesion)) {
    s.credBonus = clamp(s.credBonus + eff.natoCohesion, -100, 100);
  }
  if (typeof eff.gbrPopularity === "number" && isFinite(eff.gbrPopularity)) {
    // 民意上升 = 政府更稳 = 动荡下降（负数就是动荡上升）
    unrest = -eff.gbrPopularity * 0.5;
  }

  s.esc = clamp(s.esc, 0, 100);
  s.credBonus = clamp(s.credBonus, -100, 100);
  if (unrest !== 0 && typeof polEconDomesticOf === "function") {
    const gbr = polEconDomesticOf("GBR");
    if (gbr && typeof gbr.unrest === "number") gbr.unrest = clamp(gbr.unrest + unrest, 0, 100);
  }
  return { esc: s.esc - before.esc, cred: s.credBonus - before.cred, unrest: unrest };
}

// 危机抉择的阶梯直接推升级（与展示键分开：一个是「你选了多硬」，一个是「这件事本身多险」）
function nukeEscalateByTier(tier) {
  const T = nukeTable();
  if (!T) return 0;
  const s = initNukeState();
  const add = T.PARAMS.TIER_ESC[clamp(Math.round(tier), 0, T.PARAMS.TIER_ESC.length - 1)] || 0;
  if (add) s.esc = clamp(s.esc + add, 0, 100);
  return add;
}

function nukeRecord(kind, zh, extra) {
  const T = nukeTable();
  const s = initNukeState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const k in extra) e[k] = extra[k];
  s.log.push(e);
  if (s.log.length > (T ? T.PARAMS.LOG_MAX : 24)) s.log.shift();
  return e;
}

// ---- 事故裁决 ---------------------------------------------------------------
function nukeIncidentDef(id) {
  const T = nukeTable();
  if (!T) return null;
  for (const i of T.INCIDENTS) if (i.id === id) return i;
  return null;
}

function resolveNukeIncident(optionId, silent) {
  const T = nukeTable();
  const s = initNukeState();
  if (!s.pending) return { ok: false, reason: "no-pending" };
  const def = nukeIncidentDef(s.pending.id);
  if (!def) { s.pending = null; return { ok: false, reason: "unknown-incident" }; }
  let opt = null;
  for (const o of def.options) if (o.id === optionId) opt = o;
  if (!opt) return { ok: false, reason: "unknown-option" };

  s.esc = clamp(s.esc + (opt.esc || 0), 0, 100);
  if (opt.cred) s.credBonus = clamp(s.credBonus + opt.cred, -100, 100);
  nukeRecord("incident", def.zh + "：" + opt.zh, { opt: opt.id, esc: opt.esc || 0 });
  s.pending = null;
  s.lastIncidentM = curNukeMonth();

  if (!silent) {
    const item = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1,
      zh: "【核危机处置】" + def.icon + " " + def.zh,
      note: opt.zh + "。" + opt.note + "（升级 " + ((opt.esc || 0) >= 0 ? "+" : "") + (opt.esc || 0) +
        "，威慑 " + ((opt.cred || 0) >= 0 ? "+" : "") + (opt.cred || 0) + "）" };
    EV.items.push(item);
    EV.unread++;
    renderInbox();
    toast(item);
  }
  return { ok: true, def: def, opt: opt };
}

function curNukeMonth() {
  return SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;
}

// ---- 月度推进 ---------------------------------------------------------------
function updateNukeRisk(y, m, silent) {
  const T = nukeTable();
  if (!T) return null;
  const s = initNukeState();
  const P = T.PARAMS;

  if (s.over) return nukeSnapshot();

  // 1) 常态推拉：张力、战争、条约、自然回落
  const tension = (ST.ai && ST.ai.tensions && typeof ST.ai.tensions["USA:SUN"] === "number")
    ? ST.ai.tensions["USA:SUN"] : 20;
  let dEsc = (tension / 100) * P.TENSION_ESC;

  let activeWars = 0;
  if (typeof groundWarSnapshot === "function") {
    const snap = groundWarSnapshot();
    if (snap && snap.wars) for (const id in snap.wars) if (snap.wars[id].active) activeWars++;
  }
  dEsc += activeWars * P.WAR_ESC;

  let activeTreaties = 0;
  if (ST.ai && Array.isArray(ST.ai.treaties)) {
    activeTreaties = ST.ai.treaties.filter((t) => t && t.status === "active").length;
  }
  dEsc += activeTreaties * P.TREATY_ESC;

  // 自然回落：朝 0 收（缓和是有惯性的，紧张也是）
  dEsc -= P.DECAY * (s.esc / 100) * 4;
  s.esc = clamp(s.esc + dEsc, 0, 100);

  // 2) 可信度（只有存在执政者/对手时才有意义；旁观保持缺省）
  const credNow = nukeCredibilityNow();
  s.cred = credNow;

  // 3) DEFCON 与末日计数
  s.defcon = nukeDefconOf(s.esc);
  // 末日计数只在**有决策者**时推进：没有执政者就没有「选择强硬」这回事，
  // 世界也就不该自己走进核战争。这也是史实轨迹一字不变的一部分。
  if (ST.player && s.defcon === 1) s.doomsday += 1;
  else s.doomsday = 0;

  // 4) 误判：**只在有执政者时**掷骰 —— 旁观没有决策者，不该被随机事件惩罚，
  //    这也是史实轨迹一字不变的保证。
  if (ST.player && !s.pending && !s.over) {
    const risk = nukeRiskOf(s.esc, s.cred);
    if (risk > 0 && nukeRoll(y, m, "incident") < risk) {
      // 冷却：两次事故之间至少隔 2 个月，避免一次升级把玩家埋了
      const now = y * 12 + m;
      if (s.lastIncidentM === null || now - s.lastIncidentM >= 2) {
        const idx = (Math.floor(nukeRoll(y, m, "which") * T.INCIDENTS.length)) % T.INCIDENTS.length;
        const def = T.INCIDENTS[idx];
        s.pending = { id: def.id, y: y, m: m };
        s.fired.push(def.id);
        nukeRecord("alert", "触发核危机：" + def.zh, { inc: def.id });
        if (!silent) {
          const item = { y: y, m: m, zh: "⚠️【核风险事故】" + def.icon + " " + def.zh,
            note: def.note + " 必须立即在「你的国家 · 决策」面板中作出处置。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }
  }

  // 5) 核战争：DEFCON 1 连持 → 终局。这是战略性失败，不是掷骰失败。
  if (ST.player && s.doomsday >= P.DOOMSDAY_MONTHS && !s.over) {
    s.over = "doomsday";
    nukeRecord("doomsday", "DEFCON 1 连续 " + s.doomsday + " 个月 —— 核交换开始", {});
    if (ST.player && !silent) {
      const item = { y: y, m: m, zh: "☢️【核战争】威慑失败",
        note: "DEFCON 1 已连续 " + s.doomsday + " 个月。不是你选择了战争，是你没有选择降温。" };
      EV.items.push(item);
      EV.unread++;
      renderInbox();
      toast(item);
    }
  }

  // 6) 升级落回内政：全民在核阴影下的社会张力
  if (ST.player && s.esc >= 40) {
    const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(ST.player) : null;
    if (dom && typeof dom.unrest === "number") {
      dom.unrest = clamp(dom.unrest + 0.18 * ((s.esc - 40) / 60), 0, 100);
    }
  }

  return nukeSnapshot();
}

function nukeSnapshot() {
  const T = nukeTable();
  if (!T) return null;
  const s = initNukeState();
  const info = nukeDefconInfo(s.defcon);
  return {
    esc: +s.esc.toFixed(2),
    cred: +s.cred.toFixed(2),
    credBonus: +s.credBonus.toFixed(2),
    defcon: s.defcon,
    defconZh: info.zh,
    doomsday: s.doomsday,
    risk: +(nukeRiskOf(s.esc, s.cred) * 100).toFixed(4),
    pending: s.pending ? s.pending.id : null,
    fired: s.fired.length,
    over: s.over
  };
}

// ---- 面板 -------------------------------------------------------------------
function nukePanelHtml() {
  const T = nukeTable();
  if (!T) return "";
  const s = initNukeState();
  const info = nukeDefconInfo(s.defcon);
  const tone = s.defcon <= 2 ? "#f87171" : s.defcon === 3 ? "#fbbf24" : "#7ba4d9";
  let h = '<div class="nk-panel">';
  h += '<div class="nk-row"><span>☢️ 核风险 · DEFCON ' + s.defcon + ' ' + info.zh + '</span>' +
    '<b style="color:' + tone + '">' + s.esc.toFixed(0) + ' / 100</b></div>';
  h += '<div class="nk-bar"><i style="width:' + s.esc.toFixed(1) + '%;background:' + tone + '"></i></div>';
  h += '<div class="nk-note">' + info.note + '</div>';
  h += '<div class="nk-note">威慑可信度 <b>' + s.cred.toFixed(0) + '</b>' +
    '　·　月误判概率 <b style="color:' + tone + '">' + (nukeRiskOf(s.esc, s.cred) * 100).toFixed(2) + '%</b>' +
    (s.doomsday > 0 ? '　·　⚠️ 末日计数 ' + s.doomsday + '/' + T.PARAMS.DOOMSDAY_MONTHS : '') + '</div>';

  if (s.over === "doomsday") {
    h += '<div class="nk-alert">☢️ 核交换已经发生。这一局在战略上结束了。</div>';
  } else if (s.pending) {
    const def = nukeIncidentDef(s.pending.id);
    if (def) {
      h += '<div class="nk-alert">⚠️ ' + def.icon + ' ' + def.zh + '</div>';
      h += '<div class="nk-note">' + def.note + '</div><div class="nk-opts">';
      for (const o of def.options) {
        h += '<button class="nk-opt-btn" data-nkopt="' + o.id + '" title="' + o.note + '">' + o.zh +
          ' <i>升级' + ((o.esc || 0) >= 0 ? "+" : "") + (o.esc || 0) + ' 威慑' + ((o.cred || 0) >= 0 ? "+" : "") + (o.cred || 0) + '</i></button>';
      }
      h += '</div>';
    }
  }
  h += '</div>';
  return h;
}
