"use strict";

load().then(() => {
  const q = new URLSearchParams(location.search);
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
  if (sanQ) ST.sanctions = sanQ;
  if (aidQ) ST.aid = aidQ;
  if (sanQ || aidQ || probeQ) CR.probeMode = true;
  applyPlayerDecisions(); updPlayerTag(); refreshMilBox();
  if (probeQ) runSanProbe();       // 自带 reset/ff/存档往返，结束回到 1980-01（名单保留）
  if (/[?&]decprobe=1/.test(location.search)) runDecProbe();
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
    r.saved = simSave();
    try { r.saveBytes = localStorage.getItem(SAVE_KEY).length; } catch (e) { r.saveBytes = -1; }
    simReset();
    r.sunAfterReset = +simVal("SUN").gdp_bn.toFixed(2);
    ST.mil = 0; applyPlayerDecisions(); r.tamperedMil = ST.mil;   // 故意篡改 → 读档应还原为存档里的 8
    r.loaded = simLoad();
    r.dateAfterLoad = SIM.S.year + "-" + Math.max(1, SIM.S.month);
    r.sunAfterLoad = +simVal("SUN").gdp_bn.toFixed(2);
    r.gdpAfterLoad = +SIM.S.gdp.SUN.toFixed(9);
    r.rngAfterLoad = SIM.S.rngState;
    r.rngStateOk = r.rngBefore === r.rngAfterLoad;
    r.exactOk = r.gdpBefore === r.gdpAfterLoad;
    r.milAfterLoad = ST.mil; r.milRestored = r.milAfterLoad === r.mil;
    r.crAfterLoad = CR.choices.slice(); r.crDenyAfterLoad = Array.from(CR.deny);   // R5D：路口决定往返
    r.pmodSUNAfter = SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN;
    r.histLenAfterLoad = SIM.S.hist.gdp.SUN.length;
    r.evLogAfterLoad = EV.log.slice();
    r.detOk = (r.sunBefore === r.sunAfterLoad) && (r.evLog.join(",") === r.evLogAfterLoad.join(","));
    r.allOk = r.rngStateOk && r.exactOk && r.milRestored && r.detOk;
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
  // R8A：前线全链路无头探针
  if (/[?&]flprobe=1/.test(location.search)) {
    runFrontlineProbe();
  }
  // R8B：局部战争动态前线全时序探针
  if (/[?&]warprobe=1/.test(location.search)) {
    runWarProbe();
  }
  // 经济系统阶段 1：战略资源探针
  if (/[?&]resprobe=1/.test(location.search)) {
    runResProbe();
  }
  // 经济系统阶段 2：贸易大动脉与双轨清算探针
  if (/[?&]tradeprobe=1/.test(location.search)) {
    runTradeProbe();
  }
  // 经济系统阶段 3：巴统禁运与能源咽喉封锁经济战探针
  if (/[?&]embargoprobe=1/.test(location.search)) {
    runEmbargoProbe();
  }
  // R10A：大国战略性格与反应式 AI 决策机全链路探针
  if (/[?&]aiprobe=1/.test(location.search)) {
    runAIProbe();
  }
  // R10B：首脑峰会与军控谈判机制全链路探针
  if (/[?&]summitprobe=1/.test(location.search)) {
    runSummitProbe();
  }
  // R10C：联合国安理会与多边调停机制全链路探针
  if (/[?&]unscprobe=1/.test(location.search)) {
    runUNSCProbe();
  }
  // R11A：面板 Tabs 选项卡体系全链路探针
  if (/[?&]panelprobe=1/.test(location.search)) {
    runPanelProbe();
  }
  // R11B：时代大新闻头版弹窗全链路探针
  if (/[?&]newsprobe=1/.test(location.search)) {
    runNewsProbe();
  }
  // R11C：终局后日谈史诗长卷与历史编年史全链路探针
  if (/[?&]chronicleprobe=1/.test(location.search)) {
    runChronicleProbe();
  }
  // R12A：大国内政生态与派系权力天平全链路探针
  if (/[?&]domesticprobe=1/.test(location.search)) {
    runDomesticProbe();
  }
  // R12B：次极大国专属国家议程与战略路线全链路探针
  if (/[?&]agendaprobe=1/.test(location.search)) {
    runAgendaProbe();
  }
  // R12C：中局突发危机抉择卡与升级阶梯全链路探针
  if (/[?&]crisisprobe=1/.test(location.search)) {
    runCrisisProbe();
  }
  // R13A：隐蔽行动与全球谍战沙盒全链路探针
  if (/[?&]intelprobe=1/.test(location.search)) {
    runIntelProbe();
  }
  // R13B：阿富汗战争泥潭与帝国消耗槽全链路探针
  if (/[?&]afghanprobe=1/.test(location.search)) {
    runAfghanProbe();
  }
  // R13C：时代音效架构与合成器全链路探针
  if (/[?&]soundprobe=1/.test(location.search)) {
    runSoundProbe();
  }
  // R14：钢铁雄心4风格时代美术与游戏资源全链路探针
  if (/[?&]assetsprobe=1/.test(location.search)) {
    runAssetsProbe();
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
