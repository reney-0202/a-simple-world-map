"use strict";

// ---- R8A：动态地缘前线基础管线（省份动态属权遮罩与实时交战渲染） ----
function rebuildFrontlinesMap() {
  flMap.fill(0);
  const keys = Object.keys(ST.frontlines || {});
  hasFrontlines = false;
  for (let i = 0; i < keys.length; i++) {
    const pid = +keys[i];
    const fl = ST.frontlines[pid];
    if (fl && fl.occupier) {
      const occId = (playIdOfKey && playIdOfKey[fl.occupier]) || (CM.countries[fl.occupier] && CM.countries[fl.occupier].polity_id) || 0;
      if (occId && pid > 0 && pid < 3000) {
        flMap[pid] = occId;
        hasFrontlines = true;
      }
    }
  }
}
function setFrontline(provId, occupierKey, warId) {
  if (!ST.frontlines) ST.frontlines = {};
  const pid = +provId;
  if (pid <= 0 || pid >= 3000 || isNaN(pid)) return;
  if (!occupierKey) {
    delete ST.frontlines[pid];
  } else {
    ST.frontlines[pid] = {
      occupier: occupierKey,
      warId: warId || "conflict",
      since: curMonthIdx()
    };
  }
  rebuildFrontlinesMap();
  if (bakedNow === "political" || bakedNow === "bloc") {
    bakeNow(bakedNow);
    render();
    drawMini();
    drawOverlay();
  }
}
function clearFrontlines() {
  ST.frontlines = {};
  rebuildFrontlinesMap();
  if (bakedNow === "political" || bakedNow === "bloc") {
    bakeNow(bakedNow);
    render();
    drawMini();
    drawOverlay();
  }
}
// ---- R8B/R8C：局部战争动态前线状态机与大国对外干预深度联动 ----
function getInterventionScore(ctry) {
  if (!ctry) return 0;
  const targetKey = resolvePlayableKey(ctry);
  let s = 0;
  if (ST.player === targetKey || ST.player === ctry) {
    if (ST.mil >= 6) s += 2;
    else if (ST.mil >= 4) s += 1;
  } else if (ST.player) {
    if (ST.aid) {
      const a = ST.aid.find((x) => x.t === targetKey || x.t === ctry);
      if (a) s += (a.l + 1);
    }
    if (ST.sanctions) {
      const sc = ST.sanctions.find((x) => x.t === targetKey || x.t === ctry);
      if (sc) s -= (sc.l + 1);
    }
  }
  return s;
}

function updateTimelineFrontlines(y, m, silent) {
  if (!SIM.ready) return false;
  const now = y * 12 + m;
  let changed = false;

  const syncFl = (pid, occ, warId, sinceM) => {
    if (!occ) {
      if (ST.frontlines[pid]) {
        delete ST.frontlines[pid];
        changed = true;
      }
    } else {
      const cur = ST.frontlines[pid];
      if (!cur || cur.occupier !== occ || cur.warId !== warId) {
        ST.frontlines[pid] = { occupier: occ, warId: warId, since: sinceM };
        changed = true;
      }
    }
  };

  timelineIranIraq(now, silent, syncFl);
  timelineFalklands(now, silent, syncFl);
  timelineGulfWar(now, silent, syncFl);
  if (changed) timelineRepaint();
  return changed;
}

// ---- 历史战线按月推演：三段战线各自封装，syncFl 回调写回 changed ----
function timelineIranIraq(now, silent, syncFl) {
  // 1. 两伊战争（iran_iraq，1980-09 ~ 1988-08）
  const iranIraqDenied = !!(CR.deny && CR.deny.has("iran_iraq_war"));
  const res598Passed = !!(isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes("res_598"));
  const sIRQ = getInterventionScore("IRQ");
  const sIRN = getInterventionScore("IRN");
  const deltaIran = sIRN - sIRQ;
  const isDoubleEmbargo = (sIRQ <= -2 && sIRN <= -2);

  const m_iranIraqStart = 1980 * 12 + 9;
  let m_iranCounter = 1982 * 12 + 5;
  let m_iranIraqEnd = 1988 * 12 + 8;

  if (isDoubleEmbargo) {
    m_iranIraqEnd = 1984 * 12 + 8;
    if (m_iranCounter > m_iranIraqEnd) m_iranCounter = m_iranIraqEnd;
  } else if (deltaIran >= 2) {
    m_iranCounter = 1981 * 12 + 9; // 提前8个月大反攻
    m_iranIraqEnd = 1986 * 12 + 8; // 提前2年停火
  } else if (deltaIran <= -2) {
    m_iranCounter = 1983 * 12 + 5; // 坚守延后1年收复
  }

  if (!iranIraqDenied && !res598Passed && now >= m_iranIraqStart && now < m_iranCounter) {
    syncFl(1684, "IRQ", "iran_iraq", 8);
    syncFl(1663, "IRQ", "iran_iraq", 8);
    syncFl(1692, null, "iran_iraq", 0);
  } else if (!iranIraqDenied && !res598Passed && now >= m_iranCounter && now < m_iranIraqEnd) {
    const prevBasra = ST.frontlines[1692] ? ST.frontlines[1692].occupier : null;
    syncFl(1684, null, "iran_iraq", 0);
    syncFl(1663, null, "iran_iraq", 0);
    if (deltaIran <= -2) {
      syncFl(1692, null, "iran_iraq", 0); // 伊拉克防线固若金汤，阻止巴士拉沦陷
    } else {
      syncFl(1692, "IRN", "iran_iraq", 28);
    }
    if (!silent && !prevBasra && now === m_iranCounter) {
      if (deltaIran >= 2) {
        toast({ y: Math.floor(now / 12), m: (now % 12) || 12, zh: "两伊战局骤变 · 外援助推伊朗提前大反攻", note: "在大国强力外援助推下，伊朗提前收复胡齐斯坦并打入伊拉克巴士拉！" });
      } else if (deltaIran <= -2) {
        toast({ y: Math.floor(now / 12), m: (now % 12) || 12, zh: "两伊战局固守 · 伊拉克防线遏制反攻", note: "得益于外部军援支持，伊拉克守军顽强阻击，巴士拉防线固若金汤。" });
      } else {
        toast({ y: 1982, m: 5, zh: "两伊战局反转 · 伊朗大反攻", note: "伊朗收复胡齐斯坦（阿瓦士与迪兹富勒），并反攻越境兵临伊拉克巴士拉。" });
      }
    }
  } else {
    const hadIranIraq = (ST.frontlines[1684] && ST.frontlines[1684].warId === "iran_iraq") ||
                        (ST.frontlines[1663] && ST.frontlines[1663].warId === "iran_iraq") ||
                        (ST.frontlines[1692] && ST.frontlines[1692].warId === "iran_iraq");
    if (ST.frontlines[1684] && ST.frontlines[1684].warId === "iran_iraq") syncFl(1684, null, "iran_iraq", 0);
    if (ST.frontlines[1663] && ST.frontlines[1663].warId === "iran_iraq") syncFl(1663, null, "iran_iraq", 0);
    if (ST.frontlines[1692] && ST.frontlines[1692].warId === "iran_iraq") syncFl(1692, null, "iran_iraq", 0);
    if (!silent && hadIranIraq && !iranIraqDenied && now === m_iranIraqEnd) {
      if (isDoubleEmbargo) {
        toast({ y: Math.floor(now / 12), m: (now % 12) || 12, zh: "大国禁运斡旋 · 两伊提前停火", note: "面对全面武器禁运与制裁，两伊无力继续消耗战，提前接受调停恢复边界。" });
      } else if (deltaIran >= 2) {
        toast({ y: Math.floor(now / 12), m: (now % 12) || 12, zh: "两伊战事终结 · 伊拉克受创提前停火", note: "伊拉克在持续消耗战中遭受重创，促成联合国停火决议提前生效撤军。" });
      } else {
        toast({ y: 1988, m: 8, zh: "两伊停火 · 联合国598号决议", note: "两伊接受安理会停火决议，双方部队撤回战前国际公认边界。" });
      }
    }
  }

}
function timelineFalklands(now, silent, syncFl) {
  // 2. 马岛战役（falklands，1982-04 ~ 1982-05）
  const res502Passed = !!(isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes("res_502"));
  const sARG = getInterventionScore("ARG");
  const sGBR = getInterventionScore("GBR");
  const isArgSupported = (sARG >= 2 && sGBR < 2);
  const isGbrSwift = (sGBR >= 2);

  const m_falklandsStart = 1982 * 12 + 4;
  let m_falklandsEnd = 1982 * 12 + 6;
  if (isArgSupported) {
    m_falklandsEnd = 1983 * 12 + 6;
  } else if (isGbrSwift) {
    m_falklandsEnd = 1982 * 12 + 5;
  }

  if (!res502Passed && now >= m_falklandsStart && now < m_falklandsEnd) {
    const prevFalklands = ST.frontlines[1248] ? ST.frontlines[1248].occupier : null;
    syncFl(1248, "ARG", "falklands", 27);
    syncFl(1249, "ARG", "falklands", 27);
    if (!silent && !prevFalklands && now === m_falklandsStart) {
      toast({ y: 1982, m: 4, zh: "马岛危机 · 阿根廷登陆占领", note: "阿根廷军队进驻马尔维纳斯群岛（福克兰群岛），战火在南大西洋点燃。" });
    }
  } else {
    const hadFalklands = (ST.frontlines[1248] && ST.frontlines[1248].warId === "falklands") ||
                         (ST.frontlines[1249] && ST.frontlines[1249].warId === "falklands");
    if (ST.frontlines[1248] && ST.frontlines[1248].warId === "falklands") syncFl(1248, null, "falklands", 0);
    if (ST.frontlines[1249] && ST.frontlines[1249].warId === "falklands") syncFl(1249, null, "falklands", 0);
    if (!silent && hadFalklands && now === m_falklandsEnd) {
      if (isArgSupported) {
        toast({ y: 1983, m: 6, zh: "马岛终局 · 战事长期化后停火", note: "在外部大国军援支持下，阿根廷长期据守，最终达成现状停火协议。" });
      } else {
        toast({ y: Math.floor(now / 12), m: (now % 12) || 12, zh: "马岛战役 · 英国特混舰队收复", note: "英军两栖登陆夺回斯坦利与全岛，阿根廷守军投降，群岛控制权复原。" });
      }
    }
  }

}
function timelineGulfWar(now, silent, syncFl) {
  // 3. 海湾战争（gulf_war，1990-08 ~ 1991-02）
  const res660Passed = !!(isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes("res_660"));
  const sGulfIRQ = getInterventionScore("IRQ");
  const sGulfKWT = getInterventionScore("KWT");
  const isGulfSheltered = (sGulfIRQ >= 2 && sGulfKWT < 2);
  const isGulfSwift = (sGulfKWT >= 2 || sGulfIRQ <= -2);

  const m_gulfStart = 1990 * 12 + 8;
  let m_gulfEnd = 1991 * 12 + 3;
  if (isGulfSheltered) {
    m_gulfEnd = 1992 * 12 + 1; // 庇护萨达姆，占领维持至终局
  } else if (isGulfSwift) {
    m_gulfEnd = 1990 * 12 + 11; // 提前光复科威特
  }

  if (!res660Passed && now >= m_gulfStart && now < m_gulfEnd) {
    syncFl(1809, "IRQ", "gulf_war", 127);
  } else {
    const hadGulf = ST.frontlines[1809] && ST.frontlines[1809].warId === "gulf_war";
    if (ST.frontlines[1809] && ST.frontlines[1809].warId === "gulf_war") syncFl(1809, null, "gulf_war", 0);
    if (!silent && hadGulf && now === m_gulfEnd) {
      if (isGulfSwift) {
        toast({ y: 1990, m: 11, zh: "海湾战争 · 盟军极速反攻光复科威特", note: "在大国外援强力支持下，反攻行动提前取得决胜，科威特全境迅速光复！" });
      } else {
        toast({ y: 1991, m: 3, zh: "海湾战争 · 科威特全境光复", note: "多国部队「沙漠风暴」地面进攻获胜，科威特全境解放，主权完全恢复。" });
      }
    }
  }

}

// ---- 战线变化后的统一重绘（R8A：政治/阵营底图热更新 + 悬浮/选中联动） ----
function timelineRepaint() {
  rebuildFrontlinesMap();
  if (bakedNow === "political" || bakedNow === "bloc") {
    bakeNow(bakedNow);
    render();
    drawMini();
    drawOverlay();
  }
  if (ST.hover) setHint(ST.hover);
  if (ST.sel) refreshWarBox(ST.sel);
}

// ---- R8C：战局态势与地缘前线面板反馈 ----
function refreshWarBox(selKey) {
  const box = $("p-war-box");
  if (!box) return;
  if (!selKey) { box.style.display = "none"; box.innerHTML = ""; return; }
  const actualKey = resolvePlayableKey(selKey);
  if (!CM.countries[actualKey]) {
    box.style.display = "none"; box.innerHTML = ""; return;
  }
  const now = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;

  // 活跃战事识别
  const wars = [];
  const isIranIraqActive = now >= (1980 * 12 + 9) && now <= (1988 * 12 + 8) && !(CR.deny && CR.deny.has("iran_iraq_war"));
  const isFalklandsActive = now >= (1982 * 12 + 4) && now <= (1983 * 12 + 6);
  const isGulfActive = now >= (1990 * 12 + 8) && now <= (1991 * 12 + 12);

  if (isIranIraqActive && (actualKey === "IRQ" || actualKey === "IRN")) {
    const sIRQ = getInterventionScore("IRQ"), sIRN = getInterventionScore("IRN");
    const delta = sIRN - sIRQ;
    let phase = "阶段 1：伊拉克突入胡齐斯坦";
    if (delta >= 2 && now >= 1981 * 12 + 9) phase = "阶段 2：伊朗在外援助推下提前大反攻";
    else if (delta <= -2 && now >= 1983 * 12 + 5) phase = "阶段 2：伊拉克巩固防线遏止反攻";
    else if (now >= 1982 * 12 + 5) phase = "阶段 2：伊朗战略反攻兵临巴士拉";
    wars.push({ id: "iran_iraq", name: "两伊战争", phase: phase, enemy: actualKey === "IRQ" ? "IRN" : "IRQ" });
  }
  if (isFalklandsActive && (actualKey === "LAP" || actualKey === "ARG" || actualKey === "GBR")) {
    const sARG = getInterventionScore("ARG");
    let phase = "阿根廷突袭占领马岛群岛";
    if (now >= 1982 * 12 + 6) phase = sARG >= 2 ? "大国外援阻滞英军反攻，阿军长期据守" : "英军特混舰队光复群岛";
    wars.push({ id: "falklands", name: "马岛战役", phase: phase, enemy: actualKey === "GBR" ? "LAP" : "GBR" });
  }
  if (isGulfActive && (actualKey === "IRQ" || actualKey === "ARA" || actualKey === "KWT")) {
    const sIRQ = getInterventionScore("IRQ");
    let phase = "伊拉克吞并科威特全境";
    if (now >= 1991 * 12 + 3 && sIRQ >= 2) phase = "大国庇护阻遏地面战，伊拉克维持吞并";
    else if (now >= 1991 * 12 + 3 || (now >= 1990 * 12 + 11 && getInterventionScore("KWT") >= 2)) phase = "沙漠风暴行动光复科威特";
    wars.push({ id: "gulf_war", name: "海湾危机", phase: phase, enemy: actualKey === "IRQ" ? "ARA" : "IRQ" });
  }

  // 统计前线占领区与沦陷区
  const occupiedPids = [];
  const lostPids = [];
  if (hasFrontlines) {
    for (const k in ST.frontlines) {
      const fl = ST.frontlines[k];
      if (!fl) continue;
      const pid = +k;
      const prov = window.W1980_PROVINCES ? window.W1980_PROVINCES[pid] : null;
      const provName = prov ? prov.name : ("#" + pid);
      const occFed = resolvePlayableKey(fl.occupier);
      const provPolityFed = prov ? resolvePlayableKey(prov.polity) : "";
      if (fl.occupier === actualKey || occFed === actualKey || fl.occupier === selKey) {
        occupiedPids.push(provName + " (#" + pid + ")");
      } else if (prov && (prov.polity === actualKey || provPolityFed === actualKey || prov.polity === selKey)) {
        const occZh = (CM.countries[fl.occupier] || CM.countries[occFed] || {}).zh || fl.occupier;
        lostPids.push(provName + " (沦陷于 " + occZh + ")");
      }
    }
  }

  if (wars.length === 0 && occupiedPids.length === 0 && lostPids.length === 0) {
    box.style.display = "none"; box.innerHTML = ""; return;
  }

  let h = '<div class="wh"><span>⚔ 战局与地缘前线</span><span class="w-badge">' + (wars.length ? wars[0].name : "局部前线") + '</span></div>';
  if (wars.length) {
    h += '<div class="w-sub">' + wars[0].phase + '</div>';
  }
  if (occupiedPids.length) {
    h += '<div class="w-occ"><b class="win">实地占领：</b>' + occupiedPids.join("、") + '</div>';
  }
  if (lostPids.length) {
    h += '<div class="w-occ"><b>本国沦陷：</b>' + lostPids.join("、") + '</div>';
  }

  // 大国干预状态
  const myScore = getInterventionScore(actualKey);
  const enemyScore = wars.length ? getInterventionScore(wars[0].enemy) : 0;
  let imp = "";
  if (ST.player === actualKey) {
    imp = "你作为交战当事国正在前线奋战";
  } else if (myScore > 0) {
    imp = "获得你的军事外援（+" + myScore + "级）：前线作战后勤与推进得到强化";
  } else if (myScore < 0) {
    imp = "遭受你的严厉制裁（" + myScore + "级）：武器禁运与经济封锁重创防线";
  } else if (enemyScore > 0) {
    imp = "对手获得你的外部军援：本国战场攻防承压增加";
  } else if (enemyScore < 0) {
    imp = "对手遭受你的严厉制裁：敌方前线后勤出现动摇";
  } else {
    imp = "大国未直接干预本战局，战场按历史时序拉锯推演";
  }
  h += '<div class="w-impact">★ 外交干预：' + imp + '</div>';

  box.innerHTML = h;
  box.style.display = "block";
}
