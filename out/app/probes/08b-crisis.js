"use strict";

// ---- R12C: 突发危机抉择卡与升级阶梯专用全链路探针 ----
function runCrisisProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("CRISISPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 核心数据库与函数存在性
    assert("databaseLoaded", !!window.W1980_CRISES && Array.isArray(window.W1980_CRISES.list), "W1980_CRISES 数据库应成功载入");
    assert("crisesCount8", window.W1980_CRISES && window.W1980_CRISES.list.length === 8, "突发危机总数应为 8 大历史危机");
    assert("crisisPolandLoaded", !!window.W1980_CRISES.getCrisisById("crisis_poland_1981"), "1981 波兰戒严危机应存在");
    assert("crisisSouthGeorgiaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_southgeorgia_1982"), "1982 南乔治亚岛危机应存在");
    assert("crisisKAL007Loaded", !!window.W1980_CRISES.getCrisisById("crisis_kal007_1983"), "1983 大韩航空 007 班机事件应存在");
    assert("crisisGrenadaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_grenada_1983"), "1983 格林纳达狂暴行动危机应存在");
    assert("crisisBeirutLoaded", !!window.W1980_CRISES.getCrisisById("crisis_beirut_1985"), "1985 贝鲁特人质危机应存在");
    assert("crisisAchilleLoaded", !!window.W1980_CRISES.getCrisisById("crisis_achille_1985"), "1985 阿基莱·劳伦号游轮危机应存在");
    assert("crisisVincennesLoaded", !!window.W1980_CRISES.getCrisisById("crisis_vincennes_1988"), "1988 文森斯号海湾误击事件应存在");
    assert("crisisRomaniaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_romania_1989"), "1989 罗马尼亚蒂米什瓦拉剧变应存在");

    // 2. 危机数据结构与阶梯完整性
    assert("allCrisesHave3Tiers", window.W1980_CRISES.list.every((c) => c.options && c.options.length === 3), "每个危机均严格配备三级博弈应对阶梯");
    assert("allCrisesHaveEffects", window.W1980_CRISES.list.every((c) => c.options.every((o) => o.effects && typeof o.effects === "object")), "每个阶梯选项均定义有效效果对象");

    // 3. 核心 API 函数定义
    assert("initCrisisStateExists", typeof initCrisisState === "function", "initCrisisState 应已定义");
    assert("sanitizeCrisisStateExists", typeof sanitizeCrisisState === "function", "sanitizeCrisisState 应已定义");
    assert("openCrisisModalExists", typeof openCrisisModal === "function", "openCrisisModal 应已定义");
    assert("closeCrisisModalExists", typeof closeCrisisModal === "function", "closeCrisisModal 应已定义");
    assert("resolveCrisisExists", typeof resolveCrisis === "function", "resolveCrisis 应已定义");
    assert("updateMonthlyCrisesExists", typeof updateMonthlyCrises === "function", "updateMonthlyCrises 应已定义");

    // 4. DOM 容器与布局校验
    const modal = $("crisis-modal");
    const dossier = $("crisis-dossier");
    const optBox = $("crisis-options");
    assert("modalDomExists", !!modal, "#crisis-modal 应存在于 DOM 中");
    assert("dossierDomExists", !!dossier, "#crisis-dossier 密电卡片容器应存在于 DOM 中");
    assert("optionsDomExists", !!optBox, "#crisis-options 阶梯容器应存在于 DOM 中");

    // 5. 状态初始化与纯净性
    initCrisisState();
    assert("initialStateClean", ST.crises && ST.crises.history.length === 0 && ST.crises.pending === null, "ST.crises 初始状态纯净");

    // 6. 弹窗渲染与阶梯卡片生成
    const cr1 = window.W1980_CRISES.getCrisisById("crisis_poland_1981");
    openCrisisModal(cr1);
    assert("openModalRendersTitle", $("crisis-title").textContent.includes("波兰戒严"), "弹窗标题正确渲染波兰危机");
    assert("openModalRendersCards", optBox.querySelectorAll(".crisis-card").length === 3, "弹窗成功渲染 3 张应对阶梯卡片");
    assert("modalDisplayFlex", modal.style.display === "flex", "弹窗 display 属性为 flex");

    // 7. 决断执行（阶梯 1：战略克制）
    const resolveRes = resolveCrisis("crisis_poland_1981", 1, true);
    assert("resolveReturnsTrue", resolveRes === true, "resolveCrisis 顺利执行返回 true");
    assert("resolveHistoryRecorded", ST.crises.history.some((h) => h.id === "crisis_poland_1981" && h.tier === 1), "历史记录成功入账阶梯 1");
    assert("resolveModalClosed", modal.style.display === "none", "决断后弹窗已自动关闭");
    assert("resolveClearedPending", ST.crises.pending === null, "决断后 pending 状态已清空");

    // 8. 大国内政生态与巴统联动校验 (阶梯 3 强硬决断)
    initDomesticState();
    const prevApproval = (ST.domestic && ST.domestic.usa) ? ST.domestic.usa.congressApproval : 55;
    resolveCrisis("crisis_kal007_1983", 3, true);
    assert("cocomStrictUpgraded", ST.cocom && ST.cocom.strict === true, "KAL007 阶梯 3 升级巴统技术封锁");
    assert("domesticApprovalBoosted", (ST.domestic && ST.domestic.usa && ST.domestic.usa.congressApproval > prevApproval), "KAL007 阶梯 3 推升国会批准率");

    // 9. 旁观模式零漂移铁律检验
    ST.player = null;
    updateMonthlyCrises(1988, 7, true);
    assert("spectatorAutoBaseline", ST.crises.history.some((h) => h.id === "crisis_vincennes_1988" && h.tier === 2 && h.auto === true), "旁观模式自动采纳史实基准阶梯 2");
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("spectatorZeroPmods", pmodsCount === 0, "旁观模式危机决断绝对 0 pmods 注入 (0 漂移)");

    // 10. 终局大事记时代编年史联动
    const chList = generateChronicle();
    assert("chronicleHasCrisis", Array.isArray(chList) && chList.some((item) => item.tagClass === "crisis"), "终局历史大事记编年史包含突发危机篇章");

    // 11. simSave() / simLoad() 全量往返序列化
    const savedLen = ST.crises.history.length;
    simSave();
    initCrisisState();
    assert("stateCleanedBeforeLoad", ST.crises.history.length === 0, "读档前清空状态生效");
    simLoad();
    assert("saveLoadRoundTrip", ST.crises && ST.crises.history.length === savedLen, "simSave/simLoad 完美往返恢复突发危机历史记录");

    // 恢复纯净环境
    ST.player = null;
    ST.mil = 0;
    initCrisisState();
    hideCrisisModal();
    applyPlayerDecisions();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "crisisprobe"; d.style.display = "none";
  d.textContent = "CRISISPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
