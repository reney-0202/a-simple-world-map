"use strict";


// 经济系统阶段 1：战略资源探针（54 实体覆盖、冷战四大标杆资源特征、模式 7 渲染哈希、面板展示与隐藏）
function runResProbe() {
  const R = window.W1980_RESOURCES;
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("RESPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    assert("resMetaLoaded", !!R && !!R.meta && Object.keys(R.meta).length === 4, "四大战略资源元定义加载完整");
    assert("countriesCount54", !!R && Object.keys(R.countries).length === 54, "54 个可玩实体资源数据全覆盖");

    const sau = R ? R.get("SAU") : null, jpn = R ? R.get("JPN") : null;
    const sun = R ? R.get("SUN") : null, usa = R ? R.get("USA") : null, chn = R ? R.get("CHN") : null;
    assert("sauOilSurplus", !!sau && sau.oil.net > 50 && sau.agr.net < 0, "沙特应为世界级石油出超且粮食赤字");
    assert("jpnDoubleDeficit", !!jpn && jpn.oil.net < -50 && jpn.min.net < -50 && jpn.tech.net > 50, "日本石油与矿产严重双缺口且技术高出超");
    assert("sunGrainDeficit", !!sun && sun.oil.net > 40 && sun.agr.net < -20, "苏联石油富余且粮食结构性严重赤字");
    assert("usaTechAgrSurplus", !!usa && usa.tech.net > 50 && usa.agr.net > 50, "美国高新技术与大宗农粮双超级出超");
    assert("chnSelfSufficient", !!chn && Math.abs(chn.oil.net) <= 5 && Math.abs(chn.agr.net) <= 5, "中国基础资源处于温饱自给自足区间");

    // 模式 7 渲染与表检测
    assert("tableResExists", !!tables.resource && tables.resource.length === 256, "tables.resource 数组应存在且长度为 256");
    const sigPol = mapSig();
    setMode("resource");
    assert("resModeSwitched", ST.mode === "resource", "应成功切换至 resource 模式");
    const sigRes = mapSig();
    r.sigPol = sigPol; r.sigRes = sigRes;
    assert("resSigDifferentFromPol", sigRes !== sigPol, "resource 模式渲染视口哈希应与政治模式显著不同");

    // 选中国家并验证面板
    select("SAU");
    const rb = $("p-res-box");
    assert("resBoxSauVisible", rb && rb.style.display !== "none" && rb.innerHTML.indexOf("资源丰饶大国") >= 0, "沙特面板应显示资源丰饶大国");
    select("JPN");
    assert("resBoxJpnVisible", rb && rb.innerHTML.indexOf("极端短缺受制") >= 0, "日本面板应显示极端短缺受制");
    select(null);
    assert("resBoxHiddenOnClose", rb && rb.style.display === "none", "取消选中国家后资源面板应隐藏");

    setMode("political");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "resprobe"; d.style.display = "none";
  d.textContent = "RESPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// 经济系统阶段 2：贸易大动脉与双轨清算探针（18 历史大动脉、双轨货币储备池、沙特顺差/日本逆差/苏联双轨、月度时序推演与存档读档往返）
function runTradeProbe() {
  const T = window.W1980_TRADE;
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("TRADEPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    // 1. 数据模块加载与基准定义检测
    assert("tradeMetaLoaded", !!T && !!T.PRICES && Object.keys(T.PRICES).length === 4, "贸易价格常数加载完整");
    assert("baselineRoutesCount", !!T && Array.isArray(T.BASELINE_ROUTES) && T.BASELINE_ROUTES.length >= 18, "基准贸易航线不少于 18 条");
    assert("stateRoutesInitialized", Array.isArray(ST.tradeRoutes) && ST.tradeRoutes.length >= 18, "ST.tradeRoutes 成功初始化");
    assert("reservesInitialized", !!ST.reserves && Object.keys(ST.reserves).length >= 50, "54 实体双轨外汇储备池已初始化");

    // 2. 标杆国家进出口与现金流特征检测
    // (a) 沙特阿拉伯 SAU：巨额石油美元顺差
    const sauFlows = getTradeFlows("SAU");
    assert("sauOilSurplus", sauFlows.exportRoutes.length >= 3 && sauFlows.exportUsd >= 80 && sauFlows.netUsd >= 80,
      "沙特应有巨额原油出口年额(>=80亿美元)且USD大顺差");
    assert("sauReservesInit", ST.reserves.SAU.usd >= 30, "沙特初始外汇储备应充沛(>=30亿美元)");

    // (b) 日本 JPN：能源严重短缺输入，高新技术出口，净外汇赤字承压
    const jpnFlows = getTradeFlows("JPN");
    assert("jpnEnergyDeficit", jpnFlows.importRoutes.length >= 4 && jpnFlows.importUsd >= 80,
      "日本原油/矿产/农粮进口年支出应庞大(>=80亿美元)");
    assert("jpnTechSurplus", jpnFlows.exportRoutes.some((x) => x.res === "tech" && x.to === "USA"),
      "日本应有向美国出口消费电子/半导体高新技术航线");
    assert("jpnNetDeficit", jpnFlows.netUsd < -30, "日本能源与原材料输入造成巨大净外贸赤字");

    // (c) 苏联 SUN：双轨货币清算枢纽（转账卢布 TRB 充沛，自由外汇 USD 极度匮乏，跨铁幕油气与粮食走廊）
    const sunFlows = getTradeFlows("SUN");
    assert("sunDualCurrencyInit", ST.reserves.SUN.usd <= 15 && ST.reserves.SUN.trb >= 80,
      "苏联初始USD外汇稀缺(<=15亿)但经互会TRB记账储备庞大(>=80亿)");
    assert("sunComeconTrbRoutes", sunFlows.exportRoutes.some((x) => x.cur === "TRB" && x.res === "oil") &&
      sunFlows.importRoutes.some((x) => x.cur === "TRB" && x.res === "tech"),
      "苏联应有经互会内部以 TRB 计价的友谊输油与光学技术进口路线");
    assert("sunTransIronCurtainRoutes", sunFlows.exportRoutes.some((x) => x.to === "DEU" && x.cur === "USD") &&
      sunFlows.importRoutes.some((x) => x.from === "USA" && x.res === "agr"),
      "苏联应有西伯利亚天然气换西德钢管及向美国采购农粮的跨铁幕美元航线");

    // 3. 全局月度清算与时序推演验证
    const sauUsd0 = ST.reserves.SAU.usd;
    const jpnUsd0 = ST.reserves.JPN.usd;
    const sunUsd0 = ST.reserves.SUN.usd;
    const sunTrb0 = ST.reserves.SUN.trb;

    // 快进 12 个月（1980-01 -> 1981-01）
    simFastForward(1981, 1);
    const sauUsd1 = ST.reserves.SAU.usd;
    const jpnUsd1 = ST.reserves.JPN.usd;
    const sunUsd1 = ST.reserves.SUN.usd;
    const sunTrb1 = ST.reserves.SUN.trb;

    assert("sauReservesGrew", sauUsd1 > sauUsd0 + sauFlows.netUsd * 0.9,
      "12个月后沙特外汇储备应积累约一年顺差额 (当前: " + sauUsd1.toFixed(1) + ", 初始: " + sauUsd0.toFixed(1) + ")");
    assert("jpnReservesShrank", jpnUsd1 < jpnUsd0 - 30,
      "12个月后日本外汇储备应被能源逆差消耗 (当前: " + jpnUsd1.toFixed(1) + ", 初始: " + jpnUsd0.toFixed(1) + ")");
    assert("sunDualClearingSettled", sunTrb1 > sunTrb0 && sunUsd1 < sunUsd0,
      "12个月后苏联经互会TRB记账增加，但USD自由外汇因买粮出现净流出");

    // 4. 存档与读档无损还原验证（Save/Load Idempotence）
    const saveOk = simSave();
    assert("simSaveReturnedTrue", saveOk.ok, "simSave 应成功落盘");
    // 故意修改状态
    ST.tradeRoutes = [];
    ST.reserves.SAU.usd = 9999;
    ST.reserves.SUN.trb = 1111;
    const loadOk = simLoad();
    assert("simLoadReturnedTrue", loadOk.ok, "simLoad 应成功读取");
    assert("routesRestored", ST.tradeRoutes.length >= 18, "读档后贸易航线完整还原");
    assert("sauUsdRestored", Math.abs(ST.reserves.SAU.usd - sauUsd1) < 1e-4, "沙特外汇储备读档还原精确无误");
    assert("sunTrbRestored", Math.abs(ST.reserves.SUN.trb - sunTrb1) < 1e-4, "苏联TRB储备读档还原精确无误");

    // 5. UI 面板渲染与交互断言
    select("SAU");
    const tb = $("p-trade-box");
    assert("sauPanelVisible", tb && tb.style.display !== "none" && tb.innerHTML.indexOf("原油") >= 0,
      "沙特贸易面板应正常展开并展示原油出口航线");
    assert("sauBadgeText", tb && tb.innerHTML.indexOf("顺差") >= 0, "沙特贸易面板应标有顺差徽章");

    select("SUN");
    assert("sunPanelDualClearing", tb && tb.innerHTML.indexOf("TRB 经互会卢布") >= 0 && tb.innerHTML.indexOf("USD 自由外汇") >= 0,
      "苏联贸易面板应同时清晰呈现 USD 与 TRB 双轨货币清算");

    select(null);
    assert("panelHiddenOnDeselect", tb && tb.style.display === "none", "取消选择后贸易面板应隐藏");

    // 6. 收尾重置
    simReset();
    assert("cleanResetRoutes", ST.tradeRoutes.length >= 18, "重置后贸易航线还原至基准");
    assert("cleanResetReserves", Math.abs(ST.reserves.SAU.usd - sauUsd0) < 1e-4, "重置后沙特外汇储备恢复至初始值");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "tradeprobe"; d.style.display = "none";
  d.textContent = "TRADEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

function runEmbargoProbe() {
  const E = window.W1980_EMBARGO;
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("EMBARGOPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {

  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runEmbargoProbePhase*）。
  const ctx = {};
  ctx.E = E;
  runEmbargoProbePhase1(r, assert, ctx);
  runEmbargoProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "embargoprobe"; d.style.display = "none";
  d.textContent = "EMBARGOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runEmbargoProbe 的阶段一（原样搬运，无逻辑改动）
function runEmbargoProbePhase1(r, assert, ctx) {
  const E = ctx.E;

  // 1. 数据模块与多边出口管制规则检测
  assert("embargoMetaLoaded", !!E && !!E.COCOM && !!E.CHOKEPOINTS, "巴统与咽喉海峡元数据加载完整");
  assert("cocomRestrictedTech", E.isCocomRestricted("NATO", "WP", "tech") === true &&
    E.isCocomRestricted("W", "SOV", "tech") === true &&
    E.isCocomRestricted("W", "CHN", "tech") === true, "西方对华约与社会主义阵营高新技术实施管制");
  assert("cocomAllowNonTech", E.isCocomRestricted("NATO", "WP", "oil") === false &&
    E.isCocomRestricted("W", "SOV", "agr") === false, "非高新技术常规物资不禁运");
  assert("cocomAllowInternal", E.isCocomRestricted("NATO", "W", "tech") === false &&
    E.isCocomRestricted("WP", "WP", "tech") === false, "阵营内部技术流动不禁运");

  // 2. 1980 史实基准与东芝机械特种走私原型验证
  assert("stateCocomInitialized", ST.cocom && ST.cocom.active === true && ST.cocom.strict === false,
    "ST.cocom 初始化生效但默认非极限制裁");
  assert("stateSmuggleInitialized", ST.smuggle && ST.smuggle.tr_deu_sun_tech === true,
    "ST.smuggle 默认启用东芝机械特种走私渠道原型");
  assert("stateHormuzInitialized", ST.chokepoints && ST.chokepoints.hormuz === "open",
    "ST.chokepoints 霍尔木兹海峡默认正常通航");

  const techRoute = ST.tradeRoutes.find((x) => x.id === "tr_deu_sun_tech");
  assert("deuSunTechRouteFound", !!techRoute, "存在西德向苏联出口技术航线");
  const st0 = getRouteStatus(techRoute);
  assert("baselineSmuggleStatus", st0.status === "smuggled" && st0.factor === 1.0 && st0.costMultiplier === 1.5,
    "基准状态下西德至苏联技术航线为特种走私(1.5x外汇溢价)");

  // 3. 巴统极限升级与反走私阻断测试
  ST.smuggle.tr_deu_sun_tech = false;
  const stBlocked = getRouteStatus(techRoute);
  assert("cocomBanEnforced", stBlocked.status === "blocked_cocom" && stBlocked.factor === 0,
    "关闭特种走私后巴统高技术航线被彻底阻断(运力归零)");
  ST.smuggle.tr_deu_sun_tech = true; // 还原
}

// G（收尾评审）：runEmbargoProbe 的阶段二（原样搬运，无逻辑改动）
function runEmbargoProbePhase2(r, assert, ctx) {
  // 4. 双边二级极限制裁切断航线测试
  const origPlayer = ST.player;
  const origSan = ST.sanctions.slice();
  ST.player = "USA";
  ST.sanctions = [{ t: "SUN", l: 2, since: 0 }];
  const usSunRoute = ST.tradeRoutes.find((x) => (x.from === "USA" && x.to === "SUN") || (x.from === "SUN" && x.to === "USA"));
  assert("usSunRouteFound", !!usSunRoute, "存在美苏跨铁幕贸易航线");
  const stSan = getRouteStatus(usSunRoute);
  assert("tier2SanctionBlockade", stSan.status === "sanctioned" && stSan.factor === 0,
    "美国对苏联实施二级极限制裁切断美苏直接贸易航线");
  ST.player = origPlayer;
  ST.sanctions = origSan;

  // 5. 战略咽喉海峡（霍尔木兹海峡）状态机与油轮战推演
  const sauJpnRoute = ST.tradeRoutes.find((x) => x.id === "tr_sau_jpn_oil");
  assert("sauJpnRouteFound", !!sauJpnRoute, "存在沙特向日本输出原油航线");

  // (a) 正常状态
  ST.chokepoints.hormuz = "open";
  const stHormuzOpen = getRouteStatus(sauJpnRoute);
  assert("hormuzOpenDelivery", stHormuzOpen.status === "ok" && stHormuzOpen.factor === 1.0,
    "霍尔木兹畅通时沙特-日本原油全额交付");

  // (b) 油轮战交火 (contested: 运力-30%, 成本+25%)
  ST.chokepoints.hormuz = "contested";
  const stHormuzContested = getRouteStatus(sauJpnRoute);
  assert("hormuzContestedDelivery", stHormuzContested.status === "chokepoint_contested" &&
    Math.abs(stHormuzContested.factor - 0.7) < 1e-4 && Math.abs(stHormuzContested.costMultiplier - 1.25) < 1e-4,
    "霍尔木兹油轮战期间运力折损至70%且运费溢价125%");

  // (c) 极端封锁断航 (blocked: 运力-80%, 成本翻倍)
  ST.chokepoints.hormuz = "blocked";
  const stHormuzBlocked = getRouteStatus(sauJpnRoute);
  assert("hormuzBlockedDelivery", stHormuzBlocked.status === "blocked_chokepoint" &&
    Math.abs(stHormuzBlocked.factor - 0.2) < 1e-4,
    "霍尔木兹极端封锁运力仅剩20%");

  // 6. 能源短缺休克与宏观经济折损（Resource Deficit Shock）
  // (a) 畅通时日本无短缺折损
  ST.chokepoints.hormuz = "open";
  const rpOpen = calcResourcePenalty("JPN");
  assert("jpnNoDeficitWhenOpen", rpOpen.penalty === 0 && rpOpen.ratio >= 0.45,
    "霍尔木兹畅通时日本原油满足率正常无折损 (满足率: " + Math.round(rpOpen.ratio * 100) + "%)");

  // (b) 极端封锁时日本触发工业减速惩罚
  ST.chokepoints.hormuz = "blocked";
  const rpBlocked = calcResourcePenalty("JPN");
  assert("jpnDeficitShockTriggered", rpBlocked.penalty < -0.3 && rpBlocked.ratio < 0.45,
    "霍尔木兹封锁触发日本原油短缺休克 (满足率: " + Math.round(rpBlocked.ratio * 100) + "%, 惩罚: " + rpBlocked.penalty.toFixed(2) + "pp)");

  // 7. 时序状态演进与十字路口因果检验
  ST.chokepoints.hormuz = "open";
  updateTimelineEmbargo(1983, 12);
  assert("timelineBeforeTankerWar", ST.chokepoints.hormuz === "open", "1983年油轮战未爆发保持open");
  updateTimelineEmbargo(1984, 5);
  assert("timelineTankerWarActive", ST.chokepoints.hormuz === "contested", "1984年油轮战爆发进入contested");
  updateTimelineEmbargo(1988, 9);
  assert("timelineTankerWarEnded", ST.chokepoints.hormuz === "open", "1988年停火后海峡恢复open");

  // 十字路口克制分支：若阻止两伊战争，则油轮战不爆发
  CR.deny.add("iran_iraq_war");
  ST.chokepoints.hormuz = "open";
  updateTimelineEmbargo(1984, 5);
  assert("crossroadPreventsTankerWar", ST.chokepoints.hormuz === "open", "阻止两伊战争后油轮战被抑制不发生");
  CR.deny.delete("iran_iraq_war");

  // 8. UI 面板渲染与交互控制台断言
  select("JPN");
  const tb = $("p-trade-box");
  assert("jpnPanelTradeRendered", tb && tb.style.display !== "none", "日本贸易面板正常展开");
  assert("embargoConsoleRendered", tb && tb.innerHTML.indexOf("经济战与航道安全态势") >= 0,
    "贸易面板内嵌经济战与航道安全态势控制台");
  assert("cocomItemRendered", tb && tb.innerHTML.indexOf("巴统高技术禁运") >= 0,
    "控制台正确展示巴统管制条目");
  assert("hormuzItemRendered", tb && tb.innerHTML.indexOf("霍尔木兹海峡") >= 0,
    "控制台正确展示霍尔木兹海峡状态");

  select("SUN");
  assert("sunSmuggleTagRendered", tb && tb.innerHTML.indexOf("特种走私") >= 0,
    "苏联贸易面板内包含特种走私航线标签");

  // 玩家身份下交互按钮渲染断言
  ST.player = "USA"; ST.sel = "USA"; select("USA");
  assert("usaPlayerActionBtns", !!$("p-btn-cocom") && !!$("p-btn-escort"),
    "美国玩家面板提供升级巴统管制与护航行动按钮");

  ST.player = "SUN"; ST.sel = "SUN"; select("SUN");
  assert("sunPlayerActionBtns", !!$("p-btn-smuggle"),
    "苏联玩家面板提供开启/关闭特种技术走私按钮");

  ST.player = origPlayer; ST.sel = null; select(null);

  // 9. 权威持久化往返验证 (Save/Load Round-Trip)
  ST.cocom.strict = true;
  ST.chokepoints.hormuz = "blocked";
  ST.smuggle.tr_deu_sun_tech = false;
  const saveOk = simSave();
  assert("saveRoundtripSuccess", saveOk.ok, "simSave 成功持久化经济战状态");

  simReset();
  assert("resetCleanDefaults", ST.cocom.strict === false && ST.chokepoints.hormuz === "open" &&
    ST.smuggle.tr_deu_sun_tech === true, "simReset 成功还原经济战基准状态");

  const loadOk = simLoad();
  assert("loadRoundtripSuccess", loadOk.ok, "simLoad 成功反序列化");
  assert("cocomStrictRestored", ST.cocom.strict === true, "巴统极限制裁状态成功恢复");
  assert("hormuzBlockedRestored", ST.chokepoints.hormuz === "blocked", "霍尔木兹封锁状态成功恢复");
  assert("smuggleStateRestored", ST.smuggle.tr_deu_sun_tech === false, "特种走私开关成功恢复");

  simReset();
}


// R10A：大国战略性格与反应式 AI 决策机全链路探针（?aiprobe=1）
