"use strict";

// ---- Phase Bloc2：阵营凝聚 / 卫星离心（浅层）---------------------------------
// 第三世界漂移已有；阵营内部此前几乎无杠杆。本模块用确定性浅层规则让凝聚度 /
// 离心压力改既有通道（动荡、军援效率、核可信度加成、照会），补上「铁幕内侧」。
//
// 三条（及以上）规则：
//   1. 卫星离心 —— 卫星动荡/压力高且未获军援 → 凝聚↓、卫星/领袖动荡↑、credBonus↓
//   2. 凝聚维稳 —— 军援卫星或军费到位 → 凝聚↑、卫星动荡↓、credBonus↑、军援效率回升
//   3. 军援空转 —— 凝聚过低且仍有阵营内军援 → aidEff 打折、领袖动荡↑、照会
//   附：经济吃紧收手；MIN_MONTHS 粘性防逐月翻烧饼
//
// 门控与 F2/E2/I2/Cov2/Dip2/N2 同族：只有 ?bloc2probe=1 或真实有玩家局才开；旁观零回写。
// 边界：不把次极推进 aiMajors；不开贸易迷你游戏；不拒签峰会、不碰 DEFCON。
// 不变量：零引擎 RNG、不升存档版本（sanitize 缺省补齐）、史实门白名单。

function blocAiTable() {
  return (typeof window !== "undefined" && window.W1980_BLOC && window.W1980_BLOC.AI_POLICY) || null;
}

function blocAiCamps() {
  return (typeof window !== "undefined" && window.W1980_BLOC && window.W1980_BLOC.CAMPS) || null;
}

function blocAiBlank() {
  const P = blocAiTable();
  return {
    cohesion: P ? P.COHESION_START : 50,
    aidEff: P ? P.AID_EFF_START : 1,
    slots: {},
    log: []
  };
}

function initBlocAiState(force) {
  if (force || !ST.blocAi || typeof ST.blocAi !== "object") ST.blocAi = blocAiBlank();
  const s = ST.blocAi;
  const P = blocAiTable();
  if (typeof s.cohesion !== "number" || !isFinite(s.cohesion)) {
    s.cohesion = P ? P.COHESION_START : 50;
  }
  if (typeof s.aidEff !== "number" || !isFinite(s.aidEff)) {
    s.aidEff = P ? P.AID_EFF_START : 1;
  }
  if (!s.slots || typeof s.slots !== "object") s.slots = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

function sanitizeBlocAiState(d) {
  const s = blocAiBlank();
  const P = blocAiTable();
  if (!d || typeof d !== "object") return s;
  if (typeof d.cohesion === "number" && isFinite(d.cohesion)) {
    s.cohesion = clamp(d.cohesion, P ? P.COHESION_MIN : 0, P ? P.COHESION_MAX : 100);
  }
  if (typeof d.aidEff === "number" && isFinite(d.aidEff)) {
    s.aidEff = clamp(d.aidEff, P ? P.AID_EFF_MIN : 0.45, P ? P.AID_EFF_MAX : 1);
  }
  if (d.slots && typeof d.slots === "object") {
    for (const k in d.slots) {
      if (!CM.countries[k]) continue;
      const raw = d.slots[k];
      if (!raw || typeof raw !== "object") continue;
      s.slots[k] = {
        lastYm: (typeof raw.lastYm === "number" && isFinite(raw.lastYm)) ? Math.round(raw.lastYm) : null,
        lastKind: (typeof raw.lastKind === "string") ? raw.lastKind : null,
        spinCount: (typeof raw.spinCount === "number" && isFinite(raw.spinCount))
          ? Math.max(0, Math.round(raw.spinCount)) : 0,
        glueCount: (typeof raw.glueCount === "number" && isFinite(raw.glueCount))
          ? Math.max(0, Math.round(raw.glueCount)) : 0,
        hollowCount: (typeof raw.hollowCount === "number" && isFinite(raw.hollowCount))
          ? Math.max(0, Math.round(raw.hollowCount)) : 0
      };
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(P ? P.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

function blocAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]bloc2probe=1/.test(location.search));
}

// 玩家所属阵营侧（WEST/EAST）；非铁幕两侧返回 null —— 不硬塞次极进 aiMajors。
function blocAiCampOf(player) {
  const camps = blocAiCamps();
  if (!camps || !player || !CM.countries[player]) return null;
  const b = (typeof blocOf === "function") ? blocOf(player) : CM.countries[player].bloc;
  for (const id in camps) {
    const c = camps[id];
    if (c && Array.isArray(c.blocs) && c.blocs.indexOf(b) >= 0) return id;
  }
  return null;
}

function blocAiSatellites(campId) {
  const camps = blocAiCamps();
  if (!camps || !camps[campId] || !Array.isArray(camps[campId].satellites)) return [];
  return camps[campId].satellites.filter((k) => k && CM.countries[k] && k !== ST.player);
}

function blocAiActors() {
  const player = ST.player;
  if (!player) return [];
  const campId = blocAiCampOf(player);
  if (!campId) return [];
  const camps = blocAiCamps();
  const leader = camps[campId].leader;
  // 以阵营领袖为动作槽键（玩家本人或其领袖侧）；保证旁观空列表。
  return leader ? [leader] : [];
}

function aiBlocSlotOf(k) {
  const s = initBlocAiState();
  if (!s.slots[k] || typeof s.slots[k] !== "object") {
    s.slots[k] = { lastYm: null, lastKind: null, spinCount: 0, glueCount: 0, hollowCount: 0 };
  }
  return s.slots[k];
}

function blocAiRecord(kind, zh, extra) {
  const P = blocAiTable();
  const s = initBlocAiState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const x in extra) e[x] = extra[x];
  s.log.push(e);
  if (s.log.length > (P ? P.LOG_MAX : 24)) s.log.shift();
  return e;
}

// 军援效率乘数：白名单外恒为 1，保证史实路径不动。
function blocAidEff() {
  if (!blocAiActive()) return 1;
  const s = initBlocAiState();
  const P = blocAiTable();
  const v = (typeof s.aidEff === "number" && isFinite(s.aidEff)) ? s.aidEff : 1;
  return clamp(v, P ? P.AID_EFF_MIN : 0.45, P ? P.AID_EFF_MAX : 1);
}

function blocAiSatUnrest(k) {
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(k) : null;
  return (dom && typeof dom.unrest === "number") ? dom.unrest : 0;
}

function blocAiSatStrain(k) {
  return (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;
}

function blocAiIsAiding(sat) {
  if (!Array.isArray(ST.aid)) return false;
  for (let i = 0; i < ST.aid.length; i++) {
    if (ST.aid[i] && ST.aid[i].t === sat) return true;
  }
  return false;
}

function blocAiBlocAidTargets(campId) {
  const sats = blocAiSatellites(campId);
  const out = [];
  if (!Array.isArray(ST.aid)) return out;
  for (let i = 0; i < ST.aid.length; i++) {
    const a = ST.aid[i];
    if (a && sats.indexOf(a.t) >= 0) out.push(a.t);
  }
  return out;
}

function blocAiPickSpinSat(campId, P) {
  const sats = blocAiSatellites(campId);
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < sats.length; i++) {
    const k = sats[i];
    if (blocAiIsAiding(k)) continue;
    const u = blocAiSatUnrest(k);
    const st = blocAiSatStrain(k);
    if (u < P.SPIN_UNREST_MIN && st < P.SPIN_STRAIN_MIN) continue;
    const score = u + st * 40;
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

function blocAiPickGlueSat(campId) {
  const aided = blocAiBlocAidTargets(campId);
  if (aided.length) return aided[0];
  return null;
}

function blocAiAdjustCred(delta) {
  if (!delta || typeof initNukeState !== "function") return false;
  const s = initNukeState();
  s.credBonus = clamp(s.credBonus + delta, -100, 100);
  return true;
}

function blocAiApplyUnrest(cKey, delta) {
  if (!delta) return false;
  const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(cKey) : null;
  if (!dom || typeof dom.unrest !== "number") return false;
  dom.unrest = clamp(dom.unrest + delta, 0, 100);
  return true;
}

// 纯规则选棋：同状态同结果，不碰 RNG。
function aiPickBlocOp(leader, y, m) {
  const P = blocAiTable();
  if (!P || !ST.player) return null;
  const campId = blocAiCampOf(ST.player);
  if (!campId) return null;
  const slot = aiBlocSlotOf(leader);
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(leader) : 0;
  const state = initBlocAiState();

  if (typeof slot.lastYm === "number" && ym - slot.lastYm < P.MIN_MONTHS) return null;

  if (strain >= P.STRAIN_MAX) {
    return { standDown: true, reason: "strain", strain: strain };
  }

  // 规则 1：卫星离心（优先于维稳 —— 裂缝先于黏合）
  const spinSat = blocAiPickSpinSat(campId, P);
  if (spinSat) {
    return {
      kind: "spin", reason: "satellite-pressure", sat: spinSat,
      unrest: blocAiSatUnrest(spinSat), strain: blocAiSatStrain(spinSat)
    };
  }

  // 规则 3：军援空转（凝聚已低且仍向阵营内输血）
  const blocAid = blocAiBlocAidTargets(campId);
  if (state.cohesion <= P.HOLLOW_COHESION_MAX && blocAid.length > 0) {
    return { kind: "hollow", reason: "low-cohesion", sats: blocAid, cohesion: state.cohesion };
  }

  // 规则 2：凝聚维稳
  const glueSat = blocAiPickGlueSat(campId);
  const milOk = (typeof ST.mil === "number" && ST.mil >= P.GLUE_MIL_MIN);
  if (glueSat || milOk) {
    return {
      kind: "glue", reason: glueSat ? "aid-satellite" : "mil-commitment",
      sat: glueSat, mil: ST.mil
    };
  }

  return null;
}

function executeBlocAiAction(leader, pick, y, m, silent) {
  const P = blocAiTable();
  if (!P || !pick || !ST.player) return { ok: false, reason: "no-pick" };
  const slot = aiBlocSlotOf(leader);
  const state = initBlocAiState();
  const touched = [];
  const campId = blocAiCampOf(ST.player);
  const leaderZh = (CM.countries[leader] || {}).zh || leader;

  if (pick.kind === "spin") {
    state.cohesion = clamp(state.cohesion + P.SPIN_COHESION, P.COHESION_MIN, P.COHESION_MAX);
    touched.push("cohesion");
    if (blocAiApplyUnrest(pick.sat, P.SPIN_SAT_UNREST)) touched.push("satUnrest");
    if (blocAiApplyUnrest(ST.player, P.SPIN_LEADER_UNREST)) touched.push("unrest");
    if (blocAiAdjustCred(P.SPIN_CRED)) touched.push("credBonus");
    state.aidEff = clamp(state.aidEff - 0.08, P.AID_EFF_MIN, P.AID_EFF_MAX);
    touched.push("aidEff");
    slot.lastYm = y * 12 + m;
    slot.lastKind = "spin";
    slot.spinCount = (slot.spinCount || 0) + 1;
    const satZh = (CM.countries[pick.sat] || {}).zh || pick.sat;
    blocAiRecord("spin", satZh + "离心压迫", {
      by: leader, sat: pick.sat, cohesion: state.cohesion, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "bloc_spin",
        from: pick.sat,
        target: ST.player,
        zh: "卫星离心警报",
        desc: "【阵营裂缝】" + satZh + "内部压力上升，同盟凝聚下滑。"
          + "军援效率承压，威慑可信度随凝聚一并受损。"
      }, y, m, false);
    }
    return { ok: true, kind: "spin", touched: touched, sat: pick.sat };
  }

  if (pick.kind === "glue") {
    state.cohesion = clamp(state.cohesion + P.GLUE_COHESION, P.COHESION_MIN, P.COHESION_MAX);
    touched.push("cohesion");
    if (pick.sat && blocAiApplyUnrest(pick.sat, P.GLUE_SAT_UNREST)) touched.push("satUnrest");
    if (blocAiAdjustCred(P.GLUE_CRED)) touched.push("credBonus");
    state.aidEff = clamp(state.aidEff + P.GLUE_AID_EFF, P.AID_EFF_MIN, P.AID_EFF_MAX);
    touched.push("aidEff");
    slot.lastYm = y * 12 + m;
    slot.lastKind = "glue";
    slot.glueCount = (slot.glueCount || 0) + 1;
    const satZh = pick.sat ? ((CM.countries[pick.sat] || {}).zh || pick.sat) : "同盟前沿";
    blocAiRecord("glue", leaderZh + "维稳·" + satZh, {
      by: leader, sat: pick.sat || null, cohesion: state.cohesion, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "bloc_glue",
        from: leader,
        target: ST.player,
        zh: "阵营凝聚照会",
        desc: "【同盟黏合】对 " + satZh + " 的承诺与军费到位稳住了阵营。"
          + "凝聚回升，军援效率与威慑可信度同步改善。"
      }, y, m, false);
    }
    return { ok: true, kind: "glue", touched: touched, sat: pick.sat || null };
  }

  if (pick.kind === "hollow") {
    state.aidEff = clamp(P.HOLLOW_AID_EFF, P.AID_EFF_MIN, P.AID_EFF_MAX);
    touched.push("aidEff");
    state.cohesion = clamp(state.cohesion + P.HOLLOW_COHESION, P.COHESION_MIN, P.COHESION_MAX);
    touched.push("cohesion");
    if (blocAiApplyUnrest(ST.player, P.HOLLOW_LEADER_UNREST)) touched.push("unrest");
    if (blocAiAdjustCred(P.HOLLOW_CRED)) touched.push("credBonus");
    slot.lastYm = y * 12 + m;
    slot.lastKind = "hollow";
    slot.hollowCount = (slot.hollowCount || 0) + 1;
    blocAiRecord("hollow", leaderZh + "军援空转", {
      by: leader, sats: pick.sats || [], cohesion: state.cohesion, aidEff: state.aidEff, touched: touched
    });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "bloc_hollow",
        from: leader,
        target: ST.player,
        zh: "军援空转警告",
        desc: "【同盟空转】凝聚过低，流向阵营内侧的军援大量耗散。"
          + "受援增速已被打折，国内舆论开始质询「钱花到哪里去了」。"
      }, y, m, false);
    }
    return { ok: true, kind: "hollow", touched: touched, aidEff: state.aidEff };
  }

  void campId;
  return { ok: false, reason: "unknown-kind" };
}

function updateMonthlyBlocAi(y, m, silent) {
  const P = blocAiTable();
  if (!P) return null;
  if (!blocAiActive()) return null;
  initBlocAiState();

  for (const k of blocAiActors()) {
    const pick = aiPickBlocOp(k, y, m);
    if (!pick) continue;
    if (pick.standDown) {
      blocAiRecord("standDown", (CM.countries[k] || {}).zh + "阵营管理收手", { by: k, reason: pick.reason });
      continue;
    }
    executeBlocAiAction(k, pick, y, m, silent);
  }
  return ST.blocAi;
}

function blocAiSnapshot() {
  const s = initBlocAiState();
  let spins = 0, glues = 0, hollows = 0, standDowns = 0;
  for (const e of s.log) {
    if (!e) continue;
    if (e.kind === "spin") spins++;
    else if (e.kind === "glue") glues++;
    else if (e.kind === "hollow") hollows++;
    else if (e.kind === "standDown") standDowns++;
  }
  return {
    active: blocAiActive(),
    cohesion: s.cohesion,
    aidEff: s.aidEff,
    spins: spins,
    glues: glues,
    hollows: hollows,
    standDowns: standDowns,
    logLen: s.log.length
  };
}
