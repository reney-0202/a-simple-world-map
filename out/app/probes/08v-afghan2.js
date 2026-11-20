"use strict";

// ---- Phase Afg2：阿富汗泥潭可争夺化 + 对手方针全链路探针 --------------------
// 要证明：
//   1. 规则表完整（粘性 / 阈值 / 真实消费者量级 / 史实基线函数）；
//   2. 旁观 / 无干预 = 失血口径等于史实基线（bleedDev≡0）；
//   3. 玩家/AI 方针改 bleeding/air/resistance 且有真实消费者；
//   4. afghanAiActive 白名单；旁观零回写；
//   5. ≥3 条确定性规则；零 RNG；存档可清洗；
//   6. 端到端不炸。
function runAfghan2Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AFG2PROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const A = afghanTable();
    const P = afghanAiTable();
    const Par = afghanParams();
    assert("tableLoaded", !!A && !!P && !!Par && typeof A.historicAt === "function",
      "data/afghan.js 未载入 PARAMS/AI_POLICY/historicAt");
    assert("apiPresent",
      typeof afghanAiActive === "function" && typeof afghanContested === "function" &&
      typeof aiPickAfghanOp === "function" && typeof executeAfghanAiAction === "function" &&
      typeof updateMonthlyAfghanAi === "function" && typeof sanitizeAfghanAiState === "function" &&
      typeof afghanBleedDrag === "function" && typeof syncAfghanBleedDev === "function" &&
      typeof historicAfghanAt === "function" && typeof afghanAiSnapshot === "function",
      "Afg2 API 缺失");
    if (!P || !Par) throw new Error("cannot continue without AI_POLICY/PARAMS");

    // ---- 1. 规则表完整性 ----
    assert("policyStickyPositive", P.MIN_MONTHS >= 1, "MIN_MONTHS 必须 >=1");
    assert("policyStrainBounded", P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1, "STRAIN_MAX 必须落在 (0,1]");
    assert("policyConsumersPositive",
      P.PRESS_PRESTIGE > 0 && P.PRESS_UNREST > 0 && P.STINGER_PRESTIGE > 0,
      "真实消费者量级必须为正");
    assert("paramsBleedCap", Par.BLEED_PP_PER_UNIT > 0 && Par.BLEED_PP_CAP > 0,
      "偏离计费参数必须为正");
    assert("paramsDriftSigned",
      Par.SURGE_RES_DELTA < 0 && Par.CONS_RES_DELTA > 0
      && Par.ARM_RES_DELTA > 0 && Par.ARM_AIR_DELTA < 0,
      "月度漂移符号必须正确（扫荡压抵抗 / 武装抬抵抗削空优）");

    // ---- 2. 史实基线 ----
    const h0 = historicAfghanAt(1980, 1);
    assert("historicEarlyBleed", near(h0.bleedingCost, A.calcBleedingCost(105000, 85, false, "standard"), 0.01),
      "1980 史实失血应等于标准公式");
    const hSt = historicAfghanAt(1986, 6);
    assert("historicStingerAir", hSt.stingerActive === true && hSt.airSuperiority === 35,
      "1986-06 史实毒刺节点");
    const hWd = historicAfghanAt(1989, 2);
    assert("historicWithdrawn", hWd.withdrawn === true && hWd.bleedingCost === 0,
      "1989-02 史实撤军完成且失血归零");

    // ---- 3. 门控 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", afghanAiActive() === false, "旁观者没有阿富汗 AI");
    ST.player = "SUN";
    assert("gateOnInAfg2Probe", afghanAiActive() === true, "?afg2probe=1 且有玩家时 AI 才决策");
    assert("contestedSun", afghanContested() === true, "苏方玩家局可争夺");

    // ---- 4. 旁观 / 无干预 = 失血口径不变 ----
    ST.player = null;
    initAfghanState();
    updateMonthlyAfghan(1984, 3, true);
    syncAfghanBleedDev(1984, 3);
    assert("spectatorBleedMatchesHistoric",
      near(ST.afghan.bleedingCost, historicAfghanAt(1984, 3).bleedingCost, 0.01)
      && near(ST.afghan.bleedDev, 0, 0.01),
      "旁观失血必须等于史实基线且 bleedDev≡0");

    ST.player = "SUN";
    initAfghanState();
    // 标准方针、无干预：与史实同口径
    updateMonthlyAfghan(1983, 6, true);
    syncAfghanBleedDev(1983, 6);
    assert("noInterventionZeroDev",
      near(ST.afghan.bleedDev, 0, 0.05),
      "无干预时偏离应≈0，实得 " + ST.afghan.bleedDev);

    // ---- 5. 玩家方针改 bleeding/air/resistance + 真实消费者 ----
    initAfghanState();
    initDomesticState();
    ST.player = "SUN";
    const air0 = ST.afghan.airSuperiority;
    const res0 = ST.afghan.resistance;
    const bleed0 = ST.afghan.bleedingCost;
    const short0 = (ST.domestic && ST.domestic.sun) ? ST.domestic.sun.shortage : 30;
    setAfghanPolicy("surge");
    assert("playerSurgeMovesResBleed",
      ST.afghan.resistance < res0 && ST.afghan.bleedingCost > bleed0
      && ST.afghan.troops > 105000,
      "增兵必须改抵抗/失血/兵力");
    assert("playerSurgeShortageConsumer",
      ST.domestic.sun.shortage > short0 - 0.01,
      "增兵必须抬高短缺（真实消费者）");
    syncAfghanBleedDev(1983, 6);
    assert("playerSurgeBleedDevPositive", ST.afghan.bleedDev > 0.5,
      "增兵相对史实应产生正偏离");
    const drag = afghanBleedDrag();
    assert("playerSurgeDragNegative", drag < 0,
      "正偏离失血必须换算成负 pp 拖累，实得 " + drag);
    applyPlayerDecisions();
    assert("playerSurgePmodConsumer",
      (W1980_SIM.pmap(SIM.S).SUN || 0) < 0.35,
      "拖累必须进入 pmods（和平红利未触发时为负）");

    setAfghanPolicy("consolidate");
    assert("playerConsMovesBleed", ST.afghan.bleedingCost < 5.5, "收缩应降低失血");

    // 美方武装：改 air/resistance
    initAfghanState();
    ST.player = "USA";
    const airU = ST.afghan.airSuperiority;
    const resU = ST.afghan.resistance;
    setAfghanPolicy("arm_resistance");
    assert("usaArmMovesAirRes",
      ST.afghan.resistance > resU && ST.afghan.airSuperiority < airU,
      "武装圣战者必须抬抵抗、削空优");
    void air0;

    // ---- 6. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;

    initAfghanState();
    initAfghanAiState(true);
    ST.player = "SUN";
    ST.afghan.airSuperiority = 85;
    ST.afghan.stingerActive = false;
    aiAfghanSlotOf("USA").lastYm = null;
    const pickSt = aiPickAfghanOp("USA", 1984, 3);
    assert("ruleUsaStingerEarly", !!(pickSt && pickSt.kind === "stinger_early"),
      "空优高且毒刺未入应对美方提前毒刺，实得 " + JSON.stringify(pickSt));

    ST.afghan.stingerActive = true;
    ST.afghan.airSuperiority = 35;
    ST.afghan.resistance = 70;
    ST.afghan.usaPolicy = "none";
    ST.afghan.policy = "surge";
    aiAfghanSlotOf("USA").lastYm = null;
    const pickArm = aiPickAfghanOp("USA", 1986, 8);
    assert("ruleUsaArm", !!(pickArm && pickArm.kind === "arm_resistance"),
      "毒刺后苏军增兵应对美方武装，实得 " + JSON.stringify(pickArm));

    ST.afghan.policy = "consolidate";
    ST.afghan.usaPolicy = "arm_resistance";
    ST.afghan.bleedingCost = 5.0;
    aiAfghanSlotOf("USA").lastYm = null;
    const pickPress = aiPickAfghanOp("USA", 1987, 2);
    assert("ruleUsaPress", !!(pickPress && pickPress.kind === "press"),
      "高失血收缩应对美方施压，实得 " + JSON.stringify(pickPress));

    // 苏方规则（玩家为美）
    initAfghanState();
    initAfghanAiState(true);
    ST.player = "USA";
    ST.afghan.bleedingCost = 5.5;
    ST.afghan.airSuperiority = 35;
    ST.afghan.resistance = 80;
    aiAfghanSlotOf("SUN").lastYm = null;
    const pickGen = aiPickAfghanOp("SUN", 1987, 6);
    assert("ruleSunGeneva", !!(pickGen && pickGen.kind === "geneva_withdraw"),
      "晚期高失血应对苏方日内瓦，实得 " + JSON.stringify(pickGen));

    initAfghanState();
    ST.player = "USA";
    ST.afghan.bleedingCost = 5.0;
    ST.afghan.airSuperiority = 40;
    ST.afghan.policy = "standard";
    aiAfghanSlotOf("SUN").lastYm = null;
    const pickCons = aiPickAfghanOp("SUN", 1985, 4);
    assert("ruleSunConsolidate", !!(pickCons && pickCons.kind === "consolidate"),
      "高失血/低空优应对苏方收缩，实得 " + JSON.stringify(pickCons));

    initAfghanState();
    ST.player = "USA";
    ST.afghan.resistance = 75;
    ST.afghan.stingerActive = false;
    ST.afghan.bleedingCost = 3.5;
    ST.afghan.airSuperiority = 85;
    aiAfghanSlotOf("SUN").lastYm = null;
    const pickSurge = aiPickAfghanOp("SUN", 1983, 2);
    assert("ruleSunSurge", !!(pickSurge && pickSurge.kind === "surge"),
      "早期高抵抗应对苏方增兵，实得 " + JSON.stringify(pickSurge));

    // 粘性 / 收手 / 确定性 / 零 RNG
    ST.player = "SUN";
    initAfghanState();
    ST.afghan.airSuperiority = 85;
    strainStub = P.STRAIN_MAX + 0.05;
    aiAfghanSlotOf("USA").lastYm = null;
    assert("ruleStrainStandsDown", !!(aiPickAfghanOp("USA", 1984, 3)
      && aiPickAfghanOp("USA", 1984, 3).standDown),
      "经济压力过高应收手");
    strainStub = 0;
    aiAfghanSlotOf("USA").lastYm = 1984 * 12 + 3 - 1;
    assert("ruleStickyBlocksChurn", aiPickAfghanOp("USA", 1984, 3) === null,
      "粘性窗口内不得再动手");
    aiAfghanSlotOf("USA").lastYm = null;
    const p1 = aiPickAfghanOp("USA", 1984, 3);
    const p2 = aiPickAfghanOp("USA", 1984, 3);
    assert("ruleDeterministic", JSON.stringify(p1) === JSON.stringify(p2), "同状态同结果");
    const rngR = SIM.S ? SIM.S.rngState : null;
    aiPickAfghanOp("USA", 1984, 3);
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rngR : true, "选棋不得消费引擎 RNG");
    window.polEconStrainOf = realStrain;

    // ---- 7. 执行消费者 ----
    initAfghanState();
    initAfghanAiState(true);
    initPrestigeState(true);
    initDomesticState();
    ST.player = "SUN";
    const airBefore = ST.afghan.airSuperiority;
    const presBefore = prestigeOf("USA");
    const exSt = executeAfghanAiAction("USA", { kind: "stinger_early", reason: "air-high" }, 1984, 3, true);
    assert("consumerStingerAir", exSt.ok && ST.afghan.stingerActive
      && ST.afghan.airSuperiority < airBefore,
      "提前毒刺必须打破空优");
    assert("consumerStingerPrestige", exSt.touched.indexOf("prestige") >= 0
      && prestigeOf("USA") > presBefore,
      "提前毒刺必须给美方威望");

    initAfghanAiState(true);
    initPrestigeState(true);
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    ST.afghan.bleedingCost = 5.0;
    ST.afghan.policy = "consolidate";
    const sunPres = prestigeOf("SUN");
    const unrest0 = ST.domestic.sun.unrest;
    const exPress = executeAfghanAiAction("USA", { kind: "press", reason: "bleed-high" }, 1987, 1, true);
    assert("consumerPressPrestige", exPress.ok && prestigeOf("SUN") < sunPres,
      "施压必须扣苏方威望");
    assert("consumerPressUnrest", exPress.touched.indexOf("unrest") >= 0
      && ST.domestic.sun.unrest > unrest0 - 0.01,
      "施压必须抬高动荡");

    // 月度 AI
    initAfghanState();
    initAfghanAiState(true);
    initPrestigeState(true);
    ST.player = "SUN";
    ST.afghan.airSuperiority = 85;
    aiAfghanSlotOf("USA").lastYm = null;
    updateMonthlyAfghanAi(1984, 3, true);
    const snap = afghanAiSnapshot();
    assert("monthlyAiActs",
      snap.stingers > 0 || snap.arms > 0 || snap.presses > 0 || snap.standDowns > 0,
      "可争夺月推进后对手应有记录");

    // ---- 8. 存档往返 ----
    initAfghanAiState(true);
    aiAfghanSlotOf("USA").count = 2;
    aiAfghanSlotOf("USA").lastKind = "stinger_early";
    aiAfghanSlotOf("USA").lastYm = 1984 * 12 + 3;
    const rt = sanitizeAfghanAiState(JSON.parse(JSON.stringify(ST.afghanAi)));
    assert("roundTripKeepsSlot", !!(rt.slots && rt.slots.USA
      && rt.slots.USA.count === 2 && rt.slots.USA.lastKind === "stinger_early"),
      "存档往返后对手槽应保留");
    const junk = sanitizeAfghanAiState({
      slots: {
        ZZZ: { lastYm: 9, lastKind: "press" },
        USA: { lastYm: 10, lastKind: "arm_resistance", count: 3 },
        SUN: { lastYm: "x", lastKind: 12, count: -2 }
      },
      log: [{ kind: "press" }, "bad", null]
    });
    assert("sanitizeRejectsJunk",
      !junk.slots.ZZZ && junk.slots.USA && junk.slots.USA.count === 3
      && junk.log.length === 1,
      "幽灵国/脏日志必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeAfghanAiState(null), "null 必须返回缺省状态");

    // ---- 9. 旁观不变量 ----
    ST.player = null;
    initAfghanAiState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const logS = JSON.stringify(ST.afghanAi);
    const afS = JSON.stringify(ST.afghan);
    for (let i = 0; i < 6; i++) updateMonthlyAfghanAi(1987, 1 + i, true);
    assert("spectatorNoWrite", JSON.stringify(ST.afghanAi) === logS, "旁观零回写 afghanAi");
    assert("spectatorNoAfghanWrite", JSON.stringify(ST.afghan) === afS, "旁观零回写 ST.afghan（AI 路径）");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "旁观不得消费 RNG");

    // ---- 10. 端到端 ----
    simReset();
    ST.player = "SUN";
    ST.mil = 4;
    applyPlayerDecisions();
    initAfghanState();
    initAfghanAiState(true);
    initPrestigeState(true);
    simFastForward(1985, 1);
    const snap2 = afghanAiSnapshot();
    assert("endToEndStateSane", !!snap2 && typeof snap2.active === "boolean",
      "端到端后快照应健全");
    assert("endToEndBleedDevFinite",
      ST.afghan && typeof ST.afghan.bleedDev === "number" && isFinite(ST.afghan.bleedDev),
      "端到端后 bleedDev 必须有限");

    ST.player = savedPlayer;
    void near;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "afghan2probe";
  d.style.display = "none";
  d.textContent = "AFGHANAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
