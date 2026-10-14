"use strict";


// ---- R13A: 全球谍战沙盒与隐蔽行动控制台系统 ----
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

  const odds = window.W1980_INTEL.calcOperationOdds(actionId, ST.player, tgt, intel.counterLevel, tgtStab);
  let rollSuccess = forceSuccess !== undefined ? !!forceSuccess : (Math.random() < odds.successRate);
  let rollBlowback = forceBlowback !== undefined ? !!forceBlowback : (!rollSuccess && Math.random() < odds.blowbackRate);

  const y = SIM.S ? SIM.S.year : 1980;
  const m = SIM.S ? SIM.S.month : 1;

  // 执行具体行动效果
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

  // 丑闻反噬判断
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
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "intelprobe"; d.style.display = "none";
  d.textContent = "INTELPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// ---- R13B: 阿富汗战争泥潭与帝国消耗槽状态机 ----
function initAfghanState() {
  const A = window.W1980_AFGHAN;
  const initialBleed = A ? A.calcBleedingCost(105000, 85, false, "standard") : 3.5;
  ST.afghan = {
    troops: 105000,
    bleedingCost: initialBleed,
    resistance: 65,
    airSuperiority: 85,
    stingerActive: false,
    withdrawn: false,
    withdrawing: false,
    withdrawMonths: 0,
    policy: "standard",
    history: []
  };
  return ST.afghan;
}

function sanitizeAfghanState(d) {
  if (!d || typeof d !== "object") return initAfghanState();
  return {
    troops: clamp(typeof d.troops === "number" ? d.troops : 105000, 0, 200000),
    bleedingCost: clamp(typeof d.bleedingCost === "number" ? d.bleedingCost : 3.5, 0, 20),
    resistance: clamp(typeof d.resistance === "number" ? d.resistance : 65, 0, 100),
    airSuperiority: clamp(typeof d.airSuperiority === "number" ? d.airSuperiority : 85, 0, 100),
    stingerActive: !!d.stingerActive,
    withdrawn: !!d.withdrawn,
    withdrawing: !!d.withdrawing,
    withdrawMonths: clamp(typeof d.withdrawMonths === "number" ? d.withdrawMonths : 0, 0, 24),
    policy: typeof d.policy === "string" ? d.policy : "standard",
    history: Array.isArray(d.history) ? d.history.slice(0, 50) : []
  };
}

function updateMonthlyAfghan(y, m, silent) {
  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  if (!window.W1980_AFGHAN) return;
  const A = window.W1980_AFGHAN;

  // 1986-06: 史实毒刺防空导弹入阿节点（若尚未提前触发）
  if (!af.stingerActive && (y > 1986 || (y === 1986 && m >= 6))) {
    af.stingerActive = true;
    af.airSuperiority = 35;
    af.resistance = Math.min(95, af.resistance + 15);
    af.history.push({ y: y, m: m, event: "stinger_deployed", note: "中情局旋风行动毒刺防空导弹秘密入阿，苏军米-24雌鹿直升机空优被打破！" });
    if (!silent && !CR.probeMode && (ST.player === "SUN" || ST.player === "USA")) {
      toast({ zh: "【战地加急：毒刺入阿】", note: "阿富汗游击队装备美制毒刺单兵防空导弹，苏军直升机与运输机战损激增！" });
    }
  }

  const isPlayerSun = (ST.player === "SUN");
  if (!isPlayerSun) {
    // 旁观模式或非苏联玩家：走史实基准（1988-05 启动撤军，1989-02 完成撤军）
    if (!af.withdrawn) {
      if (y > 1988 || (y === 1988 && m >= 5)) {
        af.withdrawing = true;
        if (y > 1989 || (y === 1989 && m >= 2)) {
          af.withdrawn = true;
          af.withdrawing = false;
          af.troops = 0;
          af.bleedingCost = 0;
          af.history.push({ y: 1989, m: 2, event: "withdrawn_historical", note: "格罗莫夫中将率部走过阿姆河友谊桥，苏军完成全部撤军！" });
        } else {
          const monthsPassed = (y - 1988) * 12 + (m - 5) + 1;
          af.withdrawMonths = Math.min(9, monthsPassed);
          af.troops = Math.max(0, 105000 - Math.round((105000 / 9) * af.withdrawMonths));
          af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
        }
      } else {
        af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
      }
    }
  } else {
    // 玩家为苏联：若处于撤军中
    if (af.withdrawing && !af.withdrawn) {
      af.withdrawMonths++;
      af.troops = Math.max(0, af.troops - Math.round(105000 / 9));
      af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, af.policy);
      if (af.withdrawMonths >= 9 || af.troops <= 0) {
        af.withdrawn = true;
        af.withdrawing = false;
        af.troops = 0;
        af.bleedingCost = 0;
        af.history.push({ y: y, m: m, event: "withdrawn_player", note: "友谊桥撤军圆满完成！终结阿富汗泥潭，释放 +0.35pp/年 和平红利！" });
        applyPlayerDecisions();
        if (!silent && !CR.probeMode) {
          toast({ zh: "【友谊桥撤军完成】", note: "最后一批苏军官兵跨过阿姆河友谊桥，彻底止血，释放 +0.35pp 和平红利！" });
        }
      }
    } else if (!af.withdrawn) {
      af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, af.policy);
    }
  }

  if (ST.sel && typeof refreshAfghanBox === "function") {
    refreshAfghanBox(ST.sel);
  }
}

function setAfghanPolicy(policyId) {
  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const A = window.W1980_AFGHAN;

  if (policyId === "stinger_supply") {
    if (af.stingerActive) {
      toast({ zh: "【已部署】", note: "毒刺防空导弹已全面扩散，无需重复部署。" });
      return { ok: false, error: "ALREADY_ACTIVE" };
    }
    af.stingerActive = true;
    af.airSuperiority = 35;
    af.resistance = Math.min(95, af.resistance + 15);
    af.history.push({ y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1, event: "stinger_supplied_by_player", note: "中情局【旋风行动】提前将毒刺防空导弹秘密运抵阿富汗，重创苏军空中优势！" });
    toast({ zh: "【旋风行动出击】", note: "成功向圣战者游击队交付 500 枚毒刺便携防空导弹，苏军直升机空优被打破！" });
    if (ST.sel) refreshAfghanBox(ST.sel);
    return { ok: true, policy: "stinger_supply" };
  }

  if (ST.player !== "SUN") {
    toast({ zh: "【权限受限】", note: "仅苏联最高统帅部有权调整驻阿第 40 集团军战区战略。" });
    return { ok: false, error: "NOT_SOVIET_PLAYER" };
  }

  if (af.withdrawn) {
    toast({ zh: "【已撤军】", note: "苏军已全部撤离阿富汗战区，该战略不再适用。" });
    return { ok: false, error: "ALREADY_WITHDRAWN" };
  }

  if (policyId === "geneva_withdraw") {
    if (af.withdrawing) {
      toast({ zh: "【撤军中】", note: "日内瓦撤军程序正在推进中。" });
      return { ok: false, error: "ALREADY_WITHDRAWING" };
    }
    af.withdrawing = true;
    af.withdrawMonths = 0;
    af.policy = "geneva_withdraw";
    af.history.push({ y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1, event: "geneva_withdrawal_started", note: "最高苏维埃正式签署日内瓦停火协议，全面启动阿姆河友谊桥撤军！" });
    toast({ zh: "【签署日内瓦协议】", note: "苏军驻阿第 40 集团军启动为期 9 个月的分阶段体面撤军！" });
  } else if (policyId === "surge") {
    af.policy = "surge";
    af.troops = Math.min(135000, af.troops + 20000);
    af.resistance = Math.max(30, af.resistance - 15);
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "surge");
    if (ST.domestic && ST.domestic.sun) {
      ST.domestic.sun.shortage = Math.min(100, (ST.domestic.sun.shortage || 30) + 6);
    }
    af.history.push({ y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1, event: "surge_launched", note: "向兴都库什山脉增派 2 万精锐空降师展开铁拳扫荡！" });
    toast({ zh: "【增兵扫荡攻势】", note: "增援部队已抵达战区，压制游击武装，但财政失血与国内物资短缺加剧。" });
  } else if (policyId === "consolidate") {
    af.policy = "consolidate";
    af.troops = Math.max(70000, af.troops - 15000);
    af.resistance = Math.min(90, af.resistance + 10);
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "consolidate");
    af.history.push({ y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? SIM.S.month : 1, event: "consolidated_bases", note: "撤出高危外围哨所，主力收缩固守喀布尔、巴格拉姆与萨朗隧道交通线。" });
    toast({ zh: "【战术收缩防卫】", note: "部队收缩至主要城市与核心交通线，减少非必要战损与财政消耗。" });
  } else {
    af.policy = "standard";
    af.bleedingCost = A.calcBleedingCost(af.troops, af.airSuperiority, af.stingerActive, "standard");
  }

  if (ST.sel) refreshAfghanBox(ST.sel);
  return { ok: true, policy: af.policy };
}

function refreshAfghanBox(selKey) {
  const box = $("p-afghan-box");
  if (!box) return;

  if (!ST.afghan) initAfghanState();
  const af = ST.afghan;
  const A = window.W1980_AFGHAN;
  const y = SIM.S ? SIM.S.year : 1980;
  const m = SIM.S ? SIM.S.month : 1;
  const phase = A ? A.getPhase(y, m) : { name: "阿富汗战役态势", desc: "" };

  let h = '<div class="afghan-hd">';
  h += '<span class="afghan-title"><span>🏔️</span>阿富汗战区态势 · 帝国失血槽</span>';
  h += '<span class="afghan-code">40TH ARMY // KABUL-HQ</span>';
  h += '</div>';

  h += '<div style="display:flex;justify-content:space-between;align-items:center">';
  h += '<span class="afghan-phase-badge">' + phase.name + '</span>';
  h += '<span style="font-size:10px;color:#8b949e">' + (af.withdrawn ? '已终结撤出' : (af.withdrawing ? '友谊桥撤军中' : '交战相持中')) + '</span>';
  h += '</div>';
  h += '<div class="afghan-phase-desc">' + phase.desc + '</div>';

  // 4 宫格数据
  h += '<div class="afghan-stats-grid">';
  h += '<div class="afghan-stat-card"><span>🎖️ 驻阿兵力</span><span class="afghan-stat-val">' + (af.withdrawn ? '0 (已撤离)' : (af.troops.toLocaleString() + ' 人')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>🩸 月度失血槽</span><span class="afghan-stat-val" style="color:' + (af.withdrawn ? '#56d364' : '#ff7b72') + '">' + (af.withdrawn ? '$0.0 亿' : ('$' + af.bleedingCost + ' 亿')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>🚁 制空权优势</span><span class="afghan-stat-val" style="color:' + (af.airSuperiority > 50 ? '#56d364' : '#d29922') + '">' + (af.withdrawn ? '—' : (af.airSuperiority + '%')) + '</span></div>';
  h += '<div class="afghan-stat-card"><span>⚔️ 游击队烈度</span><span class="afghan-stat-val">' + (af.withdrawn ? '政权孤守' : (af.resistance + '%')) + '</span></div>';
  h += '</div>';

  // 毒刺警报
  if (af.stingerActive && !af.withdrawn) {
    h += '<div class="afghan-alert-bar"><span>🚨 警报：敌方列装 FIM-92 毒刺防空导弹，苏军低空掩护遭严重压制！</span></div>';
  } else if (!af.withdrawn) {
    h += '<div class="afghan-alert-bar afghan-alert-safe"><span>🛡️ 态势：苏军米-24 雌鹿直升机维持空中火力优势与交通线掩护。</span></div>';
  }

  // 撤军进度条
  if (af.withdrawing || af.withdrawn) {
    const pct = af.withdrawn ? 100 : Math.round((af.withdrawMonths / 9) * 100);
    h += '<div class="afghan-withdraw-box">';
    h += '<div class="afghan-withdraw-title"><span>🌉 阿姆河友谊桥大撤军进度：</span><b style="color:#f0f6fc">' + pct + '% (' + (af.withdrawn ? '完成' : (af.withdrawMonths + '/9 月')) + ')</b></div>';
    h += '<div class="afghan-withdraw-bar"><div class="afghan-withdraw-fill" style="width:' + pct + '%"></div></div>';
    h += '</div>';
  }

  // 操作按钮
  h += '<div class="afghan-policies">';
  if (ST.player === "SUN" && !af.withdrawn) {
    const isSurge = af.policy === "surge";
    const isCons = af.policy === "consolidate";
    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">⚡ 派驻精锐增援部队扫荡</span><span class="afghan-pol-badge">兵力+2万 | 失血+$1.5亿</span></div>';
    h += '<div class="afghan-pol-desc">向山地派驻增援重兵压制游击队，但加剧国内物资短缺与财政消耗。</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (isSurge ? '当前生效中' : '') + '</span><button class="afghan-pol-btn" data-act="surge" ' + (isSurge || af.withdrawing ? 'disabled' : '') + '>下达指令</button></div>';
    h += '</div>';

    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🛡️ 战术收缩·固守核心要点</span><span class="afghan-pol-badge">兵力-1.5万 | 失血-$1.0亿</span></div>';
    h += '<div class="afghan-pol-desc">撤出边远偏僻高危哨所，收缩固守喀布尔、巴格拉姆与萨朗隧道。</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (isCons ? '当前生效中' : '') + '</span><button class="afghan-pol-btn" data-act="consolidate" ' + (isCons || af.withdrawing ? 'disabled' : '') + '>下达指令</button></div>';
    h += '</div>';

    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🕊️ 签署日内瓦协议·友谊桥大撤军</span><span class="afghan-pol-badge" style="color:#56d364">和平红利 +0.35pp</span></div>';
    h += '<div class="afghan-pol-desc">签署日内瓦停火协议，开启 9 个月撤军程序。彻底摆脱失血泥潭并释放和平红利！</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:#8b949e">' + (af.withdrawing ? '撤军进行中' : '') + '</span><button class="afghan-pol-btn" data-act="geneva_withdraw" ' + (af.withdrawing ? 'disabled' : '') + '>签署撤军</button></div>';
    h += '</div>';
  } else if (ST.player === "USA" && !af.withdrawn) {
    h += '<div class="afghan-pol-card">';
    h += '<div class="afghan-pol-hd"><span class="afghan-pol-name">🚀 【旋风行动】运送毒刺防空导弹</span><span class="afghan-pol-badge">中情局援助</span></div>';
    h += '<div class="afghan-pol-desc">秘密向圣战者游击队运送 FIM-92 便携防空导弹，击落敌方战机，打破苏军空中优势！</div>';
    h += '<div class="afghan-pol-footer"><span style="font-size:10px;color:' + (af.stingerActive ? '#56d364' : '#8b949e') + '">' + (af.stingerActive ? '✔ 毒刺已部署' : '尚未投入') + '</span><button class="afghan-pol-btn" data-act="stinger_supply" ' + (af.stingerActive ? 'disabled' : '') + '>执行行动</button></div>';
    h += '</div>';
  } else if (af.withdrawn) {
    h += '<div style="font-size:11px;color:#56d364;padding:6px 8px;background:#0d1117;border-radius:3px">✔ 苏军已全线跨过阿姆河友谊桥撤离阿富汗，战区失血槽已彻底归零。</div>';
  } else {
    h += '<div style="font-size:10.5px;color:#8b949e;padding:6px 8px;background:#0d1117;border-radius:3px">🔭 驻阿第 40 集团军按冷战史实轨道演进中（旁观模式零漂移）。</div>';
  }
  h += '</div>';

  box.innerHTML = h;

  box.querySelectorAll(".afghan-pol-btn").forEach((btn) => {
    btn.onclick = () => {
      const act = btn.dataset.act;
      setAfghanPolicy(act);
    };
  });
}

// ---- R13B: 阿富汗战争泥潭与帝国消耗槽全链路专用探针 ----
function runAfghanProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AFGHANPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 数据库完备性
    assert("afghanDbLoaded", !!window.W1980_AFGHAN && Array.isArray(window.W1980_AFGHAN.PHASES), "W1980_AFGHAN 数据库已就绪");
    assert("phasesCount5", window.W1980_AFGHAN.PHASES.length === 5, "包含 5 大战役阶段");
    assert("phaseStalemateDefined", !!window.W1980_AFGHAN.getPhase(1980, 5), "1980 初期山地扫荡阶段有效");
    assert("phaseStingerDefined", window.W1980_AFGHAN.getPhase(1986, 8).id === "stinger_1986", "1986 毒刺转折阶段有效");
    assert("phaseWithdrawalDefined", window.W1980_AFGHAN.getPhase(1988, 10).id === "withdrawal_1988", "1988 友谊桥撤军阶段有效");
    assert("phasePostSovietDefined", window.W1980_AFGHAN.getPhase(1990, 5).id === "post_soviet_1989", "1990 后苏残局阶段有效");

    // 2. 状态机与核心函数
    assert("initAfghanStateExists", typeof initAfghanState === "function", "initAfghanState 存在");
    assert("sanitizeAfghanStateExists", typeof sanitizeAfghanState === "function", "sanitizeAfghanState 存在");
    assert("updateMonthlyAfghanExists", typeof updateMonthlyAfghan === "function", "updateMonthlyAfghan 存在");
    assert("setAfghanPolicyExists", typeof setAfghanPolicy === "function", "setAfghanPolicy 存在");
    assert("refreshAfghanBoxExists", typeof refreshAfghanBox === "function", "refreshAfghanBox 存在");

    // 3. DOM 挂载检查
    const afBox = $("p-afghan-box");
    assert("afghanBoxInDom", !!afBox, "#p-afghan-box 存在于 DOM");
    const defPane = $("p-pane-defense");
    assert("defensePaneContainsAfghanBox", !!defPane && defPane.contains(afBox), "控制台挂载在国防与干预选项卡");

    // 4. 初始状态与数值计算
    initAfghanState();
    assert("initialTroops105k", ST.afghan.troops === 105000, "初始第 40 集团军兵力 10.5 万人");
    assert("initialBleedingCost", ST.afghan.bleedingCost > 3.0 && ST.afghan.bleedingCost < 4.0, "初始月度失血槽约 $3.5 亿/月");
    assert("initialAirSuperiority", ST.afghan.airSuperiority === 85, "初始米-24 雌鹿空优 85%");
    assert("initialStingerFalse", ST.afghan.stingerActive === false, "初始毒刺尚未入阿");

    // 5. 1986 毒刺事件自动触发
    updateMonthlyAfghan(1986, 6, true);
    assert("stingerTriggeredIn1986", ST.afghan.stingerActive === true, "1986-06 自动触发毒刺导弹转折");
    assert("airSuperiorityDropped", ST.afghan.airSuperiority === 35, "毒刺入阿后空优骤降至 35%");
    assert("resistanceIncreased", ST.afghan.resistance > 70, "游击队抵抗烈度上升");

    // 6. 苏联玩家策略：增兵扫荡
    ST.player = "SUN";
    setAfghanPolicy("surge");
    assert("surgeTroopsIncreased", ST.afghan.troops === 125000, "增兵扫荡增调 2 万精锐部队");
    assert("surgeBleedingCostHigher", ST.afghan.bleedingCost > 4.5, "增兵后月度失血成本增加");

    // 7. 苏联玩家策略：战术收缩
    setAfghanPolicy("consolidate");
    assert("consolidateTroopsReduced", ST.afghan.troops === 110000, "要点收缩撤出外围哨所");
    assert("consolidateBleedingLower", ST.afghan.bleedingCost < 4.5, "收缩后失血成本降低");

    // 8. 苏联玩家策略：日内瓦撤军
    setAfghanPolicy("geneva_withdraw");
    assert("withdrawingTrue", ST.afghan.withdrawing === true, "启动友谊桥撤军程序");
    for (let m = 1; m <= 9; m++) {
      updateMonthlyAfghan(1988, m, true);
    }
    assert("withdrawnCompleted", ST.afghan.withdrawn === true && ST.afghan.troops === 0, "9 个月后撤军彻底完成且兵力归零");
    assert("bleedingCostZeroAfterWithdrawal", ST.afghan.bleedingCost === 0, "撤军后帝国失血槽彻底归零");

    // 9. 和平红利释放断言
    applyPlayerDecisions();
    assert("peaceDividendInjected", W1980_SIM.pmap(SIM.S).SUN === 0.35, "苏联玩家撤军后释放 +0.35pp 和平红利");

    // 10. 美方旋风行动
    initAfghanState();
    ST.player = "USA";
    const stingerRes = setAfghanPolicy("stinger_supply");
    assert("usaStingerSupplySuccess", stingerRes.ok === true && ST.afghan.stingerActive === true, "美方可提前启动旋风行动运送毒刺导弹");

    // 11. 界面渲染断言
    refreshAfghanBox("SUN");
    assert("uiRendersAfghanTitle", afBox.innerHTML.includes("阿富汗战区态势") && afBox.innerHTML.includes("40TH ARMY"), "控制台标题与集团军编号渲染成功");
    assert("uiRendersStatsGrid", afBox.innerHTML.includes("月度失血槽") && afBox.innerHTML.includes("制空权优势"), "四宫格失血与战备指标渲染成功");

    // 12. 旁观模式零漂移铁律
    ST.player = null;
    ST.mil = 0;
    initAfghanState();
    applyPlayerDecisions();
    const pmodsSpectator = Object.keys(W1980_SIM.pmap(SIM.S)).length;
    assert("spectatorZeroPmods", pmodsSpectator === 0, "旁观模式绝对 0 pmods 注入，保障零漂移");

    // 13. simSave / simLoad 往返忠实度
    ST.afghan.troops = 92000;
    ST.afghan.bleedingCost = 3.8;
    ST.afghan.stingerActive = true;
    simSave();
    ST.afghan = null;
    assert("afghanNullifiedBeforeLoad", ST.afghan === null, "读档前清空内存状态");
    simLoad();
    assert("simSaveLoadRoundTrip", ST.afghan && ST.afghan.troops === 92000 && Math.abs(ST.afghan.bleedingCost - 3.8) < 0.05 && ST.afghan.stingerActive === true, "simSave/simLoad 100% 无损还原阿富汗战争状态");

    // 复原环境
    ST.player = null;
    ST.mil = 0;
    initAfghanState();
    applyPlayerDecisions();
    refreshAfghanBox(ST.sel);
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "afghanprobe"; d.style.display = "none";
  d.textContent = "AFGHANPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
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

function runSoundProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("SOUNDPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    const S = window.W1980_SOUND;

    // 1. 模块与核心导出存在性
    assert("soundModuleLoaded", !!S, "W1980_SOUND 模块已加载");
    assert("playHotlineExists", S && typeof S.playHotline === "function", "playHotline 存在");
    assert("playTreatyExists", S && typeof S.playTreaty === "function", "playTreaty 存在");
    assert("playGavelExists", S && typeof S.playGavel === "function", "playGavel 存在");
    assert("playTeletypeExists", S && typeof S.playTeletype === "function", "playTeletype 存在");
    assert("audioContextGetterExists", S && typeof S.getAudioContext === "function", "getAudioContext 存在");

    // 2. 状态与控制器
    assert("setMutedExists", S && typeof S.setMuted === "function", "setMuted 存在");
    assert("isMutedExists", S && typeof S.isMuted === "function", "isMuted 存在");
    assert("setVolumeExists", S && typeof S.setVolume === "function", "setVolume 存在");
    assert("getVolumeExists", S && typeof S.getVolume === "function", "getVolume 存在");
    assert("canPlayExists", S && typeof S.canPlay === "function", "canPlay 存在");
    assert("isProbeOrHeadlessExists", S && typeof S.isProbeOrHeadless === "function", "isProbeOrHeadless 存在");

    // 3. DOM 与 UI 控件集成
    const sBtn = $("b-sound");
    assert("soundButtonInDom", !!sBtn, "#b-sound 按钮存在于 DOM");
    assert("soundButtonInitialIcon", sBtn && (sBtn.textContent === "🔊" || sBtn.textContent === "🔇"), "#b-sound 图标正确渲染");
    assert("toggleSoundMuteExists", typeof toggleSoundMute === "function", "toggleSoundMute 存在");
    assert("refreshSoundBtnExists", typeof refreshSoundBtn === "function", "refreshSoundBtn 存在");

    // 4. 静音逻辑与保护隔离
    S.setMuted(true);
    assert("setMutedTrue", S.isMuted() === true, "setMuted(true) 状态正确");
    if (ST.sound) ST.sound.muted = true;
    refreshSoundBtn();
    assert("uiSyncWhenMuted", sBtn && sBtn.textContent === "🔇" && sBtn.classList.contains("muted"), "静音时 UI 按钮显示 🔇 并增加 muted 类");
    assert("canPlayFalseWhenMuted", S.canPlay() === false, "静音状态下 canPlay() 严格返回 false");

    S.setMuted(false);
    assert("setMutedFalse", S.isMuted() === false, "setMuted(false) 状态正确");
    if (ST.sound) ST.sound.muted = false;
    refreshSoundBtn();
    assert("uiSyncWhenUnmuted", sBtn && sBtn.textContent === "🔊" && !sBtn.classList.contains("muted"), "取消静音时 UI 按钮显示 🔊");
    assert("headlessOrProbeSuppression", S.isProbeOrHeadless() === true, "探针/自动化无头环境下 isProbeOrHeadless 返回 true 保护静音");

    // 5. 音量动态调节与钳位
    S.setVolume(0.8);
    assert("volumeSetValid", Math.abs(S.getVolume() - 0.8) < 0.001, "音量正确设置至 0.8");
    S.setVolume(-0.5);
    assert("volumeClampMin", S.getVolume() === 0.0, "音量下限正确钳位至 0.0");
    S.setVolume(1.8);
    assert("volumeClampMax", S.getVolume() === 1.0, "音量上限正确钳位至 1.0");
    S.setVolume(0.6);
    assert("volumeReset", Math.abs(S.getVolume() - 0.6) < 0.001, "音量重置至基准 0.6");

    // 6. 探针隔离下四大标志性冷战音效无异常静音调用验证
    let threwHotline = false;
    try { S.playHotline(); } catch (e) { threwHotline = true; }
    assert("safeCallHotlineNoThrow", !threwHotline, "playHotline 安全调用无异常抛出");

    let threwTreaty = false;
    try { S.playTreaty(); } catch (e) { threwTreaty = true; }
    assert("safeCallTreatyNoThrow", !threwTreaty, "playTreaty 安全调用无异常抛出");

    let threwGavel = false;
    try { S.playGavel(); } catch (e) { threwGavel = true; }
    assert("safeCallGavelNoThrow", !threwGavel, "playGavel 安全调用无异常抛出");

    let threwTeletype = false;
    try { S.playTeletype(); } catch (e) { threwTeletype = true; }
    assert("safeCallTeletypeNoThrow", !threwTeletype, "playTeletype 安全调用无异常抛出");

    // 7. 存档与读档往返一致性
    assert("stateSoundInitialized", ST.sound && typeof ST.sound.muted === "boolean" && typeof ST.sound.vol === "number", "ST.sound 状态结构完备");
    ST.sound.muted = true;
    ST.sound.vol = 0.35;
    const saveOk = simSave();
    assert("simSaveIncludesSound", saveOk.ok, "simSave 成功序列化包含 sound 字段");

    ST.sound.muted = false;
    ST.sound.vol = 0.9;
    assert("stateTamperedBeforeLoad", ST.sound.muted === false && Math.abs(ST.sound.vol - 0.9) < 0.001, "读档前状态篡改确认");
    const loadOk = simLoad();
    assert("simLoadSucceeds", loadOk.ok, "simLoad 成功执行");
    assert("simLoadRestoresSound", ST.sound.muted === true && Math.abs(ST.sound.vol - 0.35) < 0.001, "simLoad 成功完整往返还原 sound.muted 与 sound.vol");

    // 8. 旁观模式零漂移铁律
    ST.player = null;
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("observerZeroPmods", pmodsCount === 0, "旁观模式下音效系统零副作用，pmods 保持严格为空 (0 漂移)");

    // 恢复正常默认音效设置
    ST.sound.muted = false;
    ST.sound.vol = 0.6;
    S.setMuted(false);
    S.setVolume(0.6);
    refreshSoundBtn();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "soundprobe"; d.style.display = "none";
  d.textContent = "SOUNDPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// ---- R14: 钢铁雄心4风格时代美术与游戏资源全链路探针 ----
function runAssetsProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ASSETSPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    const A = window.W1980_ASSETS;

    // 1. 资源数据库完备性
    assert("assetsModuleLoaded", !!A, "W1980_ASSETS 模块已就绪");
    assert("leadersDictionaryDefined", A && typeof A.LEADERS === "object", "LEADERS 字典有效");
    assert("leadersCount16Plus", A && Object.keys(A.LEADERS).length >= 16, "覆盖 16+ 个核心国家领袖库");
    assert("newsPhotosDefined", A && typeof A.NEWS_PHOTOS === "object", "NEWS_PHOTOS 字典有效");
    assert("newsPhotosCount8", A && Object.keys(A.NEWS_PHOTOS).length >= 8, "包含 8 大时代新闻历史画报");
    assert("stampsDefined", A && typeof A.UI_STAMPS === "object", "UI_STAMPS 字典有效");
    assert("stampsCount4", A && Object.keys(A.UI_STAMPS).length >= 4, "包含四大冷战公文机密印章");

    // 2. 领袖检索函数与历史更替逻辑
    assert("getLeaderFnExists", typeof A.getLeader === "function", "getLeader 检索函数存在");
    const lCarter = A.getLeader("USA", 1980);
    assert("usaCarter1980", lCarter && lCarter.name === "吉米·卡特", "1980 年美国总统为吉米·卡特");
    const lReagan = A.getLeader("USA", 1985);
    assert("usaReagan1985", lReagan && lReagan.name === "罗纳德·里根", "1985 年美国总统更替为罗纳德·里根");
    const lBush = A.getLeader("USA", 1990);
    assert("usaBush1990", lBush && lBush.name === "乔治·H·W·布什", "1990 年美国总统更替为老布什");

    const lBrezhnev = A.getLeader("SUN", 1980);
    assert("sunBrezhnev1980", lBrezhnev && lBrezhnev.name === "列昂尼德·勃列日涅夫", "1980 年苏联最高领导人为勃列日涅夫");
    const lAndropov = A.getLeader("SUN", 1983);
    assert("sunAndropov1983", lAndropov && lAndropov.name === "尤里·安德罗波夫", "1983 年苏联最高领导人为安德罗波夫");
    const lGorbachev = A.getLeader("SUN", 1987);
    assert("sunGorbachev1987", lGorbachev && lGorbachev.name === "米哈伊尔·戈尔巴乔夫", "1987 年苏联最高领导人为戈尔巴乔夫");

    // 3. 次极大国与区域核心领袖覆盖
    assert("chnDengDefined", A.getLeader("CHN", 1985) && A.getLeader("CHN", 1985).name === "邓小平", "中国改革开放总设计师邓小平就绪");
    assert("gbrThatcherDefined", A.getLeader("GBR", 1982) && A.getLeader("GBR", 1982).name === "玛格丽特·撒切尔", "英国首相撒切尔夫人就绪");
    assert("fraMitterrandDefined", A.getLeader("FRA", 1985) && A.getLeader("FRA", 1985).name === "弗朗索瓦·密特朗", "法国总统密特朗就绪");
    assert("deuKohlDefined", A.getLeader("DEU", 1989) && A.getLeader("DEU", 1989).name === "赫尔穆特·科尔", "西德总理科尔就绪");
    assert("ddrHoneckerDefined", A.getLeader("DDR", 1986) && A.getLeader("DDR", 1986).name === "埃里希·昂纳克", "东德主席昂纳克就绪");
    assert("jpnNakasoneDefined", A.getLeader("JPN", 1985) && A.getLeader("JPN", 1985).name === "中曾根康弘", "日本首相中曾根康弘就绪");
    assert("irnKhomeiniDefined", A.getLeader("IRN", 1980) && A.getLeader("IRN", 1980).name === "鲁霍拉·穆萨维·霍梅尼", "伊朗最高领袖霍梅尼就绪");
    assert("irqSaddamDefined", A.getLeader("IRQ", 1980) && A.getLeader("IRQ", 1980).name === "萨达姆·侯赛因", "伊拉克总统萨达姆就绪");

    // 4. 时代特刊画报与首脑峰会现场照片检索
    assert("newsOilCrashPhoto", A.getNewsPhoto("oil_crash") && !!A.getNewsPhoto("oil_crash").url, "1986 油价暴跌画报有效");
    assert("newsChernobylPhoto", A.getNewsPhoto("chernobyl") && !!A.getNewsPhoto("chernobyl").url, "1986 切尔诺贝利现场画报有效");
    assert("newsBerlinWallPhoto", A.getNewsPhoto("east_europe") && !!A.getNewsPhoto("east_europe").url, "1989 柏林墙倒塌画报有效");
    assert("summitGenevaPhoto", A.getNewsPhoto("geneva_1985") && !!A.getNewsPhoto("geneva_1985").url, "1985 日内瓦峰会现场画报有效");

    // 5. 机密印章检索
    assert("stampTopSecret", A.getStamp("top_secret") && A.getStamp("top_secret").includes("stamp_top_secret.png"), "绝密印章有效");
    assert("stampSovietSecret", A.getStamp("soviet_secret") && A.getStamp("soviet_secret").includes("stamp_soviet_secret.png"), "苏维埃最高机密印章有效");
    assert("stampRatified", A.getStamp("ratified") && A.getStamp("ratified").includes("stamp_ratified.png"), "条约生效印章有效");
    assert("stampVetoed", A.getStamp("vetoed") && A.getStamp("vetoed").includes("stamp_vetoed.png"), "安理会一票否决印章有效");

    // 6. DOM 挂载与动态卡片渲染
    const lCard = $("p-leader-card");
    assert("leaderCardInDom", !!lCard, "#p-leader-card 挂载在概览选项卡");
    refreshLeaderCard("USA");
    assert("leaderCardRenderedUSA", lCard && lCard.style.display !== "none" && lCard.textContent.includes("总统"), "美国总统卡片成功渲染");
    refreshLeaderCard("SUN");
    assert("leaderCardRenderedSUN", lCard && lCard.style.display !== "none" && lCard.textContent.includes("总书记"), "苏联总书记卡片成功渲染");

    // 7. 时代特刊头版画报与印章联动
    openNewsModal("chernobyl");
    const nPhotoBox = $("news-photo-box");
    const nPhotoImg = $("news-photo-img");
    const nStampImg = $("news-stamp-img");
    assert("newsPhotoBoxRendered", nPhotoBox && nPhotoBox.style.display !== "none", "时代特刊画报容器正确展开");
    assert("newsPhotoImgValid", nPhotoImg && !!nPhotoImg.src, "特刊画报 img 拥有有效图片源");
    assert("newsStampImgValid", nStampImg && nStampImg.style.display !== "none", "特刊机密印章正确加盖");
    closeNewsModal();

    // 8. 首脑峰会画报与安理会印章联动
    ST.player = "USA";
    openSummitModal("geneva_1985", "SUN");
    const sPhotoBox = $("summit-photo-box");
    assert("summitPhotoBoxRendered", sPhotoBox && sPhotoBox.style.display !== "none", "首脑峰会现场画报容器正确展开");
    closeSummitModal();

    openUNSCModal("res_598");
    const uStamp = $("unsc-stamp-img");
    assert("unscStampContainerReady", !!uStamp, "安理会印章容器就绪");
    closeUNSCModal();

    // 9. 旁观模式零漂移铁律
    ST.player = null;
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("observerZeroPmods", pmodsCount === 0, "旁观模式下时代美术系统零副作用，pmods 保持严格为空 (0 漂移)");

    // 10. 存档往返验证
    const saveOk = simSave();
    assert("simSaveSucceeds", saveOk.ok, "simSave 成功执行");
    const loadOk = simLoad();
    assert("simLoadSucceeds", loadOk.ok, "simLoad 成功执行");
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "assetsprobe"; d.style.display = "none";
  d.textContent = "ASSETSPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
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
