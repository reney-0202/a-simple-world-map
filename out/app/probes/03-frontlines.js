"use strict";

// R8A：动态地缘前线全链路无头探针（?flprobe=1）
function runFrontlineProbe() {
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("FLPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    if (ST.mode !== "political") setMode("political");
    // 1. 基准测试：初始状态
    assert("initFlMapEmpty", flMap[1684] === 0, "flMap 初始状态应全为 0");
    assert("initHasFrontlinesFalse", !hasFrontlines, "hasFrontlines 初始应为 false");

    const pr1684 = PM[1684];
    const cx = Math.round(pr1684.cx), cy = Math.round(pr1684.cy);
    const px0 = mctx.getImageData(cx, cy, 1, 1).data;
    const c0Rgb = px0[0] + "," + px0[1] + "," + px0[2];
    r.c0Rgb = c0Rgb;

    // 缩放聚焦至阿瓦士
    view.s = 3;
    view.x = cx - (mapCan.width / view.s) / 2;
    view.y = cy - (mapCan.height / view.s) / 2;
    clampView(); render(); drawMini(); drawOverlay();
    const sigPol0 = mapSig();
    r.sigPol0 = sigPol0;

    // 2. 模拟占领：伊拉克占领胡齐斯坦首府阿瓦士 (#1684 Ahvaz)
    setFrontline(1684, "IRQ", "iran_iraq");
    assert("occupyHasFrontlines", hasFrontlines === true, "setFrontline 后 hasFrontlines 应为 true");
    const irqId = playIdOfKey["IRQ"];
    assert("occupyFlMapMapped", flMap[1684] === irqId, "flMap[1684] 应映射至 IRQ 实体 ID " + irqId);

    // 3. 画布像元与视口重烘断言
    const pxOcc = mctx.getImageData(cx, cy, 1, 1).data;
    const cOccRgb = pxOcc[0] + "," + pxOcc[1] + "," + pxOcc[2];
    r.cOccRgb = cOccRgb;
    assert("pixelColorChanged", cOccRgb !== c0Rgb, "被占领省份像元颜色应发生改变");

    const irqColU32 = tables.political[irqId];
    const expR = irqColU32 & 0xff, expG = (irqColU32 >> 8) & 0xff, expB = (irqColU32 >> 16) & 0xff;
    assert("pixelMatchesOccupier", pxOcc[0] === expR && pxOcc[1] === expG && pxOcc[2] === expB,
      "被占领像元颜色应匹配伊拉克政治色 (" + expR + "," + expG + "," + expB + ")");

    const sigPolOcc = mapSig();
    r.sigPolOcc = sigPolOcc;
    assert("sigChanged", sigPolOcc !== sigPol0, "阿瓦士占领后视口哈希应改变");

    // 4. 阵营模式联动验证
    setMode("bloc");
    const sigBlocOcc = mapSig();
    r.sigBlocOcc = sigBlocOcc;
    setMode("political");

    // 5. 悬浮底栏提示验证
    setHint(1684);
    const hintTxt = $("h-ctry") ? $("h-ctry").textContent : "";
    r.hintTxt = hintTxt;
    assert("hintIncludesOccupier", hintTxt.includes("【交战控制：伊拉克】"),
      "setHint(1684) 文本应包含【交战控制：伊拉克】，实际为：" + hintTxt);

    // 6. 存档/读档往返一致性
    assert("saveOk", simSave().ok, "simSave 应成功执行");

    // 临时篡改清除内存
    setFrontline(1684, null);
    assert("tamperCleared", !hasFrontlines && flMap[1684] === 0, "置空后前线应被清除");

    // 读档还原
    assert("loadOk", simLoad().ok, "simLoad 应成功还原");
    assert("loadHasFrontlines", hasFrontlines === true, "读档后 hasFrontlines 应为 true");
    assert("loadFlObjRestored", ST.frontlines[1684] && ST.frontlines[1684].occupier === "IRQ",
      "读档后 ST.frontlines[1684].occupier 应还原为 IRQ");
    assert("loadFlMapRestored", flMap[1684] === irqId, "读档后 flMap 应恢复为 IRQ 实体 ID");

    const pxLoaded = mctx.getImageData(cx, cy, 1, 1).data;
    assert("loadPixelMatches", pxLoaded[0] === expR && pxLoaded[1] === expG && pxLoaded[2] === expB,
      "读档后像元颜色应与占领态完全一致");

    // 7. 清理并完全重置
    clearFrontlines();
    assert("clearHasFrontlinesFalse", !hasFrontlines, "clearFrontlines 后 hasFrontlines 应为 false");
    assert("clearFlMapZero", flMap[1684] === 0, "clearFrontlines 后 flMap[1684] 应为 0");

    const pxRestored = mctx.getImageData(cx, cy, 1, 1).data;
    const cRestoredRgb = pxRestored[0] + "," + pxRestored[1] + "," + pxRestored[2];
    assert("clearPixelRestored", cRestoredRgb === c0Rgb, "clearFrontlines 后像元颜色应 100% 恢复基准色");

    setHint(1684);
    const hintRestored = $("h-ctry") ? $("h-ctry").textContent : "";
    assert("clearHintRestored", !hintRestored.includes("交战控制"), "清理后底栏提示不应再包含交战控制");

    // 恢复视角
    view.s = view.fit;
    view.x = (W - mapCan.width / view.s) / 2;
    view.y = (H - mapCan.height / view.s) / 2;
    clampView(); render(); drawMini(); drawOverlay();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "flprobe"; d.style.display = "none";
  d.textContent = "FLPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
// R8B：局部战争动态前线全时序探针（?warprobe=1）
function runWarProbe() {
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("WARPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    if (ST.mode !== "political") setMode("political");
    simReset();


  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runWarProbePhase*）。
  const ctx = {};
  runWarProbePhase1(r, assert, ctx);
  runWarProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "warprobe"; d.style.display = "none";
  d.textContent = "WARPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}

// G（收尾评审）：runWarProbe 的阶段一（原样搬运，无逻辑改动）
function runWarProbePhase1(r, assert, ctx) {
  // 1. 战前阶段（1980-08）
  simFastForward(1980, 8);
  assert("t0_hasNoFrontlines", !hasFrontlines, "1980-08 战前应无前线");
  assert("t0_ahvazPeace", !ST.frontlines[1684], "1980-08 阿瓦士应无占领");
  assert("t0_basraPeace", !ST.frontlines[1692], "1980-08 巴士拉应无占领");

  // 2. 两伊战争阶段 1（1980-09 伊拉克入侵胡齐斯坦）
  simFastForward(1980, 9);
  assert("t1_iranIraqP1_active", hasFrontlines === true, "1980-09 两伊战争前线应激活");
  const irqId = playIdOfKey["IRQ"];
  const irnId = playIdOfKey["IRN"];
  assert("t1_ahvazOccupied", ST.frontlines[1684] && ST.frontlines[1684].occupier === "IRQ", "阿瓦士应被伊拉克占领");
  assert("t1_dezfulOccupied", ST.frontlines[1663] && ST.frontlines[1663].occupier === "IRQ", "迪兹富勒应被伊拉克占领");
  assert("t1_ahvazFlMap", flMap[1684] === irqId, "flMap[1684] 应映射至 IRQ");
  setHint(1684);
  assert("t1_ahvazHint", $("h-ctry") && $("h-ctry").textContent.includes("【交战控制：伊拉克】"), "阿瓦士底栏应显示伊拉克控制");

  // 3. 马岛战役爆发（1982-04）
  simFastForward(1982, 4);
  assert("t2_falklandsFoxBay", ST.frontlines[1248] && ST.frontlines[1248].occupier === "ARG", "福克斯湾应被阿根廷占领");
  assert("t2_falklandsStanley", ST.frontlines[1249] && ST.frontlines[1249].occupier === "ARG", "斯坦利应被阿根廷占领");
  assert("t2_ahvazStillIRQ", ST.frontlines[1684] && ST.frontlines[1684].occupier === "IRQ", "阿瓦士此时仍处于伊拉克控制");

  // 4. 两伊战争阶段 2（1982-05 伊朗霍梅尼大反攻，收复胡齐斯坦并推入巴士拉）
  simFastForward(1982, 5);
  assert("t3_ahvazLiberated", !ST.frontlines[1684], "1982-05 阿瓦士应已收复");
  assert("t3_dezfulLiberated", !ST.frontlines[1663], "1982-05 迪兹富勒应已收复");
  assert("t3_basraOccupied", ST.frontlines[1692] && ST.frontlines[1692].occupier === "IRN", "1982-05 巴士拉应被伊朗占领");
  assert("t3_basraFlMap", flMap[1692] === irnId, "flMap[1692] 应映射至 IRN");
  setHint(1692);
  assert("t3_basraHint", $("h-ctry") && $("h-ctry").textContent.includes("【交战控制：伊朗】"), "巴士拉底栏应显示伊朗控制");

  // 5. 马岛战役结束（1982-06 英军收复）
  simFastForward(1982, 6);
  assert("t4_falklandsLiberated", !ST.frontlines[1248] && !ST.frontlines[1249], "1982-06 马岛群岛应已收复回归英国");
  assert("t4_basraStillIRN", ST.frontlines[1692] && ST.frontlines[1692].occupier === "IRN", "巴士拉仍处于伊朗占领中");

  // 6. 存档与读档无损验证（1985-06 战事拉锯中途）
  simFastForward(1985, 6);
  assert("t5_saveOk", simSave().ok, "1985-06 simSave 应成功");
  clearFrontlines();
  assert("t5_tamperCleared", !hasFrontlines, "清空后应无前线");
  assert("t5_loadOk", simLoad().ok, "simLoad 应成功");
  assert("t5_basraRestored", ST.frontlines[1692] && ST.frontlines[1692].occupier === "IRN", "读档后巴士拉战线应准确还原");
  assert("t5_flMapRestored", flMap[1692] === irnId, "读档后 flMap 应恢复为 IRN");

  // 7. 两伊战争阶段 3（1988-08 联合国 598 号决议停火，边界复原）
  simFastForward(1988, 8);
  assert("t6_basraCeasefire", !ST.frontlines[1692], "1988-08 巴士拉应归还伊拉克，两伊战线全部清空");
  assert("t6_allQuiet1988", !hasFrontlines, "1988-08 后应全图无战线");

  // 8. 海湾危机（1990-08 伊拉克吞并科威特）
  simFastForward(1990, 8);
  assert("t7_kuwaitOccupied", ST.frontlines[1809] && ST.frontlines[1809].occupier === "IRQ", "1990-08 科威特城应被伊拉克占领");
  assert("t7_kuwaitFlMap", flMap[1809] === irqId, "flMap[1809] 应映射至 IRQ");
  setHint(1809);
  assert("t7_kuwaitHint", $("h-ctry") && $("h-ctry").textContent.includes("【交战控制：伊拉克】"), "科威特城底栏应显示伊拉克控制");
}

// G（收尾评审）：runWarProbe 的阶段二（原样搬运，无逻辑改动）
function runWarProbePhase2(r, assert, ctx) {
  // 9. 沙漠风暴收复（1991-03）
  simFastForward(1991, 3);
  assert("t8_kuwaitLiberated", !ST.frontlines[1809], "1991-03 科威特应已光复");
  assert("t8_allQuiet1991", !hasFrontlines, "1991-03 后全图恢复和平");

  // 10. 架空十字路口分歧验证（选择克制 choice=cr_gulf:1 时，两伊战线完全不触发）
  simReset();
  const crGulf = CR.list.find((x) => x.id === "cr_gulf");
  assert("t9_crGulfFound", !!crGulf, "应找到 cr_gulf 十字路口");
  if (crGulf) {
    crDecide(crGulf, 1);   // 选择 1：克制
    simFastForward(1980, 9);
    assert("t9_crRestraint_noAhvaz", !ST.frontlines[1684], "选择克制后 1980-09 阿瓦士不应被占领");
    assert("t9_crRestraint_noDezful", !ST.frontlines[1663], "选择克制后 1980-09 迪兹富勒不应被占领");
    assert("t9_crRestraint_noFrontlines", !hasFrontlines, "选择克制后全图应无前线");
  }

  // 11. 阶段 3 因果验证 A：USA 全面军援伊拉克（阻止巴士拉沦陷）
  simReset();
  ST.aid = []; ST.sanctions = [];
  ST.player = "USA";
  decSet("aid", "IRQ", 2); // 全面军援伊拉克
  simFastForward(1982, 5); // 史实伊朗反攻月份
  assert("t11_aidIRQ_ahvazStillIRQ", ST.frontlines[1684] && ST.frontlines[1684].occupier === "IRQ", "军援伊拉克后阿瓦士守军延后坚守");
  assert("t11_aidIRQ_basraSafe", !ST.frontlines[1692], "军援伊拉克后巴士拉防线固若金汤未沦陷");
  select("IRQ");
  const wb1 = $("p-war-box");
  assert("t11_warBox_aidIRQ", wb1 && wb1.style.display !== "none" && wb1.textContent.includes("获得你的军事外援"), "IRQ战区面板应显示获得军援强化");

  // 12. 阶段 3 因果验证 B：USA 全面军援伊朗（助推提前大反攻与提前停火）
  simReset();
  ST.aid = []; ST.sanctions = [];
  ST.player = "USA";
  decSet("aid", "IRN", 2); // 全面军援伊朗
  simFastForward(1981, 9); // 比史实提前8个月
  assert("t12_aidIRN_earlyCounterBasra", ST.frontlines[1692] && ST.frontlines[1692].occupier === "IRN", "军援伊朗后1981-09提前攻占巴士拉");
  assert("t12_aidIRN_ahvazLiberated", !ST.frontlines[1684], "军援伊朗后阿瓦士提前光复");
  simFastForward(1986, 8); // 提前2年停火
  assert("t12_aidIRN_earlyCeasefire", !ST.frontlines[1692], "军援伊朗后1986-08提前停火归还巴士拉");

  // 13. 阶段 3 因果验证 C：USA 全面军援阿根廷（马岛战事长期化坚守）
  simReset();
  ST.aid = []; ST.sanctions = [];
  ST.player = "USA";
  decSet("aid", "ARG", 2); // 全面军援阿根廷
  simFastForward(1982, 7); // 史实英军已光复后1个月
  assert("t13_aidARG_falklandsHeld", ST.frontlines[1248] && ST.frontlines[1248].occupier === "ARG", "军援阿根廷后马岛持续被阿军坚守");

  // 14. 阶段 3 因果验证 D：USA 全面军援科威特（提前光复科威特）
  simReset();
  ST.aid = []; ST.sanctions = [];
  ST.player = "USA";
  decSet("aid", "KWT", 2); // 全面军援科威特
  simFastForward(1990, 8); // 沦陷当月
  assert("t14_gulf_kuwaitInvaded", ST.frontlines[1809] && ST.frontlines[1809].occupier === "IRQ", "1990-08 科威特仍按时被入侵");
  simFastForward(1990, 11); // 提前光复
  assert("t14_aidKWT_earlyLiberated", !ST.frontlines[1809], "军援科威特后1990-11提前光复");

  // 15. 阶段 3 因果验证 E：USA 全面军援伊拉克庇护萨达姆（科威特未能光复）
  simReset();
  ST.aid = []; ST.sanctions = [];
  ST.player = "USA";
  decSet("aid", "IRQ", 2); // 全面军援伊拉克
  simFastForward(1991, 4); // 史实沙漠风暴后1个月
  assert("t15_aidIRQ_gulfSheltered", ST.frontlines[1809] && ST.frontlines[1809].occupier === "IRQ", "全面军援伊拉克后多国部队受阻，科威特未被光复");

  // 16. 阶段 3 因果验证 F：面板关闭与干净重置
  select(null);
  const wb2 = $("p-war-box");
  assert("t16_warBoxHiddenOnClose", wb2 && wb2.style.display === "none", "取消选中国家后战区面板应隐藏");

  // 收尾完全重置回 1980-01 基准
  ST.aid = []; ST.sanctions = [];
  simReset();
  ST.player = null;
  assert("t17_finalResetClean", !hasFrontlines && ST.aid.length === 0, "最终重置后应无活动战线且决策清空");
}


// 经济系统阶段 1：战略资源探针（54 实体覆盖、冷战四大标杆资源特征、模式 7 渲染哈希、面板展示与隐藏）
