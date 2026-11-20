"use strict";

// ---- Phase Cri3：危机卡再扩写全链路探针 ----------------------------------------
// 要证明：
//   1. 新增 5 张门控危机进库（总数 18），每阶梯有词表内可消费效果键；
//   2. 国势调制与软触发仍可用（复用 Cri2 辅助函数，不改日历真理）；
//   3. 旁观仍只记阶梯 2、零效果回写；无双触发；
//   4. 主题不与 Able Archer / 切尔诺贝利同月同效果双计。
function runCri3Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("CRITHREEPROBE FAIL [" + name + "]: " + msg);
    }
  };

  const CRI3_IDS = [
    "crisis_olympics_1980",
    "crisis_lebanon_1982",
    "crisis_miners_1984",
    "crisis_inf_1987",
    "crisis_gulfprelude_1990"
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

    // ---- 1. 扩写规模与 Cri3 id ----
    assert("crisesCount18", API.list.length === 18, "危机总数应为 18（8+5+5），实为 " + API.list.length);
    assert("cri3IdsMatch", typeof API.cri3Ids === "function" &&
      API.cri3Ids().slice().sort().join(",") === CRI3_IDS.slice().sort().join(","),
      "cri3Ids 应正好对应 5 张 Cri3 门控卡");
    assert("cri2IdsUntouched", typeof API.cri2Ids === "function" && API.cri2Ids().length === 5,
      "Cri2 id 列表仍应固定为 5 张，不受 Cri3 污染");
    for (let i = 0; i < CRI3_IDS.length; i++) {
      const id = CRI3_IDS[i];
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
    for (let i = 0; i < CRI3_IDS.length; i++) {
      const cr = API.getCrisisById(CRI3_IDS[i]);
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
    assert("cri3EffectsInVocab", unk.length === 0,
      "表外键 " + unk.length + (unk.length ? "：" + unk.join(" | ") : ""));
    assert("cri3EachTierHasConsumer", bare.length === 0,
      "无消费者阶梯 " + bare.length + (bare.length ? "：" + bare.join(",") : ""));

    // ---- 3. 主题避让：不与 Able Archer / 切尔诺贝利同月同效果双计 ----
    const aa = API.getCrisisById("crisis_ablearcher_1983");
    const ch = API.getCrisisById("crisis_chernobyl_1986");
    assert("noAbleArcherMonthOverlap",
      !CRI3_IDS.some((id) => {
        const c = API.getCrisisById(id);
        return c && aa && c.year === aa.year && c.month === aa.month;
      }),
      "Cri3 不得与 Able Archer 同月");
    assert("noChernobylMonthOverlap",
      !CRI3_IDS.some((id) => {
        const c = API.getCrisisById(id);
        return c && ch && c.year === ch.year && c.month === ch.month;
      }),
      "Cri3 不得与切尔诺贝利危机卡同月");
    const inf = API.getCrisisById("crisis_inf_1987");
    assert("infDistinctFromAbleArcher",
      !!(inf && aa && (inf.year !== aa.year || inf.month !== aa.month) &&
        inf.id !== aa.id),
      "中导条约卡须与优秀射手主题/月份分离");

    // ---- 4. 国势调制：高热放大强硬（复用 Cri2 辅助）----
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
    const olymp = API.getCrisisById("crisis_olympics_1980");
    const hardHot = crisisApplyGate(olymp.options[2].effects, olymp, 3);
    assert("hotAmplifiesCri3Hardline",
      Math.abs(hardHot.tensionDelta) > Math.abs(olymp.options[2].effects.tensionDelta) - 1e-9 &&
      hardHot.__gateScale > 1,
      "高热应放大 Cri3 强硬阶梯（scale=" + hardHot.__gateScale + "）");

    // ---- 5. 真实消费者：奥运强硬写入张力 / 巴统；矿工写入英国民意 ----
    initCrisisState();
    initDomesticState();
    if (typeof initNukeState === "function") initNukeState();
    if (typeof initPrestigeState === "function") initPrestigeState();
    ST.player = "USA";
    ST.ai = ST.ai || {};
    ST.ai.tensions = ST.ai.tensions || {};
    ST.ai.tensions["USA:SUN"] = 50;
    if (ST.cocom) ST.cocom.strict = false;
    const t0 = ST.ai.tensions["USA:SUN"];
    assert("resolveOlympicsHard", resolveCrisis("crisis_olympics_1980", 3, true) === true,
      "奥运抵制强硬阶梯应可决断");
    assert("olympicsTensionConsumer", ST.ai.tensions["USA:SUN"] > t0,
      "强硬决断应抬升美苏张力");
    assert("olympicsCocomConsumer", ST.cocom && ST.cocom.strict === true,
      "强硬决断应打开巴统严格开关");

    initCrisisState();
    initDomesticState();
    ST.player = "GBR";
    const unrest0 = (ST.domestic && ST.domestic.gbr && typeof ST.domestic.gbr.unrest === "number")
      ? ST.domestic.gbr.unrest : null;
    assert("resolveMinersSoft", resolveCrisis("crisis_miners_1984", 1, true) === true,
      "矿工潮克制阶梯应可决断");
    if (unrest0 !== null && typeof nukeApplyEffect === "function") {
      // gbrPopularity 正值 → 动荡下降（N1 消费者）
      assert("minersGbrConsumer", ST.domestic.gbr.unrest < unrest0,
        "克制路线 gbrPopularity 应降低英国动荡（" + unrest0 + "→" + ST.domestic.gbr.unrest + "）");
    } else {
      assert("minersGbrConsumer", unrest0 !== null, "英国内政模型应存在 unrest");
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
    assert("softAutoWhenCool", crisisSoftAutoBaseline(olymp) === true,
      "低热时奥运卡应软触发自动史实");
    CR.probeMode = false;
    const modal = $("crisis-modal");
    if (modal) modal.style.display = "none";
    updateMonthlyCrises(1980, 7, true);
    assert("softAutoRecordedTier2",
      ST.crises.history.some((h) => h.id === "crisis_olympics_1980" && h.tier === 2),
      "软触发应入账史实阶梯 2");
    assert("softAutoNoPendingModal",
      ST.crises.pending === null && (!modal || modal.style.display === "none" || modal.style.display === ""),
      "软触发不得留下 pending 弹窗");

    // ---- 7. 旁观：到月记阶梯 2、零效果回写、无双触发 ----
    initCrisisState();
    ST.player = null;
    CR.probeMode = false;
    if (!ST.ai) ST.ai = {};
    ST.ai.tensions = { "USA:SUN": 50 };
    const tSpec = ST.ai.tensions["USA:SUN"];
    updateMonthlyCrises(1980, 7, true);
    updateMonthlyCrises(1982, 6, true);
    updateMonthlyCrises(1984, 3, true);
    updateMonthlyCrises(1987, 12, true);
    updateMonthlyCrises(1990, 7, true);
    assert("spectatorCri3Recorded",
      ST.crises.history.filter((h) => CRI3_IDS.indexOf(h.id) >= 0 && h.tier === 2 && h.auto).length === 5,
      "旁观应对全部 5 张 Cri3 卡记史实阶梯 2");
    assert("spectatorNoTensionDrift", ST.ai.tensions["USA:SUN"] === tSpec,
      "旁观自动入账不得回写张力");
    const before = ST.crises.history.length;
    updateMonthlyCrises(1982, 6, true);
    assert("noDoubleFire", ST.crises.history.length === before,
      "同月重复调用不得双触发");

    // ---- 8. 中导 / 海湾消费者抽检 ----
    initCrisisState();
    initDomesticState();
    if (typeof initNukeState === "function") initNukeState();
    ST.player = "USA";
    ST.ai.tensions = { "USA:SUN": 55 };
    if (ST.nuke) ST.nuke.esc = 30;
    const esc0 = ST.nuke.esc;
    const tInf0 = ST.ai.tensions["USA:SUN"];
    resolveCrisis("crisis_inf_1987", 1, true);
    assert("infTensionConsumer", ST.ai.tensions["USA:SUN"] < tInf0,
      "中导信任加速应降低张力");
    assert("infDefconConsumer", ST.nuke.esc <= esc0,
      "中导克制路径不应推高核升级读数");

    initCrisisState();
    if (typeof initNukeState === "function") initNukeState();
    ST.player = "USA";
    ST.ai.tensions = { "USA:SUN": 45 };
    if (ST.nuke) ST.nuke.esc = 20;
    const escG0 = ST.nuke.esc;
    resolveCrisis("crisis_gulfprelude_1990", 3, true);
    assert("gulfEscConsumer", ST.nuke && ST.nuke.esc > escG0,
      "海湾前奏强硬应推升核升级（阶梯 + middleEastTension/defconRisk）");

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
    console.error("CRITHREEPROBE exception", e);
  }

  // 标记须纯字母：runner 的 MARKER_RE 是 [A-Z]+PROBE（故不用 CRI3PROBE）
  const d = document.createElement("div"); d.id = "cri3probe"; d.style.display = "none";
  d.textContent = "CRITHREEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
