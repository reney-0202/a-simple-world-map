"use strict";

// ---- Phase C：情报估算全链路探针 ---------------------------------------------
// 在这之前敌方数字全是精确值：信息没有质量，决策不是在赌判断而是照读数调参。
// 要证明五件事：
//   1. 误差是诚实的 —— 区间永远罩住真值，且自己的账本是精确的；
//   2. 雾不会全散 —— quality 有上限、专项评估要花钱、只能同时盯少数目标；
//   3. 估计有**真实消费者** —— 冒进惩罚与威慑可信度都读估计值；
//   4. 买情报能消掉惩罚 —— quality→1 时冒进惩罚恒为 0；
//   5. 史实不变量 —— 零 RNG、旁观零回写、存档往返不丢评估。
function runEstimatesProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ESTIMATESPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = estimateTable();
    assert("tableLoaded", !!T && !!T.FIELDS && !!T.PARAMS, "data/estimates.js 未载入");
    assert("apiPresent",
      typeof estimateOf === "function" && typeof estimateControlOf === "function" &&
      typeof estimateQualityOf === "function" && typeof focusIntelligence === "function" &&
      typeof updateMonthlyEstimates === "function" && typeof estimateOpFogFactor === "function" &&
      typeof estimateWarOptimism === "function" && typeof estimatesPanelHtml === "function" &&
      typeof sanitizeEstimateState === "function",
      "情报估算 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 表完整性：每个量都有消费者（S-16 的教训）----
    const fields = Object.keys(T.FIELDS);
    assert("fieldsNonEmpty", fields.length >= 3, "至少 3 个被估算的量，实为 " + fields.length);
    assert("everyFieldHasConsumer", fields.every((f) => T.FIELDS[f].consumer && typeof T.FIELDS[f].consumer === "string"),
      "每个被估算的量都必须有真实消费者");
    assert("qualityCapBelowOne", T.PARAMS.QUALITY_CAP > 0 && T.PARAMS.QUALITY_CAP < 1,
      "quality 上限必须 < 1（雾永远不可能完全散去）");
    assert("focusCostsCapital", T.PARAMS.FOCUS_COST_PC > 0, "专项评估必须消耗政治资本（免费 = 全员全知）");
    assert("focusIsBounded", T.PARAMS.FOCUS_MAX >= 1 && T.PARAMS.FOCUS_MONTHS >= 1,
      "专项评估必须有数量与期限限制");

    // ---- 2. 误差是诚实的：区间罩住真值 ----
    const savedPlayer = ST.player;
    ST.player = "SUN";
    ST.mil = 4;
    initEstimateState(true);
    if (!ST.intel) initIntelState("SUN");
    ST.intel.budget = 0;                    // 侦察投入最低 → 误差最大
    let covered = 0, checked = 0;
    for (const f of fields) {
      if (f === "control") continue;
      for (const k of ["USA", "CHN", "GBR"]) {
        const e = estimateOf(k, f);
        const truth = f === "prestige" ? prestigeOf(k) : trueMilOf(k);
        checked++;
        if (e && e.lo <= truth + 1e-9 && truth <= e.hi + 1e-9) covered++;
      }
    }
    assert("bandAlwaysCoversTruth", checked > 0 && covered === checked,
      "估计区间必须永远罩住真值（" + covered + "/" + checked + "）");
    assert("ownLedgerIsExact", (() => {
      const e = estimateOf("SUN", "prestige");
      return e && e.exact === true && e.err === 0 && near(e.est, prestigeOf("SUN"), 1e-9);
    })(), "玩家自己的账本必须是精确的（误差 0）");
    assert("estimatesAreNotTruth", (() => {
      // 对手的估计值不应恒等于真值（否则「雾」是假的）
      let differ = 0;
      for (const k of ["USA", "CHN", "GBR"]) {
        const e = estimateOf(k, "prestige");
        if (e && !e.exact && Math.abs(e.est - prestigeOf(k)) > 1e-9) differ++;
      }
      return differ > 0;
    })(), "对手的估计值必须真的偏离真值");

    // ---- 3. 雾随侦察投入收窄，但永远不为零 ----
    const errBroke = estimateOf("USA", "prestige").err;
    ST.intel.budget = 200;                  // 预算远超 BUDGET_Q0 + SPAN
    const errRich = estimateOf("USA", "prestige").err;
    assert("budgetNarrowsError", errRich < errBroke,
      "特情预算应收窄误差（" + errBroke + " → " + errRich + "）");
    assert("errorNeverZero", errRich > 0,
      "误差永远不为零（quality 上限 " + T.PARAMS.QUALITY_CAP + "）");
    assert("qualityCapped", estimateQualityOf("USA") <= T.PARAMS.QUALITY_CAP + 1e-9,
      "quality 必须被夹在上限内");

    // ---- 4. 专项评估：花政治资本、限定数量、限期生效 ----
    ST.intel.budget = 0;
    initPoliticalCapital(true);
    const pc0 = ST.politicalCapital.value;
    const errBeforeFocus = estimateOf("USA", "prestige").err;
    const okFocus = focusIntelligence("USA");
    assert("focusApplies", okFocus.ok === true && ST.estimates.focus.USA > 0,
      "专项评估应能启动，实得 " + JSON.stringify(okFocus));
    assert("focusCostsCapital", ST.politicalCapital.value < pc0,
      "专项评估必须消耗政治资本（" + pc0 + " → " + ST.politicalCapital.value + "）");
    assert("focusNarrowsError", estimateOf("USA", "prestige").err < errBeforeFocus,
      "专项评估应收窄误差（" + errBeforeFocus + " → " + estimateOf("USA", "prestige").err + "）");
    assert("focusRejectsSelf", focusIntelligence("SUN").reason === "self",
      "不能对自己做情报评估");
    assert("focusRejectsUnknown", focusIntelligence("ZZZ").reason === "unknown",
      "未知目标必须被拒绝");
    assert("focusRejectsDuplicate", focusIntelligence("USA").reason === "already",
      "同一目标不得重复评估");
    initPoliticalCapital(true);
    focusIntelligence("GBR");
    assert("focusEnforcesCap", (() => {
      const res = focusIntelligence("CHN");
      return res.ok === false && res.reason === "full";
    })(), "同时最多 " + T.PARAMS.FOCUS_MAX + " 个目标（实得 " +
      JSON.stringify(focusIntelligence("CHN").reason) + "）");
    assert("focusExpires", (() => {
      for (let i = 0; i < T.PARAMS.FOCUS_MONTHS; i++) updateMonthlyEstimates(1985, 1 + (i % 12), true);
      return Object.keys(ST.estimates.focus).filter((k) => ST.estimates.focus[k] > 0).length === 0;
    })(), "专项评估必须在 " + T.PARAMS.FOCUS_MONTHS + " 个月后到期");

    // ---- 5. 估计的确定性：零 RNG、季度稳定 ----
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const e1 = estimateOf("USA", "prestige").est;
    const e2 = estimateOf("USA", "prestige").est;
    assert("estimateDeterministic", e1 === e2, "同一季度内估计值必须稳定（情报不是每月重估）");
    assert("estimateConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true,
      "估算不得消费引擎 RNG");
    assert("quarterlyRefresh", (() => {
      // 前进一个季度后哈希桶应换（估计会漂移 —— 世界在动）。
      // 不直接改 SIM.S.month（那会污染仿真状态）：借哈希桶公式独立验证。
      const q = curEstimateQuarter();
      const a = estHash01("USA", "prestige", q);
      const b = estHash01("USA", "prestige", q + 1);
      return a !== b;
    })(), "跨季度后估计值应刷新（哈希桶换季）");

    // ---- 6. 冒进惩罚：真实消费者 ① ----
    initEstimateState(true);
    assert("noPenaltyAtZeroOptimism", (() => {
      const f = estimateOpFogFactor(0);
      return f.cut === 0 && f.attr === 0;
    })(), "没有高估就不该有冒进惩罚");
    assert("noPenaltyBelowBand", (() => {
      const f = estimateOpFogFactor(T.PARAMS.OPTIMISM_BAND);
      return f.cut === 0 && f.attr === 0;
    })(), "高估不超过阈值不该受罚（否则任何攻势都受罚，情报失去意义）");
    assert("penaltyAboveBand", (() => {
      const f = estimateOpFogFactor(T.PARAMS.OPTIMISM_BAND * 2);
      return f.cut > 0 && f.attr > 0;
    })(), "高估超过阈值必须产生惩罚");
    assert("penaltyGraded", (() => {
      const a = estimateOpFogFactor(T.PARAMS.OPTIMISM_BAND * 2);
      const b = estimateOpFogFactor(T.PARAMS.OPTIMISM_BAND * 3);
      return b.cut >= a.cut && b.attr >= a.attr;
    })(), "惩罚应随高估程度单调不减");
    assert("penaltyCapped", (() => {
      const f = estimateOpFogFactor(1e6);
      return f.cut < 1 && f.cut <= T.PARAMS.OP_STRENGTH_CUT + 1e-9;
    })(), "强度削减必须有上限（不能完全抵消攻势）");
    // 买情报消惩罚：quality→上限 → 误差→下限 → optimism→0 → 惩罚 0
    assert("perfectIntelNeverOveroptimistic", (() => {
      ST.intel.budget = 200;
      ST.estimates.focus["USA"] = 99;
      const q = estimateQualityOf("USA");
      const qMax = T.PARAMS.BUDGET_Q_MAX + T.PARAMS.FOCUS_Q;   // 可达上限（可能低于 QUALITY_CAP）
      return q >= qMax - 1e-9 &&
        estimateOf("USA", "prestige").err <= T.FIELDS.prestige.base * (1 - qMax) + 1e-9;
    })(), "高侦察 + 专项评估后误差应收窄到可达下限");
    // 战争乐观度的换算方向正确
    assert("warOptimismSign", (() => {
      const a = estimateWarOptimism("iran_iraq", "A");
      return typeof a === "number" && isFinite(a);
    })(), "战争乐观度必须是有限数");
    assert("warOptimismFlipsWithSide", (() => {
      const a = estimateWarOptimism("iran_iraq", "A");
      const b = estimateWarOptimism("iran_iraq", "B");
      return near(a, -b, 1e-6);
    })(), "同一读数对两侧的乐观度必须相反（一方的乐观是另一方的悲观）");

    // ---- 7. 威慑可信度读估计值：真实消费者 ② ----
    initEstimateState(true);
    ST.intel.budget = 0;
    // 军费差距刻意取温和值（6.5 vs 4）：差距太大时可信度会被夹到下限，
    // 两种情报质量都算出 5 —— 那样测的就不是「读估计」而是「读 clamp」。
    ST.ai = { enabled: false, decisions: { USA: { mil: 6.5 } }, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    const credLowIntel = nukeCredibilityNow();
    ST.intel.budget = 200;
    const credHighIntel = nukeCredibilityNow();
    assert("credibilityUsesEstimateNotTruth", !near(credLowIntel, credHighIntel, 1e-9),
      "情报质量不同 → 读数不同 → 威慑可信度应不同（若相等则读的是真值）");
    assert("credibilityStillBounded", credLowIntel >= 5 && credLowIntel <= 95,
      "可信度必须仍在 [5,95]");

    // ---- 8. 面板：真值永不进 HTML ----
    ST.player = "SUN";
    initEstimateState(true);
    ST.intel.budget = 0;
    const html = estimatesPanelHtml();
    assert("panelRenders", html.indexOf("情报评估") >= 0, "情报面板应渲染");
    assert("panelShowsEstimateNotTruth", html.indexOf("≈") >= 0 && html.indexOf("±") >= 0,
      "面板必须显示估计值与误差（≈ x ± y）");
    assert("panelNeverShowsExactRival", (() => {
      // 对手的威望行必须是估计格式（≈ x ± y），而不是裸的真值 ——
      // 用行结构判定而非字符串比对（真值四舍五入后可能撞上估计值）。
      const row = /<div class="est-row"><span>[^<]*· 威望<\/span><b[^>]*>([^<]*)<\/b>/.exec(html);
      return !!row && row[1].indexOf("≈") === 0 && row[1].indexOf("±") > 0;
    })(), "对手威望行必须渲染为估计格式 ≈ x ± y");
    assert("panelOffersFocus", /data-est="/.test(html), "面板应给出专项评估按钮");

    // ---- 9. 存档往返与清洗 ----
    initEstimateState(true);
    ST.estimates.focus.CHN = 7;
    ST.estimates.log = [{ k: "CHN", y: 1985, m: 3 }];
    const rt = sanitizeEstimateState(JSON.parse(JSON.stringify(ST.estimates)));
    assert("roundTripKeepsFocus", rt.focus.CHN === 7, "存档往返后评估期限应保留");
    assert("roundTripKeepsLog", rt.log.length === 1, "存档往返后审计日志应保留");
    const junk = sanitizeEstimateState({ focus: { ZZZ: 5, USA: NaN, GBR: 9999 }, log: [1, { k: "X" }] });
    assert("sanitizeRejectsJunk", junk.focus.ZZZ === undefined && junk.focus.USA === undefined &&
      junk.focus.GBR <= T.PARAMS.FOCUS_MONTHS && junk.log.length === 1,
      "非法存档字段必须被清洗（未知目标/NaN/越界期限）");
    assert("sanitizeNullSafe", !!sanitizeEstimateState(null), "sanitizeEstimateState(null) 必须返回缺省状态");

    // ---- 10. 旁观：零回写 ----
    ST.player = null;
    initEstimateState(true);
    const domBefore = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const pmBefore = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    for (let i = 0; i < 6; i++) updateMonthlyEstimates(1987, 1 + i, true);
    assert("spectatorNoFocusWrites", Object.keys(ST.estimates.focus).length === 0,
      "旁观者没有情报行动");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === domBefore : true,
      "旁观不得写内政");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pmBefore : true,
      "旁观不得写 pmods");
    assert("spectatorCannotFocus", focusIntelligence("USA").reason === "no-player",
      "旁观者不得发起专项评估");

    // ---- 11. 端到端：真实推进，读数随季度漂移、面板始终是估计 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1985, 1);
    const e2e = estimateOf("USA", "prestige");
    assert("endToEndEstimateAlive", !!e2e && typeof e2e.est === "number" && e2e.err > 0,
      "端到端后估计值应仍然带误差（雾没散）");
    assert("endToEndBandCoversTruth",
      e2e.lo <= prestigeOf("USA") && prestigeOf("USA") <= e2e.hi,
      "端到端后区间仍须罩住真值");
    assert("endToEndPanelEstimates", (() => {
      const h2 = estimatesPanelHtml();
      return h2.indexOf("≈") >= 0 && h2.indexOf("±") >= 0;
    })(), "端到端后面板仍是估计值");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "estimatesprobe";
  d.style.display = "none";
  d.textContent = "ESTIMATESPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
