"use strict";


// R10C：联合国安理会多边外交与调停机制全链路探针
function runUNSCProbe() {
  const r = { pass: true, assertCount: 0, errors: [], details: {} };
  function assert(name, condition, msg) {
    r.assertCount++;
    if (!condition) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("UNSCPROBE FAIL [" + name + "]: " + msg);
    } else {
      r.details[name] = "PASS";
    }
  }

  try {
    const AI = window.W1980_AI;
    assert("aiModuleLoaded", !!AI, "window.W1980_AI 模块正常加载");


  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runUNSCProbePhase*）。
  const ctx = {};
  ctx.AI = AI;
  runUNSCProbePhase1(r, assert, ctx);
  runUNSCProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "unscprobe"; d.style.display = "none";
  d.textContent = "UNSCPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runUNSCProbe 的阶段一（原样搬运，无逻辑改动）
function runUNSCProbePhase1(r, assert, ctx) {
  const AI = ctx.AI;

  // 1. 常任理事国 (P5) 与决议库定义结构
  assert("unscP5Defined", Array.isArray(AI.UNSC_P5) && AI.UNSC_P5.length === 5, "UNSC_P5 包含五大常任理事国");
  assert("unscP5Members", AI.UNSC_P5.includes("USA") && AI.UNSC_P5.includes("SUN") && AI.UNSC_P5.includes("CHN") && AI.UNSC_P5.includes("GBR") && AI.UNSC_P5.includes("FRA"), "P5 准确包含美苏中英法");

  assert("resolutionsLoaded", !!(AI.UNSC_RESOLUTIONS && AI.UNSC_RESOLUTIONS.res_598 && AI.UNSC_RESOLUTIONS.res_660 && AI.UNSC_RESOLUTIONS.res_502), "UNSC_RESOLUTIONS 包含 598/660/502");
  const r598 = AI.UNSC_RESOLUTIONS.res_598;
  assert("res598Data", r598 && r598.year === 1987 && r598.effects.ceasefire === true && r598.effects.openChokepoint === "hormuz" && r598.effects.economicRelief === 0.20, "598号决议停火、海峡通航与经济重建红利参数完备");
  const r660 = AI.UNSC_RESOLUTIONS.res_660;
  assert("res660Data", r660 && r660.year === 1990 && r660.effects.multilateralEmbargo === "IRQ" && r660.effects.embargoPenalty === -2.0 && r660.effects.liberateKuwait === true, "660号决议多边制裁与光复科威特参数完备");

  // 2. 表决倾向评估与一票否决权判定 pure function 测试
  const vUSA_598 = AI.evaluateUNSCVote("USA", r598, { countries: CM.countries });
  const vSUN_598 = AI.evaluateUNSCVote("SUN", r598, { countries: CM.countries });
  const vCHN_598 = AI.evaluateUNSCVote("CHN", r598, { countries: CM.countries });
  assert("unanimous598InFavor", vUSA_598.vote === "in_favor" && vSUN_598.vote === "in_favor" && vCHN_598.vote === "in_favor", "五常历史上对598号两伊停火决议一致赞成");

  const mockResAllySanction = {
    id: "mock_res_syr",
    sponsor: "USA",
    effects: { multilateralEmbargo: "SYR", embargoPenalty: -1.0 }
  };
  const vSUN_Ally = AI.evaluateUNSCVote("SUN", mockResAllySanction, { countries: CM.countries });
  assert("sovietVetoCoreAlly", vSUN_Ally.vote === "veto" && vSUN_Ally.reason.includes("否决"), "针对核心盟友(叙利亚)制裁草案触发苏联行使一票否决权(VETO)");

  const vNonP5 = AI.evaluateUNSCVote("JPN", r598, { countries: CM.countries });
  assert("nonP5NoVote", vNonP5.vote === "abstain" && vNonP5.reason.includes("非五常"), "非常任理事国无安理会正式表决权");

  // 3. 草案提交资格 canTableResolution
  assert("spectatorCannotTable", AI.canTableResolution(null, "res_598").ok === false, "旁观模式无法提交安理会草案");
  assert("p5CanTable", AI.canTableResolution("USA", "res_598").ok === true && AI.canTableResolution("USA", "res_598").isP5 === true, "常任理事国可提交草案并持有P5表决席");

  // 4. 安理会弹窗 UI 交互与卡片渲染
  simReset();
  setPlayer("USA");
  openUNSCModal("res_598");
  const modal = $("unsc-modal");
  assert("modalOpens", modal && modal.style.display !== "none", "openUNSCModal 成功展示安理会大厅弹窗");
  const grid = $("unsc-p5-grid");
  assert("p5CardsRendered", grid && grid.children.length === 5, "五常席位卡片完整渲染 5 席");
  const playerCard = grid.querySelector(".p5-card.is-player");
  assert("playerCardHighlighted", !!playerCard && playerCard.textContent.includes("美国"), "美国作为玩家常任理事国席位正确高亮");

  closeUNSCModal();
  assert("modalCloses", modal && modal.style.display === "none", "closeUNSCModal 成功收起弹窗");
}

// G（收尾评审）：runUNSCProbe 的阶段二（原样搬运，无逻辑改动）
function runUNSCProbePhase2(r, assert, ctx) {
  // 5. 玩家行使一票否决权 (Player VETO)
  openUNSCModal("res_598");
  voteUNSC("veto");
  assert("resNotPassedOnVeto", !ST.ai.unsc.passed.includes("res_598"), "一票否决后决议未进入 passed 列表");
  const historyVeto = ST.ai.unsc.history.find((h) => h.id === "res_598" && h.status === "vetoed");
  assert("vetoHistoryRecorded", !!historyVeto && historyVeto.vetoBy === "USA", "否决历史准确记录 USA 行使否决权");
  const bannerVeto = $("unsc-status-banner");
  assert("bannerVetoClass", bannerVeto && bannerVeto.classList.contains("vetoed"), "大厅状态横幅变更为否决状态 (vetoed)");

  // 6. 决议表决通过与 598 号决议停火履约 (Resolution Passed & Ceasefire Execution)
  simReset();
  setPlayer("USA");
  // 模拟两伊前线处于交火占领中、霍尔木兹处于油轮战中
  setFrontline(1684, "IRQ", "iran_iraq");
  setFrontline(1692, "IRN", "iran_iraq");
  ST.chokepoints.hormuz = "contested";

  openUNSCModal("res_598");
  voteUNSC("in_favor");
  assert("res598Passed", ST.ai.unsc.passed.includes("res_598"), "598 号决议成功表决通过进入 passed 列表");
  assert("frontline1684Cleared", !ST.frontlines[1684], "598 号决议生效立即平息阿瓦士前线战事");
  assert("frontline1692Cleared", !ST.frontlines[1692], "598 号决议生效立即清空巴士拉前线占领");
  assert("hormuzRestoredOpen", ST.chokepoints.hormuz === "open", "598 号决议解除波斯湾油轮战交火，霍尔木兹恢复正常通航");

  const ekIRN = entKeys("IRN")[0];
  const ekIRQ = entKeys("IRQ")[0];
  const pmodIRN = SIM.S.P.pmods[ekIRN] || 0;
  const pmodIRQ = SIM.S.P.pmods[ekIRQ] || 0;
  assert("partiesEconomicRelief", pmodIRN >= 0.20 - 1e-4 && pmodIRQ >= 0.20 - 1e-4, "两伊当事国享受 +0.20pp/年 和平重建红利");

  // 7. 660 号决议：海湾危机多边制裁与光复科威特
  setFrontline(1809, "IRQ", "gulf_war");
  openUNSCModal("res_660");
  voteUNSC("in_favor");
  assert("res660Passed", ST.ai.unsc.passed.includes("res_660"), "660 号决议成功通过");
  assert("kuwaitLiberated", !ST.frontlines[1809], "660 号决议生效立即光复科威特 (省份 1809 占领清空)");
  const pmodIRQ_660 = SIM.S.P.pmods[ekIRQ] || 0;
  assert("multilateralEmbargoPenalty", pmodIRQ_660 <= -1.8, "伊拉克遭受多边集体禁运惩治 (-2.0pp)");
  const ekUSA = entKeys("USA")[0];
  assert("noBacklashOnInitiator", !SIM.S.P.pmods[ekUSA] || SIM.S.P.pmods[ekUSA] >= 0, "多边联合制裁免除发起大国双边反噬");

  // 8. 存档与读档无损往返 (Save & Load Persistence)
  const passedCountBefore = ST.ai.unsc.passed.length;
  const historyCountBefore = ST.ai.unsc.history.length;
  const saveOk = simSave();
  assert("saveSuccess", saveOk.ok, "simSave 成功执行");

  simReset();
  assert("resetClearsUNSC", ST.ai.unsc.passed.length === 0 && ST.ai.unsc.history.length === 0, "simReset 干净重置安理会决议状态");

  const loadOk = simLoad();
  assert("loadSuccess", loadOk.ok, "simLoad 成功反序列化");
  assert("unscPassedRestored", ST.ai.unsc.passed.length === passedCountBefore, "读档后安理会生效决议完美还原");
  assert("unscHistoryRestored", ST.ai.unsc.history.length === historyCountBefore, "读档后安理会历史记录完整保留");

  // 9. 旁观模式零漂移铁律
  simReset();
  setPlayer(null);
  assert("spectatorNoUNSC", ST.ai.unsc.passed.length === 0, "旁观模式下安理会生效决议为空");
  assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
}


// ---- R11A: 面板 Tabs 选项卡体系专用探针 ----
function runPanelProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("PANELPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 选项卡容器与按钮存在性
    const tabs = $("panel-tabs");
    assert("tabsContainerExists", !!tabs, "#panel-tabs 容器应存在于 DOM 中");
    const btns = tabs ? tabs.querySelectorAll(".p-tab-btn") : [];
    assert("tabButtonsCountFour", btns.length === 4, "应存在 4 个选项卡按钮");

    // 2. 四大内容容器 Pane 存在性
    const pOvw = $("p-pane-overview");
    const pDef = $("p-pane-defense");
    const pEco = $("p-pane-economy");
    const pDip = $("p-pane-diplomacy");
    assert("allPanesExist", !!pOvw && !!pDef && !!pEco && !!pDip, "四大 Tab Pane 容器应全部存在于 DOM 中");

    // 3. 既有历史功能节点完整包含在对应 Pane 中
    const spark = $("p-spark");
    assert("sparkInOverview", !!spark && spark.parentElement === pOvw, "#p-spark 属于概览 Pane");

    const warBox = $("p-war-box");
    const milBox = $("p-milbox");
    assert("defenseBoxesContained", !!warBox && warBox.parentElement === pDef && !!milBox && milBox.parentElement === pDef, "#p-war-box 和 #p-milbox 属于国防 Pane");

    const resBox = $("p-res-box");
    const tradeBox = $("p-trade-box");
    const embargoBox = $("p-embargo-box");
    assert("economyBoxesContained", !!resBox && resBox.parentElement === pEco && !!tradeBox && tradeBox.parentElement === pEco && !!embargoBox && embargoBox.parentElement === pEco, "经贸三大盒子属于经贸 Pane");

    const aiBox = $("p-ai-box");
    const blocCtl = $("p-bloc-ctl");
    assert("diplomacyBoxesContained", !!aiBox && aiBox.parentElement === pDip && !!blocCtl && blocCtl.parentElement === pDip, "#p-ai-box 和 #p-bloc-ctl 属于外交 Pane");

    // 4. 选项卡切换功能测试
    setPanelTab("overview");
    assert("overviewActiveDefault", pOvw.classList.contains("active") && !pDef.classList.contains("active"), "切换到概览时仅概览 Pane 处于 active 状态");

    setPanelTab("defense");
    assert("defenseTabActive", pDef.classList.contains("active") && !pOvw.classList.contains("active"), "切换到国防时仅国防 Pane 处于 active 状态");

    setPanelTab("economy");
    assert("economyTabActive", pEco.classList.contains("active") && !pDef.classList.contains("active"), "切换到经贸时仅经贸 Pane 处于 active 状态");

    setPanelTab("diplomacy");
    assert("diplomacyTabActive", pDip.classList.contains("active") && !pEco.classList.contains("active"), "切换到外交时仅外交 Pane 处于 active 状态");

    // 5. 动态角标系统与国家选中交互
    select("IRQ"); // 伊拉克：1980-01 开局尚未进入战时
    const bDef = $("p-tb-defense");
    const bEco = $("p-tb-economy");
    assert("irqPeaceAtStart", !bDef.classList.contains("show"), "1980-01 开局时伊拉克尚未进入战争状态");

    // 快进至 1980-09 两伊战争爆发
    simFastForward(1980, 9);
    select("IRQ");
    assert("irqDefenseWarBadge", bDef && bDef.classList.contains("show") && bDef.textContent === "⚔️", "两伊战争爆发后交战国伊拉克国防 Tab 应显示交战角标 ⚔️");

    select("JPN"); // 日本：极端资源短缺受制
    assert("jpnEconomyDeficitBadge", bEco && bEco.classList.contains("show") && bEco.textContent === "⚠️", "极端资源短缺受制国日本经贸 Tab 应显示预警角标 ⚠️");

    // 6. 概览态势卡片渲染
    select("USA");
    setPlayer("USA");
    const card = $("p-overview-card");
    assert("overviewCardRendered", card && card.innerHTML.includes("本国直辖") && card.innerHTML.includes("poc-nav-btn"), "玩家国家概览态势卡片应正常渲染直辖状态与快捷导航");

    // 7. 干净重置与恢复
    simReset();
    setPlayer(null);
    select(null);
    setPanelTab("overview");
    assert("resetClean", ST.panelTab === "overview" && !bDef.classList.contains("show"), "探针执行后干净恢复至默认概览选项卡与初始状态");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "panelprobe"; d.style.display = "none";
  d.textContent = "PANELPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// ---- R11B: 时代大新闻与重大事件头版特刊系统 (Broadsheet Modal) ----
