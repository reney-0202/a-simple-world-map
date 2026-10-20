"use strict";

// ---- Phase E：长引信全链路探针 ----------------------------------------------
// 44 年只有 14 个剧本决策点；长引信补的是**玩家主动点火**的时刻：
// 现在埋下引信，数年后收割。要证明六件事：
//   1. 「长」是被强制的（≥24 个月），点火与燃烧都有真实代价；
//   2. 引爆按期发生，且**结局由引爆当月的国势决定，不掷骰**（三档）；
//   3. 引爆落点跨四条既有轴（威望/感召力/合法性/威慑可信度）+ 增长红利；
//   4. 「何时点火」是真决策：同一条引信，国势好=辉煌、国势坏=惨败；
//   5. 史实不变量 —— 零 RNG、旁观零回写、无点火零拖累；
//   6. 存档往返、面板可见。
function runFuseProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("FUSEPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = fuseTable();
    assert("tableLoaded", !!T && !!T.FUSES && !!T.PARAMS, "data/fuse.js 未载入");
    assert("apiPresent",
      typeof startFuse === "function" && typeof cancelFuse === "function" &&
      typeof updateMonthlyFuse === "function" && typeof fuseSnapshot === "function" &&
      typeof fuseOutcomeNow === "function" && typeof fuseGdpBonus === "function" &&
      typeof fuseProgramDrag === "function" && typeof fusePanelHtml === "function" &&
      typeof sanitizeFuseState === "function",
      "长引信 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");
    const P = T.PARAMS;

    // ---- 1. 表完整性：「长」是强制的，赌局有两面 ----
    assert("fusesAreLong", Object.keys(T.FUSES).every((id) => T.FUSES[id].months >= P.MIN_MONTHS),
      "每条引信必须 >= " + P.MIN_MONTHS + " 个月（校验器强制语义）");
    assert("fusesCostOnBothPhases", Object.keys(T.FUSES).every((id) =>
      T.FUSES[id].cost > 0 && T.FUSES[id].drag > 0),
      "点火（政治资本）与燃烧（GDP 拖累）必须都有代价");
    assert("outcomesHaveTwoFaces", Object.keys(T.FUSES).every((id) => {
      const g = T.FUSES[id].good || {}, b = T.FUSES[id].bad || {};
      return Object.keys(g).some((k) => g[k] !== 0) && Object.keys(b).some((k) => b[k] !== 0);
    }), "每条引信的结局表必须有赢有输（白送不是赌局）");

    // ---- 2. 点火：扣政治资本、上限、拒绝路径 ----
    const savedPlayer = ST.player;
    ST.player = "SUN"; ST.mil = 4;
    initFuseState(true);
    initPoliticalCapital(true);
    const pc0 = ST.politicalCapital.value;
    const firstId = Object.keys(T.FUSES)[0];
    const okStart = startFuse(firstId);
    assert("fuseStarts", okStart.ok === true && ST.fuses.burning[firstId] === T.FUSES[firstId].months,
      "点火应启动并装填完整引信，实得 " + JSON.stringify(okStart));
    assert("fuseCostsCapital", ST.politicalCapital.value < pc0,
      "点火必须消耗政治资本（" + pc0 + " → " + ST.politicalCapital.value + "）");
    assert("fuseRejectsUnknown", startFuse("nope").reason === "unknown", "未知引信必须被拒绝");
    assert("fuseRejectsDuplicate", startFuse(firstId).reason === "already", "同一引信不得重复点火");
    const secondId = Object.keys(T.FUSES)[1];
    initPoliticalCapital(true);
    startFuse(secondId);
    const thirdId = Object.keys(T.FUSES)[2];
    assert("maxActiveEnforced", startFuse(thirdId).reason === "full",
      "超过 " + P.MAX_ACTIVE + " 条同时燃烧应被拒绝");
    ST.politicalCapital.value = 1;
    cancelFuse(firstId); cancelFuse(secondId);
    assert("insufficientCapitalRejected", startFuse(thirdId).reason === "capital",
      "政治资本不足必须拒绝且无副作用");
    assert("rejectedLeavesNoTrace", Object.keys(ST.fuses.burning).length === 0,
      "被拒绝的点火不得留下半启动状态");
    ST.player = null;
    assert("noPlayerCannotIgnite", startFuse(thirdId).reason === "no-player",
      "无执政者不得点火");
    ST.player = "SUN";

    // ---- 3. 燃烧：倒计时 + 拖累真实 ----
    initFuseState(true);
    initPoliticalCapital(true);
    ST.fuses.burning[firstId] = T.FUSES[firstId].months;
    const dragBurn = fuseProgramDrag();
    assert("burnDragReal", dragBurn < 0, "燃烧期必须有 GDP 拖累（实为 " + dragBurn + "）");
    assert("burnCountsDown", (() => {
      updateMonthlyFuse(1985, 1, true);
      return ST.fuses.burning[firstId] === T.FUSES[firstId].months - 1;
    })(), "引信必须逐月缩短");
    assert("noBonusYet", fuseGdpBonus() === 0, "引爆前不得有增长红利");

    // ---- 4. 引爆三档：结局由国势决定，不掷骰 ----
    // 4a. 辉煌：polEcon 落差 +3、动荡低
    const setClimate = (surprise, unrest) => {
      initPolEcon(true);
      ST.polEcon.lastSurprise = surprise;
      const dom = polEconDomesticOf("SUN");
      if (dom && typeof dom.unrest === "number") dom.unrest = unrest;
    };
    const explodeOne = (surprise, unrest) => {
      initFuseState(true);
      ST.fuses.burning[firstId] = 1;         // 下个月引爆
      setClimate(surprise, unrest);
      const before = { pres: prestigeOf("SUN"), appeal: ideologyAppealOf("SUN") };
      updateMonthlyFuse(1985, 2, true);
      return { before: before, after: { pres: prestigeOf("SUN"), appeal: ideologyAppealOf("SUN") },
        log: ST.fuses.log[ST.fuses.log.length - 1], outcome: fuseOutcomeNow() };
    };
    const triumph = explodeOne(3, 10);
    assert("triumphOnGoodClimate", triumph.log && triumph.log.outcome === "triumph",
      "经济兑现 + 社会安定必须引爆为辉煌，实为 " + (triumph.log && triumph.log.outcome));
    assert("triumphPaysPrestige", triumph.after.pres > triumph.before.pres,
      "辉煌必须兑现威望（" + triumph.before.pres + " → " + triumph.after.pres + "）");
    assert("triumphPaysAppeal", triumph.after.appeal > triumph.before.appeal,
      "辉煌必须兑现感召力（" + triumph.before.appeal + " → " + triumph.after.appeal + "）");
    assert("fuseIgnitedLogsOnce", ST.fuses.log.length === 1, "引爆必须记入引信史");

    // 4b. 惨败：经济失约（落差 −3）或社会失控（动荡 85）
    const fiasco = explodeOne(-3, 85);
    assert("fiascoOnBadClimate", fiasco.log && fiasco.log.outcome === "fiasco",
      "经济失约 + 社会失控必须引爆为惨败，实为 " + (fiasco.log && fiasco.log.outcome));
    assert("fiascoCostsPrestige", fiasco.after.pres < fiasco.before.pres,
      "惨败必须扣威望（" + fiasco.before.pres + " → " + fiasco.after.pres + "）");

    // 4c. 不了了之：中间地带
    const muddle = explodeOne(0, 50);
    assert("muddleInBetween", muddle.log && muddle.log.outcome === "muddle",
      "中间地带必须是不了了之，实为 " + (muddle.log && muddle.log.outcome));

    // 4d. **确定性**：同国势同结果，且零 RNG（不掷骰是卖点）
    initFuseState(true);
    setClimate(3, 10);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const o1 = fuseOutcomeNow();
    const o2 = fuseOutcomeNow();
    assert("outcomeDeterministic", o1 === o2 && o1 === "triumph",
      "引爆结局必须由国势决定（同国势同结果），实为 " + o1 + "/" + o2);
    assert("outcomeConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true,
      "引爆判定不得消费引擎 RNG");

    // ---- 5. 引爆落点跨轴：威慑可信度 + 增长红利 ----
    initFuseState(true);
    initNukeState(true);
    const credBefore = ST.nuke.credBonus;
    ST.fuses.burning["alliance_deepening"] = 1;
    setClimate(3, 10);
    updateMonthlyFuse(1985, 3, true);
    assert("credibilityAxisReached", ST.nuke.credBonus > credBefore,
      "联盟深化的辉煌必须落到 N1 的威慑可信度（" + credBefore + " → " + ST.nuke.credBonus + "）");
    // 增长红利（能源自主的 good.bonus）
    initFuseState(true);
    ST.fuses.burning["energy_independence"] = 1;
    setClimate(3, 10);
    updateMonthlyFuse(1985, 4, true);
    const bonus = fuseGdpBonus();
    assert("growthBonusIgnites", bonus > 0,
      "能源自主的辉煌必须兑现增长红利（实为 " + bonus + "）");
    assert("bonusExpires", (() => {
      const months = ST.fuses.bonuses.length ? ST.fuses.bonuses[0].months : 0;
      for (let i = 0; i < months + 1; i++) updateMonthlyFuse(1985, 5 + (i % 12), true);
      return fuseGdpBonus() === 0;
    })(), "增长红利必须按期过期（持续性红利不是永久 buff）");

    // ---- 6. 「何时点火」是真决策：国势差时点火 = 赌翻盘 ----
    // 同一条引信，好国势辉煌、坏国势惨败 —— 已在 4a/4b 验证。
    // 此处验证引信长度给了决策窗口：点火后的 N 个月内可以反悔（沉没成本）。
    initFuseState(true);
    initPoliticalCapital(true);
    startFuse(firstId);                    // 真实点火（扣政治资本）
    const capBefore = ST.politicalCapital.value;
    const cancelRes = cancelFuse(firstId);
    assert("fuseCancelable", cancelRes.ok === true && ST.fuses.burning[firstId] === undefined,
      "燃烧中的引信应可撤回（政治资本不退 —— 沉没成本）");
    assert("cancelIsSunkenCost", ST.politicalCapital.value === capBefore,
      "撤回不得退回政治资本（沉没成本），实得 " + ST.politicalCapital.value + " vs " + capBefore);

    // ---- 7. 史实不变量：旁观零回写、零 RNG ----
    ST.player = null;
    initFuseState(true);
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const rngA = SIM.S ? SIM.S.rngState : null;
    for (let i = 0; i < 6; i++) updateMonthlyFuse(1986, 1 + i, true);
    assert("spectatorNoFuseWrites", Object.keys(ST.fuses.burning).length === 0 &&
      ST.fuses.log.length === 0, "旁观者没有引信，也就没有引爆");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "旁观不得写内政");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true,
      "旁观不得写 pmods");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngA : true, "不得消费引擎 RNG");
    // 无点火 = 零拖累（史实轨迹不受影响的机制保证）
    assert("noFuseNoDrag", fuseProgramDrag() === 0 && fuseGdpBonus() === 0,
      "无点火时拖累与红利都必须为 0");

    // ---- 8. 存档往返与清洗 ----
    initFuseState(true);
    ST.fuses.burning[firstId] = 40;
    ST.fuses.bonuses = [{ gdpBonus: 0.35, months: 36 }];
    const rt = sanitizeFuseState(JSON.parse(JSON.stringify(ST.fuses)));
    assert("roundTripKeepsFuse", rt.burning[firstId] === 40 && rt.bonuses.length === 1,
      "存档往返后燃烧状态与红利应保留");
    const junk = sanitizeFuseState({ burning: { nope: 10, [firstId]: -5, [secondId]: 9999 },
      bonuses: [{ gdpBonus: NaN, months: 5 }, { gdpBonus: 0.3, months: -1 }], log: [1, { id: "f1" }] });
    assert("sanitizeRejectsJunk", junk.burning.nope === undefined &&
      junk.burning[firstId] === undefined && junk.burning[secondId] === T.FUSES[secondId].months &&
      junk.bonuses.length === 0 && junk.log.length === 1,
      "非法存档字段必须被清洗（未知引信/负数/越界/NaN 红利）");
    assert("sanitizeNullSafe", !!sanitizeFuseState(null), "sanitizeFuseState(null) 必须返回缺省状态");

    // ---- 9. 面板：引信条 + 点火按钮 + 国势提示 ----
    ST.player = "SUN";
    initFuseState(true);
    ST.fuses.burning[firstId] = 25;
    const html = fusePanelHtml();
    assert("panelRenders", html.indexOf("长引信") >= 0, "面板应渲染长引信块");
    assert("panelShowsCountdown", html.indexOf("25 月") >= 0, "面板应显示引信倒计时");
    assert("panelShowsIgnitionHint", html.indexOf("引爆当月的国势决定结局") >= 0,
      "面板应提示「结局由国势决定」（点火时机的决策性要可见）");
    assert("panelOffersFuses", /data-fuse="/.test(html), "面板应给出点火按钮");

    // ---- 10. 端到端：真实推进，引信按期引爆 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    startFuse("tech_education");           // 60 个月的引信
    const logBefore = ST.fuses.log.length;
    simFastForward(1985, 1);               // 1980-01 → 1985-01 = 60 个月 = 引信长度
    const snap = fuseSnapshot();
    assert("endToEndFuseDetonated", ST.fuses.log.length > logBefore && snap.active === 0,
      "60 个月后引信必须已经引爆（log +" + (ST.fuses.log.length - logBefore) + "，active=" + snap.active + "）");
    assert("endToEndNoLeftoverDrag", snap.drag === 0, "引爆后拖累必须归零（实为 " + snap.drag + "）");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "fuseprobe";
  d.style.display = "none";
  d.textContent = "FUSEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
