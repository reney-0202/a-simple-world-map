"use strict";


// ---- R13A: 全球谍战沙盒与隐蔽行动控制台系统 ----
// Cov2：成功/曝光判定的确定性掷骰（FNV，与 deceptionRoll / prestigeRoll 同族）。
// 盐 + 年月 + 行动 + 目标 → [0,1)；**不**推进 SIM.S.rngState。
function covertRoll(salt, y, m, a, b) {
  let h = 2166136261;
  const s = String(salt) + "|" + y + "|" + m + "|" + a + "|" + b;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function initIntelState(cKey) {
  const k = cKey || ST.player || "DEFAULT";
  const cfg = (window.W1980_INTEL && window.W1980_INTEL.getAgency(k)) || {
    name: "国家安全与反间谍局 (DIS)",
    code: "DIS / 国家安全局",
    icon: "🕵️",
    motto: "“捍卫国家主权与战略边疆防线”",
    initialBudget: 10.0,
    initialCounter: 50
  };
  ST.intel = {
    agency: cfg.name,
    code: cfg.code,
    icon: cfg.icon,
    motto: cfg.motto,
    budget: +(cfg.initialBudget || 10.0).toFixed(1),
    ap: 6,
    maxAp: 10,
    counterLevel: cfg.initialCounter || 50,
    history: [],
    scandalCooldown: 0
  };
  return ST.intel;
}

function sanitizeIntelState(data) {
  if (!data || typeof data !== "object") return null;
  return {
    agency: String(data.agency || "国家安全局"),
    code: String(data.code || "DIS"),
    icon: String(data.icon || "🕵️"),
    motto: String(data.motto || ""),
    budget: typeof data.budget === "number" ? +data.budget.toFixed(1) : 10.0,
    ap: typeof data.ap === "number" ? clamp(data.ap, 0, 10) : 6,
    maxAp: 10,
    counterLevel: typeof data.counterLevel === "number" ? clamp(data.counterLevel, 10, 100) : 50,
    history: Array.isArray(data.history) ? data.history.slice(0, 30) : [],
    scandalCooldown: typeof data.scandalCooldown === "number" ? Math.max(0, data.scandalCooldown) : 0
  };
}

function updateMonthlyIntel(y, m, silent) {
  if (!ST.intel && ST.player) {
    initIntelState(ST.player);
  }
  if (!ST.intel) return;

  // 1. 特工行动力自然恢复 (+1 AP/月，上限 10)
  if (ST.intel.ap < ST.intel.maxAp) {
    ST.intel.ap = Math.min(ST.intel.maxAp, ST.intel.ap + 1);
  }

  // 2. 丑闻调查期冷却
  if (ST.intel.scandalCooldown > 0) {
    ST.intel.scandalCooldown--;
  } else {
    // 正常月份月度黑金拨付 (+0.5 亿美元/月)
    ST.intel.budget = +(ST.intel.budget + 0.5).toFixed(1);
  }

  if (ST.sel && typeof refreshCovertBox === "function") {
    refreshCovertBox(ST.sel);
  }
}

function executeCovertAction(actionId, targetKey, forceSuccess, forceBlowback) {
  if (!window.W1980_INTEL) return { ok: false, error: "INTEL_NOT_LOADED" };
  const act = window.W1980_INTEL.getActionById(actionId);
  if (!act) return { ok: false, error: "INVALID_ACTION" };

  if (!ST.intel) initIntelState(ST.player);
  const intel = ST.intel;

  if (intel.scandalCooldown > 0) {
    toast({ zh: "【特情局冻结】", note: "国会特别检察官调查进行中，隐蔽行动预算暂时冻结！" });
    return { ok: false, error: "SCANDAL_FREEZE" };
  }

  if (intel.budget < act.cost) {
    toast({ zh: "【预算不足】", note: "黑金预算不足，需要 $" + act.cost + " 亿行动资金。" });
    return { ok: false, error: "INSUFFICIENT_BUDGET" };
  }

  if (intel.ap < act.apCost) {
    toast({ zh: "【行动力不足】", note: "特工行动点数不足，需要 " + act.apCost + " AP。" });
    return { ok: false, error: "INSUFFICIENT_AP" };
  }

  // 扣除成本与行动点数
  intel.budget = +(intel.budget - act.cost).toFixed(1);
  intel.ap = intel.ap - act.apCost;

  // 计算目标国安定度与对抗概率
  const tgt = targetKey || (ST.player === "SUN" ? "USA" : "SUN");
  const tgtZh = (CM.countries[tgt] || {}).zh || tgt;
  let tgtStab = 50;
  if (ST.domestic) {
    if (tgt === "SUN" && ST.domestic.sun) tgtStab = Math.max(10, 100 - ST.domestic.sun.unrest);
    else if (tgt === "USA" && ST.domestic.usa) tgtStab = ST.domestic.usa.congressApproval;
    else if (ST.domestic.generals && ST.domestic.generals[tgt]) tgtStab = ST.domestic.generals[tgt].stability;
  }

  const y = SIM.S ? SIM.S.year : 1980;
  const m = SIM.S ? SIM.S.month : 1;
  const odds = window.W1980_INTEL.calcOperationOdds(actionId, ST.player, tgt, intel.counterLevel, tgtStab);
  // Cov2：成功/曝光改确定性哈希（与 C2/E 同族），不推进 SIM.S.rngState。
  let rollSuccess = forceSuccess !== undefined ? !!forceSuccess
    : (covertRoll("ok", y, m, actionId, tgt) < odds.successRate);
  let rollBlowback = forceBlowback !== undefined ? !!forceBlowback
    : (!rollSuccess && covertRoll("bk", y, m, actionId, tgt) < odds.blowbackRate);

  // G（收尾评审）：具体行动效果与丑闻反噬两段抽为独立函数（见下方 covertApply*）。
  const note = covertApplyActionEffect(actionId, { intel: intel, tgt: tgt, tgtZh: tgtZh, rollSuccess: rollSuccess });
  covertApplyBlowback({ intel: intel, act: act, y: y, m: m, rollBlowback: rollBlowback });

  // 记入特情局档案
  const histItem = {
    id: act.id,
    name: act.name,
    target: tgtZh,
    success: rollSuccess,
    blowback: rollBlowback,
    y: y,
    m: m,
    note: note
  };
  intel.history.unshift(histItem);
  if (intel.history.length > 20) intel.history.pop();

  const opToast = {
    y: y,
    m: m,
    zh: "【特情行动】" + act.name + " · " + (rollSuccess ? "达成" : "受挫"),
    note: note
  };
  EV.items.push(opToast);
  EV.unread++;
  renderInbox();
  toast(opToast);

  if (ST.sel) refreshCovertBox(ST.sel);
  return { ok: true, success: rollSuccess, blowback: rollBlowback, note: note };
}

// G（收尾评审）：按行动类型施加效果并返回结果文案，原样搬运
function covertApplyActionEffect(actionId, ctx) {
  const intel = ctx.intel, tgt = ctx.tgt, tgtZh = ctx.tgtZh, rollSuccess = ctx.rollSuccess;
  let note = "";
if (actionId === "counter_intel") {
  intel.counterLevel = clamp(intel.counterLevel + 15, 10, 100);
  note = "本土反间谍网已全面加固升级，抓获 2 名潜伏特工！当前防御等级：" + intel.counterLevel + "%";
} else if (actionId === "proxy_insurgency") {
  if (rollSuccess) {
    if (ST.domestic && ST.domestic.generals && ST.domestic.generals[tgt]) {
      ST.domestic.generals[tgt].stability = clamp(ST.domestic.generals[tgt].stability - 12, 10, 100);
    }
    if (ST.ai && ST.ai.tensions && ST.ai.tensions["USA:SUN"]) {
      ST.ai.tensions["USA:SUN"] = clamp(ST.ai.tensions["USA:SUN"] + 5, 0, 100);
    }
    note = "成功向 " + tgtZh + " 境内游击战线运抵战略物资与无线电，削弱其政权稳定性！";
  } else {
    note = "运送军械的车队遭遇拦截缴获，赞助计划受挫。";
  }
} else if (actionId === "coup_attempt") {
  if (rollSuccess) {
    if (ST.domestic && ST.domestic.generals && ST.domestic.generals[tgt]) {
      ST.domestic.generals[tgt].stability = 75;
    }
    note = "目标国前线兵变成功！亲己方军政过渡委员会宣布接管政权！";
  } else {
    note = "政变阴谋被当事国卫队提前破获，多名联络官被捕。";
  }
} else if (actionId === "tech_smuggle") {
  if (rollSuccess) {
    if (ST.domestic && ST.domestic.sun && ST.player === "SUN") {
      ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage - 6, 0, 100);
    }
    note = "成功经由离岸走私网络获取关键工业数控图纸与微电子芯片，逆向测绘完成！";
  } else {
    note = "走私皮包公司遭海关与联邦特工查封，技术样本被扣押。";
  }
}
  return note;
}

// G（收尾评审）：丑闻反噬（冷却、国会/张力冲击、收件箱入账），原样搬运
function covertApplyBlowback(ctx) {
  const intel = ctx.intel, act = ctx.act, y = ctx.y, m = ctx.m, rollBlowback = ctx.rollBlowback;
if (rollBlowback) {
  intel.scandalCooldown = 6;
  if (ST.player === "USA" && ST.domestic && ST.domestic.usa) {
    ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval - 10, 15, 90);
  }
  if (ST.ai && ST.ai.tensions && ST.ai.tensions["USA:SUN"]) {
    ST.ai.tensions["USA:SUN"] = clamp(ST.ai.tensions["USA:SUN"] + 15, 0, 100);
  }
  const scandalItem = {
    y: y,
    m: m,
    zh: "【特情丑闻曝光】" + act.name + " 败露！",
    note: "行动败露遭国际媒体披露！引发两党国会调查与严重政治外交反噬！",
    isScandal: true
  };
  EV.items.push(scandalItem);
  EV.unread++;
  renderInbox();
  toast(scandalItem);
}
}


function refreshCovertBox(selKey) {
  const box = $("p-covert-box");
  if (!box) return;

  if (!ST.intel && ST.player) initIntelState(ST.player);
  const intel = ST.intel || {
    agency: "国家安全与反间谍局",
    code: "DIS / 观察模式",
    icon: "🕵️",
    motto: "“全球战略防线静默监视”",
    budget: 0,
    ap: 0,
    maxAp: 10,
    counterLevel: 50,
    history: [],
    scandalCooldown: 0
  };

  const isPlayer = !!(ST.player && selKey === ST.player);
  const agencyCfg = (window.W1980_INTEL && window.W1980_INTEL.getAgency(selKey || ST.player)) || {};

  let h = '<div class="covert-hd">';
  h += '<span class="covert-title"><span>' + (agencyCfg.icon || intel.icon || "🕵️") + '</span>' + (agencyCfg.name || intel.agency) + '</span>';
  h += '<span class="covert-code">' + (agencyCfg.code || intel.code) + '</span>';
  h += '</div>';

  if (agencyCfg.motto || intel.motto) {
    h += '<div class="covert-motto">' + (agencyCfg.motto || intel.motto) + '</div>';
  }

  h += '<div class="covert-stats-grid">';
  h += '<div class="covert-stat-card"><span>💰 黑金预算池</span><span class="covert-stat-val">$' + intel.budget + ' 亿</span></div>';
  h += '<div class="covert-stat-card"><span>⚡ 行动力 (AP)</span><span class="covert-stat-val">' + intel.ap + ' / ' + intel.maxAp + '</span></div>';
  h += '<div class="covert-stat-card"><span>🛡️ 反间谍等级</span><span class="covert-stat-val">' + intel.counterLevel + '%</span></div>';
  h += '<div class="covert-stat-card"><span>⚠️ 调查状态</span><span class="covert-stat-val" style="color:' + (intel.scandalCooldown > 0 ? '#ff7b72' : '#56d364') + '">' + (intel.scandalCooldown > 0 ? ('调查冻结中(' + intel.scandalCooldown + '月)') : '机密运转中') + '</span></div>';
  h += '</div>';

  // 行动列表
  h += '<div class="covert-actions-list">';
  const acts = window.W1980_INTEL ? window.W1980_INTEL.getActions() : [];
  for (let i = 0; i < acts.length; i++) {
    const act = acts[i];
    const canAfford = intel.budget >= act.cost && intel.ap >= act.apCost && intel.scandalCooldown === 0;
    h += '<div class="covert-act-card">';
    h += '<div class="covert-act-hd">';
    h += '<span class="covert-act-name"><span>' + act.icon + '</span>' + act.name + '</span>';
    h += '<span class="covert-act-cost">$' + act.cost + '亿 | ' + act.apCost + ' AP</span>';
    h += '</div>';
    h += '<div class="covert-act-desc">' + act.desc + '</div>';
    h += '<div class="covert-act-footer">';
    h += '<span class="covert-act-odds">' + (act.effectSummary || '') + '</span>';
    if (isPlayer) {
      h += '<button class="covert-act-btn" data-act="' + act.id + '" ' + (canAfford ? '' : 'disabled') + '>执行指令</button>';
    }
    h += '</div>';
    h += '</div>';
  }
  h += '</div>';

  // C（情报估算）：把「带误差的读数」并入情报机构面板 ——
  // 信息有质量这件事，理应出现在管情报的那块面板上。
  if (typeof estimatesPanelHtml === "function") h += estimatesPanelHtml();

  // C2（情报误报）：欺骗行动与反情报护盾 —— 信息也会**说谎**这件事
  // 同样属于管情报的面板。只显示自己的欺敌（敌方的伪造不可见）。
  if (typeof deceptionPanelHtml === "function") h += deceptionPanelHtml();

  // 历史战报
  if (intel.history && intel.history.length) {
    h += '<div class="covert-history-hd">📜 近期隐蔽行动档案</div>';
    h += '<div class="covert-history-list">';
    for (let j = 0; j < Math.min(4, intel.history.length); j++) {
      const hi = intel.history[j];
      h += '<div class="covert-history-item' + (hi.blowback ? ' blowback' : '') + '">';
      h += hi.y + '-' + String(hi.m).padStart(2, '0') + ' ' + (hi.success ? '✔' : '✘') + ' ' + hi.name + (hi.target ? (' → ' + hi.target) : '') + '：' + hi.note;
      h += '</div>';
    }
    h += '</div>';
  }

  box.innerHTML = h;

  box.querySelectorAll(".covert-act-btn").forEach((btn) => {
    btn.onclick = () => {
      const actId = btn.dataset.act;
      executeCovertAction(actId, null);
    };
  });

  // C（情报估算）：专项评估按钮
  box.querySelectorAll(".est-focus-btn").forEach((btn) => {
    btn.onclick = () => {
      focusIntelligence(btn.dataset.est);
      refreshCovertBox(selKey);
      if (ST.sel) refreshDomesticBox(ST.sel);
    };
  });

  // C2（情报误报）：欺敌 / 反情报按钮
  box.querySelectorAll(".dc-btn").forEach((btn) => {
    if (btn.disabled) return;
    btn.onclick = () => {
      startDeception(btn.dataset.dec);
      refreshCovertBox(selKey);
      if (ST.sel) refreshDomesticBox(ST.sel);
    };
  });
}

// ---- R13A: 隐蔽行动与全球谍战沙盒全链路专用探针 ----
function runIntelProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("INTELPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {

  // G（收尾评审）：本探针的阶段正文抽为两个推进器（见下方 runIntelProbePhase*）。
  const ctx = {};
  runIntelProbePhase1(r, assert, ctx);
  runIntelProbePhase2(r, assert, ctx);

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "intelprobe"; d.style.display = "none";
  d.textContent = "INTELPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runIntelProbe 的阶段一（原样搬运，无逻辑改动）
function runIntelProbePhase1(r, assert, ctx) {
  // 1. 核心数据库与函数存在性
  assert("intelDbLoaded", !!window.W1980_INTEL && Array.isArray(window.W1980_INTEL.ACTIONS), "W1980_INTEL 数据库应成功载入");
  assert("agencyDefinitionsExist", !!window.W1980_INTEL.AGENCIES.USA && !!window.W1980_INTEL.AGENCIES.SUN, "美苏情报局定义完备");
  assert("actionCountFour", window.W1980_INTEL.ACTIONS.length === 4, "隐蔽行动库应包含 4 大行动");
  assert("proxyInsurgencyDefined", !!window.W1980_INTEL.getActionById("proxy_insurgency"), "代理人游击战赞助已定义");
  assert("coupAttemptDefined", !!window.W1980_INTEL.getActionById("coup_attempt"), "政变策动行动已定义");
  assert("counterIntelDefined", !!window.W1980_INTEL.getActionById("counter_intel"), "反间谍防御行动已定义");
  assert("techSmuggleDefined", !!window.W1980_INTEL.getActionById("tech_smuggle"), "特种技术走私已定义");

  // 2. 核心 API 函数定义
  assert("initIntelStateExists", typeof initIntelState === "function", "initIntelState 应已定义");
  assert("sanitizeIntelStateExists", typeof sanitizeIntelState === "function", "sanitizeIntelState 应已定义");
  assert("updateMonthlyIntelExists", typeof updateMonthlyIntel === "function", "updateMonthlyIntel 应已定义");
  assert("executeCovertActionExists", typeof executeCovertAction === "function", "executeCovertAction 应已定义");
  assert("refreshCovertBoxExists", typeof refreshCovertBox === "function", "refreshCovertBox 应已定义");
}

// G（收尾评审）：runIntelProbe 的阶段二（原样搬运，无逻辑改动）
function runIntelProbePhase2(r, assert, ctx) {
  // 3. DOM 容器与布局校验
  const covertBox = $("p-covert-box");
  const dipPane = $("p-pane-diplomacy");
  assert("covertBoxDomExists", !!covertBox, "#p-covert-box 应存在于 DOM 中");
  assert("diplomacyPaneContainsCovertBox", dipPane && dipPane.contains(covertBox), "#p-pane-diplomacy 包含 #p-covert-box");

  // 4. 国家特情局初始状态校验
  initIntelState("USA");
  assert("initialStateUSA", ST.intel && ST.intel.budget === 25.0 && ST.intel.ap === 6 && ST.intel.agency.includes("CIA"), "美国初始 CIA 黑金预算 25 亿与 6 AP");

  initIntelState("SUN");
  assert("initialStateSUN", ST.intel && ST.intel.budget === 22.0 && ST.intel.agency.includes("KGB"), "苏联初始 KGB 黑金预算 22 亿与 70% 防御");

  initIntelState("CHN");
  assert("initialStateCHN", ST.intel && ST.intel.budget === 15.0 && ST.intel.agency.includes("MSS"), "中国初始特情局黑金预算 15 亿");

  // 5. 月度演进：AP 自然恢复与预算增长
  ST.intel.ap = 3;
  const prevBudget = ST.intel.budget;
  updateMonthlyIntel(1980, 2, true);
  assert("apRecoversMonthly", ST.intel.ap === 4, "月度演进特工行动力恢复 +1 AP");
  assert("budgetReplenishesMonthly", ST.intel.budget > prevBudget, "月度黑金预算正常拨付增长");

  // 6. 执行反间谍防御行动
  const prevCounter = ST.intel.counterLevel;
  const resCounter = executeCovertAction("counter_intel");
  assert("counterIntelSuccess", resCounter.ok === true && ST.intel.counterLevel === prevCounter + 15, "反间谍防御行动提升防御等级 +15%");

  // 7. 执行代理人游击队赞助行动 (消耗预算与 AP，记入历史)
  const prevAp = ST.intel.ap;
  const prevB = ST.intel.budget;
  const resProxy = executeCovertAction("proxy_insurgency");
  assert("proxyActionExecuted", resProxy.ok === true, "代理人赞助行动顺利执行");
  assert("actionConsumesApAndBudget", ST.intel.ap === prevAp - 2 && Math.abs(ST.intel.budget - (prevB - 3.0)) < 0.1, "正确扣除 2 AP 与 3 亿黑金");
  assert("historyRecorded", ST.intel.history.length >= 2, "行动历史成功记入战报档案");

  // 8. 苏联技术走私缓解轻工短缺
  ST.player = "SUN";
  initIntelState("SUN");
  if (ST.domestic && ST.domestic.sun) {
    ST.domestic.sun.shortage = 50;
    executeCovertAction("tech_smuggle", null, true, false);
    assert("techSmuggleReducesSunShortage", ST.domestic.sun.shortage <= 44, "苏联技术走私成功缓解消费品短缺");
  }

  // 9. 丑闻曝光与国会反噬
  ST.player = "USA";
  initIntelState("USA");
  executeCovertAction("coup_attempt", "NIC", false, true);
  assert("blowbackTriggersScandalAndFreezesBudget", ST.intel.scandalCooldown === 6, "丑闻败露启动 6 个月调查冻结期");
  const blockedRes = executeCovertAction("proxy_insurgency");
  assert("scandalBlocksActions", blockedRes.ok === false && blockedRes.error === "SCANDAL_FREEZE", "调查冻结期间禁止发起隐蔽行动");

  // 10. 界面渲染校验
  ST.player = "USA";
  refreshCovertBox("USA");
  assert("uiRendersCiaForUSA", covertBox.innerHTML.includes("CIA") && covertBox.innerHTML.includes("黑金预算池"), "成功渲染美国 CIA 控制台");

  refreshCovertBox("SUN");
  assert("uiRendersKgbForSUN", covertBox.innerHTML.includes("KGB"), "成功渲染苏联 KGB 控制台");

  refreshCovertBox("CHN");
  assert("uiRendersMssForCHN", covertBox.innerHTML.includes("MSS"), "成功渲染中国 MSS 控制台");

  // 11. 旁观模式零漂移铁律
  ST.player = null;
  applyPlayerDecisions();
  const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
  assert("spectatorZeroPmods", pmodsCount === 0, "旁观模式下特情系统绝对 0 pmods 注入 (0 漂移)");

  // 12. simSave() / simLoad() 全量往返序列化
  ST.player = "USA";
  initIntelState("USA");
  ST.intel.budget = 19.8;
  ST.intel.ap = 7;
  simSave();
  ST.intel = null;
  assert("stateCleanedBeforeLoad", ST.intel === null, "读档前清空状态生效");
  simLoad();
  assert("simSaveLoadRoundTrip", ST.intel && Math.abs(ST.intel.budget - 19.8) < 0.1 && ST.intel.ap === 7, "simSave/simLoad 100% 往返恢复特情局状态");

  // 恢复纯净环境
  ST.player = null;
  ST.mil = 0;
  ST.intel = null;
  applyPlayerDecisions();
  refreshCovertBox(ST.sel);
}

// ---- R13C: 时代音效架构与触点管理 ----
function refreshSoundBtn() {
  const b = $("b-sound");
  if (!b) return;
  const isMuted = ST.sound ? !!ST.sound.muted : false;
  b.textContent = isMuted ? "🔇" : "🔊";
  b.title = isMuted ? "时代音效已静音（点击开启）" : "时代音效开启中（点击静音）";
  b.classList.toggle("muted", isMuted);
}

function toggleSoundMute() {
  if (!ST.sound) ST.sound = { muted: false, vol: 0.6 };
  ST.sound.muted = !ST.sound.muted;
  if (window.W1980_SOUND) {
    window.W1980_SOUND.setMuted(ST.sound.muted);
  }
  refreshSoundBtn();
  toast({
    y: SIM.S ? SIM.S.year : 1980,
    m: SIM.S ? Math.max(1, SIM.S.month) : 1,
    zh: ST.sound.muted ? "时代音效已静音" : "时代音效已开启",
    note: ST.sound.muted ? "所有交互合成器进入静音保护状态" : "Web Audio 纯合成时代触点音效就绪"
  });
}


function wirePanelTabs() {
  const tabs = $("panel-tabs");
  if (!tabs) return;
  tabs.querySelectorAll(".p-tab-btn").forEach((b) => {
    b.onclick = () => {
      setPanelTab(b.dataset.tab);
    };
  });
}
