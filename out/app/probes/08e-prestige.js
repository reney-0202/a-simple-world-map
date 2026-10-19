"use strict";

// ---- Phase F：威望竞赛全链路探针 ---------------------------------------------
// 要证明的四件事：
//   1. 史实不变量 —— 里程碑在旁观模式下只改威望分，**绝不**碰 gdp/pmods/内政/RNG；
//   2. 位置性 + 衰减 —— 分数朝 50 回归，落差才是玩法；
//   3. 工程真的是一场赌博 —— 花政治资本、拖累 GDP、有确定性哈希决定的风险；
//   4. 威望有政治后果 —— 领先足够久，第三世界会真的用脚投票改阵营。
function runPrestigeProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("PRESTIGEPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = prestigeTable();
    assert("tableLoaded", !!T && !!T.MILESTONES && !!T.PROGRAMS && !!T.PARAMS,
      "data/prestige.js 未载入");
    assert("apiPresent",
      typeof updatePrestigeRace === "function" && typeof prestigeSnapshot === "function" &&
      typeof startPrestigeProgram === "function" && typeof stopPrestigeProgram === "function" &&
      typeof prestigeAdd === "function" && typeof prestigeRoll === "function" &&
      typeof prestigeBoardHtml === "function" && typeof prestigeProgramsHtml === "function",
      "威望 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 表自身的完整性 ----
    const ids = T.MILESTONES.map((m) => m.id);
    assert("milestoneIdsUnique", new Set(ids).size === ids.length,
      "里程碑 id 有重复：" + ids.filter((x, i) => ids.indexOf(x) !== i).join(","));
    const badMs = T.MILESTONES.filter((m) =>
      !m.id || typeof m.y !== "number" || typeof m.m !== "number" || m.m < 1 || m.m > 12 ||
      m.y < 1980 || m.y > 1991 || typeof m.gain !== "number" || !m.zh ||
      (m.owner !== "BOTH" && !CM.countries[m.owner]) ||
      (m.rival && !CM.countries[m.rival]));
    assert("milestonesWellFormed", badMs.length === 0,
      "里程碑形状非法：" + badMs.map((m) => m.id).join(","));
    // 竞赛必须有**输有赢**：只有正分的梯子不是竞赛，是一份成绩单。
    assert("milestonesHaveBothSigns",
      T.MILESTONES.some((m) => m.gain > 0) && T.MILESTONES.some((m) => m.gain < 0),
      "里程碑必须同时包含得分与丢分事件");
    assert("milestonesCoverBothSuperpowers",
      T.MILESTONES.some((m) => m.owner === "USA" || m.owner === "BOTH") &&
      T.MILESTONES.some((m) => m.owner === "SUN" || m.owner === "BOTH"),
      "里程碑必须覆盖美苏双方（单边梯子没有对抗性）");
    assert("milestonesSpanTheWholeGame",
      Math.min(...T.MILESTONES.map((m) => m.y)) <= 1981 &&
      Math.max(...T.MILESTONES.map((m) => m.y)) >= 1990,
      "里程碑应覆盖 1980→1991 全程，否则后期没有竞赛张力");
    const badProg = Object.keys(T.PROGRAMS).filter((id) => {
      const d = T.PROGRAMS[id];
      return !d || typeof d.cost !== "number" || d.cost <= 0 ||
        typeof d.drag !== "number" || d.drag <= 0 ||
        typeof d.gain !== "number" || d.gain <= 0 ||
        typeof d.risk !== "number" || d.risk < 0 || d.risk > 1 ||
        typeof d.failLoss !== "number" || d.failLoss <= 0 || !d.zh;
    });
    assert("programsWellFormed", badProg.length === 0, "工程形状非法：" + badProg.join(","));
    assert("programsCarryRealCost",
      Object.keys(T.PROGRAMS).every((id) => T.PROGRAMS[id].drag > 0 && T.PROGRAMS[id].cost > 0),
      "每一项工程都必须同时消耗政治资本与 GDP 增速（否则「取舍」不存在）");
    assert("maxActiveIsBinding", T.PARAMS.MAX_ACTIVE >= 1 && T.PARAMS.MAX_ACTIVE < Object.keys(T.PROGRAMS).length,
      "工程上限必须严格小于工程总数，否则没有取舍");
    assert("riskIsDeterministic", prestigeRoll(1985, 3, "x") === prestigeRoll(1985, 3, "x"),
      "风险掷骰必须是确定性的（同 年/月/id 同结果）");
    assert("riskRollInRange", (() => {
      for (let i = 0; i < 50; i++) {
        const v = prestigeRoll(1980 + (i % 12), 1 + (i % 12), "space_station");
        if (!(v >= 0 && v < 1)) return false;
      }
      return true;
    })(), "掷骰结果必须落在 [0,1)");

    // ---- 2. 旁观不变量：里程碑只改分数 ----
    const savedPlayer = ST.player;
    ST.player = null;
    initPrestigeState(true);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const gdp0 = SIM.S ? JSON.stringify(SIM.S.gdp) : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const bloc0 = JSON.stringify(ST.blocOverride);
    const snapSpec = updatePrestigeRace(1981, 5, true);
    assert("spectatorSnapshotReturned", !!snapSpec, "旁观也要返回快照（世界状态的一部分）");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "威望不得消费引擎 RNG");
    assert("spectatorNoGdpWrites", SIM.S ? JSON.stringify(SIM.S.gdp) === gdp0 : true, "威望不得改 gdp");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true, "威望不得改 pmods");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "威望不得改内政（史实轨迹不变量）");
    assert("spectatorNoBlocDrift", JSON.stringify(ST.blocOverride) === bloc0,
      "无执政者时第三世界不应漂移（否则史实阵营份额会变）");
    assert("spectatorMilestoneFired", ST.prestige.fired.length > 0,
      "旁观模式仍应结算史实里程碑（它是世界状态）");
    assert("milestoneMovedScores",
      ST.prestige.scores.USA !== T.PARAMS.SCORE_START || ST.prestige.scores.SUN !== T.PARAMS.SCORE_START,
      "里程碑应改变美苏威望分");
    // 1981-04 哥伦比亚号：美国 +8（相对苏联的位置性优势自动成立）
    assert("columbiaCreditedUSA", prestigeOf("USA") > T.PARAMS.SCORE_START,
      "哥伦比亚号首飞后美国威望应高于基准，实为 " + prestigeOf("USA"));
    assert("noPlayerGapIsNull", snapSpec.gap === null, "旁观时没有「我方落差」");

    // ---- 3. 衰减：昨天的凯旋变成今天的常态 ----
    ST.prestige.scores.USA = 90;
    const before = prestigeOf("USA");
    updatePrestigeRace(1982, 1, true);     // 无新里程碑落在 1982-01
    assert("decaysTowardBaseline", prestigeOf("USA") < before,
      "威望应朝基准衰减（" + before + " → " + prestigeOf("USA") + "）");
    assert("decayIsGradual", near(prestigeOf("USA"),
      T.PARAMS.SCORE_START + (before - T.PARAMS.SCORE_START) * (1 - T.PARAMS.DECAY), 0.5),
      "衰减应是一阶回归，而不是瞬间归零");
    ST.prestige.scores.USA = 10;
    const low = prestigeOf("USA");
    updatePrestigeRace(1982, 2, true);
    assert("decayWorksUpwardToo", prestigeOf("USA") > low,
      "羞辱也会被淡忘 —— 衰减对两个方向都成立");

    // ---- 4. 对手解析 ----
    assert("rivalSuperpowers", prestigeRivalOf("SUN") === "USA" && prestigeRivalOf("USA") === "SUN",
      "美苏互为对手");
    assert("rivalFallsBackToBlocLeader", prestigeRivalOf("POL") === "SUN" && prestigeRivalOf("ITA") === "USA",
      "其他国家的对手是本阵营领袖");
    assert("rivalNeverSelf", (() => {
      for (const k of Object.keys(CM.countries)) {
        if (prestigeRivalOf(k) === k) return false;
      }
      return true;
    })(), "任何实体都不应是自己的威望对手");
    assert("everyEntityGetsARival", (() => {
      // 第三级回退：CHN / IND / BRA 这类既非美苏、阵营也没有领袖映射的实体
      // 必须仍然拿到一个超级大国作为对手，否则威望对它们完全失效。
      const missing = Object.keys(CM.countries).filter((k) => !prestigeRivalOf(k));
      return missing.length === 0;
    })(), "每个实体都必须能解析出一个威望对手（否则该玩家的竞赛是空转的）");
    assert("nonSuperRivalIsSuperpower",
      ["USA", "SUN"].indexOf(prestigeRivalOf("CHN")) >= 0 &&
      ["USA", "SUN"].indexOf(prestigeRivalOf("IND")) >= 0,
      "非超级大国的对手应回退到超级大国，实为 CHN→" + prestigeRivalOf("CHN") + " IND→" + prestigeRivalOf("IND"));

    // ---- 5. 工程：花钱、拖累、上限、未知 id ----
    ST.player = "SUN";
    ST.mil = 4;
    initPoliticalCapital(true);
    const pc0 = ST.politicalCapital.value;
    const resUnknown = startPrestigeProgram("nope");
    assert("unknownProgramRejected", resUnknown.ok === false && resUnknown.reason === "unknown",
      "未知工程 id 必须被拒绝");
    const first = Object.keys(T.PROGRAMS)[0];
    const okStart = startPrestigeProgram(first);
    assert("programStarts", okStart.ok === true && ST.prestige.active.indexOf(first) >= 0, "工程应能启动");
    assert("programCostsPoliticalCapital", ST.politicalCapital.value < pc0,
      "启动工程必须消耗政治资本（" + pc0 + " → " + ST.politicalCapital.value + "）");
    assert("programDragEntersPmods", (() => {
      applyPlayerDecisions();
      const ek = entKeys("SUN");
      const pm = SIM.S.P.pmods[ek[0]];
      const expectDrag = -T.PROGRAMS[first].drag;
      // 军费 -4 加上工程拖累；用「含拖累 vs 不含拖累」的差值判定，避免依赖其他项
      const without = stopPrestigeProgram(first).ok;
      applyPlayerDecisions();
      const pmNo = SIM.S.P.pmods[ek[0]];
      startPrestigeProgram(first);
      applyPlayerDecisions();
      return without && near((pm - pmNo), expectDrag, 1e-6);
    })(), "工程拖累必须进入 P.pmods（与军费抢同一份资源）");
    // 上限
    const secondId = Object.keys(T.PROGRAMS)[1];
    initPoliticalCapital(true);
    startPrestigeProgram(secondId);
    const thirdId = Object.keys(T.PROGRAMS)[2];
    const resFull = startPrestigeProgram(thirdId);
    assert("maxActiveEnforced", resFull.ok === false && resFull.reason === "full",
      "超过 " + T.PARAMS.MAX_ACTIVE + " 项应被拒绝，实得 " + JSON.stringify(resFull.reason));
    assert("activeListBounded", ST.prestige.active.length === T.PARAMS.MAX_ACTIVE,
      "在建工程数应恰为上限，实为 " + ST.prestige.active.length);
    // 缺资本
    ST.politicalCapital.value = 1;
    stopPrestigeProgram(first); stopPrestigeProgram(secondId);
    const resPoor = startPrestigeProgram(thirdId);
    assert("insufficientCapitalRejected", resPoor.ok === false && resPoor.reason === "capital",
      "政治资本不足时必须拒绝，且不产生任何副作用");
    assert("rejectedStartLeavesNoTrace", ST.prestige.active.length === 0,
      "被拒绝的启动不得留下半启动状态");
    // 无玩家
    ST.player = null;
    assert("noPlayerCannotFund", startPrestigeProgram(thirdId).ok === false, "无执政者不得启动工程");

    // ---- 6. 工程产出 + 失败（人为把风险调到 1 制造必然事故）----
    ST.player = "SUN";
    initPoliticalCapital(true);
    const pp = initPrestigeState();
    pp.active = [first]; pp.since[first] = curMonthIdx(); pp.log = [];
    const preScore = prestigeOf("SUN");
    updatePrestigeRace(1984, 3, true);
    assert("programYieldsPrestige", prestigeOf("SUN") > preScore - 1,
      "在建工程应持续产出威望（衰减之外的净增益）");
    const realRisk = T.PROGRAMS[first].risk;
    T.PROGRAMS[first].risk = 1;                      // 必然失败
    const beforeFail = prestigeOf("SUN");
    pp.log = [];
    updatePrestigeRace(1984, 4, true);
    assert("failureCostsPrestige", pp.log.some((e) => e.fail === first),
      "风险触发时必须记录一次当众失败");
    assert("failureLowersScore", prestigeOf("SUN") < beforeFail,
      "失败必须扣威望（" + beforeFail + " → " + prestigeOf("SUN") + "）");
    T.PROGRAMS[first].risk = realRisk;                // 复原
    assert("failureIsDeterministic", (() => {
      T.PROGRAMS[first].risk = 0.012;
      const a = prestigeRoll(1984, 4, first) < 0.012;
      const b = prestigeRoll(1984, 4, first) < 0.012;
      T.PROGRAMS[first].risk = realRisk;
      return a === b;
    })(), "同一月份的失败判定必须可复现");

    // ---- 7. 政治后果：落差 → 内政 ----
    const domSun = (typeof polEconDomesticOf === "function") ? polEconDomesticOf("SUN") : null;
    assert("domesticSinkAvailable", !!domSun && typeof domSun.unrest === "number",
      "威望需要落到既有内政字段（动荡）");
    if (domSun) {
      domSun.unrest = 20;
      ST.prestige.scores.SUN = 90;
      ST.prestige.scores.USA = 20;
      updatePrestigeRace(1985, 6, true);
      assert("leadingCalmsUnrest", domSun.unrest < 20,
        "威望领先应压低社会动荡（20 → " + domSun.unrest + "）");
      domSun.unrest = 20;
      ST.prestige.scores.SUN = 20;
      ST.prestige.scores.USA = 90;
      updatePrestigeRace(1985, 7, true);
      assert("losingRaisesUnrest", domSun.unrest > 20,
        "威望落后（民族羞辱）应抬高社会动荡（20 → " + domSun.unrest + "）");
    }

    // ---- 8. 第三世界漂移：领先足够久 → 阵营真的变 ----
    ST.prestige.scores.SUN = 95;
    ST.prestige.scores.USA = 20;
    ST.prestige.leadMonths = 0;
    ST.prestige.drift = [];
    const naKeys = Object.keys(CM.countries).filter((k) =>
      T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[k].bloc) >= 0);
    assert("driftCandidatesExist", naKeys.length > 0, "应存在不结盟/中立实体作为漂移候选");
    const driftBefore = JSON.stringify(ST.blocOverride);
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) updatePrestigeRace(1986, 8, true);
    assert("driftHappensWhenLeadingLongEnough", ST.prestige.drift.length > 0,
      "连续领先 " + T.PARAMS.DRIFT_MONTHS + " 个月后应发生第三世界漂移，实为 " + ST.prestige.drift.length);
    assert("driftWritesBlocOverride", JSON.stringify(ST.blocOverride) !== driftBefore,
      "漂移必须真的写进 ST.blocOverride（否则地图与终局份额不会变）");
    if (ST.prestige.drift.length) {
      const dk = ST.prestige.drift[0];
      assert("driftedBlocMatchesLeader", blocOf(dk) === blocOf("SUN"),
        "被漂移的实体应归入领先方阵营（" + blocOf(dk) + " vs " + blocOf("SUN") + "）");
      assert("driftedIsNotPlayerOrRival", dk !== "SUN" && dk !== "USA",
        "漂移目标不得是玩家或对手本身");
    }
    assert("driftRespectsTotalCap", (() => {
      for (let i = 0; i < 60; i++) updatePrestigeRace(1987, 1, true);
      return ST.prestige.drift.length <= T.PARAMS.DRIFT_TOTAL;
    })(), "漂移总数必须受 DRIFT_TOTAL 限制（否则一方会吞掉整个世界）");
    // 落后时不漂移
    ST.prestige.leadMonths = 0;
    const driftLen = ST.prestige.drift.length;
    ST.prestige.scores.SUN = 10; ST.prestige.scores.USA = 95;
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) updatePrestigeRace(1988, 5, true);
    assert("noDriftWhenLosing", ST.prestige.drift.length === driftLen,
      "落后时不得继续漂移");

    // ---- 9. 存档往返与清洗 ----
    const rt = sanitizePrestigeState(JSON.parse(JSON.stringify(ST.prestige)));
    assert("roundTripKeepsScores", near(rt.scores.SUN, ST.prestige.scores.SUN, 1e-6),
      "存档往返后分数应不变");
    assert("roundTripKeepsFired", rt.fired.length === ST.prestige.fired.length,
      "存档往返后已结算里程碑数应不变");
    assert("roundTripKeepsDrift", rt.drift.length === ST.prestige.drift.length,
      "存档往返后漂移记录应不变");
    const junk = sanitizePrestigeState({ scores: { SUN: NaN, USA: 999, XXX: 5 },
      active: ["nope", Object.keys(T.PROGRAMS)[0]], fired: [1, "ms_mir"], drift: [{}, "POL"] });
    assert("sanitizeRejectsJunk", isFinite(junk.scores.USA) && junk.scores.USA <= T.PARAMS.SCORE_MAX &&
      junk.scores.SUN === undefined && junk.active.length === 1 &&
      junk.fired.length === 1 && junk.drift.length === 1,
      "非法存档字段必须被清洗，实得 " + JSON.stringify(junk.scores) + " active=" + junk.active.length);
    assert("sanitizeNullSafe", !!sanitizePrestigeState(null), "sanitizePrestigeState(null) 必须返回缺省状态");
    assert("sanitizeCapsActive", (() => {
      const all = Object.keys(T.PROGRAMS);
      return sanitizePrestigeState({ active: all }).active.length === T.PARAMS.MAX_ACTIVE;
    })(), "存档里的在建工程数必须被裁到上限");

    // ---- 10. 面板与顶栏 ----
    ST.player = "SUN";
    const board = prestigeBoardHtml();
    assert("boardRenders", typeof board === "string" && board.indexOf("威望竞赛") >= 0,
      "面板应渲染威望榜");
    assert("boardShowsGap", /vs/.test(board), "玩家模式下应显示与对手的对比");
    const progHtml = prestigeProgramsHtml();
    assert("programsRender", progHtml.indexOf("威望工程") >= 0 && /data-prog="/.test(progHtml),
      "面板应渲染工程按钮");
    assert("topbarPrestigeReadout", (() => {
      if (typeof setTop !== "function") return false;
      const before = $("r-pres") ? $("r-pres").textContent : null;
      setTop(ST.sel);
      const after = $("r-pres") ? $("r-pres").textContent : null;
      return after !== null && after !== before && after !== "–";
    })(), "顶栏威望读数应被真实写入（不可见的竞赛等于不存在的竞赛）");

    // ---- 11. 端到端：真实推进几个月，竞赛仍在推进 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1985, 1);
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    assert("endToEndMilestonesFired", ST.prestige.fired.length >= 4,
      "推进到 1985 后应已结算至少 4 起史实威望事件，实为 " + ST.prestige.fired.length);
    assert("endToEndScoresDiffer", Math.abs(prestigeOf("USA") - prestigeOf("SUN")) > 0.5,
      "推进后美苏威望应拉开差距（否则竞赛没有发生）");
    const e2e = prestigeSnapshot();
    assert("endToEndSnapshotConsistent",
      typeof e2e.score === "number" && typeof e2e.rivalScore === "number" &&
      near(e2e.gap, e2e.score - e2e.rivalScore, 0.02),
      "快照里的落差必须等于两分之差");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "prestigeprobe";
  d.style.display = "none";
  d.textContent = "PRESTIGEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
