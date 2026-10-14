"use strict";


// ---- 经济系统阶段 1：战略资源与能源禀赋面板反馈 ----
function refreshResBox(selKey) {
  const box = $("p-res-box");
  if (!box) return;
  if (!selKey) { box.style.display = "none"; box.innerHTML = ""; return; }
  const actualKey = resolvePlayableKey(selKey);
  const rdata = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(actualKey)) || null;
  if (!rdata) { box.style.display = "none"; box.innerHTML = ""; return; }

  const sm = rdata.summary;
  const badgeColor = sm.securityScore >= 20 ? "#7bc67e" : sm.securityScore >= 0 ? "var(--gold2)" : "#e07a5a";
  let h = '<div class="rh"><span>⚙ 战略资源与能源禀赋</span><span class="r-badge" style="color:' + badgeColor + '">' + sm.tag + '</span></div>';
  h += '<div class="r-grid">';
  const list = [
    { key: "oil", icon: "🛢️", name: "石油天然气" },
    { key: "min", icon: "⛏️", name: "关键矿产" },
    { key: "agr", icon: "🌾", name: "农粮大宗" },
    { key: "tech", icon: "💻", name: "先进技术" }
  ];
  for (const item of list) {
    const rd = rdata[item.key];
    const isPos = rd.net >= 0;
    const sign = isPos ? "+" : "";
    const valCls = isPos ? "pos" : "neg";
    h += '<div class="r-item"><span class="rk">' + item.icon + ' ' + item.name + '</span>' +
      '<span class="rv ' + valCls + '">' + sign + rd.net + ' <small>(' + Math.round(rd.ratio * 100) + '%)</small></span></div>';
  }
  h += '</div>';
  h += '<div class="r-summary"><span>综合战略资源自给度</span><b style="color:' + badgeColor + '">' +
    (sm.net >= 0 ? "+" : "") + sm.net + ' (安全分 ' + (sm.securityScore >= 0 ? "+" : "") + sm.securityScore + ')</b></div>';

  box.innerHTML = h;
  box.style.display = "block";
}

// ---- 经济系统阶段 2 & 3：贸易路线、双轨清算、巴统禁运与能源咽喉封锁 ----
function initTradeState() {
  const T = window.W1980_TRADE;
  if (T) {
    ST.tradeRoutes = T.cloneBaselineRoutes();
    ST.reserves = {};
    if (CM && CM.countries) {
      for (const k in CM.countries) {
        ST.reserves[k] = T.getInitialReserve(k);
      }
    }
  } else {
    ST.tradeRoutes = [];
    ST.reserves = {};
  }
  // R9C 禁运与咽喉航道状态初始化
  ST.cocom = { active: true, strict: false };
  ST.chokepoints = { hormuz: "open" };
  ST.smuggle = { tr_deu_sun_tech: true };
}

function getRouteStatus(r) {
  const fromKey = resolvePlayableKey(r.from);
  const toKey = resolvePlayableKey(r.to);
  const fromBloc = blocOf(fromKey);
  const toBloc = blocOf(toKey);

  // 1. 检查双边二级制裁切断（若两方之一为玩家且对另一方施加 l === 2 极限制裁）
  if (ST.player && ST.sanctions && ST.sanctions.length) {
    const isPlayerSanctioningFrom = (ST.player === toKey && ST.sanctions.some((s) => s.t === fromKey && s.l === 2));
    const isPlayerSanctioningTo = (ST.player === fromKey && ST.sanctions.some((s) => s.t === toKey && s.l === 2));
    if (isPlayerSanctioningFrom || isPlayerSanctioningTo) {
      return {
        status: "sanctioned",
        factor: 0,
        costMultiplier: 1.0,
        tagText: "制裁切断",
        tagCls: "blocked",
        desc: "双边极限制裁全面阻断该贸易通道"
      };
    }
  }

  // 2. 检查巴统（CoCom）高技术出口管制
  const E = window.W1980_EMBARGO;
  const isCocom = E ? E.isCocomRestricted(fromBloc, toBloc, r.res) : false;
  if (isCocom && ST.cocom && ST.cocom.active) {
    const isSmuggled = !!(ST.smuggle && ST.smuggle[r.id]);
    if (isSmuggled && !ST.cocom.strict) {
      return {
        status: "smuggled",
        factor: 1.0,
        costMultiplier: (E && E.COCOM ? E.COCOM.smuggleMultiplier : 1.5),
        tagText: "特种走私 (1.5×)",
        tagCls: "smuggled",
        desc: "通过第三方中立口岸秘密特种转口，买方承担 150% 美元硬通货溢价"
      };
    } else {
      return {
        status: "blocked_cocom",
        factor: 0,
        costMultiplier: 1.0,
        tagText: "巴统禁运",
        tagCls: "blocked",
        desc: "巴统出口管制委员会严格禁运，西方先进技术设备航线完全阻断"
      };
    }
  }

  // 3. 检查战略咽喉海峡（霍尔木兹海峡）
  if (E) {
    const cpImpact = E.getChokepointImpact(r.id, ST.chokepoints);
    if (cpImpact.chokepoint) {
      if (cpImpact.state === "blocked") {
        return {
          status: "blocked_chokepoint",
          factor: cpImpact.factor, // 0.2
          costMultiplier: cpImpact.costFactor, // 2.0
          tagText: "海峡断航 (20%)",
          tagCls: "blocked",
          desc: "霍尔木兹海峡全面布雷封锁，油轮运力大跌 80% 且运费翻倍"
        };
      } else if (cpImpact.state === "contested") {
        return {
          status: "chokepoint_contested",
          factor: cpImpact.factor, // 0.7
          costMultiplier: cpImpact.costFactor, // 1.25
          tagText: "油轮战交火",
          tagCls: "chokepoint",
          desc: "两伊袭船战交火，油轮运力折损 30%，战争险与运费上涨 25%"
        };
      }
    }
  }

  // 4. 正常通行
  return {
    status: "ok",
    factor: 1.0,
    costMultiplier: 1.0,
    tagText: "正常通航",
    tagCls: "ok",
    desc: "国际航道畅通，正常清算交付"
  };
}

function calcResourcePenalty(k) {
  const actualKey = resolvePlayableKey(k);
  if (!window.W1980_RESOURCES) return { penalty: 0, ratio: 1.0 };
  const rdata = window.W1980_RESOURCES.get(actualKey);
  if (!rdata) return { penalty: 0, ratio: 1.0 };

  const flows = getTradeFlows(actualKey);
  const oilData = rdata.oil;
  const effectiveIn = Math.max(0, flows.resImpact.oil);
  const effectiveOut = Math.max(0, -flows.resImpact.oil);
  const avail = oilData.prod + effectiveIn;
  const needed = oilData.cons + effectiveOut;
  const ratio = needed > 0 ? (avail / needed) : 1.0;

  let penalty = 0;
  if (ratio < 0.45) {
    penalty = -clamp((0.45 - ratio) * 3.0, 0, 1.5);
  }
  return { penalty: penalty, ratio: ratio };
}

function getTradeFlows(k) {
  const actualKey = resolvePlayableKey(k);
  const flows = {
    exportRoutes: [],
    importRoutes: [],
    exportUsd: 0,
    importUsd: 0,
    exportTrb: 0,
    importTrb: 0,
    netUsd: 0,
    netTrb: 0,
    resImpact: { oil: 0, min: 0, agr: 0, tech: 0 },
    routeStatuses: {}
  };
  if (!ST.tradeRoutes || !ST.tradeRoutes.length || !window.W1980_TRADE) return flows;

  const T = window.W1980_TRADE;
  for (const r of ST.tradeRoutes) {
    const fromKey = resolvePlayableKey(r.from);
    const toKey = resolvePlayableKey(r.to);
    const annualBaseVal = T.calcAnnualFlow(r);

    const rStat = getRouteStatus(r);
    flows.routeStatuses[r.id] = rStat;

    const deliveredAmount = r.amount * rStat.factor;
    const exportVal = annualBaseVal * rStat.factor;
    const importVal = annualBaseVal * rStat.factor * rStat.costMultiplier;

    if (fromKey === actualKey) {
      flows.exportRoutes.push(r);
      if (r.cur === "TRB") flows.exportTrb += exportVal;
      else flows.exportUsd += exportVal;
      if (flows.resImpact[r.res] !== undefined) flows.resImpact[r.res] -= deliveredAmount;
    }
    if (toKey === actualKey) {
      flows.importRoutes.push(r);
      if (r.cur === "TRB") flows.importTrb += importVal;
      else flows.importUsd += importVal;
      if (flows.resImpact[r.res] !== undefined) flows.resImpact[r.res] += deliveredAmount;
    }
  }

  flows.netUsd = flows.exportUsd - flows.importUsd;
  flows.netTrb = flows.exportTrb - flows.importTrb;
  return flows;
}

function updateMonthlyTrade(y, m) {
  if (!SIM.S || (SIM.S.year === 1980 && SIM.S.month === 0)) return;
  if (!ST.tradeRoutes || !ST.tradeRoutes.length || !window.W1980_TRADE) return;
  const T = window.W1980_TRADE;
  const deltaUsd = {};
  const deltaTrb = {};
  for (const r of ST.tradeRoutes) {
    const f = resolvePlayableKey(r.from);
    const t = resolvePlayableKey(r.to);
    const rStat = getRouteStatus(r);
    const baseVal = T.calcAnnualFlow(r) / 12;
    const exportVal = baseVal * rStat.factor;
    const importVal = baseVal * rStat.factor * rStat.costMultiplier;

    if (r.cur === "TRB") {
      deltaTrb[f] = (deltaTrb[f] || 0) + exportVal;
      deltaTrb[t] = (deltaTrb[t] || 0) - importVal;
    } else {
      deltaUsd[f] = (deltaUsd[f] || 0) + exportVal;
      deltaUsd[t] = (deltaUsd[t] || 0) - importVal;
    }
  }
  for (const k in deltaUsd) {
    if (!ST.reserves[k]) ST.reserves[k] = T.getInitialReserve(k);
    ST.reserves[k].usd += deltaUsd[k];
  }
  for (const k in deltaTrb) {
    if (!ST.reserves[k]) ST.reserves[k] = T.getInitialReserve(k);
    ST.reserves[k].trb += deltaTrb[k];
  }
}

function updateTimelineEmbargo(y, m) {
  if (!SIM.S) return;
  const now = y * 12 + m;
  const isIranIraqActive = !CR.deny.has("iran_iraq_war");
  const res598Passed = !!(isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes("res_598"));
  const mTankerStart = 1984 * 12 + 4;
  const mTankerEnd = 1988 * 12 + 8;

  if (isIranIraqActive && !res598Passed && now >= mTankerStart && now < mTankerEnd) {
    if (ST.chokepoints.hormuz === "open") {
      ST.chokepoints.hormuz = "contested";
    }
  } else if (now >= mTankerEnd || !isIranIraqActive || res598Passed) {
    if (ST.chokepoints.hormuz === "contested") {
      ST.chokepoints.hormuz = "open";
    }
  }
}

function refreshTradeBox(selKey) {
  const box = $("p-trade-box");
  if (!box) return;
  if (!selKey) { box.style.display = "none"; box.innerHTML = ""; return; }
  const actualKey = resolvePlayableKey(selKey);
  const c = CM.countries[actualKey];
  if (!c) { box.style.display = "none"; box.innerHTML = ""; return; }

  const T = window.W1980_TRADE;
  const res = (ST.reserves && ST.reserves[actualKey]) || (T ? T.getInitialReserve(actualKey) : { usd: 3.0, trb: 0.0 });
  const flows = getTradeFlows(actualKey);

  const mUsd = flows.netUsd / 12;
  const mTrb = flows.netTrb / 12;

  const badge = tradeBadge(actualKey, flows);

  const hasTrb = res.trb > 0 || flows.exportTrb > 0 || flows.importTrb > 0 || c.bloc === "WP" || c.bloc === "SOV";

  let h = '<div class="th"><span>🌐 贸易与硬通货清算</span>' +
    '<span class="t-badge" style="color:' + badge.color + '; border-color:' + badge.color + '">' + badge.text + '</span></div>';

  h += tradeReservesHtml(res, flows, mUsd, mTrb, hasTrb);
  h += tradeRoutesHtml(flows);

  // R9C：经济战与咽喉航道安全态势展示
  h += tradeEmbargoHtml(actualKey);

  const isMine = !!ST.player && ST.sel === ST.player;
  if (isMine) h += tradeActionsHtml(actualKey, c);
  h += '</div>';

  box.innerHTML = h;
  box.style.display = "block";

  if (isMine) wireTradeActions();
}

// ---- R9C：贸易面板构造与玩家行动接线（refreshTradeBox 的专注子步骤） ----
function tradeBadge(actualKey, flows) {
  if (actualKey === "SUN") return { text: "双轨清算枢纽", color: "var(--gold2)" };
  if (flows.netUsd > 20) return { text: "巨额顺差出超", color: "#7bc67e" };
  if (flows.netUsd > 5) return { text: "外贸顺差", color: "#7bc67e" };
  if (flows.netUsd < -20) return { text: "巨额逆差承压", color: "#e07a5a" };
  if (flows.netUsd < -5) return { text: "外贸逆差入超", color: "#e07a5a" };
  return { text: "贸易平衡", color: "#7ba4d9" };
}

function tradeReservesHtml(res, flows, mUsd, mTrb, hasTrb) {
  let h = '<div class="t-reserves"><span>USD 自由外汇：<b class="' + (res.usd < 0 ? "bad" : "") + '">' +
    res.usd.toFixed(1) + ' 亿</b></span>' +
    '<span style="font-size:9px; color:' + (mUsd >= 0 ? "#7bc67e" : "#e07a5a") + '">' +
    (mUsd >= 0 ? "+" : "") + mUsd.toFixed(2) + ' 亿/月</span></div>';

  if (hasTrb) {
    h += '<div class="t-reserves"><span>TRB 经互会卢布：<b class="' + (res.trb < 0 ? "bad" : "") + '">' +
      res.trb.toFixed(1) + ' 亿</b></span>' +
      '<span style="font-size:9px; color:' + (mTrb >= 0 ? "#7bc67e" : "#e07a5a") + '">' +
      (mTrb >= 0 ? "+" : "") + mTrb.toFixed(2) + ' 亿/月</span></div>';
  } else {
    h += '<div class="t-reserves"><span>年贸易差额：<b class="' + (flows.netUsd < 0 ? "bad" : "") + '">' +
      (flows.netUsd >= 0 ? "+" : "") + flows.netUsd.toFixed(1) + ' 亿</b></span>' +
      '<span style="font-size:9px; color:var(--dim)">' + (flows.netUsd >= 0 ? "顺差出超" : "外贸赤字") + '</span></div>';
  }
  return h;
}

function tradeRoutesHtml(flows) {
  const T = window.W1980_TRADE;
  const allRoutes = [];
  flows.exportRoutes.forEach((r) => allRoutes.push({ dir: "exp", r: r }));
  flows.importRoutes.forEach((r) => allRoutes.push({ dir: "imp", r: r }));

  let h = '<div class="t-sub">跨国大宗贸易大动脉 (' + allRoutes.length + ')：</div>';
  h += '<div class="t-list">';

  const RES_NAME = { oil: "原油", min: "矿产", agr: "农粮", tech: "技术" };
  const RES_ICON = { oil: "🛢️", min: "⛏️", agr: "🌾", tech: "💻" };

  if (allRoutes.length === 0) {
    h += '<div class="t-empty">暂无跨国大宗战略贸易航线</div>';
  } else {
    for (const item of allRoutes) {
      const r = item.r;
      const isExp = item.dir === "exp";
      const otherKey = isExp ? r.to : r.from;
      const otherZh = (CM.countries[otherKey] || {}).zh || otherKey;
      const annualVal = T ? T.calcAnnualFlow(r) : r.amount;
      const resIcon = RES_ICON[r.res] || "📦";

      const rStat = (flows.routeStatuses && flows.routeStatuses[r.id]) || { status: "ok", tagText: "正常通航", tagCls: "ok", factor: 1.0, costMultiplier: 1.0 };
      const rowCls = "t-row " + (rStat.status === "blocked_cocom" || rStat.status === "sanctioned" ? "blocked" : rStat.status === "smuggled" ? "smuggled" : rStat.status.indexOf("chokepoint") >= 0 ? "chokepoint" : "");
      const deliveredAmt = (r.amount * rStat.factor).toFixed(0);
      const deliveredVal = (isExp ? annualVal * rStat.factor : annualVal * rStat.factor * rStat.costMultiplier).toFixed(1);

      h += '<div class="' + rowCls + '">' +
        '<span class="tdesc" title="' + (rStat.desc || r.desc || "") + '">' +
        (isExp ? "⬆ 出口 " : "⬇ 进口 ") + otherZh + ' (' + resIcon + ' ' + (RES_NAME[r.res] || r.res) + ' ' + deliveredAmt + ')' +
        '<span class="t-tag ' + rStat.tagCls + '">' + rStat.tagText + '</span>' +
        '</span>' +
        '<span class="tval ' + (isExp ? "exp" : "imp") + '">' +
        (isExp ? "+" : "-") + deliveredVal + ' 亿 ' + r.cur +
        '</span></div>';
    }
  }
  return h + '</div>';
}

function tradeEmbargoHtml(actualKey) {
  let h = '<div class="t-embargo">' +
    '<div class="t-embargo-header"><span>⚡ 经济战与航道安全态势</span><span style="font-size:8.5px; color:var(--dim)">冷战战略封锁</span></div>' +
    '<div class="t-embargo-grid">' +
    '<div class="t-embargo-item"><span>巴统高技术禁运</span><span class="badge ' + (ST.cocom.active ? (ST.cocom.strict ? "bad" : "warn") : "ok") + '">' +
    (ST.cocom.active ? (ST.cocom.strict ? "极限制裁" : "生效管制") : "已豁免") + '</span></div>' +
    '<div class="t-embargo-item"><span>霍尔木兹海峡</span><span class="badge ' + (ST.chokepoints.hormuz === "open" ? "ok" : ST.chokepoints.hormuz === "contested" ? "warn" : "bad") + '">' +
    (ST.chokepoints.hormuz === "open" ? "正常通航" : ST.chokepoints.hormuz === "contested" ? "油轮战交火" : "封锁断航") + '</span></div>' +
    '</div>';

  // 能源短缺休克警告
  const rp = calcResourcePenalty(actualKey);
  if (rp.penalty < 0) {
    h += '<div class="t-shock">⚠️ <b>能源危机预警</b>：霍尔木兹海峡受阻导致原油自给满足率跌至 ' + Math.round(rp.ratio * 100) + '%，工业增长承受 <b>' + rp.penalty.toFixed(2) + 'pp/年</b> 结构性震荡折损！</div>';
  }
  return h;
}

function tradeActionsHtml(actualKey, c) {
  let h = '<div class="t-actions">';
  // 西方阵营操作
  if (c.bloc === "NATO" || c.bloc === "W") {
    h += '<button class="t-btn-sub" id="p-btn-cocom">' + (ST.cocom.strict ? "放宽巴统管制" : "升级巴统极限制裁") + '</button>';
    h += '<button class="t-btn-sub" id="p-btn-escort">' + (ST.chokepoints.hormuz === "blocked" ? "护航行动：解除海峡封锁" : ST.chokepoints.hormuz === "contested" ? "护航行动：驱散威胁" : "海峡常态护航巡航") + '</button>';
  } else if (c.bloc === "WP" || c.bloc === "SOV") {
    h += '<button class="t-btn-sub ' + (ST.smuggle.tr_deu_sun_tech ? "active" : "") + '" id="p-btn-smuggle">' + (ST.smuggle.tr_deu_sun_tech ? "关闭特种技术走私" : "开启特种技术走私 (1.5×USD)") + '</button>';
  } else if (actualKey === "IRN" || actualKey === "IRQ") {
    h += '<button class="t-btn-sub ' + (ST.chokepoints.hormuz === "blocked" ? "active" : "") + '" id="p-btn-hormuz">' + (ST.chokepoints.hormuz === "blocked" ? "撤销海峡封锁" : "发动霍尔木兹袭船/封锁") + '</button>';
  }
  h += '</div>';
  h += '<button class="t-btn-add" id="p-trade-add">+ 开辟新跨国战略经贸走廊</button>';
  return h;
}

function wireTradeActions() {
  const toastNow = (zh, note) => toast({
    y: SIM.S ? SIM.S.year : 1980,
    m: SIM.S ? Math.max(1, SIM.S.month) : 1,
    zh: zh,
    note: note
  });
  const after = () => { applyPlayerDecisions(); refreshMilBox(); refreshTradeBox(ST.sel); };
  const wireBtn = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };

  wireBtn("p-trade-add", () =>
    toastNow("跨国战略贸易走廊", "大宗物资长期经贸协定在冷战阵营与地缘条约框架内自动清算维系。"));
  wireBtn("p-btn-cocom", () => {
    ST.cocom.strict = !ST.cocom.strict;
    toastNow("巴统禁运委员会 · " + (ST.cocom.strict ? "升级全面极限制裁" : "恢复标准管制清单"),
      ST.cocom.strict ? "严格彻查一切中立口岸技术转口，彻底切断一切对东方秘密通道。" : "维持标准高新技术禁运清单管制。");
    after();
  });
  wireBtn("p-btn-escort", () => {
    ST.chokepoints.hormuz = "open";
    toastNow("挚诚意志护航行动 · 霍尔木兹恢复通航",
      "西方特遣舰队进驻波斯湾主航道武装护航，压制水雷与袭船威胁，海峡油轮运力完全恢复。");
    after();
  });
  wireBtn("p-btn-smuggle", () => {
    ST.smuggle.tr_deu_sun_tech = !ST.smuggle.tr_deu_sun_tech;
    toastNow("东方情报外贸局 · " + (ST.smuggle.tr_deu_sun_tech ? "启动特种秘密技术转口" : "暂停秘密技术走私通道"),
      ST.smuggle.tr_deu_sun_tech ? "通过中立国空壳企业支付 150% 自由外汇溢价突围采购精密铣床与技术设备。" : "避免外汇储备快速失血，暂停特种采购。");
    after();
  });
  wireBtn("p-btn-hormuz", () => {
    ST.chokepoints.hormuz = (ST.chokepoints.hormuz === "blocked" ? "open" : "blocked");
    toastNow("波斯湾军事令 · " + (ST.chokepoints.hormuz === "blocked" ? "宣布封锁霍尔木兹海峡" : "撤销海峡封锁令"),
      ST.chokepoints.hormuz === "blocked" ? "在咽喉航道布设大面积水雷与岸基反舰导弹，切断波斯湾外运，重创全球能源供应！" : "撤销战时封锁管制，允许中立国油轮恢复通航。");
    after();
  });
}
