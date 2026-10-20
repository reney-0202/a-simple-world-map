"use strict";

// ---- Phase F2：威望竞赛的 AI 侧全链路探针 ------------------------------------
// F 建立了威望竞赛，但对手只会被动吃里程碑+衰减 —— 竞赛是单方面的：
// 你跑工程，他看戏。F2 让对手也下棋。要证明六件事：
//   1. 对手真的会动 —— 落后追赶 / 领先收手 / 养不起砍预算 / 粘性防翻烧饼；
//   2. 决策确定且零 RNG —— 同状态同结果，不动引擎随机流；
//   3. 代价是真的 —— AI 工程走 pmods 拖累 GDP（P2/D2 读得到）；
//   4. 威望的后果是双向的 —— 对手领先，第三世界倒向对手阵营；
//   5. 选手可见 —— 榜单与快照公开对方的工程（载人航天上天藏不住）；
//   6. 史实不变量 —— 白名单门控、旁观零回写、存档可清洗。
function runPrestigeAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("PRESTIGEAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = prestigeTable();
    assert("tableLoaded", !!T && !!T.AI_POLICY && !!T.PROGRAMS,
      "data/prestige.js 未载入（缺 AI_POLICY）");
    assert("apiPresent",
      typeof prestigeAiActive === "function" && typeof aiPickPrestigeProgram === "function" &&
      typeof aiPrestigeDragFor === "function" && typeof accPrestigeAiDrag === "function" &&
      typeof aiPrestigeSlotOf === "function" && typeof aiStopPrestigeProgram === "function" &&
      typeof prestigeAiActors === "function",
      "F2 API 缺失");
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

    // ---- 2. 开关：只有「有玩家 + 显式 ?f2probe」才让 AI 动 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", prestigeAiActive() === false,
      "旁观者没有竞赛（旁观看的是史实）");
    ST.player = "SUN";
    assert("gateOnInF2Probe", prestigeAiActive() === true,
      "?f2probe=1 且有玩家时 AI 才决策（本探针会话应为 true）");

    // ---- 3. 选棋规则逐条验证（显式月 + 受控状态 + strain 桩）----
    // strain 打桩是刻意的：选棋规则的输入必须逐字可控，否则测试读的是
    // 仿真经济的当期噪声。引擎路径本身在第 5/10 节用真实函数覆盖。
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initPrestigeState(true);
    ST.player = "SUN";
    const NOWY = 1985, NOWM = 6;
    const setCase = (gap, strain, active) => {
      const slot = aiPrestigeSlotOf("USA");
      slot.active = (active || []).slice();
      slot.since = {};
      for (const id of slot.active) slot.since[id] = (NOWY * 12 + NOWM) - P.MIN_MONTHS - 1;  // 过粘性窗口
      ST.prestige.scores.USA = 50 + Math.max(0, gap);      // USA − SUN = gap
      ST.prestige.scores.SUN = 50 - Math.min(0, gap);
      strainStub = strain;
    };
    // 落后追赶：gap ≤ −CATCHUP_GAP → 开工程
    setCase(-P.CATCHUP_GAP - 1, 0, []);
    const pickCatchup = aiPickPrestigeProgram("USA", NOWY, NOWM);
    assert("ruleCatchupStarts", !!(pickCatchup && pickCatchup.start),
      "落后超过 CATCHUP_GAP 应启动追赶工程，实得 " + JSON.stringify(pickCatchup));
    assert("ruleCatchupPicksHighTier", pickCatchup && pickCatchup.tier === "hi",
      "经济压力低时应上大工程（hi 档），实为 " + (pickCatchup && pickCatchup.tier));
    // 领先收手：gap ≥ COAST_GAP 且有在跑 → stopAll
    setCase(P.COAST_GAP + 1, 0, ["cultural_expo"]);
    const pickCoast = aiPickPrestigeProgram("USA", NOWY, NOWM);
    assert("ruleCoastStopsAll", !!(pickCoast && pickCoast.stopAll),
      "领先超过 COAST_GAP 应全部收手，实得 " + JSON.stringify(pickCoast));
    // 粘性：最近一项工程不满 MIN_MONTHS → 不再加新的
    setCase(-P.CATCHUP_GAP - 1, 0, ["cultural_expo"]);
    aiPrestigeSlotOf("USA").since.cultural_expo = NOWY * 12 + NOWM - 1;
    assert("ruleStickyBlocksChurn", aiPickPrestigeProgram("USA", NOWY, NOWM) === null,
      "粘性窗口内不得再加新工程（防逐月翻烧饼）");
    // 满仓：MAX_ACTIVE 用满 → 不再加
    setCase(-P.CATCHUP_GAP - 1, 0, ["cultural_expo", "ideology_export"]);
    assert("ruleFullStopsAdding", aiPickPrestigeProgram("USA", NOWY, NOWM) === null,
      "满仓不得再加工程");
    // 僵持：|gap| 在两阈值之间且无在跑 → 什么都不做
    setCase(0, 0, []);
    assert("ruleNeutralDoesNothing", aiPickPrestigeProgram("USA", NOWY, NOWM) === null,
      "对位均势时不应有动作");
    // 确定性 + 零 RNG
    setCase(-P.CATCHUP_GAP - 1, 0, []);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pick1 = aiPickPrestigeProgram("USA", NOWY, NOWM);
    const pick2 = aiPickPrestigeProgram("USA", NOWY, NOWM);
    assert("ruleDeterministic",
      JSON.stringify(pick1) === JSON.stringify(pick2), "同状态同结果");
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "AI 选棋不得消费引擎 RNG");
    // 压力分档：压力越大越不敢上大工程
    setCase(-P.CATCHUP_GAP - 1, P.PICK_HI_STRAIN + 0.05, []);
    assert("ruleMidTierUnderStrain", aiPickPrestigeProgram("USA", NOWY, NOWM).tier === "mid",
      "中等压力应降到 mid 档");
    setCase(-P.CATCHUP_GAP - 1, P.PICK_MID_STRAIN + 0.05, []);
    assert("ruleLoTierUnderStrain", aiPickPrestigeProgram("USA", NOWY, NOWM).tier === "lo",
      "高压力应降到 lo 档");
    // 养不起 → 砍最贵的
    setCase(0, P.STRAIN_MAX + 0.05, ["cultural_expo", "space_station"]);
    const pickStrain = aiPickPrestigeProgram("USA", NOWY, NOWM);
    assert("ruleStrainCutsDearest", !!(pickStrain && pickStrain.stop === "space_station"),
      "经济吃紧应停掉拖累最大的工程，实得 " + JSON.stringify(pickStrain));
    window.polEconStrainOf = realStrain;

    // ---- 4. 月度执行：启动 / 收益 / 失败 ----
    // 先结算一轮史实里程碑（fired 记账），再压平分数 —— 否则梯子的跳变会混进读数。
    initPrestigeState(true);
    ST.player = "SUN";
    updatePrestigeRace(1985, 5, true);
    ST.prestige.scores.USA = 40; ST.prestige.scores.SUN = 50;   // USA 落后 10（无里程碑月份）
    updatePrestigeRace(1985, 6, true);
    const slotUSA = aiPrestigeSlotOf("USA");
    assert("monthlyStartsCatchup", slotUSA.active.length > 0,
      "月度推进后对手应已启动工程");
    const startedId = slotUSA.active[0];
    const realRisk = T.PROGRAMS[startedId].risk;
    T.PROGRAMS[startedId].risk = 0;                    // 排除失败噪声，专测收益
    const gainBefore = prestigeOf("USA");
    updatePrestigeRace(1985, 7, true);
    assert("monthlyGainAccrues", prestigeOf("USA") > gainBefore,
      "对手工程应产威望（" + gainBefore + " → " + prestigeOf("USA") + "）");
    // 失败：把风险调到 1 → 必然当众失败
    T.PROGRAMS[startedId].risk = 1;
    const failBefore = prestigeOf("USA");
    const logBefore = ST.prestige.log.length;
    updatePrestigeRace(1985, 8, true);
    assert("monthlyFailureCostsPrestige", prestigeOf("USA") < failBefore - T.PROGRAMS[startedId].failLoss + 2,
      "risk=1 时工程必须当众失败并扣威望");
    assert("monthlyFailureLogged", ST.prestige.log.length > logBefore,
      "失败必须记入公示");
    T.PROGRAMS[startedId].risk = realRisk;

    // ---- 5. 代价是真的：pmods 拖累（P2/D2 的真实消费者）----
    initPrestigeState(true);
    ST.player = "SUN";
    aiPrestigeSlotOf("USA").active = ["space_station"];   // drag 0.30
    aiPrestigeSlotOf("USA").since = { space_station: 1 };
    const drag = aiPrestigeDragFor("USA");
    assert("dragIsNegative", near(drag, -T.PROGRAMS.space_station.drag, 1e-9),
      "工程拖累应为负值（" + drag + "）");
    applyPlayerDecisions();
    const ekUSA = entKeys("USA");
    const pmUSA = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragEntersPmods", pmUSA <= -T.PROGRAMS.space_station.drag + 0.05,
      "AI 工程拖累必须进 pmods（实为 " + pmUSA + "）");
    aiPrestigeSlotOf("USA").active = [];
    applyPlayerDecisions();
    const pmAfter = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragReleasedOnStop", pmAfter > pmUSA,
      "停掉工程后拖累应释放");
    assert("dragGatedOffWithoutPlayer", (() => {
      ST.player = null;
      const d = aiPrestigeDragFor("USA");
      ST.player = "SUN";
      return d === 0;
    })(), "无玩家时拖累必须归零（白名单门控）");

    // ---- 6. 反向漂移：对手领先 → 第三世界倒向对手阵营 ----
    initPrestigeState(true);
    ST.player = "SUN";
    const savedBloc = JSON.stringify(ST.blocOverride);
    ST.prestige.scores.USA = 50 + T.PARAMS.DRIFT_GAP + 2;
    ST.prestige.scores.SUN = 50;
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) {
      ST.prestige.scores.USA = 50 + T.PARAMS.DRIFT_GAP + 2;   // 每月压回领先位（抵衰减）
      updatePrestigeRace(1986, 1 + i, true);
    }
    assert("reverseDriftHappens", ST.prestige.drift.length > 0,
      "对手持续领先应拉走第三世界");
    assert("reverseDriftGoesToRivalBloc", (() => {
      const k = ST.prestige.drift[ST.prestige.drift.length - 1];
      return ST.blocOverride[k] === (typeof blocOf === "function" ? blocOf("USA") : null);
    })(), "漂移实体应倒向对手阵营");
    assert("reverseDriftRespectsTotalCap",
      ST.prestige.drift.length <= T.PARAMS.DRIFT_TOTAL,
      "漂移总额必须封顶");
    ST.blocOverride = JSON.parse(savedBloc);

    // ---- 7. 可见性：对手的工程公开在榜单与快照 ----
    initPrestigeState(true);
    ST.player = "SUN";
    aiPrestigeSlotOf("USA").active = ["space_station"];
    aiPrestigeSlotOf("USA").since = { space_station: 1 };
    ST.prestige.scores.USA = 60; ST.prestige.scores.SUN = 55;
    const snap = prestigeSnapshot();
    assert("snapshotExposesRivalActive",
      Array.isArray(snap.rivalActive) && snap.rivalActive.indexOf("space_station") >= 0,
      "快照应公开对手在跑的工程");
    const board = prestigeBoardHtml();
    assert("boardShowsRivalPrograms", board.indexOf("对手工程") >= 0,
      "榜单应显示对手工程行");

    // ---- 8. 存档往返与垃圾清洗 ----
    initPrestigeState(true);
    aiPrestigeSlotOf("USA").active = ["space_station"];
    aiPrestigeSlotOf("USA").since = { space_station: 123 };
    const rt = sanitizePrestigeState(JSON.parse(JSON.stringify(ST.prestige)));
    assert("roundTripKeepsAi", !!(rt.ai && rt.ai.USA && rt.ai.USA.active.indexOf("space_station") >= 0 &&
      rt.ai.USA.since.space_station === 123),
      "存档往返后对手工程应保留");
    const junk = sanitizePrestigeState({ ai: {
      ZZZ: { active: ["space_station"], since: {} },
      USA: { active: ["nope", "cultural_expo"], since: { nope: 5, cultural_expo: 7 } },
      SUN: { active: [123, null], since: {} }
    } });
    assert("sanitizeRejectsJunk",
      !junk.ai.ZZZ && junk.ai.USA && junk.ai.USA.active.length === 1 &&
      junk.ai.USA.active[0] === "cultural_expo" && junk.ai.USA.since.cultural_expo === 7 &&
      !junk.ai.USA.since.nope &&
      junk.ai.SUN && junk.ai.SUN.active.length === 0,
      "幽灵选手/未知工程/非字符串 id 必须被清洗");
    assert("sanitizeNullSafe", !!sanitizePrestigeState(null), "sanitizePrestigeState(null) 必须返回缺省状态");

    // ---- 9. 旁观不变量：零回写 ----
    ST.player = null;
    initPrestigeState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const pmS = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const blocS = JSON.stringify(ST.blocOverride);
    for (let i = 0; i < 6; i++) updatePrestigeRace(1987, 1 + i, true);
    assert("spectatorNoAiPrograms", prestigeAiActors().length === 0 && Object.keys(ST.prestige.ai).length === 0,
      "旁观者没有 AI 竞赛");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "不得消费引擎 RNG");
    assert("spectatorNoBlocDrift", JSON.stringify(ST.blocOverride) === blocS, "旁观不得漂移阵营");

    // ---- 10. 端到端：真实推进，竞赛活着且不炸 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const snap2 = prestigeSnapshot();
    assert("endToEndStateSane", !!snap2 && Array.isArray(snap2.rivalActive) && typeof snap2.gap === "number",
      "端到端后快照应健全");
    assert("endToEndBoardRenders", prestigeBoardHtml().indexOf("威望竞赛") >= 0,
      "端到端后面板仍在渲染");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "prestigeaiprobe";
  d.style.display = "none";
  d.textContent = "PRESTIGEAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
