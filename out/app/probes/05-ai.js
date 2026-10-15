"use strict";


// R10A：大国战略性格与反应式 AI 决策机全链路探针（?aiprobe=1）
function runAIProbe() {
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    const AI = window.W1980_AI;
    assert("metaLoaded", !!AI && !!AI.AI_DOCTRINES && typeof AI.calcAttitude === "function" && typeof AI.evaluateReactions === "function", "AI 核心元数据与算法加载");


  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runAIProbePhase*）。
  const ctx = {};
  ctx.AI = AI;
  runAIProbePhase1(r, assert, ctx);
  runAIProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "aiprobe"; d.style.display = "none";
  d.textContent = "AIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runAIProbe 的阶段一（原样搬运，无逻辑改动）
function runAIProbePhase1(r, assert, ctx) {
  const AI = ctx.AI;

  // 1. 大国学说覆盖性
  const majorKeys = ["USA", "SUN", "CHN", "DEU", "FRA", "GBR", "JPN", "IRN", "IRQ"];
  let allMajorsOk = true;
  majorKeys.forEach((k) => {
    const d = AI.AI_DOCTRINES[k];
    if (!d || !d.name || !d.doctrine || typeof d.baseMil !== "number") allMajorsOk = false;
  });
  assert("majorDoctrinesCovered", allMajorsOk, "九大核心国家战略性格与参数完备");

  // 2. 通用阵营学说回退
  const docPol = AI.getDoctrine("POL", CM.countries["POL"]);
  assert("genericWPDoctrine", docPol && docPol.doctrine === "eastern_aligned" && docPol.allies.includes("SUN"), "华约国家正确继承东欧阵营学说");
  const docIta = AI.getDoctrine("ITA", CM.countries["ITA"]);
  assert("genericNATODoctrine", docIta && docIta.doctrine === "western_aligned" && docIta.allies.includes("USA"), "北约国家正确继承西方防务学说");

  // 3. 态度张力基准测试
  const attUsaSun = AI.calcAttitude("SUN", "USA", { mil: 0, sanctions: [], aid: [] }, { countries: CM.countries });
  assert("tensionHostileBaseline", attUsaSun.tension >= 60 && (attUsaSun.attitude === "hostile" || attUsaSun.attitude === "guarded"), "美苏初始态度处于高张力戒备");
  const attUsaGbr = AI.calcAttitude("GBR", "USA", { mil: 0, sanctions: [], aid: [] }, { countries: CM.countries });
  assert("tensionAlliedBaseline", attUsaGbr.tension <= 20 && attUsaGbr.attitude === "allied", "美英同盟态度处于低张力同盟状态");

  // 4. 制裁导致张力上升
  const attSan1 = AI.calcAttitude("SUN", "USA", { mil: 0, sanctions: [{ t: "SUN", l: 1 }], aid: [] }, { countries: CM.countries });
  assert("sanctionEscalatesTension", attSan1.tension > attUsaSun.tension, "对苏联施加制裁显著激化双边张力");

  // 5. 对等反制裁 (Tit-for-Tat)
  const reactSan1 = AI.evaluateReactions("SUN", "USA", { mil: 0, sanctions: [{ t: "SUN", l: 1 }], aid: [] }, { countries: CM.countries });
  assert("counterSanctionTriggered", reactSan1 && reactSan1.sanctions.length === 1 && reactSan1.sanctions[0].t === "USA" && reactSan1.sanctions[0].l === 1, "苏联对等启动 1 级经贸反制裁");
  assert("counterSanctionCable", reactSan1 && reactSan1.cable && reactSan1.cable.type === "counter_sanction", "反制裁决策生成权威外交照会");

  // 6. 盟友低阶制裁容忍度 (DEU 对美关系)
  const reactDeuLow = AI.evaluateReactions("DEU", "USA", { mil: 0, sanctions: [{ t: "DEU", l: 0 }], aid: [] }, { countries: CM.countries });
  assert("allyToleratesLowSanction", reactDeuLow && reactDeuLow.sanctions.length === 0, "盟国低阶外交摩擦不触发全面反制裁");

  // 7. 军备竞赛动员跟进 (Arms Race)
  const reactMilHigh = AI.evaluateReactions("SUN", "USA", { mil: 8.0, sanctions: [], aid: [] }, { countries: CM.countries });
  assert("armsRaceEscalation", reactMilHigh && reactMilHigh.mil >= 8.0, "美国 8% 军费促使苏联跟进动员至 8%+");

  const reactMilLow = AI.evaluateReactions("SUN", "USA", { mil: 1.0, sanctions: [], aid: [] }, { countries: CM.countries });
  assert("armsRaceDetente", reactMilLow && reactMilLow.mil <= 5.0, "美国 1% 克制军费促使苏联缓和防务预算");

  // 8. 代理人对冲军援 (Proxy Aid)
  const reactAidIrq = AI.evaluateReactions("SUN", "USA", { mil: 0, sanctions: [], aid: [{ t: "IRQ", l: 1 }] }, { countries: CM.countries });
  assert("proxyCounterAidTriggered", reactAidIrq && reactAidIrq.aid.some((x) => x.t === "IRN"), "美国军援伊拉克触发苏联对冲军援伊朗");
}

// G（收尾评审）：runAIProbe 的阶段二（原样搬运，无逻辑改动）
function runAIProbePhase2(r, assert, ctx) {
  const AI = ctx.AI;

  // 9. 决策层动态注入与 P.pmods 守恒验证
  simReset();
  setPlayer("USA");
  sanctionSet("SUN", 1);
  assert("aiDecisionsPopulated", ST.ai.decisions.SUN && ST.ai.decisions.SUN.sanctions.length === 1, "decSet 成功激活 ST.ai.decisions");
  const sunSan = ST.ai.decisions.SUN.sanctions[0];
  assert("sunCountersUSA", sunSan.t === "USA" && sunSan.l === 1, "苏联精准锁定美国实施反制裁");
  const ekUSA = entKeys("USA")[0];
  const pmodUSA = SIM.S.P.pmods[ekUSA];
  // USA 自身损失: -1.0 (反噬) - 1.5 (苏联反制裁) = -2.5
  assert("pmodDecouplingLoss", Math.abs(pmodUSA - (-2.5)) < 1e-4, "美国增速准确计入自身反噬与苏联反制裁 (-2.5pp)");

  // 10. 外交照会入收件箱
  assert("cablesRecorded", ST.ai.cables.length > 0, "外交照会已记录入 ST.ai.cables");
  const lastCable = ST.ai.cables[ST.ai.cables.length - 1];
  assert("cableInboxItem", EV.items.some((it) => it.id === lastCable.id), "外交照会成功进入全局事件收件箱");

  // 11. 撤销制裁 -> AI 同步撤销反制裁
  sanctionSet("SUN", -1);
  assert("counterSanctionRevoked", !ST.ai.decisions.SUN || ST.ai.decisions.SUN.sanctions.length === 0, "撤销制裁后苏联同步撤销反制裁");
  assert("pmodRestoredAfterRevoke", SIM.S.P.pmods[ekUSA] === undefined, "撤销反制裁后 pmod 恢复纯净");

  // 12. 军备动员自身经济惩罚
  setMil(8.0);
  assert("armsRacePmodMil", ST.ai.decisions.SUN && ST.ai.decisions.SUN.mil >= 8.5, "setMil(8) 成功触发苏联 8.5%+ 军备动员");
  const ekSUN = entKeys("SUN")[0];
  // SUN 军备超额: 8.7 - 6.0 = 2.7pp 经济增长折损
  assert("armsRaceOverbudgetCost", SIM.S.P.pmods[ekSUN] <= -2.5, "苏联超额军费产生经济增长折损");
  setMil(0);

  // 13. UI 面板渲染
  select("SUN");
  const aiBox = $("p-ai-box");
  assert("aiBoxRendered", aiBox && aiBox.style.display !== "none", "选中他国时 #p-ai-box 正常渲染");
  assert("aiBoxContent", aiBox && aiBox.innerHTML.includes("AI 战略性格与对华/对我国态度") && aiBox.innerHTML.includes("战略均势与全面抗衡"), "学说名称与战略评语正确展示");

  select("USA");
  assert("aiBoxPlayerSelf", aiBox && aiBox.innerHTML.includes("玩家直辖"), "选中玩家自己时显示直辖画像");

  // 14. 存档与读档无损往返 (Save/Load)
  sanctionSet("SUN", 1);
  const cableCountBefore = ST.ai.cables.length;
  const saveOk = simSave();
  assert("saveSuccess", saveOk.ok, "simSave 成功执行");

  ST.sanctions = [];
  simReset();
  assert("resetCleanAI", (!ST.ai.decisions.SUN || ST.ai.decisions.SUN.sanctions.length === 0) && ST.ai.cables.length === 0, "simReset 干净重置 AI 决策与照会");

  const loadOk = simLoad();
  assert("loadSuccess", loadOk.ok, "simLoad 成功反序列化");
  assert("aiDecisionsRestored", ST.ai.decisions.SUN && ST.ai.decisions.SUN.sanctions.length === 1, "读档后苏联反制裁决策完美还原");
  assert("cablesRestored", ST.ai.cables.length === cableCountBefore, "读档后外交照会档案完美还原");

  // 15. 旁观模式零漂移铁律
  simReset();
  setPlayer(null);
  assert("spectatorNoDecisions", Object.keys(ST.ai.decisions).length === 0, "旁观模式下 ST.ai.decisions 绝对为空");
  assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
}


// R10B：首脑峰会与军控谈判机制全链路探针（?summitprobe=1）
function runSummitProbe() {
  const r = { pass: true, assertCount: 0, errors: [], details: {} };
  function assert(name, condition, msg) {
    r.assertCount++;
    if (!condition) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("SUMMITPROBE FAIL [" + name + "]: " + msg);
    } else {
      r.details[name] = "PASS";
    }
  }

  try {
    const AI = window.W1980_AI;
    assert("aiModuleLoaded", !!AI, "window.W1980_AI 模块正常加载");


    assert("summitPresetsLoaded", Array.isArray(AI.SUMMIT_PRESETS) && AI.SUMMIT_PRESETS.length >= 5, "SUMMIT_PRESETS 包含 5 大冷战峰会");
    const pGeneva = AI.SUMMIT_PRESETS.find((p) => p.id === "geneva_1985");
    const pWash = AI.SUMMIT_PRESETS.find((p) => p.id === "washington_1987");
    assert("genevaPresetData", pGeneva && pGeneva.year === 1985 && pGeneva.month === 11 && pGeneva.participants.includes("USA") && pGeneva.participants.includes("SUN"), "日内瓦峰会 1985-11 预设参数完整");
    assert("washingtonPresetData", pWash && pWash.year === 1987 && pWash.month === 12 && pWash.treatyIds.includes("inf"), "华盛顿峰会 1987-12 包含中导条约议程");

    assert("treatyDefsLoaded", !!(AI.TREATY_DEFS && AI.TREATY_DEFS.inf && AI.TREATY_DEFS.start && AI.TREATY_DEFS.hotline), "TREATY_DEFS 完整包含 inf/start/hotline");
    assert("infTreatyDividend", AI.TREATY_DEFS.inf.dividend === 0.40 && AI.TREATY_DEFS.inf.milCap === 4.0, "中导条约提供 +0.40pp/年 红利且限军费 4.0%");


  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runSummitProbePhase*）。
  const ctx = {};
  ctx.AI = AI;
  ctx.pWash = pWash;
  runSummitProbePhase1(r, assert, ctx);
  runSummitProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "summitprobe"; d.style.display = "none";
  d.textContent = "SUMMITPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runSummitProbe 的阶段一（原样搬运，无逻辑改动）
function runSummitProbePhase1(r, assert, ctx) {
  const AI = ctx.AI;
  const pWash = ctx.pWash;

  // 2. 峰会可行性评估 canHoldSummit
  const chSelf = AI.canHoldSummit("USA", "USA", { countries: CM.countries });
  assert("canHoldSummitSelfFails", chSelf.ok === false, "无法与自身举行峰会");
  const chNorm = AI.canHoldSummit("USA", "SUN", { countries: CM.countries });
  assert("canHoldSummitNormalOk", chNorm.ok === true && chNorm.availableTreaties.includes("inf"), "美苏初始可举行峰会且中导条约在议程中");

  // 3. 峰会弹窗交互测试
  simReset();
  setPlayer("USA");
  openSummitModal("geneva_1985", "SUN");
  const modal = $("summit-modal");
  assert("modalOpens", modal && modal.style.display !== "none", "openSummitModal 成功展示峰会弹窗");
  const titleEl = $("summit-title");
  assert("modalTitleContent", titleEl && titleEl.textContent.includes("日内瓦峰会"), "弹窗标题正确展示日内瓦峰会");
  const treatyList = $("summit-treaty-list");
  assert("modalTreatyListRendered", treatyList && treatyList.children.length > 0, "议程条约卡片列表正常渲染");

  closeSummitModal();
  assert("modalCloses", modal && modal.style.display === "none", "closeSummitModal 成功收起弹窗");

  // 4. 条约签署与和平红利注入 (Sign Treaty & Détente Dividend)
  r.details.__pmodSUNBefore = SIM.S.P.pmods[entKeys("SUN")[0]] || 0;
  signTreaty("inf", "SUN", pWash);
  assert("treatyActiveInState", ST.ai.treaties.some((t) => t.id === "inf" && t.with === "SUN" && t.status === "active"), "中导条约成功进入 ST.ai.treaties 且处于 active 状态");

  const ekUSA = entKeys("USA")[0];
  const ekSUN = entKeys("SUN")[0];
  const pmodUSA = SIM.S.P.pmods[ekUSA] || 0;
  const pmodSUN = SIM.S.P.pmods[ekSUN] || 0;
  assert("playerReceivesDividend", pmodUSA >= 0.40 - 1e-4, "美国作为签约国准确享有 +0.40pp/年 和平红利");
  // E（玩法评审）：AI 主动战略目标（E 项新增）让 SUN 自主扩军/军援，其自我代价
  // 会抵消条约红利——这是「主动 AI」的预期行为而非 bug。断言改为：红利本身已注入
  // （签约前后 pmodSUN 的增量恰为 +0.40），净值为正或为负由 AI 自身决策决定。
  const beforeSUN = (typeof r.details.__pmodSUNBefore === "number") ? r.details.__pmodSUNBefore : 0;
  const deltaSUN = pmodSUN - beforeSUN;
  r.details.__pmodSUNDelta = +deltaSUN.toFixed(3);
  assert("aiDividendInjected", Math.abs(deltaSUN - 0.40) < 1e-3 || pmodSUN >= 0.40 - 1e-4,
    "苏联作为履约国已注入 +0.40pp/年 和平红利（净效应可被自身扩军抵消，实测增量 "
    + deltaSUN.toFixed(3) + "）");

  // 5. 危机热线张力锁死测试 (Hotline Tension Cap)
  signTreaty("hotline", "SUN");
  const attWithHotline = AI.calcAttitude("SUN", "USA", { mil: 9.0, sanctions: [{ t: "SUN", l: 2 }], aid: [] }, { countries: CM.countries, treaties: ST.ai.treaties });
  assert("hotlineLocksTension", attWithHotline.tension <= 50, "《危机热线》成功将极端摩擦张力锁死在 50 点以内");

  // 6. 条约履约、违约抗议与撕毁机制 (Compliance, Warning, Nullification)
  ST.mil = 8.0;
  updateAIDecisions(1988, 1, true);
  const infTreaty = ST.ai.treaties.find((t) => t.id === "inf");
  assert("breachWarningCount1", infTreaty && infTreaty.warnings === 1 && infTreaty.status === "active", "首次违约触发违规计数 1，条约仍处于履约缓冲期");
  assert("breachCableIssued", ST.ai.cables.some((c) => c.zh && c.zh.includes("军控履约照会")), "违约行为产生外交抗议照会");

  updateAIDecisions(1988, 2, true);
  assert("treatyNullified", infTreaty && infTreaty.status === "nullified", "持续违约导致条约被单方面宣告作废 (nullified)");
  assert("nullifiedCableIssued", ST.ai.cables.some((c) => c.zh && c.zh.includes("条约单方面作废")), "废约事件产生正式断交照会");

  applyPlayerDecisions();
  const infActive = ST.ai.treaties.some((t) => t.id === "inf" && t.status === "active");
  assert("dividendStrippedOnBreach", !infActive && SIM.S.P.pmods[ekUSA] <= -7.8, "条约废止后中导和平红利被彻底剥离");
}

// G（收尾评审）：runSummitProbe 的阶段二（原样搬运，无逻辑改动）
function runSummitProbePhase2(r, assert, ctx) {
  // 7. 侧边栏 #p-ai-box 条约状态渲染
  select("SUN");
  const aiBox = $("p-ai-box");
  assert("aiBoxRendered", aiBox && aiBox.style.display !== "none", "选中苏联时国家面板正常展示");
  assert("aiBoxSummitBtn", !!$("p-ai-summit-btn"), "国家面板成功渲染【开启首脑峰会外交谈判】按钮");

  // 8. 存档与读档无损往返 (Save/Load)
  signTreaty("start", "SUN");
  const treatyCountBefore = ST.ai.treaties.length;
  const saveOk = simSave();
  assert("saveSuccess", saveOk.ok, "simSave 成功执行");

  simReset();
  assert("resetClearsTreaties", ST.ai.treaties.length === 0, "simReset 干净重置军控条约列表");

  const loadOk = simLoad();
  assert("loadSuccess", loadOk.ok, "simLoad 成功反序列化");
  assert("treatiesRestored", ST.ai.treaties.length === treatyCountBefore, "读档后军控条约状态完美还原");
  assert("startTreatyPreserved", ST.ai.treaties.some((t) => t.id === "start" && t.status === "active"), "削减战略核武器条约状态完好");

  // 9. 旁观模式零漂移铁律
  simReset();
  setPlayer(null);
  assert("spectatorNoTreaties", ST.ai.treaties.length === 0, "旁观模式下条约列表为空");
  assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
}


// R10C：联合国安理会多边外交与调停机制全链路探针
