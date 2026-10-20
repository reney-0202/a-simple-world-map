"use strict";

// ---- Phase D2：战争的 AI 侧全链路探针 ----------------------------------------
// D 之前三场战争只有玩家能下棋，AI 交战方永远按史实基线挨打 —— 战争不是博弈，
// 是玩家的靶场。要证明六件事：
//   1. AI 会按局势选方针（优势推进/劣势稳住/止损/便宜施压），且**确定性**；
//   2. 两侧方针互相抵消 —— 同一时间只有一方能推得动；
//   3. AI 也能止损（敌方求和会终止战争，且不扣玩家威望）；
//   4. AI 不花政治资本但照常付消耗与厌战（「耗得起吗」对两边都成立）；
//   5. 史实不变量 —— 旁观/常规探针里 AI 不动，行为与 D2 之前逐位一致；
//   6. 对手的方针**可见**（博弈的前提是看得见对方在下哪步棋）。
//
// 注意：updateGroundWars 会每月为 AI 重选方针，所以断言要么在 aiPickWarOp
// 上直接做（带显式 now），要么把状态构造得让规则收敛到预期方针。
function runWarAIProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("WARAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);
  const warMonth = (y, m) => y * 12 + m;
  const NOW = warMonth(1983, 6);            // 规则测试统一结算月（两伊基线 = -32）

  try {
    const T = warTable();
    assert("tableLoaded", !!T && !!T.AI_POLICY && !!T.WARS && !!T.OPS, "data/wars.js 未载入（含 AI_POLICY）");
    assert("apiPresent", typeof aiPickWarOp === "function" && typeof warAiActive === "function",
      "D2 API 缺失（aiPickWarOp / warAiActive）");
    if (!T) throw new Error("cannot continue without the data table");
    const P = T.AI_POLICY;

    // 经济压力渠道归零（储备充足 + 动荡低）：规则测试只测规则，
    // 不测贸易数据的巧合。
    const calmEconomy = (key, unrest) => {
      if (!ST.reserves) ST.reserves = {};
      ST.reserves[key] = { usd: 1e6, trb: 0 };
      const dom = polEconDomesticOf(key);
      if (dom && typeof dom.unrest === "number") dom.unrest = unrest;
    };

    // ---- 1. 规则表完整性 ----
    assert("policyThresholdsSane", P.ADVANTAGE > 0 && P.WEAR_SETTLE > 0 &&
      P.WEAR_HALF > 0 && P.WEAR_HALF <= P.WEAR_SETTLE &&
      P.STRAIN_SETTLE > 0 && P.STRAIN_SETTLE <= 1 && P.STRAIN_PRESS > 0 && P.STRAIN_PRESS <= 1,
      "AI_POLICY 阈值必须自洽");
    assert("aiCostsNoCapital", (() => {
      initPoliticalCapital(true);
      const before = ST.politicalCapital.value;
      aiPickWarOp("iran_iraq", "B", NOW);
      return ST.politicalCapital.value === before;
    })(), "AI 选方针不得消耗政治资本");

    // ---- 2. 开关：只有「有玩家 + 显式 ?warai」才让 AI 动 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", warAiActive() === false,
      "旁观者没有博弈（旁观看的是史实）");
    ST.player = "USA";
    assert("gateOnInWaraiProbe", warAiActive() === true,
      "?warai=1 且有玩家时 AI 才决策（本探针会话应为 true）");

    // ---- 3. 决策规则逐条验证（显式 now + 受控状态）----
    initGroundWarState(true);
    const w = warStateOf("iran_iraq");
    const base1983 = groundWarHistoricControl(T.WARS.iran_iraq, NOW);   // -32
    const setCase = (edge, wear, unrest) => {
      w.dev = edge - base1983;      // 使 control == edge
      w.wearA = wear; w.wearB = 5;
      calmEconomy("IRQ", unrest);
      calmEconomy("IRN", 5);
    };
    setCase(60, 10, 5);
    assert("ruleAdvantagePushes", aiPickWarOp("iran_iraq", "A", NOW) === "ground_offensive",
      "明显领先且余力充足应推进，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(-60, 10, 5);
    assert("ruleLosingLowWearSieges", aiPickWarOp("iran_iraq", "A", NOW) === "attrition_siege",
      "明显落后但还能磨应消耗围困，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(-60, 50, 5);
    assert("ruleLosingHighWearHolds", aiPickWarOp("iran_iraq", "A", NOW) === "hold_line",
      "明显落后且厌战高应固守，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(-20, 80, 5);
    assert("ruleLosingExhaustedSettles", aiPickWarOp("iran_iraq", "A", NOW) === "seek_settlement",
      "劣势且厌战爆表应止损求和，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(-20, 20, 70);
    assert("ruleStrainedSettles", aiPickWarOp("iran_iraq", "A", NOW) === "seek_settlement",
      "劣势且经济吃紧应止损，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(5, 10, 70);
    assert("ruleStalemateStrainedAir", aiPickWarOp("iran_iraq", "A", NOW) === "air_campaign",
      "僵持且经济吃紧应选便宜的空中施压，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    setCase(5, 10, 5);
    w.aiOpA = "air_campaign";
    assert("ruleGreyZoneSticky", aiPickWarOp("iran_iraq", "A", NOW) === "air_campaign",
      "灰区应维持现状而不是翻烧饼，实为 " + aiPickWarOp("iran_iraq", "A", NOW));
    w.aiOpA = null;
    assert("ruleGreyZoneDefaultHold", aiPickWarOp("iran_iraq", "A", NOW) === "hold_line",
      "灰区且无现状应默认固守");
    setCase(60, 10, 5);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pick1 = aiPickWarOp("iran_iraq", "A", NOW);
    const pick2 = aiPickWarOp("iran_iraq", "A", NOW);
    assert("ruleDeterministic", pick1 === pick2, "AI 决策必须确定（同状态同结果）");
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "AI 决策不得消费引擎 RNG");
    setCase(60, 80, 5);
    assert("ruleAdvantageNeverSettles", aiPickWarOp("iran_iraq", "A", NOW) !== "seek_settlement",
      "领先时不得求和（止损要求 myEdge < 0）");

    // ---- 4. 两侧方针互相抵消 ----
    // 1983-06 基线 -32 → B（IRN）领先 32 → 规则 2 让 B 选攻势；
    // A（玩家）也开攻势 → 双方同强度互相抵消 → dev 几乎不动。
    const runFour = (playerOp) => {
      initGroundWarState(true);
      ST.player = "IRQ"; ST.mil = 4;
      initPoliticalCapital(true);
      warStateOf("iran_iraq").op = playerOp;
      calmEconomy("IRQ", 5); calmEconomy("IRN", 5);
      for (let i = 0; i < 4; i++) updateGroundWars(1983, 6 + i, true);
      return warStateOf("iran_iraq");
    };
    const idle = runFour(null);
    assert("aiPushesWhenPlayerIdle", idle.dev < -1,
      "玩家不动时 AI 应独自把战线推向己方（dev 实为 " + idle.dev.toFixed(2) + "）");
    const both = runFour("ground_offensive");
    assert("bothSidesCancel", Math.abs(both.dev) < 5,
      "双方同强度攻势应互相抵消（dev 实为 " + both.dev.toFixed(2) + "）");
    assert("playerPushBeatsIdle", both.dev > idle.dev + 10,
      "玩家的攻势必须真的改变合力（idle " + idle.dev.toFixed(2) + " vs both " + both.dev.toFixed(2) + "）");
    assert("aiAttritionFromBoth", idle.attrDevB > 0 && idle.attrDevA > 0,
      "双方交火都应积累额外消耗");

    // ---- 5. AI 止损真的终止战争（且不扣玩家威望）----
    initGroundWarState(true);
    ST.player = "IRQ"; ST.mil = 4;
    const w3 = warStateOf("iran_iraq");
    w3.dev = 40 - base1983;              // control = +8：B 劣势 → 规则 1 止损
    w3.wearA = 10; w3.wearB = 80;        // B 厌战爆表 → 必然求和
    calmEconomy("IRQ", 5); calmEconomy("IRN", 5);
    const irqPrestige0 = (typeof prestigeOf === "function") ? prestigeOf("IRQ") : null;
    const irnPrestige0 = (typeof prestigeOf === "function") ? prestigeOf("IRN") : null;
    updateGroundWars(1984, 1, true);
    assert("enemySettlementEndsWar", !!warStateOf("iran_iraq").outcome,
      "敌方求和必须终止战争，实为 " + warStateOf("iran_iraq").outcome);
    assert("enemySettlementLabelled", ST.wars.log.some((e) => e.id === "iran_iraq"),
      "敌方求和必须记入战史");
    assert("settlementCostsNoPlayerPrestige", (() => {
      if (irqPrestige0 === null) return true;
      // 求和方不是玩家 → 玩家威望一分不扣（守卫在 settleSide === playerSide）。
      // 僵持结局双方威望都不动；若守卫缺失，IRQ 会被扣「劣势停火」代价。
      return near(prestigeOf("IRQ"), irqPrestige0, 1e-9);
    })(), "敌方求和不得扣玩家威望（惩罚只针对求和方）");
    assert("settlementCostsNoRivalPrestige", irnPrestige0 === null ||
      near(prestigeOf("IRN"), irnPrestige0, 1e-9),
      "僵持结局双方威望都不动");

    // ---- 6. AI 消耗与厌战照常累积（不是免费的）----
    initGroundWarState(true);
    ST.player = "IRQ"; ST.mil = 4;
    calmEconomy("IRQ", 5); calmEconomy("IRN", 5);
    // B 在 1983-06 领先 → B 自己会选攻势（不需要手动指定，
    // 手动指定也会被每月重选覆盖）。
    for (let i = 0; i < 3; i++) updateGroundWars(1983, 6 + i, true);
    const w4b = warStateOf("iran_iraq");
    assert("aiAttritionAccumulates", w4b.attrDevB > 0,
      "AI 的攻势必须给自己积累额外消耗（实为 " + w4b.attrDevB.toFixed(2) + "）");
    assert("aiAttritionHurtsOpponent", w4b.attrDevA > 0,
      "AI 的攻势必须消耗对手（实为 " + w4b.attrDevA.toFixed(2) + "）");
    assert("aiWearAccumulates", w4b.wearB > 0, "AI 侧厌战照常累积");
    assert("aiOpRecorded", !!w4b.aiOpB, "AI 的方针必须被记录（实为 " + w4b.aiOpB + "）");

    // ---- 7. 对手方针可见（博弈的前提）----
    // B 劣势深 + 厌战低 → B 选 attrition_siege；dev 衰减进灰区后粘性维持。
    initGroundWarState(true);
    ST.player = "IRQ"; ST.mil = 4;
    const w5 = warStateOf("iran_iraq");
    w5.dev = 80 - base1983;              // control = +48 → B 劣势
    w5.wearA = 10; w5.wearB = 10;
    calmEconomy("IRQ", 5); calmEconomy("IRN", 5);
    for (let i = 0; i < 2; i++) updateGroundWars(1983, 6 + i, true);
    const html = groundWarPanelHtml("IRQ");
    assert("panelShowsEnemyOp", html.indexOf("敌方方针") >= 0 && html.indexOf("消耗围困") >= 0,
      "面板必须显示对手的方针（B 应为 attrition_siege，实为 " + warStateOf("iran_iraq").aiOpB + "）");
    const snap = groundWarSnapshot();
    assert("snapshotExposesAiOps", snap.wars.iran_iraq.aiOpB === "attrition_siege",
      "快照必须暴露 aiOpB，实为 " + snap.wars.iran_iraq.aiOpB);

    // ---- 8. 保存往返 ----
    initGroundWarState(true);
    const w6 = warStateOf("iran_iraq");
    w6.aiOpA = "ground_offensive"; w6.aiOpB = "hold_line";
    const rt = sanitizeGroundWarState(JSON.parse(JSON.stringify(ST.wars)));
    assert("roundTripKeepsAiOps", rt.wars.iran_iraq.aiOpA === "ground_offensive" &&
      rt.wars.iran_iraq.aiOpB === "hold_line", "存档往返后 AI 方针应保留");
    const junk = sanitizeGroundWarState({ wars: { iran_iraq: { aiOpA: "nope", aiOpB: 42 } } });
    assert("sanitizeRejectsJunkAiOps", junk.wars.iran_iraq.aiOpA === null &&
      junk.wars.iran_iraq.aiOpB === null, "非法 AI 方针必须被清洗");

    // ---- 9. 史实不变量：旁观不动、零 RNG ----
    ST.player = null;
    initGroundWarState(true);
    const rngA = SIM.S ? SIM.S.rngState : null;
    for (let i = 0; i < 6; i++) updateGroundWars(1983, 6 + i, true);
    const devSpec = warStateOf("iran_iraq").dev;
    assert("spectatorZeroDeviation", Math.abs(devSpec) < 1e-9,
      "旁观时 AI 不动 → dev 恒为 0（史实基线），实为 " + devSpec);
    assert("spectatorNoAiOps", !warStateOf("iran_iraq").aiOpA && !warStateOf("iran_iraq").aiOpB,
      "旁观时不得写入 AI 方针");
    assert("spectatorConsumesNoRng", SIM.S ? SIM.S.rngState === rngA : true,
      "旁观路径不得消费引擎 RNG");

    // ---- 10. 端到端：AI 真的会在真实推进中动起来 ----
    simReset();
    ST.player = "GBR"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const s10 = groundWarSnapshot();
    const anyAiOp = Object.keys(s10.wars).some((id) =>
      s10.wars[id].aiOpA !== null || s10.wars[id].aiOpB !== null || s10.wars[id].outcome);
    assert("endToEndAiMoves", anyAiOp,
      "真实推进中 AI 应该真的下了棋（方针或结局），实为 " +
      Object.keys(s10.wars).map((id) => id + "=A:" + s10.wars[id].aiOpA + "/B:" + s10.wars[id].aiOpB).join(" "));
    assert("endToEndBounded", Object.keys(s10.wars).every((id) =>
      Math.abs(s10.wars[id].control) <= T.PARAMS.CONTROL_MAX), "control 必须始终在合法区间");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "waraiprobe";
  d.style.display = "none";
  d.textContent = "WARAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
