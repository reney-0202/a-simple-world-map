"use strict";

// ---- Phase Cri2：危机卡扩写 + 国势门控全链路探针 ------------------------------
// 要证明：
//   1. 新增 5 张门控危机进库，且每阶梯有词表内可消费效果键；
//   2. 国势热度可读，后果调制随热度/阶梯方向正确（高热放大强硬）；
//   3. 玩家软触发：热度不足 → 自动史实阶梯 2（落效果、不丢事件）；
//   4. 旁观仍只记阶梯 2、零效果回写；旧卡无 gate 时后果恒等；
//   5. 日历真理不变：到月必入账，无双触发。
function runCri2Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("CRITWOPROBE FAIL [" + name + "]: " + msg);
    }
  };

  const CRI2_IDS = [
    "crisis_ablearcher_1983",
    "crisis_eldorado_1986",
    "crisis_chernobyl_1986",
    "crisis_rust_1987",
    "crisis_berlinwall_1989"
  ];

  try {
    const API = window.W1980_CRISES;
    const EFF = window.W1980_EFFECTS;
    assert("databaseLoaded", !!(API && Array.isArray(API.list)), "W1980_CRISES 应载入");
    assert("effectsVocabLoaded", !!(EFF && typeof EFF.isEffect === "function"), "W1980_EFFECTS 应载入");
    assert("gateHelpersExist",
      typeof crisisSituationHeat === "function" &&
      typeof crisisApplyGate === "function" &&
      typeof crisisSoftAutoBaseline === "function",
      "国势门控辅助函数应已定义");
    if (!API || !EFF) throw new Error("cannot continue without crisis/effects API");

    // ---- 1. 扩写规模与 Cri2 id ----
    assert("crisesCountGte13", API.list.length >= 13, "危机总数应至少 13（8+Cri2），实为 " + API.list.length);
    assert("cri2IdsMatch", typeof API.cri2Ids === "function" &&
      API.cri2Ids().slice().sort().join(",") === CRI2_IDS.slice().sort().join(","),
      "cri2Ids 应正好对应 5 张门控卡");
    for (let i = 0; i < CRI2_IDS.length; i++) {
      const id = CRI2_IDS[i];
      const cr = API.getCrisisById(id);
      assert(id + "Loaded", !!cr, id + " 应存在");
      assert(id + "Gated", !!(cr && API.isGated(cr) && cr.gate.modulate),
        id + " 应声明 gate.modulate");
      assert(id + "ThreeTiers", !!(cr && cr.options && cr.options.length === 3),
        id + " 应有三级阶梯");
    }

    // ---- 2. 词表 + 真实消费者键（禁止纯文案）----
    const CONSUMER = [
      "tensionDelta", "prestigeDelta", "sunConservative", "sunReformist",
      "sunShortage", "usaCongressApproval", "stabilityBonus", "defconRisk",
      "natoCohesion", "middleEastTension", "gbrPopularity", "cubanTension",
      "cocomStrict", "usSanctionPressure"
    ];
    const unk = [];
    const bare = [];
    for (let i = 0; i < CRI2_IDS.length; i++) {
      const cr = API.getCrisisById(CRI2_IDS[i]);
      for (let t = 0; t < (cr.options || []).length; t++) {
        const opt = cr.options[t];
        const bad = EFF.unknownKeys(opt.effects);
        if (bad.length) unk.push(cr.id + "/t" + opt.tier + ":" + bad.join(","));
        const hit = CONSUMER.filter((k) => {
          const v = opt.effects[k];
          return v === true || (typeof v === "number" && v !== 0);
        });
        if (!hit.length) bare.push(cr.id + "/t" + opt.tier);
      }
    }
    assert("cri2EffectsInVocab", unk.length === 0,
      "表外键 " + unk.length + (unk.length ? "：" + unk.join(" | ") : ""));
    assert("cri2EachTierHasConsumer", bare.length === 0,
      "无消费者阶梯 " + bare.length + (bare.length ? "：" + bare.join(",") : ""));

    // ---- 3. 旧卡无 gate：调制恒等 ----
    const old = API.getCrisisById("crisis_poland_1981");
    const oldEff = old.options[2].effects;
    const oldOut = crisisApplyGate(oldEff, old, 3);
    assert("legacyUngatedIdentity", oldOut === oldEff ||
      (oldOut.tensionDelta === oldEff.tensionDelta && oldOut.__gateScale === undefined),
      "无 gate 的旧卡后果应恒等（不调制）");

    // ---- 4. 国势调制方向：高热放大强硬、压缩克制 ----
    initDomesticState();
    if (typeof initNukeState === "function") initNukeState();
    if (!ST.ai) ST.ai = {};
    if (!ST.ai.tensions) ST.ai.tensions = {};
    ST.player = "USA";
    ST.ai.tensions["USA:SUN"] = 90;
    if (ST.nuke) ST.nuke.esc = 70;
    if (typeof polEconDomesticOf === "function") {
      const dom = polEconDomesticOf("USA");
      if (dom) dom.unrest = 60;
    }
    const heatHot = crisisSituationHeat();
    assert("heatHotHigh", heatHot >= 0.55, "高张力/升级时应读出高热度，实为 " + heatHot);

    const aa = API.getCrisisById("crisis_ablearcher_1983");
    const hardHot = crisisApplyGate(aa.options[2].effects, aa, 3);
    const softHot = crisisApplyGate(aa.options[0].effects, aa, 1);
    assert("hotAmplifiesHardline",
      Math.abs(hardHot.tensionDelta) > Math.abs(aa.options[2].effects.tensionDelta) - 1e-9 &&
      hardHot.__gateScale > 1,
      "高热应放大强硬阶梯数值（scale=" + hardHot.__gateScale + "）");
    assert("hotDampensRestraint",
      Math.abs(softHot.tensionDelta) < Math.abs(aa.options[0].effects.tensionDelta) + 1e-9 &&
      softHot.__gateScale < 1,
      "高热应压缩克制阶梯数值（scale=" + softHot.__gateScale + "）");

    ST.ai.tensions["USA:SUN"] = 15;
    if (ST.nuke) ST.nuke.esc = 5;
    if (typeof polEconDomesticOf === "function") {
      const dom2 = polEconDomesticOf("USA");
      if (dom2) dom2.unrest = 15;
    }
    const heatCool = crisisSituationHeat();
    assert("heatCoolLow", heatCool <= 0.35, "低国势应读出低热度，实为 " + heatCool);
    const hardCool = crisisApplyGate(aa.options[2].effects, aa, 3);
    assert("coolDampensHardline", hardCool.__gateScale < 1,
      "低热应压缩强硬阶梯（scale=" + hardCool.__gateScale + "）");

    // ---- 5. 真实消费者：门控卡决断写入张力 / 升级 / 威望 ----
    initCrisisState();
    initDomesticState();
    if (typeof initNukeState === "function") initNukeState();
    if (typeof initPrestigeState === "function") initPrestigeState();
    ST.player = "USA";
    ST.ai = ST.ai || {};
    ST.ai.tensions = ST.ai.tensions || {};
    ST.ai.tensions["USA:SUN"] = 50;
    if (ST.nuke) ST.nuke.esc = 20;
    const t0 = ST.ai.tensions["USA:SUN"];
    const esc0 = ST.nuke ? ST.nuke.esc : 0;
    const pres0 = (typeof prestigeOf === "function") ? prestigeOf("USA") : 0;
    assert("resolveAbleArcherHard", resolveCrisis("crisis_ablearcher_1983", 3, true) === true,
      "Able Archer 强硬阶梯应可决断");
    assert("ableArcherTensionConsumer", ST.ai.tensions["USA:SUN"] > t0,
      "强硬决断应抬升美苏张力");
    assert("ableArcherEscConsumer", ST.nuke && ST.nuke.esc > esc0,
      "强硬决断应推升核升级（含阶梯 + defconRisk）");
    if (typeof prestigeOf === "function") {
      assert("ableArcherPrestigeConsumer", prestigeOf("USA") !== pres0,
        "prestigeDelta 应写入威望（实为 " + prestigeOf("USA") + "）");
    } else {
      assert("ableArcherPrestigeConsumer", false, "prestigeOf 缺失");
    }

    // ---- 6. 软触发：热度不足 → 自动史实阶梯 2 ----
    initCrisisState();
    ST.player = "USA";
    ST.ai.tensions["USA:SUN"] = 10;
    if (ST.nuke) ST.nuke.esc = 0;
    if (typeof polEconDomesticOf === "function") {
      const d = polEconDomesticOf("USA");
      if (d) d.unrest = 10;
    }
    assert("softAutoWhenCool", crisisSoftAutoBaseline(aa) === true,
      "低热时 Able Archer 应软触发自动史实");
    CR.probeMode = false;
    const modal = $("crisis-modal");
    if (modal) modal.style.display = "none";
    updateMonthlyCrises(1983, 11, true);
    assert("softAutoRecordedTier2",
      ST.crises.history.some((h) => h.id === "crisis_ablearcher_1983" && h.tier === 2),
      "软触发应入账史实阶梯 2");
    assert("softAutoNoPendingModal",
      ST.crises.pending === null && (!modal || modal.style.display === "none" || modal.style.display === ""),
      "软触发不得留下 pending 弹窗");

    // 热度足够 → 应弹窗（非 probeMode）
    initCrisisState();
    ST.player = "USA";
    ST.ai.tensions["USA:SUN"] = 85;
    if (ST.nuke) ST.nuke.esc = 55;
    if (typeof polEconDomesticOf === "function") {
      const d3 = polEconDomesticOf("USA");
      if (d3) d3.unrest = 55;
    }
    assert("modalWhenHot", crisisSoftAutoBaseline(aa) === false,
      "高热时不应软触发");
    updateMonthlyCrises(1983, 11, false);
    assert("hotOpensModal", ST.crises.pending && ST.crises.pending.id === "crisis_ablearcher_1983",
      "高热玩家路径应打开危机弹窗");
    hideCrisisModal();
    ST.crises.pending = null;

    // ---- 7. 旁观：到月记阶梯 2、零效果回写、不因门控丢事件 ----
    initCrisisState();
    ST.player = null;
    CR.probeMode = false;
    if (!ST.ai) ST.ai = {};
    ST.ai.tensions = { "USA:SUN": 50 };
    const tSpec = ST.ai.tensions["USA:SUN"];
    updateMonthlyCrises(1986, 4, true);
    updateMonthlyCrises(1986, 5, true);
    updateMonthlyCrises(1989, 11, true);
    assert("spectatorCri2Recorded",
      ST.crises.history.filter((h) => CRI2_IDS.indexOf(h.id) >= 0 && h.tier === 2 && h.auto).length >= 3,
      "旁观应对 Cri2 卡记史实阶梯 2");
    assert("spectatorNoTensionDrift", ST.ai.tensions["USA:SUN"] === tSpec,
      "旁观自动入账不得回写张力");
    // 双触发防护
    const before = ST.crises.history.length;
    updateMonthlyCrises(1986, 4, true);
    assert("noDoubleFire", ST.crises.history.length === before,
      "同月重复调用不得双触发");

    // ---- 8. 切尔诺贝利消费者：改革派 / 短缺 ----
    initCrisisState();
    initDomesticState();
    ST.player = "SUN";
    const ref0 = ST.domestic.sun.reformist;
    const sh0 = ST.domestic.sun.shortage;
    resolveCrisis("crisis_chernobyl_1986", 1, true);
    assert("chernobylReformConsumer", ST.domestic.sun.reformist > ref0,
      "切尔诺贝利透明路线应抬升改革派");
    assert("chernobylShortageConsumer", ST.domestic.sun.shortage > sh0,
      "切尔诺贝利应抬升物资短缺");

    // 恢复纯净
    ST.player = null;
    ST.mil = 0;
    CR.probeMode = false;
    initCrisisState();
    hideCrisisModal();
    if (typeof applyPlayerDecisions === "function") applyPlayerDecisions();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
    console.error("CRITWOPROBE exception", e);
  }

  // 标记须纯字母：runner 的 MARKER_RE 是 [A-Z]+PROBE（故不用 CRI2PROBE）
  const d = document.createElement("div"); d.id = "cri2probe"; d.style.display = "none";
  d.textContent = "CRITWOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
