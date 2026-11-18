"use strict";

// ---- Phase Dip2：AI 外交主动（峰会 / 安理会 / 军控）--------------------------
// R10B/C 给了玩家完整的仪式与谈判沙盒，但对手此前几乎只在窗口月发一封邀请照会。
// 本模块补上对手侧：确定性规则选棋、真实消费者落点、零引擎 RNG。
//
// 三条（及以上）规则：
//   1. 提议峰会 —— 历史峰会窗口期内、张力适中、尚有可签条约 → 主动邀约
//   2. 加压履约 —— 生效条约下玩家军费贴上限 / 悄悄制裁 / 安理会窗口空转 → 加压
//   3. 拒绝空谈 —— 张力仍高或军费仍高却来签军控 → 拒签（挂在 signTreaty）
//   附：经济吃紧收手；MIN_MONTHS 粘性防逐月翻烧饼
//
// 门控与 F2/E2/I2/Cov2 同族：只有 ?dip2probe=1 或真实有玩家局才开；旁观零回写。
// 不变量：零引擎 RNG、不升存档版本（sanitize 缺省补齐）、史实门白名单。

function dipAiTable() {
  return (typeof window !== "undefined" && window.W1980_AI && window.W1980_AI.DIP_AI_POLICY) || null;
}

function dipAiBlank() {
  return { slots: {}, log: [], pending: null };
}

function initDipAiState(force) {
  if (force || !ST.dipAi || typeof ST.dipAi !== "object") ST.dipAi = dipAiBlank();
  const s = ST.dipAi;
  if (!s.slots || typeof s.slots !== "object") s.slots = {};
  if (!Array.isArray(s.log)) s.log = [];
  if (s.pending !== null && (typeof s.pending !== "object")) s.pending = null;
  return s;
}

function sanitizeDipAiState(d) {
  const s = dipAiBlank();
  const P = dipAiTable();
  if (!d || typeof d !== "object") return s;
  if (d.slots && typeof d.slots === "object") {
    for (const k in d.slots) {
      if (!CM.countries[k]) continue;
      const raw = d.slots[k];
      if (!raw || typeof raw !== "object") continue;
      s.slots[k] = {
        lastYm: (typeof raw.lastYm === "number" && isFinite(raw.lastYm)) ? Math.round(raw.lastYm) : null,
        lastKind: (typeof raw.lastKind === "string") ? raw.lastKind : null,
        proposeCount: (typeof raw.proposeCount === "number" && isFinite(raw.proposeCount))
          ? Math.max(0, Math.round(raw.proposeCount)) : 0,
        pressCount: (typeof raw.pressCount === "number" && isFinite(raw.pressCount))
          ? Math.max(0, Math.round(raw.pressCount)) : 0
      };
    }
  }
  if (d.pending && typeof d.pending === "object" && typeof d.pending.presetId === "string"
      && CM.countries[d.pending.by]) {
    s.pending = {
      presetId: d.pending.presetId,
      by: d.pending.by,
      y: (typeof d.pending.y === "number") ? d.pending.y : 1980,
      m: (typeof d.pending.m === "number") ? d.pending.m : 1
    };
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(P ? P.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

function dipAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]dip2probe=1/.test(location.search));
}

function dipAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  if (typeof prestigeRivalOf === "function") push(prestigeRivalOf(player));
  else if (typeof ideologyRivalOf === "function") push(ideologyRivalOf(player));
  // 美苏永远是仪式轴的主角；其余大国不主动开峰会（避免噪音）
  push("USA");
  push("SUN");
  return out;
}

function aiDipSlotOf(k) {
  const s = initDipAiState();
  if (!s.slots[k] || typeof s.slots[k] !== "object") {
    s.slots[k] = { lastYm: null, lastKind: null, proposeCount: 0, pressCount: 0 };
  }
  return s.slots[k];
}

function dipAiRecord(kind, zh, extra) {
  const P = dipAiTable();
  const s = initDipAiState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const x in extra) e[x] = extra[x];
  s.log.push(e);
  if (s.log.length > (P ? P.LOG_MAX : 24)) s.log.shift();
  return e;
}

function dipAiTensionOf(actor) {
  if (!window.W1980_AI || !ST.player) return 50;
  const pd = { mil: ST.mil, sanctions: ST.sanctions || [], aid: ST.aid || [] };
  const ws = { countries: CM.countries, treaties: (ST.ai && ST.ai.treaties) ? ST.ai.treaties : [] };
  const att = window.W1980_AI.calcAttitude(actor, ST.player, pd, ws);
  return (att && typeof att.tension === "number") ? att.tension : 50;
}

function dipAiSummitInWindow(actor, y, m) {
  const P = dipAiTable();
  if (!P || !window.W1980_AI || !Array.isArray(window.W1980_AI.SUMMIT_PRESETS) || !ST.player) return null;
  const now = y * 12 + m;
  for (const sp of window.W1980_AI.SUMMIT_PRESETS) {
    if (!sp || !Array.isArray(sp.participants)) continue;
    if (sp.participants.indexOf(ST.player) < 0 || sp.participants.indexOf(actor) < 0) continue;
    const ym = (sp.year || 0) * 12 + (sp.month || 1);
    if (Math.abs(now - ym) <= P.PROPOSE_WINDOW_SLACK) return sp;
  }
  return null;
}

function dipAiUnscInWindow(y, m) {
  if (!window.W1980_AI || !window.W1980_AI.UNSC_RESOLUTIONS) return null;
  const list = Object.values(window.W1980_AI.UNSC_RESOLUTIONS);
  for (const res of list) {
    if (res && res.year === y && res.month === m) return res;
  }
  return null;
}

function dipAiNearBreach(actor) {
  const P = dipAiTable();
  if (!P || !window.W1980_AI || !ST.ai || !Array.isArray(ST.ai.treaties)) return null;
  for (const tr of ST.ai.treaties) {
    if (!tr || tr.status !== "active" || tr.with !== actor) continue;
    const def = window.W1980_AI.TREATY_DEFS[tr.id];
    if (!def) continue;
    if (typeof def.milCap === "number" && typeof ST.mil === "number"
        && ST.mil > def.milCap - P.PRESS_MIL_MARGIN) {
      return { treatyId: tr.id, reason: "mil", mil: ST.mil, milCap: def.milCap };
    }
    if (typeof def.maxSanctionLvl === "number") {
      const san = (ST.sanctions || []).find((s) => s && s.t === actor);
      if (san && typeof san.l === "number" && san.l > def.maxSanctionLvl) {
        return { treatyId: tr.id, reason: "sanction", level: san.l };
      }
    }
  }
  return null;
}

function dipAiAvailableTreaties(actor) {
  if (!window.W1980_AI || !window.W1980_AI.TREATY_DEFS) return [];
  const active = (ST.ai && Array.isArray(ST.ai.treaties)) ? ST.ai.treaties : [];
  const signed = {};
  for (const t of active) {
    if (t && t.with === actor && t.status === "active") signed[t.id] = true;
  }
  return Object.keys(window.W1980_AI.TREATY_DEFS).filter((id) => !signed[id]);
}

// 纯规则选棋：同状态同结果，不碰 RNG。
function aiPickDipOp(k, y, m) {
  const P = dipAiTable();
  if (!P || !window.W1980_AI || !ST.player) return null;
  const slot = aiDipSlotOf(k);
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;

  // 粘性
  if (typeof slot.lastYm === "number" && ym - slot.lastYm < P.MIN_MONTHS) return null;

  // 养不起收手
  if (strain >= P.STRAIN_MAX) {
    return { standDown: true, reason: "strain", strain: strain };
  }

  // 规则 2a：加压履约（生效条约下玩家贴边违约）
  const near = dipAiNearBreach(k);
  if (near) {
    return { kind: "press", treatyId: near.treatyId, reason: near.reason, detail: near };
  }

  // 规则 2b：安理会窗口空转 —— 决议未过、玩家是五常之一 → 加压催票
  const unsc = dipAiUnscInWindow(yy, mm);
  if (unsc && window.W1980_AI.UNSC_P5 && window.W1980_AI.UNSC_P5.indexOf(ST.player) >= 0) {
    const passed = ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.indexOf(unsc.id) >= 0;
    if (!passed) {
      return { kind: "press_unsc", resId: unsc.id, reason: "unsc-idle" };
    }
  }

  // 规则 1：窗口期提议峰会（历史峰会按 tensionReq 放宽上限 —— 破冰本就在高张力）
  const summit = dipAiSummitInWindow(k, yy, mm);
  if (summit) {
    const tension = dipAiTensionOf(k);
    const avail = dipAiAvailableTreaties(k);
    const s = initDipAiState();
    const already = s.pending && s.pending.by === k && s.pending.presetId === summit.id;
    const tmax = Math.max(P.PROPOSE_TENSION_MAX,
      (typeof summit.tensionReq === "number" ? summit.tensionReq : 85));
    if (!already && avail.length > 0
        && tension <= tmax && tension >= P.PROPOSE_TENSION_MIN) {
      return { kind: "propose", presetId: summit.id, reason: "window", tension: tension };
    }
  }

  return null;
}

// 拒签判定（规则 3）—— 挂在 signTreaty；门控关闭时一律放行。
function dipAiAcceptTreaty(treatyId, aiKey) {
  if (!dipAiActive()) return { ok: true, skipped: true };
  const P = dipAiTable();
  if (!P || !window.W1980_AI) return { ok: true, skipped: true };
  const tDef = window.W1980_AI.TREATY_DEFS[treatyId];
  if (!tDef) return { ok: false, reason: "unknown" };
  // 空谈的具体理由优先于笼统张力：军费/制裁未让步却谈军控
  if (typeof tDef.milCap === "number" && typeof ST.mil === "number" && ST.mil > P.REJECT_MIL_OVER) {
    return { ok: false, reason: "armed", mil: ST.mil };
  }
  if (typeof tDef.maxSanctionLvl === "number") {
    const san = (ST.sanctions || []).find((s) => s && s.t === aiKey);
    if (san && typeof san.l === "number" && san.l > tDef.maxSanctionLvl) {
      return { ok: false, reason: "sanctions", level: san.l };
    }
  }
  const tension = dipAiTensionOf(aiKey);
  if (tension >= P.REJECT_TENSION) {
    return { ok: false, reason: "tension", tension: tension };
  }
  return { ok: true, tension: tension };
}

function dipAiApplyDomesticHit(player, unrestHit, legitHit) {
  const touched = [];
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(player) : null;
  if (!dom) return touched;
  if (typeof dom.unrest === "number" && unrestHit > 0) {
    dom.unrest = clamp(dom.unrest + unrestHit, 0, 100);
    touched.push("unrest");
  }
  if (typeof dom.legitimacy === "number" && legitHit > 0) {
    dom.legitimacy = clamp(dom.legitimacy - legitHit, 0, 100);
    touched.push("legitimacy");
  }
  if (typeof dom.congressApproval === "number" && legitHit > 0) {
    dom.congressApproval = clamp(dom.congressApproval - legitHit, 15, 90);
    touched.push("congressApproval");
  }
  return touched;
}

function dipAiApplyReject(aiKey, reason, y, m, silent) {
  const P = dipAiTable();
  if (!P || !ST.player) return { touched: [] };
  const touched = [];
  if (typeof prestigeAdd === "function") {
    prestigeAdd(ST.player, -P.REJECT_PRESTIGE, "空谈遭拒");
    touched.push("prestige");
  }
  touched.push.apply(touched, dipAiApplyDomesticHit(ST.player, P.REJECT_UNREST, P.PRESS_LEGIT));
  const slot = aiDipSlotOf(aiKey);
  slot.lastYm = y * 12 + m;
  slot.lastKind = "reject";
  const aiZh = (CM.countries[aiKey] || {}).zh || aiKey;
  const why = reason === "armed" ? "贵国军备仍在扩张，军控诚意不足"
    : (reason === "sanctions" ? "经贸封锁与军控谈判不可并行"
      : "双边互信赤字过大，空谈无益");
  dipAiRecord("reject", aiZh + "拒绝空谈", { by: aiKey, reason: reason, touched: touched });
  if (!silent && typeof dispatchDiplomaticCable === "function") {
    dispatchDiplomaticCable({
      type: "dip_reject",
      from: aiKey,
      target: ST.player,
      zh: "拒绝空谈 · 拒签军控",
      desc: "【外交破裂】" + aiZh + "拒绝在当前条件下签署军控条约：" + why + "。威望与国内舆论已受冲击。"
    }, y, m, false);
  }
  return { touched: touched, reason: reason };
}

function executeDipAiAction(actor, pick, y, m, silent) {
  const P = dipAiTable();
  if (!P || !pick || !ST.player) return { ok: false, reason: "no-pick" };
  const slot = aiDipSlotOf(actor);
  const actorZh = (CM.countries[actor] || {}).zh || actor;
  const touched = [];

  if (pick.kind === "propose") {
    const s = initDipAiState();
    s.pending = { presetId: pick.presetId, by: actor, y: y, m: m };
    slot.lastYm = y * 12 + m;
    slot.lastKind = "propose";
    slot.proposeCount = (slot.proposeCount || 0) + 1;
    if (typeof prestigeAdd === "function") {
      prestigeAdd(actor, P.PROPOSE_PRESTIGE, "主动提议峰会");
      touched.push("prestige");
    }
    const preset = (window.W1980_AI.SUMMIT_PRESETS || []).find((p) => p.id === pick.presetId);
    const name = preset ? preset.name : pick.presetId;
    dipAiRecord("propose", actorZh + "提议" + name, {
      by: actor, presetId: pick.presetId, tension: pick.tension, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "dip_propose",
        from: actor,
        target: ST.player,
        zh: "主动提议首脑峰会",
        desc: "【外交破冰】" + actorZh + "正式邀请我国最高层出席" + name
          + "。点击顶栏『🕊️峰会』开启谈判 —— 空谈将被拒绝。"
      }, y, m, false);
    }
    return { ok: true, kind: "propose", touched: touched, presetId: pick.presetId };
  }

  if (pick.kind === "press" || pick.kind === "press_unsc") {
    slot.lastYm = y * 12 + m;
    slot.lastKind = pick.kind;
    slot.pressCount = (slot.pressCount || 0) + 1;
    if (typeof prestigeAdd === "function") {
      prestigeAdd(ST.player, -P.PRESS_PRESTIGE, pick.kind === "press_unsc" ? "安理会催票" : "履约加压");
      touched.push("prestige");
    }
    touched.push.apply(touched, dipAiApplyDomesticHit(ST.player, P.PRESS_UNREST, P.PRESS_LEGIT));
    const topic = pick.kind === "press_unsc"
      ? ("安理会 " + (pick.resId || "") + " 仍未表决")
      : ("履约加压 · " + (pick.treatyId || ""));
    dipAiRecord(pick.kind, actorZh + "·" + topic, {
      by: actor, treatyId: pick.treatyId || null, resId: pick.resId || null,
      reason: pick.reason, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: pick.kind === "press_unsc" ? "dip_press_unsc" : "dip_press",
        from: actor,
        target: ST.player,
        zh: pick.kind === "press_unsc" ? "安理会催票照会" : "军控履约加压",
        desc: pick.kind === "press_unsc"
          ? ("【多边催票】" + actorZh + "照会：安理会草案窗口正在关闭，空转将被记入史册。")
          : ("【履约加压】" + actorZh + "警告：贵国正游走于军控红线边缘，立即纠正否则后果自负。")
      }, y, m, false);
    }
    return { ok: true, kind: pick.kind, touched: touched };
  }

  return { ok: false, reason: "unknown-kind" };
}

function updateMonthlyDipAi(y, m, silent) {
  const P = dipAiTable();
  if (!P) return null;
  if (!dipAiActive()) return null;
  initDipAiState();

  for (const k of dipAiActors()) {
    const pick = aiPickDipOp(k, y, m);
    if (!pick) continue;
    if (pick.standDown) {
      dipAiRecord("standDown", (CM.countries[k] || {}).zh + "外交收手", { by: k, reason: pick.reason });
      continue;
    }
    executeDipAiAction(k, pick, y, m, silent);
  }
  return ST.dipAi;
}

function dipAiSnapshot() {
  const s = initDipAiState();
  let proposes = 0, presses = 0, rejects = 0, standDowns = 0;
  for (const e of s.log) {
    if (!e) continue;
    if (e.kind === "propose") proposes++;
    else if (e.kind === "press" || e.kind === "press_unsc") presses++;
    else if (e.kind === "reject") rejects++;
    else if (e.kind === "standDown") standDowns++;
  }
  return {
    active: dipAiActive(),
    pending: s.pending ? { presetId: s.pending.presetId, by: s.pending.by } : null,
    proposes: proposes,
    presses: presses,
    rejects: rejects,
    standDowns: standDowns,
    logLen: s.log.length
  };
}
