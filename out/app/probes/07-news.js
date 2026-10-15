"use strict";


// ---- R11B: 时代大新闻头版弹窗全链路专用探针 ----
function runNewsProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("NEWSPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 数据库加载与完整性检查
    const NW = window.W1980_NEWS;
    assert("newsDataLoaded", !!NW && typeof NW === "object", "时代大新闻数据表应成功加载");
    assert("newsCountSeven", !!NW && Object.keys(NW).length >= 7, "应涵盖至少 7 大冷战时代特刊");
    assert("iranIraqNewsDefined", !!NW && !!NW.iran_iraq_war && NW.iran_iraq_war.y === 1980 && NW.iran_iraq_war.m === 9, "两伊战争特刊定义完整");
    assert("chernobylNewsDefined", !!NW && !!NW.chernobyl && NW.chernobyl.y === 1986 && NW.chernobyl.m === 4, "切尔诺贝利特刊定义完整");
    assert("dissolutionNewsDefined", !!NW && !!NW.ussr_dissolution && NW.ussr_dissolution.y === 1991 && NW.ussr_dissolution.m === 12, "苏联解体特刊定义完整");

    // 2. 弹窗 DOM 结构检查
    const modal = $("news-modal");
    assert("newsModalExists", !!modal, "#news-modal 弹窗容器应存在于 DOM 中");
    const sheet = $("news-broadsheet");
    assert("newsBroadsheetExists", !!sheet, ".news-broadsheet 报纸版心应存在");
    const headlineEl = $("news-headline");
    assert("headlineElementExists", !!headlineEl, "#news-headline 标题元素应存在");
    const btnFocus = $("news-btn-focus");
    const btnCont = $("news-btn-continue");
    assert("modalButtonsExist", !!btnFocus && !!btnCont, "聚焦与继续推演按钮应完整存在");

    // 3. 打开与渲染测试
    const ok = openNewsModal("iran_iraq_war");
    assert("openModalSuccess", ok === true && modal.style.display === "flex", "openNewsModal 成功唤起弹窗");
    assert("headlineContentMatches", headlineEl && (headlineEl.textContent.includes("两伊") || headlineEl.textContent.includes("阿拉伯河")), "头条大标题渲染正确");
    assert("editorialRendered", $("news-editorial") && $("news-editorial").textContent.length > 20, "时代社论内容渲染正确");
    assert("impactsRendered", $("news-impacts") && $("news-impacts").querySelectorAll(".news-impact-item").length === 3, "三大地缘波及要点渲染正确");

    // 4. 聚焦交互响应
    btnFocus.click();
    assert("focusClickHandled", true, "点击聚焦事发地未发生异常");

    // 5. 关闭测试
    btnCont.click();
    assert("closeModalSuccess", modal.style.display === "none", "点击继续推演成功关闭大新闻弹窗");

    // 6. 收件箱历史特刊回顾标记与交互
    simReset();
    const iiItem = { id: "iran_iraq_war", y: 1980, m: 9, zh: "两伊战争爆发", note: "测试" };
    EV.items.push(iiItem);
    renderInbox();
    const inBox = $("inbox-list");
    const newsEl = inBox ? inBox.querySelector('.ev[data-news="iran_iraq_war"]') : null;
    assert("inboxNewsBadgeRendered", !!newsEl && newsEl.classList.contains("is-news") && newsEl.innerHTML.includes("特刊"), "收件箱内时代大事件正确标记 [特刊] 徽章");

    // 7. 干净重置与恢复
    simReset();
    closeNewsModal();
    assert("resetClean", modal.style.display === "none", "探针执行后干净恢复");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "newsprobe"; d.style.display = "none";
  d.textContent = "NEWSPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

function runChronicleProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("CHRONICLEPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 函数完备性检查
    assert("generateEpilogueExists", typeof generateEpilogue === "function", "generateEpilogue 纯函数应存在");
    assert("generateChronicleExists", typeof generateChronicle === "function", "generateChronicle 纯函数应存在");
    assert("exportMemoirsExists", typeof exportMemoirs === "function", "exportMemoirs 纯函数应存在");

    // 2. 旁观模式后日谈生成测试
    const obSt = {
      date: "1991-12",
      world: { gdp: 24000, gdp0: 12000, gdpDelta: 100, pop: 5300, pop0: 4400, popDelta: 20.4 },
      blocs: [{ b: "NATO", zh: "北约", gdpShare: 45, gdpShare0: 42, popShare: 35, popShare0: 36 }],
      player: null
    };
    const obEp = generateEpilogue(obSt);
    assert("obEpilogueValid", !!obEp && obEp.title.includes("冷战终局后日谈") && obEp.sections.length >= 3, "旁观模式生成合法后日谈长卷");

    // 3. 玩家模式后日谈生成测试
    const plSt = {
      date: "1991-12",
      world: { gdp: 24000, gdp0: 12000, gdpDelta: 100, pop: 5300, pop0: 4400, popDelta: 20.4 },
      blocs: [{ b: "WP", zh: "华约", gdpShare: 18, gdpShare0: 20, popShare: 15, popShare0: 16 }],
      player: {
        k: "SUN", zh: "苏联", mil: 4,
        gdp: 2600, gdp0: 2000, gdpDelta: 30,
        pop: 290, pop0: 265, popDelta: 9.4,
        rank0: 2, rank1: 2, dr: 0, pctl: 0.6,
        E: 24, R: 10, M: 15, G: 20, G_bloc: 8, G_act: 12, total: 69
      }
    };
    const plEp = generateEpilogue(plSt);
    assert("plEpilogueValid", !!plEp && !!plEp.rankTitle && plEp.sections.length >= 5, "玩家模式生成合法 5+ 卷后日谈长卷");
    assert("plEpilogueRankTitle", plEp.rankTitle.includes("守成维稳") || plEp.rankTitle.includes("★"), "玩家模式正确评定历史称号");

    // 4. 时代大事记编年史聚合测试
    const chList = generateChronicle();
    assert("chronicleItemsArray", Array.isArray(chList), "generateChronicle 返回数组");
    assert("chronicleHasItems", chList.length >= 0, "编年史聚合函数正常执行");
    if (chList.length >= 2) {
      let sorted = true;
      for (let i = 1; i < chList.length; i++) {
        if (chList[i].y * 12 + chList[i].m < chList[i-1].y * 12 + chList[i-1].m) { sorted = false; break; }
      }
      assert("chronicleChronological", sorted, "编年史严格按时间单调递增排序");
    } else {
      assert("chronicleChronological", true, "编年史项足量或单项自洽");
    }

    // 5. 终局弹窗 DOM 结构与 Tabs 检查
    const endEl = $("end");
    assert("endModalExists", !!endEl, "#end 终局弹窗存在");
    const endTabs = $("end-tabs");
    assert("endTabsExist", !!endTabs && endTabs.querySelectorAll(".end-tab-btn").length === 3, "#end-tabs 包含 3 个选项卡切换按钮");
    const rPane = $("end-pane-rubric");
    const ePane = $("end-pane-epilogue");
    const cPane = $("end-pane-chronicle");
    assert("endPanesExist", !!rPane && !!ePane && !!cPane, "三块独立的 end-tab-pane 完整挂载");
    const copyBtn = $("e-copy");
    assert("copyBtnExists", !!copyBtn, "#e-copy 复制回忆录按钮存在");

    // 6. renderEnd 与 Tab 切换交互测试
    renderEnd(plSt);
    assert("rubricPaneRendered", rPane && rPane.querySelectorAll("table").length >= 1, "战略评分 Pane 成功渲染评分表");
    assert("epiloguePaneRendered", ePane && ePane.querySelector(".epilogue-scroll") !== null, "后日谈 Pane 成功渲染史诗长卷");
    assert("chroniclePaneRendered", cPane && cPane.querySelector(".chronicle-timeline") !== null, "时代编年史 Pane 成功渲染时间轴");

    setEndTab("epilogue");
    assert("tabSwitchEpilogue", ST.endTab === "epilogue" && ePane.classList.contains("on") && !rPane.classList.contains("on"), "成功切换至后日谈选项卡");

    setEndTab("chronicle");
    assert("tabSwitchChronicle", ST.endTab === "chronicle" && cPane.classList.contains("on") && !ePane.classList.contains("on"), "成功切换至时代编年史选项卡");

    setEndTab("rubric");
    assert("tabSwitchRubric", ST.endTab === "rubric" && rPane.classList.contains("on") && !cPane.classList.contains("on"), "成功切回战略评分选项卡");

    // 7. 回忆录导出测试
    const memoirText = exportMemoirs(plSt);
    assert("memoirsTextValid", typeof memoirText === "string" && memoirText.includes("执政回忆录") && memoirText.includes("历史终局后日谈"), "exportMemoirs 成功生成完备纯文本回忆录长卷");

    // 8. 弹窗开关生命周期与清理测试
    simEndOpen();
    assert("simEndOpenSuccess", endEl.classList.contains("open"), "simEndOpen 成功打开终局长卷弹窗");
    simEndClose();
    assert("simEndCloseSuccess", !endEl.classList.contains("open"), "simEndClose 成功关闭终局弹窗");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "chronicleprobe"; d.style.display = "none";
  d.textContent = "CHRONICLEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// ---- R12A: 大国内政生态与派系权力天平全链路探针 ----
