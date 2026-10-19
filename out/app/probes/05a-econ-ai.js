"use strict";

// ---- Phase P2：「AI 睁眼」全链路探针 -----------------------------------------
// P1 让经济对**玩家**有政治后果；P2 让 AI 也看得见经济。四件事要证明：
// 快照只读（不建内政对象、不消费 RNG、不写 pmods/gdp）；缺快照时行为逐位不变；
// AI 真的因经济改变行动（纾困破产盟友 / 对破产对手趁火打劫 / 吃紧就裁军）；
// 「枪炮 vs 黄油」的负向通道是真的 —— 此前负 delta 全是死代码。
function runEconAIProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ECONAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const ids = (list) => (list || []).map((o) => o.id);

  try {
    const AI = window.W1980_AI;
    assert("aiModuleLoaded", !!AI && typeof AI.evaluateObjectives === "function" &&
      typeof AI.objectivesToActions === "function", "AI 数据模块未载入");
    assert("poleconApiPresent", typeof polEconWorldSnapshot === "function" &&
      typeof polEconStrainOf === "function" && typeof polEconReadOf === "function",
      "polEcon 快照 API 缺失");

    // ---- 1. 快照：覆盖全体实体 + 只读 ----------------------------------------
    // 先记录「有没有被凭空创建出来的通用内政对象」—— 这是最隐蔽的越权形态：
    // 一个「只是看一眼」的改动会改变 updateDomesticGenerals 的推进范围。
    const generalsBefore = ST.domestic && ST.domestic.generals
      ? Object.keys(ST.domestic.generals).slice().sort() : [];
    const rngBefore = SIM.S ? SIM.S.rngState : null;
    const pmBefore = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const snap = polEconWorldSnapshot();
    const generalsAfter = ST.domestic && ST.domestic.generals
      ? Object.keys(ST.domestic.generals).slice().sort() : [];
    assert("snapshotCoversEveryEntity",
      Object.keys(snap).length === Object.keys(CM.countries).length,
      "快照应覆盖全部 " + Object.keys(CM.countries).length + " 个实体，实为 " + Object.keys(snap).length);
    assert("snapshotIsReadOnlyNoGeneralsCreated",
      generalsBefore.join(",") === generalsAfter.join(","),
      "读经济不得凭空创建 generals 条目（before=" + generalsBefore.length + " after=" + generalsAfter.length + "）");
    assert("snapshotConsumesNoRng", SIM.S ? SIM.S.rngState === rngBefore : true,
      "经济快照不得消费 RNG");
    assert("snapshotWritesNoPmods", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pmBefore : true,
      "经济快照不得写 P.pmods");
    const badShape = Object.keys(snap).filter((k) => {
      const e = snap[k];
      return !e || typeof e.strain !== "number" || !isFinite(e.strain) ||
        e.strain < 0 || e.strain > 1 || typeof e.unrest !== "number" ||
        !(e.growth === null || (typeof e.growth === "number" && isFinite(e.growth)));
    });
    assert("snapshotShapeWellFormed", badShape.length === 0,
      "快照形状非法：" + badShape.slice(0, 5).join(", "));

    // ---- 2. strain 的三个渠道各自生效 ----------------------------------------
    // 用一个干净的实体（通用国家）分别注入三种压力，确认每种都能把 strain 抬起来。
    const T = polEconTable();
    assert("strainTablePresent", !!T && !!T.STRAIN && !!T.DEFAULT_STATE,
      "data/polecon.js 缺 STRAIN / DEFAULT_STATE");
    const probeKey = "AND";                       // 通用国家：没有专属内政对象
    const baseStrain = polEconStrainOf(probeKey);
    assert("strainBaselineLow", baseStrain >= 0 && baseStrain <= 1,
      "基线压力应落在 [0,1]，实为 " + baseStrain);
    // 渠道三：社会动荡。为不污染真实状态，只验证「高动荡实体 strain 更高」的单调关系。
    const highUnrest = Object.keys(CM.countries).filter((k) => {
      const d = domesticStateOf(k);
      return d && typeof d.unrest === "number" && d.unrest >= 45;
    });
    if (highUnrest.length) {
      assert("strainTracksUnrest", polEconStrainOf(highUnrest[0]) >= T.STRAIN.UNREST_BASE / 100,
        highUnrest[0] + " 动荡 " + domesticStateOf(highUnrest[0]).unrest + " 应产生非零压力");
    } else {
      assert("strainTracksUnrest", true, "（本次无高动荡实体，跳过单调性检查）");
    }
    assert("strainUnrestCappedAtOne", (() => {
      const s = polEconStrainOf(highUnrest.length ? highUnrest[0] : probeKey);
      return s >= 0 && s <= 1;
    })(), "压力必须恒在 [0,1]");
    // 渠道二：储备。挑一个净流出相对 GDP 有意义的实体（不硬编码国名），
    // 人造「储备充足」与「只够半月」两档，确认 strain 抬起。
    let debtor = null, burn = 0;
    for (const k of Object.keys(CM.countries)) {
      const f = getTradeFlows(k);
      if (!f || !(f.netUsd < 0)) continue;
      const monthly = f.netUsd / 12;
      const annualBn = -monthly * 12 * 0.1;
      const gdp = simVal(k).gdp_bn;
      if (gdp > 0 && annualBn >= T.RESERVE_GDP_SHARE * gdp) { debtor = k; burn = -monthly; break; }
    }
    if (debtor) {
      const savedRes = ST.reserves[debtor] ? JSON.parse(JSON.stringify(ST.reserves[debtor])) : null;
      if (!ST.reserves[debtor]) ST.reserves[debtor] = { usd: burn, trb: 0 };
      ST.reserves[debtor].usd = burn * 200;              // 储备充足
      const rich = polEconStrainOf(debtor);
      ST.reserves[debtor].usd = burn * 0.5;              // 只够半月
      const poor = polEconStrainOf(debtor);
      assert("strainTracksReserves", poor > rich,
        "储备从充足降到半月应抬高压力（" + rich + " → " + poor + "）");
      if (savedRes) ST.reserves[debtor] = savedRes;
    } else {
      assert("strainTracksReserves", true, "（无显著净流出实体，跳过）");
    }

    // ---- 3. 没有 econ 时行为逐位不变 ----------------------------------------
    // 这是既有数值不变量：单测夹具/旧调用方不带 econ，经济目标必须全部不成立。
    const bare = (y) => ({ countries: CM.countries, year: y, month: 6, tension: 60 });
    const bareSun = AI.evaluateObjectives("SUN", bare(1984));
    const bareAct = AI.objectivesToActions("SUN", bare(1984));
    assert("noEconNoEconomicObjectives",
      ids(bareSun).every((id) => ["sun_bailout_client", "sun_guns_butter_cut"].indexOf(id) < 0),
      "无 econ 时不应出现经济目标，实为 " + ids(bareSun).join(","));
    assert("noEconMilDeltaUnchanged", bareAct.milDelta === 0.8,
      "无 econ 时 sun_parity 的 milDelta 应仍为 0.8，实为 " + bareAct.milDelta);
    assert("noEconNoMilCut", bareAct.milCut === 0,
      "无 econ 时不应产生裁军通道，实为 " + bareAct.milCut);

    // ---- 4. 负向军费通道不再是死代码 ----------------------------------------
    // P2 之前 `if (d > act.milDelta)` 让所有负 delta 永不生效（CHN 的 -0.4 就是证据）。
    assert("negativeMilObjectiveIsLive", bareActChnMilCut() < 0,
      "CHN 的韬光养晦(-0.4) 应产生负向裁军通道（此前是死代码）");
    function bareActChnMilCut() {
      const a = AI.objectivesToActions("CHN", { countries: CM.countries, year: 1984, month: 6, tension: 30 });
      return a.milCut;
    }
    assert("positiveAndNegativeChannelsSeparate", (() => {
      const a = AI.objectivesToActions("SUN", { countries: CM.countries, year: 1984, month: 6, tension: 60 });
      return a.milDelta > 0 && a.milCut === 0;      // 同一份结果里两个通道互不污染
    })(), "扩军与裁军必须是两个独立通道（否则符号相反的 delta 会互相吞掉）");

    // ---- 5. AI 真的「看见」经济：人造压力驱动的四个行为 ----------------------
    // 用一个完全可控的 econ 快照，逐条验证行为，而不是依赖真实模拟的巧合。
    const fakeEcon = (overrides) => {
      const e = {};
      for (const k of Object.keys(CM.countries)) e[k] = { growth: 3, gdp: 100, reserveMonths: null, unrest: 5, strain: 0 };
      for (const k in (overrides || {})) {
        e[k] = Object.assign({}, e[k], overrides[k]);
      }
      return e;
    };
    const ws = (econ, extra) => Object.assign(
      { countries: CM.countries, year: 1984, month: 6, tension: 60, econ: econ }, extra || {});

    // 5a. 纾困破产盟友
    const bail = AI.objectivesToActions("USA", ws(fakeEcon({ DEU: { strain: 0.75, unrest: 60 } })));
    assert("bailoutFiresForStrainedAlly",
      ids(bail.objectives).indexOf("usa_bailout_ally") >= 0,
      "西德压力 0.75 时美国应启动盟友纾困，实为 " + ids(bail.objectives).join(","));
    assert("bailoutPicksTheStrainedCountry",
      bail.aid.some((a) => a.t === "DEU"),
      "纾困目标应是压力最大的盟友 DEU，实为 " + bail.aid.map((a) => a.t).join(","));
    // 5b. 全员健康时不纾困
    const noBail = AI.objectivesToActions("USA", ws(fakeEcon()));
    assert("bailoutSilentWhenHealthy",
      ids(noBail.objectives).indexOf("usa_bailout_ally") < 0,
      "没有国家处于危机时不应凭空纾困，实为 " + ids(noBail.objectives).join(","));
    // 5c. 对破产对手趁火打劫
    const squeeze = AI.objectivesToActions("USA", ws(fakeEcon({ SUN: { strain: 0.8, unrest: 65 } })));
    assert("squeezeFiresForStrainedRival",
      ids(squeeze.objectives).indexOf("usa_squeeze_broke_rival") >= 0,
      "苏联压力 0.8 时美国应加码施压，实为 " + ids(squeeze.objectives).join(","));
    assert("squeezeTargetsTheRival",
      squeeze.sanctions.some((s) => s.t === "SUN"),
      "趁火打劫的目标应是苏联，实为 " + squeeze.sanctions.map((s) => s.t).join(","));
    // 5d. 自己吃紧 → 裁军（枪炮 vs 黄油）
    const cut = AI.objectivesToActions("USA", ws(fakeEcon({ USA: { strain: 0.9, unrest: 70 } })));
    assert("gunsButterCutFires",
      ids(cut.objectives).indexOf("usa_guns_butter_cut") >= 0,
      "本国压力 0.9 时应启动压缩防务，实为 " + ids(cut.objectives).join(","));
    assert("gunsButterProducesNegativeCut", cut.milCut < 0,
      "枪炮 vs 黄油必须产生负向裁军，实为 " + cut.milCut);
    assert("gunsButterGradedByStrain", (() => {
      const mid = AI.objectivesToActions("USA", ws(fakeEcon({ USA: { strain: 0.65, unrest: 55 } })));
      const hi = AI.objectivesToActions("USA", ws(fakeEcon({ USA: { strain: 0.95, unrest: 75 } })));
      return mid.milCut < 0 && hi.milCut < 0 && hi.milCut <= mid.milCut;
    })(), "裁军幅度应随压力单调不减（0.65 与 0.95 两档）");
    // 5e. 每个国家都有自己的经济反应（不是只有美苏）
    const perCountry = ["SUN", "CHN", "GBR", "FRA", "JPN", "DEU"];
    const reacting = perCountry.filter((k) => {
      const ov = {};
      ov[k] = { strain: 0.9, unrest: 70 };
      if (k === "DEU") ov.SAU = { strain: 0.7, unrest: 40 };
      const a = AI.objectivesToActions(k, ws(fakeEcon(ov)));
      return ids(a.objectives).some((id) => /bailout|squeeze|guns_butter|energy|opportunist|hedge|diversify/.test(id));
    });
    assert("everyMajorReactsToItsOwnEconomy", reacting.length >= 5,
      "六大国应各自对经济压力作出反应，实为 " + reacting.join(","));

    // ---- 6. 动态目标解析失败 = 目标不成立（不许宣称无法执行的目标）----------
    // deu_energy_diversify 的 cond 只看**本国**压力，pick 找的是**外部**产油国 ——
    // 两者可以分离，正好用来证明「cond 成立但 pick 无候选 → 目标被丢弃」。
    assert("condTrueButPickEmptyDropsObjective", (() => {
      const econ = fakeEcon({ DEU: { strain: 0.9, unrest: 70 } });   // 本国吃紧，产油国全部健康
      const a = AI.objectivesToActions("DEU", ws(econ));
      return ids(a.objectives).indexOf("deu_energy_diversify") < 0;
    })(), "cond 成立但 pick 无候选时，目标必须被丢弃（不能宣称一个无法执行的目标）");
    assert("condTrueAndPickFoundKeepsObjective", (() => {
      const econ = fakeEcon({ DEU: { strain: 0.9, unrest: 70 }, SAU: { strain: 0.7, unrest: 40 } });
      const a = AI.objectivesToActions("DEU", ws(econ));
      return ids(a.objectives).indexOf("deu_energy_diversify") >= 0 &&
        a.aid.some((x) => x.t === "SAU");
    })(), "cond 与 pick 同时成立时目标应保留，并落在真实国家上");
    assert("everyEmittedAidHasTarget", (() => {
      const econ = fakeEcon({ DEU: { strain: 0.9, growth: -2, reserveMonths: 0.2, unrest: 70 } });
      const a = AI.objectivesToActions("USA", ws(econ));
      return a.aid.every((x) => typeof x.t === "string" && x.t);
    })(), "每条军援都必须有真实目标");

    // ---- 7. 端到端：真实推进一个月后 ST.ai.decisions 带着目标 -----------------
    ST.player = "USA";
    ST.mil = 4;
    applyPlayerDecisions();
    simFastForward(1984, 6);
    ST.player = "USA"; ST.mil = 4; applyPlayerDecisions();
    updateAIDecisions(1984, 6, true);
    const decSun = ST.ai.decisions.SUN;
    assert("aiDecisionsCarryObjectives",
      !!decSun && Array.isArray(decSun.objectives) && decSun.objectives.length > 0,
      "AI 决策应携带目标列表");
    assert("aiDecisionMilIsFinite",
      !!decSun && typeof decSun.mil === "number" && isFinite(decSun.mil) && decSun.mil >= 0 && decSun.mil <= 12,
      "AI 军费必须落在 [0,12]，实为 " + (decSun && decSun.mil));
    assert("econSnapshotNotPersisted", (() => {
      // 快照是派生量：不进存档（否则每月 54 条读数会白白撑大存档，
      // 而且读档后会变成过期数据）。
      const d = simSave().ok ? JSON.parse(localStorage.getItem(SAVE_KEY)) : null;
      return !d || d.econWorld === undefined;
    })(), "经济快照不得写入存档（派生量不持久化）");

    ST.player = null;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "econaiprobe";
  d.style.display = "none";
  d.textContent = "ECONAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
