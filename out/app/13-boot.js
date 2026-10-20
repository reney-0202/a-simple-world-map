"use strict";

load().then(() => {
  const q = new URLSearchParams(location.search);
  // E：沙盒模式 URL 开关（须在 wireTimeControls 前生效，避免启动即被终局拦截）
  if (q.has("sandbox")) ST.sandbox = true;
  initTradeState();
  if (!q.has("simoff")) simInit();
  wireTimeControls(); updateDate(); requestAnimationFrame(simLoop);
  crInit();                           // R5D：十字路口初始化（在首次 evRun 前就位）
  buildUI();
  maybeWelcome();
  tutMaybeAuto();
  if (/[?&]tut=1/.test(location.search)) { const w = $("welcome"); if (w) w.style.display = "none"; tutStart(0); }   // 无头验证钩子
}).then(() => {
  if (SELFTEST) { runSelfTest(); return; }
  // R3/R5C'：玩家实体 + 决策 —— **必须在 ?t= 快进之前生效**，否则快进段仍按默认计算
  const pq = /[?&]player=([A-Za-z]{3,4})/.exec(location.search);
  if (pq) { const pk = pq[1].toUpperCase(); if (CM.countries[pk]) ST.player = pk; }
  const mq1 = /[?&]mil=([\d.]+)/.exec(location.search);
  if (mq1) ST.mil = clamp(parseFloat(mq1[1]) || 0, 0, 10);
  // R5C'：?sanction=KEY:lvl(,…) / ?aid=KEY:lvl(,…) —— 探针进入时必须置 CR.probeMode=true，
  // 否则快进在 1980-09 十字路口停住（tasks/015 §4.3 / I-4）
  const decParse = (name) => {
    const m = new RegExp("[?&]" + name + "=([A-Za-z0-9,:]+)").exec(location.search);
    if (!m) return null;
    const out = [];
    m[1].split(",").forEach((p) => {
      const mm = /^([A-Za-z]{3,4}):(0|1|2)$/.exec(p);
      if (mm) {
        const k = resolvePlayableKey(mm[1].toUpperCase());
        if (CM.countries[k]) out.push({ t: k, l: +mm[2], since: 0 });
      }
    });
    return out;
  };
  const sanQ = decParse("sanction"), aidQ = decParse("aid");
  const probeQ = /[?&]sanprobe=1/.test(location.search);
  const decQ = /[?&]decprobe=1/.test(location.search);
  if (sanQ) ST.sanctions = sanQ;
  if (aidQ) ST.aid = aidQ;
  // F（快赢/CI 评审）：decprobe 与 sanprobe 同属「玩家决策」探针，其期望值假定只有玩家
  // 决策作用于 pmods。原先只对 sanprobe 置 probeMode，decprobe 下 AI 仍激活并会反制裁
  // 玩家，使 pmodSelf/pmodSUN 偏离断言值（探针长期 allOk=false 的根因）。此处统一置位，
  // 与 isAIActive() 的 probeMode 门控一致。
  if (sanQ || aidQ || probeQ || decQ) CR.probeMode = true;
  applyPlayerDecisions(); updPlayerTag(); refreshMilBox();
  if (probeQ) runSanProbe();       // 自带 reset/ff/存档往返，结束回到 1980-01（名单保留）
  if (decQ) runDecProbe();
  // R5E：?bloc=<BLOC> 结盟探针（探针需越过十字路口 → probeMode）
  const blq = /[?&]bloc=([A-Za-z]+)/.exec(location.search);
  if (blq) { CR.probeMode = true; runBlocProbe(blq[1].toUpperCase()); }
  // R8A：?fl=PID:KEY(,...) 或 ?frontline=PID:KEY 支持 URL 传入占领态
  const flq = new URLSearchParams(location.search).get("frontline") || new URLSearchParams(location.search).get("fl");
  if (flq) {
    flq.split(",").forEach((item) => {
      const parts = item.split(":");
      if (parts.length >= 2) {
        const pid = parseInt(parts[0], 10);
        const occ = parts[1].toUpperCase();
        const war = parts[2] || "conflict";
        if (pid > 0 && pid < 3000 && CM.countries[occ]) {
          setFrontline(pid, occ, war);
        }
      }
    });
  }
  const tq = /[?&]t=(\d{4})-(\d{1,2})/.exec(location.search);
  if (tq && SIM.ready) simFastForward(+tq[1], +tq[2]);
  const spq = /[?&]sp=([124])/.exec(location.search);
  if (spq) simSetSpeed(+spq[1]);
  if (/[?&](play|autoplay)=1/.test(location.search) && SIM.ready) { SIM.playing = true; simKick(); updateDate(); }
  if (/[?&]simprobe=1/.test(location.search)) {
    const r = { ready: SIM.ready, y0: SIM.S && SIM.S.year, m0: SIM.S && Math.max(1, SIM.S.month) };
    simTogglePlay(); r.playAfterToggle = SIM.playing;
    simSetSpeed(4); r.speed = SIM.speed;
    simFastForward(1991, 12);
    r.y1 = SIM.S.year; r.m1 = Math.max(1, SIM.S.month);
    r.evLog = EV.log.slice();
    r.sunDissolved = W1980_SIM.isDissolved(SIM.S, "SUN");
    r.sunGdp1991 = +simVal("SUN").gdp_bn.toFixed(1);
    r.irqGdp1991 = +simVal("IRQ").gdp_bn.toFixed(1);
    r.crChoices = CR.choices.slice();                       // R5D：十字路口决定（reset 前抓取）
    r.crDeny = Array.from(CR.deny);
    // R2 T2/T3：顶栏增速 / 收件箱 / 时间轴（可断言项）
    r.growthWorld = growthWorld() === null ? null : +growthWorld().toFixed(3);
    r.topGrowth = $("r-grw") ? $("r-grw").textContent : null;
    r.growthSUN = growthOf(entKeys("SUN")) === null ? null : +growthOf(entKeys("SUN")).toFixed(3);
    r.inboxCount = EV.items.length;
    r.inboxUnread = EV.unread;
    r.inboxFirst = EV.items.length ? EV.items[0].id + "@" + EV.items[0].y + "-" + EV.items[0].m : null;
    r.axisPct = $("r-axis-fill") ? $("r-axis-fill").style.width : null;
    r.histLen = (SIM.S.hist && SIM.S.hist.gdp.SUN) ? SIM.S.hist.gdp.SUN.length : 0;
    r.player = ST.player; r.mil = ST.mil;                          // R3
    r.pmodSUN = SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN;
    simTogglePlay(); r.playAfterToggle2 = SIM.playing;
    simReset(); r.y2 = SIM.S.year; r.m2 = Math.max(1, SIM.S.month);
    r.sunGdpReset = +simVal("SUN").gdp_bn.toFixed(1);
    r.evLogAfterReset = EV.log.slice();
    r.inboxAfterReset = EV.items.length;
    r.axisPctReset = $("r-axis-fill") ? $("r-axis-fill").style.width : null;
    const d = document.createElement("div"); d.id = "simprobe"; d.style.display = "none";
    d.textContent = "SIMPROBE " + JSON.stringify(r);
    document.body.appendChild(d);
  }
  if (/[?&]saveprobe=1/.test(location.search)) {
    const r = {};
    if (!ST.player) ST.player = "SUN";          // **带决策路径**（可由 ?player= 覆盖）
    if (!ST.mil) ST.mil = 8;
    applyPlayerDecisions();
    simFastForward(1985, 6);
    r.savedDate = SIM.S.year + "-" + Math.max(1, SIM.S.month);
    r.player = ST.player; r.mil = ST.mil;
    r.sunBefore = +simVal("SUN").gdp_bn.toFixed(2);
    r.gdpBefore = +SIM.S.gdp.SUN.toFixed(9);
    r.rngBefore = SIM.S.rngState;
    r.pmodSUN = SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN;
    r.histLenBefore = SIM.S.hist.gdp.SUN.length;
    r.evLog = EV.log.slice();
    r.saved = simSave().ok;
    try { r.saveBytes = localStorage.getItem(SAVE_KEY).length; } catch (e) { r.saveBytes = -1; }
    simReset();
    r.sunAfterReset = +simVal("SUN").gdp_bn.toFixed(2);
    ST.mil = 0; applyPlayerDecisions(); r.tamperedMil = ST.mil;   // 故意篡改 → 读档应还原为存档里的 8
    r.loaded = simLoad().ok;
    r.dateAfterLoad = SIM.S.year + "-" + Math.max(1, SIM.S.month);
    r.sunAfterLoad = +simVal("SUN").gdp_bn.toFixed(2);
    r.gdpAfterLoad = +SIM.S.gdp.SUN.toFixed(9);
    r.rngAfterLoad = SIM.S.rngState;
    r.rngStateOk = r.rngBefore === r.rngAfterLoad;
    r.exactOk = r.gdpBefore === r.gdpAfterLoad;
    r.milAfterLoad = ST.mil; r.milRestored = r.milAfterLoad === r.mil;
    r.crAfterLoad = CR.choices.slice(); r.crDenyAfterLoad = Array.from(CR.deny);   // R5D：路口决定往返
    r.pmodSUNAfter = SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN;
    // __ 前缀 = 诊断，不参与断言/塌缩门。用来把「账单到底写了多少」量化出来，
    // 而不是靠猜（P1 调参需要看 breakdown，而不是看一个聚合的 pmods 差值）。
    r.__polecon = (typeof polEconSnapshot === "function") ? polEconSnapshot() : null;
    r.__unrestSUN = (ST.domestic && ST.domestic.sun) ? +ST.domestic.sun.unrest.toFixed(2) : null;
    r.__shortageSUN = (ST.domestic && ST.domestic.sun) ? +ST.domestic.sun.shortage.toFixed(2) : null;
    r.__billsSUN = (ST.polEcon && ST.polEcon.events) ? ST.polEcon.events.map((e) => e.kind).join(",") : null;
    r.histLenAfterLoad = SIM.S.hist.gdp.SUN.length;
    r.evLogAfterLoad = EV.log.slice();
    r.detOk = (r.sunBefore === r.sunAfterLoad) && (r.evLog.join(",") === r.evLogAfterLoad.join(","));
    r.allOk = r.rngStateOk && r.exactOk && r.milRestored && r.detOk;

    // ---- C（存档评审）：失败必须显式报出，不许静默 -------------------------
    // 1) 多槽：写槽位 2 再读回，槽位互不串扰
    const sv2 = simSave(2);
    r.slot2Saved = sv2.ok && sv2.key === SAVE_KEY + "_s2";
    const lv2 = simLoad(2);
    r.slot2Loaded = lv2.ok && lv2.slot === "2";
    r.slot2Isolated = (simLoad(1).reason === "empty");      // 槽位 1 从未写过 → 明确「该槽位没有存档」
    // 2) JSON 损坏：写入损坏内容后，simLoad 必须返回 reason=corrupt（而非笼统失败/静默）
    const goodRaw = localStorage.getItem(SAVE_KEY);
    try { localStorage.setItem(SAVE_KEY, "{ not json"); } catch (e) {}
    const lc = simLoad();
    r.corruptReason = lc.ok ? null : lc.reason;
    r.corruptReported = (!lc.ok && lc.reason === "corrupt");
    r.corruptReasonZh = saveReasonZh(lc);
    // 3) 版本不符：合法 JSON 但版本号错误 → reason=version 且报出实际版本号
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 99, S: {} })); } catch (e) {}
    const lvv = simLoad();
    r.versionReason = lvv.ok ? null : lvv.reason;
    r.versionReported = (!lvv.ok && lvv.reason === "version");
    r.versionDetail = lvv.detail || "";
    // 4) 空槽 → reason=empty
    const lve = simLoad(3);
    r.emptyReason = lve.ok ? null : lve.reason;
    r.emptyReported = (!lve.ok && lve.reason === "empty");
    // 5) 导入校验：损坏文本 / 错版本文本都必须被拒绝并给出 reason
    r.importRejectsCorrupt = !saveImportInto(1, "nope").ok && saveImportInto(1, "nope").reason === "corrupt";
    r.importRejectsVersion = !saveImportInto(1, JSON.stringify({ v: 7, S: {} })).ok
      && saveImportInto(1, JSON.stringify({ v: 7, S: {} })).reason === "version";
    // 6) 槽位摘要：损坏槽必须标出 reason，空槽标 empty
    const si = saveSlotInfo(2);
    r.slot2InfoOk = !si.empty && si.year === 1985 && si.month === 6;
    const siCorrupt = saveSlotInfo(0);
    r.slotInfoFlagsCorrupt = !!siCorrupt.reason;
    // 7) 删除槽位
    r.slot2DeleteOk = saveDelete(2).ok && saveSlotInfo(2).empty;
    // 8) 配额失败：setItem 抛 QuotaExceededError 时 simSave 必须返回 reason=quota
    const realSet = Storage.prototype.setItem;
    let quotaSeen = false;
    try {
      Storage.prototype.setItem = function () { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; };
      const sq = simSave();
      quotaSeen = !sq.ok && sq.reason === "quota";
      r.quotaReasonZh = saveReasonZh(sq);
    } catch (e) { quotaSeen = false; }
    finally { Storage.prototype.setItem = realSet; }
    r.quotaReported = quotaSeen;
    // 9) 迁移表可读（v1→v2 dropped；v2→v3 migrated）
    r.migrationNote = saveFormatNote();
    // 11) J1：v2→v3 迁移实测 —— 用先前捕获的真实存档造一份「v2 形状」载荷
    //     （去掉 v3 三项新字段、版本号回退为 2），simLoad 必须成功载入且补齐缺省值。
    let v2payload = null;
    try {
      const obj = JSON.parse(goodRaw);
      delete obj.panelTab; delete obj.newsModalEnabled; delete obj.endTab;
      obj.v = 2;
      v2payload = JSON.stringify(obj);
      localStorage.setItem(SAVE_KEY, v2payload);
    } catch (e) { v2payload = null; }
    // 先把内存里的三项改成非缺省值，才能证明是「迁移补缺省」而不是「碰巧已是缺省」
    ST.panelTab = "diplomacy"; ST.newsModalEnabled = false; ST.endTab = "chronicle";
    const migLoad = v2payload ? simLoad() : { ok: false };
    r.v2MigratedLoadOk = !!migLoad.ok;
    r.v2MigratedDefaults = ST.panelTab === "overview" && ST.newsModalEnabled === true && ST.endTab === "rubric";
    // 载入 v2 后再存一次 → 落盘应为当前版本（证明「v2 进、v3 出」的往返）
    if (migLoad.ok) simSave();
    let storedVer = null;
    try { storedVer = JSON.parse(localStorage.getItem(SAVE_KEY)).v; } catch (e) { storedVer = null; }
    r.v2SavedAsCurrent = storedVer === SAVE_VERSION;
    // 高于当前版本必须明确拒绝（不许当旧档解析）
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION + 1, S: {} })); } catch (e) {}
    const tooNew = simLoad();
    r.futureVersionRejected = (!tooNew.ok && tooNew.reason === "version");
    // 恢复现场：把好存档写回，确认一切功能正常
    try { if (goodRaw) localStorage.setItem(SAVE_KEY, goodRaw); } catch (e) {}
    const lr3 = simLoad();
    r.recoveredAfterCorruption = lr3.ok;
    r.allOk = r.allOk && r.slot2Saved && r.slot2Loaded && r.slot2Isolated
      && r.corruptReported && r.versionReported && r.emptyReported
      && r.importRejectsCorrupt && r.importRejectsVersion
      && r.slot2InfoOk && r.slotInfoFlagsCorrupt && r.slot2DeleteOk
      && r.quotaReported && r.recoveredAfterCorruption
      && r.v2MigratedLoadOk && r.v2MigratedDefaults && r.v2SavedAsCurrent && r.futureVersionRejected;
    // 供无头断言判负：任一失败诊断缺失即显式 FAIL（runner 匹配字符串约定）
    r.diag = r.allOk ? "ok" : "FAIL 存档失败诊断缺失";
    // ----------------------------------------------------------------------
    const dd = document.createElement("div"); dd.id = "saveprobe"; dd.style.display = "none";
    dd.textContent = "SAVEPROBE " + JSON.stringify(r);
    document.body.appendChild(dd);
  }
  // R4：终局判定探针 —— 未到站则先推进到 1991-12，再强制结算并落 ENDPROBE（无头断言用）
  if (/[?&]end=1/.test(location.search) && SIM.ready) {
    if (!simAtEnd()) simFastForward(END_Y, END_M);
    simEndOpen();
    simTogglePlay();                       // 到站后 ▶ 不应再推进：probe 里断言 playing 仍为 false
    const st = endStats();
    const r = { shown: $("end") ? $("end").classList.contains("open") : null,
      date: SIM.S.year + "-" + Math.max(1, SIM.S.month),
      playingAfterPlay: SIM.playing, histLen: SIM.S.hist.gdp.SUN.length,
      player: st.player ? st.player.k : null, mil: ST.mil,
      gdpShareSum: +st.blocs.reduce((s, b) => s + b.gdpShare, 0).toFixed(3),
      popShareSum: +st.blocs.reduce((s, b) => s + b.popShare, 0).toFixed(3),
      blocGdp: st.blocs.map((b) => b.b + ":" + b.gdpShare.toFixed(2) + "/" + b.gdpShare0.toFixed(2)).join(" "),
      blocPop: st.blocs.map((b) => b.b + ":" + b.popShare.toFixed(2) + "/" + b.popShare0.toFixed(2)).join(" "),
      worldGdp: +st.world.gdp.toFixed(1), worldGdpDelta: +st.world.gdpDelta.toFixed(2),
      worldPop: +st.world.pop.toFixed(1), worldPopDelta: +st.world.popDelta.toFixed(2),
      rows: $("end-body") ? $("end-body").querySelectorAll("tr").length : 0,
      sections: $("end-body") ? $("end-body").querySelectorAll("h4").length : 0 };
    if (st.player) { const p = st.player;
      r.score = { E: +p.E.toFixed(2), R: +p.R.toFixed(2), M: +p.M.toFixed(2), G: +p.G.toFixed(2), total: +p.total.toFixed(2),
        G_bloc: +p.G_bloc.toFixed(2), G_act: +p.G_act.toFixed(2),
        gSelf: p.gSelf === null ? null : +p.gSelf.toFixed(3), gWorld: p.gWorld === null ? null : +p.gWorld.toFixed(3),
        pctl: p.pctl === null ? null : +p.pctl.toFixed(4),
        gdp: +p.gdp.toFixed(1), gdpDelta: +p.gdpDelta.toFixed(2),
        rank0: p.rank0, rank1: p.rank1, dr: p.dr, mil: p.mil }; }
    // ?endact=1：点「重开一局」后必须回到 1980-01、面板收起、且**玩家决策不丢**（mil 仍在）
    if (/[?&]endact=1/.test(location.search)) {
      const ekP = ST.player ? entKeys(ST.player) : [];
      const pmSelf = () => (ekP.length && SIM.S.P.pmods[ekP[0]] !== undefined) ? SIM.S.P.pmods[ekP[0]] : null;
      const pmodSelfBefore = pmSelf();
      const ag = $("e-again"); if (ag) ag.click();
      r.afterAgain = { date: SIM.S.year + "-" + Math.max(1, SIM.S.month),
        open: $("end") ? $("end").classList.contains("open") : null,
        sunGdp: +simVal("SUN").gdp_bn.toFixed(1), milKept: ST.mil,
        sanctionsKept: JSON.parse(JSON.stringify(ST.sanctions)), aidKept: JSON.parse(JSON.stringify(ST.aid)),
        pmodSelfBefore: pmodSelfBefore, pmodSelf: pmSelf(),
        pmodSUN: SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN,
        histLen: (SIM.S.hist.gdp.SUN || []).length };   // 重开后 hist 为空 → 必须容错（首跑踩到 TypeError）
    }
    const dz = document.createElement("div"); dz.id = "endprobe"; dz.style.display = "none";
    dz.textContent = "ENDPROBE " + JSON.stringify(r);
    document.body.appendChild(dz);
  }
  // ---- M2（探针注册收敛）：普通探针走注册表驱动的分派表 -------------------------
  // 这里只写「参数令牌 → 运行函数」的一行映射；令牌本身（含查询串、DOM 标记、
  // 时间预算）由 data/probes.js 声明，运行器读同一份文件。新增一个普通探针 =
  // 在 probes.js 加一条 + 在此加一行，不再需要同步第四处正则。
  //
  // selftest / simprobe / saveprobe / end / sanprobe / decprobe / bloc 有各自的
  // 前置准备与顺序要求，仍在本文件单独处理。
  const PROBE_RUNNERS = {
    flprobe: runFrontlineProbe,
    groundwarprobe: runGroundWarProbe,
    warprobe: runWarProbe,
    resprobe: runResProbe,
    tradeprobe: runTradeProbe,
    embargoprobe: runEmbargoProbe,
    aiprobe: runAIProbe,
    econai: runEconAIProbe,
    summitprobe: runSummitProbe,
    unscprobe: runUNSCProbe,
    panelprobe: runPanelProbe,
    newsprobe: runNewsProbe,
    chronicleprobe: runChronicleProbe,
    domesticprobe: runDomesticProbe,
    agendaprobe: runAgendaProbe,
    crisisprobe: runCrisisProbe,
    intelprobe: runIntelProbe,
    afghanprobe: runAfghanProbe,
    poleconprobe: runPolEconProbe,
    prestigeprobe: runPrestigeProbe,
    nukeprobe: runNukeProbe,
    estprobe: runEstimatesProbe,
    soundprobe: runSoundProbe,
    assetsprobe: runAssetsProbe
  };
  // 自检：分派表里的每个令牌都必须在注册表里，否则就是「加了探针却没登记」
  // 或「改了参数名却没改分派」—— 两者都会让探针静默不跑。
  assertProbeDispatchConsistency(PROBE_RUNNERS);
  for (const token in PROBE_RUNNERS) {
    if (hasProbeParam([token], location.search)) PROBE_RUNNERS[token]();
  }

  const pans = new URLSearchParams(location.search).getAll("pan");
  for (const s of pans) {
    const mm2 = /^(-?[\d.]+),(-?[\d.]+)$/.exec(s);
    if (mm2) window.__W1980.panBy(parseFloat(mm2[1]), parseFloat(mm2[2]));
  }
  const mp = new URLSearchParams(location.search).get("modeprobe");
  if (mp) {
    const res = []; let prev = mapSig();
    for (const m of mp.split(",")) {
      if (!MODES.some((x) => x[0] === m)) continue;
      setMode(m);
      const s2 = mapSig();
      res.push(m + ":" + s2 + (s2 === prev ? "(NOCHANGE!)" : ""));
      prev = s2;
    }
    const d = document.createElement("div");
    d.id = "modeprobe"; d.style.display = "none";
    d.textContent = "MODEPROBE " + res.join(" | ");
    document.body.appendChild(d);
  }
  const mq = /[?&]c=([A-Za-z]{3,4})/.exec(location.search);
  const mm = /[?&]m=([a-z]+)/.exec(location.search);
  if (mm && MODES.some((x) => x[0] === mm[1])) setMode(mm[1]);
  const targetC = mq ? resolvePlayableKey(mq[1].toUpperCase()) : null;
  if (targetC && CM.countries[targetC]) {
    const k = targetC, bb = countryBBox(k);
    if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 240);
    select(k);
  }
}).catch((e) => {
  console.error(e);
  $("err").style.display = "flex";
  $("err").textContent = "加载失败：" + e.message;
});
