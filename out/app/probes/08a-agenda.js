"use strict";

// ---- R12B: 次极大国专属国家议程与战略路线全链路探针 ----
function runAgendaProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AGENDAPROBE FAIL [" + name + "]: " + msg);
    }
  };

  // G（收尾评审）：14 个步骤按阶段抽为四个推进器；跨阶段的议程列表经 ctx 传递。
  try {
    const ctx = {};
    agendaProbeDatabase(r, assert, ctx);
    agendaProbeLifecycle(r, assert, ctx);
    agendaProbeGuardsAndUi(r, assert, ctx);
    agendaProbeEndgameAndState(r, assert, ctx);
    agendaProbeChnDeuTrees(r, assert, ctx);
    agendaProbeJpnFraGbrTrees(r, assert, ctx);
    agendaProbeConditionVocabulary(r, assert, ctx);
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "agendaprobe"; d.style.display = "none";
  d.textContent = "AGENDAPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runAgendaProbe 的 步骤 1-2：核心 API 存在性 + 议程数据库完备性（原样搬运，无逻辑改动）
function agendaProbeDatabase(r, assert, ctx) {
  // 1. 核心数据库与函数存在性
  assert("databaseLoaded", !!window.W1980_AGENDAS && typeof window.W1980_AGENDAS.getAgendasForCountry === "function", "W1980_AGENDAS 应已载入");
  assert("initAgendaStateExists", typeof initAgendaState === "function", "initAgendaState 应定义");
  assert("startAgendaExists", typeof startAgenda === "function", "startAgenda 应定义");
  assert("updateMonthlyAgendasExists", typeof updateMonthlyAgendas === "function", "updateMonthlyAgendas 应定义");
  assert("refreshAgendaBoxExists", typeof refreshAgendaBox === "function", "refreshAgendaBox 应定义");

  // 2. 数据库完备性断言
  const chnAgendas = window.W1980_AGENDAS.getAgendasForCountry("CHN");
  const jpnAgendas = window.W1980_AGENDAS.getAgendasForCountry("JPN");
  const deuAgendas = window.W1980_AGENDAS.getAgendasForCountry("DEU");
  const fraAgendas = window.W1980_AGENDAS.getAgendasForCountry("FRA");
  const gbrAgendas = window.W1980_AGENDAS.getAgendasForCountry("GBR");
  const sunAgendas = window.W1980_AGENDAS.getAgendasForCountry("SUN");
  const usaAgendas = window.W1980_AGENDAS.getAgendasForCountry("USA");
  const defAgendas = window.W1980_AGENDAS.getAgendasForCountry("BRA");

  assert("chnAgendasCount", chnAgendas.length >= 3, "中国专属议程数 >= 3 (特区/裁军/大三角)");
  assert("jpnAgendasCount", jpnAgendas.length >= 3, "日本专属议程数 >= 3 (半导体/专守防卫/黑潮出海)");
  assert("deuAgendasCount", deuAgendas.length >= 2, "西德专属议程数 >= 2");
  assert("fraAgendasCount", fraAgendas.length >= 2, "法国专属议程数 >= 2");
  assert("gbrAgendasCount", gbrAgendas.length >= 2, "英国专属议程数 >= 2 (金融大爆炸/私有化)");
  assert("sunAgendasCount", sunAgendas.length >= 2, "苏联专属议程数 >= 2 (合资法/新联盟)");
  assert("usaAgendasCount", usaAgendas.length >= 2, "美国专属议程数 >= 2 (供给学派/SDI)");
  assert("defaultFallbackAgendas", defAgendas.length >= 2, "通用国家 fallback 议程有效");

  // G：跨阶段复用的议程列表经 ctx 传递（后续阶段按原名取回，逻辑不变）
  ctx.chnAgendas = chnAgendas;
  ctx.jpnAgendas = jpnAgendas;
  ctx.usaAgendas = usaAgendas;
}

// G（收尾评审）：runAgendaProbe 的 步骤 3-7：初始状态、前置条件、启动/推进/完成、红利与 pmods 注入（原样搬运，无逻辑改动）
function agendaProbeLifecycle(r, assert, ctx) {
  const chnAgendas = ctx.chnAgendas;
  // 3. 初始状态断言
  initAgendaState();
  assert("stateInitClean", Object.keys(ST.agendas).length === 0, "ST.agendas 初始化为空字典");
  const chnState = getAgendaState("CHN");
  assert("chnStateInit", chnState.active === null && chnState.progress === 0 && chnState.completed.length === 0, "国家议程初始结构完备");

  // 4. 前置条件断言：中国百万大裁军军费与年代约束
  const agSez = chnAgendas.find((a) => a.id === "chn_sez");
  const agDisarm = chnAgendas.find((a) => a.id === "chn_disarm");
  assert("sezConditionPass", checkAgendaCondition("CHN", agSez).ok === true, "1980 年设立经济特区前置条件满足");

  // 军费过高时大裁军被锁
  ST.player = "CHN";
  ST.mil = 5.0;
  assert("disarmBlockedByMilAndPrereq", checkAgendaCondition("CHN", agDisarm).ok === false, "军费 5% 且未完成特区时大裁军应被禁用");

  // 5. 启动议程与推进
  const startRes = startAgenda("CHN", "chn_sez");
  assert("startAgendaSuccess", startRes === true && ST.agendas.CHN.active === "chn_sez", "成功启动特区议程");
  assert("cantStartSecondAgenda", startAgenda("CHN", "chn_triangle") === false, "推进中不可同时启动第二项议程");

  // 6. 月度演进推进至完成
  const prevProg = ST.agendas.CHN.progress;
  updateMonthlyAgendas(1980, 2, true);
  assert("progressAdvanced", ST.agendas.CHN.progress > prevProg, "月度演进推进进度");

  // 快速模拟推进至 100% 完成
  for (let i = 0; i < 20; i++) {
    updateMonthlyAgendas(1980, 3 + i, true);
  }
  assert("agendaCompleted", ST.agendas.CHN.completed.includes("chn_sez"), "特区议程推进完毕进入 completed");
  assert("agendaActiveReset", ST.agendas.CHN.active === null, "达成后 active 自动置空");
  assert("gdpBonusCalculated", ST.agendas.CHN.bonuses.gdpBonus === 0.35, "正确计算 +0.35pp GDP 结构性红利");
  assert("reserveMonthlyCalculated", ST.agendas.CHN.bonuses.reserveMonthly === 1.5, "正确计算 +1.5亿 外汇流红利");

  // 7. 单一事实源与 pmods 注入
  applyPlayerDecisions();
  const pmodsCHN = W1980_SIM.pmap(SIM.S).CHN;
  assert("pmodsInjectedGdpBonus", typeof pmodsCHN === "number", "pmods 正确注入玩家执政国家");
}

// G（收尾评审）：runAgendaProbe 的 步骤 8-11：日本 1% 红线、美国 SDI 阈值、脱钩免疫、界面渲染（原样搬运，无逻辑改动）
function agendaProbeGuardsAndUi(r, assert, ctx) {
  const jpnAgendas = ctx.jpnAgendas, usaAgendas = ctx.usaAgendas;
  // 8. 日本专守防卫 1% 军费红线校验
  const agJpnDef = jpnAgendas.find((a) => a.id === "jpn_defense_cap");
  ST.player = "JPN";
  ST.mil = 2.0;
  assert("jpnDefenseBlockedHighMil", checkAgendaCondition("JPN", agJpnDef).ok === false, "日本军费 2.0% 时专守防卫应被禁用");
  ST.mil = 0.8;
  assert("jpnDefenseAllowedLowMil", checkAgendaCondition("JPN", agJpnDef).ok === true, "日本军费 0.8% 时专守防卫条件满足");

  // 9. 美国 SDI 军备军费 ≥ 5% 校验
  const agUsaSdi = usaAgendas.find((a) => a.id === "usa_sdi_tech");
  ST.player = "USA";
  const oldYear = SIM.S ? SIM.S.year : 1980;
  const oldMonth = SIM.S ? SIM.S.month : 1;
  if (SIM.S) { SIM.S.year = 1983; SIM.S.month = 4; }
  ST.mil = 3.0;
  assert("usaSdiBlockedLowMil", checkAgendaCondition("USA", agUsaSdi).ok === false, "美国军费 3.0% 时 SDI 应被禁用");
  ST.mil = 6.0;
  assert("usaSdiAllowedHighMil", checkAgendaCondition("USA", agUsaSdi).ok === true, "美国军费 6.0% 且 1983 年时 SDI 允许启动");
  if (SIM.S) { SIM.S.year = oldYear; SIM.S.month = oldMonth; }

  // 10. 大三角脱钩震荡免疫验证
  ST.player = "CHN";
  ST.agendas.CHN.completed.push("chn_triangle");
  ST.agendas.CHN.bonuses = calcAgendaBonuses("CHN");
  assert("hasDecoupleImmunityBonus", ST.agendas.CHN.bonuses.decoupleImmunity === true, "达成大三角平衡后获得脱钩免疫");
  ST.blocOverride.CHN = "WP";
  ST.blocSince = curMonthIdx();
  const blocEff = curBlocEffect();
  assert("decoupleFrictionZero", blocEff.friction === 0, "脱钩免疫使阵营迁移脱钩震荡摩擦归零");

  // 11. 界面渲染测试
  const agendaBox = $("p-agenda-box");
  assert("agendaBoxDomExists", !!agendaBox, "#p-agenda-box DOM 容器存在");
  refreshAgendaBox("CHN");
  assert("chnRenderedCards", agendaBox.innerHTML.includes("设立经济特区") && agendaBox.querySelectorAll(".ag-card").length >= 3, "成功渲染中国议程卡片列表");
  refreshAgendaBox("JPN");
  assert("jpnRenderedCards", agendaBox.innerHTML.includes("半导体与精密制造") && agendaBox.innerHTML.includes("恪守专守防卫"), "成功渲染日本议程卡片列表");
  refreshAgendaBox("DEU");
  assert("deuRenderedCards", agendaBox.innerHTML.includes("单一欧洲法案"), "成功渲染欧洲单一市场议程卡片");
}

// G（收尾评审）：runAgendaProbe 的 步骤 12-14：后日谈联动、旁观零漂移、存档往返与状态复原（原样搬运，无逻辑改动）
function agendaProbeEndgameAndState(r, assert, ctx) {
  // 12. 终局后日谈专属篇章与称号联动
  const epSt = {
    date: "1991-12",
    world: { gdp: 24000, gdp0: 12000, gdpDelta: 100, pop: 5300, pop0: 4400, popDelta: 20.4 },
    blocs: [{ b: "CHN", zh: "中国", gdpShare: 18, gdpShare0: 12, popShare: 22, popShare0: 22 }],
    player: {
      k: "CHN", zh: "中国", mil: 2,
      gdp: 2600, gdp0: 1200, gdpDelta: 116,
      pop: 1100, pop0: 980, popDelta: 12.2,
      rank0: 8, rank1: 4, dr: 4, pctl: 0.95,
      E: 28, R: 12, M: 15, G: 20, G_bloc: 10, G_act: 12, total: 87
    }
  };
  const epRes = generateEpilogue(epSt);
  assert("epilogueHasAgendaSection", epRes.sections.some((s) => s.sec.includes("专属国家战略路线")), "终局后日谈包含专属战略议程篇章");
  assert("epilogueSpecialTitle", epRes.rankTitle.includes("总设计师") || epRes.rankTitle.includes("擎天"), "达成双核心议程荣膺专属历史称号");

  // 13. 旁观模式零漂移验证
  ST.player = null;
  applyPlayerDecisions();
  const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
  assert("observerZeroPmods", pmodsCount === 0, "旁观模式下 applyPlayerDecisions 绝对 0 pmods (0 漂移)");

  // 14. 存档读档往返序列化
  ST.player = "CHN";
  ST.agendas.CHN.completed = ["chn_sez", "chn_triangle"];
  ST.agendas.CHN.active = "chn_disarm";
  ST.agendas.CHN.progress = 45.5;
  simSave();
  initAgendaState();
  assert("stateCleanedBeforeLoad", Object.keys(ST.agendas).length === 0, "读档前清空状态生效");
  simLoad();
  assert("stateRestoredAfterLoad", ST.agendas.CHN && ST.agendas.CHN.active === "chn_disarm" && Math.abs(ST.agendas.CHN.progress - 45.5) < 0.1 && ST.agendas.CHN.completed.length === 2, "simSave/simLoad 100% 完美往返恢复议程状态");

  // 复原状态
  ST.player = null;
  ST.mil = 0;
  ST.blocOverride = {};
  ST.blocSince = null;
  initAgendaState();
  applyPlayerDecisions();
  refreshAgendaBox(ST.sel);
}

// H（玩法深度）：CHN/DEU 专属议程树与内政天平联动探针
function agendaProbeChnDeuTrees(r, assert, ctx) {
  const chnAgendas = window.W1980_AGENDAS.getAgendasForCountry("CHN");
  const deuAgendas = window.W1980_AGENDAS.getAgendasForCountry("DEU");

  // 23. 树形结构：三步前置链
  const chnDisarm = chnAgendas.find((a) => a.id === "chn_disarm");
  const chnMarket = chnAgendas.find((a) => a.id === "chn_market");
  assert("chnAgendaTree",
    !!chnMarket && !!chnDisarm && chnDisarm.requires === "chn_sez" && chnMarket.requires === "chn_disarm",
    "中国议程树为「特区 → 裁军 → 市场化」三步前置链");
  const deuOst = deuAgendas.find((a) => a.id === "deu_ostpolitik");
  const deuMkt = deuAgendas.find((a) => a.id === "eur_single_market_deu");
  const deuPil = deuAgendas.find((a) => a.id === "eur_defense_pillar_deu");
  assert("deuAgendaTree",
    !!deuOst && !!deuMkt && !!deuPil &&
    deuMkt.requires === "deu_ostpolitik" && deuPil.requires === "eur_single_market_deu",
    "西德议程树为「新东方政策 → 单一市场 → 防务支柱」三步前置链");

  // 24. 前置链 + 内政门控：两层条件都必须满足才解锁
  const oldYear = SIM.S ? SIM.S.year : 1980;
  const oldMonth = SIM.S ? SIM.S.month : 1;
  if (SIM.S) { SIM.S.year = 1990; SIM.S.month = 1; }
  initAgendaState();
  ST.player = "CHN";
  ST.mil = 2.0;
  assert("chnMarketBlockedByPrereq", checkAgendaCondition("CHN", chnMarket).ok === false,
    "未完成裁军时价格闯关被前置议程拦下");
  ST.agendas.CHN.completed = ["chn_sez", "chn_disarm"];
  ST.domestic.chn.reformist = 40;
  ST.domestic.chn.planned = 60;
  assert("chnMarketBlockedByDomestic", checkAgendaCondition("CHN", chnMarket).ok === false,
    "内政天平偏向计划派时价格闯关被内政条件拦下");
  ST.domestic.chn.reformist = 62;
  ST.domestic.chn.planned = 38;
  assert("chnMarketAllowedAfterTree", checkAgendaCondition("CHN", chnMarket).ok === true,
    "裁军完成且市场派占优后价格闯关解锁");

  initAgendaState();
  ST.player = "DEU";
  assert("deuMarketBlockedByPrereq", checkAgendaCondition("DEU", deuMkt).ok === false,
    "未达成新东方政策时单一市场被前置议程拦下");
  ST.domestic.deu.detenteDepth = 40;
  assert("deuOstBlockedByDomestic", checkAgendaCondition("DEU", deuOst).ok === false,
    "缓和深度不足时新东方政策被内政条件拦下");
  ST.domestic.deu.detenteDepth = 66;
  assert("deuOstAllowedAfterDetente", checkAgendaCondition("DEU", deuOst).ok === true,
    "缓和深度达标后新东方政策解锁");
  ST.agendas.DEU.completed = ["deu_ostpolitik"];
  assert("deuMarketAllowedAfterTree", checkAgendaCondition("DEU", deuMkt).ok === true,
    "达成新东方政策后单一市场解锁");

  // 25. 内政回馈闭环：完成节点即时改善内政变量
  initAgendaState();
  ST.player = "CHN";
  ST.domestic.chn.sezMomentum = 40;
  startAgenda("CHN", "chn_sez");
  for (let i = 0; i < 24; i++) updateMonthlyAgendas(1990, 1 + (i % 12), true);
  assert("chnSezCompletionFeedsDomestic",
    ST.agendas.CHN.completed.includes("chn_sez") && ST.domestic.chn.sezMomentum > 40,
    "完成特区议程即时回馈内政天平（特区动能上升）");

  initAgendaState();
  ST.player = "DEU";
  ST.domestic.deu.detenteDepth = 60;
  startAgenda("DEU", "deu_ostpolitik");
  for (let i = 0; i < 20; i++) updateMonthlyAgendas(1990, 1 + (i % 12), true);
  assert("deuOstCompletionFeedsDomestic",
    ST.agendas.DEU.completed.includes("deu_ostpolitik") && ST.domestic.deu.detenteDepth > 60,
    "完成新东方政策即时回馈内政天平（缓和深度上升）");

  // 复原状态
  if (SIM.S) { SIM.S.year = oldYear; SIM.S.month = oldMonth; }
  ST.player = null;
  ST.mil = 0;
  initDomesticState();
  initAgendaState();
  applyPlayerDecisions();
  refreshAgendaBox(ST.sel);
}

// K（玩法深度）：JPN/FRA/GBR 三步议程树探针（模板同 agendaProbeChnDeuTrees）
function agendaProbeJpnFraGbrTrees(r, assert, ctx) {
  const jpnAgendas = window.W1980_AGENDAS.getAgendasForCountry("JPN");
  const fraAgendas = window.W1980_AGENDAS.getAgendasForCountry("FRA");
  const gbrAgendas = window.W1980_AGENDAS.getAgendasForCountry("GBR");

  // 26. 树形结构：三步前置链
  const jpnBlack = jpnAgendas.find((a) => a.id === "jpn_black_current");
  const jpnMaekawa = jpnAgendas.find((a) => a.id === "jpn_maekawa");
  assert("jpnAgendaTree",
    !!jpnBlack && !!jpnMaekawa && jpnBlack.requires === "jpn_semiconductor" && jpnMaekawa.requires === "jpn_black_current",
    "日本议程树为「半导体 → 黑潮出海 → 前川报告」三步前置链");
  const fraNat = fraAgendas.find((a) => a.id === "fra_nationalization");
  const fraRig = fraAgendas.find((a) => a.id === "fra_rigueur");
  const fraRec = fraAgendas.find((a) => a.id === "fra_reconversion");
  assert("fraAgendaTree",
    !!fraNat && !!fraRig && !!fraRec && fraRig.requires === "fra_nationalization" && fraRec.requires === "fra_rigueur",
    "法国议程树为「国有化 → 紧缩转向 → 工业重组」三步前置链");
  const gbrMon = gbrAgendas.find((a) => a.id === "gbr_monetarist_turn");
  const gbrUni = gbrAgendas.find((a) => a.id === "gbr_union_reform");
  const gbrWide = gbrAgendas.find((a) => a.id === "gbr_wider_shareholding");
  assert("gbrAgendaTree",
    !!gbrMon && !!gbrUni && !!gbrWide && gbrUni.requires === "gbr_monetarist_turn" && gbrWide.requires === "gbr_union_reform",
    "英国议程树为「货币主义转向 → 工会法制改革 → 大众持股」三步前置链");

  // 27. 前置链 + 内政门控：两层条件都必须满足才解锁
  const oldYear = SIM.S ? SIM.S.year : 1980;
  const oldMonth = SIM.S ? SIM.S.month : 1;
  if (SIM.S) { SIM.S.year = 1990; SIM.S.month = 1; }

  // 日本
  initAgendaState();
  ST.player = "JPN";
  ST.mil = 1.0;
  getAgendaState("JPN");
  assert("jpnMaekawaBlockedByPrereq", checkAgendaCondition("JPN", jpnMaekawa).ok === false,
    "未完成黑潮计划时前川报告被前置议程拦下");
  ST.agendas.JPN.completed = ["jpn_semiconductor", "jpn_black_current"];
  ST.domestic.jpn.domesticist = 40;
  ST.domestic.jpn.exportist = 60;
  assert("jpnMaekawaBlockedByDomestic", checkAgendaCondition("JPN", jpnMaekawa).ok === false,
    "内需开放派未占优时前川报告被内政条件拦下");
  ST.domestic.jpn.domesticist = 62;
  ST.domestic.jpn.exportist = 38;
  assert("jpnMaekawaAllowedAfterTree", checkAgendaCondition("JPN", jpnMaekawa).ok === true,
    "完成黑潮计划且内需开放派占优后前川报告解锁");

  // 法国
  initAgendaState();
  ST.player = "FRA";
  getAgendaState("FRA");
  assert("fraRigueurBlockedByPrereq", checkAgendaCondition("FRA", fraRig).ok === false,
    "未完成国有化时紧缩转向被前置议程拦下");
  ST.agendas.FRA.completed = ["fra_nationalization"];
  ST.domestic.fra.dirigiste = 60;
  ST.domestic.fra.rigueur = 40;
  assert("fraRigueurBlockedByDomestic", checkAgendaCondition("FRA", fraRig).ok === false,
    "国家干预派仍占优时紧缩转向被内政条件拦下");
  ST.domestic.fra.dirigiste = 38;
  ST.domestic.fra.rigueur = 62;
  assert("fraRigueurAllowedAfterTurn", checkAgendaCondition("FRA", fraRig).ok === true,
    "干预派失势、紧缩派占优后紧缩转向解锁");
  ST.agendas.FRA.completed = ["fra_nationalization", "fra_rigueur"];
  ST.domestic.fra.francStrength = 40;
  assert("fraReconversionBlockedByFranc", checkAgendaCondition("FRA", fraRec).ok === false,
    "法郎平价失守时工业重组被内政条件拦下");
  ST.domestic.fra.francStrength = 60;
  assert("fraReconversionAllowedAfterFranc", checkAgendaCondition("FRA", fraRec).ok === true,
    "法郎与外部竞争力达标后工业重组解锁");

  // 英国
  initAgendaState();
  ST.player = "GBR";
  getAgendaState("GBR");
  assert("gbrMonetaristBlockedByFaction", checkAgendaCondition("GBR", gbrMon).ok === false,
    "货币主义派未占优（初始 50:50）时货币主义转向被内政条件拦下");
  ST.domestic.gbr.monetarist = 58;
  ST.domestic.gbr.welfarist = 42;
  assert("gbrMonetaristAllowedAfterFaction", checkAgendaCondition("GBR", gbrMon).ok === true,
    "货币主义派占优后货币主义转向解锁");
  ST.agendas.GBR.completed = ["gbr_monetarist_turn"];
  assert("gbrUnionAllowedAfterPrereq", checkAgendaCondition("GBR", gbrUni).ok === true,
    "达成货币主义转向后工会法制改革解锁");
  ST.agendas.GBR.completed = ["gbr_monetarist_turn", "gbr_union_reform"];
  ST.domestic.gbr.cityStrength = 40;
  assert("gbrShareholdingBlockedByCity", checkAgendaCondition("GBR", gbrWide).ok === false,
    "金融城竞争力不足时大众持股被内政条件拦下");
  ST.domestic.gbr.cityStrength = 60;
  assert("gbrShareholdingAllowedAfterCity", checkAgendaCondition("GBR", gbrWide).ok === true,
    "金融城与服务业竞争力达标后大众持股解锁");

  // 28. 内政回馈闭环：完成节点即时回馈内政变量
  initAgendaState();
  ST.player = "JPN";
  ST.domestic.jpn.domesticist = 62;
  ST.domestic.jpn.exportist = 38;
  ST.domestic.jpn.tradeFriction = 50;
  getAgendaState("JPN").completed = ["jpn_semiconductor", "jpn_black_current"];
  startAgenda("JPN", "jpn_maekawa");
  for (let i = 0; i < 20; i++) updateMonthlyAgendas(1990, 1 + (i % 12), true);
  assert("jpnMaekawaCompletionFeedsDomestic",
    ST.agendas.JPN.completed.includes("jpn_maekawa") && ST.domestic.jpn.tradeFriction < 50,
    "完成前川报告即时回馈内政（贸易摩擦压力回落）");

  initAgendaState();
  ST.player = "FRA";
  ST.domestic.fra.dirigiste = 55;
  ST.domestic.fra.rigueur = 45;
  ST.domestic.fra.francStrength = 45;
  startAgenda("FRA", "fra_nationalization");
  for (let i = 0; i < 20; i++) updateMonthlyAgendas(1990, 1 + (i % 12), true);
  assert("fraNationalizationCompletionFeedsDomestic",
    ST.agendas.FRA.completed.includes("fra_nationalization") && ST.domestic.fra.francStrength < 45,
    "完成国有化即时回馈内政（法郎平价承压）");

  initAgendaState();
  ST.player = "GBR";
  ST.domestic.gbr.monetarist = 58;
  ST.domestic.gbr.welfarist = 42;
  ST.domestic.gbr.inflation = 70;
  startAgenda("GBR", "gbr_monetarist_turn");
  for (let i = 0; i < 20; i++) updateMonthlyAgendas(1990, 1 + (i % 12), true);
  assert("gbrMonetaristCompletionFeedsDomestic",
    ST.agendas.GBR.completed.includes("gbr_monetarist_turn") && ST.domestic.gbr.inflation < 70,
    "完成货币主义转向即时回馈内政（通胀压力回落）");

  // 复原状态
  if (SIM.S) { SIM.S.year = oldYear; SIM.S.month = oldMonth; }
  ST.player = null;
  ST.mil = 0;
  initDomesticState();
  initAgendaState();
  applyPlayerDecisions();
  refreshAgendaBox(ST.sel);
}

// M3（清死代码 + 门控词表）：议程门控必须是登记过的名字，未登记的一律 fail-closed。
// 此前「写错名字」或「引擎删了分支但数据还在用」会得到「门控永远放行」的静默失效。
function agendaProbeConditionVocabulary(r, assert, ctx) {
  const REG = window.W1980_AGENDA_CONDITIONS;
  assert("agendaConditionRegistryApi",
    !!REG && typeof REG.isRegistered === "function" && Array.isArray(REG.names()),
    "W1980_AGENDA_CONDITIONS 暴露门控词表（isRegistered / names）");

  // 数据里声明过的每个门控都必须是登记值（构建期由 validate 判失败，这里是运行期双保险）
  const AGD = (window.W1980_AGENDAS && window.W1980_AGENDAS.database) || {};
  const used = [];
  let unregistered = 0;
  for (const ck of Object.keys(AGD)) {
    for (const ag of (AGD[ck] || [])) {
      if (ag.condition === undefined || ag.condition === null) continue;
      if (used.indexOf(ag.condition) < 0) used.push(ag.condition);
      if (!REG || !REG.isRegistered(ag.condition)) unregistered++;
    }
  }
  r.details.__agendaConditionsUsed = used.join(",");
  r.details.__agendaConditionsRegistered = REG ? REG.names().length : 0;
  assert("agendaConditionsAllRegistered", unregistered === 0,
    "数据里使用的 " + used.length + " 种门控全部已登记（未登记 " + unregistered + " 处）");

  // fail-closed：未登记的名字必须判未通过，而不是默认放行
  const ghost = checkAgendaCondition("CHN", { id: "probe_ghost", title: "探针虚拟议程", condition: "ghost_condition_xyz" });
  assert("unknownAgendaConditionBlocks",
    ghost.ok === false && String(ghost.reason).indexOf("未注册") >= 0,
    "未登记的门控判未通过并说明原因（" + ghost.reason + "）");

  // 死代码不得复活：Phase K 之后数据侧已改用 domestic_faction，
  // 这两个旧名字既没有引擎分支也不在词表里 —— 一旦被重新使用，上面的断言就会失败。
  const deadA = checkAgendaCondition("CHN", { id: "probe_dead_a", title: "旧门控 A", condition: "domestic_reform_lead" });
  const deadB = checkAgendaCondition("DEU", { id: "probe_dead_b", title: "旧门控 B", condition: "domestic_detente" });
  assert("deadAgendaConditionsRejected",
    deadA.ok === false && deadB.ok === false &&
    !REG.isRegistered("domestic_reform_lead") && !REG.isRegistered("domestic_detente"),
    "已删除的 domestic_reform_lead / domestic_detente 既不在词表也求值不通过");
}