"use strict";

// ---- R13B: 阿富汗战争泥潭与帝国消耗槽状态机 ----
// Afg2：史实基线 + 偏离计费 + 对手方针（确定性规则，零 RNG）
//   · 旁观 / 白名单外 = 史实轨迹与失血口径一字不变（只对偏离计费）
//   · 玩家/AI 方针改 bleeding / air / resistance，消费者走 pmods / 短缺 / 威望 / 动荡
//   · afghanAiActive() 白名单（?afg2probe=1 或真实有玩家）

function afghanTable() {
  return (typeof window !== "undefined" && window.W1980_AFGHAN) || null;
}

function afghanParams() {
  const A = afghanTable();
  return (A && A.PARAMS) || null;
}

function afghanAiTable() {
  const A = afghanTable();
  return (A && A.AI_POLICY) || null;
}

function initAfghanState() {
  const A = afghanTable();
  const initialBleed = A ? A.calcBleedingCost(105000, 85, false, "standard") : 3.5;
  ST.afghan = {
    troops: 105000,
    bleedingCost: initialBleed,
    historicBleed: initialBleed,
    bleedDev: 0,
    resistance: 65,
    airSuperiority: 85,
    stingerActive: false,
    withdrawn: false,
    withdrawing: false,
    withdrawMonths: 0,
    policy: "standard",
    usaPolicy: "none",
    history: []
  };
  return ST.afghan;
}

function sanitizeAfghanState(d) {
  if (!d || typeof d !== "object") return initAfghanState();
  const usaOk = (d.usaPolicy === "arm_resistance" || d.usaPolicy === "none")
    ? d.usaPolicy : "none";
  return {
    troops: clamp(typeof d.troops === "number" ? d.troops : 105000, 0, 200000),
    bleedingCost: clamp(typeof d.bleedingCost === "number" ? d.bleedingCost : 3.5, 0, 20),
    historicBleed: clamp(typeof d.historicBleed === "number" ? d.historicBleed : 3.5, 0, 20),
    bleedDev: clamp(typeof d.bleedDev === "number" ? d.bleedDev : 0, -20, 20),
    resistance: clamp(typeof d.resistance === "number" ? d.resistance : 65, 0, 100),
    airSuperiority: clamp(typeof d.airSuperiority === "number" ? d.airSuperiority : 85, 0, 100),
    stingerActive: !!d.stingerActive,
    withdrawn: !!d.withdrawn,
    withdrawing: !!d.withdrawing,
    withdrawMonths: clamp(typeof d.withdrawMonths === "number" ? d.withdrawMonths : 0, 0, 24),
    policy: typeof d.policy === "string" ? d.policy : "standard",
    usaPolicy: usaOk,
    history: Array.isArray(d.history) ? d.history.slice(0, 50) : []
  };
}

// ---- Afg2：AI 槽（不升存档版本；sanitize 缺省补齐）----
function afghanAiBlank() {
  return { slots: {}, log: [] };
}

function initAfghanAiState(force) {
  if (force || !ST.afghanAi || typeof ST.afghanAi !== "object") ST.afghanAi = afghanAiBlank();
  const s = ST.afghanAi;
  if (!s.slots || typeof s.slots !== "object") s.slots = {};
  if (!Array.isArray(s.log)) s.log = [];
  return s;
}

function sanitizeAfghanAiState(d) {
  const s = afghanAiBlank();
  const P = afghanAiTable();
  if (!d || typeof d !== "object") return s;
  if (d.slots && typeof d.slots === "object") {
    for (const k in d.slots) {
      if (!CM.countries[k]) continue;
      const raw = d.slots[k];
      if (!raw || typeof raw !== "object") continue;
      s.slots[k] = {
        lastYm: (typeof raw.lastYm === "number" && isFinite(raw.lastYm)) ? Math.round(raw.lastYm) : null,
        lastKind: (typeof raw.lastKind === "string") ? raw.lastKind : null,
        count: (typeof raw.count === "number" && isFinite(raw.count))
          ? Math.max(0, Math.round(raw.count)) : 0
      };
    }
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(P ? P.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

function afghanAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]afg2probe=1/.test(location.search));
}

function afghanContested() {
  return afghanAiActive() && (ST.player === "SUN" || ST.player === "USA");
}

function aiAfghanSlotOf(k) {
  const s = initAfghanAiState();
  if (!s.slots[k] || typeof s.slots[k] !== "object") {
    s.slots[k] = { lastYm: null, lastKind: null, count: 0 };
  }
  return s.slots[k];
}

function afghanAiRecord(kind, zh, extra) {
  const P = afghanAiTable();
  const s = initAfghanAiState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const x in extra) e[x] = extra[x];
  s.log.push(e);
  if (s.log.length > (P ? P.LOG_MAX : 24)) s.log.shift();
  return e;
}

function historicAfghanAt(y, m) {
  const A = afghanTable();
  if (A && typeof A.historicAt === "function") return A.historicAt(y, m);
  return {
    troops: 105000, airSuperiority: 85, resistance: 65, stingerActive: false,
    withdrawn: false, withdrawing: false, withdrawMonths: 0, policy: "standard",
    bleedingCost: 3.5
  };
}

function syncAfghanBleedDev(y, m) {
  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const hist = historicAfghanAt(y, m);
  const histBleed = af.withdrawn ? 0 : (hist.withdrawn ? 0 : hist.bleedingCost);
  af.historicBleed = histBleed;
  // 已撤军：实际与史实都归零 → 偏离 0（和平红利另计）
  if (af.withdrawn) {
    af.bleedDev = 0;
    return 0;
  }
  af.bleedDev = +(af.bleedingCost - histBleed).toFixed(2);
  return af.bleedDev;
}

// 只对偏离史实的失血计费 → pp/年（玩家为苏时走 playerSelfDelta）
function afghanBleedDrag() {
  if (!ST.player || ST.player !== "SUN" || !ST.afghan) return 0;
  const P = afghanParams();
  if (!P) return 0;
  const dev = ST.afghan.bleedDev || 0;
  if (Math.abs(dev) < 1e-9) return 0;
  const raw = -dev * P.BLEED_PP_PER_UNIT;
  return clamp(raw, -P.BLEED_PP_CAP, P.BLEED_PP_CAP);
}

// 非玩家苏方的偏离失血（玩家为美时走 acc）
function accAfghanBleed(acc) {
  if (!ST.player || ST.player === "SUN" || !ST.afghan) return;
  const P = afghanParams();
  if (!P) return;
  const dev = ST.afghan.bleedDev || 0;
  if (Math.abs(dev) < 1e-9) return;
  const raw = -dev * P.BLEED_PP_PER_UNIT;
  const drag = clamp(raw, -P.BLEED_PP_CAP, P.BLEED_PP_CAP);
  if (drag === 0) return;
  for (const k of entKeys("SUN")) acc[k] = (acc[k] || 0) + drag;
}

function applyAfghanPolicyDrift(af) {
  if (!ST.player || af.withdrawn) return;
  const P = afghanParams();
  if (!P) return;
  if (af.policy === "surge") {
    af.resistance = Math.max(P.RES_FLOOR, af.resistance + P.SURGE_RES_DELTA);
    if (ST.domestic && ST.domestic.sun) {
      ST.domestic.sun.shortage = Math.min(100,
        (ST.domestic.sun.shortage || 30) + P.SURGE_SHORTAGE_DRIP);
    }
  } else if (af.policy === "consolidate") {
    af.resistance = Math.min(P.RES_CAP, af.resistance + P.CONS_RES_DELTA);
  }
  if (af.usaPolicy === "arm_resistance") {
    af.resistance = Math.min(P.RES_CAP, af.resistance + P.ARM_RES_DELTA);
    af.airSuperiority = Math.max(P.AIR_FLOOR, af.airSuperiority + P.ARM_AIR_DELTA);
  }
}

function recalcAfghanBleed(af) {
  const A = afghanTable();
  if (!A || af.withdrawn) {
    af.bleedingCost = 0;
    return;
  }
  const pol = (af.withdrawing || af.policy === "geneva_withdraw") ? "standard" : af.policy;
  af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, pol);
}

// 触发史实毒刺节点（若尚未提前）
function maybeHistoricStinger(af, y, m, silent) {
  if (af.stingerActive) return false;
  if (!(y > 1986 || (y === 1986 && m >= 6))) return false;
  af.stingerActive = true;
  af.airSuperiority = 35;
  af.resistance = Math.min(95, af.resistance + 15);
  af.history.push({
    y: y, m: m, event: "stinger_deployed",
    note: "中情局旋风行动毒刺防空导弹秘密入阿，苏军米-24雌鹿直升机空优被打破！"
  });
  if (!silent && !CR.probeMode && (ST.player === "SUN" || ST.player === "USA")) {
    toast({ zh: "【战地加急：毒刺入阿】", note: "阿富汗游击队装备美制毒刺单兵防空导弹，苏军直升机与运输机战损激增！" });
  }
  return true;
}

// 旁观 / 非苏联玩家 / 白名单外：史实日历撤军（与 Hyg 前逐位同构）
function advanceAfghanHistorical(af, y, m, A) {
  if (af.withdrawn) return;
  if (y > 1988 || (y === 1988 && m >= 5)) {
    af.withdrawing = true;
    if (y > 1989 || (y === 1989 && m >= 2)) {
      af.withdrawn = true;
      af.withdrawing = false;
      af.troops = 0;
      af.bleedingCost = 0;
      af.history.push({
        y: 1989, m: 2, event: "withdrawn_historical",
        note: "格罗莫夫中将率部走过阿姆河友谊桥，苏军完成全部撤军！"
      });
    } else {
      const monthsPassed = (y - 1988) * 12 + (m - 5) + 1;
      af.withdrawMonths = Math.min(9, monthsPassed);
      af.troops = Math.max(0, 105000 - Math.round((105000 / 9) * af.withdrawMonths));
      af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
    }
  } else {
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
  }
}

// 苏方撤军推进（玩家或 AI 启动的日内瓦程序）
function advanceAfghanWithdrawal(af, y, m, A, silent, tag) {
  if (!af.withdrawing || af.withdrawn) return;
  af.withdrawMonths++;
  af.troops = Math.max(0, af.troops - Math.round(105000 / 9));
  af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, af.policy);
  if (af.withdrawMonths >= 9 || af.troops <= 0) {
    af.withdrawn = true;
    af.withdrawing = false;
    af.troops = 0;
    af.bleedingCost = 0;
    af.history.push({
      y: y, m: m, event: tag || "withdrawn_player",
      note: "友谊桥撤军圆满完成！终结阿富汗泥潭，释放 +0.35pp/年 和平红利！"
    });
    applyPlayerDecisions();
    if (!silent && !CR.probeMode && ST.player === "SUN") {
      toast({ zh: "【友谊桥撤军完成】", note: "最后一批苏军官兵跨过阿姆河友谊桥，彻底止血，释放 +0.35pp 和平红利！" });
    }
  }
}

function updateMonthlyAfghan(y, m, silent) {
  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const A = afghanTable();
  if (!A) return;

  maybeHistoricStinger(af, y, m, silent);

  const contested = afghanContested();
  const isPlayerSun = (ST.player === "SUN");

  if (!isPlayerSun && !(contested && ST.player === "USA")) {
    // 旁观 / 非美苏玩家 / 白名单外的美方局：史实基准
    advanceAfghanHistorical(af, y, m, A);
  } else if (isPlayerSun || (contested && ST.player === "USA")) {
    // 苏方由玩家（或美方局下的 AI 方针）控制
    if (af.withdrawing && !af.withdrawn) {
      advanceAfghanWithdrawal(af, y, m, A, silent,
        isPlayerSun ? "withdrawn_player" : "withdrawn_ai");
    } else if (!af.withdrawn) {
      // 可争夺局：方针月度漂移（改 air / resistance / 短缺）
      if (contested) applyAfghanPolicyDrift(af);
      recalcAfghanBleed(af);
    }
  }

  syncAfghanBleedDev(y, m);

  if (ST.sel && typeof refreshAfghanBox === "function") {
    refreshAfghanBox(ST.sel);
  }
}

function setAfghanPolicy(policyId) {
  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const A = afghanTable();

  if (policyId === "stinger_supply") {
    if (af.stingerActive) {
      toast({ zh: "【已部署】", note: "毒刺防空导弹已全面扩散，无需重复部署。" });
      return { ok: false, error: "ALREADY_ACTIVE" };
    }
    af.stingerActive = true;
    af.airSuperiority = 35;
    af.resistance = Math.min(95, af.resistance + 15);
    af.history.push({
      y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1,
      event: "stinger_supplied_by_player",
      note: "中情局【旋风行动】提前将毒刺防空导弹秘密运抵阿富汗，重创苏军空中优势！"
    });
    toast({ zh: "【旋风行动出击】", note: "成功向圣战者游击队交付 500 枚毒刺便携防空导弹，苏军直升机空优被打破！" });
    if (ST.player === "USA" && typeof prestigeAdd === "function" && afghanAiTable()) {
      prestigeAdd("USA", afghanAiTable().STINGER_PRESTIGE || 0.55, "旋风行动提前毒刺");
    }
    syncAfghanBleedDev(SIM.S ? SIM.S.year : 1980, SIM.S ? SIM.S.month : 1);
    if (ST.sel) refreshAfghanBox(ST.sel);
    return { ok: true, policy: "stinger_supply" };
  }

  if (policyId === "arm_resistance") {
    if (ST.player !== "USA") {
      toast({ zh: "【权限受限】", note: "仅美方统帅部可授权中情局扩大对圣战者的军援。" });
      return { ok: false, error: "NOT_USA_PLAYER" };
    }
    if (af.withdrawn) {
      toast({ zh: "【战区已变】", note: "苏军已撤离，武装抵抗指令不再适用。" });
      return { ok: false, error: "ALREADY_WITHDRAWN" };
    }
    af.usaPolicy = "arm_resistance";
    const P = afghanParams();
    if (P) {
      af.resistance = Math.min(P.RES_CAP, af.resistance + P.ARM_RES_DELTA * 2);
      af.airSuperiority = Math.max(P.AIR_FLOOR, af.airSuperiority + P.ARM_AIR_DELTA * 2);
    }
    recalcAfghanBleed(af);
    af.history.push({
      y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1,
      event: "arm_resistance",
      note: "中情局扩大对圣战者的轻武器与防空弹药输送，游击烈度上升！"
    });
    toast({ zh: "【武装圣战者】", note: "扩大军援已到位：抵抗烈度上升，苏军空优继续承压。" });
    syncAfghanBleedDev(SIM.S ? SIM.S.year : 1980, SIM.S ? SIM.S.month : 1);
    if (ST.sel) refreshAfghanBox(ST.sel);
    return { ok: true, policy: "arm_resistance" };
  }

  if (ST.player !== "SUN") {
    toast({ zh: "【权限受限】", note: "仅苏联最高统帅部有权调整驻阿第 40 集团军战区战略。" });
    return { ok: false, error: "NOT_SOVIET_PLAYER" };
  }

  if (af.withdrawn) {
    toast({ zh: "【已撤军】", note: "苏军已全部撤离阿富汗战区，该战略不再适用。" });
    return { ok: false, error: "ALREADY_WITHDRAWN" };
  }

  if (policyId === "geneva_withdraw") {
    if (af.withdrawing) {
      toast({ zh: "【撤军中】", note: "日内瓦撤军程序正在推进中。" });
      return { ok: false, error: "ALREADY_WITHDRAWING" };
    }
    af.withdrawing = true;
    af.withdrawMonths = 0;
    af.policy = "geneva_withdraw";
    af.history.push({
      y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1,
      event: "geneva_withdrawal_started",
      note: "最高苏维埃正式签署日内瓦停火协议，全面启动阿姆河友谊桥撤军！"
    });
    toast({ zh: "【签署日内瓦协议】", note: "苏军驻阿第 40 集团军启动为期 9 个月的分阶段体面撤军！" });
  } else if (policyId === "surge") {
    af.policy = "surge";
    af.troops = Math.min(135000, af.troops + 20000);
    af.resistance = Math.max(30, af.resistance - 15);
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "surge");
    if (ST.domestic && ST.domestic.sun) {
      ST.domestic.sun.shortage = Math.min(100, (ST.domestic.sun.shortage || 30) + 6);
    }
    af.history.push({
      y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1,
      event: "surge_launched",
      note: "向兴都库什山脉增派 2 万精锐空降师展开铁拳扫荡！"
    });
    toast({ zh: "【增兵扫荡攻势】", note: "增援部队已抵达战区，压制游击武装，但财政失血与国内物资短缺加剧。" });
  } else if (policyId === "consolidate") {
    af.policy = "consolidate";
    af.troops = Math.max(70000, af.troops - 15000);
    af.resistance = Math.min(90, af.resistance + 10);
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "consolidate");
    af.history.push({
      y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1,
      event: "consolidated_bases",
      note: "撤出高危外围哨所，主力收缩固守喀布尔、巴格拉姆与萨朗隧道交通线。"
    });
    toast({ zh: "【战术收缩防卫】", note: "部队收缩至主要城市与核心交通线，减少非必要战损与财政消耗。" });
  } else {
    af.policy = "standard";
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
  }

  syncAfghanBleedDev(SIM.S ? SIM.S.year : 1980, SIM.S ? SIM.S.month : 1);
  if (ST.sel) refreshAfghanBox(ST.sel);
  return { ok: true, policy: af.policy };
}

// ---- Afg2：确定性选棋（同状态同结果，不碰 RNG）----
function aiPickAfghanOp(actor, y, m) {
  const P = afghanAiTable();
  if (!P || !ST.player || !ST.afghan) return null;
  const af = ST.afghan;
  if (af.withdrawn) return null;
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  const slot = aiAfghanSlotOf(actor);
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(actor) : 0;

  if (typeof slot.lastYm === "number" && ym - slot.lastYm < P.MIN_MONTHS) return null;
  if (strain >= P.STRAIN_MAX) {
    return { standDown: true, reason: "strain", strain: strain };
  }

  if (actor === "USA" && ST.player === "SUN") {
    // 规则 1：苏军空优仍高且毒刺未入 → 提前旋风行动
    const beforeHistoric = (yy < 1986 || (yy === 1986 && mm < 6));
    if (beforeHistoric && !af.stingerActive && af.airSuperiority >= P.STINGER_AIR_MIN) {
      return { kind: "stinger_early", reason: "air-high" };
    }
    // 规则 2：毒刺后 / 苏军增兵时 → 武装抵抗
    if (!af.withdrawn && af.usaPolicy !== "arm_resistance"
      && af.resistance < P.ARM_RES_MAX
      && (af.stingerActive || af.policy === "surge")) {
      return { kind: "arm_resistance", reason: "pressure" };
    }
    // 规则 3：苏军高失血仍赖着 → 外交施压
    if (af.bleedingCost >= P.PRESS_BLEED_MIN && (af.policy === "consolidate" || af.policy === "standard")) {
      return { kind: "press", reason: "bleed-high" };
    }
    return null;
  }

  if (actor === "SUN" && ST.player === "USA") {
    // 规则 1：失血极高或晚期空优崩 → 日内瓦
    if (!af.withdrawing && (
      af.bleedingCost >= P.GENEVA_BLEED_MIN
      || (yy >= P.GENEVA_YEAR_MIN && af.airSuperiority <= P.GENEVA_AIR_MAX
        && af.resistance >= P.GENEVA_RES_MIN)
    )) {
      return { kind: "geneva_withdraw", reason: "quagmire" };
    }
    // 规则 2：失血高或空优崩 → 收缩
    if (af.policy !== "consolidate" && !af.withdrawing
      && (af.bleedingCost >= P.CONS_BLEED_MIN || af.airSuperiority <= P.CONS_AIR_MAX)) {
      return { kind: "consolidate", reason: "bleed-or-air" };
    }
    // 规则 3：早期抵抗高且毒刺未入 → 增兵扫荡
    if (af.policy !== "surge" && !af.stingerActive && !af.withdrawing
      && af.resistance >= P.SURGE_RES_MIN && yy < 1986) {
      return { kind: "surge", reason: "early-pressure" };
    }
    return null;
  }

  return null;
}

function executeAfghanAiAction(actor, pick, y, m, silent) {
  const P = afghanAiTable();
  if (!P || !pick || !ST.player || !ST.afghan) return { ok: false, reason: "no-pick" };
  const af = ST.afghan;
  const slot = aiAfghanSlotOf(actor);
  const actorZh = (CM.countries[actor] || {}).zh || actor;
  const touched = [];

  const mark = (kind) => {
    slot.lastYm = y * 12 + m;
    slot.lastKind = kind;
    slot.count = (slot.count || 0) + 1;
  };

  if (pick.kind === "stinger_early") {
    if (af.stingerActive) return { ok: false, reason: "already" };
    af.stingerActive = true;
    af.airSuperiority = 35;
    af.resistance = Math.min(95, af.resistance + 15);
    recalcAfghanBleed(af);
    if (typeof prestigeAdd === "function") {
      prestigeAdd("USA", P.STINGER_PRESTIGE, "AI 旋风行动提前毒刺");
      touched.push("prestige");
    }
    touched.push("air", "resistance", "bleeding");
    af.history.push({
      y: y, m: m, event: "stinger_ai_early",
      note: "美方提前启动旋风行动，毒刺入阿打破苏军空优！"
    });
    mark("stinger_early");
    afghanAiRecord("stinger_early", actorZh + "提前投放毒刺", { by: actor, touched: touched });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "afghan_stinger",
        from: actor,
        target: ST.player,
        zh: "旋风行动加急",
        desc: "【阿富汗】" + actorZh + "提前向圣战者交付毒刺防空导弹，苏军空优已被打破。"
      }, y, m, false);
    }
    syncAfghanBleedDev(y, m);
    return { ok: true, kind: "stinger_early", touched: touched };
  }

  if (pick.kind === "arm_resistance") {
    af.usaPolicy = "arm_resistance";
    const Par = afghanParams();
    if (Par) {
      af.resistance = Math.min(Par.RES_CAP, af.resistance + Par.ARM_RES_DELTA * 2);
      af.airSuperiority = Math.max(Par.AIR_FLOOR, af.airSuperiority + Par.ARM_AIR_DELTA * 2);
    }
    recalcAfghanBleed(af);
    touched.push("air", "resistance", "bleeding");
    af.history.push({
      y: y, m: m, event: "arm_resistance_ai",
      note: "美方扩大对圣战者军援，游击烈度上升。"
    });
    mark("arm_resistance");
    afghanAiRecord("arm_resistance", actorZh + "武装抵抗", { by: actor, touched: touched });
    syncAfghanBleedDev(y, m);
    return { ok: true, kind: "arm_resistance", touched: touched };
  }

  if (pick.kind === "press") {
    if (typeof prestigeAdd === "function") {
      prestigeAdd("SUN", -P.PRESS_PRESTIGE, "阿富汗泥潭外交施压");
      touched.push("prestige");
    }
    if (typeof polEconDomesticOf === "function") {
      const dom = polEconDomesticOf("SUN");
      if (dom && typeof dom.unrest === "number") {
        dom.unrest = clamp(dom.unrest + P.PRESS_UNREST, 0, 100);
        touched.push("unrest");
      }
    }
    mark("press");
    afghanAiRecord("press", actorZh + "就阿富汗施压", { by: actor, touched: touched });
    if (!silent && typeof dispatchDiplomaticCable === "function") {
      dispatchDiplomaticCable({
        type: "afghan_press",
        from: actor,
        target: ST.player,
        zh: "阿富汗照会",
        desc: "【阿富汗】" + actorZh + "照会：继续陷在兴都库什只会失血与孤立。威望与国内舆论已受冲击。"
      }, y, m, false);
    }
    return { ok: true, kind: "press", touched: touched };
  }

  if (pick.kind === "surge" || pick.kind === "consolidate" || pick.kind === "geneva_withdraw") {
    // 复用玩家方针入口（无 toast 打扰：临时静音 toast 不可靠，直接改状态）
    const savedPlayer = ST.player;
    ST.player = "SUN";
    const res = setAfghanPolicy(pick.kind);
    ST.player = savedPlayer;
    if (!res || !res.ok) return { ok: false, reason: res && res.error };
    touched.push("bleeding", "resistance", "troops");
    mark(pick.kind);
    afghanAiRecord(pick.kind, actorZh + "调整驻阿方针：" + pick.kind, {
      by: actor, reason: pick.reason, touched: touched
    });
    syncAfghanBleedDev(y, m);
    return { ok: true, kind: pick.kind, touched: touched };
  }

  return { ok: false, reason: "unknown-kind" };
}

function updateMonthlyAfghanAi(y, m, silent) {
  const P = afghanAiTable();
  if (!P) return null;
  if (!afghanAiActive()) return null;
  if (!afghanContested()) return null;
  if (!ST.afghan || ST.afghan.withdrawn) return null;
  initAfghanAiState();

  const actors = [];
  if (ST.player === "SUN") actors.push("USA");
  if (ST.player === "USA") actors.push("SUN");

  for (const k of actors) {
    const pick = aiPickAfghanOp(k, y, m);
    if (!pick) continue;
    if (pick.standDown) {
      afghanAiRecord("standDown", (CM.countries[k] || {}).zh + "阿富汗收手", { by: k, reason: pick.reason });
      continue;
    }
    executeAfghanAiAction(k, pick, y, m, silent);
  }
  return ST.afghanAi;
}

function afghanAiSnapshot() {
  const s = initAfghanAiState();
  let stingers = 0, arms = 0, presses = 0, surges = 0, cons = 0, genevas = 0, standDowns = 0;
  for (const e of s.log) {
    if (!e) continue;
    if (e.kind === "stinger_early") stingers++;
    else if (e.kind === "arm_resistance") arms++;
    else if (e.kind === "press") presses++;
    else if (e.kind === "surge") surges++;
    else if (e.kind === "consolidate") cons++;
    else if (e.kind === "geneva_withdraw") genevas++;
    else if (e.kind === "standDown") standDowns++;
  }
  return {
    active: afghanAiActive(),
    contested: afghanContested(),
    stingers: stingers,
    arms: arms,
    presses: presses,
    surges: surges,
    cons: cons,
    genevas: genevas,
    standDowns: standDowns,
    logLen: s.log.length,
    bleedDev: ST.afghan ? ST.afghan.bleedDev : 0
  };
}

function refreshAfghanBox(selKey) {
  const box = $("p-afghan-box");
  if (!box) return;

  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const A = afghanTable();
  const y = SIM.S ? SIM.S.year : 1980;
  const m = SIM.S ? SIM.S.month : 1;
  const phase = A ? A.getPhase(y, m) : { name: "阿富汗战役态势", desc: "" };

  let h = '<div class="afghan-hd">';
  h += '<span class="afghan-title"><span>🏔️</span>阿富汗战区态势 · 帝国失血槽</span>';
  h += '<span class="afghan-code">40TH ARMY // KABUL-HQ</span>';
  h += '</div>';

  h += '<div style="display:flex;justify-content:space-between;align-items:center">';
  h += '<span class="afghan-phase-badge">' + phase.name + '</span>';
  h += '<span style="font-size:10px;color:#8b949e">' + (af.withdrawn ? '已终结撤出' : (af.withdrawing ? '友谊桥撤军中' : '交战相持中')) + '</span>';
  h += '</div>';
  h += '<div class="afghan-phase-desc">' + phase.desc + '</div>';

  h += '<div class="afghan-stats-grid">';
  h += '<div class="afghan-stat-card"><span>🎖️ 驻阿兵力</span><span class="afghan-stat-val">' + (af.withdrawn ? '0 (已撤离)' : (af.troops.toLocaleString() + ' 人')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>🩸 月度失血槽</span><span class="afghan-stat-val" style="color:' + (af.withdrawn ? '#56d364' : '#ff7b72') + '">' + (af.withdrawn ? '$0.0 亿' : ('$' + af.bleedingCost + ' 亿')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>🚁 制空权优势</span><span class="afghan-stat-val" style="color:' + (af.airSuperiority > 50 ? '#56d364' : '#d29922') + '">' + (af.withdrawn ? '—' : (af.airSuperiority + '%')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>⚔️ 游击队烈度</span><span class="afghan-stat-val">' + (af.withdrawn ? '政权孤守' : (af.resistance + '%')) + '</span></div>';
  h += '</div>';

  if (!af.withdrawn && typeof af.bleedDev === "number" && Math.abs(af.bleedDev) > 0.01) {
    const sign = af.bleedDev > 0 ? "+" : "";
    h += '<div style="font-size:10.5px;color:#d29922;padding:4px 6px">偏离史实失血 ' + sign + af.bleedDev.toFixed(2)
      + ' 亿/月（仅偏离计费）</div>';
  }

  if (af.stingerActive && !af.withdrawn) {
    h += '<div class="afghan-alert-bar"><span>🚨 警报：敌方列装 FIM-92 毒刺防空导弹，苏军低空掩护遭严重压制！</span></div>';
  } else if (!af.withdrawn) {
    h += '<div class="afghan-alert-bar afghan-alert-safe"><span>🛡️ 态势：苏军米-24 雌鹿直升机维持空中火力优势与交通线掩护。</span></div>';
  }

  if (af.withdrawing || af.withdrawn) {
    const pct = af.withdrawn ? 100 : Math.round((af.withdrawMonths / 9) * 100);
    h += '<div class="afghan-withdraw-box">';
    h += '<div class="afghan-withdraw-title"><span>🌉 阿姆河友谊桥大撤军进度：</span><b style="color:#f0f6fc">' + pct + '% (' + (af.withdrawn ? '完成' : (af.withdrawMonths + '/9 月')) + ')</b></div>';
    h += '<div class="afghan-withdraw-bar"><div class="afghan-withdraw-fill" style="width:' + pct + '%"></div></div>';
    h += '</div>';
  }

  h += '<div class="afghan-policies">';
  if (ST.player === "SUN" && !af.withdrawn) {
    const isSurge = af.policy === "surge";
    const isCons = af.policy === "consolidate";
    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">⚡ 派驻精锐增援部队扫荡</span><span class="afghan-pol-badge">兵力+2万 | 失血+$1.5亿</span></div>';
    h += '<div class="afghan-pol-desc">向山地派驻增援重兵压制游击队，但加剧国内物资短缺与财政消耗。</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (isSurge ? '当前生效中' : '') + '</span><button class="afghan-pol-btn" data-act="surge" ' + (isSurge || af.withdrawing ? 'disabled' : '') + '>下达指令</button></div>';
    h += '</div>';

    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🛡️ 战术收缩·固守核心要点</span><span class="afghan-pol-badge">兵力-1.5万 | 失血-$1.0亿</span></div>';
    h += '<div class="afghan-pol-desc">撤出边远偏僻高危哨所，收缩固守喀布尔、巴格拉姆与萨朗隧道。</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (isCons ? '当前生效中' : '') + '</span><button class="afghan-pol-btn" data-act="consolidate" ' + (isCons || af.withdrawing ? 'disabled' : '') + '>下达指令</button></div>';
    h += '</div>';

    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🕊️ 签署日内瓦协议·友谊桥大撤军</span><span class="afghan-pol-badge" style="color:#56d364">和平红利 +0.35pp</span></div>';
    h += '<div class="afghan-pol-desc">签署日内瓦停火协议，开启 9 个月撤军程序。彻底摆脱失血泥潭并释放和平红利！</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (af.withdrawing ? '撤军进行中' : '') + '</span><button class="afghan-pol-btn" data-act="geneva_withdraw" ' + (af.withdrawing ? 'disabled' : '') + '>签署撤军</button></div>';
    h += '</div>';
  } else if (ST.player === "USA" && !af.withdrawn) {
    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🚀 【旋风行动】运送毒刺防空导弹</span><span class="afghan-pol-badge">中情局援助</span></div>';
    h += '<div class="afghan-pol-desc">秘密向圣战者游击队运送 FIM-92 便携防空导弹，击落敌方战机，打破苏军空中优势！</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:' + (af.stingerActive ? '#56d364' : '#8b949e') + '">' + (af.stingerActive ? '✔ 毒刺已部署' : '尚未投入') + '</span><button class="afghan-pol-btn" data-act="stinger_supply" ' + (af.stingerActive ? 'disabled' : '') + '>执行行动</button></div>';
    h += '</div>';

    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🔫 扩大武装圣战者</span><span class="afghan-pol-badge">抵抗↑ | 空优↓</span></div>';
    h += '<div class="afghan-pol-desc">持续扩大轻武器与弹药输送，抬升游击烈度并继续侵蚀苏军制空权。</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (af.usaPolicy === "arm_resistance" ? '当前生效中' : '') + '</span><button class="afghan-pol-btn" data-act="arm_resistance" ' + (af.usaPolicy === "arm_resistance" ? 'disabled' : '') + '>下达指令</button></div>';
    h += '</div>';
  } else if (af.withdrawn) {
    h += '<div style="font-size:11px;color:#56d364;padding:6px 8px;background:#0d1117;border-radius:3px">✔ 苏军已全线跨过阿姆河友谊桥撤离阿富汗，战区失血槽已彻底归零。</div>';
  } else {
    h += '<div style="font-size:10.5px;color:#8b949e;padding:6px 8px;background:#0d1117;border-radius:3px">🔭 驻阿第 40 集团军按冷战史实轨道演进中（旁观模式零漂移）。</div>';
  }
  h += '</div>';

  box.innerHTML = h;

  box.querySelectorAll(".afghan-pol-btn").forEach((btn) => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      setAfghanPolicy(act);
    };
  });
}

// ---- R13B: 阿富汗战争泥潭与帝国消耗槽全链路专用探针 ----
function runAfghanProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AFGHANPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 数据库完备性
    assert("afghanDbLoaded", !!window.W1980_AFGHAN && Array.isArray(window.W1980_AFGHAN.PHASES), "W1980_AFGHAN 数据库已就绪");
    assert("phasesCount5", window.W1980_AFGHAN.PHASES.length === 5, "包含 5 大战役阶段");
    assert("phaseStalemateDefined", !!window.W1980_AFGHAN.getPhase(1980, 5), "1980 初期山地扫荡阶段有效");
    assert("phaseStingerDefined", window.W1980_AFGHAN.getPhase(1986, 8).id === "stinger_1986", "1986 毒刺转折阶段有效");
    assert("phaseWithdrawalDefined", window.W1980_AFGHAN.getPhase(1988, 10).id === "withdrawal_1988", "1988 友谊桥撤军阶段有效");
    assert("phasePostSovietDefined", window.W1980_AFGHAN.getPhase(1990, 5).id === "post_soviet_1989", "1990 后苏残局阶段有效");

    // 2. 状态机与核心函数
    assert("initAfghanStateExists", typeof initAfghanState === "function", "initAfghanState 存在");
    assert("sanitizeAfghanStateExists", typeof sanitizeAfghanState === "function", "sanitizeAfghanState 存在");
    assert("updateMonthlyAfghanExists", typeof updateMonthlyAfghan === "function", "updateMonthlyAfghan 存在");
    assert("setAfghanPolicyExists", typeof setAfghanPolicy === "function", "setAfghanPolicy 存在");
    assert("refreshAfghanBoxExists", typeof refreshAfghanBox === "function", "refreshAfghanBox 存在");

    // 3. DOM 挂载检查
    const afBox = $("p-afghan-box");
    assert("afghanBoxInDom", !!afBox, "#p-afghan-box 存在于 DOM");
    const defPane = $("p-pane-defense");
    assert("defensePaneContainsAfghanBox", !!defPane && defPane.contains(afBox), "控制台挂载在国防与干预选项卡");

    // 4. 初始状态与数值计算
    initAfghanState();
    assert("initialTroops105k", ST.afghan.troops === 105000, "初始第 40 集团军兵力 10.5 万人");
    assert("initialBleedingCost", ST.afghan.bleedingCost > 3.0 && ST.afghan.bleedingCost < 4.0, "初始月度失血槽约 $3.5 亿/月");
    assert("initialAirSuperiority", ST.afghan.airSuperiority === 85, "初始米-24 雌鹿空优 85%");
    assert("initialStingerFalse", ST.afghan.stingerActive === false, "初始毒刺尚未入阿");

    // 5. 1986 毒刺事件自动触发
    updateMonthlyAfghan(1986, 6, true);
    assert("stingerTriggeredIn1986", ST.afghan.stingerActive === true, "1986-06 自动触发毒刺导弹转折");
    assert("airSuperiorityDropped", ST.afghan.airSuperiority === 35, "毒刺入阿后空优骤降至 35%");
    assert("resistanceIncreased", ST.afghan.resistance > 70, "游击队抵抗烈度上升");

    // 6. 苏联玩家策略：增兵扫荡
    ST.player = "SUN";
    setAfghanPolicy("surge");
    assert("surgeTroopsIncreased", ST.afghan.troops === 125000, "增兵扫荡增调 2 万精锐部队");
    assert("surgeBleedingCostHigher", ST.afghan.bleedingCost > 4.5, "增兵后月度失血成本增加");

    // 7. 苏联玩家策略：战术收缩
    setAfghanPolicy("consolidate");
    assert("consolidateTroopsReduced", ST.afghan.troops === 110000, "要点收缩撤出外围哨所");
    assert("consolidateBleedingLower", ST.afghan.bleedingCost < 4.5, "收缩后失血成本降低");

    // 8. 苏联玩家策略：日内瓦撤军
    setAfghanPolicy("geneva_withdraw");
    assert("withdrawingTrue", ST.afghan.withdrawing === true, "启动友谊桥撤军程序");
    for (let m = 1; m <= 9; m++) {
      updateMonthlyAfghan(1988, m, true);
    }
    assert("withdrawnCompleted", ST.afghan.withdrawn === true && ST.afghan.troops === 0, "9 个月后撤军彻底完成且兵力归零");
    assert("bleedingCostZeroAfterWithdrawal", ST.afghan.bleedingCost === 0, "撤军后帝国失血槽彻底归零");

    // 9. 和平红利释放断言
    applyPlayerDecisions();
    assert("peaceDividendInjected", W1980_SIM.pmap(SIM.S).SUN === 0.35, "苏联玩家撤军后释放 +0.35pp 和平红利");

    // 10. 美方旋风行动
    initAfghanState();
    ST.player = "USA";
    const stingerRes = setAfghanPolicy("stinger_supply");
    assert("usaStingerSupplySuccess", stingerRes.ok === true && ST.afghan.stingerActive === true, "美方可提前启动旋风行动运送毒刺导弹");

    // 11. 界面渲染断言
    refreshAfghanBox("SUN");
    assert("uiRendersAfghanTitle", afBox.innerHTML.includes("阿富汗战区态势") && afBox.innerHTML.includes("40TH ARMY"), "控制台标题与集团军编号渲染成功");
    assert("uiRendersStatsGrid", afBox.innerHTML.includes("月度失血槽") && afBox.innerHTML.includes("制空权优势"), "四宫格失血与战备指标渲染成功");

    // 12. 旁观模式零漂移铁律
    ST.player = null;
    ST.mil = 0;
    initAfghanState();
    applyPlayerDecisions();
    const pmodsSpectator = Object.keys(W1980_SIM.pmap(SIM.S)).length;
    assert("spectatorZeroPmods", pmodsSpectator === 0, "旁观模式绝对 0 pmods 注入，保障零漂移");

    // 13. simSave / simLoad 往返忠实度
    ST.afghan.troops = 92000;
    ST.afghan.bleedingCost = 3.8;
    ST.afghan.stingerActive = true;
    simSave();
    ST.afghan = null;
    assert("afghanNullifiedBeforeLoad", ST.afghan === null, "读档前清空内存状态");
    simLoad();
    assert("simSaveLoadRoundTrip", ST.afghan && ST.afghan.troops === 92000 && Math.abs(ST.afghan.bleedingCost - 3.8) < 0.05 && ST.afghan.stingerActive === true, "simSave/simLoad 100% 无损还原阿富汗战争状态");

    // 复原环境
    ST.player = null;
    ST.mil = 0;
    initAfghanState();
    applyPlayerDecisions();
    refreshAfghanBox(ST.sel);
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "afghanprobe"; d.style.display = "none";
  d.textContent = "AFGHANPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
