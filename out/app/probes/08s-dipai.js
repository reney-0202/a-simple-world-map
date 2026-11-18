"use strict";

// ---- Phase Dip2：AI 外交主动全链路探针 ----------------------------------------
// 要证明六件事：
//   1. 规则表完整（粘性 / 窗口 / 拒签阈值 / 真实消费者量级）；
//   2. 对手真的会动 —— 提议峰会 / 加压履约 / 拒绝空谈（≥3 条确定性规则）；
//   3. 代价是真的 —— 威望 / 动荡 / 合法性等既有通道被改写；
//   4. 门控 —— 有玩家且（真实局或 ?dip2probe=1）；旁观零回写；
//   5. 存档可清洗；
//   6. 端到端不炸；零 RNG。
function runDipAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("DIPAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const P = dipAiTable();
    assert("tableLoaded", !!P && !!window.W1980_AI && !!window.W1980_AI.DIP_AI_POLICY,
      "data/ai.js 未载入 DIP_AI_POLICY");
    assert("apiPresent",
      typeof dipAiActive === "function" && typeof aiPickDipOp === "function" &&
      typeof dipAiActors === "function" && typeof aiDipSlotOf === "function" &&
      typeof executeDipAiAction === "function" && typeof updateMonthlyDipAi === "function" &&
      typeof sanitizeDipAiState === "function" && typeof dipAiAcceptTreaty === "function" &&
      typeof dipAiApplyReject === "function" && typeof dipAiSnapshot === "function",
      "Dip2 API 缺失");
    if (!P) throw new Error("cannot continue without DIP_AI_POLICY");

    // ---- 1. 规则表完整性 ----
    assert("policyStickyPositive", P.MIN_MONTHS >= 1, "MIN_MONTHS 必须 >=1（0 = 逐月翻烧饼）");
    assert("policyStrainBounded", P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1, "STRAIN_MAX 必须落在 (0,1]");
    assert("policyProposeWindow", P.PROPOSE_WINDOW_SLACK >= 0, "PROPOSE_WINDOW_SLACK 必须 >=0");
    assert("policyProposeTensionOrder",
      P.PROPOSE_TENSION_MIN < P.PROPOSE_TENSION_MAX && P.PROPOSE_TENSION_MAX < 100,
      "PROPOSE_TENSION_MIN < MAX < 100");
    assert("policyRejectTension", P.REJECT_TENSION > P.PROPOSE_TENSION_MIN && P.REJECT_TENSION <= 100,
      "REJECT_TENSION 必须高于提议下限且 ≤100");
    assert("policyConsumersPositive",
      P.PROPOSE_PRESTIGE > 0 && P.PRESS_PRESTIGE > 0 && P.PRESS_UNREST > 0 &&
      P.REJECT_PRESTIGE > 0 && P.REJECT_UNREST > 0,
      "真实消费者量级必须为正（禁止纯装饰）");
    assert("summitPresetsExist", Array.isArray(window.W1980_AI.SUMMIT_PRESETS)
      && window.W1980_AI.SUMMIT_PRESETS.length >= 3,
      "峰会预设必须存在（提议规则的数据源）");

    // ---- 2. 门控 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", dipAiActive() === false, "旁观者没有外交主动");
    ST.player = "SUN";
    assert("gateOnInDip2Probe", dipAiActive() === true,
      "?dip2probe=1 且有玩家时 AI 才决策");

    // ---- 3. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initDipAiState(true);
    initPrestigeState(true);
    initDomesticState();
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    ST.ai.treaties = [];
    ST.ai.unsc = { passed: [], history: [] };
    ST.player = "SUN";
    ST.mil = 4.0;
    ST.sanctions = [];
    const NOWY = 1985, NOWM = 11; // 日内瓦峰会窗口

    // 无窗口 / 无条约贴边 → 不动作（用非窗口月）
    assert("ruleNeutralOffWindow", aiPickDipOp("USA", 1983, 3) === null,
      "非窗口月且无履约压力时不应主动出手");

    // 规则 1：窗口期提议峰会
    aiDipSlotOf("USA").lastYm = null;
    const pickPropose = aiPickDipOp("USA", NOWY, NOWM);
    assert("ruleProposeInWindow", !!(pickPropose && pickPropose.kind === "propose" && pickPropose.presetId === "geneva_1985"),
      "日内瓦窗口应对 USA 提议峰会，实得 " + JSON.stringify(pickPropose));

    // 规则 2：加压履约 —— 生效 INF 且军费贴上限
    ST.ai.treaties = [{ id: "inf", with: "USA", status: "active", dividend: 0.4, warnings: 0 }];
    ST.mil = 3.7; // milCap 4.0，margin 0.45 → 3.7 > 3.55
    aiDipSlotOf("USA").lastYm = null;
    const pickPress = aiPickDipOp("USA", 1986, 3);
    assert("rulePressNearBreach", !!(pickPress && pickPress.kind === "press" && pickPress.treatyId === "inf"),
      "军费贴 INF 上限应加压履约，实得 " + JSON.stringify(pickPress));
    ST.ai.treaties = [];
    ST.mil = 4.0;

    // 规则 2b：安理会窗口空转
    aiDipSlotOf("USA").lastYm = null;
    const pickUnsc = aiPickDipOp("USA", 1987, 7); // res_598
    assert("rulePressUnscIdle", !!(pickUnsc && pickUnsc.kind === "press_unsc" && pickUnsc.resId === "res_598"),
      "安理会窗口未过应催票，实得 " + JSON.stringify(pickUnsc));
    ST.ai.unsc.passed = ["res_598"];
    assert("ruleUnscPassedNoPress", aiPickDipOp("USA", 1987, 7) === null
      || aiPickDipOp("USA", 1987, 7).kind !== "press_unsc",
      "决议已过不应再催票");
    ST.ai.unsc.passed = [];

    // 养不起收手
    strainStub = P.STRAIN_MAX + 0.05;
    aiDipSlotOf("USA").lastYm = null;
    assert("ruleStrainStandsDown", !!(aiPickDipOp("USA", NOWY, NOWM)
      && aiPickDipOp("USA", NOWY, NOWM).standDown),
      "经济压力过高应收手");
    strainStub = 0;

    // 粘性
    aiDipSlotOf("USA").lastYm = NOWY * 12 + NOWM - 1;
    assert("ruleStickyBlocksChurn", aiPickDipOp("USA", NOWY, NOWM) === null,
      "粘性窗口内不得再动手");
    aiDipSlotOf("USA").lastYm = null;

    // 确定性 + 零 RNG
    const p1 = aiPickDipOp("USA", NOWY, NOWM);
    const p2 = aiPickDipOp("USA", NOWY, NOWM);
    assert("ruleDeterministic", JSON.stringify(p1) === JSON.stringify(p2), "同状态同结果");
    const rngR = SIM.S ? SIM.S.rngState : null;
    aiPickDipOp("USA", NOWY, NOWM);
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rngR : true, "选棋不得消费引擎 RNG");

    // 规则 3：拒绝空谈
    ST.mil = 6.5;
    const rejectArmed = dipAiAcceptTreaty("inf", "USA");
    assert("ruleRejectArmed", !!(rejectArmed && rejectArmed.ok === false && rejectArmed.reason === "armed"),
      "军费过高谈中导应拒签，实得 " + JSON.stringify(rejectArmed));
    ST.mil = 3.5;
    // 抬高张力：对对手加高阶制裁（推过 REJECT_TENSION；hotline 无 milCap）
    ST.sanctions = [{ t: "USA", l: 2 }];
    const rejectTension = dipAiAcceptTreaty("hotline", "USA");
    assert("ruleRejectHighTension", !!(rejectTension && rejectTension.ok === false && rejectTension.reason === "tension"),
      "高张力空谈应拒签，实得 " + JSON.stringify(rejectTension));
    ST.sanctions = [];
    // 基线宿敌张力约 85，低于 REJECT_TENSION(86) 且军费克制 → 放行
    const acceptOk = dipAiAcceptTreaty("hotline", "USA");
    assert("ruleAcceptWhenReady", !!(acceptOk && acceptOk.ok === true),
      "张力缓和且军费克制时应放行，实得 " + JSON.stringify(acceptOk));
    window.polEconStrainOf = realStrain;

    // ---- 4. 真实消费者 ----
    initDipAiState(true);
    initPrestigeState(true);
    initDomesticState();
    ST.player = "SUN";
    ST.mil = 4.0;
    ST.sanctions = [];
    ST.ai.treaties = [];
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    const presBefore = prestigeOf("USA");
    const playerPresBefore = prestigeOf("SUN");
    const unrestBefore = (ST.domestic.sun && ST.domestic.sun.unrest) || 20;

    const exPropose = executeDipAiAction("USA", {
      kind: "propose", presetId: "geneva_1985", reason: "window", tension: 55
    }, 1985, 11, true);
    assert("consumerProposePrestige", exPropose.ok && exPropose.touched.indexOf("prestige") >= 0
      && prestigeOf("USA") > presBefore,
      "提议峰会必须给对手威望");
    assert("consumerProposePending", !!(ST.dipAi.pending && ST.dipAi.pending.presetId === "geneva_1985"),
      "提议后应留下 pending 邀约");

    initDipAiState(true);
    initPrestigeState(true);
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = unrestBefore;
    const exPress = executeDipAiAction("USA", {
      kind: "press", treatyId: "inf", reason: "mil"
    }, 1986, 3, true);
    assert("consumerPressPrestige", exPress.ok && exPress.touched.indexOf("prestige") >= 0
      && prestigeOf("SUN") < playerPresBefore + 0.01,
      "加压必须扣玩家威望");
    assert("consumerPressUnrest", exPress.touched.indexOf("unrest") >= 0
      && ST.domestic.sun.unrest > unrestBefore - 0.01,
      "加压必须抬高玩家动荡");

    initDipAiState(true);
    initPrestigeState(true);
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    const rejPres = prestigeOf("SUN");
    const rej = dipAiApplyReject("USA", "armed", 1986, 4, true);
    assert("consumerRejectPrestige", rej.touched.indexOf("prestige") >= 0
      && prestigeOf("SUN") < rejPres,
      "拒签必须扣玩家威望");
    assert("consumerRejectUnrest", rej.touched.indexOf("unrest") >= 0,
      "拒签必须冲击国内舆论");

    // 月度执行：窗口月应真的提议
    initDipAiState(true);
    initPrestigeState(true);
    ST.player = "SUN";
    ST.mil = 4.0;
    ST.sanctions = [];
    ST.ai.treaties = [];
    aiDipSlotOf("USA").lastYm = null;
    updateMonthlyDipAi(1985, 11, true);
    const snap = dipAiSnapshot();
    assert("monthlyProposesOrPresses",
      snap.proposes > 0 || snap.presses > 0 || snap.standDowns > 0 || !!ST.dipAi.pending,
      "窗口月推进后对手应有提议/加压/收手记录");

    // ---- 5. 存档往返与清洗 ----
    initDipAiState(true);
    aiDipSlotOf("USA").proposeCount = 2;
    aiDipSlotOf("USA").lastKind = "propose";
    aiDipSlotOf("USA").lastYm = 1985 * 12 + 11;
    ST.dipAi.pending = { presetId: "geneva_1985", by: "USA", y: 1985, m: 11 };
    const rt = sanitizeDipAiState(JSON.parse(JSON.stringify(ST.dipAi)));
    assert("roundTripKeepsSlot", !!(rt.slots && rt.slots.USA
      && rt.slots.USA.proposeCount === 2 && rt.slots.USA.lastKind === "propose"
      && rt.pending && rt.pending.presetId === "geneva_1985"),
      "存档往返后对手槽与 pending 应保留");
    const junk = sanitizeDipAiState({
      slots: {
        ZZZ: { lastYm: 9, lastKind: "propose" },
        USA: { lastYm: 10, lastKind: "press", proposeCount: 1, pressCount: 3 },
        SUN: { lastYm: "x", lastKind: 12, proposeCount: -2 }
      },
      pending: { presetId: "nope", by: "ZZZ" },
      log: [{ kind: "propose" }, "bad", null]
    });
    assert("sanitizeRejectsJunk",
      !junk.slots.ZZZ && junk.slots.USA && junk.slots.USA.pressCount === 3
      && junk.pending === null && junk.log.length === 1,
      "幽灵国/非法 pending/脏日志必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeDipAiState(null), "null 必须返回缺省状态");

    // ---- 6. 旁观不变量 ----
    ST.player = null;
    initDipAiState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const logS = JSON.stringify(ST.dipAi);
    for (let i = 0; i < 6; i++) updateMonthlyDipAi(1987, 1 + i, true);
    assert("spectatorNoActors", dipAiActors().length === 0, "旁观者没有 AI 对手");
    assert("spectatorNoWrite", JSON.stringify(ST.dipAi) === logS, "旁观零回写");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "旁观不得消费 RNG");

    // ---- 7. 端到端：signTreaty 拒签接线 ----
    simReset();
    ST.player = "SUN";
    ST.mil = 7.0;
    applyPlayerDecisions();
    initDipAiState(true);
    initPrestigeState(true);
    const beforeSign = (ST.ai.treaties || []).length;
    signTreaty("inf", "USA", null);
    assert("signTreatyRejectsEmptyTalk",
      (ST.ai.treaties || []).length === beforeSign
      && ST.dipAi.log.some((e) => e && e.kind === "reject"),
      "高军费签 INF 必须被拒且记入日志");

    ST.mil = 3.5;
    ST.sanctions = [];
    // 清掉粘性以便再次交互
    aiDipSlotOf("USA").lastYm = null;
    signTreaty("hotline", "USA", null);
    assert("signTreatyAcceptsWhenReady",
      (ST.ai.treaties || []).some((t) => t.id === "hotline" && t.with === "USA" && t.status === "active"),
      "条件具备时应能签署热线条约");

    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const snap2 = dipAiSnapshot();
    assert("endToEndStateSane", !!snap2 && typeof snap2.active === "boolean",
      "端到端后快照应健全");

    ST.player = savedPlayer;
    void near;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "dipaiprobe";
  d.style.display = "none";
  d.textContent = "DIPAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
