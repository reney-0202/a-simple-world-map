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

    // 渲染通用实体面板
    refreshDomesticBox("GBR");
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
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "domesticprobe"; d.style.display = "none";
  d.textContent = "DOMESTICPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// 验证钩子：?pan=<dx>,<dy> 可重复（等价于鼠标拖动），?selftest 由外部触发
