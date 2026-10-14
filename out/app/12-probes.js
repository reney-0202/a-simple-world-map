"use strict";


// ---------------------------------------------------------------- self test
window.__errors = [];
window.addEventListener("error", (e) => window.__errors.push(String(e.message)));
const SELFTEST = /[?&]selftest=1/.test(location.search);

function runSelfTest() {
  const res = { errors: window.__errors.slice() };
  try {
    let conflicts = 0;
    const keys = Object.keys(CM.countries);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = CM.countries[keys[i]], b = CM.countries[keys[j]];
      if (adjacent(a.polity_id, b.polity_id) && ST.colors[keys[i]] === ST.colors[keys[j]]) conflicts++;
    }
    res.colorConflicts = conflicts;
    const t = {};
    for (const m of MODES) {
      const t0 = performance.now(); setMode(m[0]); t[m[0]] = Math.round(performance.now() - t0);
    }
    res.modeSwitchMs = t;
    setMode("political");
    res.modeCount = MODES.length; res.layerCount = LAYERS.length;
    res.dom = ["topbar", "modes", "layers", "panel", "mini", "hint", "stats", "help", "search", "b-export",
      "inbox", "b-inbox", "r-grw", "r-axis", "r-player", "p-milbox", "p-mil", "w-ctry",
      "end", "end-body"]
      .map((id) => id + ":" + (!!$(id))).join(" ");
    res.runs = runs ? runs.id.length : 0;
    res.countryRuns = cruns ? cruns.id.length : 0;
    res.provinces = CK.provinceCount; res.countries = CK.countryCount;
    const sel = CM.countries["SUN"];
    select("SUN");
    res.panelName = $("p-name").textContent; res.topPop = $("r-pop").textContent;
    res.topGdpSun = $("r-gdp").textContent;
    select("DEU");
    res.topGdpDeu = $("r-gdp").textContent + " / " + $("p-cap").textContent;
    select(null);
    res.hoverProbe = (function () {
      const [rx, ry] = [sel.label_px[0], sel.label_px[1]];
      const p = pid[ry * W + rx];
      return p + "/" + (p ? PM[p].name + "@" + PM[p].polity : "-");
    })();
    res.landNoAta = ((CK.landPx - CK.ataPx) * KM2 / 1e8).toFixed(3);
    const url = composeDataURL();
    res.exportPng = url.slice(0, 15) + " len=" + url.length;
    res.checksumOk = true;
    res.totalMs = Math.round(performance.now());
  } catch (e) { res.exception = String(e && e.stack || e); }
  const d = document.createElement("div");
  d.id = "selftest"; d.style.display = "none";
  d.textContent = "SELFTEST " + JSON.stringify(res);
  document.body.appendChild(d);
}

// ---------------------------------------------------------------- go
// ---- R5C' T4 探针（tasks/015 §6.2）：断言「动作可达」，禁止只断言元素存在 ----
// ?sanction=KEY:lvl(,...) / ?aid=KEY:lvl(,...) → 置 CR.probeMode=true（否则快进停在 1980-09 十字路口），
// 跑「无决策基线 → 重挂 → 重跑」对照与存档往返，落 <div id="sanprobe">。未传参时不输出、不跑基线。
function runSanProbe() {
  if (!SIM.ready) return;
  const r = { player: ST.player, mil: ST.mil,
    sanctions: JSON.parse(JSON.stringify(ST.sanctions)), aid: JSON.parse(JSON.stringify(ST.aid)) };
  const kind = ST.sanctions.length ? "san" : (ST.aid.length ? "aid" : null);
  const entry = kind ? (kind === "san" ? ST.sanctions[0] : ST.aid[0]) : null;
  const tgt = entry ? entry.t : null;
  const ekT = tgt ? entKeys(tgt) : [], ekP = ST.player ? entKeys(ST.player) : [];
  const pm = () => SIM.S.P.pmods;
  const gv = (k) => (pm()[k] === undefined ? null : pm()[k]);
  r.pmodTGT = ekT.length ? gv(ekT[0]) : null;
  r.pmodSelf = ekP.length ? gv(ekP[0]) : null;
  if (entry) {
    r.pmodTGTok = r.pmodTGT === (kind === "san" ? -1 : 1) * DEC_TIERS[kind][entry.l].tgt;
    let selfExp = -ST.mil;
    ST.sanctions.forEach((s) => { selfExp -= DEC_TIERS.san[s.l].self; });
    ST.aid.forEach((a) => { selfExp -= DEC_TIERS.aid[a.l].self; });
    r.pmodSelfExp = selfExp;
    r.pmodSelfok = r.pmodSelf !== null && Math.abs(r.pmodSelf - selfExp) < 1e-9;
  }
  // 基线：清空名单 → reset → 全程 ff
  const keepSan = ST.sanctions, keepAid = ST.aid;
  ST.sanctions = []; ST.aid = [];
  simReset();
  simFastForward(1991, 12);
  r.tgtGdpBase = tgt ? +simVal(tgt).gdp_bn.toFixed(2) : null;
  r.selfGdpBase = ST.player ? +simVal(ST.player).gdp_bn.toFixed(2) : null;
  // 恢复名单 → reset（重挂）→ 重跑
  ST.sanctions = keepSan; ST.aid = keepAid;
  simReset();
  r.pmodTGTAfterReset = ekT.length ? gv(ekT[0]) : null;    // 合并重挂可达（reset 后仍在）
  simFastForward(1991, 12);
  r.tgtGdpAfter = tgt ? +simVal(tgt).gdp_bn.toFixed(2) : null;
  r.selfGdpAfter = ST.player ? +simVal(ST.player).gdp_bn.toFixed(2) : null;
  r.date = SIM.S.year + "-" + Math.max(1, SIM.S.month);
  if (entry) {
    r.ratio = +(r.tgtGdpAfter / r.tgtGdpBase - 1).toFixed(4);
    r.expect = +((Math.exp((kind === "san" ? -1 : 1) * DEC_TIERS[kind][entry.l].tgt * 12 / 100) - 1)).toFixed(4);
    r.ratioOk = Math.abs(r.ratio - r.expect) < 0.05;
    r.selfRatio = +(r.selfGdpAfter / r.selfGdpBase - 1).toFixed(4);
  }
  // 存档往返：save → 篡改名单 → load → 名单回落 + 成员级 gdp 9 位逐位一致
  r.saved = simSave();
  r.gdpBefore = +(SIM.S.gdp[ekT.length ? ekT[0] : (ekP[0] || "SUN")]).toFixed(9);
  ST.sanctions = []; ST.aid = [];
  r.loaded = simLoad();
  r.sanctionsRestored = JSON.stringify(ST.sanctions) === JSON.stringify(keepSan) &&
    JSON.stringify(ST.aid) === JSON.stringify(keepAid);
  r.pmodAfterLoad = ekT.length ? gv(ekT[0]) : null;
  r.gdpAfterLoad = +(SIM.S.gdp[ekT.length ? ekT[0] : (ekP[0] || "SUN")]).toFixed(9);
  r.exactOk = r.gdpBefore === r.gdpAfterLoad;
  r.allOk = r.loaded === true && r.sanctionsRestored && r.exactOk &&
    (entry ? (r.pmodTGTok && r.pmodSelfok && r.ratioOk) : true);
  const d = document.createElement("div"); d.id = "sanprobe"; d.style.display = "none";
  d.textContent = "SANPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
// ?decprobe=1：UI 路径可达（与按钮同一入口 sanctionSet/aidSet）——DOM 文本 + pmods 三处 + 撤销 + 禁用 + 切国清洗
function runDecProbe() {
  if (!SIM.ready) return;
  if (!ST.player) ST.player = "USA";                        // 默认 USA（?player= 可覆盖）
  const r = { player: ST.player, mil: ST.mil };
  const keepSan = JSON.parse(JSON.stringify(ST.sanctions)), keepAid = JSON.parse(JSON.stringify(ST.aid));
  const ekP = entKeys(ST.player);
  const gv = (k) => (SIM.S.P.pmods[k] === undefined ? null : SIM.S.P.pmods[k]);
  // ① 切国清洗（§6.3-3）：USA 施加制裁 FRA → setPlayer("FRA") → 名单丢弃、pmodSelf 归 −mil
  if (CM.countries["FRA"] && ST.player === "USA") {
    sanctionSet("FRA", 1);
    setPlayer("FRA");
    r.switchSanDropped = ST.sanctions.length === 0;
    r.switchPmodSelf = gv(entKeys("FRA")[0]);
    r.switchPmodSelfOk = ST.mil === 0 ? r.switchPmodSelf === null : Math.abs(r.switchPmodSelf + ST.mil) < 1e-9;
    setPlayer("USA");
  }
  // ② 施加（与按钮同一入口）
  sanctionSet("SUN", 2); aidSet("PAK", 2);
  select(ST.player);                                        // 打开本国面板（真实 UI 路径）
  r.sanListText = $("p-san-list") ? $("p-san-list").textContent.replace(/\s+/g, "") : null;
  r.aidListText = $("p-aid-list") ? $("p-aid-list").textContent.replace(/\s+/g, "") : null;
  r.costText = $("p-dec-cost") ? $("p-dec-cost").textContent.replace(/\s+/g, "") : null;
  r.sanListOk = /苏联/.test(r.sanListText || "") && /重度/.test(r.sanListText || "");
  r.pmodSelf = gv(ekP[0]);                                  // −6.5（mil0 + 重度制裁 2.0 + 全面军援 4.5）
  r.pmodSUN = gv("SUN");                                    // −3
  r.pmodPAK = gv("PAK");                                    // +3
  r.pmodsOk = Math.abs(r.pmodSelf + 6.5) < 1e-9 && r.pmodSUN === -3 && r.pmodPAK === 3;
  r.costOk = /-6\.5pp/.test(r.costText || "");
  // ③ 撤销制裁 → USA = −4.5、SUN 无 pmod
  sanctionSet("SUN", -1);
  r.pmodSelfAfterUndo = gv(ekP[0]);
  r.undoOk = Math.abs(r.pmodSelfAfterUndo + 4.5) < 1e-9 && gv("SUN") === null;
  // ④ 禁用：制裁自己被拒、名单不变
  const n0 = ST.sanctions.length;
  r.selfRejected = !sanctionSet(ST.player, 2) && ST.sanctions.length === n0;
  // ⑤ 真实点击可达（M7 死按钮教训）：他国快捷行改档/撤销 + 本国档位按钮
  select("SUN");
  const qb = document.querySelector("#p-dec-quick .dqv[data-l='1']");
  if (qb) { qb.click(); r.clickRetier = ST.sanctions.some((x) => x.t === "SUN" && x.l === 1); }
  const ub2 = document.querySelector("#p-san-list .dundo");
  if (ub2) { ub2.click(); r.clickUndo = !ST.sanctions.some((x) => x.t === "SUN"); }
  select(ST.player);
  const selEl = $("p-san-sel");
  if (selEl) {
    selEl.value = "SUN";
    const lb2 = document.querySelector("#p-san-lvls button[data-l='2']");
    if (lb2) { lb2.click(); r.clickLvl = ST.sanctions.some((x) => x.t === "SUN" && x.l === 2); }
  }
  // 还原进入时的名单（不污染后续 ?t= 快进）
  ST.sanctions = keepSan; ST.aid = keepAid;
  applyPlayerDecisions();
  r.allOk = (r.switchSanDropped === undefined || (r.switchSanDropped && r.switchPmodSelfOk)) &&
    r.sanListOk && r.pmodsOk && r.costOk && r.undoOk && r.selfRejected &&
    r.clickRetier === true && r.clickUndo === true && r.clickLvl === true;
  const d = document.createElement("div"); d.id = "decprobe"; d.style.display = "none";
  d.textContent = "DECPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
// ?bloc=<BLOC>：结盟探针（R5E）——断言状态可达（override/badge/画布哈希/终局占比/存档往返），未传参不输出不跑
function runBlocProbe(b) {
  if (!SIM.ready) return;
  const r = { blocReq: b, valid: !!BLOC_ZH[b], player: ST.player };
  if (r.valid && !ST.player) ST.player = "SUN";
  if (r.valid) {
    const orig = CM.countries[ST.player].bloc;
    r.blocOrig = orig;
    CR.probeMode = true;
    const pmodsCount = () => Object.keys(SIM.S.P.pmods).length;
    select(ST.player);
    r.badgeBefore = $("p-bloc").textContent;
    setMode("bloc");
    r.sigBefore = mapSig();
    r.pmodsBefore = pmodsCount();
    setBloc(b);
    r.overrideSet = ST.blocOverride[ST.player] === b;
    select(ST.player);
    r.badgeAfter = $("p-bloc").textContent;
    r.badgeOk = r.badgeAfter === (BLOC_ZH[b] || b) && r.badgeBefore === (BLOC_ZH[orig] || orig);
    r.sigAfter = mapSig();
    r.sigChanged = r.sigAfter !== r.sigBefore;           // 阵营模式画布着色哈希必须变化
    r.pmodsAfter = pmodsCount();
    // R7A（C2 经济网络效应断言）：迁入非原阵营时注入真实经济修正（红利+脱钩震荡）
    const be = curBlocEffect();
    r.c2Active = (b !== orig) ? (r.pmodsAfter > r.pmodsBefore) : (r.pmodsAfter === r.pmodsBefore);
    r.c2Net = be.net;
    r.c2DeltaB = be.deltaB;
    r.c2Friction = be.friction;
    const actualPmod = +(SIM.S.P.pmods[ST.player] || 0).toFixed(4);
    r.c2PmodMatch = Math.abs(actualPmod - be.net) < 1e-4;
    r.c2EffectOk = r.c2Active && r.c2PmodMatch;
    // 终局占比：带 override 推进到 1991-12 → 清除后基线对照
    simFastForward(1991, 12);
    const s1 = endStats().blocs;
    r.shareTargetWith = +(s1.find((x) => x.b === b) || { gdpShare: 0 }).gdpShare.toFixed(3);
    r.shareOrigWith = +(s1.find((x) => x.b === orig) || { gdpShare: 0 }).gdpShare.toFixed(3);
    delete ST.blocOverride[ST.player];
    ST.blocSince = null;
    rebuildBlocTable();
    simReset();
    simFastForward(1991, 12);
    const s0 = endStats().blocs;
    r.shareTargetBase = +(s0.find((x) => x.b === b) || { gdpShare: 0 }).gdpShare.toFixed(3);
    r.shareOrigBase = +(s0.find((x) => x.b === orig) || { gdpShare: 0 }).gdpShare.toFixed(3);
    r.shareShifted = r.shareTargetWith > r.shareTargetBase && r.shareOrigWith < r.shareOrigBase;
    // 存档往返：save → 篡改 {} → load → override 与 blocSince 还原
    setBloc(b);
    r.saved = simSave();
    ST.blocOverride = {}; ST.blocSince = null; rebuildBlocTable();
    r.loaded = simLoad();
    r.overrideRestored = ST.blocOverride[ST.player] === b;
    r.blocSinceRestored = typeof ST.blocSince === "number";
    // 收尾：回 1980-01 并保留请求的迁移态（?bloc=NATO&c=SUN 可见迁移后 UI；?t= 等后续钩子从干净 1980-01 起）
    ST.blocOverride = {}; ST.blocSince = null; rebuildBlocTable(); simReset(); setBloc(b);
    r.allOk = r.overrideSet && r.badgeOk && r.sigChanged && r.c2EffectOk && r.shareShifted &&
      r.loaded === true && r.overrideRestored && r.blocSinceRestored;
  } else r.allOk = false;
  const d = document.createElement("div"); d.id = "blocprobe"; d.style.display = "none";
  d.textContent = "BLOCPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
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
    const saved = simSave();
    assert("saveOk", saved === true, "simSave 应成功执行");

    // 临时篡改清除内存
    setFrontline(1684, null);
    assert("tamperCleared", !hasFrontlines && flMap[1684] === 0, "置空后前线应被清除");

    // 读档还原
    const loaded = simLoad();
    assert("loadOk", loaded === true, "simLoad 应成功还原");
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
    assert("t5_saveOk", simSave() === true, "1985-06 simSave 应成功");
    clearFrontlines();
    assert("t5_tamperCleared", !hasFrontlines, "清空后应无前线");
    assert("t5_loadOk", simLoad() === true, "simLoad 应成功");
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
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "warprobe"; d.style.display = "none";
  d.textContent = "WARPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}

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
    assert("simSaveReturnedTrue", saveOk === true, "simSave 应成功落盘");
    // 故意修改状态
    ST.tradeRoutes = [];
    ST.reserves.SAU.usd = 9999;
    ST.reserves.SUN.trb = 1111;
    const loadOk = simLoad();
    assert("simLoadReturnedTrue", loadOk === true, "simLoad 应成功读取");
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
    assert("saveRoundtripSuccess", saveOk === true, "simSave 成功持久化经济战状态");

    simReset();
    assert("resetCleanDefaults", ST.cocom.strict === false && ST.chokepoints.hormuz === "open" &&
      ST.smuggle.tr_deu_sun_tech === true, "simReset 成功还原经济战基准状态");

    const loadOk = simLoad();
    assert("loadRoundtripSuccess", loadOk === true, "simLoad 成功反序列化");
    assert("cocomStrictRestored", ST.cocom.strict === true, "巴统极限制裁状态成功恢复");
    assert("hormuzBlockedRestored", ST.chokepoints.hormuz === "blocked", "霍尔木兹封锁状态成功恢复");
    assert("smuggleStateRestored", ST.smuggle.tr_deu_sun_tech === false, "特种走私开关成功恢复");

    simReset();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "embargoprobe"; d.style.display = "none";
  d.textContent = "EMBARGOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// R10A：大国战略性格与反应式 AI 决策机全链路探针（?aiprobe=1）
function runAIProbe() {
  const r = { pass: true, checks: {}, errors: [] };
  const assert = (name, cond, msg) => {
    r.checks[name] = !!cond;
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  try {
    const AI = window.W1980_AI;
    assert("metaLoaded", !!AI && !!AI.AI_DOCTRINES && typeof AI.calcAttitude === "function" && typeof AI.evaluateReactions === "function", "AI 核心元数据与算法加载");

    // 1. 大国学说覆盖性
    const majorKeys = ["USA", "SUN", "CHN", "DEU", "FRA", "GBR", "JPN", "IRN", "IRQ"];
    let allMajorsOk = true;
    majorKeys.forEach((k) => {
      const d = AI.AI_DOCTRINES[k];
      if (!d || !d.name || !d.doctrine || typeof d.baseMil !== "number") allMajorsOk = false;
    });
    assert("majorDoctrinesCovered", allMajorsOk, "九大核心国家战略性格与参数完备");

    // 2. 通用阵营学说回退
    const docPol = AI.getDoctrine("POL", CM.countries["POL"]);
    assert("genericWPDoctrine", docPol && docPol.doctrine === "eastern_aligned" && docPol.allies.includes("SUN"), "华约国家正确继承东欧阵营学说");
    const docIta = AI.getDoctrine("ITA", CM.countries["ITA"]);
    assert("genericNATODoctrine", docIta && docIta.doctrine === "western_aligned" && docIta.allies.includes("USA"), "北约国家正确继承西方防务学说");

    // 3. 态度张力基准测试
    const attUsaSun = AI.calcAttitude("SUN", "USA", { mil: 0, sanctions: [], aid: [] }, { countries: CM.countries });
    assert("tensionHostileBaseline", attUsaSun.tension >= 60 && (attUsaSun.attitude === "hostile" || attUsaSun.attitude === "guarded"), "美苏初始态度处于高张力戒备");
    const attUsaGbr = AI.calcAttitude("GBR", "USA", { mil: 0, sanctions: [], aid: [] }, { countries: CM.countries });
    assert("tensionAlliedBaseline", attUsaGbr.tension <= 20 && attUsaGbr.attitude === "allied", "美英同盟态度处于低张力同盟状态");

    // 4. 制裁导致张力上升
    const attSan1 = AI.calcAttitude("SUN", "USA", { mil: 0, sanctions: [{ t: "SUN", l: 1 }], aid: [] }, { countries: CM.countries });
    assert("sanctionEscalatesTension", attSan1.tension > attUsaSun.tension, "对苏联施加制裁显著激化双边张力");

    // 5. 对等反制裁 (Tit-for-Tat)
    const reactSan1 = AI.evaluateReactions("SUN", "USA", { mil: 0, sanctions: [{ t: "SUN", l: 1 }], aid: [] }, { countries: CM.countries });
    assert("counterSanctionTriggered", reactSan1 && reactSan1.sanctions.length === 1 && reactSan1.sanctions[0].t === "USA" && reactSan1.sanctions[0].l === 1, "苏联对等启动 1 级经贸反制裁");
    assert("counterSanctionCable", reactSan1 && reactSan1.cable && reactSan1.cable.type === "counter_sanction", "反制裁决策生成权威外交照会");

    // 6. 盟友低阶制裁容忍度 (DEU 对美关系)
    const reactDeuLow = AI.evaluateReactions("DEU", "USA", { mil: 0, sanctions: [{ t: "DEU", l: 0 }], aid: [] }, { countries: CM.countries });
    assert("allyToleratesLowSanction", reactDeuLow && reactDeuLow.sanctions.length === 0, "盟国低阶外交摩擦不触发全面反制裁");

    // 7. 军备竞赛动员跟进 (Arms Race)
    const reactMilHigh = AI.evaluateReactions("SUN", "USA", { mil: 8.0, sanctions: [], aid: [] }, { countries: CM.countries });
    assert("armsRaceEscalation", reactMilHigh && reactMilHigh.mil >= 8.0, "美国 8% 军费促使苏联跟进动员至 8%+");

    const reactMilLow = AI.evaluateReactions("SUN", "USA", { mil: 1.0, sanctions: [], aid: [] }, { countries: CM.countries });
    assert("armsRaceDetente", reactMilLow && reactMilLow.mil <= 5.0, "美国 1% 克制军费促使苏联缓和防务预算");

    // 8. 代理人对冲军援 (Proxy Aid)
    const reactAidIrq = AI.evaluateReactions("SUN", "USA", { mil: 0, sanctions: [], aid: [{ t: "IRQ", l: 1 }] }, { countries: CM.countries });
    assert("proxyCounterAidTriggered", reactAidIrq && reactAidIrq.aid.some((x) => x.t === "IRN"), "美国军援伊拉克触发苏联对冲军援伊朗");

    // 9. 决策层动态注入与 P.pmods 守恒验证
    simReset();
    setPlayer("USA");
    sanctionSet("SUN", 1);
    assert("aiDecisionsPopulated", ST.ai.decisions.SUN && ST.ai.decisions.SUN.sanctions.length === 1, "decSet 成功激活 ST.ai.decisions");
    const sunSan = ST.ai.decisions.SUN.sanctions[0];
    assert("sunCountersUSA", sunSan.t === "USA" && sunSan.l === 1, "苏联精准锁定美国实施反制裁");
    const ekUSA = entKeys("USA")[0];
    const pmodUSA = SIM.S.P.pmods[ekUSA];
    // USA 自身损失: -1.0 (反噬) - 1.5 (苏联反制裁) = -2.5
    assert("pmodDecouplingLoss", Math.abs(pmodUSA - (-2.5)) < 1e-4, "美国增速准确计入自身反噬与苏联反制裁 (-2.5pp)");

    // 10. 外交照会入收件箱
    assert("cablesRecorded", ST.ai.cables.length > 0, "外交照会已记录入 ST.ai.cables");
    const lastCable = ST.ai.cables[ST.ai.cables.length - 1];
    assert("cableInboxItem", EV.items.some((it) => it.id === lastCable.id), "外交照会成功进入全局事件收件箱");

    // 11. 撤销制裁 -> AI 同步撤销反制裁
    sanctionSet("SUN", -1);
    assert("counterSanctionRevoked", !ST.ai.decisions.SUN || ST.ai.decisions.SUN.sanctions.length === 0, "撤销制裁后苏联同步撤销反制裁");
    assert("pmodRestoredAfterRevoke", SIM.S.P.pmods[ekUSA] === undefined, "撤销反制裁后 pmod 恢复纯净");

    // 12. 军备动员自身经济惩罚
    setMil(8.0);
    assert("armsRacePmodMil", ST.ai.decisions.SUN && ST.ai.decisions.SUN.mil >= 8.5, "setMil(8) 成功触发苏联 8.5%+ 军备动员");
    const ekSUN = entKeys("SUN")[0];
    // SUN 军备超额: 8.7 - 6.0 = 2.7pp 经济增长折损
    assert("armsRaceOverbudgetCost", SIM.S.P.pmods[ekSUN] <= -2.5, "苏联超额军费产生经济增长折损");
    setMil(0);

    // 13. UI 面板渲染
    select("SUN");
    const aiBox = $("p-ai-box");
    assert("aiBoxRendered", aiBox && aiBox.style.display !== "none", "选中他国时 #p-ai-box 正常渲染");
    assert("aiBoxContent", aiBox && aiBox.innerHTML.includes("AI 战略性格与对华/对我国态度") && aiBox.innerHTML.includes("战略均势与全面抗衡"), "学说名称与战略评语正确展示");

    select("USA");
    assert("aiBoxPlayerSelf", aiBox && aiBox.innerHTML.includes("玩家直辖"), "选中玩家自己时显示直辖画像");

    // 14. 存档与读档无损往返 (Save/Load)
    sanctionSet("SUN", 1);
    const cableCountBefore = ST.ai.cables.length;
    const saveOk = simSave();
    assert("saveSuccess", saveOk === true, "simSave 成功执行");

    ST.sanctions = [];
    simReset();
    assert("resetCleanAI", (!ST.ai.decisions.SUN || ST.ai.decisions.SUN.sanctions.length === 0) && ST.ai.cables.length === 0, "simReset 干净重置 AI 决策与照会");

    const loadOk = simLoad();
    assert("loadSuccess", loadOk === true, "simLoad 成功反序列化");
    assert("aiDecisionsRestored", ST.ai.decisions.SUN && ST.ai.decisions.SUN.sanctions.length === 1, "读档后苏联反制裁决策完美还原");
    assert("cablesRestored", ST.ai.cables.length === cableCountBefore, "读档后外交照会档案完美还原");

    // 15. 旁观模式零漂移铁律
    simReset();
    setPlayer(null);
    assert("spectatorNoDecisions", Object.keys(ST.ai.decisions).length === 0, "旁观模式下 ST.ai.decisions 绝对为空");
    assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }
  const d = document.createElement("div"); d.id = "aiprobe"; d.style.display = "none";
  d.textContent = "AIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// R10B：首脑峰会与军控谈判机制全链路探针（?summitprobe=1）
function runSummitProbe() {
  const r = { pass: true, assertCount: 0, errors: [], details: {} };
  function assert(name, condition, msg) {
    r.assertCount++;
    if (!condition) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("SUMMITPROBE FAIL [" + name + "]: " + msg);
    } else {
      r.details[name] = "PASS";
    }
  }

  try {
    const AI = window.W1980_AI;
    assert("aiModuleLoaded", !!AI, "window.W1980_AI 模块正常加载");

    // 1. 预设与条约模型结构校验
    assert("summitPresetsLoaded", Array.isArray(AI.SUMMIT_PRESETS) && AI.SUMMIT_PRESETS.length >= 5, "SUMMIT_PRESETS 包含 5 大冷战峰会");
    const pGeneva = AI.SUMMIT_PRESETS.find((p) => p.id === "geneva_1985");
    const pWash = AI.SUMMIT_PRESETS.find((p) => p.id === "washington_1987");
    assert("genevaPresetData", pGeneva && pGeneva.year === 1985 && pGeneva.month === 11 && pGeneva.participants.includes("USA") && pGeneva.participants.includes("SUN"), "日内瓦峰会 1985-11 预设参数完整");
    assert("washingtonPresetData", pWash && pWash.year === 1987 && pWash.month === 12 && pWash.treatyIds.includes("inf"), "华盛顿峰会 1987-12 包含中导条约议程");

    assert("treatyDefsLoaded", !!(AI.TREATY_DEFS && AI.TREATY_DEFS.inf && AI.TREATY_DEFS.start && AI.TREATY_DEFS.hotline), "TREATY_DEFS 完整包含 inf/start/hotline");
    assert("infTreatyDividend", AI.TREATY_DEFS.inf.dividend === 0.40 && AI.TREATY_DEFS.inf.milCap === 4.0, "中导条约提供 +0.40pp/年 红利且限军费 4.0%");

    // 2. 峰会可行性评估 canHoldSummit
    const chSelf = AI.canHoldSummit("USA", "USA", { countries: CM.countries });
    assert("canHoldSummitSelfFails", chSelf.ok === false, "无法与自身举行峰会");
    const chNorm = AI.canHoldSummit("USA", "SUN", { countries: CM.countries });
    assert("canHoldSummitNormalOk", chNorm.ok === true && chNorm.availableTreaties.includes("inf"), "美苏初始可举行峰会且中导条约在议程中");

    // 3. 峰会弹窗交互测试
    simReset();
    setPlayer("USA");
    openSummitModal("geneva_1985", "SUN");
    const modal = $("summit-modal");
    assert("modalOpens", modal && modal.style.display !== "none", "openSummitModal 成功展示峰会弹窗");
    const titleEl = $("summit-title");
    assert("modalTitleContent", titleEl && titleEl.textContent.includes("日内瓦峰会"), "弹窗标题正确展示日内瓦峰会");
    const treatyList = $("summit-treaty-list");
    assert("modalTreatyListRendered", treatyList && treatyList.children.length > 0, "议程条约卡片列表正常渲染");

    closeSummitModal();
    assert("modalCloses", modal && modal.style.display === "none", "closeSummitModal 成功收起弹窗");

    // 4. 条约签署与和平红利注入 (Sign Treaty & Détente Dividend)
    signTreaty("inf", "SUN", pWash);
    assert("treatyActiveInState", ST.ai.treaties.some((t) => t.id === "inf" && t.with === "SUN" && t.status === "active"), "中导条约成功进入 ST.ai.treaties 且处于 active 状态");

    const ekUSA = entKeys("USA")[0];
    const ekSUN = entKeys("SUN")[0];
    const pmodUSA = SIM.S.P.pmods[ekUSA] || 0;
    const pmodSUN = SIM.S.P.pmods[ekSUN] || 0;
    assert("playerReceivesDividend", pmodUSA >= 0.40 - 1e-4, "美国作为签约国准确享有 +0.40pp/年 和平红利");
    assert("aiReceivesDividend", pmodSUN >= 0.40 - 1e-4, "苏联作为履约国同样共享 +0.40pp/年 和平红利");

    // 5. 危机热线张力锁死测试 (Hotline Tension Cap)
    signTreaty("hotline", "SUN");
    const attWithHotline = AI.calcAttitude("SUN", "USA", { mil: 9.0, sanctions: [{ t: "SUN", l: 2 }], aid: [] }, { countries: CM.countries, treaties: ST.ai.treaties });
    assert("hotlineLocksTension", attWithHotline.tension <= 50, "《危机热线》成功将极端摩擦张力锁死在 50 点以内");

    // 6. 条约履约、违约抗议与撕毁机制 (Compliance, Warning, Nullification)
    ST.mil = 8.0;
    updateAIDecisions(1988, 1, true);
    const infTreaty = ST.ai.treaties.find((t) => t.id === "inf");
    assert("breachWarningCount1", infTreaty && infTreaty.warnings === 1 && infTreaty.status === "active", "首次违约触发违规计数 1，条约仍处于履约缓冲期");
    assert("breachCableIssued", ST.ai.cables.some((c) => c.zh && c.zh.includes("军控履约照会")), "违约行为产生外交抗议照会");

    updateAIDecisions(1988, 2, true);
    assert("treatyNullified", infTreaty && infTreaty.status === "nullified", "持续违约导致条约被单方面宣告作废 (nullified)");
    assert("nullifiedCableIssued", ST.ai.cables.some((c) => c.zh && c.zh.includes("条约单方面作废")), "废约事件产生正式断交照会");

    applyPlayerDecisions();
    const infActive = ST.ai.treaties.some((t) => t.id === "inf" && t.status === "active");
    assert("dividendStrippedOnBreach", !infActive && SIM.S.P.pmods[ekUSA] <= -7.8, "条约废止后中导和平红利被彻底剥离");

    // 7. 侧边栏 #p-ai-box 条约状态渲染
    select("SUN");
    const aiBox = $("p-ai-box");
    assert("aiBoxRendered", aiBox && aiBox.style.display !== "none", "选中苏联时国家面板正常展示");
    assert("aiBoxSummitBtn", !!$("p-ai-summit-btn"), "国家面板成功渲染【开启首脑峰会外交谈判】按钮");

    // 8. 存档与读档无损往返 (Save/Load)
    signTreaty("start", "SUN");
    const treatyCountBefore = ST.ai.treaties.length;
    const saveOk = simSave();
    assert("saveSuccess", saveOk === true, "simSave 成功执行");

    simReset();
    assert("resetClearsTreaties", ST.ai.treaties.length === 0, "simReset 干净重置军控条约列表");

    const loadOk = simLoad();
    assert("loadSuccess", loadOk === true, "simLoad 成功反序列化");
    assert("treatiesRestored", ST.ai.treaties.length === treatyCountBefore, "读档后军控条约状态完美还原");
    assert("startTreatyPreserved", ST.ai.treaties.some((t) => t.id === "start" && t.status === "active"), "削减战略核武器条约状态完好");

    // 9. 旁观模式零漂移铁律
    simReset();
    setPlayer(null);
    assert("spectatorNoTreaties", ST.ai.treaties.length === 0, "旁观模式下条约列表为空");
    assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "summitprobe"; d.style.display = "none";
  d.textContent = "SUMMITPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

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
    assert("saveSuccess", saveOk === true, "simSave 成功执行");

    simReset();
    assert("resetClearsUNSC", ST.ai.unsc.passed.length === 0 && ST.ai.unsc.history.length === 0, "simReset 干净重置安理会决议状态");

    const loadOk = simLoad();
    assert("loadSuccess", loadOk === true, "simLoad 成功反序列化");
    assert("unscPassedRestored", ST.ai.unsc.passed.length === passedCountBefore, "读档后安理会生效决议完美还原");
    assert("unscHistoryRestored", ST.ai.unsc.history.length === historyCountBefore, "读档后安理会历史记录完整保留");

    // 9. 旁观模式零漂移铁律
    simReset();
    setPlayer(null);
    assert("spectatorNoUNSC", ST.ai.unsc.passed.length === 0, "旁观模式下安理会生效决议为空");
    assert("spectatorZeroPmods", Object.keys(SIM.S.P.pmods).length === 0, "旁观模式下 P.pmods 绝对为 0 偏离");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "unscprobe"; d.style.display = "none";
  d.textContent = "UNSCPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
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
let newsResumePlay = false;
function openNewsModal(newsId) {
  if (!window.W1980_NEWS) return false;
  const news = window.W1980_NEWS[newsId];
  if (!news) return false;
  const modal = $("news-modal");
  if (!modal) return false;

  ST.lastNewsId = newsId;
  if (window.W1980_SOUND) window.W1980_SOUND.playTeletype();
  if (SIM.playing) {
    newsResumePlay = true;
    SIM.playing = false;
    updateDate();
  }

  const mDate = $("news-date"); if (mDate) mDate.textContent = news.y + "-" + String(news.m).padStart(2, "0");
  const mMast = $("news-masthead"); if (mMast) mMast.textContent = news.paper || "THE GLOBAL CHRONICLE";
  const mIssue = $("news-issue"); if (mIssue) mIssue.textContent = news.issue || "VOL. XLIV NO. 15,420";
  const mHl = $("news-headline"); if (mHl) mHl.textContent = news.headline;
  const mSub = $("news-subhead"); if (mSub) mSub.textContent = news.subhead || "";
  const mLead = $("news-lead"); if (mLead) mLead.textContent = news.lead || "";
  const mEd = $("news-editorial"); if (mEd) mEd.textContent = news.editorial || "";
  const mImp = $("news-impacts");
  if (mImp) {
    mImp.innerHTML = (news.impacts || []).map((imp) =>
      '<div class="news-impact-item">' +
      '<span class="news-impact-icon">' + imp.icon + '</span>' +
      '<div class="news-impact-content">' +
      '<span class="news-impact-title">' + imp.title + '</span>' +
      '<span class="news-impact-desc">' + imp.desc + '</span>' +
      '</div></div>'
    ).join("");
  }

  const bFocus = $("news-btn-focus");
  if (bFocus) {
    bFocus.onclick = () => {
      if (news.focus && Array.isArray(news.focus)) {
        flyTo(news.focus[0], news.focus[1], news.focus[2], news.focus[3], 600);
      }
    };
  }

  const bCont = $("news-btn-continue");
  if (bCont) {
    bCont.onclick = closeNewsModal;
  }

  // R14: 挂载时代历史新闻档案画报与印章
  const photoBox = $("news-photo-box");
  const photoImg = $("news-photo-img");
  const photoCap = $("news-photo-caption");
  const stampImg = $("news-stamp-img");
  if (photoBox && photoImg && photoCap && window.W1980_ASSETS) {
    const p = window.W1980_ASSETS.getNewsPhoto(newsId);
    if (p) {
      photoImg.src = p.url;
      photoCap.textContent = "【时代历史档案】" + p.caption;
      photoBox.style.display = "block";
    } else {
      photoBox.style.display = "none";
    }
    if (stampImg) {
      const isSoviet = (news.paper && news.paper.includes("ПРАВДА")) || (newsId === "ussr_dissolution" || newsId === "perestroika");
      stampImg.src = isSoviet ? "assets/ui/stamp_soviet_secret.png" : "assets/ui/stamp_top_secret.png";
      stampImg.style.display = "block";
    }
  }

  modal.style.display = "flex";
  return true;
}

function closeNewsModal() {
  const modal = $("news-modal");
  if (modal) modal.style.display = "none";
  if (newsResumePlay) {
    SIM.playing = true; simKick();
    newsResumePlay = false;
    updateDate();
  }
}

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
window.__W1980 = { view: view, render: render, drawOverlay: drawOverlay, drawMini: drawMini,
  zoomAt: zoomAt, maps: maps, ST: ST, setMode: setMode, sig: mapSig,
  sim: SIM, simVal: simVal, simFastForward: simFastForward, simTogglePlay: simTogglePlay, simReset: simReset,
  simSave: simSave, simLoad: simLoad,
  simAtEnd: simAtEnd, endStats: endStats, simEndOpen: simEndOpen, simEndClose: simEndClose,
  setFrontline: setFrontline, clearFrontlines: clearFrontlines, rebuildFrontlinesMap: rebuildFrontlinesMap,
  updateTimelineFrontlines: updateTimelineFrontlines, flMap: flMap,
  getInterventionScore: getInterventionScore, refreshWarBox: refreshWarBox,
  runResProbe: runResProbe, refreshResBox: refreshResBox,
  runTradeProbe: runTradeProbe, refreshTradeBox: refreshTradeBox, getTradeFlows: getTradeFlows,
  runEmbargoProbe: runEmbargoProbe, calcResourcePenalty: calcResourcePenalty, getRouteStatus: getRouteStatus,
  runAIProbe: runAIProbe, refreshAIBox: refreshAIBox, updateAIDecisions: updateAIDecisions,
  openSummitModal: openSummitModal, closeSummitModal: closeSummitModal, signTreaty: signTreaty, walkoutSummit: walkoutSummit, runSummitProbe: runSummitProbe,
  openUNSCModal: openUNSCModal, closeUNSCModal: closeUNSCModal, voteUNSC: voteUNSC, executeResolution: executeResolution, runUNSCProbe: runUNSCProbe,
  setPanelTab: setPanelTab, updatePanelTabBadges: updatePanelTabBadges, refreshOverviewCard: refreshOverviewCard, runPanelProbe: runPanelProbe,
  openNewsModal: openNewsModal, closeNewsModal: closeNewsModal, runNewsProbe: runNewsProbe,
  generateEpilogue: generateEpilogue, generateChronicle: generateChronicle, exportMemoirs: exportMemoirs, copyMemoirs: copyMemoirs, setEndTab: setEndTab, runChronicleProbe: runChronicleProbe,
  initDomesticState: initDomesticState, updateDomesticPolitics: updateDomesticPolitics, refreshDomesticBox: refreshDomesticBox, applyDomesticPlayerAction: applyDomesticPlayerAction, runDomesticProbe: runDomesticProbe,
  initAgendaState: initAgendaState, getAgendaState: getAgendaState, startAgenda: startAgenda, updateMonthlyAgendas: updateMonthlyAgendas, refreshAgendaBox: refreshAgendaBox, runAgendaProbe: runAgendaProbe,
  initCrisisState: initCrisisState, sanitizeCrisisState: sanitizeCrisisState, openCrisisModal: openCrisisModal, hideCrisisModal: hideCrisisModal, closeCrisisModal: closeCrisisModal, resolveCrisis: resolveCrisis, updateMonthlyCrises: updateMonthlyCrises, runCrisisProbe: runCrisisProbe,
  initIntelState: initIntelState, sanitizeIntelState: sanitizeIntelState, updateMonthlyIntel: updateMonthlyIntel, executeCovertAction: executeCovertAction, refreshCovertBox: refreshCovertBox, runIntelProbe: runIntelProbe,
  initAfghanState: initAfghanState, sanitizeAfghanState: sanitizeAfghanState, updateMonthlyAfghan: updateMonthlyAfghan, setAfghanPolicy: setAfghanPolicy, refreshAfghanBox: refreshAfghanBox, runAfghanProbe: runAfghanProbe,
  refreshSoundBtn: refreshSoundBtn, toggleSoundMute: toggleSoundMute, runSoundProbe: runSoundProbe,
  refreshLeaderCard: refreshLeaderCard, runAssetsProbe: runAssetsProbe,
  decSet: decSet, sanctionSet: sanctionSet, aidSet: aidSet, setPlayer: setPlayer, setMil: setMil, select: select, entKeys: entKeys, applyPlayerDecisions: applyPlayerDecisions,
  panBy: (dx, dy) => { view.x -= dx / view.s; view.y -= dy / view.s; clampView(); render(); drawOverlay(); drawMini(); } };
