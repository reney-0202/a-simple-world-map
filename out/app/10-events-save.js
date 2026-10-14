"use strict";


// ---------------------------------------------------------------- M6 事件剧本
// EV.log 保持「id 字符串数组」不变——simprobe / saveprobe 的逐位重放比对证据依赖它，勿改。
// R2 T3 另加 items（含日期/名称/note，供收件箱渲染）与 unread 未读计数。
const EV = { list: [], idx: 0, active: [], log: [], items: [], unread: 0 };
function evInit() {
  EV.list = (window.W1980_EVENTS || []).slice().sort((a, b) => (a.y * 12 + a.m) - (b.y * 12 + b.m));
  EV.idx = 0; EV.active = []; EV.log = []; EV.items = []; EV.unread = 0;
  renderInbox();
}
// R2 T3 / R11B：收件箱渲染（末尾 EV.unread 条标为未读；时代大事件标注特刊并支持点击回顾）
function renderInbox() {
  const box = $("inbox-list");
  if (box) {
    box.innerHTML = EV.items.length
      ? '<div class="sum">已发生 ' + EV.items.length + " / " + EV.list.length + ' 件（1980–1991）</div>' +
        EV.items.map((e, i) => {
          const isNews = !!(window.W1980_NEWS && window.W1980_NEWS[e.id]);
          return '<div class="ev' + (i >= EV.items.length - EV.unread ? " unread" : "") + (isNews ? " is-news" : "") + '"' +
            (isNews ? ' data-news="' + e.id + '" title="点击回顾时代特刊大头条"' : '') + '>' +
            '<span class="d">' + e.y + "-" + String(e.m).padStart(2, "0") + "</span>" +
            '<span class="t"><b>' + e.zh + (e.dissolve ? "（解体标记）" : "") + "</b>" +
            (isNews ? '<span class="news-tag">特刊</span>' : '') +
            (e.note ? '<div class="n">' + e.note + "</div>" : "") + "</span></div>";
        }).join("")
      : '<div class="empty">暂无事件 —— 1980-01 起按历史日期触发（本局共 ' + EV.list.length + " 件待发生）。</div>";
    box.querySelectorAll(".ev.is-news").forEach((el) => {
      el.onclick = () => {
        const nid = el.dataset.news;
        if (nid) openNewsModal(nid);
      };
    });
  }
  const n = $("b-inbox-n"), b = $("b-inbox");
  if (n) n.textContent = EV.unread ? String(EV.unread) : "";
  if (b) b.classList.toggle("has-new", EV.unread > 0);
}
function evApply(e, silent) {
  const S = SIM.S;
  if (e.mod && e.targets) {
    e.targets.forEach((t) => W1980_SIM.setMod(S, t, e.mod));
    EV.active.push({ targets: e.targets, end: e.end_y ? e.end_y * 12 + e.end_m : null, pop: false });
  }
  if (e.popmod && e.targets) {          // 机制批次③（tasks/011）：人口侧修正，与 mod 平行
    e.targets.forEach((t) => W1980_SIM.setPopMod(S, t, e.popmod));
    EV.active.push({ targets: e.targets, end: e.end_y ? e.end_y * 12 + e.end_m : null, pop: true });
  }
  if (e.shock) for (const t in e.shock) W1980_SIM.applyShock(S, t, e.shock[t]);
  if (e.dissolve && e.targets) e.targets.forEach((t) => W1980_SIM.markDissolved(S, t, true));
  EV.log.push(e.id);
  EV.items.push({ id: e.id, y: e.y, m: e.m, zh: e.zh, note: e.note || "", dissolve: !!e.dissolve });
  EV.unread++;                       // 快进（silent）也计入未读 —— 这正是 P1-2 的修复点
  renderInbox();
  if (!silent) {
    toast(e);
    // R11B：时代大新闻头版弹窗联动（非静默游玩模式自动弹出并暂停）
    if (window.W1980_NEWS && window.W1980_NEWS[e.id] && ST.newsModalEnabled !== false && !CR.probeMode) {
      openNewsModal(e.id);
    }
  }
}
function evRun(y, m, silent) {
  if (!SIM.S || !EV.list.length) return;
  crCheck(y, m, silent);              // R5D：十字路口先于同月事件决断（cr_gulf 与 iran_iraq_war 同为 1980-09）
  const now = y * 12 + m;
  while (EV.idx < EV.list.length && (EV.list[EV.idx].y * 12 + EV.list[EV.idx].m) <= now) {
    if (CR.deny.has(EV.list[EV.idx].id)) { EV.idx++; continue; }   // 玩家架空选择跳过的事件：不应用、不入 log
    evApply(EV.list[EV.idx++], silent);
  }
  for (let i = EV.active.length - 1; i >= 0; i--) {
    const a = EV.active[i];
    if (a.end !== null && now >= a.end) {
      if (a.pop) a.targets.forEach((t) => W1980_SIM.clearPopMod(SIM.S, t));   // 机制③：到期清人口修正
      else a.targets.forEach((t) => W1980_SIM.clearMod(SIM.S, t));
      EV.active.splice(i, 1);
    }
  }
  updateTimelineFrontlines(y, m, silent);   // R8B：同步前线战况
  updateMonthlyTrade(y, m);                 // R9B：月度外汇储备池与贸易结算
  updateTimelineEmbargo(y, m);              // R9C：巴统禁运与霍尔木兹海峡安全态势
  if (isAIActive()) updateAIDecisions(y, m, silent); // R10A：反应式 AI 决策机
  updateDomesticPolitics(y, m, silent);     // R12A：大国内政生态与派系权力天平月度演进
  updateMonthlyAgendas(y, m, silent);       // R12B：次极大国与专属国家战略议程月度推进
  updateMonthlyCrises(y, m, silent);        // R12C：中局突发危机抉择卡与升级阶梯月度检测
  updateMonthlyIntel(y, m, silent);         // R13A：隐蔽行动与全球谍战沙盒月度演进
  updateMonthlyAfghan(y, m, silent);        // R13B：阿富汗战区态势与帝国失血槽月度结算
  // R10B：历史首脑峰会事件窗口照会通知
  if (isAIActive() && window.W1980_AI && Array.isArray(window.W1980_AI.SUMMIT_PRESETS)) {
    const p = window.W1980_AI.SUMMIT_PRESETS.find((sp) => sp.year === y && sp.month === m);
    if (p && Array.isArray(p.participants) && p.participants.includes(ST.player)) {
      const partner = p.participants.find((k) => k !== ST.player);
      const partnerZh = (CM.countries[partner] || {}).zh || partner;
      const item = {
        y: y,
        m: m,
        zh: "【历史首脑峰会】" + p.name,
        note: p.name + " 即将在 " + p.city + " 举行！" + partnerZh + "邀请我国最高层就军控与缓和展开会晤。点击顶栏『🕊️峰会』开启谈判！"
      };
      EV.items.push(item);
      EV.unread++;
      renderInbox();
      if (!silent) toast(item);
    }
  }
  // R10C：联合国安理会历史决议与危机斡旋窗口通知
  if (isAIActive() && window.W1980_AI && window.W1980_AI.UNSC_RESOLUTIONS) {
    const resList = Object.values(window.W1980_AI.UNSC_RESOLUTIONS);
    const res = resList.find((r) => r.year === y && r.month === m);
    if (res && (!ST.ai.unsc || !ST.ai.unsc.passed.includes(res.id))) {
      const item = {
        y: y,
        m: m,
        zh: "【安理会紧急审议】" + res.shortTitle,
        note: "联合国安理会就国际热点危机召开紧急磋商审议 " + res.name + "。点击顶栏『🌐安理会』行使大国表决权！"
      };
      EV.items.push(item);
      EV.unread++;
      renderInbox();
      if (!silent) toast(item);
    }
  }
}

// ---- R5D 架空十字路口（tasks/014）：默认 = 史实；偏离项用现有事件 API（skip/mod）表达 ----
// 默认剧本逐位不变：旁观/探针/无头缺省自动选 hist 项且不入收件箱；只有「偏离史实的选择」才记 items。
const CR = { list: null, pending: null, choices: [], decided: new Set(), deny: new Set(),
  auto: null, resumePlay: false, probeMode: false };
function crInit() {
  CR.list = window.W1980_CROSSROADS || [];
  CR.probeMode = /[?&](simprobe|saveprobe|end=1|selftest|flprobe|warprobe|resprobe|tradeprobe|embargoprobe|aiprobe|summitprobe|unscprobe|panelprobe|newsprobe|chronicleprobe|domesticprobe|agendaprobe|crisisprobe|intelprobe|afghanprobe|soundprobe|assetsprobe)/.test(location.search);
  const cq = /[?&]choice=([A-Za-z_0-9]+):(\d+)/.exec(location.search);
  if (cq) CR.auto = { id: cq[1], ci: clamp(parseInt(cq[2], 10) || 0, 0, 9) };
}
function crCheck(y, m, silent) {
  if (!CR.list || !CR.list.length) return;
  const now = y * 12 + m;
  for (const cr of CR.list) {
    if (CR.decided.has(cr.id) || now < cr.y * 12 + cr.m) continue;
    let ci = null;
    if (CR.auto && CR.auto.id === cr.id) { ci = CR.auto.ci; CR.auto = null; }
    else if (silent === true && ST.player && !CR.probeMode) {          // 快进 + 玩家 → 停在路口等选择
      CR.resumePlay = SIM.playing; SIM.playing = false; updateDate();
      CR.pending = cr; showCrossroad(cr); return;
    }
    else if (!ST.player || CR.probeMode) ci = 0;                         // 旁观/探针/无头缺省 → 史实
    if (ci === null) {                                                // 正常游玩：暂停 + 弹窗
      CR.resumePlay = SIM.playing;
      SIM.playing = false; updateDate();
      CR.pending = cr; showCrossroad(cr); return;
    }
    crDecide(cr, ci);
  }
}
function crDecide(cr, ci) {
  const ch = cr.choices[ci] || cr.choices[0];
  CR.decided.add(cr.id);
  CR.choices.push({ id: cr.id, ci: ci });
  if (ch.skip) ch.skip.forEach((id) => CR.deny.add(id));
  if (ch.mod) {
    const S = SIM.S;
    for (const k in ch.mod) W1980_SIM.setMod(S, k, ch.mod[k]);
    const end = ch.mod_end ? ch.mod_end[0] * 12 + ch.mod_end[1] : null;
    EV.active.push({ targets: Object.keys(ch.mod), end: end, pop: false });
  }
  if (!ch.hist) {                       // 只有偏离史实的选择才进收件箱（默认路径 EV.items/unread 完全不变）
    EV.items.push({ id: cr.id + ":" + ch.id, y: cr.y, m: cr.m, zh: cr.zh + " · " + ch.zh, note: ch.note || "", dissolve: false });
    EV.unread++; renderInbox();
  }
  if (CR.pending) { CR.pending = null; hideCrossroad(); }
  if (SIM.S) updateTimelineFrontlines(SIM.S.year, Math.max(1, SIM.S.month), false);
}
function crRebuild() {                  // 读档后：从 choices 重建 deny 与路口 mod 的到期登记（单一事实源=choices）
  CR.decided.clear(); CR.deny.clear();
  if (!CR.list) return;
  for (const c of CR.choices) {
    const cr = CR.list.find((x) => x.id === c.id);
    if (!cr) continue;
    CR.decided.add(cr.id);
    const ch = cr.choices[c.ci];
    if (!ch) continue;
    if (ch.skip) ch.skip.forEach((id) => CR.deny.add(id));
    if (ch.mod) {
      const end = ch.mod_end ? ch.mod_end[0] * 12 + ch.mod_end[1] : null;
      EV.active.push({ targets: Object.keys(ch.mod), end: end, pop: false });
    }
  }
}
function showCrossroad(cr) {
  $("cr-title").textContent = cr.zh + "（" + cr.y + " 年 " + cr.m + " 月）";
  $("cr-note").textContent = cr.note || "";
  const box = $("cr-choices"); box.innerHTML = "";
  cr.choices.forEach((ch, i) => {
    const b = document.createElement("button");
    b.className = "btn cr-opt" + (ch.hist ? " hist" : "");
    b.innerHTML = "<span class='cr-zh'>" + ch.zh + (ch.hist ? "<i class='cr-hist'>史实</i>" : "") + "</span>" +
      (ch.note ? "<span class='cr-n'>" + ch.note + "</span>" : "");
    b.onclick = () => {
      const wasPending = CR.pending !== null;
      crDecide(cr, i);
      if (wasPending && CR.resumePlay) { SIM.playing = true; simKick(); CR.resumePlay = false; updateDate(); }
    };
    box.appendChild(b);
  });
  $("crossroad").style.display = "flex";
}
function hideCrossroad() { const e = $("crossroad"); if (e) e.style.display = "none"; }
function toast(e) {
  const box = $("toasts"); if (!box) return;
  const d = document.createElement("div");
  d.className = "toast";
  d.innerHTML = '<span class="ty">' + e.y + "-" + String(e.m).padStart(2, "0") + "</span>" + e.zh;
  d.title = e.note || "";
  box.appendChild(d);
  setTimeout(() => { d.classList.add("out"); setTimeout(() => d.remove(), 450); }, 4200);
  while (box.children.length > 4) box.removeChild(box.firstChild);
}

// ---------------------------------------------------------------- M7 存档/读档 + 难度 + 新手引导
// 原理（R3 已改 · 全量序列化）：存档 = 完整引擎状态（pop/gdp/rngState/mods/pmods/hist）
// + 玩家决策（player/mil）+ 难度 + UI 状态；读档 = 直接 hydrate 还原，**不再重放**。
// 为什么必须改：R3 引入影响经济的玩家决策（军费）后，「同种子重放」不再等价于原轨迹，
// 旧方案会**静默失真**（`SIM.md §10` 的明文禁令）。v1 旧存档不再读取（避免两条真相对撞）。
const SAVE_KEY = "w1980_save_v2", SAVE_KEY_V1 = "w1980_save_v1", SEEN_KEY = "w1980_seen";
// 读档后按存档月份重建「已发生事件」的展示与到期追踪，**不重复施加效果**
//（效果已在存档的 mods/pmods/gdp 里；重复施加会二次冲击 —— 这是与旧「重放」路线的关键差别）
function evRebuild(y, m) {
  EV.idx = 0; EV.active = []; EV.log = []; EV.items = []; EV.unread = 0;
  const now = y * 12 + m;
  while (EV.idx < EV.list.length && (EV.list[EV.idx].y * 12 + EV.list[EV.idx].m) <= now) {
    const e = EV.list[EV.idx++];
    EV.log.push(e.id);
    EV.items.push({ id: e.id, y: e.y, m: e.m, zh: e.zh, note: e.note || "", dissolve: !!e.dissolve });
    // 机制③：popmod 事件同样登记 active（读档时效果已在存档 pop/popMods 里，只重建到期追踪）
    if (e.mod && e.targets) EV.active.push({ targets: e.targets, end: e.end_y ? e.end_y * 12 + e.end_m : null, pop: false });
    if (e.popmod && e.targets) EV.active.push({ targets: e.targets, end: e.end_y ? e.end_y * 12 + e.end_m : null, pop: true });
  }
  renderInbox();
}
function simSave() {
  if (!SIM.ready) return false;
  const d = { v: 2, S: W1980_SIM.serialize(SIM.S),
    player: ST.player, mil: ST.mil, vol: SIM.vol, speed: SIM.speed,
    sanctions: ST.sanctions, aid: ST.aid,             // R5C'：对外决策名单（单一事实源，pmods 由名单重建）
    blocOverride: ST.blocOverride,                    // R5E：阵营迁移（旧档缺省 = 原阵营）
    blocSince: ST.blocSince,                          // R7A（C2 经济网络）：阵营生效月份索引
    frontlines: ST.frontlines,                        // R8A（动态地缘前线）：省份交战占领映射
    tradeRoutes: ST.tradeRoutes,                      // R9B：贸易大动脉航线清单
    reserves: ST.reserves,                            // R9B：双轨外汇储备池状态
    cocom: ST.cocom,                                  // R9C：巴统技术禁运体制
    chokepoints: ST.chokepoints,                      // R9C：战略咽喉通行状态
    smuggle: ST.smuggle,                              // R9C：特种走私转口开关
    ai: ST.ai,                                        // R10A：反应式 AI 决策机状态
    domestic: ST.domestic,                            // R12A：内政生态与派系权力天平状态
    agendas: ST.agendas,                              // R12B：专属国家战略议程状态
    crises: ST.crises ? JSON.parse(JSON.stringify(ST.crises)) : null, // R12C：突发危机状态
    intel: ST.intel ? JSON.parse(JSON.stringify(ST.intel)) : null,   // R13A：全球谍战与隐蔽行动状态
    afghan: ST.afghan ? JSON.parse(JSON.stringify(ST.afghan)) : null, // R13B：阿富汗战区态势与帝国失血槽状态
    sound: ST.sound ? { muted: !!ST.sound.muted, vol: typeof ST.sound.vol === "number" ? ST.sound.vol : 0.6 } : { muted: false, vol: 0.6 }, // R13C：时代音效
    mode: ST.mode, layers: ST.layers, sel: ST.sel,
    cr: CR.choices,                                   // R5D：十字路口选择记录（读档重建 deny/active）
    view: { x: view.x, y: view.y, s: view.s } };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { return false; }
  return true;
}
function simLoad() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return false; }
  if (!d || d.v !== 2 || !d.S) return false;
  loadPlayerProfile(d);        // R5C'/R5E/R7A：玩家决策、阵营迁移与领袖军力
  loadFrontlineState(d);       // R8A：交战前线占领态
  loadEconomyState(d);         // R9B/R9C：贸易航线、双轨储备与经济战
  loadAiState(d);              // R10A/B/C：反应式 AI、条约与安理会
  loadSocietyStates(d);        // R12A/B/C + R13A/B/C：内政/议程/危机/谍战/阿富汗/音效
  if (!hydrateSaveCore(d)) return false;   // §4.4 还原契约（顺序固定 hydrate→evRebuild→crRebuild→applyPlayerDecisions）
  loadUiPreferences(d);        // 速度/模式/图层/视角/选中
  return true;
}

// ---- simLoad 子模块：按子系统还原存档（v2 格式，顺序即还原契约） ----
function loadPlayerProfile(d) {
  SIM.vol = d.vol || SIM.vol;
  ST.player = (d.player && CM.countries[d.player]) ? d.player : null;
  ST.mil = clamp(typeof d.mil === "number" ? d.mil : 0, 0, 10);
  // R5C' §5：旧档缺省 = 无新决策；六项过滤（非对象/未知 key/l 越界/违反禁用规则/重复/超长），不抛异常
  ST.sanctions = Array.isArray(d.sanctions) ? sanitizeDecisions(d.sanctions, "san") : [];
  ST.aid = Array.isArray(d.aid) ? sanitizeDecisions(d.aid, "aid") : [];
  // R5E/R7A：阵营迁移清洗——key 必须是玩家自己、bloc 必须是 7 值之一且 ≠ 原阵营（=原阵营等价于不迁移）
  ST.blocOverride = {};
  ST.blocSince = null;
  if (d.blocOverride && typeof d.blocOverride === "object" && ST.player) {
    const b = d.blocOverride[ST.player];
    if (CM.countries[ST.player] && BLOC_ZH[b] && b !== CM.countries[ST.player].bloc) {
      ST.blocOverride[ST.player] = b;
      if (typeof d.blocSince === "number") ST.blocSince = d.blocSince;
      else ST.blocSince = curMonthIdx();
    }
  }
  rebuildBlocTable();
}

function loadFrontlineState(d) {
  // R8A：还原交战前线占领状态（过滤非法省份 ID 与未知国家 key）
  ST.frontlines = {};
  if (d.frontlines && typeof d.frontlines === "object" && !Array.isArray(d.frontlines)) {
    for (const p in d.frontlines) {
      const pid = +p;
      const fl = d.frontlines[p];
      if (pid > 0 && pid < 3000 && fl && fl.occupier && CM.countries[fl.occupier]) {
        ST.frontlines[pid] = {
          occupier: fl.occupier,
          warId: String(fl.warId || "conflict"),
          since: typeof fl.since === "number" ? fl.since : 0
        };
      }
    }
  }
  rebuildFrontlinesMap();
}

function loadEconomyState(d) {
  // R9B：还原贸易大动脉航线与双轨外汇储备池
  if (Array.isArray(d.tradeRoutes)) {
    ST.tradeRoutes = JSON.parse(JSON.stringify(d.tradeRoutes));
  } else {
    ST.tradeRoutes = window.W1980_TRADE ? window.W1980_TRADE.cloneBaselineRoutes() : [];
  }
  ST.reserves = {};
  if (d.reserves && typeof d.reserves === "object" && !Array.isArray(d.reserves)) {
    for (const k in d.reserves) {
      if (d.reserves[k] && typeof d.reserves[k].usd === "number") {
        ST.reserves[k] = {
          usd: +d.reserves[k].usd,
          trb: +(d.reserves[k].trb || 0)
        };
      }
    }
  }
  if (window.W1980_TRADE && CM && CM.countries) {
    for (const k in CM.countries) {
      if (!ST.reserves[k]) ST.reserves[k] = window.W1980_TRADE.getInitialReserve(k);
    }
  }
  // R9C：还原巴统、咽喉海峡与特种走私状态
  if (d.cocom && typeof d.cocom === "object") {
    ST.cocom = {
      active: d.cocom.active !== false,
      strict: !!d.cocom.strict
    };
  } else {
    ST.cocom = { active: true, strict: false };
  }
  if (d.chokepoints && typeof d.chokepoints === "object") {
    ST.chokepoints = Object.assign({ hormuz: "open" }, d.chokepoints);
  } else {
    ST.chokepoints = { hormuz: "open" };
  }
  if (d.smuggle && typeof d.smuggle === "object") {
    ST.smuggle = Object.assign({ tr_deu_sun_tech: true }, d.smuggle);
  } else {
    ST.smuggle = { tr_deu_sun_tech: true };
  }
}

function loadAiState(d) {
  // R10A/B/C：还原反应式 AI 决策机、军控条约与安理会决议状态
  if (d.ai && typeof d.ai === "object") {
    ST.ai = {
      enabled: d.ai.enabled !== false,
      decisions: (d.ai.decisions && typeof d.ai.decisions === "object") ? JSON.parse(JSON.stringify(d.ai.decisions)) : {},
      tensions: (d.ai.tensions && typeof d.ai.tensions === "object") ? JSON.parse(JSON.stringify(d.ai.tensions)) : {},
      cables: Array.isArray(d.ai.cables) ? JSON.parse(JSON.stringify(d.ai.cables)) : [],
      treaties: Array.isArray(d.ai.treaties) ? JSON.parse(JSON.stringify(d.ai.treaties)) : [],
      unsc: (d.ai.unsc && typeof d.ai.unsc === "object") ? JSON.parse(JSON.stringify(d.ai.unsc)) : { passed: [], history: [] }
    };
  } else {
    ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  }
}

function loadSocietyStates(d) {
  // R12A：还原内政生态与派系权力天平状态
  if (d.domestic && typeof d.domestic === "object") {
    ST.domestic = sanitizeDomesticState(d.domestic);
  } else {
    initDomesticState();
  }
  // R12B：还原专属国家战略议程状态
  if (d.agendas && typeof d.agendas === "object") {
    ST.agendas = sanitizeAgendaState(d.agendas);
  } else {
    initAgendaState();
  }
  // R12C：还原突发危机历史记录与待裁决状态
  if (d.crises && typeof d.crises === "object") {
    ST.crises = sanitizeCrisisState(d.crises);
  } else {
    initCrisisState();
  }
  // R13A：还原全球谍战与隐蔽行动状态
  if (d.intel && typeof d.intel === "object") {
    ST.intel = sanitizeIntelState(d.intel);
  } else {
    initIntelState();
  }
  // R13B：还原阿富汗战区态势与帝国失血槽
  if (d.afghan && typeof d.afghan === "object") {
    ST.afghan = sanitizeAfghanState(d.afghan);
  } else {
    initAfghanState();
  }
  // R13C：还原时代音效状态
  if (d.sound && typeof d.sound === "object") {
    ST.sound = { muted: !!d.sound.muted, vol: typeof d.sound.vol === "number" ? clamp(d.sound.vol, 0, 1) : 0.6 };
  } else {
    ST.sound = { muted: false, vol: 0.6 };
  }
  if (window.W1980_SOUND) {
    window.W1980_SOUND.setMuted(ST.sound.muted);
    window.W1980_SOUND.setVolume(ST.sound.vol);
  }
  refreshSoundBtn();
}

// 核心还原契约（§4.4 顺序固定 hydrate→evRebuild→crRebuild→applyPlayerDecisions，勿改）
function hydrateSaveCore(d) {
  try { W1980_SIM.hydrate(SIM.S, d.S); } catch (e) { return false; }   // ← 直接还原，不重放
  SIM.S.noiseSigma = SIM.vol;
  SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0;
  CR.choices = Array.isArray(d.cr) ? d.cr.slice() : [];   // R5D：还原十字路口选择（deny/active 由 evRebuild 后重建）
  evRebuild(SIM.S.year, Math.max(1, SIM.S.month));
  crRebuild();                         // R5D：从 choices 重建 deny 与路口 mod 到期登记（不重放 setMod——hydrate 已含）
  applyPlayerDecisions();              // R5C'：幂等重建
  simEndClose();                       // R4：读档收起上一局结算（若存档已在 1991-12，按 ▶ 可重看）
  rebuildValueTables();
  if (bakedNow) { bakeNow(bakedNow); render(); drawMini(); }
  return true;
}

function loadUiPreferences(d) {
  SIM.speed = d.speed || 1;
  if (d.mode && MODES.some((m) => m[0] === d.mode)) setMode(d.mode);
  else { fillLegend(); render(); drawOverlay(); }
  if (d.layers) { for (const k in ST.layers) if (k in d.layers) ST.layers[k] = !!d.layers[k]; refreshLayerBtns(); }
  if (d.view) { view.x = d.view.x; view.y = d.view.y; view.s = d.view.s; clampView(); render(); drawOverlay(); drawMini(); }
  fillTop(); updPlayerTag(); refreshMilBox();
  select(d.sel && CM.countries[d.sel] ? d.sel : null);
  updateDate();
}
function simHasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function simHasV1() { try { return !!localStorage.getItem(SAVE_KEY_V1); } catch (e) { return false; } }

function welcome() {
  const w = $("welcome"); if (!w) return;
  w.style.display = "flex";
  // R3：填充「选择你的国家」下拉（54 可玩实体，按中文名排序）
  const ws = $("w-ctry");
  if (ws && !ws.dataset.filled) {
    const ks = Object.keys(CM.countries).sort((a, b) =>
      String(CM.countries[a].zh).localeCompare(String(CM.countries[b].zh), "zh"));
    ws.innerHTML = '<option value="">— 旁观（不选国）—</option>' + ks.map((k) =>
      '<option value="' + k + '">' + CM.countries[k].zh + " · " + k + "</option>").join("");
    ws.dataset.filled = "1";
    ws.value = ST.player || "";
    ws.onchange = () => setPlayer(ws.value || null);
  }
  if (!simHasSave() && simHasV1()) toast({ y: "—", m: "", zh: "检测到旧版存档（v1，不含决策），已忽略", note: "v2 存档才支持玩家决策" });
  const set = (v) => { SIM.vol = v; if (SIM.S) SIM.S.noiseSigma = v;
    document.querySelectorAll("#welcome .w-vol").forEach((b) => b.classList.toggle("on", +b.dataset.v === v)); };
  document.querySelectorAll("#welcome .w-vol").forEach((b) => b.onclick = () => set(+b.dataset.v));
  $("w-start").onclick = () => { w.style.display = "none";
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    applyPlayerDecisions(); updPlayerTag(); refreshMilBox();
    if (ST.player) select(ST.player);   // R3：打开玩家国面板 → 教程「拨第一笔预算」步有真实目标
    tutStart(0); };
  $("w-load").onclick = () => { w.style.display = "none";
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    if (!simLoad()) toast({ y: "—", m: "", zh: "无存档", note: "" }); };
  $("w-load").style.display = simHasSave() ? "" : "none";
}
function maybeWelcome() {
  let seen = null; try { seen = localStorage.getItem(SEEN_KEY); } catch (e) {}
  if (seen) return;
  const q = new URLSearchParams(location.search);
  if (q.has("nowelcome") || q.has("selftest") || q.has("simprobe") || q.has("end") || q.has("flprobe") || q.has("saveprobe") || q.has("warprobe") || q.has("resprobe") || q.has("tradeprobe") || q.has("embargoprobe") || q.has("aiprobe") || q.has("summitprobe") || q.has("unscprobe") || q.has("panelprobe") || q.has("newsprobe") || q.has("chronicleprobe") || q.has("domesticprobe") || q.has("agendaprobe") || q.has("crisisprobe") || q.has("intelprobe") || q.has("afghanprobe") || q.has("soundprobe") || q.has("assetsprobe")) return;
  welcome();
}

// ---- M7 逐步教程（教练标记：聚光灯 + 提示卡；步骤指向真实 UI 元素） ----
const TUT_KEY = "w1980_tut";
const TUT_STEPS = [
  { sel: "#r-time", pos: "bottom",
    zh: "<b>时间控制</b>：▶ 播放 / 暂停，1× 2× 4× 变速，↺ 回到 1980-01。<b>空格</b>也能暂停；右侧时间轴显示 1980→1991 进度，顶栏「产出增速」是同比变化。" },
  { sel: "#modes", pos: "right",
    zh: "<b>地图模式</b>：政治 / 阵营 / 人口 / 工业 / 政区随机色 / <b>变化</b>（第 6 个，看谁在涨谁在跌）。按 <b>M</b> 键循环切换。" },
  { sel: ".tools", pos: "bottom",
    zh: "<b>工具</b>：搜索国家、统计排行榜、<b>事件收件箱</b>、<b>存档 / 读档</b>、导出 PNG。" },
  { sel: "#b-inbox", pos: "bottom",
    zh: "<b>事件收件箱</b>：🔔 列出 1980–1991 全部已发生事件（含日期与说明）。快进 11 年也不会漏——徽章数字就是未读数。" },
  { sel: "#layers", pos: "left",
    zh: "<b>图层开关</b>：省界 / 国界 / 首都金星 / 城市点 / 地名标签。" },
  { sel: "#b-stats", pos: "bottom",
    zh: "<b>排行榜带时间感</b>：点「统计」切换 人口/GDP/工业/面积，第 3 列是「较 1980 名次变化」（▲ 上升 / ▼ 下降 / — 不变）。" },
  { sel: "#p-mil", pos: "left",
    zh: "<b>大战略决策中心</b>：在你的国家面板里调<b>军费占比</b>（适度 ~4% 最优），还能<b>施加制裁或军援盟友</b>，或<b>迁入阵营享受经贸协作网络</b> —— 你的决策将实时改写历史经济轨迹与地缘格局。" },
  { sel: null, pos: "center",
    zh: "<b>改写历史走向</b>：推进中将遭遇 <b>6 个架空十字路口</b>（两伊战事、广场协议、切尔诺贝利等），你的抉择将决定历史走向；<b>1991-12 将弹出终局大战略评分卡（Rubric 2.0）</b>，检验你的治国与地缘成就！" }
];
let tutI = -1;
function tutStart(i) {
  tutI = i || 0;
  const c = $("coach"); if (!c) return;
  c.classList.add("on");
  tutShow();
}
function tutShow() {
  const st = TUT_STEPS[tutI]; if (!st) return tutEnd();
  $("c-tx").innerHTML = st.zh;
  $("c-col").textContent = (tutI + 1) + " / " + TUT_STEPS.length;
  $("c-next").textContent = tutI === TUT_STEPS.length - 1 ? "开始游戏" : "下一步";
  const vw = window.innerWidth, vh = window.innerHeight;
  const tip = $("c-tip"), spot = $("c-spot");
  const el = st.sel ? document.querySelector(st.sel) : null;
  if (!el) {                                   // 无目标：居中卡片，隐藏聚光灯
    spot.style.display = "none";
    const t = tip.getBoundingClientRect();
    tip.style.left = Math.round((vw - t.width) / 2) + "px";
    tip.style.top = Math.round((vh - t.height) / 2) + "px";
    return;
  }
  spot.style.display = "";
  const r = el.getBoundingClientRect();
  spot.style.left = (r.left - 6) + "px"; spot.style.top = (r.top - 6) + "px";
  spot.style.width = (r.width + 12) + "px"; spot.style.height = (r.height + 12) + "px";
  const t = tip.getBoundingClientRect();
  let x, y;
  if (st.pos === "bottom") { x = r.left; y = r.bottom + 14; }
  else if (st.pos === "right") { x = r.right + 14; y = r.top; }
  else if (st.pos === "left") { x = r.left - t.width - 14; y = r.top; }
  else { x = (vw - t.width) / 2; y = (vh - t.height) / 2; }
  tip.style.left = Math.round(clamp(x, 12, vw - t.width - 12)) + "px";
  tip.style.top = Math.round(clamp(y, 12, vh - t.height - 12)) + "px";
}
function tutNext() { if (tutI >= TUT_STEPS.length - 1) return tutEnd(); tutI++; tutShow(); }
function tutEnd() {
  tutI = -1;
  const c = $("coach"); if (c) c.classList.remove("on");
  try { localStorage.setItem(TUT_KEY, "1"); } catch (e) {}
}
function onWindowResize() {            // B（架构评审）：唯一的窗口 resize 监听（画布重排 + 教程重定位）
  resize(false); render(); drawOverlay();
  if (tutI >= 0) tutShow();
}
function tutWire() {
  $("c-next").onclick = tutNext;
  $("c-skip").onclick = tutEnd;
}
function tutMaybeAuto() {
  let done = null; try { done = localStorage.getItem(TUT_KEY); } catch (e) {}
  if (done) return;
  const q = new URLSearchParams(location.search);
  if (q.has("nowelcome") || q.has("selftest") || q.has("simprobe") || q.has("saveprobe") || q.has("flprobe") || q.has("warprobe")) return;
  const w = $("welcome"); if (w && w.style.display === "flex") return;   // 欢迎层开着则交给它引导进教程
  tutStart(0);
}


function loadPixels(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      res(x.getImageData(0, 0, W, H).data);
    };
    im.onerror = () => rej(new Error("无法加载 " + url));
    im.src = url;
  });
}
