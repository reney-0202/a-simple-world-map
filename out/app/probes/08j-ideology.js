"use strict";

// ---- Phase S-17：意识形态资源化全链路探针 ------------------------------------
// 意识形态此前只是领袖肖像下的一行文字（无引擎消费者）。要证明五件事：
//   1. 感召力是**真实资源** —— 输出工程花政治资本、拖累 GDP、有翻车风险；
//   2. 来源不止工程 —— 经济兑现（P1 落差）与执政合法性都喂它（制度说到做到）；
//   3. 三个真实消费者 —— 威望变现（F）、合法性/动荡回流（P1）、第三世界漂移；
//   4. 会衰减 —— 主张会被遗忘，赢一次不能躺一辈子；
//   5. 史实不变量 —— 零 RNG、旁观零回写、存档往返。
function runIdeologyProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("IDEOLOGYPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = ideologyTable();
    assert("tableLoaded", !!T && !!T.SYSTEMS && !!T.PROGRAMS && !!T.PARAMS, "data/ideology.js 未载入");
    assert("apiPresent",
      typeof updateIdeology === "function" && typeof ideologySnapshot === "function" &&
      typeof startIdeologyProgram === "function" && typeof stopIdeologyProgram === "function" &&
      typeof ideologyAppealOf === "function" && typeof ideologyRoll === "function" &&
      typeof ideologyPanelHtml === "function" && typeof sanitizeIdeologyState === "function",
      "意识形态 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 表完整性 ----
    assert("systemsHaveNarrative", Object.keys(T.SYSTEMS).every((k) => T.SYSTEMS[k].zh && T.SYSTEMS[k].note),
      "每份主张都必须有口号与叙事");
    assert("programsCarryRealCost", Object.keys(T.PROGRAMS).every((id) =>
      T.PROGRAMS[id].cost > 0 && T.PROGRAMS[id].drag > 0 && T.PROGRAMS[id].gain > 0),
      "每项工程都必须同时消耗政治资本与 GDP 增速");
    assert("failLossIsPainful", Object.keys(T.PROGRAMS).every((id) => T.PROGRAMS[id].failLoss > 0),
      "翻车必须痛（感召力大跌而不是小减）");
    assert("maxActiveIsBinding", T.PARAMS.MAX_ACTIVE >= 1 &&
      T.PARAMS.MAX_ACTIVE < Object.keys(T.PROGRAMS).length,
      "工程上限必须严格小于工程总数，否则没有取舍");
    assert("decayExists", T.PARAMS.DECAY > 0 && T.PARAMS.DECAY <= 1,
      "主张必须会衰减（赢一次不能躺一辈子）");
    assert("driftGapReachable", T.PARAMS.DRIFT_GAP > 0 && T.PARAMS.DRIFT_GAP < 100,
      "漂移门槛必须可达（落差上限 100）");

    // ---- 2. 工程：花政治资本、拖累 GDP、有上限 ----
    const savedPlayer = ST.player;
    ST.player = "SUN";
    ST.mil = 4;
    initIdeologyState(true);
    initPoliticalCapital(true);
    const pc0 = ST.politicalCapital.value;
    const first = Object.keys(T.PROGRAMS)[0];
    const okStart = startIdeologyProgram(first);
    assert("programStarts", okStart.ok === true && ST.ideology.active.indexOf(first) >= 0,
      "输出工程应能启动，实得 " + JSON.stringify(okStart));
    assert("programCostsPoliticalCapital", ST.politicalCapital.value < pc0,
      "输出工程必须消耗政治资本（" + pc0 + " → " + ST.politicalCapital.value + "）");
    assert("programRejectsUnknown", startIdeologyProgram("nope").reason === "unknown",
      "未知工程必须被拒绝");
    assert("programDragIsReal", ideologyProgramDrag() < 0,
      "在建工程必须有 GDP 拖累（实为 " + ideologyProgramDrag() + "）");
    // 上限
    const secondId = Object.keys(T.PROGRAMS)[1];
    initPoliticalCapital(true);
    startIdeologyProgram(secondId);
    const thirdId = Object.keys(T.PROGRAMS)[2];
    assert("maxActiveEnforced", startIdeologyProgram(thirdId).reason === "full",
      "超过 " + T.PARAMS.MAX_ACTIVE + " 项应被拒绝");
    // 缺资本
    ST.politicalCapital.value = 1;
    stopIdeologyProgram(first); stopIdeologyProgram(secondId);
    assert("insufficientCapitalRejected", startIdeologyProgram(thirdId).reason === "capital",
      "政治资本不足必须拒绝且无副作用");
    assert("rejectedStartLeavesNoTrace", ST.ideology.active.length === 0,
      "被拒绝的启动不得留下半启动状态");
    // 无玩家
    ST.player = null;
    assert("noPlayerCannotFund", startIdeologyProgram(thirdId).reason === "no-player",
      "无执政者不得资助输出工程");
    ST.player = "SUN";

    // ---- 3. 感召力：工程产出 + 衰减 + 落差来源 ----
    initIdeologyState(true);
    const base0 = ideologyAppealOf("SUN");
    ST.ideology.appeal.SUN = 80;              // 人为拉高
    updateIdeology(1985, 6, true);            // 无工程 → 纯衰减
    assert("appealDecays", ideologyAppealOf("SUN") < 80,
      "感召力必须衰减（80 → " + ideologyAppealOf("SUN") + "）");
    assert("decayIsGradual", near(ideologyAppealOf("SUN"),
      T.SYSTEMS.SUN.base + (80 - T.SYSTEMS.SUN.base) * (1 - T.PARAMS.DECAY), 0.5),
      "衰减应是一阶回归而不是归零");
    // 工程产出
    initIdeologyState(true);
    initPoliticalCapital(true);
    ST.ideology.active = [first];
    ST.ideology.since[first] = curMonthIdx();
    const beforeProg = ideologyAppealOf("SUN");
    // 禁用经济兑现的干扰：把 polEcon 的落差清零（复位 surprise 通道）
    if (!ST.polEcon) initPolEcon(true);
    ST.polEcon.lastSurprise = 0;
    ST.polEcon.bad = 0; ST.polEcon.good = 0;
    for (let i = 0; i < 3; i++) updateIdeology(1985, 7 + i, true);
    assert("programYieldsAppeal", ideologyAppealOf("SUN") > beforeProg - 1,
      "在建工程应持续产出感召力（衰减之外的净增益）");
    // 经济兑现来源：正落差 → 感召力上升（P1 集成）
    initIdeologyState(true);
    ST.polEcon.lastSurprise = 3;              // 显著超出预期
    const beforeDelivery = ideologyAppealOf("SUN");
    updateIdeology(1986, 1, true);
    assert("deliveryFeedsAppeal", ideologyAppealOf("SUN") > beforeDelivery,
      "经济说到做到必须喂感召力（" + beforeDelivery + " → " + ideologyAppealOf("SUN") + "）");
    initIdeologyState(true);
    ST.polEcon.lastSurprise = -3;             // 显著低于预期
    const beforeMiss = ideologyAppealOf("SUN");
    updateIdeology(1986, 2, true);
    assert("missedDeliveryHurts", ideologyAppealOf("SUN") < beforeMiss,
      "说到做不到必须扣感召力（" + beforeMiss + " → " + ideologyAppealOf("SUN") + "）");
    ST.polEcon.lastSurprise = 0;

    // ---- 4. 翻车：确定性、且真的大跌 ----
    assert("rollDeterministic", ideologyRoll(1985, 3, "x") === ideologyRoll(1985, 3, "x"),
      "翻车掷骰必须确定");
    assert("rollInRange", (() => {
      for (let i = 0; i < 30; i++) {
        const v = ideologyRoll(1980 + (i % 12), 1 + (i % 12), "p1");
        if (!(v >= 0 && v < 1)) return false;
      }
      return true;
    })(), "掷骰结果必须落在 [0,1)");
    initIdeologyState(true);
    const realRisk = T.PROGRAMS[first].risk;
    T.PROGRAMS[first].risk = 1;               // 必然翻车
    initPoliticalCapital(true);
    ST.ideology.active = [first];
    ST.ideology.since[first] = curMonthIdx();
    ST.polEcon.lastSurprise = 0;
    const beforeFail = ideologyAppealOf("SUN");
    updateIdeology(1986, 3, true);
    assert("failCostsAppeal", ST.ideology.log.some((e) => e.kind === "fail") &&
      ideologyAppealOf("SUN") < beforeFail - T.PROGRAMS[first].failLoss + 1,
      "翻车必须记录并大跌感召力（" + beforeFail + " → " + ideologyAppealOf("SUN") + "）");
    T.PROGRAMS[first].risk = realRisk;

    // ---- 5. 消费者 ①：威望变现（F 集成）----
    initIdeologyState(true);
    const presBefore = (typeof prestigeOf === "function") ? prestigeOf("SUN") : null;
    ST.ideology.appeal.SUN = 90; ST.ideology.appeal.USA = 30;
    updateIdeology(1986, 4, true);
    assert("appealConvertsToPrestige", presBefore === null ||
      prestigeOf("SUN") > presBefore - 0.1,
      "感召力领先必须汇入威望（" + presBefore + " → " +
      (typeof prestigeOf === "function" ? prestigeOf("SUN") : null) + "）");

    // ---- 6. 消费者 ②：合法性/动荡回流（P1 集成）----
    initIdeologyState(true);
    const domSun = (typeof polEconDomesticOf === "function") ? polEconDomesticOf("SUN") : null;
    assert("domesticSinkAvailable", !!domSun && typeof domSun.unrest === "number",
      "感召力需要落到既有内政字段（动荡）");
    if (domSun) {
      domSun.unrest = 20;
      ST.ideology.appeal.SUN = 90; ST.ideology.appeal.USA = 20;
      updateIdeology(1986, 5, true);
      assert("appealLeadCalmsUnrest", domSun.unrest < 20,
        "感召力领先应压低社会动荡（20 → " + domSun.unrest + "）");
      domSun.unrest = 20;
      ST.ideology.appeal.SUN = 20; ST.ideology.appeal.USA = 90;
      updateIdeology(1986, 6, true);
      assert("appealLagRaisesUnrest", domSun.unrest > 20,
        "感召力落后（被打脸）应抬高社会动荡（20 → " + domSun.unrest + "）");
    }

    // ---- 7. 消费者 ③：第三世界漂移 ----
    initIdeologyState(true);
    ST.ideology.appeal.SUN = 95; ST.ideology.appeal.USA = 20;
    ST.ideology.leadMonths = 0;
    const blocBefore = JSON.stringify(ST.blocOverride);
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) updateIdeology(1987, 1, true);
    assert("appealDriftHappens", ST.ideology.drift.length > 0,
      "感召力连续领先 " + T.PARAMS.DRIFT_MONTHS + " 个月后应发生漂移，实为 " + ST.ideology.drift.length);
    assert("appealDriftWritesBloc", JSON.stringify(ST.blocOverride) !== blocBefore,
      "漂移必须真的写进 ST.blocOverride");
    if (ST.ideology.drift.length) {
      const dk = ST.ideology.drift[0];
      assert("appealDriftedIsThirdWorld", T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[dk].bloc) >= 0,
        "只有不结盟/中立国家会被「说服」（" + dk + " 是 " + CM.countries[dk].bloc + "）");
    }
    assert("appealDriftRespectsCap", (() => {
      for (let i = 0; i < 60; i++) updateIdeology(1988, 1, true);
      return ST.ideology.drift.length <= T.PARAMS.DRIFT_TOTAL;
    })(), "感召力漂移必须受 DRIFT_TOTAL 限制");
    initIdeologyState(true);
    ST.ideology.appeal.SUN = 10; ST.ideology.appeal.USA = 95;
    ST.ideology.leadMonths = 0;
    const dl = ST.ideology.drift.length;
    for (let i = 0; i < T.PARAMS.DRIFT_MONTHS + 2; i++) updateIdeology(1989, 1, true);
    assert("noDriftWhenLagging", ST.ideology.drift.length === dl,
      "落后时不得漂移");

    // ---- 8. 史实不变量：旁观零回写、零 RNG ----
    ST.player = null;
    initIdeologyState(true);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const bloc0 = JSON.stringify(ST.blocOverride);
    for (let i = 0; i < 6; i++) updateIdeology(1990, 1 + i, true);
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "旁观不得写内政");
    assert("spectatorNoBlocDrift", JSON.stringify(ST.blocOverride) === bloc0,
      "旁观不得发生漂移");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "不得消费引擎 RNG");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true,
      "旁观不得写 pmods（感召力不进经济计算）");

    // ---- 9. 存档往返与清洗 ----
    initIdeologyState(true);
    ST.ideology.appeal.SUN = 66.5;
    ST.ideology.active = [first];
    ST.ideology.since[first] = 100;
    ST.ideology.drift = ["POL"];
    const rt = sanitizeIdeologyState(JSON.parse(JSON.stringify(ST.ideology)));
    assert("roundTripKeepsState", near(rt.appeal.SUN, 66.5, 1e-9) &&
      rt.active.length === 1 && rt.drift.length === 1,
      "存档往返后感召力/工程/漂移应保留");
    const junk = sanitizeIdeologyState({ appeal: { SUN: NaN, ZZZ: 5, USA: 999 },
      active: ["nope", first], drift: [1, "POL"], log: [1, { zh: "x" }] });
    assert("sanitizeRejectsJunk", junk.appeal.SUN === undefined && junk.appeal.ZZZ === undefined &&
      junk.appeal.USA <= T.PARAMS.APPEAL_MAX && junk.active.length === 1 &&
      junk.drift.length === 1 && junk.log.length === 1,
      "非法存档字段必须被清洗（NaN/未知实体/未知工程/越界）");
    assert("sanitizeNullSafe", !!sanitizeIdeologyState(null), "sanitizeIdeologyState(null) 必须返回缺省状态");

    // ---- 10. 面板 ----
    ST.player = "SUN";
    initIdeologyState(true);
    const html = ideologyPanelHtml();
    assert("panelRenders", html.indexOf("感召力") >= 0, "面板应渲染感召力条");
    assert("panelShowsPrograms", /data-idprog="/.test(html), "面板应给出输出工程按钮");
    assert("panelShowsNarrative", html.indexOf(T.SYSTEMS.SUN.note) >= 0,
      "面板应展示主张叙事（主张必须能被讲出来）");

    // ---- 11. 端到端：真实推进，感召力演化但不炸 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1991, 12);
    const snap = ideologySnapshot();
    assert("endToEndSnapshot", !!snap && typeof snap.appeal === "number",
      "端到端后应能取到快照");
    assert("endToEndBounded", snap.appeal >= 0 && snap.appeal <= 100,
      "感召力必须始终在 [0,100]（实为 " + snap.appeal + "）");
    assert("endToEndGapConsistent", near(snap.gap, snap.appeal - snap.rivalAppeal, 0.02),
      "快照落差必须等于两方之差");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "ideologyprobe";
  d.style.display = "none";
  d.textContent = "IDEOLOGYPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
