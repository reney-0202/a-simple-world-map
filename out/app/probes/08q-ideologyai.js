"use strict";

// ---- Phase I2：感召力竞赛的 AI 侧全链路探针 ----------------------------------
// S-17 建立了感召力，但对手只会被动吃衰减 —— 「谁代表未来」是单方面的：
// 你输出主张，他看戏。I2 让对手也输出。要证明六件事：
//   1. 对手真的会动 —— 落后追赶 / 领先收手 / 养不起砍预算 / 粘性防翻烧饼；
//   2. 决策确定且零 RNG —— 同状态同结果，不动引擎随机流；
//   3. 代价是真的 —— AI 工程走 pmods 拖累 GDP（P2/D2 读得到）；
//      顺带证明玩家工程拖累也进了 pmods（S-17 遗留的装饰性拖累）；
//   4. 感召力后果是双向的 —— 对手领先，第三世界倒向对手阵营；
//   5. 选手可见 —— 面板与快照公开对方的输出工程；
//   6. 史实不变量 —— 白名单门控、旁观零回写、存档可清洗。
function runIdeologyAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("IDEOLOGYAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = ideologyTable();
    assert("tableLoaded", !!T && !!T.AI_POLICY && !!T.PROGRAMS,
      "data/ideology.js 未载入（缺 AI_POLICY）");
    assert("apiPresent",
      typeof ideologyAiActive === "function" && typeof aiPickIdeologyProgram === "function" &&
      typeof aiIdeologyDragFor === "function" && typeof accIdeologyAiDrag === "function" &&
      typeof aiIdeologySlotOf === "function" && typeof aiStopIdeologyProgram === "function" &&
      typeof ideologyAiActors === "function",
      "I2 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");
    const P = T.AI_POLICY;

    // ---- 1. 规则表完整性 ----
    assert("policyThresholdsOrdered",
      P.CATCHUP_GAP > 0 && P.COAST_GAP > 0 && P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1 &&
      P.MIN_MONTHS >= 1 && P.PICK_HI_STRAIN > 0 && P.PICK_HI_STRAIN < P.PICK_MID_STRAIN &&
      P.PICK_MID_STRAIN < P.STRAIN_MAX,
      "AI_POLICY 阈值必须自洽（0 < HI < MID < STRAIN_MAX）");
    assert("pickTiersReal", ["hi", "mid", "lo"].every((t) =>
      Array.isArray(P.PICK[t]) && P.PICK[t].length > 0 &&
      P.PICK[t].every((id) => !!T.PROGRAMS[id])),
      "PICK 三档必须都非空且全部指向真实工程");
    assert("pickTiersOrderedByCost", (() => {
      const d = (t) => Math.max(...P.PICK[t].map((id) => T.PROGRAMS[id].drag));
      return d("hi") > d("mid") && d("mid") > d("lo");
    })(), "档位必须按拖累分层（压力越大越不敢上大工程）");

    // ---- 2. 开关 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", ideologyAiActive() === false,
      "旁观者没有辩论（旁观看的是史实）");
    ST.player = "SUN";
    assert("gateOnInI2Probe", ideologyAiActive() === true,
      "?i2probe=1 且有玩家时 AI 才决策");

    // ---- 3. 选棋规则逐条 ----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initIdeologyState(true);
    ST.player = "SUN";
    const NOWY = 1985, NOWM = 6;
    const setCase = (gap, strain, active) => {
      const slot = aiIdeologySlotOf("USA");
      slot.active = (active || []).slice();
      slot.since = {};
      for (const id of slot.active) slot.since[id] = (NOWY * 12 + NOWM) - P.MIN_MONTHS - 1;
      ST.ideology.appeal.USA = 50 + Math.max(0, gap);
      ST.ideology.appeal.SUN = 50 - Math.min(0, gap);
      strainStub = strain;
    };
    setCase(-P.CATCHUP_GAP - 1, 0, []);
    const pickCatchup = aiPickIdeologyProgram("USA", NOWY, NOWM);
    assert("ruleCatchupStarts", !!(pickCatchup && pickCatchup.start),
      "落后超过 CATCHUP_GAP 应启动追赶工程，实得 " + JSON.stringify(pickCatchup));
    assert("ruleCatchupPicksHighTier", pickCatchup && pickCatchup.tier === "hi",
      "经济压力低时应上大工程（hi 档），实为 " + (pickCatchup && pickCatchup.tier));
    setCase(P.COAST_GAP + 1, 0, ["youth_festival"]);
    const pickCoast = aiPickIdeologyProgram("USA", NOWY, NOWM);
    assert("ruleCoastStopsAll", !!(pickCoast && pickCoast.stopAll),
      "领先超过 COAST_GAP 应全部收手，实得 " + JSON.stringify(pickCoast));
    setCase(-P.CATCHUP_GAP - 1, 0, ["youth_festival"]);
    aiIdeologySlotOf("USA").since.youth_festival = NOWY * 12 + NOWM - 1;
    assert("ruleStickyBlocksChurn", aiPickIdeologyProgram("USA", NOWY, NOWM) === null,
      "粘性窗口内不得再加新工程");
    setCase(-P.CATCHUP_GAP - 1, 0, ["youth_festival", "academic_exchange"]);
    assert("ruleFullStopsAdding", aiPickIdeologyProgram("USA", NOWY, NOWM) === null,
      "满仓不得再加工程");
    setCase(0, 0, []);
    assert("ruleNeutralDoesNothing", aiPickIdeologyProgram("USA", NOWY, NOWM) === null,
      "对位均势时不应有动作");
    setCase(-P.CATCHUP_GAP - 1, 0, []);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pick1 = aiPickIdeologyProgram("USA", NOWY, NOWM);
    const pick2 = aiPickIdeologyProgram("USA", NOWY, NOWM);
    assert("ruleDeterministic", JSON.stringify(pick1) === JSON.stringify(pick2), "同状态同结果");
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "AI 选棋不得消费引擎 RNG");
    setCase(-P.CATCHUP_GAP - 1, P.PICK_HI_STRAIN + 0.05, []);
    assert("ruleMidTierUnderStrain", aiPickIdeologyProgram("USA", NOWY, NOWM).tier === "mid",
      "中等压力应降到 mid 档");
    setCase(-P.CATCHUP_GAP - 1, P.PICK_MID_STRAIN + 0.05, []);
    assert("ruleLoTierUnderStrain", aiPickIdeologyProgram("USA", NOWY, NOWM).tier === "lo",
      "高压力应降到 lo 档");
    setCase(0, P.STRAIN_MAX + 0.05, ["youth_festival", "development_model"]);
    const pickStrain = aiPickIdeologyProgram("USA", NOWY, NOWM);
    assert("ruleStrainCutsDearest", !!(pickStrain && pickStrain.stop === "development_model"),
      "经济吃紧应停掉拖累最大的工程，实得 " + JSON.stringify(pickStrain));
    window.polEconStrainOf = realStrain;

    // ---- 4. 月度执行：启动 / 收益 / 翻车 ----
    initIdeologyState(true);
    ST.player = "SUN";
    ST.ideology.appeal.USA = 40; ST.ideology.appeal.SUN = 50;
    updateIdeology(1985, 6, true);
    const slotUSA = aiIdeologySlotOf("USA");
    assert("monthlyStartsCatchup", slotUSA.active.length > 0,
      "月度推进后对手应已启动输出工程");
    const startedId = slotUSA.active[0];
    const realRisk = T.PROGRAMS[startedId].risk;
    T.PROGRAMS[startedId].risk = 0;
    const gainBefore = ideologyAppealOf("USA");
    updateIdeology(1985, 7, true);
    assert("monthlyGainAccrues", ideologyAppealOf("USA") > gainBefore - 0.5,
      "对手工程应产感召力（" + gainBefore + " → " + ideologyAppealOf("USA") + "）");
    T.PROGRAMS[startedId].risk = 1;
    const failBefore = ideologyAppealOf("USA");
    const logBefore = ST.ideology.log.length;
    updateIdeology(1985, 8, true);
    assert("monthlyFailureCostsAppeal", ideologyAppealOf("USA") < failBefore - T.PROGRAMS[startedId].failLoss + 2,
      "risk=1 时工程必须翻车并扣感召力");
    assert("monthlyFailureLogged", ST.ideology.log.length > logBefore, "翻车必须记入公示");
    T.PROGRAMS[startedId].risk = realRisk;

    // ---- 5. 代价是真的：pmods 拖累 + 玩家拖累接线 ----
    initIdeologyState(true);
    ST.player = "SUN";
    aiIdeologySlotOf("USA").active = ["development_model"];
    aiIdeologySlotOf("USA").since = { development_model: 1 };
    const drag = aiIdeologyDragFor("USA");
    assert("dragIsNegative", near(drag, -T.PROGRAMS.development_model.drag, 1e-9),
      "工程拖累应为负值（" + drag + "）");
    applyPlayerDecisions();
    const ekUSA = entKeys("USA");
    const pmUSA = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragEntersPmods", pmUSA <= -T.PROGRAMS.development_model.drag + 0.05,
      "AI 工程拖累必须进 pmods（实为 " + pmUSA + "）");
    aiIdeologySlotOf("USA").active = [];
    applyPlayerDecisions();
    const pmAfter = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragReleasedOnStop", pmAfter > pmUSA, "停掉工程后拖累应释放");
    assert("dragGatedOffWithoutPlayer", (() => {
      ST.player = null;
      const d = aiIdeologyDragFor("USA");
      ST.player = "SUN";
      return d === 0;
    })(), "无玩家时拖累必须归零");

    // S-17 遗留：玩家工程拖累此前是装饰 —— 现在必须进 pmods
    initIdeologyState(true);
    initPoliticalCapital(true);
    ST.player = "SUN"; ST.mil = 0;
    ST.ideology.active = ["development_model"];
    ST.ideology.since = { development_model: 1 };
    applyPlayerDecisions();
    const ekSUN = entKeys("SUN");
    const pmSUN = SIM.S.P.pmods[ekSUN[0]] || 0;
    assert("playerDragEntersPmods", pmSUN <= -T.PROGRAMS.development_model.drag + 0.05,
      "玩家主张输出拖累必须进 pmods（S-17 接线修复），实为 " + pmSUN);
    ST.ideology.active = [];
    applyPlayerDecisions();

    // ---- 6. 反向漂移 ----
    initIdeologyState(true);
    ST.player = "SUN";
    const savedBloc = JSON.stringify(ST.blocOverride);
    ST.ideology.appeal.USA = 50 + T.PARAMS.DRIFT_GAP + 2;
    ST.ideology.appeal.SUN = 50;
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) {
      ST.ideology.appeal.USA = 50 + T.PARAMS.DRIFT_GAP + 2;
      updateIdeology(1986, 1 + i, true);
    }
    assert("reverseDriftHappens", ST.ideology.drift.length > 0,
      "对手持续领先应拉走第三世界");
    assert("reverseDriftGoesToRivalBloc", (() => {
      const k = ST.ideology.drift[ST.ideology.drift.length - 1];
      return ST.blocOverride[k] === (typeof blocOf === "function" ? blocOf("USA") : null);
    })(), "漂移实体应倒向对手阵营");
    assert("reverseDriftRespectsTotalCap",
      ST.ideology.drift.length <= T.PARAMS.DRIFT_TOTAL, "漂移总额必须封顶");
    ST.blocOverride = JSON.parse(savedBloc);

    // ---- 7. 可见性 ----
    initIdeologyState(true);
    ST.player = "SUN";
    aiIdeologySlotOf("USA").active = ["broadcast_war"];
    aiIdeologySlotOf("USA").since = { broadcast_war: 1 };
    ST.ideology.appeal.USA = 60; ST.ideology.appeal.SUN = 55;
    const snap = ideologySnapshot();
    assert("snapshotExposesRivalActive",
      Array.isArray(snap.rivalActive) && snap.rivalActive.indexOf("broadcast_war") >= 0,
      "快照应公开对手在跑的输出工程");
    const panel = ideologyPanelHtml();
    assert("panelShowsRivalPrograms", panel.indexOf("对手输出") >= 0,
      "面板应显示对手输出行");

    // ---- 8. 存档往返与垃圾清洗 ----
    initIdeologyState(true);
    aiIdeologySlotOf("USA").active = ["broadcast_war"];
    aiIdeologySlotOf("USA").since = { broadcast_war: 123 };
    const rt = sanitizeIdeologyState(JSON.parse(JSON.stringify(ST.ideology)));
    assert("roundTripKeepsAi", !!(rt.ai && rt.ai.USA && rt.ai.USA.active.indexOf("broadcast_war") >= 0 &&
      rt.ai.USA.since.broadcast_war === 123),
      "存档往返后对手工程应保留");
    const junk = sanitizeIdeologyState({ ai: {
      ZZZ: { active: ["broadcast_war"], since: {} },
      USA: { active: ["nope", "youth_festival"], since: { nope: 5, youth_festival: 7 } },
      SUN: { active: [123, null], since: {} }
    } });
    assert("sanitizeRejectsJunk",
      !junk.ai.ZZZ && junk.ai.USA && junk.ai.USA.active.length === 1 &&
      junk.ai.USA.active[0] === "youth_festival" && junk.ai.USA.since.youth_festival === 7 &&
      !junk.ai.USA.since.nope &&
      junk.ai.SUN && junk.ai.SUN.active.length === 0,
      "幽灵选手/未知工程/非字符串 id 必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeIdeologyState(null), "sanitizeIdeologyState(null) 必须返回缺省状态");

    // ---- 9. 旁观不变量 ----
    ST.player = null;
    initIdeologyState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const blocS = JSON.stringify(ST.blocOverride);
    for (let i = 0; i < 6; i++) updateIdeology(1987, 1 + i, true);
    assert("spectatorNoAiPrograms", ideologyAiActors().length === 0 && Object.keys(ST.ideology.ai).length === 0,
      "旁观者没有 AI 辩论");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "不得消费引擎 RNG");
    assert("spectatorNoBlocDrift", JSON.stringify(ST.blocOverride) === blocS, "旁观不得漂移阵营");

    // ---- 10. 端到端 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const snap2 = ideologySnapshot();
    assert("endToEndStateSane", !!snap2 && Array.isArray(snap2.rivalActive) && typeof snap2.gap === "number",
      "端到端后快照应健全");
    assert("endToEndPanelRenders", ideologyPanelHtml().indexOf("感召力") >= 0,
      "端到端后面板仍在渲染");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "ideologyaiprobe";
  d.style.display = "none";
  d.textContent = "IDEOLOGYAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
