"use strict";

// ---- Phase P1：账单到期（经济 → 政治闭环）全链路探针 -------------------------
// 这个探针要证明的不是「代码跑起来了」，而是**回路真的闭合了**：
//   · 无执政者 / 无经济史 → 一律不产生账单（史实轨迹不可能被这个模块污染）；
//   · 增长显著差于国民预期 → 执政路线被问责、动荡上升、账单入册；
//   · 增长显著好于预期 → 执政路线得分、动荡回落；
//   · 期望锚是适应性的 → 一次性刺激买不到永久红利；
//   · 储备见底是独立的第二种账单；
//   · 全程零 RNG 消费、零 pmods 注入、存档往返不丢账。
function runPolEconProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("POLECONPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = polEconTable();
    assert("tableLoaded", !!T, "data/polecon.js 未载入（window.W1980_POLECON 缺失）");
    assert("apiPresent",
      typeof updatePoliticalEconomy === "function" && typeof polEconSnapshot === "function" &&
      typeof polEconReserveMonths === "function" && typeof sanitizePolEcon === "function" &&
      typeof domesticPolEconHtml === "function", "polEcon API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 表格自身的完整性与覆盖 ----
    const ents = Object.keys(CM.countries);
    const missingAnchor = ents.filter((k) => !T.ANCHOR[k]);
    assert("anchorCoversEveryEntity", missingAnchor.length === 0,
      "缺期望锚的实体：" + missingAnchor.join(", "));
    assert("anchorHasDefault", Array.isArray(T.ANCHOR.DEFAULT), "ANCHOR.DEFAULT 必须是 [均值, 标准差]");
    const badRows = Object.keys(T.ANCHOR).filter((k) => {
      const row = T.ANCHOR[k];
      return !Array.isArray(row) || row.length !== 2 || !isFinite(row[0]) || !isFinite(row[1]) || !(row[1] > 0);
    });
    assert("anchorRowsWellFormed", badRows.length === 0, "形状非法的行：" + badRows.join(", "));
    const missingBlame = ents.filter((k) => !T.BLAME[k] && !T.BLAME.DEFAULT);
    assert("blameCoversEveryEntity", missingBlame.length === 0,
      "既无显式归咎行也无 DEFAULT 的实体：" + missingBlame.join(", "));
    assert("blameHasDefault", !!T.BLAME.DEFAULT && Array.isArray(T.BLAME.DEFAULT.down) &&
      T.BLAME.DEFAULT.down.length > 0,
      "BLAME.DEFAULT 必须存在且有落点（47 个通用国家靠它）");
    // 每个归咎字段必须是**该国内政对象上真实存在**的字段，否则账单会静默写不进去
    const blameSites = [];
    for (const k of ents) {
      const sink = polEconSinkOf(k, T);
      const dom = domesticStateOf(k) || getGeneralDomestic(k);
      for (const f of sink.down.concat(sink.up)) {
        if (typeof dom[f] !== "number") blameSites.push(k + "." + f);
      }
    }
    assert("blameFieldsExistOnDomesticState", blameSites.length === 0,
      "归咎指向了不存在的内政字段：" + blameSites.join(", "));

    // ---- 2. 无执政者：史实轨迹绝不受影响 ----
    const savedPlayer = ST.player;
    ST.player = null;
    const rngBefore = SIM.S ? SIM.S.rngState : null;
    const pBefore = ST.polEcon ? JSON.stringify(ST.polEcon) : null;
    const nullSnap = updatePoliticalEconomy(1985, 6, true);
    assert("spectatorNoBill", nullSnap === null, "旁观模式必须返回 null（没有执政者就没有账单）");
    assert("spectatorStateUntouched", (ST.polEcon ? JSON.stringify(ST.polEcon) : null) === pBefore,
      "旁观模式不得写 ST.polEcon");

    // ---- 3. 无经济史：历史不足 13 个月时不得产生账单 ----
    ST.player = "SUN";
    ST.mil = 4;
    applyPlayerDecisions();
    // 先把历史清空（simReset 会回到 1980-01），验证「不足 13 个月」这条早退
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    const earlySnap = updatePoliticalEconomy(1980, 6, true);
    assert("noHistoryNoBill", earlySnap === null, "历史不足 13 个月时必须返回 null");
    assert("noHistoryNoEvents", !ST.polEcon || !ST.polEcon.events || ST.polEcon.events.length === 0,
      "历史不足时不得入账任何账单");

    // ---- 4. 造出真实经济史 ----
    simFastForward(1983, 6);
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    const histLen = SIM.S.hist.gdp.SUN ? SIM.S.hist.gdp.SUN.length : 0;
    assert("historyBuilt", histLen >= 13, "快进后应有 >=13 个月的成员级历史，实为 " + histLen);

    const actual = growthOf(entKeys("SUN"));
    assert("growthAvailable", actual !== null, "快进后 growthOf 不应为 null");

    // ---- 5. 正常推进一个月：快照与 growthOf 同口径，且零 RNG 消费 ----
    const rngA = SIM.S.rngState;
    const snap = updatePoliticalEconomy(1983, 7, true);
    assert("noRngConsumed", SIM.S.rngState === rngA,
      "polEcon 不得消费 RNG（rngState " + rngA + " → " + SIM.S.rngState + "）");
    assert("snapshotReturned", !!snap && typeof snap === "object", "updatePoliticalEconomy 应返回快照");
    assert("actualMatchesGrowthOf", near(snap.actual, +actual.toFixed(3), 1e-3),
      "快照 actual 应等于 growthOf(SUN)，实为 " + snap.actual + " vs " + actual);
    const anchor0 = polEconAnchor("SUN", T);
    assert("surpriseIsActualMinusExpect", near(snap.surprise, +(snap.actual - snap.expect).toFixed(3), 1e-3),
      "落差必须 = 实际 − 期望");
    assert("zIsStandardized", near(snap.z, +((snap.actual - snap.expect) / anchor0.sd).toFixed(3), 1e-2),
      "z 必须是落差除以该国历史标准差");
    assert("reserveMonthsConsistentWithFlows", (() => {
      // 与实现同口径：净流出 + 相对 GDP 有意义 → 有限月数；否则 null
      const f = getTradeFlows("SUN");
      const monthly = f.netUsd / 12;
      const rm = polEconReserveMonths("SUN");
      if (!(monthly < 0)) return rm === null;
      const annualBn = -monthly * 12 * 0.1;
      const gdp = simVal("SUN").gdp_bn;
      if (!(gdp > 0) || annualBn < T.RESERVE_GDP_SHARE * gdp) return rm === null;
      return typeof rm === "number" && rm >= 0;
    })(), "储备月数必须与贸易净流出口径一致（无净流出 / 相对 GDP 不显著 → null）");
    // 重要性门槛本身：一个微不足道的逆差不得被读成危机
    assert("reserveMaterialityGate", (() => {
      const f = getTradeFlows("SUN");
      const monthly = f.netUsd / 12;
      const gdp = simVal("SUN").gdp_bn;
      if (!(monthly < 0) || !(gdp > 0)) return true;      // 这条路径不适用
      const annualBn = -monthly * 12 * 0.1;
      if (annualBn >= T.RESERVE_GDP_SHARE * gdp) return true;
      return polEconReserveMonths("SUN") === null;
    })(), "相对 GDP 微不足道的净流出不得被判定为国际收支压力（否则苏联永久处于「危机」）");

    // ---- 6. 坏账：把期望锚抬到远高于现实 → 连续两个月 → 账单到期 ----
    const sunDom = domesticStateOf("SUN");
    const conservBefore = sunDom.conservative, reformBefore = sunDom.reformist, unrestBefore = sunDom.unrest;
    const p = initPolEcon();
    p.events = []; p.bad = 0; p.good = 0; p.lastBill = null;
    p.anchor.SUN = snap.actual + 6;             // z 远低于 Z_BAD
    updatePoliticalEconomy(1983, 8, true);
    const afterFirst = p.bad;
    updatePoliticalEconomy(1983, 9, true);
    assert("badStreakCounts", afterFirst === 1 && p.bad === 2,
      "连续负落差应逐月累加（第一次 " + afterFirst + "，第二次 " + p.bad + "）");
    assert("badBillRecorded", p.events.some((e) => e.kind === "bad"),
      "连续 " + T.PERSIST + " 个月负落差后应入账一张 bad 账单");
    assert("badBillBlamesIncumbent", sunDom.conservative < conservBefore,
      "苏联的保守派应被问责（" + conservBefore + " → " + sunDom.conservative + "）");
    assert("badBillLiftsAlternative", sunDom.reformist > reformBefore,
      "改革派应因祸得福（" + reformBefore + " → " + sunDom.reformist + "）");
    assert("badBillRaisesUnrest", sunDom.unrest > unrestBefore,
      "社会动荡应上升（" + unrestBefore + " → " + sunDom.unrest + "）");
    assert("badBillOnlyOnce", p.events.filter((e) => e.kind === "bad").length === 1,
      "同一段坏账只应宣告一次（后续月份只累积压力，不重复入账）");
    // 持续坏账 = 持续压力：再推一个月，动荡必须继续上升
    const unrestMid = sunDom.unrest;
    updatePoliticalEconomy(1983, 10, true);
    assert("badBillPersists", sunDom.unrest > unrestMid,
      "坏账期间动荡应逐月继续上升（" + unrestMid + " → " + sunDom.unrest + "）");

    // ---- 7. 好年景：把锚压到远低于现实 → 连续两个月 → 红利入账 ----
    const conservB2 = sunDom.conservative, unrestB2 = sunDom.unrest;
    p.events = []; p.bad = 0; p.good = 0; p.lastBill = null;
    p.anchor.SUN = snap.actual - 6;             // z 远高于 Z_GOOD
    updatePoliticalEconomy(1983, 11, true);
    updatePoliticalEconomy(1983, 12, true);
    assert("goodStreakCounts", p.good >= 2, "连续正落差应逐月累加，实为 " + p.good);
    assert("goodBillRecorded", p.events.some((e) => e.kind === "good"), "应入账一张 good 账单");
    assert("goodBillCreditsIncumbent", sunDom.conservative > conservB2,
      "好年景应给执政路线加分（" + conservB2 + " → " + sunDom.conservative + "）");
    assert("goodBillLowersUnrest", sunDom.unrest < unrestB2,
      "好年景应压低动荡（" + unrestB2 + " → " + sunDom.unrest + "）");

    // ---- 8. 适应性预期：锚朝现实挪一步，一次性刺激买不到永久红利 ----
    p.anchor.SUN = snap.actual + 6;
    const anchorBefore = p.anchor.SUN;
    updatePoliticalEconomy(1984, 1, true);
    const anchorAfter = p.anchor.SUN;
    assert("anchorAdapts", anchorAfter < anchorBefore,
      "负落差时期望锚应向下修正（" + anchorBefore + " → " + anchorAfter + "）");
    // 锚的两股力：追上现实（+ADAPT×落差）与回落到史实均值（+REVERT×偏离史实）
    const expectStep = (snap.actual - anchorBefore) * T.ANCHOR_ADAPT +
      (anchor0.hist - anchorBefore) * T.ANCHOR_REVERT;
    assert("anchorAdaptStep", near(anchorAfter - anchorBefore, expectStep, 2e-3),
      "锚的月移动量应等于 ADAPT×落差 + REVERT×偏离史实（实得 " +
      (anchorAfter - anchorBefore).toFixed(6) + "，期望 " + expectStep.toFixed(6) + "）");
    // 回拉必须真的存在：没有它，一次崩塌能把锚永久拖走
    assert("anchorRevertsTowardHistory", (() => {
      const p2 = initPolEcon();
      p2.anchor.SUN = anchor0.hist - 8;                 // 人为把锚压到史实以下
      const before = p2.anchor.SUN;
      p2.lastActual = 0; p2.bad = 0; p2.good = 0;
      updatePoliticalEconomy(1984, 2, true);
      return p2.anchor.SUN > before;
    })(), "锚被压到史实均值以下时应被回拉（否则一次性冲击可永久改变国民预期）");

    // ---- 9. 国际收支：储备见底是独立的第二种账单 ----
    // 找一个**净流出相对 GDP 有意义**的实体（不硬编码国名 —— 航线或 GDP 数据
    // 变了断言也不会假绿；同时验证重要性门槛真的在起作用）。
    let debtor = null, debtorBurn = 0;
    for (const k of ents) {
      const f = getTradeFlows(k);
      if (!f || !(f.netUsd < 0)) continue;
      const monthly = f.netUsd / 12;
      const annualBn = -monthly * 12 * 0.1;
      const gdp = simVal(k).gdp_bn;
      if (!(gdp > 0)) continue;
      if (annualBn >= T.RESERVE_GDP_SHARE * gdp) { debtor = k; debtorBurn = -monthly; break; }
    }
    assert("debtorFoundWithMaterialOutflow", !!debtor,
      "应至少有一个实体的净 USD 流出相对其 GDP 达到 " + T.RESERVE_GDP_SHARE + "（否则国际收支渠道永远不触发）");
    if (debtor) {
      // 储备设成「只够半个月」—— 与流出规模成比例，不依赖硬编码的绝对额度
      if (!ST.reserves[debtor]) ST.reserves[debtor] = { usd: 1, trb: 0 };
      ST.reserves[debtor].usd = debtorBurn * 0.5;
      const rm = polEconReserveMonths(debtor);
      assert("reserveMonthsFiniteForDebtor", typeof rm === "number" && rm < T.RESERVE_CRIT_MONTHS,
        "储备只够半月流出 → 月数应低于临界值，实为 " + rm);

      ST.player = debtor;
      ST.mil = 3.5;
      applyPlayerDecisions();
      const pp = initPolEcon();
      pp.events = []; pp.alerts = []; pp.bad = 0; pp.good = 0;
      const inboxBefore = EV.items.length;
      updatePoliticalEconomy(1984, 2, true);
      updatePoliticalEconomy(1984, 3, true);
      assert("bopAlertRecorded", pp.events.some((e) => e.kind === "bop"),
        "储备低于临界值应入账一张 bop 警报");
      assert("bopAlertReachesInbox", EV.items.length > inboxBefore,
        "国际收支危机必须真的进收件箱（面板写着但没人看得见等于没做）");
      const bopCount = pp.events.filter((e) => e.kind === "bop").length;
      assert("bopAlertCooldown", bopCount === 1,
        "冷却期内不得重复报警（实为 " + bopCount + " 次）");
      // 目标式动荡：储备见底必须把动荡往上拉，但**不能拉满**（自限）
      const dDom = polEconDomesticOf(debtor);
      assert("bopRaisesUnrest", dDom.unrest > 0,
        "储备见底应抬高社会动荡，实为 " + (dDom && dDom.unrest));
      assert("bopUnrestSelfLimiting", dDom.unrest <= T.UNREST_TARGET_BOP_BASE + T.UNREST_TARGET_BOP_SPAN + 1,
        "动荡应朝目标靠拢而非无限累积（实为 " + dDom.unrest + "，上限 " +
        (T.UNREST_TARGET_BOP_BASE + T.UNREST_TARGET_BOP_SPAN) + "）");
    }

    // ---- 10. 归咎映射不是一句空话：换国家换落点 ----
    const usaSink = polEconSinkOf("USA", T);
    const chnSink = polEconSinkOf("CHN", T);
    assert("blameDiffersByCountry",
      usaSink.down.indexOf("congressApproval") >= 0 && chnSink.down.indexOf("planned") >= 0 &&
      usaSink.down.join() !== chnSink.down.join(),
      "不同国家的坏账应落在不同的内政字段上（否则所有国家玩起来一样）");

    // ---- 11. 存档往返：账单不丢、垃圾输入不炸 ----
    ST.player = "SUN";
    const rt = sanitizePolEcon(JSON.parse(JSON.stringify(ST.polEcon)));
    assert("sanitizeRoundTripKeepsEvents", rt.events.length === ST.polEcon.events.length,
      "存档往返后已入账账单条数应不变（" + ST.polEcon.events.length + " → " + rt.events.length + "）");
    assert("sanitizeRoundTripKeepsAnchor",
      typeof rt.anchor.SUN === "number" && near(rt.anchor.SUN, ST.polEcon.anchor.SUN, 1e-6),
      "存档往返后期望锚应不变");
    const junk = sanitizePolEcon({ anchor: { SUN: "nope", USA: NaN, CHN: 5 }, bad: "x", good: -9,
      events: [1, 2, { kind: "bad" }], alerts: ["z"] });
    // 关键不是「垃圾被保留」，而是「垃圾绝不能变成 NaN 进模拟」。
    // 非法锚点直接被丢弃（首次使用时按史实均值补），合法锚点原样保留。
    assert("sanitizeRejectsJunk", junk.anchor.SUN === undefined && junk.anchor.USA === undefined &&
      junk.anchor.CHN === 5 && junk.bad === 0 && junk.good === 0 &&
      junk.events.length === 1 && junk.alerts.length === 0,
      "非法存档字段必须被清洗成缺省值，而不是把 NaN 带进模拟；实得 " + JSON.stringify({
        anchor: junk.anchor, bad: junk.bad, good: junk.good,
        events: junk.events.length, alerts: junk.alerts.length
      }));
    // NaN/Infinity 输入不得变成 NaN 状态（一旦进状态就会污染 unrest/legit 并写进存档）
    const nan = sanitizePolEcon({ anchor: { SUN: NaN }, bad: NaN, lastActual: NaN,
      lastZ: Infinity, reserveMonths: NaN });
    assert("sanitizeNoNaNAnywhere",
      isFinite(nan.bad) && isFinite(nan.good) && nan.anchor.SUN === undefined &&
      (nan.lastActual === null || isFinite(nan.lastActual)) &&
      (nan.lastZ === null || isFinite(nan.lastZ)) &&
      (nan.reserveMonths === null || isFinite(nan.reserveMonths)),
      "NaN/Infinity 输入必须被清洗，实得 " + JSON.stringify(nan));
    assert("sanitizeNullSafe", !!sanitizePolEcon(null), "sanitizePolEcon(null) 必须返回缺省状态");

    // ---- 12. 不越权：本模块不得写 pmods / gdp ----
    const pmBefore = JSON.stringify(SIM.S.P.pmods);
    const gdpBefore = JSON.stringify(SIM.S.gdp);
    updatePoliticalEconomy(1984, 4, true);
    assert("noPmodWrites", JSON.stringify(SIM.S.P.pmods) === pmBefore,
      "polEcon 只写内政字段，不得直接改 P.pmods");
    assert("noGdpWrites", JSON.stringify(SIM.S.gdp) === gdpBefore,
      "polEcon 不得直接改 gdp");

    // ---- 13. 面板：账单必须可见 ----
    const html = domesticPolEconHtml();
    assert("panelRenders", typeof html === "string" && html.indexOf("经济账单") >= 0,
      "内政面板应渲染经济账单条");
    assert("panelShowsNumbers", /pp/.test(html), "面板应显示落差数值");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "poleconprobe";
  d.style.display = "none";
  d.textContent = "POLECONPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
