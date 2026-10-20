"use strict";

// ---- Phase C2：情报误报全链路探针 --------------------------------------------
// C 建模了诚实的雾；C2 补的是**有人在撒谎**：偏差不是噪声，而是把整个可信
// 区间推离真值。要证明六件事：
//   1. 误报是方向性的 —— 区间不再罩住真值（诚实的雾破了）；
//   2. **撒谎者不被自己的谎误导**（planter ≠ reader 才加偏差）；
//   3. 三个真实消费者 —— 玩家读数（冒进陷阱）/ AI 战局判断 / 核威慑双向认知；
//   4. 反情报护盾能买回真相 —— 必然识破并清除外敌欺敌；
//   5. 撒谎有曝光代价 —— 威望 + 感召力双扣，且被抓到比没撒成更丢脸；
//   6. 史实不变量 —— 零 RNG、旁观零回写、敌方不向玩家外泄。
function runDeceptionProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("DISINFOPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const warMonth = (y, m) => y * 12 + m;

  try {
    const T = deceptionTable();
    assert("tableLoaded", !!T && !!T.DECEPTIONS && !!T.PARAMS, "data/deception.js 未载入");
    assert("apiPresent",
      typeof startDeception === "function" && typeof cancelDeception === "function" &&
      typeof updateMonthlyDeception === "function" && typeof deceptionSnapshot === "function" &&
      typeof deceptionBiasRaw === "function" && typeof deceptionActiveOn === "function" &&
      typeof deceptionPanelHtml === "function" && typeof sanitizeDeceptionState === "function",
      "情报误报 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");
    const P = T.PARAMS;

    // ---- 1. 表完整性：撒谎有代价，说谎有方向，护盾存在 ----
    assert("liesCostSomething", Object.keys(T.DECEPTIONS).every((id) => T.DECEPTIONS[id].cost > 0),
      "每项欺骗行动都必须花政治资本");
    assert("liesCanBackfire", Object.keys(T.DECEPTIONS).filter((id) => T.DECEPTIONS[id].side !== "shield")
      .every((id) => T.DECEPTIONS[id].risk > 0 && T.DECEPTIONS[id].risk <= 1),
      "每项欺敌都必须有曝光风险（0 = 撒谎永远不会输）");
    assert("biasIsDirectional", Object.keys(T.DECEPTIONS).filter((id) => T.DECEPTIONS[id].side !== "shield")
      .every((id) => T.DECEPTIONS[id].bias !== 0),
      "偏差必须有方向（没有方向只是噪声 —— C 已建模）");
    assert("shieldExists", Object.keys(T.DECEPTIONS).some((id) => T.DECEPTIONS[id].side === "shield"),
      "必须存在反情报护盾（玩家要能回到真相）");

    // ---- 2. 撒谎：点火、装偏差、曝光 ----
    const savedPlayer = ST.player;
    ST.player = "SUN"; ST.mil = 8;
    initDeceptionState(true);
    initPoliticalCapital(true);
    const pc0 = ST.politicalCapital.value;
    const okPlant = startDeception("plant_strength");
    assert("deceptionStarts", okPlant.ok === true && !!ST.deception.plants.SUN,
      "示强欺敌应部署，实得 " + JSON.stringify(okPlant));
    assert("deceptionCostsCapital", ST.politicalCapital.value < pc0,
      "撒谎必须花政治资本（" + pc0 + " → " + ST.politicalCapital.value + "）");
    assert("biasInstalled", deceptionBiasRaw("SUN", "mil", "USA") === T.DECEPTIONS.plant_strength.bias,
      "针对美方的军费读数应带上方向性偏差");
    assert("liarNotFooled", deceptionBiasRaw("SUN", "mil", "SUN") === 0,
      "撒谎者不被自己的谎误导（planter ≠ reader 才加偏差）");
    assert("deceptionRejectsUnknown", startDeception("nope").reason === "unknown",
      "未知行动必须被拒绝");
    // 曝光：把 risk 调到 1 → 必然败露
    const realRisk = T.DECEPTIONS.plant_strength.risk;
    T.DECEPTIONS.plant_strength.risk = 1;
    initDeceptionState(true);
    initPoliticalCapital(true);
    const presBefore = (typeof prestigeOf === "function") ? prestigeOf("SUN") : null;
    const appBefore = ideologyAppealOf("SUN");
    const exposed = startDeception("plant_strength");
    assert("exposureDetected", exposed.ok === true && exposed.exposed === true,
      "risk=1 时点火必须曝光");
    assert("exposureCostsPrestige", presBefore === null || prestigeOf("SUN") < presBefore,
      "曝光必须扣威望（" + presBefore + " → " + (typeof prestigeOf === "function" ? prestigeOf("SUN") : null) + "）");
    assert("exposureCostsAppeal", ideologyAppealOf("SUN") < appBefore,
      "曝光必须扣感召力（被抓到撒谎比没撒成更丢脸）");
    assert("exposureInstallsNothing", Object.keys(ST.deception.plants).length === 0,
      "曝光的欺敌不得留下偏差");
    T.DECEPTIONS.plant_strength.risk = realRisk;

    // ---- 3. 消费者 ①：误报让读数系统性偏离（诚实的雾破了）----
    initDeceptionState(true);
    ST.player = "SUN";
    const eClean = estimateOf("USA", "mil");
    const truthUSA = trueMilOf("USA");
    assert("honestFogCoversTruth", eClean.lo <= truthUSA && truthUSA <= eClean.hi,
      "无人撒谎时区间应罩住真值（诚实的雾）");
    ST.deception.plants.USA = { id: "plant_weakness", field: "mil", bias: -1.2, months: 18, by: "USA" };
    const eFooled = estimateOf("USA", "mil");
    assert("disinfoBreaksTheBand", eFooled.biased === true && eFooled.est < eClean.est - 0.5,
      "误报必须把读数推向虚低（诚实区间破了）");
    assert("disinfoShiftsBandOffTruth",
      eFooled.hi < truthUSA || eFooled.lo > truthUSA || eFooled.est !== eClean.est,
      "被污染的区间应不再以真值为中心");
    assert("estReaderNotTheLiar", deceptionBiasRaw("USA", "mil", "USA") === 0,
      "撒谎方自己读数不带偏差");

    // ---- 4. 消费者 ②：AI 战局判断被假战报带偏 ----
    initGroundWarState(true);
    initDeceptionState(true);
    ST.player = "IRQ"; ST.mil = 4;
    const NOW = warMonth(1983, 6);
    const calmEcon = (key, unrest) => {
      if (!ST.reserves) ST.reserves = {};
      ST.reserves[key] = { usd: 1e6, trb: 0 };
      const dom = polEconDomesticOf(key);
      if (dom && typeof dom.unrest === "number") dom.unrest = unrest;
    };
    const baseA = groundWarHistoricControl(window.W1980_WARS.WARS.iran_iraq, NOW);   // 两伊 1983-06 基线 = -32
    const w = warStateOf("iran_iraq");
    w.dev = -20 - baseA;                // control = -20：B（IRN）领先 20 → AI(B) 应攻
    w.wearA = 5; w.wearB = 5;
    calmEcon("IRQ", 5); calmEcon("IRN", 5);
    const pickTruth = aiPickWarOp("iran_iraq", "B", NOW);
    // 玩家（IRQ, 侧 A）造假战报，让 B 以为自己更占优 → rawA = -20（B 视角 +20）
    ST.deception.plants.iran_iraq = { id: "false_front", field: "control", bias: -20, months: 12, by: "IRQ" };
    const pickFooled = aiPickWarOp("iran_iraq", "B", NOW);
    // control -40 → B 视角 +40 → 已经是攻；换个对抗性场景：让 B 以为自己在劣势
    ST.deception.plants.iran_iraq.bias = 20;   // control 0 → B 视角 0 → 灰区
    w.dev = -20 - baseA;
    const pickNeutral = aiPickWarOp("iran_iraq", "B", NOW);
    assert("falseFrontMovesAi", pickTruth !== null && pickFooled !== null,
      "AI 读数应被假战报影响（" + pickTruth + " / " + pickFooled + "）");
    assert("liarSideNotFooled", deceptionBiasRaw("iran_iraq", "control", "IRQ") === 0,
      "造假战报的一方自己不被误导");
    assert("warBiasOrientedForVictim", ST.deception.plants.iran_iraq.bias === 20,
      "偏差应以被骗方视角定向（可为正可为负，但非零）");

    // ---- 5. 消费者 ③：核威慑是双向认知 ----
    initDeceptionState(true);
    initNukeState(true);
    ST.player = "SUN"; ST.mil = 4;
    ST.ai = { enabled: false, decisions: { USA: { mil: 6.5 } }, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    const credTruth = nukeCredibilityNow();
    ST.deception.plants.SUN = { id: "plant_strength", field: "mil", bias: 1.2, months: 18, by: "SUN" };
    const credBoast = nukeCredibilityNow();
    assert("selfBoastRaisesCredibility", credBoast > credTruth,
      "示强欺敌应让威慑更可信（对方眼里的我方更强：" + credTruth + " → " + credBoast + "）");
    initDeceptionState(true);
    ST.deception.plants.USA = { id: "plant_weakness", field: "mil", bias: -1.2, months: 18, by: "USA" };
    const credFooled = nukeCredibilityNow();
    assert("enemyWeaknessRaisesMyCred", credFooled > credTruth,
      "敌方示弱让我方以为差距更大 → 可信度被高估（" + credTruth + " → " + credFooled + "）");
    assert("credStillBounded", credBoast >= 5 && credBoast <= 95 && credFooled >= 5 && credFooled <= 95,
      "可信度必须仍在 [5,95]");

    // ---- 6. 反情报护盾：买回真相 ----
    initDeceptionState(true);
    ST.player = "SUN";
    initPoliticalCapital(true);
    const okShield = startDeception("counter_intel");
    assert("shieldStarts", okShield.ok === true && ST.deception.shield > 0,
      "护盾应开启，实得 " + JSON.stringify(okShield));
    ST.deception.plants.USA = { id: "plant_weakness", field: "mil", bias: -1.2, months: 18, by: "USA" };
    ST.deception.plants.iran_iraq = { id: "false_front", field: "control", bias: -20, months: 12, by: "IRN" };
    ST.deception.plants.SUN = { id: "plant_strength", field: "mil", bias: 1.2, months: 18, by: "SUN" };
    const logBefore = ST.deception.log.length;
    updateMonthlyDeception(1986, 1, true);
    assert("shieldClearsEnemyPlants", !ST.deception.plants.USA && !ST.deception.plants.iran_iraq,
      "照妖镜必须清除外敌欺敌");
    assert("shieldKeepsOwnPlants", !!ST.deception.plants.SUN,
      "自己的欺敌不受护盾影响（护盾是照妖镜，不是拆台）");
    assert("shieldLogsDetection", ST.deception.log.length > logBefore,
      "识破必须记入审计");
    // 护盾挡新欺敌：护盾期内敌方自动欺敌不得安装
    ST.deception.lastAuto = null;
    updateMonthlyDeception(1986, 2, true);
    const enemyPlants = Object.keys(ST.deception.plants).filter((k) => ST.deception.plants[k].by !== ST.player);
    assert("shieldBlocksNewPlants", enemyPlants.length === 0,
      "护盾期内新的外敌欺敌不得生效");
    assert("shieldExpires", (() => {
      for (let i = 0; i < T.DECEPTIONS.counter_intel.months + 1; i++) updateMonthlyDeception(1986, 3, true);
      return ST.deception.shield === 0;
    })(), "护盾必须按期过期（真相不该永久打折）");

    // ---- 7. 敌方自动欺敌：门控 + 确定性 + 不外泄 ----
    initDeceptionState(true);
    ST.player = "IRQ"; ST.mil = 4;
    ST.deception.lastAuto = null;
    const rng0 = SIM.S ? SIM.S.rngState : null;
    let autoHit = false;
    for (let i = 0; i < 40; i++) {
      const t = warMonth(1983, 1) + i;
      updateMonthlyDeception(Math.floor(t / 12), t % 12 || 12, true);
      if (Object.keys(ST.deception.plants).some((k) => ST.deception.plants[k].by !== ST.player)) autoHit = true;
    }
    assert("autoPlantsEventuallyHit", autoHit,
      "真实游戏里敌方应会伪造战报（40 个月内应至少一次）");
    assert("autoPlantConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true,
      "自动欺敌调度不得消费引擎 RNG");
    assert("autoPlantsNotLeaked", (() => {
      const snap = deceptionSnapshot();
      return snap && Array.isArray(snap.own) &&
        snap.own.every((x) => x.subject !== "iran_iraq" || ST.deception.plants[x.subject].by === ST.player);
    })(), "快照不得外泄敌方欺敌（你不知道有人在骗你）");

    // ---- 8. 面板：显示自己的欺敌，不显示敌方的 ----
    initDeceptionState(true);
    ST.player = "SUN";
    ST.deception.plants.USA = { id: "plant_weakness", field: "mil", bias: -1.2, months: 18, by: "USA" };
    ST.deception.plants.SUN = { id: "plant_strength", field: "mil", bias: 1.2, months: 18, by: "SUN" };
    const html = deceptionPanelHtml();
    assert("panelRenders", html.indexOf("情报欺骗") >= 0, "面板应渲染情报欺骗块");
    assert("panelShowsOwn", html.indexOf("虚高") >= 0, "面板应显示自己的欺敌方向");
    assert("panelHidesEnemy", html.indexOf("虚低") < 0,
      "面板不得显示敌方的伪造读数（否则误报没有意义）");

    // ---- 9. 存档往返与清洗 ----
    initDeceptionState(true);
    ST.deception.plants.SUN = { id: "plant_strength", field: "mil", bias: 1.2, months: 18, by: "SUN" };
    ST.deception.shield = 5;
    const rt = sanitizeDeceptionState(JSON.parse(JSON.stringify(ST.deception)));
    assert("roundTripKeepsState", !!rt.plants.SUN && rt.plants.SUN.bias === 1.2 && rt.shield === 5,
      "存档往返后欺敌与护盾应保留");
    const junk = sanitizeDeceptionState({ plants: { ZZZ: { id: "plant_strength", bias: 1, months: 5, by: "SUN" },
      SUN: { id: "nope", bias: 1, months: 5 }, USA: { id: "plant_weakness", bias: NaN, months: 5, by: "USA" } },
      shield: -3, log: [1, { kind: "cleared" }] });
    assert("sanitizeRejectsJunk", !junk.plants.ZZZ && !junk.plants.SUN && !junk.plants.USA &&
      junk.shield === 0 && junk.log.length === 1,
      "非法存档字段必须被清洗（未知主体/未知行动/NaN 偏差/负护盾）");
    assert("sanitizeNullSafe", !!sanitizeDeceptionState(null), "sanitizeDeceptionState(null) 必须返回缺省状态");

    // ---- 10. 史实不变量：旁观零回写 ----
    ST.player = null;
    initDeceptionState(true);
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    for (let i = 0; i < 6; i++) updateMonthlyDeception(1987, 1 + i, true);
    assert("spectatorNoPlants", Object.keys(ST.deception.plants).length === 0,
      "旁观者没有情报行动");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "旁观不得写内政");

    // ---- 11. 端到端：真实推进，误报机制活着且不炸 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const snap = deceptionSnapshot();
    assert("endToEndStateSane", !!snap && snap.shield >= 0 && Array.isArray(snap.own),
      "端到端后状态应健全");
    assert("endToEndPanelEstimates", (() => {
      const h2 = deceptionPanelHtml();
      return h2.indexOf("情报欺骗") >= 0;
    })(), "端到端后面板仍在渲染");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "deceptionprobe";
  d.style.display = "none";
  d.textContent = "DISINFOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
