"use strict";

// ---- Phase End3：史笔织入 Mid3/Bloc2/Mid4/Cri3 全链路探针 --------------------
// 要证明：
//   1. End3 小句 API 齐全；缺轴降级不抛错；
//   2. 四幕仍完整，既有 endstory / End2 判词不塌缩；
//   3. Mid3 / Mid4 / Bloc2 / Cri3 快照字段真的织进正文（带数字）；
//   4. 纯函数：零 RNG、零回写、确定性；
//   5. 端到端后史笔仍健全。
function runEnd3Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ENDTHREEPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    assert("apiPresent",
      typeof endStoryOf === "function" && typeof endStoryAct1 === "function" &&
      typeof endStoryAct2 === "function" && typeof endStoryMidClause === "function" &&
      typeof endStoryBloc2Clause === "function" && typeof endStoryCri3Clause === "function" &&
      typeof endStoryMidBatchCount === "function" &&
      typeof END3_MID3_KEYS !== "undefined" && typeof END3_MID4_KEYS !== "undefined",
      "End3 史笔 API 缺失");

    assert("midKeysCoverBatches",
      Array.isArray(END3_MID3_KEYS) && END3_MID3_KEYS.join(",") === "POL,HUN,CSK,ROU" &&
      Array.isArray(END3_MID4_KEYS) && END3_MID4_KEYS.join(",") === "CAN,AUS,MEX,SAU" &&
      Array.isArray(END2_MID_KEYS) &&
      END3_MID3_KEYS.every((k) => END2_MID_KEYS.indexOf(k) >= 0) &&
      END3_MID4_KEYS.every((k) => END2_MID_KEYS.indexOf(k) >= 0),
      "Mid 键表须覆盖 Mid3/Mid4 四国");

    // ---- 1. 缺轴降级不抛错 ----
    assert("degradesWithoutNewAxes", (() => {
      const names = ["blocAiSnapshot"];
      const saved = {};
      for (let i = 0; i < names.length; i++) {
        saved[names[i]] = window[names[i]];
        window[names[i]] = undefined;
      }
      const savedAgendas = ST.agendas;
      const savedBloc = ST.blocAi;
      const savedCrises = ST.crises;
      const savedCri3 = window.W1980_CRISES && window.W1980_CRISES.cri3Ids;
      ST.agendas = null;
      ST.blocAi = null;
      ST.crises = null;
      if (window.W1980_CRISES) window.W1980_CRISES.cri3Ids = undefined;
      let ok = true;
      try {
        const s = endStoryOf(typeof endStats === "function" ? endStats() : null);
        ok = s.acts.length === 4 && s.acts.every((a) => a.body && a.body.length > 10);
        ok = ok && endStoryBloc2Clause() === null && endStoryCri3Clause() === null &&
          endStoryMidClause() === null;
      } catch (e) { ok = false; }
      for (let i = 0; i < names.length; i++) window[names[i]] = saved[names[i]];
      ST.agendas = savedAgendas;
      ST.blocAi = savedBloc;
      ST.crises = savedCrises;
      if (window.W1980_CRISES && savedCri3) window.W1980_CRISES.cri3Ids = savedCri3;
      return ok;
    })(), "新轴快照全部缺失时史笔必须降级而非崩溃");

    // ---- 2. 既有四幕 + End2 判词不塌缩 ----
    const savedPlayer = ST.player;
    ST.player = "SUN"; ST.mil = 4;
    const base = endStoryOf(endStats());
    assert("fourActsIntact", base.acts.length === 4, "End3 不得拆四幕结构");
    assert("actTitlesIntact",
      base.acts[0].title.indexOf("国运的底盘") >= 0 &&
      base.acts[1].title.indexOf("棋盘上的较量") >= 0 &&
      base.acts[2].title.indexOf("悬崖边的舞蹈") >= 0 &&
      base.acts[3].title.indexOf("旗帜与人心") >= 0,
      "四幕标题必须保持");
    const mkSt = (total, gap, over) => ({
      player: {
        total: total,
        prestige: gap === null ? null : { gap: gap, rival: "USA", rivalScore: 50, score: 50 + (gap || 0) },
        nuke: { over: over || null }
      }
    });
    assert("verdictWinWinIntact", endStoryAct4(mkSt(75, 12)).body.indexOf("里子面子尽收") >= 0,
      "既有双丰收判词不得塌缩");
    assert("verdictDoomsdayIntact", endStoryAct4(mkSt(75, 12, "doomsday")).body.indexOf("核火之后") >= 0,
      "既有核终局判词不得塌缩");
    assert("end2ApisIntact",
      typeof endStoryAfg2Clause === "function" && typeof endStoryN2Clause === "function" &&
      typeof endStoryCov2Clause === "function" && typeof endStoryDip2Clause === "function",
      "End2 小句 API 不得被 End3 拆掉");

    // ---- 3. 织法：把 Mid3 / Mid4 / Bloc2 / Cri3 真实数字织进正文 ----
    simReset();
    ST.player = "SUN"; ST.mil = 6;
    applyPlayerDecisions();
    if (typeof initBlocAiState === "function") initBlocAiState(true);
    if (typeof initCrisisState === "function") initCrisisState();
    if (typeof initPrestigeState === "function") initPrestigeState(true);
    if (typeof initDomesticState === "function") initDomesticState();
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };

    if (!ST.agendas) ST.agendas = {};
    // Mid3：华约侧翼
    ST.agendas.POL = { active: null, progress: 0, completed: ["pol_martial_credit", "pol_round_table"], bonuses: {} };
    ST.agendas.HUN = { active: null, progress: 0, completed: ["hun_nem_deepen"], bonuses: {} };
    // Mid4：北美·澳纽·海湾
    ST.agendas.CAN = { active: null, progress: 0, completed: ["can_resource_exports", "can_cusfta"], bonuses: {} };
    ST.agendas.SAU = { active: null, progress: 0, completed: ["sau_oil_swing"], bonuses: {} };
    // Mid1 样本（保证总句仍有「战略节点」骨架，兼容 End2 断言风格）
    ST.agendas.IND = { active: null, progress: 0, completed: ["ind_step_a"], bonuses: {} };

    ST.blocAi.log.push({ kind: "spin", ym: "1984-03", by: "SUN", sat: "POL" });
    ST.blocAi.log.push({ kind: "glue", ym: "1985-07", by: "SUN", sat: "HUN" });
    ST.blocAi.log.push({ kind: "hollow", ym: "1986-01", by: "SUN", sats: ["POL"] });
    ST.blocAi.cohesion = 42;

    ST.crises.history.push({ id: "crisis_olympics_1980", y: 1980, m: 7, tier: 2, auto: true });
    ST.crises.history.push({ id: "crisis_lebanon_1982", y: 1982, m: 6, tier: 1, auto: false });
    ST.crises.history.push({ id: "crisis_gulfprelude_1990", y: 1990, m: 7, tier: 2, auto: true });
    // 非 Cri3 卡不应计入 Cri3 小句
    ST.crises.history.push({ id: "crisis_poland_1981", y: 1981, m: 12, tier: 2, auto: true });

    const midClause = endStoryMidClause();
    assert("midClausePresent", !!(midClause && midClause.indexOf("5 个战略节点") >= 0),
      "Mid 小句应读到 IND+POL+HUN+CAN+SAU");
    assert("midWeavesSteps", !!(midClause && midClause.indexOf("7 步") >= 0),
      "Mid 小句应织入完成步数 7");
    assert("mid3FlavorPresent", !!(midClause && midClause.indexOf("华约侧翼") >= 0 &&
      midClause.indexOf("2 国") >= 0),
      "Mid3 华约批应点名织入");
    assert("mid4FlavorPresent", !!(midClause && midClause.indexOf("北美·澳纽·海湾") >= 0 &&
      midClause.indexOf("2 国") >= 0),
      "Mid4 北美/海湾批应点名织入");

    const blocClause = endStoryBloc2Clause();
    assert("bloc2ClausePresent", !!(blocClause && blocClause.indexOf("阵营凝聚") >= 0),
      "Bloc2 小句应提及阵营凝聚");
    assert("bloc2WeavesCounts", !!(blocClause && blocClause.indexOf("离心 1 次") >= 0 &&
      blocClause.indexOf("维稳 1 次") >= 0 && blocClause.indexOf("军援空转 1 次") >= 0),
      "Bloc2 小句应织入三次动作计数");
    assert("bloc2WeavesCohesion", !!(blocClause && blocClause.indexOf("终局凝聚 42") >= 0),
      "Bloc2 小句应织入凝聚读数");

    const cri3Clause = endStoryCri3Clause();
    assert("cri3ClausePresent", !!(cri3Clause && cri3Clause.indexOf("3 张新热点") >= 0),
      "Cri3 小句应只计 Cri3 三张（忽略 poland_1981）");
    assert("cri3WeavesDeviant", !!(cri3Clause && cri3Clause.indexOf("1 次走出了史实基准阶梯") >= 0),
      "Cri3 小句应织入偏离基准次数");
    assert("cri3MentionsArc", !!(cri3Clause && cri3Clause.indexOf("奥运抵制") >= 0 &&
      cri3Clause.indexOf("海湾前奏") >= 0),
      "Cri3 小句应点名时间弧");

    const story = endStoryOf(endStats());
    assert("act1WeavesCri3", story.acts[0].body.indexOf("危机卡") >= 0 ||
      story.acts[0].body.indexOf("新热点") >= 0,
      "第一幕必须织入 Cri3");
    assert("act2WeavesMidBatches",
      story.acts[1].body.indexOf("华约侧翼") >= 0 &&
      story.acts[1].body.indexOf("北美·澳纽·海湾") >= 0,
      "第二幕必须织入 Mid3/Mid4 批注");
    assert("act2WeavesBloc2",
      story.acts[1].body.indexOf("阵营凝聚") >= 0 || story.acts[1].body.indexOf("铁幕内侧") >= 0,
      "第二幕必须织入 Bloc2");

    // ---- 4. 渲染层不变量 ----
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const bloc0 = ST.blocAi ? JSON.stringify(ST.blocAi) : null;
    const cri0 = ST.crises ? JSON.stringify(ST.crises) : null;
    const ag0 = ST.agendas ? JSON.stringify(ST.agendas) : null;
    const sA = JSON.stringify(endStoryOf(endStats()));
    const sB = JSON.stringify(endStoryOf(endStats()));
    assert("deterministic", sA === sB, "同状态同叙事");
    assert("consumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "End3 不得消费引擎 RNG");
    assert("zeroWrites",
      (SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true) &&
      (ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true) &&
      (ST.blocAi ? JSON.stringify(ST.blocAi) === bloc0 : true) &&
      (ST.crises ? JSON.stringify(ST.crises) === cri0 : true) &&
      (ST.agendas ? JSON.stringify(ST.agendas) === ag0 : true),
      "End3 是纯读：不得回写 pmods / 内政 / 凝聚 / 危机 / 议程");

    // ---- 5. 端到端 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const s4 = endStoryOf(endStats());
    assert("endToEndSane", s4.acts.length === 4 && s4.acts.every((a) => a.body.length > 20),
      "端到端后史笔仍必须完整四幕");
    assert("endToEndHtmlRenders", endStoryHtml(endStats()).indexOf("史笔") >= 0,
      "端到端后 HTML 仍渲染");

    ST.player = null;
    const spec = endStoryOf(endStats());
    assert("spectatorComplete", spec.acts.length === 4 &&
      spec.acts.every((a) => a.body.length > 20),
      "旁观模式仍须完整四幕");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "end3probe";
  d.style.display = "none";
  d.textContent = "ENDTHREEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
