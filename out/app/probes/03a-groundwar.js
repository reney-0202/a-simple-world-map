"use strict";

// ---- Phase D：地面战争全链路探针 ---------------------------------------------
// 这一阶段要把「日期状态机」变成「可争夺的战局」。四件事要证明：
//   1. 史实不变量 —— 不干预时 control 恒等于史实基线，且零回写、零 RNG；
//   2. 偏离是真的 —— 干预与作战方针真的推动战线，而不是只挪停火日期；
//   3. 代价是边际的 —— 只对**偏离史实的那部分**收费（历史总代价已在校准曲线里）；
//   4. 结局有后果 —— 胜负改写威望、清空战线、厌战回落内政。
function runGroundWarProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("GROUNDWARPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);
  const warMonth = (y, m) => y * 12 + m;

  try {
    const T = warTable();
    assert("tableLoaded", !!T && !!T.WARS && !!T.OPS && !!T.PARAMS, "data/wars.js 未载入");
    assert("apiPresent",
      typeof updateGroundWars === "function" && typeof groundWarSnapshot === "function" &&
      typeof groundWarControl === "function" && typeof groundWarActive === "function" &&
      typeof setWarOp === "function" && typeof clearWarOp === "function" &&
      typeof accWarAttrition === "function" && typeof groundWarSelfDrag === "function" &&
      typeof groundWarPanelHtml === "function" && typeof sanitizeGroundWarState === "function",
      "地面战争 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 三场战争都在，且交战方是真实实体 ----
    const ids = Object.keys(T.WARS);
    assert("threeWars", ids.length === 3, "应有 3 场战争，实为 " + ids.length);
    assert("belligerentsResolve", ids.every((id) => {
      const d = T.WARS[id];
      return CM.countries[d.sideA] && CM.countries[d.sideB] && d.sideA !== d.sideB;
    }), "每场战争的双方都必须是不同的可玩实体");
    assert("opsAllCostCapital", Object.keys(T.OPS).every((id) => T.OPS[id].pc > 0),
      "每项作战方针都必须消耗政治资本（否则没有取舍）");
    assert("hasExitOperation", ids.every(() => Object.keys(T.OPS).some((id) => T.OPS[id].endEarly)),
      "必须存在「主动停火」方针（玩家要能止损）");

    // ---- 2. 史实不变量：不干预 → control 恒等于史实基线 ----
    const savedPlayer = ST.player;
    ST.player = null;
    initGroundWarState(true);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const gdp0 = SIM.S ? JSON.stringify(SIM.S.gdp) : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    let devStayedZero = true, controlMatchedBaseline = true;
    for (const id of ids) {
      const def = T.WARS[id];
      const st = warMonth(def.start[0], def.start[1]);
      for (let k = 0; k < 24; k++) {
        const t = st + k;
        updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
        const w = ST.wars.wars[id];
        if (!w) continue;
        if (w.dev !== 0) devStayedZero = false;
        // 只比较「战争进行中」的月份：结束后 control 定格在结算值，不再跟基线走
        if (groundWarActive(id, t) &&
            !near(groundWarControl(id, t), groundWarHistoricControl(def, t), 1e-9)) {
          controlMatchedBaseline = false;
        }
      }
    }
    assert("spectatorDeviationStaysZero", devStayedZero,
      "无执政者时偏离必须恒为 0（否则史实战线会漂移）");
    assert("spectatorControlEqualsHistoricBaseline", controlMatchedBaseline,
      "无执政者时 control 必须严格等于史实基线（这是史实不变量的定义）");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "地面战争不得消费引擎 RNG");
    assert("spectatorNoGdpWrites", SIM.S ? JSON.stringify(SIM.S.gdp) === gdp0 : true, "不得改 gdp");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true,
      "无执政者时不得写 P.pmods（applyPlayerDecisions 本就提前返回）");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "无执政者时不得写内政");
    assert("spectatorAttrDevStaysZero", (() => {
      for (const id of ids) {
        const w = ST.wars.wars[id];
        if (w && (w.attrDevA > 1e-9 || w.attrDevB > 1e-9)) return false;
      }
      return true;
    })(), "无偏离就没有额外消耗（不能对史实总代价二次收费）");
    assert("spectatorStillTracksTotalAttrition", (() => {
      // 总消耗仍然累积 —— 它是展示用的「这场战争有多贵」，与收费是两回事
      for (const id of ids) {
        const w = ST.wars.wars[id];
        if (w && (w.attrA > 0 || w.attrB > 0)) return true;
      }
      return false;
    })(), "总消耗应继续累积（面板要能显示战争代价）");

    // ---- 3. 史实基线本身的分段形状 ----
    assert("baselineIsStepped", (() => {
      const def = T.WARS.iran_iraq;
      const a = groundWarHistoricControl(def, warMonth(1980, 10));   // 伊拉克推进
      const b = groundWarHistoricControl(def, warMonth(1983, 1));    // 伊朗反攻
      const c = groundWarHistoricControl(def, warMonth(1989, 1));    // 停火后略劣
      return a > 0 && b < 0 && c > b && c < a;      // 三档互不相同且顺序正确
    })(), "两伊战争的史实基线应呈现「伊拉克推进 → 伊朗反攻 → 停火回摆」的分段形状");
    assert("baselineBeforeStartIsZero", (() => {
      const def = T.WARS.iran_iraq;
      return groundWarHistoricControl(def, warMonth(1979, 1)) === 0;
    })(), "开战前基线必须为 0");

    // ---- 4. 干预真的推动战线（而不是只挪日期）----
    ST.player = "USA";
    ST.mil = 4;
    initGroundWarState(true);
    initPoliticalCapital(true);
    ST.aid = [{ t: "IRQ", l: 2, since: 0 }];      // 美国全力军援伊拉克
    ST.sanctions = [];
    const t1 = warMonth(1981, 6);
    for (let k = 0; k < 6; k++) {
      const t = t1 + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    const devAidIRQ = ST.wars.wars.iran_iraq.dev;
    assert("interventionShiftsControl", devAidIRQ > 0,
      "军援伊拉克应把战线推向伊拉克一侧（dev 实为 " + devAidIRQ + "）");
    assert("interventionBeatsBaseline", groundWarControl("iran_iraq", t1 + 5) >
      groundWarHistoricControl(T.WARS.iran_iraq, t1 + 5),
      "干预后的 control 必须高于纯史实基线");
    // 反向：制裁伊拉克 → 战线推回去
    ST.aid = [];
    ST.sanctions = [{ t: "IRQ", l: 2, since: 0 }];
    for (let k = 0; k < 14; k++) {
      const t = t1 + 6 + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    assert("hostileInterventionReverses", ST.wars.wars.iran_iraq.dev < devAidIRQ,
      "制裁伊拉克应让偏离回落（" + devAidIRQ + " → " + ST.wars.wars.iran_iraq.dev + "）");
    ST.sanctions = [];
    ST.aid = [];

    // ---- 5. 作战方针：只有交战方、只有战争在进行、消耗政治资本、同时一项 ----
    // setWarOp 用的是「当前仿真月份」，所以必须先把时间推进到战区内 ——
    // 否则测的是一个永远不会被玩家遇到的窗口。
    simReset();
    simFastForward(1981, 6);
    const inWar = groundWarActive("iran_iraq");
    assert("simReachedWarWindow", inWar, "快进到 1981-06 后两伊战争应处于进行中");
    initGroundWarState(true);
    initPoliticalCapital(true);
    ST.player = "USA";                            // 非交战方
    assert("nonBelligerentCannotCommit", (() => {
      const res = setWarOp("iran_iraq", "ground_offensive");
      return res.ok === false && res.reason === "not-belligerent";
    })(), "非交战方不得下达作战方针");
    ST.player = "IRQ";
    initPoliticalCapital(true);
    const pcBefore = ST.politicalCapital.value;
    const opRes = setWarOp("iran_iraq", "ground_offensive");
    assert("belligerentCanCommit", opRes.ok === true, "交战方应能下达作战方针，实得 " + JSON.stringify(opRes.reason));
    assert("opCostsCapital", ST.politicalCapital.value < pcBefore,
      "作战方针必须消耗政治资本（" + pcBefore + " → " + ST.politicalCapital.value + "）");
    assert("opRejectsUnknown", setWarOp("iran_iraq", "nope").reason === "unknown-op", "未知方针必须被拒绝");
    assert("opRejectsUnknownWar", setWarOp("nope", "ground_offensive").reason === "unknown-war", "未知战争必须被拒绝");
    assert("opOnlyOneAtATime", (() => {
      initPoliticalCapital(true);
      setWarOp("iran_iraq", "air_campaign");
      return ST.wars.wars.iran_iraq.op === "air_campaign";
    })(), "换方针应替换而不是叠加（同时只执行一项）");
    assert("opCanBeCleared", (() => {
      const ok = clearWarOp("iran_iraq").ok;
      return ok && ST.wars.wars.iran_iraq.op === null;
    })(), "方针应可撤销");

    // ---- 6. 攻势真的推进战线 ----
    initGroundWarState(true);
    initPoliticalCapital(true);
    ST.player = "IRQ";
    const t0 = warMonth(1981, 1);
    for (let k = 0; k < 3; k++) {
      const t = t0 + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    const devNoOp = ST.wars.wars.iran_iraq.dev;
    const ctrlNoOp = groundWarControl("iran_iraq", t0 + 2);
    initPoliticalCapital(true);
    setWarOp("iran_iraq", "ground_offensive");
    for (let k = 0; k < 8; k++) {
      const t = t0 + 3 + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    assert("offensivePushesControl",
      ST.wars.wars.iran_iraq.dev > devNoOp &&
      groundWarControl("iran_iraq", t0 + 10) > ctrlNoOp,
      "地面攻势应把战线推向我方（dev " + devNoOp + " → " + ST.wars.wars.iran_iraq.dev + "）");
    assert("offensiveCostsMoreThanHold", (() => {
      const off = ST.wars.wars.iran_iraq.attrDevA;
      initGroundWarState(true);
      initPoliticalCapital(true);
      setWarOp("iran_iraq", "hold_line");
      for (let k = 0; k < 8; k++) {
        const t = t0 + 3 + k;
        updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
      }
      return off > ST.wars.wars.iran_iraq.attrDevA;
    })(), "攻势的额外消耗必须高于固守（否则没有代价就没有选择）");

    // ---- 7. 消耗只对偏离计费，且有上限 ----
    assert("dragZeroWithoutDeviation", groundWarDragOf(0) === 0, "没有额外消耗就不该有拖累");
    assert("dragIsNegative", groundWarDragOf(3) < 0, "额外消耗应表现为负的增速拖累");
    assert("dragIsCapped", near(groundWarDragOf(999), -T.PARAMS.ATTR_DRAG, 1e-9),
      "拖累必须有上限（否则长期战争会把国家拖成负数增长）");
    assert("dragMonotonic", groundWarDragOf(1) > groundWarDragOf(5), "拖累应随消耗单调加深");
    // accWarAttrition 只给「非玩家」的交战方写 pmods
    initGroundWarState(true);
    ST.player = "IRQ";
    ST.wars.wars.iran_iraq = warStateOf("iran_iraq");
    ST.wars.wars.iran_iraq.attrDevA = 6;    // IRQ（玩家）已到上限
    ST.wars.wars.iran_iraq.attrDevB = 3;    // IRN（对手）
    const acc = {};
    accWarAttrition(acc);
    const irnKeys = entKeys("IRN");
    assert("accSkipsPlayerSide", irnKeys.every((k) => acc[k] === undefined || acc[k] < 0),
      "玩家自己那一侧由 playerSelfDelta 负责，不得在 acc 里重复扣");
    assert("accChargesOpponent", irnKeys.some((k) => acc[k] < 0),
      "对手的额外消耗必须落到它的成员上");
    assert("selfDragChargesPlayer", groundWarSelfDrag() < 0,
      "玩家自己作为交战方时应有额外拖累，实为 " + groundWarSelfDrag());
    assert("selfDragIsZeroForSpectator", (() => {
      const p = ST.player; ST.player = null;
      const v = groundWarSelfDrag();
      ST.player = p;
      return v === 0;
    })(), "旁观者没有战争拖累");

    // ---- 8. 厌战：累积、劣势方更快、只在对局中落到内政 ----
    initGroundWarState(true);
    ST.player = "IRQ";
    const domIRQ = (typeof polEconDomesticOf === "function") ? polEconDomesticOf("IRQ") : null;
    const unrestBefore = (domIRQ && typeof domIRQ.unrest === "number") ? domIRQ.unrest : null;
    const t2 = warMonth(1983, 1);          // 此时基线为负 → IRQ 处于劣势
    for (let k = 0; k < 6; k++) {
      const t = t2 + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    const w2 = ST.wars.wars.iran_iraq;
    assert("wearAccumulates", w2.wearA > 0 && w2.wearB > 0, "双方都应累积厌战");
    assert("wearFasterForLoser", w2.wearA > w2.wearB,
      "处于劣势的一方厌战涨得更快（A " + w2.wearA.toFixed(1) + " vs B " + w2.wearB.toFixed(1) + "）");
    assert("wearReachesDomestic", unrestBefore !== null && domIRQ.unrest > unrestBefore,
      "厌战应抬高内政动荡（" + unrestBefore + " → " + (domIRQ && domIRQ.unrest) + "）");

    // ---- 9. 结局：到史实停火日自动结算，胜负改威望 ----
    initGroundWarState(true);
    ST.player = null;
    const presBefore = (typeof prestigeOf === "function") ? prestigeOf("IRQ") : 50;
    const endT = warMonth(T.WARS.iran_iraq.historicEnd[0], T.WARS.iran_iraq.historicEnd[1]) + 1;
    updateGroundWars(Math.floor(endT / 12), endT % 12 || 12, true);
    const wEnd = ST.wars.wars.iran_iraq;
    assert("settlesAtHistoricEnd", !!wEnd.outcome, "到达史实停火日必须结算出结局");
    assert("outcomeIsOneOfThree", ["A", "B", "stalemate"].indexOf(wEnd.outcome) >= 0,
      "结局必须是 A/B/僵持之一，实为 " + wEnd.outcome);
    assert("settleWasLogged", ST.wars.log.some((e) => e.id === "iran_iraq"),
      "结局必须进入战史日志");
    assert("settleMovesPrestige", (() => {
      if (wEnd.outcome === "stalemate") return true;      // 僵持不动威望
      const after = (typeof prestigeOf === "function") ? prestigeOf("IRQ") : presBefore;
      return wEnd.outcome === "B" ? after < presBefore : after > presBefore;
    })(), "战败方威望必须下降（僵持除外）");
    assert("settleIsIdempotent", (() => {
      const before = JSON.stringify(ST.wars.wars.iran_iraq);
      updateGroundWars(Math.floor((endT + 3) / 12), (endT + 3) % 12 || 12, true);
      return ST.wars.wars.iran_iraq.outcome === JSON.parse(before).outcome;
    })(), "结局不得被重复结算（否则威望会反复扣）");
    assert("settledWarIsNotActive", !groundWarActive("iran_iraq", endT + 2),
      "结算后的战争必须不再处于进行中");

    // ---- 10. 提前决胜 ----
    // 注意：不能直接把 dev 设很大再跑一个月 —— 每月第一步就是
    // `dev += (targetDev - dev)*0.55`，注入值会被立刻拉回。所以要造一个
    // **真实的** 高强度条件：马岛基线 +42、决胜阈值 60，阿根廷全力进攻即可越线。
    initGroundWarState(true);
    ST.player = "LAP";
    ST.mil = 10;                                  // 自身军费拉满 → 干预分为 +2
    initPoliticalCapital(true);
    warStateOf("falklands").op = "ground_offensive";
    const fStart = warMonth(T.WARS.falklands.start[0], T.WARS.falklands.start[1]);
    for (let k = 0; k < 8; k++) {
      const t = fStart + k;
      updateGroundWars(Math.floor(t / 12), t % 12 || 12, true);
    }
    assert("decisiveEndsEarly", !!ST.wars.wars.falklands.outcome &&
      ST.wars.wars.falklands.outcome === "A",
      "全力进攻越过决胜阈值应提前结束并判定 A 胜，实为 " + ST.wars.wars.falklands.outcome +
      "（control " + (ST.wars.wars.falklands.finalControl) + "）");
    assert("decisiveBeforeHistoricEnd", !!ST.wars.wars.falklands.outcome &&
      ST.wars.wars.falklands.endM < warMonth(T.WARS.falklands.historicEnd[0], T.WARS.falklands.historicEnd[1]),
      "提前决胜必须早于史实停火日");
    assert("finalControlIsFrozen", (() => {
      // 结算后战线必须定格：否则面板会在终局后突然归零，与刚打下的战果不符
      const w = ST.wars.wars.falklands;
      const c1 = groundWarControl("falklands", fStart + 8);
      const c2 = groundWarControl("falklands", fStart + 40);
      return near(c1, c2, 1e-9) && near(c1, w.finalControl, 0.01);
    })(), "结算后的战线必须定格在最终值");

    // ---- 11. 主动停火：止损，但劣势要付威望代价 ----
    initGroundWarState(true);
    ST.player = "IRQ";
    initPoliticalCapital(true);
    warStateOf("iran_iraq").dev = -40;     // 处于劣势
    const pres0 = (typeof prestigeOf === "function") ? prestigeOf("IRQ") : 50;
    setWarOp("iran_iraq", "seek_settlement");
    const t4 = warMonth(1985, 1);
    updateGroundWars(Math.floor(t4 / 12), t4 % 12 || 12, true);
    assert("settlementEndsWar", !!ST.wars.wars.iran_iraq.outcome, "寻求停火应立刻结束战争");
    assert("settlementCostsPrestigeWhenLosing",
      (typeof prestigeOf === "function") ? prestigeOf("IRQ") <= pres0 : true,
      "劣势下的停火不能在威望上全身而退");

    // ---- 12. 战线清空：战争结束后地图上不该继续挂着占领区 ----
    assert("settleClearsFrontlines", (() => {
      initGroundWarState(true);
      ST.player = null;
      for (const pid of T.WARS.iran_iraq.provinces) {
        ST.frontlines[pid] = { occupier: "IRQ", warId: "iran_iraq", since: 0 };
      }
      const e = warMonth(T.WARS.iran_iraq.historicEnd[0], T.WARS.iran_iraq.historicEnd[1]) + 1;
      updateGroundWars(Math.floor(e / 12), e % 12 || 12, true);
      return T.WARS.iran_iraq.provinces.every((pid) =>
        !ST.frontlines[pid] || ST.frontlines[pid].warId !== "iran_iraq");
    })(), "战争结束后必须清空该战的战线省份");

    // ---- 13. 存档往返与清洗 ----
    initGroundWarState(true);
    ST.player = "IRQ";
    initPoliticalCapital(true);
    const wRt = warStateOf("iran_iraq");
    wRt.dev = 12.5;
    wRt.attrDevA = 2.5;
    wRt.op = "air_campaign";
    const rt = sanitizeGroundWarState(JSON.parse(JSON.stringify(ST.wars)));
    assert("roundTripKeepsDev", near(rt.wars.iran_iraq.dev, 12.5, 1e-9), "存档往返后偏离应不变");
    assert("roundTripKeepsOp", rt.wars.iran_iraq.op === "air_campaign", "存档往返后作战方针应不变");
    const junk = sanitizeGroundWarState({
      wars: { iran_iraq: { dev: NaN, attrA: "x", op: "nope", wearA: 999 },
        nope: { dev: 5 } },
      log: [1, { id: "iran_iraq", outcome: "A" }]
    });
    assert("sanitizeDropsUnknownWar", junk.wars.nope === undefined, "未知战争 id 必须被丢弃");
    assert("sanitizeRejectsUnknownOp", junk.wars.iran_iraq.op === null, "未知方针必须被清空");
    assert("sanitizeClampsNumbers", isFinite(junk.wars.iran_iraq.dev) &&
      junk.wars.iran_iraq.dev === 0 && junk.wars.iran_iraq.wearA <= 100,
      "非法数值必须被清洗并夹在合法区间");
    assert("sanitizeNullSafe", !!sanitizeGroundWarState(null), "sanitizeGroundWarState(null) 必须返回缺省状态");

    // ---- 14. 面板与单一事实源 ----
    initGroundWarState(true);
    ST.player = "IRQ";
    const panel = groundWarPanelHtml("IRQ");
    assert("panelRenders", typeof panel === "string" && panel.indexOf("战线优势") >= 0,
      "面板应渲染战线优势条");
    assert("panelShowsOpsForBelligerent", /data-op="/.test(panel), "交战方应看到作战方针按钮");
    assert("panelHiddenForOutsider", groundWarPanelHtml("BRA") === "",
      "非交战方不应看到别国战局面板");
    assert("activeIsSingleSourceOfTruth", (() => {
      // 面板与推进共用 groundWarActive —— 避免「面板说在打、模拟说结束了」
      const t = warMonth(1981, 1);
      initGroundWarState(true);
      return groundWarActive("iran_iraq", t) === true;
    })(), "进行中判定必须是单一事实源");

    // ---- 15. 端到端：真实推进一段历史，三场战争都会走到结局 ----
    simReset();
    ST.player = "GBR"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1991, 12);
    const snap = groundWarSnapshot();
    assert("endToEndAllWarsSettled", ids.every((id) => snap.wars[id] && snap.wars[id].outcome),
      "推进到 1991-12 后三场战争都应已结算，实为 " +
      ids.map((id) => id + "=" + (snap.wars[id] && snap.wars[id].outcome)).join(","));
    assert("endToEndLogHasEntries", ST.wars.log.length >= 3, "战史日志应至少记录三场战争的结局");
    assert("endToEndNoRunawayControl", ids.every((id) =>
      Math.abs(snap.wars[id].control) <= T.PARAMS.CONTROL_MAX), "control 必须始终落在合法区间");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "groundwarprobe";
  d.style.display = "none";
  d.textContent = "GROUNDWARPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
