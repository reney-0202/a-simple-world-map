"use strict";

// ---- Phase Bloc2：阵营凝聚 / 卫星离心全链路探针 --------------------------------
// 要证明六件事：
//   1. 规则表完整（粘性 / 离心阈值 / 维稳阈值 / 空转阈值 / 真实消费者量级）；
//   2. 三条+确定性规则 —— 离心 / 维稳 / 空转（+ 粘性/收手）；
//   3. 代价是真的 —— 动荡 / aidEff / credBonus 等既有通道被改写；
//   4. 门控 —— 有玩家且（真实局或 ?bloc2probe=1）；旁观零回写；
//   5. 存档可清洗；不把次极推进 aiMajors；
//   6. 端到端不炸；零 RNG；与 Dip2/N2 不重叠。
function runBloc2Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("BLOCTWOPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number"
    && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const P = blocAiTable();
    const camps = blocAiCamps();
    assert("tableLoaded", !!P && !!window.W1980_BLOC && !!window.W1980_BLOC.AI_POLICY,
      "data/bloc.js 未载入 AI_POLICY");
    assert("campsLoaded", !!camps && !!camps.WEST && !!camps.EAST,
      "CAMPS.WEST / CAMPS.EAST 必须齐全");
    assert("apiPresent",
      typeof blocAiActive === "function" && typeof aiPickBlocOp === "function" &&
      typeof blocAiActors === "function" && typeof aiBlocSlotOf === "function" &&
      typeof executeBlocAiAction === "function" && typeof updateMonthlyBlocAi === "function" &&
      typeof sanitizeBlocAiState === "function" && typeof blocAidEff === "function" &&
      typeof blocAiSnapshot === "function" && typeof blocAiCampOf === "function",
      "Bloc2 API 缺失");
    if (!P) throw new Error("cannot continue without AI_POLICY");

    // ---- 1. 规则表完整性 ----
    assert("policyStickyPositive", P.MIN_MONTHS >= 1, "MIN_MONTHS 必须 >=1");
    assert("policyStrainBounded", P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1, "STRAIN_MAX 必须落在 (0,1]");
    assert("policySpinThresholds",
      P.SPIN_UNREST_MIN > 0 && P.SPIN_STRAIN_MIN > 0 && P.SPIN_COHESION < 0 && P.SPIN_CRED < 0,
      "离心规则必须压低凝聚/可信度");
    assert("policyGluePositive",
      P.GLUE_COHESION > 0 && P.GLUE_CRED > 0 && P.GLUE_MIL_MIN > 0,
      "维稳规则必须抬升凝聚/可信度");
    assert("policyHollow",
      P.HOLLOW_COHESION_MAX > 0 && P.HOLLOW_AID_EFF > 0 && P.HOLLOW_AID_EFF < 1,
      "空转必须打折军援效率");
    assert("policyConsumersPositive",
      P.SPIN_SAT_UNREST > 0 && P.SPIN_LEADER_UNREST > 0 && P.HOLLOW_LEADER_UNREST > 0,
      "真实消费者量级（动荡）必须为正");
    assert("noDip2Overlap",
      typeof P.PROPOSE_WINDOW_SLACK === "undefined" && typeof P.REJECT_TENSION === "undefined",
      "Bloc2 不得复用 Dip2 峰会/拒签字段");
    assert("noN2Overlap",
      typeof P.COOL_ESC_MIN === "undefined" && typeof P.REJECT_CRED_MAX === "undefined",
      "Bloc2 不得复用 N2 核风险字段");
    assert("eastSatsIncludeMid3",
      camps.EAST.satellites.indexOf("POL") >= 0 && camps.EAST.satellites.indexOf("HUN") >= 0 &&
      camps.EAST.satellites.indexOf("CSK") >= 0 && camps.EAST.satellites.indexOf("ROU") >= 0,
      "华约卫星清单应含 Mid3 四国");
    if (typeof updateMonthlyAgendas === "function") {
      const src = Function.prototype.toString.call(updateMonthlyAgendas);
      const m = /aiMajors\s*=\s*\[([^\]]+)\]/.exec(src);
      assert("aiMajorsUntouched", !!m
        && m[1].indexOf("POL") < 0 && m[1].indexOf("HUN") < 0
        && m[1].indexOf("CSK") < 0 && m[1].indexOf("ROU") < 0
        && m[1].indexOf("DDR") < 0 && m[1].indexOf("BGR") < 0
        && (m[1].match(/"/g) || []).length === 14,
        "不得把次极/卫星推进 aiMajors（保持七大国）");
    } else {
      assert("aiMajorsUntouched", false, "updateMonthlyAgendas 缺失，无法核验 aiMajors");
    }

    // ---- 2. 门控 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", blocAiActive() === false, "旁观者没有阵营 AI");
    ST.player = "SUN";
    assert("gateOnInBloc2Probe", blocAiActive() === true,
      "?bloc2probe=1 且有玩家时 AI 才决策");
    assert("campEastForSun", blocAiCampOf("SUN") === "EAST", "苏联应落在 EAST 营");
    assert("campWestForUsa", blocAiCampOf("USA") === "WEST", "美国应落在 WEST 营");

    // ---- 3. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStubMap = {};
    window.polEconStrainOf = (k) => (strainStubMap[k] !== undefined ? strainStubMap[k] : 0);
    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    ST.player = "SUN";
    ST.mil = 3.0;
    ST.aid = [];

    // 低动荡卫星 → 无动作（也无军援、军费不足）
    getGeneralDomestic("POL").unrest = 10;
    getGeneralDomestic("HUN").unrest = 8;
    getGeneralDomestic("CSK").unrest = 6;
    getGeneralDomestic("ROU").unrest = 5;
    getGeneralDomestic("DDR").unrest = 4;
    getGeneralDomestic("BGR").unrest = 4;
    aiBlocSlotOf("SUN").lastYm = null;
    assert("ruleNeutralCalm", aiPickBlocOp("SUN", 1981, 6) === null,
      "平静阵营且无军援/低军费时不应出手");

    // 规则 1：卫星离心
    getGeneralDomestic("POL").unrest = 40;
    aiBlocSlotOf("SUN").lastYm = null;
    const pickSpin = aiPickBlocOp("SUN", 1981, 6);
    assert("ruleSpinHighUnrest", !!(pickSpin && pickSpin.kind === "spin" && pickSpin.sat === "POL"),
      "高动荡未获军援卫星应触发离心，实得 " + JSON.stringify(pickSpin));

    // 军援挡住离心 → 可能转维稳
    ST.aid = [{ t: "POL", l: 1, since: 0 }];
    getGeneralDomestic("POL").unrest = 40;
    aiBlocSlotOf("SUN").lastYm = null;
    const pickGlueAid = aiPickBlocOp("SUN", 1981, 6);
    assert("ruleGlueWhenAiding", !!(pickGlueAid && pickGlueAid.kind === "glue"),
      "军援高动荡卫星应变维稳，实得 " + JSON.stringify(pickGlueAid));

    // 规则 3：军援空转
    ST.blocAi.cohesion = 20;
    ST.aid = [{ t: "POL", l: 1, since: 0 }];
    getGeneralDomestic("POL").unrest = 10;
    aiBlocSlotOf("SUN").lastYm = null;
    const pickHollow = aiPickBlocOp("SUN", 1981, 6);
    assert("ruleHollowLowCohesion", !!(pickHollow && pickHollow.kind === "hollow"),
      "低凝聚+阵营内军援应空转，实得 " + JSON.stringify(pickHollow));

    // 规则 2：军费维稳（无军援、无离心、凝聚正常）
    ST.blocAi.cohesion = 50;
    ST.aid = [];
    ST.mil = 5.5;
    getGeneralDomestic("POL").unrest = 10;
    aiBlocSlotOf("SUN").lastYm = null;
    const pickGlueMil = aiPickBlocOp("SUN", 1981, 6);
    assert("ruleGlueHighMil", !!(pickGlueMil && pickGlueMil.kind === "glue"),
      "军费到位应维稳，实得 " + JSON.stringify(pickGlueMil));

    // 养不起收手
    ST.mil = 5.5;
    strainStubMap.SUN = P.STRAIN_MAX + 0.05;
    aiBlocSlotOf("SUN").lastYm = null;
    assert("ruleStrainStandsDown", !!(aiPickBlocOp("SUN", 1981, 6)
      && aiPickBlocOp("SUN", 1981, 6).standDown),
      "经济压力过高应收手");
    strainStubMap = {};

    // 粘性
    aiBlocSlotOf("SUN").lastYm = 1981 * 12 + 6 - 1;
    getGeneralDomestic("POL").unrest = 40;
    ST.aid = [];
    ST.mil = 3;
    assert("ruleStickyBlocksChurn", aiPickBlocOp("SUN", 1981, 6) === null,
      "粘性窗口内不得再动手");
    aiBlocSlotOf("SUN").lastYm = null;

    // 确定性 + 零 RNG
    getGeneralDomestic("POL").unrest = 40;
    const p1 = aiPickBlocOp("SUN", 1981, 6);
    const p2 = aiPickBlocOp("SUN", 1981, 6);
    assert("ruleDeterministic", JSON.stringify(p1) === JSON.stringify(p2), "同状态同结果");
    const rngR = SIM.S ? SIM.S.rngState : null;
    aiPickBlocOp("SUN", 1981, 6);
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rngR : true, "选棋不得消费引擎 RNG");
    window.polEconStrainOf = realStrain;

    // ---- 4. 真实消费者 ----
    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    ST.player = "SUN";
    ST.mil = 3;
    ST.aid = [];
    getGeneralDomestic("POL").unrest = 30;
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 10;
    const cred0 = ST.nuke.credBonus;
    const polU0 = getGeneralDomestic("POL").unrest;
    const sunU0 = ST.domestic.sun.unrest;
    const coh0 = ST.blocAi.cohesion;
    const exSpin = executeBlocAiAction("SUN", {
      kind: "spin", reason: "satellite-pressure", sat: "POL", unrest: 40, strain: 0
    }, 1981, 6, true);
    assert("consumerSpinCohesion", exSpin.ok && exSpin.touched.indexOf("cohesion") >= 0
      && ST.blocAi.cohesion < coh0,
      "离心必须压低凝聚（" + coh0 + " → " + ST.blocAi.cohesion + "）");
    assert("consumerSpinSatUnrest", exSpin.touched.indexOf("satUnrest") >= 0
      && getGeneralDomestic("POL").unrest > polU0 - 0.01,
      "离心必须抬卫星动荡");
    assert("consumerSpinLeaderUnrest", exSpin.touched.indexOf("unrest") >= 0
      && ST.domestic.sun.unrest > sunU0 - 0.01,
      "离心必须抬领袖动荡");
    assert("consumerSpinCred", exSpin.touched.indexOf("credBonus") >= 0
      && ST.nuke.credBonus < cred0,
      "离心必须扣 credBonus（natoCohesion 通道）");

    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    ST.player = "SUN";
    getGeneralDomestic("POL").unrest = 20;
    const cred1 = ST.nuke.credBonus;
    const polU1 = getGeneralDomestic("POL").unrest;
    const aid0 = ST.blocAi.aidEff;
    const exGlue = executeBlocAiAction("SUN", {
      kind: "glue", reason: "aid-satellite", sat: "POL", mil: 5
    }, 1982, 3, true);
    assert("consumerGlueCohesion", exGlue.ok && ST.blocAi.cohesion > 50 - 0.01,
      "维稳必须抬凝聚");
    assert("consumerGlueSatUnrest", exGlue.touched.indexOf("satUnrest") >= 0
      && getGeneralDomestic("POL").unrest < polU1 + 0.01,
      "维稳应压低卫星动荡");
    assert("consumerGlueCred", exGlue.touched.indexOf("credBonus") >= 0
      && ST.nuke.credBonus > cred1,
      "维稳必须抬 credBonus");
    assert("consumerGlueAidEff", exGlue.touched.indexOf("aidEff") >= 0
      && ST.blocAi.aidEff >= aid0,
      "维稳应回升军援效率");

    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    ST.player = "SUN";
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 12;
    ST.blocAi.cohesion = 25;
    const hollowU0 = ST.domestic.sun.unrest;
    const hollowCred0 = ST.nuke.credBonus;
    const exHollow = executeBlocAiAction("SUN", {
      kind: "hollow", reason: "low-cohesion", sats: ["POL"], cohesion: 25
    }, 1983, 1, true);
    assert("consumerHollowAidEff", exHollow.ok && near(ST.blocAi.aidEff, P.HOLLOW_AID_EFF, 1e-6)
      && blocAidEff() < 1,
      "空转必须把 aidEff 打到策略表（实为 " + ST.blocAi.aidEff + "）");
    assert("consumerHollowUnrest", exHollow.touched.indexOf("unrest") >= 0
      && ST.domestic.sun.unrest > hollowU0 - 0.01,
      "空转必须抬领袖动荡");
    assert("consumerHollowCred", exHollow.touched.indexOf("credBonus") >= 0
      && ST.nuke.credBonus < hollowCred0,
      "空转必须扣 credBonus");

    // 军援效率真正进入 accDecisionListCost
    ST.aid = [{ t: "POL", l: 1, since: 0 }];
    ST.sanctions = [];
    const accFull = {};
    const savedEff = ST.blocAi.aidEff;
    ST.blocAi.aidEff = 1;
    accDecisionListCost(accFull);
    const fullTgt = accFull.POL || 0;
    const accHalf = {};
    ST.blocAi.aidEff = P.HOLLOW_AID_EFF;
    accDecisionListCost(accHalf);
    const halfTgt = accHalf.POL || 0;
    assert("consumerAidEffInAcc", fullTgt > 0 && Math.abs(halfTgt - fullTgt * P.HOLLOW_AID_EFF) < 1e-6,
      "aidEff 必须缩放军援目标增速（full=" + fullTgt + " half=" + halfTgt + "）");
    ST.blocAi.aidEff = savedEff;
    ST.aid = [];

    // 月度执行：高动荡月应真的离心
    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    ST.player = "SUN";
    ST.mil = 3;
    ST.aid = [];
    getGeneralDomestic("POL").unrest = 45;
    aiBlocSlotOf("SUN").lastYm = null;
    updateMonthlyBlocAi(1981, 8, true);
    const snap = blocAiSnapshot();
    assert("monthlySpinsOrStands",
      snap.spins > 0 || snap.standDowns > 0,
      "高动荡月推进后应有离心/收手记录");

    // ---- 5. 存档往返与清洗 ----
    initBlocAiState(true);
    ST.blocAi.cohesion = 44;
    ST.blocAi.aidEff = 0.7;
    aiBlocSlotOf("SUN").spinCount = 2;
    aiBlocSlotOf("SUN").lastKind = "spin";
    aiBlocSlotOf("SUN").lastYm = 1981 * 12 + 8;
    const rt = sanitizeBlocAiState(JSON.parse(JSON.stringify(ST.blocAi)));
    assert("roundTripKeepsMeter", near(rt.cohesion, 44, 1e-6) && near(rt.aidEff, 0.7, 1e-6),
      "存档往返后凝聚/效率应保留");
    assert("roundTripKeepsSlot", !!(rt.slots && rt.slots.SUN
      && rt.slots.SUN.spinCount === 2 && rt.slots.SUN.lastKind === "spin"),
      "存档往返后领袖槽应保留");
    const junk = sanitizeBlocAiState({
      cohesion: 999, aidEff: -3,
      slots: {
        ZZZ: { lastYm: 9, lastKind: "spin" },
        SUN: { lastYm: 10, lastKind: "glue", spinCount: 1, glueCount: 3 },
        USA: { lastYm: "x", lastKind: 12, hollowCount: -2 }
      },
      log: [{ kind: "spin" }, "bad", null]
    });
    assert("sanitizeRejectsJunk",
      !junk.slots.ZZZ && junk.slots.SUN && junk.slots.SUN.glueCount === 3
      && junk.log.length === 1 && junk.cohesion <= 100 && junk.aidEff >= P.AID_EFF_MIN,
      "幽灵国/脏日志/越界表必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeBlocAiState(null), "null 必须返回缺省状态");

    // ---- 6. 旁观不变量 ----
    ST.player = null;
    initBlocAiState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const logS = JSON.stringify(ST.blocAi);
    const nukeS = JSON.stringify(ST.nuke);
    for (let i = 0; i < 6; i++) updateMonthlyBlocAi(1987, 1 + i, true);
    assert("spectatorNoActors", blocAiActors().length === 0, "旁观者没有阵营动作槽");
    assert("spectatorNoWrite", JSON.stringify(ST.blocAi) === logS, "旁观零回写 blocAi");
    assert("spectatorNoNukeWrite", JSON.stringify(ST.nuke) === nukeS, "旁观零回写 ST.nuke");
    assert("spectatorAidEffOne", blocAidEff() === 1, "旁观军援效率必须恒为 1");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "旁观不得消费 RNG");

    // ---- 7. 端到端 ----
    simReset();
    ST.player = "SUN";
    ST.mil = 3;
    applyPlayerDecisions();
    initBlocAiState(true);
    initNukeState(true);
    initDomesticState();
    getGeneralDomestic("POL").unrest = 42;
    aiBlocSlotOf("SUN").lastYm = null;
    updateMonthlyBlocAi(1981, 9, true);
    simFastForward(1982, 1);
    const snap2 = blocAiSnapshot();
    assert("endToEndStateSane", !!snap2 && typeof snap2.active === "boolean"
      && typeof snap2.cohesion === "number",
      "端到端后快照应健全");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "bloc2probe";
  d.style.display = "none";
  d.textContent = "BLOCTWOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
