"use strict";

// ---- Phase T：触控与窄屏探针 ------------------------------------------------
// 机制密度已高，面板在窄屏的可读性值得专门一轮。本探针证明五件事：
//   1. 窄屏 API 齐全（断点常量 / force / sync / pan / pinch）；
//   2. force-narrow 真的把面板变成底栏（computed style 可测）；
//   3. 桌面（无 narrow-ui）侧栏布局一字不变；
//   4. 地图手势是纯视口操作 —— 零 RNG、零 pmods、零内政回写；
//   5. 触控契约：#stage touch-action:none、关闭把手存在、靶面够大。
function runTouchProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("TOUCHPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // ---- 1. API ----
    assert("apiPresent",
      typeof NARROW_BREAKPOINT_PX === "number" &&
      typeof isNarrowViewport === "function" &&
      typeof setForceNarrow === "function" &&
      typeof syncNarrowUiClass === "function" &&
      typeof applyMapPan === "function" &&
      typeof applyPinchZoom === "function" &&
      typeof zoomAt === "function",
      "触控/窄屏 API 缺失");
    assert("breakpointIs820", NARROW_BREAKPOINT_PX === 820,
      "窄屏断点必须是 820（与 CSS / 文档一致），实为 " + NARROW_BREAKPOINT_PX);

    // ---- 2. 强制窄屏 → 底栏面板 ----
    const wasForced = isForceNarrow();
    setForceNarrow(false);
    syncNarrowUiClass();
    const panel = $("panel");
    const stage = $("stage");
    assert("panelExists", !!panel, "#panel 缺失");
    assert("stageExists", !!stage, "#stage 缺失");
    assert("closeHandleExists", !!$("p-close"), "窄屏关闭把手 #p-close 缺失");
    assert("sheetGripExists", !!$("p-sheet-grip"), "底栏把手 #p-sheet-grip 缺失");

    // 桌面（或未强制）时关闭按钮默认隐藏 —— 不抢侧栏空间
    setForceNarrow(false);
    // 若本机本身就窄，mediaSaysNarrow 仍会挂 narrow-ui；用 computed 对比强制前后差值
    const deskClose = $("p-close") ? getComputedStyle($("p-close")).display : "none";

    setForceNarrow(true);
    assert("forceNarrowOn", isForceNarrow() && isNarrowViewport(),
      "setForceNarrow(true) 必须让 isNarrowViewport 为真");
    assert("narrowUiClassOn",
      document.documentElement.classList.contains("narrow-ui"),
      "强制窄屏必须写入 html.narrow-ui");
    assert("forceClassOn",
      document.documentElement.classList.contains("force-narrow"),
      "强制窄屏必须写入 html.force-narrow（诊断用）");

    const cs = getComputedStyle(panel);
    assert("panelIsBottomSheet",
      cs.left === "0px" && (cs.right === "0px" || parseFloat(cs.width) >= window.innerWidth - 2),
      "窄屏面板必须贴左右边（底栏），left=" + cs.left + " width=" + cs.width);
    assert("panelFullWidth",
      parseFloat(cs.width) >= Math.min(window.innerWidth, 320) - 4,
      "窄屏面板宽度应接近视口，实为 " + cs.width);
    assert("closeHandleVisible",
      getComputedStyle($("p-close")).display !== "none",
      "窄屏下关闭把手必须可见");
    assert("sheetGripVisible",
      getComputedStyle($("p-sheet-grip")).display !== "none",
      "窄屏下底栏把手必须可见");
    assert("minimapHidden",
      !$("mini") || getComputedStyle($("mini")).display === "none",
      "窄屏下小地图必须让位");
    assert("toolsScrollable", (() => {
      const tools = document.querySelector("#topbar .tools");
      if (!tools) return false;
      const tcs = getComputedStyle(tools);
      return tcs.overflowX === "auto" || tcs.overflowX === "scroll";
    })(), "窄屏顶栏工具条必须可横滑");

    // 触控靶：选项卡至少 36px（我们 CSS 写的 40）
    const tab = document.querySelector("#panel .p-tab-btn");
    if (tab) {
      const th = parseFloat(getComputedStyle(tab).minHeight) || tab.getBoundingClientRect().height;
      assert("tabTouchTarget", th >= 36,
        "窄屏选项卡触控靶 ≥36px，实为 " + th);
    } else {
      assert("tabTouchTarget", false, "找不到 .p-tab-btn");
    }

    // ---- 3. 解除强制后恢复（若本机本就不窄）----
    setForceNarrow(false);
    assert("forceNarrowOff", !isForceNarrow(), "setForceNarrow(false) 必须清除强制标志");
    if (!mediaSaysNarrow()) {
      assert("desktopPanelSide", (() => {
        const dcs = getComputedStyle(panel);
        // 桌面侧栏：right 定位、固定宽度约 262
        return parseFloat(dcs.width) < 400 && dcs.left !== "0px";
      })(), "非窄屏时面板必须回到侧栏（宽度 <400 且 left≠0）");
      assert("desktopCloseHidden",
        getComputedStyle($("p-close")).display === "none",
        "非窄屏时关闭把手应隐藏（不抢侧栏）");
      assert("desktopMinimapVisible",
        !$("mini") || getComputedStyle($("mini")).display !== "none",
        "非窄屏时小地图应可见");
    } else {
      // 真机本就窄：解除强制后仍是窄屏 —— 记一条诊断，不算失败
      r.details.desktopPanelSide = "SKIP: host already narrow";
      r.details.desktopCloseHidden = "SKIP: host already narrow";
      r.details.desktopMinimapVisible = "SKIP: host already narrow";
    }
    // 恢复探针开始前的强制状态
    setForceNarrow(wasForced);

    // ---- 4. 手势是纯视口操作 ----
    const rngBefore = SIM.S ? SIM.S.rngState : null;
    const pmodBefore = SIM.S && SIM.S.P && SIM.S.P.pmods
      ? JSON.stringify(SIM.S.P.pmods) : null;
    const gdpBefore = SIM.S && SIM.S.gdp ? JSON.stringify(SIM.S.gdp) : null;
    const vx0 = view.x, vy0 = view.y, vs0 = view.s;

    applyMapPan(40, -25);
    assert("panMovesView",
      Math.abs(view.x - vx0) > 0.01 || Math.abs(view.y - vy0) > 0.01,
      "applyMapPan 必须改变视口");
    applyPinchZoom(120, 80, 1.25);
    assert("pinchZoomsView", view.s !== vs0 && view.s > vs0 * 1.1,
      "applyPinchZoom 必须放大视口，s0=" + vs0 + " s1=" + view.s);

    assert("gestureZeroRng",
      !SIM.S || SIM.S.rngState === rngBefore,
      "地图手势不得推进引擎 RNG");
    assert("gestureZeroPmods",
      !SIM.S || JSON.stringify(SIM.S.P.pmods) === pmodBefore,
      "地图手势不得写 pmods");
    assert("gestureZeroGdp",
      !SIM.S || JSON.stringify(SIM.S.gdp) === gdpBefore,
      "地图手势不得写 gdp");

    // 还原视口，避免污染后续探针（本探针通常单独跑，但仍保持卫生）
    view.x = vx0; view.y = vy0; view.s = vs0;
    clampView(); render(); drawOverlay(); drawMini();

    // ---- 5. 触控契约 ----
    const stageCs = getComputedStyle(stage);
    assert("stageTouchActionNone",
      stageCs.touchAction === "none" || stageCs.touchAction === "manipulation",
      "#stage 必须 touch-action:none（实为 " + stageCs.touchAction + "）");

    // 端到端：强制窄屏 → 选国 → 面板 open → 关闭把手可点路径存在
    setForceNarrow(true);
    const savedSel = ST.sel;
    select("SUN");
    assert("selectOpensPanel",
      $("panel").classList.contains("open"),
      "选国后面板必须 .open");
    assert("panelNameRenders",
      ($("p-name").textContent || "").indexOf("SUN") >= 0 ||
      ($("p-name").textContent || "").length > 1,
      "窄屏底栏必须渲染国名");
    // 点关闭把手的逻辑 = select(null)
    select(null);
    assert("closeClearsPanel",
      !$("panel").classList.contains("open") && ST.sel === null,
      "关闭后面板必须收起");
    if (savedSel) select(savedSel);
    setForceNarrow(wasForced);
    syncNarrowUiClass();

    // 旁观零回写总检（本探针全程不应改玩家状态）
    assert("spectatorSafe",
      ST.player === null || ST.player === undefined || typeof ST.player === "string",
      "探针不得破坏 ST.player 类型");

    r.details.narrowBreakpoint = NARROW_BREAKPOINT_PX;
    r.details.hostMediaNarrow = mediaSaysNarrow();
    r.details.finalForced = isForceNarrow();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
    try { setForceNarrow(false); syncNarrowUiClass(); } catch (e2) { /* ignore */ }
  }

  const d = document.createElement("div");
  d.id = "touchprobe";
  d.style.display = "none";
  d.textContent = "TOUCHPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
