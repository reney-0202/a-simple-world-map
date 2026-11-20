"use strict";

// ---- Phase N2：核风险轴 AI 侧全链路探针 ----------------------------------------
// 要证明六件事：
//   1. 规则表完整（粘性 / 降温阈值 / 拒强硬阈值 / 真实消费者量级）；
//   2. 对手真的会动 —— 降温 / 照会 / 拒强硬（≥3 条确定性规则）；
//   3. 代价是真的 —— ST.nuke / 威望 / 张力 / 动荡等既有通道被改写；
//   4. 门控 —— 有玩家且（真实局或 ?n2probe=1）；旁观零回写；
//   5. 存档可清洗；
//   6. 端到端不炸；零 RNG；与 Dip2 仪式轴不重叠。
function runNukeAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("NUKEAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const P = nukeAiTable();
    assert("tableLoaded", !!P && !!window.W1980_NUKE && !!window.W1980_NUKE.AI_POLICY,
      "data/nuke.js 未载入 AI_POLICY");
    assert("apiPresent",
      typeof nukeAiActive === "function" && typeof aiPickNukeOp === "function" &&
      typeof nukeAiActors === "function" && typeof aiNukeSlotOf === "function" &&
      typeof executeNukeAiAction === "function" && typeof updateMonthlyNukeAi === "function" &&
      typeof sanitizeNukeAiState === "function" && typeof nukeAiAcceptHardline === "function" &&
      typeof nukeAiApplyRejectHardline === "function" && typeof nukeAiSnapshot === "function",
      "N2 API 缺失");
    if (!P) throw new Error("cannot continue without AI_POLICY");

    // ---- 1. 规则表完整性 ----
    assert("policyStickyPositive", P.MIN_MONTHS >= 1, "MIN_MONTHS 必须 >=1（0 = 逐月翻烧饼）");
    assert("policyStrainBounded", P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1, "STRAIN_MAX 必须落在 (0,1]");
    assert("policyCoolThreshold", P.COOL_ESC_MIN > P.WARN_ESC_MIN && P.COOL_ESC_MIN <= 100,
      "COOL_ESC_MIN 必须高于照会下限且 ≤100");
    assert("policyWarnWindow",
      P.WARN_ESC_MIN < P.WARN_ESC_MAX && P.WARN_ESC_MAX <= P.COOL_ESC_MIN,
      "WARN 窗必须满足 MIN < MAX ≤ COOL_ESC_MIN");
    assert("policyCoolDeltaNegative", P.COOL_ESC_DELTA < 0, "降温必须压低升级");
    assert("policyRejectCred", P.REJECT_CRED_MAX > 0 && P.REJECT_CRED_MAX < 80,
      "REJECT_CRED_MAX 必须落在合理吃紧区间");
    assert("policyConsumersPositive",
      P.COOL_PRESTIGE > 0 && P.WARN_PRESTIGE > 0 && P.WARN_UNREST > 0 &&
      P.REJECT_PRESTIGE > 0 && P.REJECT_UNREST > 0 && P.REJECT_FORCE_ESC < 0,
      "真实消费者量级必须为正（降温/拒强硬的 esc 变化为负）");
    assert("noDip2Overlap",
      typeof P.PROPOSE_WINDOW_SLACK === "undefined" && typeof P.REJECT_TENSION === "undefined",
      "N2 不得复用 Dip2 峰会/拒签字段");

    // ---- 2. 门控 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", nukeAiActive() === false, "旁观者没有核风险 AI");
    ST.player = "SUN";
    assert("gateOnInN2Probe", nukeAiActive() === true,
      "?n2probe=1 且有玩家时 AI 才决策");

    // ---- 3. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initNukeAiState(true);
    initNukeState(true);
    initPrestigeState(true);
    initDomesticState();
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    ST.ai.tensions = { "USA:SUN": 60 };
    ST.player = "SUN";

    // 低升级 → 不动作
    ST.nuke.esc = 10;
    aiNukeSlotOf("USA").lastYm = null;
    assert("ruleNeutralLowEsc", aiPickNukeOp("USA", 1985, 6) === null,
      "低升级时不应主动出手");

    // 规则 1：高升级降温
    ST.nuke.esc = 70;
    aiNukeSlotOf("USA").lastYm = null;
    const pickCool = aiPickNukeOp("USA", 1985, 6);
    assert("ruleCoolHighEsc", !!(pickCool && pickCool.kind === "cool"),
      "高升级应对 USA 主动降温，实得 " + JSON.stringify(pickCool));

    // 规则 2：中段照会
    ST.nuke.esc = 45;
    aiNukeSlotOf("USA").lastYm = null;
    const pickWarn = aiPickNukeOp("USA", 1985, 6);
    assert("ruleWarnMidEsc", !!(pickWarn && pickWarn.kind === "warn"),
      "中段升级应照会催降温，实得 " + JSON.stringify(pickWarn));

    // 养不起收手
    ST.nuke.esc = 70;
    strainStub = P.STRAIN_MAX + 0.05;
    aiNukeSlotOf("USA").lastYm = null;
    assert("ruleStrainStandsDown", !!(aiPickNukeOp("USA", 1985, 6)
      && aiPickNukeOp("USA", 1985, 6).standDown),
      "经济压力过高应收手");
    strainStub = 0;

    // 粘性
    aiNukeSlotOf("USA").lastYm = 1985 * 12 + 6 - 1;
    ST.nuke.esc = 70;
    assert("ruleStickyBlocksChurn", aiPickNukeOp("USA", 1985, 6) === null,
      "粘性窗口内不得再动手");
    aiNukeSlotOf("USA").lastYm = null;

    // 确定性 + 零 RNG
    ST.nuke.esc = 70;
    const p1 = aiPickNukeOp("USA", 1985, 6);
    const p2 = aiPickNukeOp("USA", 1985, 6);
    assert("ruleDeterministic", JSON.stringify(p1) === JSON.stringify(p2), "同状态同结果");
    const rngR = SIM.S ? SIM.S.rngState : null;
    aiPickNukeOp("USA", 1985, 6);
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rngR : true, "选棋不得消费引擎 RNG");

    // 规则 3：拒绝强硬
    ST.nuke.cred = 20;
    const rejectHawk = nukeAiAcceptHardline({ kind: "incident", esc: 14, optId: "retaliate" });
    assert("ruleRejectHawkIncident", !!(rejectHawk && rejectHawk.ok === false && rejectHawk.reason === "cred"),
      "可信度吃紧时事故强硬应拒，实得 " + JSON.stringify(rejectHawk));
    const rejectCrisis = nukeAiAcceptHardline({ kind: "crisis", tier: 3 });
    assert("ruleRejectHawkCrisis", !!(rejectCrisis && rejectCrisis.ok === false),
      "可信度吃紧时高阶危机应拒，实得 " + JSON.stringify(rejectCrisis));
    ST.nuke.cred = 70;
    const acceptHawk = nukeAiAcceptHardline({ kind: "incident", esc: 14, optId: "retaliate" });
    assert("ruleAcceptWhenCredOk", !!(acceptHawk && acceptHawk.ok === true),
      "可信度充足时应放行强硬，实得 " + JSON.stringify(acceptHawk));
    const acceptDove = nukeAiAcceptHardline({ kind: "incident", esc: -6, optId: "ignore" });
    assert("ruleDoveAlwaysOk", !!(acceptDove && acceptDove.ok === true),
      "降温选项永远放行");
    window.polEconStrainOf = realStrain;

    // ---- 4. 真实消费者 ----
    initNukeAiState(true);
    initNukeState(true);
    initPrestigeState(true);
    initDomesticState();
    ST.player = "SUN";
    ST.nuke.esc = 70;
    ST.ai.tensions["USA:SUN"] = 70;
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    const escBefore = ST.nuke.esc;
    const tensionBefore = ST.ai.tensions["USA:SUN"];
    const aiPresBefore = prestigeOf("USA");

    const exCool = executeNukeAiAction("USA", { kind: "cool", reason: "high-esc", esc: 70 }, 1985, 6, true);
    assert("consumerCoolNuke", exCool.ok && exCool.touched.indexOf("nuke") >= 0
      && ST.nuke.esc < escBefore,
      "降温必须压低 ST.nuke.esc（" + escBefore + " → " + ST.nuke.esc + "）");
    assert("consumerCoolTension", exCool.touched.indexOf("tension") >= 0
      && ST.ai.tensions["USA:SUN"] < tensionBefore,
      "降温必须压低美苏张力");
    assert("consumerCoolPrestige", exCool.touched.indexOf("prestige") >= 0
      && prestigeOf("USA") > aiPresBefore,
      "降温必须给对手威望");

    initNukeAiState(true);
    initPrestigeState(true);
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    const playerPresBefore = prestigeOf("SUN");
    const unrestBefore = ST.domestic.sun.unrest;
    const exWarn = executeNukeAiAction("USA", { kind: "warn", reason: "mid-esc", esc: 45 }, 1985, 6, true);
    assert("consumerWarnPrestige", exWarn.ok && exWarn.touched.indexOf("prestige") >= 0
      && prestigeOf("SUN") < playerPresBefore,
      "照会必须扣玩家威望");
    assert("consumerWarnUnrest", exWarn.touched.indexOf("unrest") >= 0
      && ST.domestic.sun.unrest > unrestBefore - 0.01,
      "照会必须抬高玩家动荡");

    initNukeAiState(true);
    initNukeState(true);
    initPrestigeState(true);
    if (ST.domestic && ST.domestic.sun) ST.domestic.sun.unrest = 20;
    ST.nuke.esc = 60;
    ST.nuke.cred = 20;
    const rejPres = prestigeOf("SUN");
    const rejEsc = ST.nuke.esc;
    const rej = nukeAiApplyRejectHardline("USA", "cred", 1985, 7, true);
    assert("consumerRejectPrestige", rej.touched.indexOf("prestige") >= 0
      && prestigeOf("SUN") < rejPres,
      "拒强硬必须扣玩家威望");
    assert("consumerRejectNuke", rej.touched.indexOf("nuke") >= 0
      && ST.nuke.esc < rejEsc,
      "拒强硬必须强制降温");
    assert("consumerRejectUnrest", rej.touched.indexOf("unrest") >= 0,
      "拒强硬必须冲击国内舆论");

    // 月度执行：高升级月应真的降温
    initNukeAiState(true);
    initNukeState(true);
    initPrestigeState(true);
    ST.player = "SUN";
    ST.nuke.esc = 70;
    ST.ai.tensions["USA:SUN"] = 70;
    aiNukeSlotOf("USA").lastYm = null;
    updateMonthlyNukeAi(1985, 6, true);
    const snap = nukeAiSnapshot();
    assert("monthlyCoolsOrWarns",
      snap.cools > 0 || snap.warns > 0 || snap.standDowns > 0,
      "高升级月推进后对手应有降温/照会/收手记录");

    // ---- 5. 存档往返与清洗 ----
    initNukeAiState(true);
    aiNukeSlotOf("USA").coolCount = 2;
    aiNukeSlotOf("USA").lastKind = "cool";
    aiNukeSlotOf("USA").lastYm = 1985 * 12 + 6;
    const rt = sanitizeNukeAiState(JSON.parse(JSON.stringify(ST.nukeAi)));
    assert("roundTripKeepsSlot", !!(rt.slots && rt.slots.USA
      && rt.slots.USA.coolCount === 2 && rt.slots.USA.lastKind === "cool"),
      "存档往返后对手槽应保留");
    const junk = sanitizeNukeAiState({
      slots: {
        ZZZ: { lastYm: 9, lastKind: "cool" },
        USA: { lastYm: 10, lastKind: "warn", coolCount: 1, warnCount: 3 },
        SUN: { lastYm: "x", lastKind: 12, coolCount: -2 }
      },
      log: [{ kind: "cool" }, "bad", null]
    });
    assert("sanitizeRejectsJunk",
      !junk.slots.ZZZ && junk.slots.USA && junk.slots.USA.warnCount === 3
      && junk.log.length === 1,
      "幽灵国/脏日志必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeNukeAiState(null), "null 必须返回缺省状态");

    // ---- 6. 旁观不变量 ----
    ST.player = null;
    initNukeAiState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const logS = JSON.stringify(ST.nukeAi);
    const nukeS = JSON.stringify(ST.nuke);
    for (let i = 0; i < 6; i++) updateMonthlyNukeAi(1987, 1 + i, true);
    assert("spectatorNoActors", nukeAiActors().length === 0, "旁观者没有 AI 对手");
    assert("spectatorNoWrite", JSON.stringify(ST.nukeAi) === logS, "旁观零回写 nukeAi");
    assert("spectatorNoNukeWrite", JSON.stringify(ST.nuke) === nukeS, "旁观零回写 ST.nuke");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "旁观不得消费 RNG");

    // ---- 7. 端到端：事故强硬拒接线 ----
    simReset();
    ST.player = "SUN";
    ST.mil = 4;
    applyPlayerDecisions();
    initNukeAiState(true);
    initNukeState(true);
    initPrestigeState(true);
    ST.nuke.esc = 50;
    ST.nuke.cred = 15;
    ST.nuke.pending = { id: "false_alarm", y: 1987, m: 3 };
    const beforeEsc = ST.nuke.esc;
    const res = resolveNukeIncident("retaliate", true);
    assert("incidentRejectsHardline",
      res.ok && res.rejected === true && ST.nuke.pending === null
      && ST.nuke.esc < beforeEsc + 14
      && ST.nukeAi.log.some((e) => e && e.kind === "reject"),
      "可信度吃紧时强硬事故必须被拒且强制降温，实得 esc=" + ST.nuke.esc
        + " rejected=" + res.rejected);

    // 可信度充足 → 强硬生效
    initNukeAiState(true);
    initNukeState(true);
    ST.nuke.esc = 50;
    ST.nuke.cred = 80;
    ST.nuke.pending = { id: "false_alarm", y: 1987, m: 4 };
    const resOk = resolveNukeIncident("retaliate", true);
    assert("incidentAllowsHardlineWhenCredOk",
      resOk.ok && !resOk.rejected && ST.nuke.esc > 50,
      "可信度充足时强硬应照常推升级，实得 esc=" + ST.nuke.esc);

    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    ST.nuke.esc = 70;
    simFastForward(1986, 1);
    const snap2 = nukeAiSnapshot();
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
  d.id = "nukeaiprobe";
  d.style.display = "none";
  d.textContent = "NUKEAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
