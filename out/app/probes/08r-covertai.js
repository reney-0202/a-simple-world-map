"use strict";

// ---- Phase Cov2：隐蔽行动去 RNG + AI 还手全链路探针 ----------------------------
// 要证明六件事：
//   1. 成功/曝光是确定性哈希，隐蔽路径零 Math.random、不推进 rngState；
//   2. 对手真的会动 —— 还手 / 养不起收手 / 粘性（≥3 条确定性规则）；
//   3. 代价是真的 —— 动荡/合法性/特情预算/张力/威望等既有通道被改写；
//   4. 门控 —— 有玩家且（真实局或 ?cov2probe=1）；旁观零回写；
//   5. 存档可清洗；
//   6. 端到端不炸。
function runCovertAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("COVERTAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const P = covertAiTable();
    assert("tableLoaded", !!P && !!window.W1980_INTEL && Array.isArray(window.W1980_INTEL.ACTIONS),
      "data/intel.js 未载入 AI_POLICY");
    assert("apiPresent",
      typeof covertAiActive === "function" && typeof aiPickCovertOp === "function" &&
      typeof covertAiActors === "function" && typeof aiCovertSlotOf === "function" &&
      typeof executeCovertAiAction === "function" && typeof updateMonthlyCovertAi === "function" &&
      typeof sanitizeCovertAiState === "function" && typeof covertRoll === "function" &&
      typeof covertAiSnapshot === "function",
      "Cov2 API 缺失");
    if (!P) throw new Error("cannot continue without AI_POLICY");

    // ---- 1. 规则表完整性 ----
    assert("policyStickyPositive", P.MIN_MONTHS >= 1, "MIN_MONTHS 必须 >=1（0 = 逐月翻烧饼）");
    assert("policyStrainBounded", P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1, "STRAIN_MAX 必须落在 (0,1]");
    assert("policyFloorsPositive", P.BUDGET_FLOOR > 0 && P.AP_FLOOR >= 1, "BUDGET_FLOOR/AP_FLOOR 必须为正");
    assert("policyRetaliateActsReal", Array.isArray(P.RETALIATE_ACTS) && P.RETALIATE_ACTS.length >= 2 &&
      P.RETALIATE_ACTS.every((id) => !!window.W1980_INTEL.getActionById(id)),
      "RETALIATE_ACTS 必须指向真实行动");
    assert("policyDefendActReal", !!window.W1980_INTEL.getActionById(P.DEFEND_ACT),
      "DEFEND_ACT 必须是真实行动");
    assert("policyConsumersPositive",
      P.UNREST_HIT > 0 && P.BUDGET_DRAIN > 0 && P.TENSION_HIT > 0 && P.PRESTIGE_HIT > 0,
      "真实消费者量级必须为正（禁止纯装饰）");

    // ---- 2. 哈希确定性 + 零 RNG ----
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const h1 = covertRoll("ok", 1985, 6, "proxy_insurgency", "USA");
    const h2 = covertRoll("ok", 1985, 6, "proxy_insurgency", "USA");
    const h3 = covertRoll("ok", 1985, 7, "proxy_insurgency", "USA");
    assert("hashStable", h1 === h2 && typeof h1 === "number" && h1 >= 0 && h1 < 1,
      "同盐同态哈希必须稳定落在 [0,1)");
    assert("hashVariesWithMonth", h1 !== h3, "年月变化应改变哈希");
    assert("hashConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "哈希不得推进 rngState");

    // 玩家路径：executeCovertAction 不再走 Math.random
    ST.player = "SUN";
    initIntelState("SUN");
    const rngA = SIM.S ? SIM.S.rngState : null;
    if (SIM.S) { SIM.S.year = 1984; SIM.S.month = 3; }
    const rA = executeCovertAction("proxy_insurgency", "USA");
    const rB = (() => {
      // 重置到同一成本前状态再跑一次，结果必须一致
      initIntelState("SUN");
      if (SIM.S) { SIM.S.year = 1984; SIM.S.month = 3; }
      return executeCovertAction("proxy_insurgency", "USA");
    })();
    assert("playerPathDeterministic",
      rA.ok && rB.ok && rA.success === rB.success && rA.blowback === rB.blowback,
      "同年月同行动同目标必须同结果");
    assert("playerPathNoRng", SIM.S ? SIM.S.rngState === rngA : true,
      "玩家隐蔽路径不得推进 rngState");

    // ---- 3. 门控 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", covertAiActive() === false, "旁观者没有暗战");
    ST.player = "SUN";
    assert("gateOnInCov2Probe", covertAiActive() === true,
      "?cov2probe=1 且有玩家时 AI 才决策");

    // ---- 4. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initCovertAiState(true);
    initIntelState("SUN");
    ST.player = "SUN";
    const NOWY = 1985, NOWM = 6;

    // 无挑衅 → 不动作
    ST.intel.history = [];
    aiCovertSlotOf("USA").budget = 20; aiCovertSlotOf("USA").ap = 6;
    aiCovertSlotOf("USA").lastYm = null; aiCovertSlotOf("USA").cooldown = 0;
    assert("ruleNeutralDoesNothing", aiPickCovertOp("USA", NOWY, NOWM) === null,
      "未被挑衅时不应主动动手");

    // 规则 1：还手
    ST.intel.history = [{
      id: "proxy_insurgency", name: "代理人", target: "美国",
      success: true, blowback: false, y: NOWY, m: NOWM - 2, note: "x"
    }];
    const pickRet = aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleRetaliate", !!(pickRet && pickRet.act && pickRet.reason === "retaliate"),
      "被挑衅应还手，实得 " + JSON.stringify(pickRet));

    // 规则 2：养不起收手
    aiCovertSlotOf("USA").budget = P.BUDGET_FLOOR - 0.1;
    const pickStrain = aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleStrainStandsDown", !!(pickStrain && pickStrain.standDown && pickStrain.reason === "strain"),
      "预算紧应收手，实得 " + JSON.stringify(pickStrain));
    aiCovertSlotOf("USA").budget = 20;
    strainStub = P.STRAIN_MAX + 0.05;
    assert("ruleStrainFromEconomy", !!(aiPickCovertOp("USA", NOWY, NOWM) &&
      aiPickCovertOp("USA", NOWY, NOWM).standDown),
      "经济压力过高应收手");
    strainStub = 0;

    // 规则 3：粘性
    aiCovertSlotOf("USA").lastYm = NOWY * 12 + NOWM - 1;
    assert("ruleStickyBlocksChurn", aiPickCovertOp("USA", NOWY, NOWM) === null,
      "粘性窗口内不得再动手");
    aiCovertSlotOf("USA").lastYm = NOWY * 12 + NOWM - P.MIN_MONTHS - 1;

    // coast：玩家丑闻冻结
    ST.intel.scandalCooldown = 3;
    const pickCoast = aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleCoastOnScandal", !!(pickCoast && pickCoast.standDown && pickCoast.reason === "coast"),
      "玩家丑闻冻结中应 coast");
    ST.intel.scandalCooldown = 0;

    // 确定性
    const p1 = aiPickCovertOp("USA", NOWY, NOWM);
    const p2 = aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleDeterministic", JSON.stringify(p1) === JSON.stringify(p2), "同状态同结果");
    const rngR = SIM.S ? SIM.S.rngState : null;
    aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rngR : true, "选棋不得消费引擎 RNG");

    // 反间加固优先
    aiCovertSlotOf("USA").counterLevel = P.COUNTER_LOW - 5;
    aiCovertSlotOf("USA").lastYm = null;
    const pickDef = aiPickCovertOp("USA", NOWY, NOWM);
    assert("ruleDefendWhenCounterLow", !!(pickDef && pickDef.act === P.DEFEND_ACT),
      "反间偏低且被压应先加固，实得 " + JSON.stringify(pickDef));
    aiCovertSlotOf("USA").counterLevel = P.INITIAL_COUNTER;
    window.polEconStrainOf = realStrain;

    // ---- 5. 真实消费者 ----
    initCovertAiState(true);
    initIntelState("SUN");
    initDomesticState();
    initPrestigeState(true);
    initIdeologyState(true);
    ST.player = "SUN";
    ST.intel.budget = 20;
    if (!ST.ai) ST.ai = {};
    if (!ST.ai.tensions) ST.ai.tensions = {};
    ST.ai.tensions["USA:SUN"] = 40;
    const unrestBefore = (ST.domestic.sun && ST.domestic.sun.unrest) || 0;
    if (ST.domestic.sun) ST.domestic.sun.unrest = 20;
    const budgetBefore = ST.intel.budget;
    const tensionBefore = ST.ai.tensions["USA:SUN"];
    const presBefore = (typeof prestigeOf === "function") ? prestigeOf("SUN") : 50;
    // 强制成功：用已知哈希或直接走 apply；这里用 execute 但用 counter_intel 之外
    // 为稳定断言，直接调用 covertAiApplyPressure(success=true)
    const applied = covertAiApplyPressure("USA", "proxy_insurgency", true, 1985, 6, true);
    assert("consumerTouchesUnrest", applied.touched.indexOf("unrest") >= 0 &&
      ST.domestic.sun.unrest > 20 - 0.01,
      "成功还手必须抬高玩家动荡");
    assert("consumerDrainsBudget", applied.touched.indexOf("intel.budget") >= 0 &&
      ST.intel.budget < budgetBefore,
      "成功还手必须抽走特情预算");
    assert("consumerRaisesTension", applied.touched.indexOf("tension") >= 0 &&
      ST.ai.tensions["USA:SUN"] > tensionBefore,
      "成功还手必须抬升美苏张力");
    assert("consumerHitsPrestige", applied.touched.indexOf("prestige") >= 0,
      "成功还手必须扣威望");
    void unrestBefore; void presBefore;

    // 月度执行：挑衅后应真的动手
    initCovertAiState(true);
    initIntelState("SUN");
    ST.player = "SUN";
    ST.intel.history = [{
      id: "coup_attempt", name: "政变", target: "美国",
      success: true, blowback: false, y: 1985, m: 1, note: "x"
    }];
    aiCovertSlotOf("USA").budget = 25;
    aiCovertSlotOf("USA").ap = 8;
    aiCovertSlotOf("USA").lastYm = null;
    aiCovertSlotOf("USA").cooldown = 0;
    aiCovertSlotOf("USA").counterLevel = 70;
    updateMonthlyCovertAi(1985, 6, true);
    const snap = covertAiSnapshot();
    assert("monthlyActsOrStands",
      (snap.hits + snap.standDowns) > 0 || aiCovertSlotOf("USA").lastYm !== null ||
      (ST.covertAi.log && ST.covertAi.log.length > 0),
      "月度推进后对手应有行动或显式收手记录");

    // ---- 6. 存档往返与清洗 ----
    initCovertAiState(true);
    aiCovertSlotOf("USA").budget = 12.5;
    aiCovertSlotOf("USA").lastAct = "proxy_insurgency";
    aiCovertSlotOf("USA").lastYm = 1985 * 12 + 6;
    const rt = sanitizeCovertAiState(JSON.parse(JSON.stringify(ST.covertAi)));
    assert("roundTripKeepsSlot", !!(rt.slots && rt.slots.USA &&
      near(rt.slots.USA.budget, 12.5, 0.01) && rt.slots.USA.lastAct === "proxy_insurgency"),
      "存档往返后对手槽应保留");
    const junk = sanitizeCovertAiState({
      slots: {
        ZZZ: { budget: 9, ap: 3, counterLevel: 50 },
        USA: { budget: 11, ap: 4, counterLevel: 55, lastAct: "nope", lastYm: 10 },
        SUN: { budget: "x", ap: 99, counterLevel: 200, lastAct: "proxy_insurgency" }
      },
      log: [{ kind: "hit" }, "bad", null]
    });
    assert("sanitizeRejectsJunk",
      !junk.slots.ZZZ && junk.slots.USA && junk.slots.USA.lastAct === null &&
      junk.slots.SUN && junk.slots.SUN.lastAct === "proxy_insurgency" &&
      junk.slots.SUN.counterLevel <= 100 && junk.log.length === 1,
      "幽灵国/未知行动/非法字段必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeCovertAiState(null), "null 必须返回缺省状态");

    // ---- 7. 旁观不变量 ----
    ST.player = null;
    initCovertAiState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const logS = JSON.stringify(ST.covertAi);
    for (let i = 0; i < 6; i++) updateMonthlyCovertAi(1987, 1 + i, true);
    assert("spectatorNoActors", covertAiActors().length === 0, "旁观者没有 AI 对手");
    assert("spectatorNoWrite", JSON.stringify(ST.covertAi) === logS, "旁观零回写");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "旁观不得消费 RNG");

    // ---- 8. 端到端 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    initIntelState("SUN");
    ST.intel.history = [{
      id: "proxy_insurgency", name: "代理人", target: "美国",
      success: true, blowback: false, y: 1980, m: 6, note: "seed"
    }];
    simFastForward(1982, 1);
    const snap2 = covertAiSnapshot();
    assert("endToEndStateSane", !!snap2 && typeof snap2.active === "boolean",
      "端到端后快照应健全");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "covertaiprobe";
  d.style.display = "none";
  d.textContent = "COVERTAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
