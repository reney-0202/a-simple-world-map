"use strict";

// ---- Phase N2：核风险轴的 AI 侧（升级 / 可信度 / DEFCON）-------------------
// N1 给了玩家完整的悬崖边沙盒，但对手此前不主动管理升级或降温。
// 本模块补上对手侧：确定性规则选棋、真实消费者落点、零引擎 RNG。
//
// 三条（及以上）规则：
//   1. 主动降温 —— 升级过高（约 DEFCON 2–3）→ 压低 ST.nuke.esc + 张力，对手威望 +
//   2. 照会催降温 —— 中段升级 → 照会扣玩家威望/抬动荡（不碰峰会/条约）
//   3. 拒绝强硬 —— 可信度吃紧时，事故强硬选项 / 高阶危机阶梯被拒（挂在既有路径）
//   附：经济吃紧收手；MIN_MONTHS 粘性防逐月翻烧饼
//
// 门控与 F2/E2/I2/Cov2/Dip2 同族：只有 ?n2probe=1 或真实有玩家局才开；旁观零回写。
// 与 Dip2 边界：本模块不提议峰会、不拒签条约 —— 只碰核风险轴。
// 不变量：零引擎 RNG、不升存档版本（sanitize 缺省补齐）、史实门白名单。

function nukeAiTable() {
  return (typeof window !== "undefined" && window.W1980_NUKE && window.W1980_NUKE.AI_POLICY) || null;
}

function nukeAiBlank() {
  return { slots: {}, log: [] };
}

function initNukeAiState(force) {
  if (force || !ST.nukeAi || typeof ST.nukeAi !== "object") ST.nukeAi = nukeAiBlank();
  const s = ST.nukeAi;
  if (!s.slots || typeof s.slots !== "object") s.slots = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

function sanitizeNukeAiState(d) {
  const s = nukeAiBlank();
  const P = nukeAiTable();
  if (!d || typeof d !== "object") return s;
  if (d.slots && typeof d.slots === "object") {
    for (const k in d.slots) {
      if (!CM.countries[k]) continue;
      const raw = d.slots[k];
      if (!raw || typeof raw !== "object") continue;
      s.slots[k] = {
        lastYm: (typeof raw.lastYm === "number" && isFinite(raw.lastYm)) ? Math.round(raw.lastYm) : null,
        lastKind: (typeof raw.lastKind === "string") ? raw.lastKind : null,
        coolCount: (typeof raw.coolCount === "number" && isFinite(raw.coolCount))
          ? Math.max(0, Math.round(raw.coolCount)) : 0,
        warnCount: (typeof raw.warnCount === "number" && isFinite(raw.warnCount))
          ? Math.max(0, Math.round(raw.warnCount)) : 0,
        rejectCount: (typeof raw.rejectCount === "number" && isFinite(raw.rejectCount))
          ? Math.max(0, Math.round(raw.rejectCount)) : 0
      };
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(P ? P.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

function nukeAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]n2probe=1/.test(location.search));
}

function nukeAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  if (typeof prestigeRivalOf === "function") push(prestigeRivalOf(player));
  else if (typeof ideologyRivalOf === "function") push(ideologyRivalOf(player));
  // 美苏永远是核风险轴的主角
  push("USA");
  push("SUN");
  return out;
}

function aiNukeSlotOf(k) {
  const s = initNukeAiState();
  if (!s.slots[k] || typeof s.slots[k] !== "object") {
    s.slots[k] = { lastYm: null, lastKind: null, coolCount: 0, warnCount: 0, rejectCount: 0 };
  }
  return s.slots[k];
}

function nukeAiRecord(kind, zh, extra) {
  const P = nukeAiTable();
  const s = initNukeAiState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const x in extra) e[x] = extra[x];
  s.log.push(e);
  if (s.log.length > (P ? P.LOG_MAX : 24)) s.log.shift();
  return e;
}

function nukeAiApplyDomesticHit(player, unrestHit) {
  const touched = [];
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(player) : null;
  if (!dom) return touched;
  if (typeof dom.unrest === "number" && unrestHit > 0) {
    dom.unrest = clamp(dom.unrest + unrestHit, 0, 100);
    touched.push("unrest");
  }
  return touched;
}

function nukeAiAdjustTension(delta) {
  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!ST.ai.tensions || typeof ST.ai.tensions !== "object") ST.ai.tensions = {};
  const key = "USA:SUN";
  const cur = (typeof ST.ai.tensions[key] === "number") ? ST.ai.tensions[key] : 50;
  ST.ai.tensions[key] = clamp(cur + delta, 0, 100);
  return ST.ai.tensions[key];
}

// 纯规则选棋：同状态同结果，不碰 RNG。
function aiPickNukeOp(k, y, m) {
  const P = nukeAiTable();
  if (!P || !ST.player) return null;
  const slot = aiNukeSlotOf(k);
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;
  const nuke = (typeof initNukeState === "function") ? initNukeState() : (ST.nuke || { esc: 0 });
  const esc = (typeof nuke.esc === "number") ? nuke.esc : 0;

  // 粘性
  if (typeof slot.lastYm === "number" && ym - slot.lastYm < P.MIN_MONTHS) return null;

  // 养不起收手
  if (strain >= P.STRAIN_MAX) {
    return { standDown: true, reason: "strain", strain: strain };
  }

  // 规则 1：高升级主动降温
  if (esc >= P.COOL_ESC_MIN) {
    return { kind: "cool", reason: "high-esc", esc: esc };
  }

  // 规则 2：中段升级照会催降温
  if (esc >= P.WARN_ESC_MIN && esc < P.WARN_ESC_MAX) {
    return { kind: "warn", reason: "mid-esc", esc: esc };
  }

  return null;
}

// 拒强硬判定（规则 3）—— 挂在事故裁决 / 危机阶梯；门控关闭时一律放行。
function nukeAiAcceptHardline(spec) {
  if (!nukeAiActive()) return { ok: true, skipped: true };
  const P = nukeAiTable();
  if (!P) return { ok: true, skipped: true };
  const nuke = (typeof initNukeState === "function") ? initNukeState() : (ST.nuke || {});
  const cred = (typeof nuke.cred === "number") ? nuke.cred : 50;
  if (cred > P.REJECT_CRED_MAX) return { ok: true, cred: cred };

  const kind = (spec && spec.kind) || "incident";
  if (kind === "crisis") {
    const tier = (spec && typeof spec.tier === "number") ? spec.tier : 0;
    if (tier < P.HAWK_TIER_MIN) return { ok: true, cred: cred, tier: tier };
    return { ok: false, reason: "cred", kind: "crisis", tier: tier, cred: cred };
  }
  const esc = (spec && typeof spec.esc === "number") ? spec.esc : 0;
  if (esc < P.HAWK_OPT_ESC_MIN) return { ok: true, cred: cred, esc: esc };
  return { ok: false, reason: "cred", kind: "incident", esc: esc, cred: cred, optId: spec && spec.optId };
}

function nukeAiApplyRejectHardline(actor, reason, y, m, silent) {
  const P = nukeAiTable();
  if (!P || !ST.player) return { touched: [] };
  const touched = [];
  const who = actor || (nukeAiActors()[0] || "USA");
  if (typeof prestigeAdd === "function") {
    prestigeAdd(ST.player, -P.REJECT_PRESTIGE, "核危机空谈遭拒");
    touched.push("prestige");
  }
  touched.push.apply(touched, nukeAiApplyDomesticHit(ST.player, P.REJECT_UNREST));
  // 强制降温：强硬姿态不被承认，升级反而回落
  if (typeof initNukeState === "function") {
    const s = initNukeState();
    s.esc = clamp(s.esc + P.REJECT_FORCE_ESC, 0, 100);
    touched.push("nuke");
  }
  const slot = aiNukeSlotOf(who);
  slot.lastYm = y * 12 + m;
  slot.lastKind = "reject";
  slot.rejectCount = (slot.rejectCount || 0) + 1;
  const aiZh = (CM.countries[who] || {}).zh || who;
  nukeAiRecord("reject", aiZh + "拒绝强硬空谈", { by: who, reason: reason, touched: touched });
  if (!silent && typeof dispatchDiplomaticCable === "function") {
    dispatchDiplomaticCable({
      type: "nuke_reject",
      from: who,
      target: ST.player,
      zh: "拒强硬照会",
      desc: "【核风险】" + aiZh + "拒绝在可信度吃紧时与贵国对等升级："
        + "空谈威慑无益。升级已被压回，贵国威望与国内舆论已受冲击。"
    }, y, m, false);
  }
  return { touched: touched, reason: reason };
}

function executeNukeAiAction(actor, pick, y, m, silent) {
  const P = nukeAiTable();
  if (!P || !pick || !ST.player) return { ok: false, reason: "no-pick" };
  const slot = aiNukeSlotOf(actor);
  const actorZh = (CM.countries[actor] || {}).zh || actor;
  const touched = [];

  if (pick.kind === "cool") {
    if (typeof initNukeState === "function") {
      const s = initNukeState();
      s.esc = clamp(s.esc + P.COOL_ESC_DELTA, 0, 100);
      touched.push("nuke");
    }
    nukeAiAdjustTension(P.COOL_TENSION_DELTA);
    touched.push("tension");
    if (typeof prestigeAdd === "function") {
      prestigeAdd(actor, P.COOL_PRESTIGE, "主动核降温");
      touched.push("prestige");
    }
    slot.lastYm = y * 12 + m;
    slot.lastKind = "cool";
    slot.coolCount = (slot.coolCount || 0) + 1;
    nukeAiRecord("cool", actorZh + "主动降温", {
      by: actor, esc: pick.esc, delta: P.COOL_ESC_DELTA, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "nuke_cool",
        from: actor,
        target: ST.player,
        zh: "核风险降温照会",
        desc: "【核风险】" + actorZh + "单方面降低战备等级并呼吁双方后退一步。"
          + "升级与美苏张力已实质回落。"
      }, y, m, false);
    }
    return { ok: true, kind: "cool", touched: touched };
  }

  if (pick.kind === "warn") {
    if (typeof prestigeAdd === "function") {
      prestigeAdd(ST.player, -P.WARN_PRESTIGE, "核风险催降温照会");
      touched.push("prestige");
    }
    touched.push.apply(touched, nukeAiApplyDomesticHit(ST.player, P.WARN_UNREST));
    slot.lastYm = y * 12 + m;
    slot.lastKind = "warn";
    slot.warnCount = (slot.warnCount || 0) + 1;
    nukeAiRecord("warn", actorZh + "催降温照会", {
      by: actor, esc: pick.esc, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "nuke_warn",
        from: actor,
        target: ST.player,
        zh: "核风险催降温",
        desc: "【核风险】" + actorZh + "照会：当前升级已进入危险中段，"
          + "继续强硬将迫使对方采取对等措施。威望与国内舆论已受冲击。"
      }, y, m, false);
    }
    return { ok: true, kind: "warn", touched: touched };
  }

  return { ok: false, reason: "unknown-kind" };
}

function updateMonthlyNukeAi(y, m, silent) {
  const P = nukeAiTable();
  if (!P) return null;
  if (!nukeAiActive()) return null;
  initNukeAiState();

  for (const k of nukeAiActors()) {
    const pick = aiPickNukeOp(k, y, m);
    if (!pick) continue;
    if (pick.standDown) {
      nukeAiRecord("standDown", (CM.countries[k] || {}).zh + "核风险管理收手", { by: k, reason: pick.reason });
      continue;
    }
    executeNukeAiAction(k, pick, y, m, silent);
  }
  return ST.nukeAi;
}

function nukeAiSnapshot() {
  const s = initNukeAiState();
  let cools = 0, warns = 0, rejects = 0, standDowns = 0;
  for (const e of s.log) {
    if (!e) continue;
    if (e.kind === "cool") cools++;
    else if (e.kind === "warn") warns++;
    else if (e.kind === "reject") rejects++;
    else if (e.kind === "standDown") standDowns++;
  }
  return {
    active: nukeAiActive(),
    cools: cools,
    warns: warns,
    rejects: rejects,
    standDowns: standDowns,
    logLen: s.log.length
  };
}
