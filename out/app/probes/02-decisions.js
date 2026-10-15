"use strict";


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
  const sv = simSave(); r.saved = sv.ok;
  r.gdpBefore = +(SIM.S.gdp[ekT.length ? ekT[0] : (ekP[0] || "SUN")]).toFixed(9);
  ST.sanctions = []; ST.aid = [];
  const lv = simLoad(); r.loaded = lv.ok;
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
    // F：记录着色真值源的「变更前」值（见下方 sigChanged 处说明）
    const deuId0 = playIdOfKey["DEU"] || (CM.countries["DEU"] || {}).polity_id;
    r.tblDeuColorBefore = (tables.bloc && deuId0) ? tables.bloc[deuId0] : null;
    r.sigBefore = mapSig();
    r.pmodsBefore = pmodsCount();
    setBloc(b);
    r.overrideSet = ST.blocOverride[ST.player] === b;
    select(ST.player);
    r.badgeAfter = $("p-bloc").textContent;
    r.badgeOk = r.badgeAfter === (BLOC_ZH[b] || b) && r.badgeBefore === (BLOC_ZH[orig] || orig);
    r.sigAfter = mapSig();
    // F（快赢/CI 评审）：原 sigChanged 依赖画布像素读回（mapSig）。无头引导阶段
    // canvas getImageData 会被冻结在最后一次提交的帧上 —— 实测连「整图重烘」
    // （political→bloc 重染所有国家）都读不到差异，故该断言在 CI 里不可靠。
    // 改为断言阵营色表本身（tables.bloc）随 override 变化：这是地图着色的真值源，
    // 与绘制时序无关。画布签名保留为参考信息，不参与判定。
    const deuId = playIdOfKey["DEU"] || (CM.countries["DEU"] || {}).polity_id;
    r.tblBefore = r.tblDeuColorBefore;
    r.tblAfter = (tables.bloc && deuId) ? tables.bloc[deuId] : null;
    r.blocTableChanged = r.tblBefore !== null && r.tblAfter !== null && r.tblBefore !== r.tblAfter;
    r.blocTableIsTarget = r.tblAfter === u32c(BLOC[b] || "#9B9B9B");
    r.sigChanged = r.blocTableChanged;                   // 保留字段名，语义改为「着色真值源已变」
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
    const sv = simSave(); r.saved = sv.ok;
    ST.blocOverride = {}; ST.blocSince = null; rebuildBlocTable();
    const lv = simLoad(); r.loaded = lv.ok;
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
