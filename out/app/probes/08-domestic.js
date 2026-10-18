"use strict";


// ---- R12A: 大国内政生态与派系权力天平全链路探针 ----
function runDomesticProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("DOMESTICPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {

  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runDomesticProbePhase*）。
  const ctx = {};
  runDomesticProbePhase1(r, assert, ctx);
  runDomesticProbePhase2(r, assert, ctx);
  runDomesticProbePhase3(r, assert, ctx);
  runDomesticProbePhase4(r, assert, ctx);
  runDomesticProbePhase5(r, assert, ctx);
  runDomesticProbePhase6(r, assert, ctx);
  runDomesticProbePhase7(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "domesticprobe"; d.style.display = "none";
  d.textContent = "DOMESTICPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runDomesticProbe 的阶段一（原样搬运，无逻辑改动）
function runDomesticProbePhase1(r, assert, ctx) {
  // 1. 函数与数据模型完备性
  assert("initDomesticStateExists", typeof initDomesticState === "function", "initDomesticState 函数应存在");
  assert("updateDomesticPoliticsExists", typeof updateDomesticPolitics === "function", "updateDomesticPolitics 函数应存在");
  assert("refreshDomesticBoxExists", typeof refreshDomesticBox === "function", "refreshDomesticBox 函数应存在");
  assert("applyDomesticPlayerActionExists", typeof applyDomesticPlayerAction === "function", "applyDomesticPlayerAction 函数应存在");

  // 2. 初始化结构检查
  initDomesticState();
  assert("stateInitialized", !!ST.domestic && !!ST.domestic.sun && !!ST.domestic.usa && !!ST.domestic.generals, "ST.domestic 结构完备");
  assert("sunInitialValues", ST.domestic.sun.conservative === 55 && ST.domestic.sun.reformist === 45 && ST.domestic.sun.shortage === 28, "苏联内政初值正确 (保守 55, 改革 45, 短缺 28)");
  assert("usaInitialValues", ST.domestic.usa.congressApproval === 62 && ST.domestic.usa.presidentialApproval === 58 && ST.domestic.usa.budgetCapActive === false, "美国内政初值正确 (国会 62, 总统民调 58, 预算帽 false)");

  // 3. 通用实体检索与初值
  const chnGen = getGeneralDomestic("CHN");
  assert("generalDomesticInit", chnGen && chnGen.stability >= 75 && chnGen.legitimacy >= 70, "通用实体内政模型正常初始化");

  // 4. 苏联高军费传导测试 (保守派上升，短缺上升，改革派受压)
  const prevC = ST.domestic.sun.conservative;
  const prevS = ST.domestic.sun.shortage;
  ST.player = "SUN";
  ST.mil = 8.0;
  updateDomesticPolitics(1980, 2, true);
  assert("sunHighMilConservativeRises", ST.domestic.sun.conservative > prevC, "苏联高军费保守派满意度提升");
  assert("sunHighMilShortageRises", ST.domestic.sun.shortage > prevS, "苏联高军费轻工短缺指数恶化");

  // 5. 苏联降军费转向民生测试
  ST.mil = 3.0;
  const curC = ST.domestic.sun.conservative;
  const curS = ST.domestic.sun.shortage;
  updateDomesticPolitics(1980, 3, true);
  assert("sunLowMilShortageDeclines", ST.domestic.sun.shortage < curS, "苏联压缩军费消费品短缺缓解");
  assert("sunLowMilConservativeDeclines", ST.domestic.sun.conservative < curC, "苏联压缩军费保守派满意度下降");

  // 6. 短缺累积社会动荡联动
  ST.domestic.sun.shortage = 75;
  const prevUnrest = ST.domestic.sun.unrest;
  updateDomesticPolitics(1980, 4, true);
  assert("sunShortageTriggersUnrest", ST.domestic.sun.unrest > prevUnrest, "严重商品短缺累积社会动荡");

  // 7. 政治局危机预警触发
  ST.domestic.sun.conservative = 20;
  updateDomesticPolitics(1980, 5, true);
  assert("sunCrisisWarningTriggered", typeof ST.domestic.sun.crisisWarning === "string" && ST.domestic.sun.crisisWarning.includes("保守派强硬元老"), "保守派满意度跌破阈值触发倒阁预警");
}

// G（收尾评审）：runDomesticProbe 的阶段二（原样搬运，无逻辑改动）
function runDomesticProbePhase2(r, assert, ctx) {
  // 8. 美国国会支持率与《格拉姆-拉德曼法案》预算帽测试
  ST.player = "USA";
  ST.mil = 8.0;
  ST.domestic.usa.congressApproval = 48;
  updateDomesticPolitics(1980, 6, true);
  assert("usaCongressDeclinesOnHighMil", ST.domestic.usa.congressApproval < 48, "美国巨额赤字侵蚀两党国会支持率");
  
  // 跌破 45 触发预算帽
  ST.domestic.usa.congressApproval = 42;
  updateDomesticPolitics(1980, 7, true);
  assert("usaBudgetCapActivated", ST.domestic.usa.budgetCapActive === true, "国会支持率低于 45% 触发格拉姆-拉德曼预算上限");

  // 9. 预算帽生效时对玩家军费的自动限制
  applyPlayerDecisions();
  assert("usaBudgetCapEnforcesMilCap", ST.mil <= 6.0, "预算帽生效时军费被刚性限制在 6.0% 上限");

  // 10. 四年总统大选周期判定测试 (1984-11)
  ST.domestic.usa.presidentialApproval = 60;
  updateDomesticPolitics(1984, 11, true);
  assert("usaElectionEvaluated", !!ST.domestic.usa.electionResult && ST.domestic.usa.nextElectionYear === 1988, "1984 年大选正确评定且下届设定为 1988");
  assert("usaElectionVictoryTag", ST.domestic.usa.electionResult.includes("大捷") || ST.domestic.usa.electionResult.includes("胜选"), "高民调判定大选获胜");

  // 11. 治理微调操作动作测试
  ST.player = "SUN";
  // L：施政动作现在消耗政治资本 —— 断言动作效果前先把预算充满（动作本身的
  // 扣费与拒绝路径由 Phase6 单独覆盖，此处只验证效果传导）
  initPoliticalCapital(true);
  ST.politicalCapital.value = PC_CAP;
  const beforeShortage = ST.domestic.sun.shortage;
  applyDomesticPlayerAction("rebalance_consumer");
  assert("sunActionRebalanceSuccess", ST.domestic.sun.shortage < beforeShortage, "推进轻工转型动作使短缺指数下降");

  // 12. 动荡经济产出拖累在 applyPlayerDecisions 中验证
  ST.domestic.sun.unrest = 60;
  ST.mil = 4.0;
  applyPlayerDecisions();
  const pmodVal = (SIM.S && SIM.S.P && SIM.S.P.pmods && SIM.S.P.pmods.SUN !== undefined) ? SIM.S.P.pmods.SUN : null;
  assert("unrestEconomicDragApplied", pmodVal !== null && pmodVal < -4.0, "内政动荡向单一事实源 P.pmods 注入产出折损");

  // 13. DOM 容器与渲染测试
  const domBox = $("p-domestic-box");
  assert("domBoxElementExists", !!domBox, "#p-domestic-box 容器在 DOM 中存在");

  // 渲染苏联面板
  refreshDomesticBox("SUN");
  assert("sunDomRendered", domBox.innerHTML.includes("政治局权力天平") && domBox.querySelector(".pdb-balance-bar") !== null, "苏联内政面板成功渲染派系天平条与短缺仪表");

  // 渲染美国面板
  refreshDomesticBox("USA");
  assert("usaDomRendered", domBox.innerHTML.includes("国会两党") && domBox.querySelector(".pdb-badge-row") !== null, "美国内政面板成功渲染国会与大选宪政卡片");

  // 渲染通用实体面板（K：GBR 已有专属面板，改用仍走通用模板的国家）
  refreshDomesticBox("ITA");
  assert("generalDomRendered", domBox.innerHTML.includes("内政稳定与执政合法性"), "通用实体成功渲染安定度与合法性仪表");

  // 14. 旁观模式零漂移验证
  ST.player = null;
  applyPlayerDecisions();
  const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
  assert("observerZeroPmods", pmodsCount === 0, "旁观模式下 applyPlayerDecisions 不挂载任何 pmods (0 漂移)");

  // 15. 序列化与存档读档往返测试
  ST.player = "SUN";
  ST.domestic.sun.shortage = 52.3;
  ST.domestic.usa.congressApproval = 39.5;
  simSave();
  initDomesticState();
  assert("stateTamperedBeforeLoad", ST.domestic.sun.shortage === 28, "读档前临时重置确认");
  simLoad();
  assert("stateRestoredAfterLoad", Math.abs(ST.domestic.sun.shortage - 52.3) < 0.1 && Math.abs(ST.domestic.usa.congressApproval - 39.5) < 0.1, "simSave/simLoad 成功完整往返还原内政生态数据");

  // 清理复原
  ST.player = null;
  ST.mil = 0;
  applyPlayerDecisions();
  initDomesticState();
  refreshDomesticBox(ST.sel);
}

// H（玩法深度）：CHN/DEU 内政 ↔ 经济系统双向耦合探针
function runDomesticProbePhase3(r, assert, ctx) {
  // 16. 新增经济耦合字段完备
  initDomesticState();
  ST.player = null;
  ST.sanctions = [];
  ST.mil = 0;
  assert("chnDeuEconFields",
    ST.domestic.chn && ST.domestic.deu &&
    typeof ST.domestic.chn.externalStress === "number" &&
    typeof ST.domestic.deu.energyPressure === "number" &&
    typeof ST.domestic.deu.unrest === "number",
    "CHN/DEU 内政状态包含外部环境压力 / 能源供应压力 / 动荡字段");
  assert("stressHelpersExist",
    typeof chnExternalStress === "function" && typeof deuEnergyStress === "function",
    "chnExternalStress / deuEnergyStress 外部环境评估函数存在");

  // 17. 中国：禁运/制裁 → 外部环境压力累积 → 特区动能流失、双轨物价抬头、动荡上升
  const chnBase = { sez: ST.domestic.chn.sezMomentum, price: ST.domestic.chn.dualTrackPrice, unrest: ST.domestic.chn.unrest };
  ST.domestic.chn.externalStress = 20;
  ST.player = "USA";
  ST.sanctions = [{ t: "CHN", l: 2 }];
  for (let i = 0; i < 60; i++) updateDomesticPolitics(1986, 1 + (i % 12), true);
  assert("chnSanctionRaisesExternalStress", ST.domestic.chn.externalStress >= 55,
    "对华全面制裁令外部环境压力越过 55 阈值（实测 " + ST.domestic.chn.externalStress.toFixed(1) + "）");
  assert("chnExternalStressDrainsSez",
    ST.domestic.chn.sezMomentum < chnBase.sez && ST.domestic.chn.dualTrackPrice > chnBase.price && ST.domestic.chn.unrest > chnBase.unrest,
    "外部环境压力压制特区动能、抬升双轨物价并累积社会动荡");
  ST.sanctions = [];

  // 18. 中国：特区动能 → 长期 GDP 增速弹性注入单一事实源 P.pmods
  ST.player = "CHN";
  ST.mil = 2.5;
  ST.domestic.chn.sezMomentum = 100;
  ST.domestic.chn.unrest = 0;
  applyPlayerDecisions();
  const pmodChnHigh = SIM.S.P.pmods[entKeys("CHN")[0]] || 0;
  ST.domestic.chn.sezMomentum = 0;
  applyPlayerDecisions();
  const pmodChnLow = SIM.S.P.pmods[entKeys("CHN")[0]] || 0;
  r.details.__pmodChnHigh = +pmodChnHigh.toFixed(4);
  r.details.__pmodChnLow = +pmodChnLow.toFixed(4);
  assert("chnSezMomentumGdpElasticity", pmodChnHigh > pmodChnLow,
    "特区动能高低直接决定中国结构性 GDP 增速（高动能 > 低动能）");

  // 19. 西德：油气通道受阻 → 能源压力累积（未越阈值），叠加制裁后越过阈值冲击执政联盟
  initDomesticState();
  ST.player = "USA";
  ST.mil = 0;
  ST.sanctions = [];
  const hormuzBefore = ST.chokepoints ? ST.chokepoints.hormuz : null;
  if (ST.chokepoints) ST.chokepoints.hormuz = "blocked";
  const epBase = ST.domestic.deu.energyPressure;
  for (let i = 0; i < 60; i++) updateDomesticPolitics(1986, 1 + (i % 12), true);
  r.details.__deuEpBlocked = +ST.domestic.deu.energyPressure.toFixed(4);
  assert("deuOilBlockadeRaisesEnergyPressure", ST.domestic.deu.energyPressure > epBase,
    "霍尔木兹断航令西德能源供应压力累积（实测 " + ST.domestic.deu.energyPressure.toFixed(1) + "）");

  ST.sanctions = [{ t: "DEU", l: 2 }];
  for (let i = 0; i < 60; i++) updateDomesticPolitics(1986, 1 + (i % 12), true);
  r.details.__deuEpSanctioned = +ST.domestic.deu.energyPressure.toFixed(4);
  assert("deuSanctionCrossesEnergyThreshold", ST.domestic.deu.energyPressure >= 50,
    "制裁叠加断航令能源压力越过 50 阈值（实测 " + ST.domestic.deu.energyPressure.toFixed(1) + "）");
  assert("deuEnergyPressureHitsCoalition",
    ST.domestic.deu.spdApproval < 55 && ST.domestic.deu.cduApproval > 45 && ST.domestic.deu.unrest > 2,
    "高能源压力冲击社民党支持率、抬升基民盟与国内动荡");
  if (ST.chokepoints) ST.chokepoints.hormuz = hormuzBefore || "open";
  ST.sanctions = [];

  // 20. 西德：能源压力 → 工业成本拖累注入 P.pmods
  ST.player = "DEU";
  ST.mil = 3.0;
  ST.domestic.deu.energyPressure = 0;
  ST.domestic.deu.unrest = 0;
  applyPlayerDecisions();
  const pmodDeuLow = SIM.S.P.pmods[entKeys("DEU")[0]] || 0;
  ST.domestic.deu.energyPressure = 100;
  applyPlayerDecisions();
  const pmodDeuHigh = SIM.S.P.pmods[entKeys("DEU")[0]] || 0;
  r.details.__pmodDeuLow = +pmodDeuLow.toFixed(4);
  r.details.__pmodDeuHigh = +pmodDeuHigh.toFixed(4);
  assert("deuEnergyPressureDragsGdp", pmodDeuHigh < pmodDeuLow,
    "能源供应压力转化为西德工业成本拖累（高压 < 低压）");

  // 21. CHN/DEU 专属内政面板渲染（含 H 新增仪表）
  const domBox = $("p-domestic-box");
  refreshDomesticBox("CHN");
  assert("chnEconMeterRendered", domBox.innerHTML.includes("外部环境压力"),
    "中国内政面板渲染外部环境压力仪表");
  refreshDomesticBox("DEU");
  assert("deuEconMeterRendered", domBox.innerHTML.includes("能源供应压力"),
    "西德内政面板渲染能源供应压力仪表");

  // 22. 序列化往返：新增经济耦合字段随存档还原
  ST.player = "CHN";
  ST.domestic.chn.externalStress = 61.5;
  ST.domestic.deu.energyPressure = 44.25;
  ST.domestic.deu.unrest = 7.75;
  simSave();
  initDomesticState();
  simLoad();
  assert("chnDeuEconFieldsRestored",
    Math.abs(ST.domestic.chn.externalStress - 61.5) < 0.1 &&
    Math.abs(ST.domestic.deu.energyPressure - 44.25) < 0.1 &&
    Math.abs(ST.domestic.deu.unrest - 7.75) < 0.1,
    "新增经济耦合字段随 simSave/simLoad 完整往返");

  // 清理复原
  ST.player = null;
  ST.mil = 0;
  ST.sanctions = [];
  applyPlayerDecisions();
  initDomesticState();
  refreshDomesticBox(ST.sel);
}

// I（数据层工具链）：效果词表的运行期双保险 —— 构建期由 tools/validate_data.js 判失败，
// 这里验证浏览器里同一份词表同样能抓住拼错的键，并覆盖本局从未触发的数据分支。
function runDomesticProbePhase4(r, assert, ctx) {
  const EFF = window.W1980_EFFECTS;
  assert("effectVocabRuntimeApi",
    !!EFF && typeof EFF.report === "function" && typeof EFF.auditData === "function" && Array.isArray(EFF.violations),
    "W1980_EFFECTS 暴露运行期登记表与全量审计入口");

  // 23. 本局实际走过的消费路径（危机卡 / 议程加成 / 安理会决议）没有登记任何表外键
  r.details.__effectViolationsLive = EFF.violations.length;
  assert("effectVocabLivePathsClean", EFF.violations.length === 0,
    "本局实际走过的效果消费路径无表外键（实测 " + EFF.violations.length + " 条）");

  // 24. 全量审计：数据里声明过的每个 effects 站点都过一遍词表（含本局未触发的分支）
  const audit = EFF.auditData();
  r.details.__effectSites = audit.sites;
  assert("effectVocabAuditsAllSites", audit.sites >= 20,
    "全量审计覆盖 ≥20 个效果站点（实测 " + audit.sites + "）");
  assert("effectVocabDataClean", audit.keys === 0 && EFF.violations.length === 0,
    "现有数据无表外效果键（审计 " + audit.sites + " 个站点，违规 " + audit.keys + " 处）");

  // 25. 反向验证：拼错的键必须被抓住，否则词表只是摆设
  const caught = EFF.report("domesticprobe injected", { gdpBonux: 1 });
  r.details.__effectCaught = caught.join(",") || "(none)";
  assert("effectVocabCatchesTypo",
    caught.length === 1 && caught[0] === "gdpBonux" && EFF.violations.length === 1,
    "注入拼写错误的效果键会被运行期词表抓住（" + (caught.join(",") || "未抓住") + "）");

  // 26. 去重：同一站点每月重复登记只计一次，月度结算不会把登记表刷爆
  EFF.report("domesticprobe injected", { gdpBonux: 1 });
  assert("effectVocabDedupesSites", EFF.violations.length === 1,
    "同一站点重复登记被去重（实测 " + EFF.violations.length + " 条）");

  // 复原：清掉注入的违规，探针自身不留痕迹
  EFF.resetViolations();
  assert("effectVocabResetClean", EFF.violations.length === 0 && EFF.isClean(),
    "resetViolations 清空登记表并恢复 isClean()");
}

// K（玩法深度）：JPN/FRA/GBR 内政 ↔ 经济耦合与议程门控探针（模板同 Phase3）
function runDomesticProbePhase5(r, assert, ctx) {
  // 27. 新增专属内政字段与压力评估函数完备
  initDomesticState();
  ST.player = null;
  ST.mil = 0;
  ST.sanctions = [];
  assert("jpnFraGbrDomFields",
    !!ST.domestic.jpn && !!ST.domestic.fra && !!ST.domestic.gbr &&
    typeof ST.domestic.jpn.tradeFriction === "number" &&
    typeof ST.domestic.fra.francStrength === "number" &&
    typeof ST.domestic.gbr.inflation === "number",
    "JPN/FRA/GBR 内政状态包含贸易摩擦 / 法郎平价 / 通胀压力字段");
  assert("jpnFraGbrStressHelpers",
    typeof jpnTradeFrictionStress === "function" && typeof fraExternalStress === "function" && typeof gbrExternalStress === "function",
    "jpnTradeFrictionStress / fraExternalStress / gbrExternalStress 外部环境评估函数存在");

  const cocomBefore = (ST.cocom && ST.cocom.active) ? { active: ST.cocom.active, strict: ST.cocom.strict } : null;
  const tensionsBefore = (ST.ai && ST.ai.tensions) ? ST.ai.tensions["USA:SUN"] : undefined;

  // 28. 日本：制裁 + 巴统封锁 → 贸易摩擦压力越 60 阈值 → 内需派抬头、动荡上升
  initDomesticState();
  ST.player = "USA";
  ST.mil = 0;
  ST.sanctions = [{ t: "JPN", l: 2 }];
  if (ST.cocom) { ST.cocom.active = true; ST.cocom.strict = true; }
  const jpnBaseD = ST.domestic.jpn.domesticist;
  const jpnBaseU = ST.domestic.jpn.unrest;
  for (let i = 0; i < 80; i++) updateDomesticPolitics(1986, 1 + (i % 12), true);
  r.details.__jpnFriction = +ST.domestic.jpn.tradeFriction.toFixed(4);
  assert("jpnFrictionCrossesThreshold", ST.domestic.jpn.tradeFriction >= 60,
    "制裁叠加巴统封锁令对美贸易摩擦压力越过 60 阈值（实测 " + ST.domestic.jpn.tradeFriction.toFixed(1) + "）");
  assert("jpnFrictionShiftsFaction",
    ST.domestic.jpn.domesticist > jpnBaseD && ST.domestic.jpn.unrest > jpnBaseU,
    "高摩擦压力推高内需开放派并累积社会动荡");
  ST.sanctions = [];

  // 29. 法国：制裁 → 外部环境压力越 45 阈值 → 紧缩坚挺派抬头、法郎平价承压
  initDomesticState();
  ST.player = "USA";
  ST.mil = 0;
  ST.sanctions = [{ t: "FRA", l: 2 }];
  const fraBaseR = ST.domestic.fra.rigueur;
  const fraBaseF = ST.domestic.fra.francStrength;
  let fraMinFranc = fraBaseF;
  for (let i = 0; i < 80; i++) {
    updateDomesticPolitics(1986, 1 + (i % 12), true);
    if (ST.domestic.fra.francStrength < fraMinFranc) fraMinFranc = ST.domestic.fra.francStrength;
  }
  r.details.__fraPressure = +ST.domestic.fra.externalPressure.toFixed(4);
  r.details.__fraMinFranc = +fraMinFranc.toFixed(4);
  assert("fraExternalPressureCrossesThreshold", ST.domestic.fra.externalPressure >= 45,
    "制裁令外部环境压力越过 45 阈值（实测 " + ST.domestic.fra.externalPressure.toFixed(1) + "）");
  assert("fraPressureShiftsFaction", ST.domestic.fra.rigueur > fraBaseR,
    "外部约束迫使路线转向紧缩坚挺派（干预派受压、紧缩派抬头）");
  assert("fraPressureErodesFrancBeforeTurn", fraMinFranc < fraBaseF,
    "紧缩转向完成前资本外逃持续侵蚀法郎平价（最低 " + fraMinFranc.toFixed(1) + "）");
  ST.sanctions = [];

  // 30. 英国：制裁 + 巴统 + 美苏高张力 → 通胀压力与金融城竞争力联动
  initDomesticState();
  ST.player = "USA";
  ST.mil = 0;
  ST.sanctions = [{ t: "GBR", l: 2 }];
  if (ST.ai && ST.ai.tensions) ST.ai.tensions["USA:SUN"] = 90;
  for (let i = 0; i < 80; i++) updateDomesticPolitics(1986, 1 + (i % 12), true);
  r.details.__gbrInflation = +ST.domestic.gbr.inflation.toFixed(4);
  assert("gbrExternalStressRaisesInflation", ST.domestic.gbr.inflation >= 60,
    "制裁叠加全球金融风险溢价令通胀压力越过 60 阈值（实测 " + ST.domestic.gbr.inflation.toFixed(1) + "）");
  assert("gbrInflationShiftsFaction", ST.domestic.gbr.monetarist > ST.domestic.gbr.welfarist,
    "恶性通胀令民意转向货币主义派");
  ST.sanctions = [];

  // 31. 三国专属面板渲染（替代此前的通用面板）
  const domBox = $("p-domestic-box");
  refreshDomesticBox("JPN");
  assert("jpnDomRendered", domBox.innerHTML.includes("对美贸易摩擦压力"), "日本内政面板渲染贸易摩擦仪表");
  refreshDomesticBox("FRA");
  assert("fraDomRendered", domBox.innerHTML.includes("法郎平价与外部竞争力"), "法国内政面板渲染法郎平价仪表");
  refreshDomesticBox("GBR");
  assert("gbrDomRendered", domBox.innerHTML.includes("金融城与服务业竞争力"), "英国内政面板渲染金融城竞争力仪表");

  // 32. 三国玩家治理动作生效
  // L：每个动作消耗政治资本，逐条充满预算以只验证效果传导
  ST.player = "JPN";
  initPoliticalCapital(true); ST.politicalCapital.value = PC_CAP;
  const jpnActBefore = ST.domestic.jpn.domesticist;
  applyDomesticPlayerAction("jpn_domestic_demand");
  assert("jpnActionDomesticDemand", ST.domestic.jpn.domesticist > jpnActBefore, "日本「扩大内需开放」动作推高内需开放派");
  ST.player = "FRA";
  initPoliticalCapital(true); ST.politicalCapital.value = PC_CAP;
  const fraActBefore = ST.domestic.fra.rigueur;
  applyDomesticPlayerAction("fra_hard_franc");
  assert("fraActionHardFranc", ST.domestic.fra.rigueur > fraActBefore, "法国「紧缩坚挺」动作推高紧缩坚挺派");
  ST.player = "GBR";
  initPoliticalCapital(true); ST.politicalCapital.value = PC_CAP;
  const gbrActBefore = ST.domestic.gbr.monetarist;
  applyDomesticPlayerAction("gbr_tight_money");
  assert("gbrActionTightMoney", ST.domestic.gbr.monetarist > gbrActBefore, "英国「货币主义紧缩」动作推高货币主义派");

  // 33. 三国专属变量 → 结构性增速注入 P.pmods（阈值型，默认值下中性）
  initDomesticState();
  ST.player = "JPN";
  ST.mil = 1.0;
  ST.domestic.jpn.tradeFriction = 0;
  ST.domestic.jpn.unrest = 0;
  applyPlayerDecisions();
  const pmodJpnNeutral = SIM.S.P.pmods[entKeys("JPN")[0]] || 0;
  ST.domestic.jpn.tradeFriction = 100;
  applyPlayerDecisions();
  const pmodJpnFriction = SIM.S.P.pmods[entKeys("JPN")[0]] || 0;
  r.details.__pmodJpnNeutral = +pmodJpnNeutral.toFixed(4);
  r.details.__pmodJpnFriction = +pmodJpnFriction.toFixed(4);
  assert("jpnTradeFrictionDragsGdp", pmodJpnFriction < pmodJpnNeutral,
    "对美贸易摩擦压力转化为日本出口拖累（高压 < 低压）");

  initDomesticState();
  ST.player = "FRA";
  ST.mil = 3.5;
  ST.domestic.fra.externalPressure = 0;
  ST.domestic.fra.francStrength = 60;
  ST.domestic.fra.unrest = 0;
  applyPlayerDecisions();
  const pmodFraLow = SIM.S.P.pmods[entKeys("FRA")[0]] || 0;
  ST.domestic.fra.externalPressure = 100;
  ST.domestic.fra.francStrength = 10;
  applyPlayerDecisions();
  const pmodFraHigh = SIM.S.P.pmods[entKeys("FRA")[0]] || 0;
  r.details.__pmodFraLow = +pmodFraLow.toFixed(4);
  r.details.__pmodFraHigh = +pmodFraHigh.toFixed(4);
  assert("fraExternalPressureDragsGdp", pmodFraHigh < pmodFraLow,
    "外部约束与法郎失守转化为法国融资拖累（高压 < 低压）");

  initDomesticState();
  ST.player = "GBR";
  ST.mil = 3.5;
  ST.domestic.gbr.inflation = 0;
  ST.domestic.gbr.cityStrength = 60;
  ST.domestic.gbr.unrest = 0;
  applyPlayerDecisions();
  const pmodGbrLow = SIM.S.P.pmods[entKeys("GBR")[0]] || 0;
  ST.domestic.gbr.inflation = 100;
  ST.domestic.gbr.cityStrength = 10;
  applyPlayerDecisions();
  const pmodGbrHigh = SIM.S.P.pmods[entKeys("GBR")[0]] || 0;
  r.details.__pmodGbrLow = +pmodGbrLow.toFixed(4);
  r.details.__pmodGbrHigh = +pmodGbrHigh.toFixed(4);
  assert("gbrInflationDragsGdp", pmodGbrHigh < pmodGbrLow,
    "恶性通胀与金融城失守转化为英国服务业拖累（高压 < 低压）");

  // 34. 序列化往返：三国专属字段随存档还原
  initDomesticState();
  ST.player = "JPN";
  ST.domestic.jpn.tradeFriction = 63.5;
  ST.domestic.fra.francStrength = 41.25;
  ST.domestic.gbr.inflation = 71.75;
  simSave();
  initDomesticState();
  simLoad();
  assert("jpnFraGbrFieldsRestored",
    Math.abs(ST.domestic.jpn.tradeFriction - 63.5) < 0.1 &&
    Math.abs(ST.domestic.fra.francStrength - 41.25) < 0.1 &&
    Math.abs(ST.domestic.gbr.inflation - 71.75) < 0.1,
    "JPN/FRA/GBR 专属内政字段随 simSave/simLoad 完整往返");

  // 复原：外部条件与玩家状态清干净，探针自身不留痕迹
  if (ST.cocom) {
    if (cocomBefore) { ST.cocom.active = cocomBefore.active; ST.cocom.strict = cocomBefore.strict; }
    else { ST.cocom.active = false; }
  }
  if (ST.ai && ST.ai.tensions && typeof tensionsBefore === "number") ST.ai.tensions["USA:SUN"] = tensionsBefore;
  ST.player = null;
  ST.mil = 0;
  ST.sanctions = [];
  applyPlayerDecisions();
  initDomesticState();
  refreshDomesticBox(ST.sel);
}

// L（参与感/战略灵活性）：政治资本（施政预算）与通用实体施政探针
function runDomesticProbePhase6(r, assert, ctx) {
  // 35. 预算结构完备且落在合法区间
  initDomesticState();
  initPoliticalCapital(true);
  ST.player = "SUN";
  ST.mil = 4.0;
  const pc0 = ST.politicalCapital;
  r.details.__pcStart = +pc0.value.toFixed(2);
  assert("politicalCapitalInitialized",
    !!pc0 && typeof pc0.value === "number" && typeof pc0.cap === "number" &&
    pc0.cap === PC_CAP && pc0.value > 0 && pc0.value <= pc0.cap,
    "政治资本以初始值建立（" + pc0.value + " / " + pc0.cap + "）");

  // 36. 月度结算方向正确：安定高 → 增益大；动荡高 → 增益小（甚至为负）
  ST.domestic.sun.unrest = 0;
  ST.domestic.sun.shortage = 10;
  ST.domestic.sun.conservative = 55; ST.domestic.sun.reformist = 45;
  const gainCalm = politicalCapitalAccrual();
  ST.domestic.sun.unrest = 80;
  ST.domestic.sun.shortage = 85;
  const gainChaos = politicalCapitalAccrual();
  r.details.__pcGainCalm = +gainCalm.toFixed(3);
  r.details.__pcGainChaos = +gainChaos.toFixed(3);
  assert("politicalCapitalAccrualRespondsToUnrest", gainCalm > gainChaos,
    "局势安定时的月度结算高于动荡时（" + gainCalm.toFixed(2) + " vs " + gainChaos.toFixed(2) + "）");
  assert("politicalCapitalAccrualClamped",
    gainCalm <= 6.0 && gainChaos >= -1.5,
    "月度结算被夹在 [-1.5, +6.0] 区间（不会无限滚雪球）");

  // 37. 月度推进器真的把预算加上去，且不越过上限
  initDomesticState();
  ST.player = "SUN";
  ST.mil = 4.0;
  initPoliticalCapital(true);
  ST.politicalCapital.value = 40;
  const pcBefore = ST.politicalCapital.value;
  updateDomesticPolitics(1985, 6, true);
  r.details.__pcAfterMonth = +ST.politicalCapital.value.toFixed(3);
  assert("politicalCapitalAccruesMonthly", ST.politicalCapital.value > pcBefore,
    "updateDomesticPolitics 按月结算政治资本（" + pcBefore + " → " + ST.politicalCapital.value.toFixed(1) + "）");
  ST.politicalCapital.value = PC_CAP - 0.1;
  updateDomesticPolitics(1985, 7, true);
  assert("politicalCapitalCapped", ST.politicalCapital.value <= PC_CAP,
    "政治资本不会越过上限 " + PC_CAP);

  // 38. 扣费语义：足额则精确扣减，不足则**不扣任何点数**
  initPoliticalCapital(true);
  ST.politicalCapital.value = 50;
  assert("spendPoliticalCapitalSucceeds", spendPoliticalCapital(18) === true && Math.abs(ST.politicalCapital.value - 32) < 1e-9,
    "足额时精确扣减（50 - 18 = 32）");
  assert("spendPoliticalCapitalRefused", spendPoliticalCapital(999) === false && Math.abs(ST.politicalCapital.value - 32) < 1e-9,
    "不足时拒绝且不产生任何扣减（仍为 32）");

  // 39. 预算为零时施政动作被拒绝，且**内政状态零变化**（拒绝路径无副作用）
  initDomesticState();
  ST.player = "SUN";
  initPoliticalCapital(true);
  ST.politicalCapital.value = 0;
  ST.domestic.sun.shortage = 40;
  const sunSnap = { shortage: ST.domestic.sun.shortage, reformist: ST.domestic.sun.reformist, conservative: ST.domestic.sun.conservative };
  const refused = applyDomesticPlayerAction("rebalance_consumer");
  assert("domesticActionBlockedWithoutCapital",
    refused === false &&
    ST.domestic.sun.shortage === sunSnap.shortage &&
    ST.domestic.sun.reformist === sunSnap.reformist &&
    ST.domestic.sun.conservative === sunSnap.conservative,
    "政治资本为零时动作被拒绝，内政状态逐位不变");

  // 40. 预算充足时动作按价目表扣费（不是固定值）
  ST.politicalCapital.value = PC_CAP;
  const cheapCost = domesticActionCost("rebalance_consumer");
  applyDomesticPlayerAction("rebalance_consumer");
  r.details.__pcAfterAction = +ST.politicalCapital.value.toFixed(3);
  assert("domesticActionChargesItsCost",
    Math.abs(ST.politicalCapital.value - (PC_CAP - cheapCost)) < 1e-9,
    "动作按价目表扣费（" + PC_CAP + " - " + cheapCost + " = " + ST.politicalCapital.value.toFixed(1) + "）");
  assert("domesticActionCostTableCoversMajors",
    domesticActionCost("chn_price_reform") > domesticActionCost("rebalance_consumer") &&
    domesticActionCost("unknown_action") === DOMESTIC_ACTION_DEFAULT_COST,
    "价目表区分路线级动作与未知动作的缺省成本");

  // 41. 通用实体（此前零按钮）现在有 3 个施政动作，且各自代价方向正确
  initDomesticState();
  ST.player = "ITA";
  initPoliticalCapital(true);
  ST.politicalCapital.value = PC_CAP;
  const gen = getGeneralDomestic("ITA");
  const genBase = { stability: gen.stability, legitimacy: gen.legitimacy, unrest: gen.unrest };

  applyDomesticPlayerAction("gen_austerity");
  assert("genericAusterityEffect",
    gen.legitimacy > genBase.legitimacy && gen.stability < genBase.stability && gen.unrest > genBase.unrest,
    "通用实体「财政紧缩」：合法性↑、民生↓、动荡↑");

  const afterAusterity = { stability: gen.stability, legitimacy: gen.legitimacy, unrest: gen.unrest };
  ST.politicalCapital.value = PC_CAP;
  applyDomesticPlayerAction("gen_welfare");
  assert("genericWelfareEffect",
    gen.stability > afterAusterity.stability && gen.unrest < afterAusterity.unrest && gen.legitimacy < afterAusterity.legitimacy,
    "通用实体「扩大福利」：安定↑、动荡↓、合法性↓");

  const afterWelfare = { stability: gen.stability, legitimacy: gen.legitimacy, unrest: gen.unrest };
  ST.politicalCapital.value = PC_CAP;
  applyDomesticPlayerAction("gen_crackdown");
  assert("genericCrackdownEffect",
    gen.unrest < afterWelfare.unrest && gen.legitimacy < afterWelfare.legitimacy,
    "通用实体「强化治安」：动荡↓↓、合法性↓↓");

  // 42. 通用面板渲染 3 个动作按钮 + 政治资本条 + 成本角标
  const domBox = $("p-domestic-box");
  ST.player = "ITA";
  ST.politicalCapital.value = PC_CAP;
  refreshDomesticBox("ITA");
  const actBtns = domBox.querySelectorAll(".pdb-act-btn");
  r.details.__genericActionBtns = actBtns.length;
  assert("genericPanelHasActions", actBtns.length === 3,
    "通用实体内政面板渲染 3 个施政动作（实测 " + actBtns.length + "）");
  assert("capitalMeterRendered", domBox.innerHTML.includes("政治资本"),
    "执政国面板顶部渲染政治资本预算条");
  assert("actionButtonShowsCost", domBox.querySelector(".pdb-cost") !== null,
    "动作按钮带政治资本成本角标");

  // 43. 预算不足时按钮被禁用（UI 层同样拦住，不只靠后端拒绝）
  ST.politicalCapital.value = 0;
  refreshDomesticBox("ITA");
  const disabledAll = Array.prototype.every.call(
    domBox.querySelectorAll(".pdb-act-btn"), (b) => b.disabled === true);
  assert("actionButtonDisabledWhenShort", disabledAll,
    "政治资本不足时所有施政按钮被禁用");

  // 44. 存档往返：政治资本随存档还原（旧档缺项按初始值补齐）
  initDomesticState();
  ST.player = "ITA";
  initPoliticalCapital(true);
  ST.politicalCapital.value = 37.5;
  simSave();
  initPoliticalCapital(true);
  ST.politicalCapital.value = 99;
  simLoad();
  assert("politicalCapitalSaveRoundTrip", Math.abs(ST.politicalCapital.value - 37.5) < 0.1,
    "政治资本随 simSave/simLoad 完整往返（37.5 → " + ST.politicalCapital.value.toFixed(1) + "）");
  const legacy = sanitizePoliticalCapital(undefined);
  assert("politicalCapitalLegacyDefault", legacy.value === PC_START && legacy.cap === PC_CAP,
    "缺该字段的旧存档按初始值 " + PC_START + " 补齐（无需升版）");

  // 复原
  ST.player = null;
  ST.mil = 0;
  ST.sanctions = [];
  initDomesticState();
  initPoliticalCapital(true);
  initPosture(true);
  applyPlayerDecisions();
  refreshDomesticBox(ST.sel);
}

// L（战略灵活性）：施政方针（均衡/强硬/改革）探针
function runDomesticProbePhase7(r, assert, ctx) {
  // 45. 默认方针为均衡，且完全中性（成本倍率 1、无漂移、无结算修正）
  initDomesticState();
  initPoliticalCapital(true);
  initPosture(true);
  ST.player = "SUN";
  ST.mil = 4.0;
  assert("postureDefaultsBalanced", ST.posture === "balanced" && currentPosture().zh === "均衡施政",
    "施政方针默认是均衡（旧档与 AI 均不受影响）");
  assert("postureBalancedIsNeutral",
    postureCostMultiplier("gen_crackdown") === 1 &&
    domesticActionCost("gen_crackdown") === DOMESTIC_ACTION_COST.gen_crackdown &&
    currentPosture().unrestDrift === 0 && currentPosture().capitalMod === 0,
    "均衡方针零折扣、零漂移、零结算修正（既有行为逐位不变）");
  const accrualBalanced = politicalCapitalAccrual();

  // 46. 切换方针要消耗政治资本；预算不足时拒绝且方针不变
  initPoliticalCapital(true);
  ST.politicalCapital.value = PC_CAP;
  assert("postureSwitchCostsCapital",
    setPosture("hardline") === true &&
    ST.posture === "hardline" &&
    Math.abs(ST.politicalCapital.value - (PC_CAP - POSTURE_SWITCH_COST)) < 1e-9,
    "切换方针扣 " + POSTURE_SWITCH_COST + " 点政治资本（" + PC_CAP + " → " + ST.politicalCapital.value.toFixed(1) + "）");
  initPoliticalCapital(true);
  ST.politicalCapital.value = 0;
  assert("postureSwitchRefusedWhenShort",
    setPosture("reformist") === false && ST.posture === "hardline",
    "政治资本不足时拒绝切换且方针保持不变");
  assert("postureSwitchSameIsNoop",
    setPosture("hardline") === false,
    "重复选择当前方针不扣费也不报错");

  // 47. 强硬路线：强硬类动作更便宜、结算更慢、压制动荡
  initPosture(true); ST.posture = "hardline";
  const hardlineAccrual = politicalCapitalAccrual();
  r.details.__accrualBalanced = +accrualBalanced.toFixed(3);
  r.details.__accrualHardline = +hardlineAccrual.toFixed(3);
  assert("postureHardlineDiscountsCoercion",
    domesticActionCost("gen_crackdown") < DOMESTIC_ACTION_COST.gen_crackdown &&
    domesticActionCost("gbr_tight_money") < DOMESTIC_ACTION_COST.gbr_tight_money,
    "强硬路线降低治安/紧缩类动作成本（" + domesticActionCost("gen_crackdown") + " vs " + DOMESTIC_ACTION_COST.gen_crackdown + "）");
  assert("postureHardlineSlowsAccrual", hardlineAccrual < accrualBalanced,
    "强硬路线让政治资本结算更慢（" + hardlineAccrual.toFixed(2) + " < " + accrualBalanced.toFixed(2) + "）");
  // 漂移是「相对于同月均衡方针」的增量，因此用同一初始状态跑一个月做差分比较
  // （各国自身的月度演进会同时改变动荡，直接比绝对值会被它淹没）
  function unrestAfterOneMonth(postureKey) {
    initDomesticState();
    ST.player = "SUN";
    ST.mil = 4.0;
    ST.domestic.sun.unrest = 40;
    ST.domestic.sun.shortage = 28;
    ST.domestic.sun.conservative = 55;
    ST.domestic.sun.reformist = 45;
    initPosture(true); ST.posture = postureKey;
    updateDomesticPolitics(1985, 6, true);
    return ST.domestic.sun.unrest;
  }
  const unrestBalanced = unrestAfterOneMonth("balanced");
  const unrestHardline = unrestAfterOneMonth("hardline");
  r.details.__unrestBalanced = +unrestBalanced.toFixed(4);
  r.details.__unrestHardline = +unrestHardline.toFixed(4);
  assert("postureHardlineSuppressesUnrest", unrestHardline < unrestBalanced,
    "同等条件下强硬路线的动荡低于均衡方针（" + unrestHardline.toFixed(2) + " < " + unrestBalanced.toFixed(2) + "）");

  // 48. 改革路线：改革类动作更便宜、结算更快、但抬升动荡
  initDomesticState();
  ST.player = "SUN";
  ST.mil = 4.0;
  initPosture(true); ST.posture = "reformist";
  const reformAccrual = politicalCapitalAccrual();
  assert("postureReformDiscountsOpening",
    domesticActionCost("gen_welfare") < DOMESTIC_ACTION_COST.gen_welfare &&
    domesticActionCost("chn_expand_sez") < DOMESTIC_ACTION_COST.chn_expand_sez,
    "改革路线降低开放/福利类动作成本");
  assert("postureReformSpeedsAccrual", reformAccrual > accrualBalanced,
    "改革路线让政治资本结算更快（" + reformAccrual.toFixed(2) + " > " + accrualBalanced.toFixed(2) + "）");
  const unrestReform = unrestAfterOneMonth("reformist");
  r.details.__unrestReform = +unrestReform.toFixed(4);
  assert("postureReformRaisesUnrest", unrestReform > unrestBalanced,
    "同等条件下改革路线的动荡高于均衡方针（" + unrestReform.toFixed(2) + " > " + unrestBalanced.toFixed(2) + "）");

  // 49. 面板渲染：三个方针按钮 + 当前项高亮 + 说明文案
  initDomesticState();
  ST.player = "ITA";
  initPoliticalCapital(true);
  ST.politicalCapital.value = PC_CAP;
  initPosture(true);
  const domBox = $("p-domestic-box");
  refreshDomesticBox("ITA");
  const postureBtns = domBox.querySelectorAll(".pdb-posture-btn");
  r.details.__postureBtns = postureBtns.length;
  assert("postureButtonsRendered", postureBtns.length === 3,
    "内政面板渲染 3 个施政方针按钮（实测 " + postureBtns.length + "）");
  assert("postureActiveHighlighted",
    domBox.querySelectorAll(".pdb-posture-btn.active").length === 1 &&
    domBox.querySelector(".pdb-posture-btn.active").dataset.posture === "balanced",
    "当前方针被高亮且唯一（默认均衡）");
  assert("postureDescRendered", domBox.innerHTML.includes("均衡施政"),
    "面板渲染当前方针的说明文案");

  // 50. 方针随存档往返；旧档缺该项按均衡补齐
  initDomesticState();
  ST.player = "ITA";
  initPoliticalCapital(true);
  ST.posture = "reformist";
  simSave();
  initPosture(true);
  simLoad();
  assert("postureSaveRoundTrip", ST.posture === "reformist",
    "施政方针随 simSave/simLoad 完整往返（实测 " + ST.posture + "）");
  assert("postureLegacyDefault", sanitizePosture(undefined) === "balanced" && sanitizePosture("bogus") === "balanced",
    "缺该字段或非法值的旧存档按均衡补齐（无需升版）");

  // 复原
  ST.player = null;
  ST.mil = 0;
  ST.sanctions = [];
  initDomesticState();
  initPoliticalCapital(true);
  initPosture(true);
  applyPlayerDecisions();
  refreshDomesticBox(ST.sel);
}


// 验证钩子：?pan=<dx>,<dy> 可重复（等价于鼠标拖动），?selftest 由外部触发
