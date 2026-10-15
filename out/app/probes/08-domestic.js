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
  ST.player = "JPN";
  const jpnActBefore = ST.domestic.jpn.domesticist;
  applyDomesticPlayerAction("jpn_domestic_demand");
  assert("jpnActionDomesticDemand", ST.domestic.jpn.domesticist > jpnActBefore, "日本「扩大内需开放」动作推高内需开放派");
  ST.player = "FRA";
  const fraActBefore = ST.domestic.fra.rigueur;
  applyDomesticPlayerAction("fra_hard_franc");
  assert("fraActionHardFranc", ST.domestic.fra.rigueur > fraActBefore, "法国「紧缩坚挺」动作推高紧缩坚挺派");
  ST.player = "GBR";
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


// 验证钩子：?pan=<dx>,<dy> 可重复（等价于鼠标拖动），?selftest 由外部触发
