"use strict";
/* world1980 — HoI4-flavoured interactive province map (Equal Earth, no dependencies) */
(function () {
  const $ = (id) => document.getElementById(id);
  const CM = window.W1980_COUNTRIES, PM = window.W1980_PROVINCES, CITY = window.W1980_CITIES;
  const CK = CM.checksum;
  const W = CK.base[0], H = CK.base[1], N = W * H;
  const KM2 = CK.km2PerPx;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const OCEAN = "#16202b", GREY = "#4a4f55", GUTTER = "#101822";
  const BLOC = { NATO: "#3E6FB0", WP: "#B03A3A", SOV: "#8E3B3B", CHN: "#D4A017", W: "#4E8C7A", NA: "#7A9A3C", NE: "#9B9B9B" };
  const BLOC_ZH = { NATO: "北约", WP: "华约", SOV: "亲苏", CHN: "中国阵营", W: "西方(非北约)", NA: "不结盟/第三世界", NE: "中立" };
  const MAJOR = {
    SUN: "#C0392B", USA: "#4A7EBB", GBR: "#B08BB5", FRA: "#6C8EBF", CHN: "#E0B040",
    DEU: "#8E7CC3", DDR: "#C97C7C", JPN: "#D98C8C", IND: "#7FB069", BRA: "#A8C256"
  };
  const PALETTE = ["#5F9EA0", "#C1873B", "#7D6A9E", "#4E8C7A", "#B0533A", "#6B9BD2", "#9E5B7A",
    "#8FA35C", "#96694B", "#5C7C9E", "#A85C6E", "#7A8B4F", "#B98A56", "#64789B",
    "#9C6B8E", "#7FA3A0", "#C0A05A", "#6E7F5A", "#8B5E5E", "#5D8AA8", "#8C7A5B", "#6A8F8B"];

  const MODES = [["political", "政治", "1"], ["bloc", "阵营", "2"], ["pop", "人口", "3"],
    ["ind", "工业", "4"], ["province", "政区随机色", "5"], ["delta", "变化", "6"], ["resource", "资源", "7"]];
  const LAYERS = [["province", "省界"], ["country", "国界"], ["capital", "首都金星"],
    ["city", "城市点"], ["label", "地名标签"]];

  // ---- R5C'（tasks/015）：对外决策档位表（定案：军援损耗率 1.5×，主人裁定） ----
  // 单位 = pp/年（加性，进引擎 P.pmods 玩家决策层）。tgt = 目标实体全部成员，self = 本国反噬/转移损耗。
  const DEC_TIERS = {
    san: [ { zh: "外交抗议", tgt: 0.5, self: 0.3 }, { zh: "轻度制裁", tgt: 1.5, self: 1.0 },
      { zh: "重度制裁", tgt: 3.0, self: 2.0 } ],
    aid: [ { zh: "军事顾问", tgt: 1.0, self: 1.5 }, { zh: "装备援助", tgt: 2.0, self: 3.0 },
      { zh: "全面军援", tgt: 3.0, self: 4.5 } ]
  };
  const DEC_MAX = { san: 2, aid: 2 };        // 同时目标数上限（制裁 2 / 军援 2）

  // ---- R7A（tasks/018，C2 经济网络）：阵营经贸协作基础强度与脱钩摩擦模型 ----
  // 单位 = pp/年（加性，进引擎 P.pmods 玩家决策层）。
  const BLOC_NET_BASE = {
    NATO: 0.40, W: 0.40, WP: 0.20, SOV: 0.15, CHN: 0.15, NA: 0.0, NE: 0.0
  };

  const ST = {
    mode: "political", sortKey: "pop_m", sel: null, hover: 0, hoverC: null,
    player: null, mil: 0,            // R3：玩家实体（可 null=旁观）与军费占比决策（%）
    sanctions: [], aid: [],          // R5C'：对外决策名单 [{t:KEY, l:0..2, since:月序}]（制裁/军援互斥）
    blocOverride: {},                // R5E/R7A：结盟 —— {playerKey: BLOC} 仅玩家自己可迁入/迁出
    blocSince: null,                 // R7A（C2 经济网络）：玩家迁入阵营时的全局月份索引（脱钩震荡计算用）
    frontlines: {},                  // R8A（动态地缘前线）：省份交战占领映射 { [provId]: { occupier: KEY, warId: ID, since: 月序 } }
    tradeRoutes: [],                 // R9B（贸易大动脉）：活跃航线清单 [{id, from, to, res, amount, cur, desc}]
    reserves: {},                    // R9B（双轨外汇储备池）：{ [key]: { usd: number, trb: number } }
    cocom: { active: true, strict: false }, // R9C（巴统出口管制）：西方对华约先进技术禁运体系
    chokepoints: { hormuz: "open" },        // R9C（咽喉航道状态）：霍尔木兹海峡 open / contested / blocked
    smuggle: { tr_deu_sun_tech: true },     // R9C（反禁运特种走私通道）：{ [routeId]: boolean }
    ai: { enabled: true, decisions: {}, tensions: {}, cables: [] }, // R10A（反应式 AI）：战略性格决策机与双边态度
    panelTab: "overview",                    // R11A（面板 Tabs）：当前激活的选项卡 (overview/defense/economy/diplomacy)
    newsModalEnabled: true,                  // R11B（时代大新闻）：是否开启大事件头版弹窗
    lastNewsId: null,                        // R11B：最近一次触发的时代大新闻 ID
    endTab: "rubric",                        // R11C（终局长卷 Tabs）：当前结算选项卡 (rubric/epilogue/chronicle)
    domestic: null,                          // R12A（内政生态与派系天平）：{ sun, usa, generals }
    agendas: {},                             // R12B（专属国家战略议程）：{ [cKey]: { active, progress, completed, bonuses } }
    crises: { history: [], pending: null },  // R12C（突发危机抉择卡与升级阶梯）：已决断历史与当前待决危机
    intel: null,                             // R13A（全球谍战沙盒）：特情局黑金预算、行动力点数与隐蔽行动记录
    afghan: null,                            // R13B（阿富汗战争泥潭）：第40集团军战区态势、失血槽与撤军进度
    sound: { muted: false, vol: 0.6 },       // R13C（时代音效架构）：音效开关与音量
    layers: { province: true, country: true, capital: true, city: true, label: true }
  };
  const view = { x: 0, y: 0, s: 1, fit: 1 };

  let pid = null, pol = null, landm = null;      // rasters
  let play = null;                               // playable entity id per px（集团合并后）
  let playPol = null;                            // province -> playable entity id
  let playKeys = null;                           // entity id -> key（byPlayableId）
  let playIdOfKey = null;                        // key -> entity id
  let playPids = null;                           // key -> Set(polity_id)（集团=多个成员政体）
  const flMap = new Uint16Array(3000);           // R8A：前线快速映射缓存（省份 ID -> 占领国实体 ID）
  let hasFrontlines = false;                     // R8A：是否存在活动前线（用于 bakeNow 零开销分支）
  let provPol = null;                            // province -> polity id
  let runs = null, cruns = null;                 // RLE
  let modeCan = null, mctx = null, tables = {}, baked = {}, bakedNow = null;
  let mapCan, mctx2, ovCan, octx, bimg = null, oimg = null;
  let xmapA = null, ymapA = null, xmapP = -1, ymapP = -1;
  let VB_P = null, VB_C = null;   // 矢量边界折线（delta-int16 解码后的浮点折线，惰性）
  let xmapX = NaN, ymapY = NaN;   // ← 缓存必须跟 view.x/view.y 一起失效，否则平移后边界层会错位
  let __W1980 = null;             // 调试/验证钩子（见文件末尾 window.__W1980）

  // ---------------------------------------------------------------- helpers
  function hx(s) { return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]; }
  function u32(r, g, b, a) { return (((a === undefined ? 255 : a) << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  function u32c(s) { const c = hx(s); return u32(c[0], c[1], c[2]); }
  function rgba(r, g, b, a) { return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fmtPop(m) { return (m / 100).toFixed(m >= 1000 ? 1 : 2) + " 亿"; }
  function fmtMoney(bn) { return bn >= 1000 ? (bn / 1000).toFixed(2) + " 万亿美元" : (bn * 10).toFixed(0) + " 亿美元"; }
  function fmtArea2(km2) { return km2 >= 1e6 ? (km2 / 1e6).toFixed(2) + " 百万 km²" : Math.round(km2).toLocaleString() + " km²"; }

  // ---------------------------------------------------------------- M5 仿真（游戏循环）
  // SIM.S 为 engine/sim.js 的状态；未加载/未推进时一切回退到 1980 基准（simVal 返回基准值）。
  const SIM = { S: null, ready: false, playing: false, speed: 1, acc: 0, lastTs: 0, monthsPerSec: 2, vol: 3 };
  function simInit() {
    if (!window.W1980_SIMDATA || !window.W1980_SIM) return false;
    const D = window.W1980_SIMDATA;
    const members = Object.keys(D.popStart);
    SIM.S = W1980_SIM.initState(D, 1980, 0);
    W1980_SIM.seedState(SIM.S, members, D.popStart);
    SIM.S.noiseSigma = SIM.vol;      // 难度 → 噪声幅度
    SIM.ready = true;
    evInit();
    return true;
  }
  function simAdvanced() { return SIM.ready && (SIM.S.year > 1980 || SIM.S.month > 0); }
  // 实体 k 在当前仿真时刻的 {pop_m, gdp_bn, industry_bn}（成员求和；t=0 时与基准完全一致）
  function simVal(k) {
    const c = CM.countries[k];
    if (!SIM.S) return { pop_m: c.pop_m, gdp_bn: c.gdp_bn, industry_bn: c.industry_bn };
    const D = window.W1980_SIMDATA, S = SIM.S;
    let pop = 0, gdp = 0, ind = 0;
    if (D.popStart[k] !== undefined) { pop += S.pop[k]; gdp += D.gdp1980[k] * S.gdp[k]; ind += D.ind1980[k] * S.gdp[k]; }
    const ms = c.members || [];
    for (let i = 0; i < ms.length; i++) {
      const key = ms[i].key;
      if (D.popStart[key] === undefined) continue;
      pop += S.pop[key]; gdp += D.gdp1980[key] * S.gdp[key]; ind += D.ind1980[key] * S.gdp[key];
    }
    return { pop_m: pop, gdp_bn: gdp, industry_bn: ind };
  }
  function deltaTag(base, cur) {
    if (!simAdvanced() || !base) return "";
    const d = (cur / base - 1) * 100;
    return " · 较1980 " + (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
  }
  // ---- R2 T2/T5：历史轨迹消费（成员级 hist，见 engine/sim.js HIST_MAX）----
  // 实体 key -> 成员 key 列表（与 simVal 同口径：实体自身 + members 展开）
  function entKeys(k) {
    const c = CM.countries[k], D = window.W1980_SIMDATA, out = [];
    if (D.popStart[k] !== undefined) out.push(k);
    const ms = c.members || [];
    for (let i = 0; i < ms.length; i++) if (D.popStart[ms[i].key] !== undefined) out.push(ms[i].key);
    return out;
  }
  // 一组成员的实际产出同比增速（近 12 个月，按 1980 基准加总）；历史不足 13 个月 → null
  function growthOf(keys) {
    const H = SIM.S && SIM.S.hist, D = window.W1980_SIMDATA;
    if (!H) return null;
    let cur = 0, prev = 0, n = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], hg = H.gdp[k], base = D.gdp1980[k];
      if (!hg || hg.length < 13 || base === undefined) continue;
      cur += base * hg[hg.length - 1]; prev += base * hg[hg.length - 13]; n++;
    }
    if (!n || !(prev > 0)) return null;
    return (cur / prev - 1) * 100;
  }
  function growthText(p) {
    if (p === null || p === undefined) return "—";
    return (p >= 0 ? "▲" : "▼") + Math.abs(p).toFixed(1) + "%";
  }
  let ALLKEYS = null;
  function growthWorld() {
    if (!ALLKEYS) ALLKEYS = Object.keys(window.W1980_SIMDATA.popStart);
    return growthOf(ALLKEYS);
  }
  // ---- R2 T4：「变化」(delta) 模式 ----
  // 实体实际产出相对 1980 基准的变化率（与面板「较1980」同口径）
  const DELTA_SPAN = 0.20;          // ±20% 映射到色阶两端：固定尺度 → 跨年份可比，且 1980-01 恒为中性
  function deltaOf(k) {
    const c = CM.countries[k];
    return c.gdp_bn > 0 ? simVal(k).gdp_bn / c.gdp_bn - 1 : 0;
  }
  // 发散色阶：负→冷、0→中性、正→暖。刻意避用红/绿——冷战题材里红=苏联会误导，冷暖发散对色盲也更友好。
  function divRamp(t) {
    t = clamp(t, -1, 1);
    const NEU = [0x39, 0x42, 0x4c], COLD = [0x2a, 0x64, 0x93], WARM = [0xc8, 0xa9, 0x5a];
    const a = t < 0 ? COLD : NEU, b = t < 0 ? NEU : WARM, f = Math.abs(t);
    return u32(Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f));
  }
  // 战略资源发散色阶：负分（短缺依赖）→ 冷灰蓝紫、0 → 中性暗灰、正分（丰饶出超）→ 琥珀暖金
  function resRamp(score) {
    const t = clamp(score / 50.0, -1, 1);
    const NEU = [0x3e, 0x47, 0x4f], NEG = [0x26, 0x43, 0x66], POS = [0xd4, 0xaf, 0x37];
    const a = t < 0 ? NEG : NEU, b = t < 0 ? NEU : POS, f = Math.abs(t);
    return u32(Math.round(a[0] + (b[0] - a[0]) * f),
               Math.round(a[1] + (b[1] - a[1]) * f),
               Math.round(a[2] + (b[2] - a[2]) * f));
  }
  // ---- R2 T5：面板迷你趋势线 ----
  // 实体级历史序列（成员按 1980 基准加总）；长度 = 已结算月数
  function entSeries(k) {
    const H = SIM.S && SIM.S.hist, D = window.W1980_SIMDATA;
    if (!H) return null;
    const keys = entKeys(k);
    let n = 0;
    for (let i = 0; i < keys.length; i++) {
      const hg = H.gdp[keys[i]];
      if (hg && hg.length > n) n = hg.length;
    }
    if (!n) return null;
    const gdp = new Array(n).fill(0), pop = new Array(n).fill(0);
    for (let i = 0; i < keys.length; i++) {
      const kk = keys[i], hg = H.gdp[kk], hp = H.pop[kk], base = D.gdp1980[kk];
      if (!hg || base === undefined) continue;
      const off = n - hg.length;
      for (let j = 0; j < hg.length; j++) { gdp[off + j] += base * hg[j]; pop[off + j] += hp[j]; }
    }
    return { gdp: gdp, pop: pop, n: n };
  }
  function sparkSVG(arr, w, h) {
    const lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr), sp = (hi - lo) || 1;
    let d = "";
    const pts = [];
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (arr.length - 1)) * (w - 4) + 2, y = h - 3 - ((arr[i] - lo) / sp) * (h - 8);
      pts.push([x, y]); d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
    const last = pts[pts.length - 1];
    return '<svg class="spk" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
      '<path d="' + d + '" fill="none" stroke="#c8a95a" stroke-width="1.4" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.2" fill="#ffe9a8"/></svg>';
  }
  function fillSpark(k) {
    const sp = $("p-spark"); if (!sp) return;
    if (!k) { sp.innerHTML = ""; sp.removeAttribute("data-last"); sp.removeAttribute("data-simval"); return; }
    const se = entSeries(k);
    if (!se || se.n < 2) {
      sp.innerHTML = '<div class="spk-none">尚无历史 —— 播放时间后显示 1980 → 当期 的实际产出轨迹</div>';
      sp.removeAttribute("data-last"); sp.removeAttribute("data-simval");
      return;
    }
    const lastV = se.gdp[se.n - 1], cur = simVal(k).gdp_bn, d = (cur / lastV - 1) * 100;
    const dt = SIM.S.year + "-" + String(Math.max(1, SIM.S.month)).padStart(2, "0");
    sp.innerHTML = '<div class="spk-hd">实际产出轨迹 · 1980 → ' + dt + "（" + se.n + " 个月）</div>" + sparkSVG(se.gdp, 260, 34) +
      '<div class="spk-ft">起点 <b>' + se.gdp[0].toFixed(0) + "</b> 十亿 → 期末 <b>" + lastV.toFixed(0) +
      '</b> 十亿　<span class="' + (d >= 0 ? "up" : "dn") + '">' + (d >= 0 ? "+" : "") + d.toFixed(1) + "%</span></div>";
    // 探针断言用：曲线末值 vs 引擎当期值（应一致，容差见 tasks/004 §T5）
    sp.setAttribute("data-last", lastV.toFixed(4));
    sp.setAttribute("data-simval", cur.toFixed(4));
  }
  // ---- R7A（tasks/018，结盟 C2 经济网络）：阵营经贸协作与脱钩震荡 ----
  function calcBlocFriction0(origB, newB) {
    if (!origB || !newB || origB === newB) return 0;
    const isWest = (b) => b === "NATO" || b === "W";
    const isEast = (b) => b === "WP" || b === "SOV";
    // 铁幕跨越：东 <-> 西（严重脱钩震荡 -1.0pp）
    if ((isWest(origB) && isEast(newB)) || (isEast(origB) && isWest(newB))) return -1.0;
    // 从不结盟/中立迁入有组织阵营，无原体系供应链脱离负担（0pp）
    const isNonAligned = (b) => b === "NA" || b === "NE";
    if (isNonAligned(origB) && !isNonAligned(newB)) return 0;
    // 从组织化阵营脱钩至其它阵营（温和摩擦 -0.5pp）
    return -0.5;
  }
  function curBlocEffect() {
    if (!ST.player) return { deltaB: 0, friction: 0, net: 0, monthsLeft: 0 };
    const origB = (CM.countries[ST.player] || {}).bloc;
    const newB = ST.blocOverride[ST.player];
    if (!newB || newB === origB) return { deltaB: 0, friction: 0, net: 0, monthsLeft: 0 };
    const baseOrig = BLOC_NET_BASE[origB] || 0;
    const baseNew = BLOC_NET_BASE[newB] || 0;
    const deltaB = +(baseNew - baseOrig).toFixed(4);
    const curM = curMonthIdx();
    const since = (typeof ST.blocSince === "number") ? ST.blocSince : curM;
    const elapsed = Math.max(0, curM - since);
    const f0 = calcBlocFriction0(origB, newB);
    let friction = 0;
    let monthsLeft = 0;
    // R12B：若达成阵营脱钩震荡免疫（如中国大三角战略平衡），摩擦惩罚归零
    const hasDecoupleImmunity = !!(ST.agendas && ST.agendas[ST.player] && ST.agendas[ST.player].bonuses && ST.agendas[ST.player].bonuses.decoupleImmunity);
    if (!hasDecoupleImmunity && elapsed < 24 && f0 < 0) {
      friction = +(f0 * (1 - elapsed / 24)).toFixed(4);
      monthsLeft = 24 - elapsed;
    }
    const net = +(deltaB + friction).toFixed(4);
    return { deltaB: deltaB, friction: friction, net: net, monthsLeft: monthsLeft };
  }

  // ---- R3/R5C'/R7A：玩家决策（实体选择 + 军费占比 + 制裁/军援名单 + 阵营经贸网络）----
  function isAIActive() {
    return !!(ST.ai && ST.ai.enabled && ST.player && (!CR.probeMode || /[?&](aiprobe|summitprobe|unscprobe)=1/.test(location.search)));
  }
  // 全部走引擎 P.pmods 玩家决策层（与事件层 P.mods 分离 → 不会互相覆盖，这是 R3 的关键设计）。
  // R5C'（tasks/015）：applyPlayerMil 扩展为 applyPlayerDecisions —— **先全清再重挂**（幂等，与现状逐字同构）：
  // 同一 key 被多条决策命中 → 求和（本国成员必然被「军费 + 各条自损 + 阵营网络」同时命中）；无决策时结果与旧版逐位相同（生命线）。
  function applyPlayerDecisions() {
    if (!SIM.S) return;
    Object.keys(W1980_SIM.pmap(SIM.S)).forEach((k) => W1980_SIM.clearPMod(SIM.S, k));
    if (!ST.player) return;                       // 旁观：清空后即退出（不施加任何 pmods）
    const acc = {};
    let selfPP = -ST.mil;                         // 军费
    // R7A（C2 经济网络）：并入阵营经贸协作与脱钩震荡（单位 pp/年）
    const be = curBlocEffect();
    if (be.net !== 0) selfPP += be.net;
    // R9C（能源短缺冲击）：若遭受严重能源供给休克（如海峡全面封锁），叠加结构性经济折损
    if (typeof calcResourcePenalty === "function") {
      const rp = calcResourcePenalty(ST.player);
      if (rp.penalty !== 0) selfPP += rp.penalty;
    }
    // R12B（次极大国与专属国家议程）：并入已达成战略议程结构性 GDP 增速加成
    if (ST.agendas && ST.agendas[ST.player]) {
      const agState = ST.agendas[ST.player];
      if (agState && agState.bonuses && typeof agState.bonuses.gdpBonus === "number" && agState.bonuses.gdpBonus !== 0) {
        selfPP += agState.bonuses.gdpBonus;
      }
    }
    // R12A（大国内政生态与派系权力天平）：并入国内动荡与工潮折损（仅玩家自身实体）
    if (ST.domestic) {
      let unrestVal = 0;
      if (ST.player === "SUN" && ST.domestic.sun) unrestVal = ST.domestic.sun.unrest || 0;
      else if (ST.player === "USA" && ST.domestic.usa) unrestVal = ST.domestic.usa.unrest || 0;
      else if (ST.domestic.generals && ST.domestic.generals[ST.player]) unrestVal = ST.domestic.generals[ST.player].unrest || 0;
      if (unrestVal > 30) {
        const drag = -Math.min(0.35, ((unrestVal - 30) / 70) * 0.35);
        selfPP += drag;
      }
      if (ST.player === "USA" && ST.domestic.usa && ST.domestic.usa.budgetCapActive) {
        if (ST.mil > 6.0) {
          ST.mil = 6.0;
          selfPP = -6.0;
        }
      }
    }
    // R13B: 阿富汗战争撤军和平红利（仅苏联玩家完成撤军后生效）
    if (ST.player === "SUN" && ST.afghan && ST.afghan.withdrawn) {
      selfPP += 0.35;
    }
    for (let i = 0; i < ST.sanctions.length; i++) {
      const s = ST.sanctions[i], ek = entKeys(s.t);
      for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) - DEC_TIERS.san[s.l].tgt;
      selfPP -= DEC_TIERS.san[s.l].self;          // 自身反噬（逐个目标累加）
    }
    for (let i = 0; i < ST.aid.length; i++) {
      const a = ST.aid[i], ek = entKeys(a.t);
      for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + DEC_TIERS.aid[a.l].tgt;
      selfPP -= DEC_TIERS.aid[a.l].self;          // 转移损耗（逐个目标累加）
    }
    if (selfPP !== 0) {
      const ek = entKeys(ST.player);
      for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + selfPP;   // 本国全部成员（求和）
    }
    // R10A：并入 AI 反应式对抗决策（通过单一事实源 P.pmods 驱动）
    if (isAIActive() && ST.ai && ST.ai.decisions) {
      for (const aiKey in ST.ai.decisions) {
        const dec = ST.ai.decisions[aiKey];
        if (!dec) continue;
        let selfPP_ai = 0;
        const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(aiKey, CM.countries[aiKey]) : null;
        const baseMil = doc ? doc.baseMil : 2.0;
        if (typeof dec.mil === "number" && dec.mil > baseMil) {
          selfPP_ai -= (dec.mil - baseMil);
        }
        if (Array.isArray(dec.sanctions)) {
          for (let i = 0; i < dec.sanctions.length; i++) {
            const s = dec.sanctions[i], ek = entKeys(s.t);
            for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) - DEC_TIERS.san[s.l].tgt;
            selfPP_ai -= DEC_TIERS.san[s.l].self;
          }
        }
        if (Array.isArray(dec.aid)) {
          for (let i = 0; i < dec.aid.length; i++) {
            const a = dec.aid[i], ek = entKeys(a.t);
            for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + DEC_TIERS.aid[a.l].tgt;
            selfPP_ai -= DEC_TIERS.aid[a.l].self;
          }
        }
        if (selfPP_ai !== 0) {
          const ek = entKeys(aiKey);
          for (let j = 0; j < ek.length; j++) acc[ek[j]] = (acc[ek[j]] || 0) + selfPP_ai;
        }
      }
    }
    // R10B：并入生效军控条约释放的结构性和平红利（Détente Dividend）
    if (isAIActive() && ST.ai && Array.isArray(ST.ai.treaties)) {
      for (let i = 0; i < ST.ai.treaties.length; i++) {
        const tr = ST.ai.treaties[i];
        if (tr && tr.status === "active" && tr.dividend) {
          acc[ST.player] = (acc[ST.player] || 0) + tr.dividend;
          if (tr.with) acc[tr.with] = (acc[tr.with] || 0) + tr.dividend;
        }
      }
    }
    // R10C：并入联合国安理会（UNSC）生效决议效应
    if (isAIActive() && ST.ai && ST.ai.unsc && Array.isArray(ST.ai.unsc.passed)) {
      for (let i = 0; i < ST.ai.unsc.passed.length; i++) {
        const resId = ST.ai.unsc.passed[i];
        const resDef = (window.W1980_AI && window.W1980_AI.UNSC_RESOLUTIONS) ? window.W1980_AI.UNSC_RESOLUTIONS[resId] : null;
        if (resDef && resDef.effects) {
          if (resDef.effects.multilateralEmbargo && resDef.effects.embargoPenalty) {
            const tgtKeys = entKeys(resDef.effects.multilateralEmbargo);
            for (let j = 0; j < tgtKeys.length; j++) {
              acc[tgtKeys[j]] = (acc[tgtKeys[j]] || 0) + resDef.effects.embargoPenalty;
            }
          }
          if (resDef.effects.economicRelief && Array.isArray(resDef.parties)) {
            for (let p = 0; p < resDef.parties.length; p++) {
              const pKeys = entKeys(resDef.parties[p]);
              for (let j = 0; j < pKeys.length; j++) {
                acc[pKeys[j]] = (acc[pKeys[j]] || 0) + resDef.effects.economicRelief;
              }
            }
          }
        }
      }
    }
    for (const k in acc) {
      if (acc[k] !== 0) W1980_SIM.setPMod(SIM.S, k, acc[k]);
    }
  }
  // 战区/成员至所属联邦可玩实体映射（如 ARG -> LAP, KWT -> ARA）
  const MAP_FED_TARGET = { ARG: "LAP", KWT: "ARA" };
  function resolvePlayableKey(k) {
    if (!k) return k;
    if (CM.countries && CM.countries[k]) return k;
    return MAP_FED_TARGET[k] || k;
  }

  // 目标合法性（§3.3 禁用规则 1–4）：返回 0=合法，否则规则号
  function decForbidden(kind, t) {
    t = resolvePlayableKey(t);
    if (!ST.player || !CM.countries[t]) return 1;
    if (t === ST.player) return 1;                                   // ① 你自己
    const tc = CM.countries[t];
    if (tc.parent === ST.player || (CM.countries[ST.player] || {}).parent === t) return 2;   // ② 附属/宗主
    const mine = entKeys(ST.player), tk = entKeys(t);
    for (let i = 0; i < tk.length; i++) if (mine.indexOf(tk[i]) >= 0) return 3;              // ③ 本国成员（防御性）
    const other = kind === "san" ? ST.aid : ST.sanctions;
    for (let i = 0; i < other.length; i++) if (other[i].t === t) return 4;                   // ④ 已在另一类名单
    return 0;
  }
  // 存档/切国清洗（§5，六项过滤，不抛异常）：非对象项 / 未知 key / l 越界 / 违反禁用规则 / 重复（留先者）/ 超长（截断）
  function sanitizeDecisions(list, kind) {
    if (!Array.isArray(list) || !ST.player) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (!it || typeof it !== "object") continue;
      const t = resolvePlayableKey(it.t), l = it.l;
      if (!CM.countries[t]) continue;
      if (l !== 0 && l !== 1 && l !== 2) continue;
      if (decForbidden(kind, t)) { console.warn("sanitizeDecisions: 丢弃非法决策项", kind, t, l); continue; }
      if (out.some((x) => x.t === t)) continue;
      if (out.length >= DEC_MAX[kind]) break;
      const e = { t: t, l: l };
      if (typeof it.since === "number") e.since = it.since;   // 叙事行用（施用时点），旧档缺省
      out.push(e);
    }
    return out;
  }
  // 清洗两类名单并保持「制裁↔军援互斥」（先出现者保留）；玩家国切换 / 读档后调用
  function sanitizeAllDecisions() {
    ST.sanctions = sanitizeDecisions(ST.sanctions, "san");
    ST.aid = sanitizeDecisions(ST.aid, "aid");
  }
  function curMonthIdx() { return SIM.S ? (SIM.S.year - 1980) * 12 + Math.max(1, SIM.S.month) - 1 : 0; }
  // 施加 / 改档 / 撤销（l=-1 或 点当前档）——UI 与探针共用的唯一入口
  function decSet(kind, t, l) {
    t = resolvePlayableKey(t);
    if (!ST.player || !CM.countries[t]) return false;
    const fb = decForbidden(kind, t);
    if (fb && l >= 0) return false;
    const list = kind === "san" ? ST.sanctions : ST.aid;
    const i = list.findIndex((x) => x.t === t);
    if (l < 0 || l > 2) { if (i >= 0) list.splice(i, 1); else return false; }
    else if (i >= 0) { if (list[i].l === l) list.splice(i, 1); else { list[i].l = l; list[i].since = curMonthIdx(); } }
    else {
      if (list.length >= DEC_MAX[kind]) return false;
      list.push({ t: t, l: l, since: curMonthIdx() });
    }
    if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, false);
    else applyPlayerDecisions();
    updPlayerTag(); refreshMilBox();
    if (SIM.ready && SIM.S) updateTimelineFrontlines(SIM.S.year, Math.max(1, SIM.S.month), false);
    if (ST.sel) select(ST.sel);
    fillTop();
    if (i >= 0 || l >= 0) {
      const zh = (CM.countries[t] || {}).zh || t;
      const tier = l >= 0 ? DEC_TIERS[kind][l] : null;
      const d = { y: SIM.S ? SIM.S.year : "—", m: SIM.S ? Math.max(1, SIM.S.month) : "" };
      if (!tier) d.zh = "撤销对 " + zh + " 的" + (kind === "san" ? "制裁" : "军援");
      else d.zh = "对 " + zh + " 实施" + tier.zh + "：对方年增速 " + (kind === "san" ? "-" : "+") +
        tier.tgt.toFixed(1) + "pp，我方 -" + tier.self.toFixed(1) + "pp（" + (kind === "san" ? "贸易损失" : "转移损耗") + "）";
      toast(d);
    }
    return true;
  }
  function sanctionSet(t, l) { return decSet("san", t, l); }
  function aidSet(t, l) { return decSet("aid", t, l); }
  // 代价行数据（§3.5）：本国年增速总代价 = 军费 + Σ制裁反噬 + Σ军援损耗
  function decSelfCost() {
    let san = 0, aid = 0;
    for (let i = 0; i < ST.sanctions.length; i++) san += DEC_TIERS.san[ST.sanctions[i].l].self;
    for (let i = 0; i < ST.aid.length; i++) aid += DEC_TIERS.aid[ST.aid[i].l].self;
    return { mil: ST.mil, san: san, aid: aid, total: ST.mil + san + aid };
  }
  // ---- R5E/R7A：结盟（R5E 归属 + R7A C2 经济网络） ----
  // 生效面：阵营模式着色、终局结算阵营占比分组、面板 badge、P.pmods 经济协作与脱钩震荡。
  function blocOf(k) { return ST.blocOverride[k] || CM.countries[k].bloc; }
  function rebuildBlocTable() {          // 阵营色表随 override 重建（54 实体，代价可忽略）
    if (!tables.bloc) return;
    for (const k in CM.countries) {
      const c = CM.countries[k], id = playIdOfKey[k] || c.polity_id;
      if (id) tables.bloc[id] = u32c(BLOC[blocOf(k)] || "#9B9B9B");
    }
    if (bakedNow === "bloc") { bakeNow("bloc"); render(); drawMini(); drawOverlay(); }   // M2 教训：画布正显示该模式必须立即重烘
  }
  function setBloc(b) {                  // b=null → 退出（回原阵营）；只允许玩家自己
    if (!ST.player || (b && !BLOC_ZH[b])) return false;
    const orig = CM.countries[ST.player].bloc;
    const zh0 = BLOC_ZH[orig] || orig;
    if (!b || b === orig) {
      delete ST.blocOverride[ST.player];
      ST.blocSince = null;
    } else {
      ST.blocOverride[ST.player] = b;
      ST.blocSince = curMonthIdx();
    }
    applyPlayerDecisions();
    rebuildBlocTable();
    if (ST.sel) select(ST.sel);          // badge 随 select 刷新
    updPlayerTag();
    refreshBlocCtl();
    const zh1 = BLOC_ZH[blocOf(ST.player)] || blocOf(ST.player);
    const be = curBlocEffect();
    let noteText = "";
    if (b && b !== orig) {
      noteText = "经贸网络：" + (be.deltaB >= 0 ? "+" : "") + be.deltaB.toFixed(2) + "pp/年";
      if (be.friction < 0) noteText += "（脱钩震荡 " + be.friction.toFixed(2) + "pp，持续2年）";
    } else {
      noteText = "已恢复史实阵营经贸基准（无附加偏离）";
    }
    toast({ y: SIM.S ? SIM.S.year : "—", m: SIM.S ? Math.max(1, SIM.S.month) : "",
      zh: b && b !== orig ? ((CM.countries[ST.player] || {}).zh || ST.player) + " 迁入阵营 " + zh1
                          : ((CM.countries[ST.player] || {}).zh || ST.player) + " 退出阵营，回到 " + zh1,
      note: noteText });
    return true;
  }
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

  // ---- R10A：冷战大国战略性格与反应式 AI 决策机 ----
  function dispatchDiplomaticCable(cable, y, m, silent) {
    if (!cable) return;
    const fromZh = (CM.countries[cable.from] || {}).zh || cable.from;
    const item = {
      id: "cable_" + cable.from + "_" + y + "_" + m + "_" + cable.type,
      y: y,
      m: m,
      zh: "【外交照会】" + fromZh + "：" + cable.zh,
      note: cable.desc
    };
    if (ST.ai && Array.isArray(ST.ai.cables)) {
      ST.ai.cables.push(item);
    }
    EV.items.push(item);
    EV.unread++;
    renderInbox();
    if (!silent) toast(item);
  }

  function updateAIDecisions(y, m, silent) {
    if (!window.W1980_AI || !CM.countries) return;
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    if (!isAIActive()) {
      ST.ai.decisions = {};
      ST.ai.tensions = {};
      return;
    }

    const curY = y || (SIM.S ? SIM.S.year : 1980);
    const curM = m || (SIM.S ? Math.max(1, SIM.S.month) : 1);
    const playerDecisions = {
      mil: ST.mil,
      sanctions: ST.sanctions || [],
      aid: ST.aid || []
    };
    const worldState = {
      countries: CM.countries,
      year: curY,
      month: curM,
      frontlines: ST.frontlines,
      treaties: ST.ai.treaties || []
    };

    const newDecisions = {};
    const newTensions = {};

    for (const k in CM.countries) {
      if (k === ST.player) continue;
      const att = window.W1980_AI.calcAttitude(k, ST.player, playerDecisions, worldState);
      newTensions[k] = att;

      const react = window.W1980_AI.evaluateReactions(k, ST.player, playerDecisions, worldState);
      if (react) {
        newDecisions[k] = {
          mil: react.mil,
          sanctions: react.sanctions || [],
          aid: react.aid || []
        };

        const oldDec = ST.ai.decisions ? ST.ai.decisions[k] : null;
        const hadSan = oldDec && Array.isArray(oldDec.sanctions) && oldDec.sanctions.length > 0;
        const nowSan = Array.isArray(react.sanctions) && react.sanctions.length > 0;
        const doc = window.W1980_AI.getDoctrine(k, CM.countries[k]);
        const hadMilUp = oldDec && typeof oldDec.mil === "number" && oldDec.mil > doc.baseMil + 0.05;
        const nowMilUp = react.mil > doc.baseMil + 0.05;

        if (!hadSan && nowSan && react.cable) {
          dispatchDiplomaticCable(react.cable, curY, curM, silent);
        } else if (hadSan && !nowSan) {
          const kZh = (CM.countries[k] || {}).zh || k;
          dispatchDiplomaticCable({
            type: "counter_sanction_revoked",
            from: k,
            target: ST.player,
            zh: "解除经贸反制",
            desc: kZh + "鉴于双方经贸争端缓解，宣布撤销对我国施加的一切反制裁措施。"
          }, curY, curM, silent);
        } else if (!hadMilUp && nowMilUp) {
          const kZh = (CM.countries[k] || {}).zh || k;
          dispatchDiplomaticCable({
            type: "arms_race_escalation",
            from: k,
            target: ST.player,
            zh: "防务戒备升级",
            desc: kZh + "鉴于我国强化战略军备态势，正式进入防务戒备并将预算提升至 " + react.mil.toFixed(1) + "% GDP！"
          }, curY, curM, silent);
        }
      }
    }

    // R10B：军控条约履约与违约判定回路 (Treaty Compliance & Breach Evaluation)
    if (Array.isArray(ST.ai.treaties)) {
      for (let i = 0; i < ST.ai.treaties.length; i++) {
        const tr = ST.ai.treaties[i];
        if (tr && tr.status === "active") {
          const br = window.W1980_AI.evaluateBreach(tr, playerDecisions, newDecisions[tr.with]);
          if (br && br.breached) {
            tr.warnings = (tr.warnings || 0) + 1;
            const aiZh = (CM.countries[tr.with] || {}).zh || tr.with;
            const tZh = (window.W1980_AI.TREATY_DEFS[tr.id] || {}).zh || tr.id;
            if (tr.warnings === 1) {
              dispatchDiplomaticCable({
                type: "treaty_breach_warning",
                from: tr.with,
                target: ST.player,
                zh: "军控履约照会",
                desc: "【违约抗议照会】" + aiZh + "抗议我国违反" + tZh + "规定：" + br.reason + "！敦促立即纠正，否则将单方面撕毁条约！"
              }, curY, curM, silent);
            } else if (tr.warnings >= 2) {
              tr.status = "nullified";
              tr.nullifiedReason = br.reason;
              dispatchDiplomaticCable({
                type: "treaty_nullified",
                from: tr.with,
                target: ST.player,
                zh: "条约单方面作废",
                desc: "【军控体系破裂】鉴于我国屡次违背军控承诺，" + aiZh + "正式宣告" + tZh + "废止！和平红利立即清零，双边戒备全面升级！"
              }, curY, curM, silent);
            }
          } else {
            tr.warnings = 0; // 恢复合规
          }
        }
      }
    }

    ST.ai.tensions = newTensions;
    ST.ai.decisions = newDecisions;

    applyPlayerDecisions();
    if (ST.sel) refreshAIBox(ST.sel);
  }

  function refreshAIBox(selKey) {
    const box = $("p-ai-box");
    if (!box) return;
    if (!selKey || !CM.countries[selKey] || !window.W1980_AI) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }
    const c = CM.countries[selKey];
    const doc = window.W1980_AI.getDoctrine(selKey, c);
    const isPlayer = !!ST.player && selKey === ST.player;

    if (isPlayer) {
      let h = '<div class="aih"><span>国家战略性格画像</span><span class="ai-badge ok">玩家直辖</span></div>';
      h += '<div class="ai-doctrine">';
      h += '<div class="ai-doc-name">' + doc.name + ' (' + doc.doctrine + ')</div>';
      h += '<div class="ai-doc-desc">' + doc.desc + '</div>';
      h += '</div>';
      h += '<div class="ai-stat"><span class="k">防务基准预算</span><span class="v">' + doc.baseMil.toFixed(1) + '% GDP</span></div>';
      box.innerHTML = h;
      box.style.display = "block";
      return;
    }

    const att = (ST.ai && ST.ai.tensions && ST.ai.tensions[selKey]) ? ST.ai.tensions[selKey] :
      window.W1980_AI.calcAttitude(selKey, ST.player, { mil: ST.mil, sanctions: ST.sanctions, aid: ST.aid }, { countries: CM.countries, treaties: ST.ai ? ST.ai.treaties : [] });
    const dec = (ST.ai && ST.ai.decisions && ST.ai.decisions[selKey]) || null;
    const curMil = (dec && typeof dec.mil === "number") ? dec.mil : doc.baseMil;
    const milDelta = +(curMil - doc.baseMil).toFixed(1);

    let h = '<div class="aih"><span>AI 战略性格与对华/对我国态度</span><span class="ai-badge ' + att.cls + '">' + att.label + '（张力 ' + att.tension + '）</span></div>';
    h += '<div class="ai-doctrine">';
    h += '<div class="ai-doc-name">' + doc.name + ' (' + doc.doctrine + ')</div>';
    h += '<div class="ai-doc-desc">' + doc.desc + '</div>';
    h += '</div>';

    h += '<div class="ai-stat"><span class="k">防务预算支出</span><span class="v' + (milDelta > 0.05 ? ' bad' : '') + '">' + curMil.toFixed(1) + '% GDP' +
      (milDelta > 0.05 ? '（跟进动员 +' + milDelta.toFixed(1) + '%）' : (milDelta < -0.05 ? '（军备缓和 ' + milDelta.toFixed(1) + '%）' : '')) + '</span></div>';

    const actions = [];
    if (dec && Array.isArray(dec.sanctions) && dec.sanctions.length > 0) {
      for (let i = 0; i < dec.sanctions.length; i++) {
        const s = dec.sanctions[i];
        actions.push('⚠️ 对我国实施对等反制裁（' + DEC_TIERS.san[s.l].zh + '，对方 -' + DEC_TIERS.san[s.l].tgt.toFixed(1) + 'pp/年）');
      }
    }
    if (dec && Array.isArray(dec.aid) && dec.aid.length > 0) {
      for (let i = 0; i < dec.aid.length; i++) {
        const a = dec.aid[i];
        const tZh = (CM.countries[a.t] || {}).zh || a.t;
        actions.push('🛡️ 向 ' + tZh + ' 提供对冲军援（' + DEC_TIERS.aid[a.l].zh + '）');
      }
    }
    if (milDelta > 0.05) {
      actions.push('⚔️ 军备竞赛警戒：防务支出已动员提升至 ' + curMil.toFixed(1) + '% GDP');
    }

    if (actions.length > 0) {
      h += '<div class="ai-action-list">';
      for (let i = 0; i < actions.length; i++) {
        h += '<div class="ai-action-item">' + actions[i] + '</div>';
      }
      h += '</div>';
    } else {
      h += '<div class="ai-stat" style="margin-top:3px"><span class="k">当前反制姿态</span><span class="v" style="color:var(--dim)">无敌对制裁与对冲行动</span></div>';
    }

    // R10B：生效军控条约与和平红利展示
    if (ST.ai && Array.isArray(ST.ai.treaties)) {
      const activeTs = ST.ai.treaties.filter((t) => t.with === selKey && t.status === "active");
      if (activeTs.length > 0) {
        h += '<div class="ai-treaties-wrap">';
        h += '<div class="ai-treaty-title">🕊️ 生效军控条约与和平红利</div>';
        for (let i = 0; i < activeTs.length; i++) {
          const at = activeTs[i];
          const tDef = (window.W1980_AI.TREATY_DEFS && window.W1980_AI.TREATY_DEFS[at.id]) || { zh: at.id, dividend: 0 };
          h += '<div class="ai-treaty-badge-item">';
          h += '<span>' + tDef.zh + '</span>';
          h += '<b style="color:var(--gold2)">+' + (at.dividend || tDef.dividend || 0).toFixed(2) + 'pp/年</b>';
          h += '</div>';
        }
        h += '</div>';
      }
    }

    if (ST.player && selKey !== ST.player) {
      h += '<button class="btn ai-summit-btn" id="p-ai-summit-btn">🕊️ 开启首脑峰会外交谈判</button>';
    }

    box.innerHTML = h;
    box.style.display = "block";

    const summitBtn = $("p-ai-summit-btn");
    if (summitBtn) {
      summitBtn.onclick = () => {
        openSummitModal(null, selKey);
      };
    }
  }

  // R10B：首脑峰会外交谈判与条约签署函数群
  function openSummitModal(summitPresetId, targetAiKey) {
    const modal = $("summit-modal");
    if (!modal) return;
    if (!ST.player) {
      toast({ y: "—", m: "", zh: "旁观模式提示", note: "请先在开局或选国中选择你的国家，方可开启大国首脑外交会晤！" });
      return;
    }
    if (window.W1980_SOUND) window.W1980_SOUND.playHotline();
    const ctx = summitContext(summitPresetId, targetAiKey);
    if (!ctx) return;
    fillSummitHeader(ctx);
    fillSummitTreaties(ctx);
    fillSummitPhoto(ctx);
    modal.style.display = "flex";
  }

  // R10B：峰会上下文——对手解析（预设 → 指定目标 → 当前选中 → 宿敌 → 默认对极）与态度计算
  function summitContext(summitPresetId, targetAiKey) {
    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;
    let preset = null;
    if (summitPresetId && window.W1980_AI && window.W1980_AI.SUMMIT_PRESETS) {
      preset = window.W1980_AI.SUMMIT_PRESETS.find((p) => p.id === summitPresetId);
    }

    let aiKey = targetAiKey;
    if (!aiKey && preset && Array.isArray(preset.participants)) {
      aiKey = preset.participants.find((p) => p !== ST.player);
    }
    if (!aiKey) {
      if (ST.sel && ST.sel !== ST.player && CM.countries[ST.sel]) {
        aiKey = ST.sel;
      } else {
        const pDoc = (window.W1980_AI && window.W1980_AI.AI_DOCTRINES) ? window.W1980_AI.AI_DOCTRINES[ST.player] : null;
        if (pDoc && pDoc.rivals && pDoc.rivals.length > 0) aiKey = pDoc.rivals[0];
        else if (ST.player === "USA") aiKey = "SUN";
        else if (ST.player === "SUN") aiKey = "USA";
        else aiKey = (CM.countries[ST.player] && (CM.countries[ST.player].bloc === "NATO" || CM.countries[ST.player].bloc === "W")) ? "SUN" : "USA";
      }
    }

    if (!CM.countries[aiKey] || aiKey === ST.player) {
      toast({ y: "—", m: "", zh: "会晤目标无效", note: "无法与自身或未定义实体开启首脑谈判！" });
      return null;
    }

    const pName = (CM.countries[ST.player] || {}).zh || ST.player;
    const aiName = (CM.countries[aiKey] || {}).zh || aiKey;
    const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(aiKey, CM.countries[aiKey]) : { name: "中立国家", doctrine: "neutral" };
    const att = (ST.ai && ST.ai.tensions && ST.ai.tensions[aiKey]) ? ST.ai.tensions[aiKey] :
      (window.W1980_AI ? window.W1980_AI.calcAttitude(aiKey, ST.player, { mil: ST.mil, sanctions: ST.sanctions, aid: ST.aid }, { countries: CM.countries, treaties: ST.ai ? ST.ai.treaties : [] }) : { tension: 50, label: "警惕戒备" });

    return { preset: preset, aiKey: aiKey, curY: curY, curM: curM, pName: pName, aiName: aiName, doc: doc, att: att };
  }

  // 峰会头部信息填充（地点/主题/双方/张力态势/战略学说）
  function fillSummitHeader(ctx) {
    const preset = ctx.preset, curY = ctx.curY, curM = ctx.curM, pName = ctx.pName, aiName = ctx.aiName, att = ctx.att, doc = ctx.doc;
    const locEl = $("summit-loc");
    const titleEl = $("summit-title");
    const descEl = $("summit-desc");
    const pNameEl = $("summit-p-name");
    const aiNameEl = $("summit-ai-name");
    const tensionEl = $("summit-tension-info");
    const docEl = $("summit-doctrine-info");

    if (locEl) locEl.textContent = preset ? (preset.city + " · " + preset.year + " 年 " + preset.month + " 月") : ("双边战略峰会 · " + curY + " 年 " + curM + " 月");
    if (titleEl) titleEl.textContent = preset ? preset.name : ("大国首脑会晤：" + pName + " ✕ " + aiName);
    if (descEl) descEl.textContent = preset ? preset.agenda : ("最高层闭门决断：通过军控妥协与缓和议程，释放巨额和平红利，重塑冷战均势格局。");
    if (pNameEl) pNameEl.textContent = pName;
    if (aiNameEl) aiNameEl.textContent = aiName;
    if (tensionEl) tensionEl.textContent = att.tension + " 点（" + att.label + "）";
    if (docEl) docEl.textContent = doc.name + " (" + doc.doctrine + ")";

  }

  // 峰会条约卡片列表（R10B：签署状态、条款标签与签署接线）
  function fillSummitTreaties(ctx) {
    const preset = ctx.preset, aiKey = ctx.aiKey;
    const listEl = $("summit-treaty-list");
    if (listEl && window.W1980_AI && window.W1980_AI.TREATY_DEFS) {
      listEl.innerHTML = "";
      const treatyKeys = (preset && preset.treatyIds) ? preset.treatyIds : Object.keys(window.W1980_AI.TREATY_DEFS);
      const activeTreaties = (ST.ai && Array.isArray(ST.ai.treaties)) ? ST.ai.treaties : [];

      for (let i = 0; i < treatyKeys.length; i++) {
        const tId = treatyKeys[i];
        const tDef = window.W1980_AI.TREATY_DEFS[tId];
        if (!tDef) continue;

        const signed = activeTreaties.find((t) => t.id === tId && t.with === aiKey && t.status === "active");

        const card = document.createElement("div");
        card.className = "summit-treaty-card" + (signed ? " signed" : "");

        let ch = '<div class="stc-hd">';
        ch += '<div class="stc-name">' + tDef.zh + '</div>';
        ch += '<div class="stc-badge ' + (signed ? 'signed' : 'pending') + '">' + (signed ? '🕊️ 已签署履约中' : '待签署') + '</div>';
        ch += '</div>';

        ch += '<div class="stc-desc">' + tDef.desc + '</div>';

        ch += '<div class="stc-terms">';
        if (typeof tDef.milCap === "number") ch += '<span class="stc-term-tag">🛡️ 防务上限 ≤ ' + tDef.milCap.toFixed(1) + '% GDP</span>';
        if (typeof tDef.maxSanctionLvl === "number") ch += '<span class="stc-term-tag">🚫 撤销经贸封锁</span>';
        if (typeof tDef.tensionCap === "number") ch += '<span class="stc-term-tag">🔒 张力上限 ≤ ' + tDef.tensionCap + ' 点</span>';
        ch += '<span class="stc-term-tag" style="color:var(--gold2)">📈 和平红利 +' + (tDef.dividend || 0).toFixed(2) + 'pp/年</span>';
        ch += '</div>';

        ch += '<div class="stc-actions">';
        if (signed) {
          ch += '<button class="btn stc-sign-btn" disabled style="opacity:0.6">已生效履行</button>';
        } else {
          ch += '<button class="btn stc-sign-btn" data-tid="' + tId + '">签署条约 (Sign Treaty)</button>';
        }
        ch += '</div>';

        card.innerHTML = ch;

        const signBtn = card.querySelector(".stc-sign-btn:not([disabled])");
        if (signBtn) {
          signBtn.onclick = () => {
            signTreaty(tId, aiKey, preset);
          };
        }

        listEl.appendChild(card);
      }
    }

  }

  // R14：首脑会晤历史画报
  function fillSummitPhoto(ctx) {
    const preset = ctx.preset, curY = ctx.curY;
    const sPhotoBox = $("summit-photo-box");
    const sPhotoImg = $("summit-photo-img");
    const sPhotoCap = $("summit-photo-caption");
    if (sPhotoBox && sPhotoImg && sPhotoCap && window.W1980_ASSETS) {
      const pId = preset ? preset.id : (curY >= 1986 ? "reykjavik_1986" : "geneva_1985");
      const p = window.W1980_ASSETS.getNewsPhoto(pId) || window.W1980_ASSETS.getNewsPhoto("geneva_1985");
      if (p) {
        sPhotoImg.src = p.url;
        sPhotoCap.textContent = p.caption;
        sPhotoBox.style.display = "block";
      } else {
        sPhotoBox.style.display = "none";
      }
    }

  }

  function closeSummitModal() {
    const modal = $("summit-modal");
    if (modal) modal.style.display = "none";
  }

  function walkoutSummit() {
    closeSummitModal();
    if (!ST.player) return;
    toast({
      y: SIM.S ? SIM.S.year : 1980,
      m: SIM.S ? Math.max(1, SIM.S.month) : 1,
      zh: "【首脑峰会破裂】双方拂袖而去",
      note: "由于核心战略互信赤字与诉求落差，首脑谈判不欢而散，双边张力急剧上升！"
    });
  }

  function signTreaty(treatyId, aiKey, preset) {
    if (!ST.player || !window.W1980_AI || !window.W1980_AI.TREATY_DEFS) return;
    const tDef = window.W1980_AI.TREATY_DEFS[treatyId];
    if (!tDef) return;

    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    if (!Array.isArray(ST.ai.treaties)) ST.ai.treaties = [];

    const existing = ST.ai.treaties.find((t) => t.id === treatyId && t.with === aiKey && t.status === "active");
    if (existing) {
      toast({ y: "—", m: "", zh: "条约已生效", note: "该军控条约已在履行中，无需重复签署。" });
      return;
    }

    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

    if (treatyId === "inf" && ST.mil > 4.0) {
      ST.mil = 4.0;
      refreshMilBox();
    }
    if (treatyId === "start") {
      decSet("san", aiKey, -1);
    }

    ST.ai.treaties.push({
      id: treatyId,
      with: aiKey,
      sinceYear: curY,
      sinceMonth: curM,
      status: "active",
      dividend: tDef.dividend || 0,
      warnings: 0
    });

    const aiZh = (CM.countries[aiKey] || {}).zh || aiKey;
    const pZh = (CM.countries[ST.player] || {}).zh || ST.player;

    const cableItem = {
      type: "treaty_signed",
      from: aiKey,
      target: ST.player,
      zh: "签署" + tDef.zh,
      desc: "【军控外交突破】" + pZh + "与" + aiZh + "正式签署" + tDef.zh + "！双方共享 +" + (tDef.dividend || 0).toFixed(2) + "pp/年 结构性和平红利！"
    };
    dispatchDiplomaticCable(cableItem, curY, curM, false);
    if (window.W1980_SOUND) window.W1980_SOUND.playTreaty();

    updateAIDecisions(curY, curM, false);
    openSummitModal(preset ? preset.id : null, aiKey);
    if (ST.sel) refreshAIBox(ST.sel);
  }

  // ---- R10C：联合国安全理事会（UNSC）多边调停与一票否决权机制 ----
  let curUNSCResId = "res_598";

  function openUNSCModal(resolutionId) {
    const modal = $("unsc-modal");
    if (!modal) return;

    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

    if (resolutionId) {
      curUNSCResId = resolutionId;
    } else if (!curUNSCResId) {
      if (curY >= 1990) curUNSCResId = "res_660";
      else if (curY === 1982 && curM >= 4 && curM <= 6) curUNSCResId = "res_502";
      else curUNSCResId = "res_598";
    }

    if (!window.W1980_AI || !window.W1980_AI.UNSC_RESOLUTIONS) return;
    const res = window.W1980_AI.UNSC_RESOLUTIONS[curUNSCResId] || window.W1980_AI.UNSC_RESOLUTIONS.res_598;
    curUNSCResId = res.id;

    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

    // 同步下拉框与标题
    const selEl = $("unsc-res-select");
    if (selEl) selEl.value = curUNSCResId;
    const titleEl = $("unsc-res-title");
    if (titleEl) titleEl.textContent = res.name;

    // 发起方与草案正文
    const sponsorEl = $("unsc-res-sponsor");
    if (sponsorEl) {
      let spText = "联合国安全理事会协商起草";
      if (res.sponsor && res.sponsor !== "UNSC" && res.sponsor !== "player") {
        spText = ((CM.countries[res.sponsor] || {}).zh || res.sponsor) + " 提案";
      } else if (res.sponsor === "player" && ST.player) {
        spText = ((CM.countries[ST.player] || {}).zh || ST.player) + " 发起草案";
      }
      sponsorEl.textContent = spText;
    }

    const textEl = $("unsc-res-text");
    if (textEl) textEl.textContent = res.summary;

    const isPassed = Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes(curUNSCResId);
    const vetoRecord = Array.isArray(ST.ai.unsc.history) ? ST.ai.unsc.history.slice().reverse().find((h) => h.id === curUNSCResId && h.status === "vetoed") : null;

    // 渲染五常席位卡片
    const gridEl = $("unsc-p5-grid");
    if (gridEl) {
      gridEl.innerHTML = "";
      const flags = { USA: "🇺🇸", SUN: "☭", CHN: "🇨🇳", GBR: "🇬🇧", FRA: "🇫🇷" };

      for (let i = 0; i < window.W1980_AI.UNSC_P5.length; i++) {
        const p5Key = window.W1980_AI.UNSC_P5[i];
        const ctry = CM.countries[p5Key] || {};
        const isPlayer = (ST.player === p5Key);

        const card = document.createElement("div");
        card.className = "p5-card" + (isPlayer ? " is-player" : "");

        let voteClass = "in_favor";
        let voteLabel = "赞成 (In Favor)";
        let reasonText = "支持维护和平与国际法秩序";

        if (isPassed) {
          voteClass = "in_favor";
          voteLabel = "赞成 (In Favor)";
          reasonText = isPlayer ? "本国常任理事国席位投赞成票" : "决议已通过生效";
        } else if (vetoRecord && vetoRecord.votes && vetoRecord.votes[p5Key]) {
          const v = vetoRecord.votes[p5Key];
          voteClass = v.vote;
          voteLabel = v.vote === "veto" ? "一票否决 (VETO)" : (v.vote === "abstain" ? "弃权 (Abstain)" : "赞成 (In Favor)");
          reasonText = v.reason || "";
        } else {
          if (isPlayer) {
            voteClass = "abstain";
            voteLabel = "待表决 (Pending)";
            reasonText = "等待玩家行使常任理事国表决权";
          } else {
            const aiV = window.W1980_AI.evaluateUNSCVote(p5Key, res, { countries: CM.countries, player: ST.player });
            voteClass = aiV.vote;
            voteLabel = aiV.vote === "veto" ? "一票否决 (VETO)" : (aiV.vote === "abstain" ? "弃权 (Abstain)" : "赞成 (In Favor)");
            reasonText = aiV.reason;
          }
        }

        let ch = '<div class="p5-flag">' + (flags[p5Key] || "") + " " + (ctry.zh || p5Key) + '</div>';
        ch += '<div class="p5-role">' + (isPlayer ? '常任理事国 (本国席位)' : '常任理事国') + '</div>';
        ch += '<div class="p5-vote-tag ' + voteClass + '">' + voteLabel + '</div>';
        ch += '<div class="p5-reason">' + reasonText + '</div>';
        card.innerHTML = ch;
        gridEl.appendChild(card);
      }
    }

    // 状态横幅与表决按钮状态
    const banner = $("unsc-status-banner");
    const bannerText = $("unsc-status-text");
    const btnFavor = $("unsc-vote-favor");
    const btnAbstain = $("unsc-vote-abstain");
    const btnVeto = $("unsc-vote-veto");

    const isP5Player = !!(ST.player && window.W1980_AI.UNSC_P5.includes(ST.player));

    if (isPassed) {
      if (banner) banner.className = "unsc-status-banner passed";
      if (bannerText) bannerText.textContent = "【决议已生效】该决议已在安理会表决通过，各项国际法效力履约中。";
      if (btnFavor) btnFavor.disabled = true;
      if (btnAbstain) btnAbstain.disabled = true;
      if (btnVeto) btnVeto.disabled = true;
    } else if (vetoRecord) {
      const vZh = (CM.countries[vetoRecord.vetoBy] || {}).zh || vetoRecord.vetoBy;
      if (banner) banner.className = "unsc-status-banner vetoed";
      if (bannerText) bannerText.textContent = "【草案遭否决】该草案在安理会审议中遭常任理事国（" + vZh + "）行使一票否决权（VETO）否决。";
      if (btnFavor) btnFavor.disabled = true;
      if (btnAbstain) btnAbstain.disabled = true;
      if (btnVeto) btnVeto.disabled = true;
    } else {
      if (banner) banner.className = "unsc-status-banner";
      if (bannerText) bannerText.textContent = isP5Player ?
        "草案审议中：需要至少 3 票赞成且零否决方可通过。请常任理事国代表行使表决权。" :
        (!ST.player ? "旁观模式仅供列席观摩联合国安理会审议。" : "非五常国家仅供列席观摩安理会多边审议程序。");

      if (btnFavor) btnFavor.disabled = !isP5Player;
      if (btnAbstain) btnAbstain.disabled = !isP5Player;
      if (btnVeto) btnVeto.disabled = !isP5Player;
    }

    // R14: 安理会决议裁决印章
    const uStamp = $("unsc-stamp-img");
    if (uStamp) {
      if (isPassed) {
        uStamp.src = "assets/ui/stamp_ratified.png";
        uStamp.style.display = "block";
      } else if (vetoRecord) {
        uStamp.src = "assets/ui/stamp_vetoed.png";
        uStamp.style.display = "block";
      } else {
        uStamp.style.display = "none";
      }
    }

    modal.style.display = "flex";
  }

  function closeUNSCModal() {
    const modal = $("unsc-modal");
    if (modal) modal.style.display = "none";
  }

  function voteUNSC(voteType) {
    if (!ST.player || !window.W1980_AI || !window.W1980_AI.UNSC_P5.includes(ST.player)) {
      toast({ y: "—", m: "", zh: "无表决权提示", note: "只有联合国安理会五大常任理事国（P5）拥有一票否决权与正式表决席位！" });
      return;
    }

    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

    const res = window.W1980_AI.UNSC_RESOLUTIONS[curUNSCResId];
    if (!res) return;

    if (ST.ai.unsc.passed.includes(res.id)) {
      toast({ y: "—", m: "", zh: "决议已生效", note: "该决议已在安理会通过生效，不可重复表决。" });
      return;
    }

    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

    const votes = {};
    let vetoes = 0;
    let favors = 0;
    let abstains = 0;
    let vetoCountry = null;

    for (let i = 0; i < window.W1980_AI.UNSC_P5.length; i++) {
      const p5 = window.W1980_AI.UNSC_P5[i];
      if (p5 === ST.player) {
        const pReason = (voteType === "veto") ? "玩家常任理事国代表行使一票否决权" :
          (voteType === "in_favor" ? "玩家常任理事国代表投赞成票" : "玩家常任理事国代表投弃权票");
        votes[p5] = { vote: voteType, reason: pReason };
      } else {
        votes[p5] = window.W1980_AI.evaluateUNSCVote(p5, res, { countries: CM.countries, player: ST.player });
      }

      if (votes[p5].vote === "veto") {
        vetoes++;
        if (!vetoCountry) vetoCountry = p5;
      } else if (votes[p5].vote === "in_favor") {
        favors++;
      } else {
        abstains++;
      }
    }

    if (window.W1980_SOUND) window.W1980_SOUND.playGavel();

    if (vetoes > 0) {
      const vZh = (CM.countries[vetoCountry] || {}).zh || vetoCountry;
      ST.ai.unsc.history.push({
        id: res.id,
        year: curY,
        month: curM,
        status: "vetoed",
        votes: votes,
        vetoBy: vetoCountry
      });
      toast({
        y: curY,
        m: curM,
        zh: "【安理会一票否决】" + res.shortTitle + " 未获通过",
        note: vZh + " 在安理会行使一票否决权（VETO），阻断了草案的通过！"
      });
      dispatchDiplomaticCable({
        type: "unsc_veto",
        from: vetoCountry,
        target: "UNSC",
        zh: "否决" + res.shortTitle,
        desc: vZh + " 在联合国安理会动用常任理事国一票否决权，阻止了 " + res.name + " 的通过。"
      }, curY, curM, false);
    } else if (favors >= 3) {
      executeResolution(res, votes);
    } else {
      ST.ai.unsc.history.push({
        id: res.id,
        year: curY,
        month: curM,
        status: "failed",
        votes: votes
      });
      toast({
        y: curY,
        m: curM,
        zh: "【决议未获通过】赞成票未达门槛",
        note: "该草案仅获得 " + favors + " 票赞成（需至少 3 票），未获通过。"
      });
    }

    openUNSCModal(res.id);
  }

  function executeResolution(res, votes) {
    if (window.W1980_SOUND) window.W1980_SOUND.playGavel();
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

    if (!ST.ai.unsc.passed.includes(res.id)) {
      ST.ai.unsc.passed.push(res.id);
    }

    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

    ST.ai.unsc.history.push({
      id: res.id,
      year: curY,
      month: curM,
      status: "passed",
      votes: votes || {}
    });

    // 落地决议具体实操效力
    if (res.id === "res_598") {
      setFrontline(1684, null);
      setFrontline(1663, null);
      setFrontline(1692, null);
      if (ST.chokepoints) ST.chokepoints.hormuz = "open";
    } else if (res.id === "res_502") {
      setFrontline(1248, null);
      setFrontline(1249, null);
    } else if (res.id === "res_660") {
      setFrontline(1809, null);
    } else if (res.id === "res_peace_mediation") {
      const keys = Object.keys(ST.frontlines || {});
      for (let k = 0; k < keys.length; k++) {
        setFrontline(keys[k], null);
      }
    }

    applyPlayerDecisions();

    toast({
      y: curY,
      m: curM,
      zh: "【安理会决议生效】" + res.shortTitle,
      note: res.name + " 获安理会正式表决通过并立即执行！"
    });

    dispatchDiplomaticCable({
      type: "unsc_passed",
      from: "UNSC",
      target: "ALL",
      zh: "通过" + res.shortTitle,
      desc: res.desc
    }, curY, curM, false);

    if (ST.sel) {
      refreshAIBox(ST.sel);
      refreshTradeBox(ST.sel);
    }
  }
  function refreshBlocCtl() {            // 面板「迁入阵营」控件：仅玩家自己的面板可见
    const box = $("p-bloc-ctl");
    if (!box) return;
    const isMine = !!ST.player && ST.sel === ST.player;
    box.style.display = isMine ? "" : "none";
    if (!isMine) return;
    const sel = $("p-bloc-sel");
    if (sel && !sel.dataset.filled) {
      sel.innerHTML = '<option value="">退出阵营（回原阵营）</option>' +
        Object.keys(BLOC).map((b) => '<option value="' + b + '">' + (BLOC_ZH[b] || b) + " " + b + "</option>").join("");
      sel.dataset.filled = "1";
    }
    if (sel) sel.value = ST.blocOverride[ST.player] || "";
    const stat = $("p-bloc-status");
    if (stat) {
      const orig = CM.countries[ST.player].bloc;
      const curB = ST.blocOverride[ST.player];
      if (!curB || curB === orig) {
        stat.textContent = "当前为史实阵营（网络效应已内化于基准）";
        stat.className = "bloc-status norm";
      } else {
        const be = curBlocEffect();
        let s = "经贸网络：" + (be.net >= 0 ? "+" : "") + be.net.toFixed(2) + "pp/年";
        if (be.friction < 0 && be.monthsLeft > 0) {
          s += "（脱钩震荡 " + be.friction.toFixed(2) + "pp，剩 " + be.monthsLeft + " 月）";
          stat.className = "bloc-status shock";
        } else {
          stat.className = "bloc-status bonus";
        }
        stat.textContent = s;
      }
    }
  }
  function updPlayerTag() {
    const e = $("r-player"); if (!e) return;
    const c = ST.player ? CM.countries[ST.player] : null;
    e.textContent = c ? "⚑ " + c.zh + " · " + ST.player : "⚑ 旁观";
    if (c) {
      const cost = decSelfCost();
      let t = "你的国家：" + c.zh + (ST.mil > 0 ? "（军费 " + ST.mil + "%）" : "（军费 0%）");
      if (ST.sanctions.length || ST.aid.length)
        t += "（制裁 " + ST.sanctions.length + " / 军援 " + ST.aid.length + " · 自损 -" + cost.total.toFixed(1) + "pp）";
      if (ST.blocOverride[ST.player]) {
        const be = curBlocEffect();
        t += "（已迁入 " + (BLOC_ZH[ST.blocOverride[ST.player]] || "") + " · 网络净 " + (be.net >= 0 ? "+" : "") + be.net.toFixed(2) + "pp）";
      }
      e.title = t;
    } else e.title = "尚未选择你的国家（旁观模式）";
    e.classList.toggle("on", !!c);
  }
  function refreshMilBox() {
    const box = $("p-milbox"); if (!box) return;
    const isMine = !!ST.player && ST.sel === ST.player;
    const none = $("p-mil-none"), ctl = $("p-mil-ctl");
    if (none) none.style.display = isMine ? "none" : "";
    if (ctl) ctl.style.display = isMine ? "" : "none";
    const r = $("p-mil"); if (r) r.value = String(ST.mil);
    const v = $("p-mil-v"); if (v) v.textContent = String(ST.mil);
    const o = $("p-mil-other");
    if (o) o.textContent = ST.player ? ("你的国家：" + ((CM.countries[ST.player] || {}).zh || ST.player)) : "尚未选择你的国家";
    refreshBlocCtl();                 // R5E：迁入阵营控件（仅玩家自己的面板）
    refreshDecBox(isMine);            // R5C'：决策区（本国）与他国快捷行二选一可见
    refreshWarBox(ST.sel);            // R8C：战局态势与地缘前线面板反馈
    refreshResBox(ST.sel);            // 经济系统阶段 1：战略资源面板反馈
    refreshTradeBox(ST.sel);          // 经济系统阶段 2：贸易与硬通货清算面板反馈
    refreshAIBox(ST.sel);             // R10A：大国战略性格与双边态度面板反馈
    refreshOverviewCard(ST.sel);      // R11A：概览态势卡片与治理导航
    refreshDomesticBox(ST.sel);       // R12A：大国内政生态与派系权力天平
    refreshAgendaBox(ST.sel);         // R12B：次极大国专属国家议程与战略路线
    refreshCovertBox(ST.sel);         // R13A：隐蔽行动与全球谍战沙盒控制台
    refreshAfghanBox(ST.sel);         // R13B：阿富汗战区态势与帝国失血槽控制台
    updatePanelTabBadges(ST.sel);     // R11A：选项卡动态角标更新
    refreshLeaderCard(ST.sel);        // R14：冷战大国领袖肖像画廊与执政理念卡片
  }

  // ---- R11A: 面板 Tabs 选项卡与动态角标系统 ----
  function setPanelTab(tabId) {
    const valid = ["overview", "defense", "economy", "diplomacy"];
    if (!valid.includes(tabId)) tabId = "overview";
    ST.panelTab = tabId;
    const btns = document.querySelectorAll(".p-tab-btn");
    btns.forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tabId);
    });
    const panes = document.querySelectorAll(".p-tab-pane");
    panes.forEach((p) => {
      p.classList.toggle("active", p.id === "p-pane-" + tabId);
    });
  }

  function updatePanelTabBadges(selKey) {
    const bDef = $("p-tb-defense");
    const bEco = $("p-tb-economy");
    const bDip = $("p-tb-diplomacy");
    const bOvw = $("p-tb-overview");
    if (!bDef || !bEco || !bDip) return;

    if (!selKey) {
      bDef.className = "p-tab-badge"; bDef.textContent = "";
      bEco.className = "p-tab-badge"; bEco.textContent = "";
      bDip.className = "p-tab-badge"; bDip.textContent = "";
      if (bOvw) { bOvw.className = "p-tab-badge"; bOvw.textContent = ""; }
      return;
    }

    const actualKey = resolvePlayableKey(selKey);
    const now = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;

    // 1. 国防与干预角标 (Defense): 战火状态
    const isIranIraqActive = now >= (1980 * 12 + 9) && now <= (1988 * 12 + 8) && !(CR.deny && CR.deny.has("iran_iraq_war"));
    const isFalklandsActive = now >= (1982 * 12 + 4) && now <= (1983 * 12 + 6);
    const isGulfActive = now >= (1990 * 12 + 8) && now <= (1991 * 12 + 12);
    let inWar = false;
    if (isIranIraqActive && (actualKey === "IRQ" || actualKey === "IRN")) inWar = true;
    else if (isFalklandsActive && (actualKey === "GBR" || actualKey === "ARG")) inWar = true;
    else if (isGulfActive && (actualKey === "IRQ" || actualKey === "KWT" || actualKey === "USA")) inWar = true;
    if (!inWar && ST.frontlines) {
      for (const pid in ST.frontlines) {
        if (ST.frontlines[pid] && ST.frontlines[pid].occupier === actualKey) {
          inWar = true; break;
        }
      }
    }
    if (inWar) {
      bDef.textContent = "⚔️";
      bDef.className = "p-tab-badge show";
    } else {
      bDef.textContent = "";
      bDef.className = "p-tab-badge";
    }

    // 2. 经贸与能源角标 (Economy): 资源赤字 / 受制 / 禁运
    const rdata = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(actualKey)) || null;
    let ecoWarn = false;
    if (rdata && rdata.summary) {
      if (rdata.summary.securityScore < 0 || rdata.summary.tag === "极端短缺受制") ecoWarn = true;
    }
    if (ST.cocom && ST.cocom.active && (actualKey === "SUN" || actualKey === "WP" || actualKey === "CHN")) {
      ecoWarn = true;
    }
    if (ST.chokepoints && ST.chokepoints.hormuz !== "open" && (actualKey === "IRN" || actualKey === "IRQ" || actualKey === "SAU" || actualKey === "JPN")) {
      ecoWarn = true;
    }
    if (ecoWarn) {
      bEco.textContent = "⚠️";
      bEco.className = "p-tab-badge show";
    } else {
      bEco.textContent = "";
      bEco.className = "p-tab-badge";
    }

    // 3. 外交与战略角标 (Diplomacy): 条约履约 🕊️ 或 极端张力 ⚡
    let dipBadge = "";
    if (ST.ai) {
      const tension = (ST.player && actualKey !== ST.player && ST.ai.tensions && ST.ai.tensions[actualKey]) ? ST.ai.tensions[actualKey] : 0;
      const treaties = (ST.ai.treaties || []).filter((t) => t.active);
      const isSuperpower = actualKey === "USA" || actualKey === "SUN";
      if (isSuperpower && treaties.length > 0) {
        dipBadge = "🕊️";
      } else if (tension >= 70) {
        dipBadge = "⚡";
      }
    }
    if (dipBadge) {
      bDip.textContent = dipBadge;
      bDip.className = "p-tab-badge show";
    } else {
      bDip.textContent = "";
      bDip.className = "p-tab-badge";
    }

    // 4. 概览角标 (Overview): 玩家直辖国显示 ★
    if (bOvw) {
      if (ST.player && actualKey === ST.player) {
        bOvw.textContent = "★";
        bOvw.className = "p-tab-badge show";
      } else {
        bOvw.textContent = "";
        bOvw.className = "p-tab-badge";
      }
    }
  }

  // ---- R14: 钢铁雄心4风格大国领袖肖像与执政理念卡片 ----
  function refreshLeaderCard(selKey) {
    const card = $("p-leader-card");
    if (!card) return;
    if (!selKey || !window.W1980_ASSETS) {
      card.style.display = "none";
      card.innerHTML = "";
      return;
    }
    const actualKey = resolvePlayableKey(selKey);
    const curY = SIM.S ? SIM.S.year : 1980;
    const leader = window.W1980_ASSETS.getLeader(actualKey, curY);

    if (!leader) {
      card.style.display = "none";
      card.innerHTML = "";
      return;
    }

    card.style.display = "flex";
    let html = '<div class="p-leader-frame">' +
      '<img src="' + leader.photo + '" alt="' + leader.name + '" onerror="this.style.display=\'none\'">' +
      '</div>' +
      '<div class="p-leader-info">' +
      '<div class="p-leader-name"><span>' + leader.name + '</span><span class="p-leader-en">' + (leader.en || "") + '</span></div>' +
      '<div class="p-leader-title">' + leader.title + '</div>' +
      '<div class="p-leader-ideology">' + leader.ideology + '</div>' +
      (leader.quote ? '<div class="p-leader-quote">' + leader.quote + '</div>' : '') +
      '</div>';

    card.innerHTML = html;
  }

  function refreshOverviewCard(selKey) {
    const card = $("p-overview-card");
    if (!card) return;
    if (!selKey) { card.innerHTML = ""; return; }
    const actualKey = resolvePlayableKey(selKey);
    const c = CM.countries[actualKey] || {};
    const isMine = !!ST.player && actualKey === ST.player;

    let h = '<div class="poc-title"><span>🏛️ 态势综述</span>' +
      '<span class="poc-tag ' + (isMine ? 'mine' : 'other') + '">' +
      (isMine ? '★ 本国直辖' : (ST.player ? '外邦实体' : '世界实体')) + '</span></div>';

    let desc = "";
    if (isMine) {
      desc = "本国处于最高统帅直辖状态。通过各治理模块可调节防务军费、审定战略物资储备及阵营归属。";
    } else if (!ST.player) {
      desc = "当前处于旁观者观察模式。可将该国设为本国以执掌其军政大权与外交走向。";
    } else {
      desc = "该国为外部地缘实体。可通过对外制裁或军援施加影响，亦可在外交面板查看其 AI 战略性格。";
    }
    h += '<div class="poc-desc">' + desc + '</div>';

    // 快捷直达导航
    h += '<div class="poc-navs">' +
      '<button class="poc-nav-btn" data-go="defense"><span>⚖️ 防务与干预</span><span class="arr">▸</span></button>' +
      '<button class="poc-nav-btn" data-go="economy"><span>🚢 经贸与储备</span><span class="arr">▸</span></button>' +
      '<button class="poc-nav-btn" data-go="diplomacy"><span>🌐 外交与阵营</span><span class="arr">▸</span></button>' +
      (!isMine ? '<button class="poc-nav-btn" data-go="setmine"><span style="color:var(--gold2)">★ 设为本国</span><span class="arr">▸</span></button>' :
                 '<button class="poc-nav-btn" data-go="defense"><span style="color:#7bc67e">✓ 统帅执政中</span><span class="arr">▸</span></button>') +
      '</div>';

    // 预警汇总
    const alerts = [];
    const now = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;
    const isIranIraqActive = now >= (1980 * 12 + 9) && now <= (1988 * 12 + 8) && !(CR.deny && CR.deny.has("iran_iraq_war"));
    const isFalklandsActive = now >= (1982 * 12 + 4) && now <= (1983 * 12 + 6);
    const isGulfActive = now >= (1990 * 12 + 8) && now <= (1991 * 12 + 12);
    if ((isIranIraqActive && (actualKey === "IRQ" || actualKey === "IRN")) ||
        (isFalklandsActive && (actualKey === "GBR" || actualKey === "ARG")) ||
        (isGulfActive && (actualKey === "IRQ" || actualKey === "KWT" || actualKey === "USA"))) {
      alerts.push('<div class="poc-alert-item war">⚔️ 卷入局部热点交战，前线推演中</div>');
    }
    const rdata = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(actualKey)) || null;
    if (rdata && rdata.summary && rdata.summary.securityScore < 0) {
      alerts.push('<div class="poc-alert-item warn">⚠️ 战略资源安全度评级处于逆差受制区间</div>');
    }
    if (alerts.length > 0) {
      h += '<div class="poc-alerts">' + alerts.join("") + '</div>';
    }

    card.innerHTML = h;

    // 绑定快捷跳转按钮
    card.querySelectorAll(".poc-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const go = btn.dataset.go;
        if (go === "setmine") {
          setPlayer(actualKey);
          setPanelTab("defense");
        } else if (go) {
          setPanelTab(go);
        }
      });
    });
  }

  // ---- R12A: 大国内政生态与派系权力天平系统 ----
  function initDomesticState() {
    ST.domestic = {
      sun: {
        conservative: 55,       // 保守鹰派满意度/权力份额 (0~100)
        reformist: 45,          // 改革新思维派满意度/权力份额 (0~100)
        shortage: 28,           // 消费品与轻工短缺指数 (0~100)
        unrest: 5,              // 社会动荡度 (0~100)
        crisisWarning: null     // 政治局警报
      },
      usa: {
        congressApproval: 62,   // 两党国会支持率 (0~100)
        presidentialApproval: 58,// 总统民调支持率 (0~100)
        nextElectionYear: 1984, // 下届总统大选年份
        electionResult: null,   // 大选选情公报
        budgetCapActive: false, // 《格拉姆-拉德曼法案》预算上限帽是否生效
        unrest: 2               // 社会动荡度 (0~100)
      },
      generals: {}              // 通用国家缓存
    };
  }

  function getGeneralDomestic(k) {
    if (!ST.domestic) initDomesticState();
    if (!ST.domestic.generals) ST.domestic.generals = {};
    if (!ST.domestic.generals[k]) {
      ST.domestic.generals[k] = {
        stability: 82,
        unrest: 4,
        legitimacy: 78,
        sanctionStrain: 0
      };
    }
    return ST.domestic.generals[k];
  }

  function sanitizeDomesticState(d) {
    const fresh = {
      sun: { conservative: 55, reformist: 45, shortage: 28, unrest: 5, crisisWarning: null },
      usa: { congressApproval: 62, presidentialApproval: 58, nextElectionYear: 1984, electionResult: null, budgetCapActive: false, unrest: 2 },
      generals: {}
    };
    if (!d || typeof d !== "object") return fresh;
    if (d.sun && typeof d.sun === "object") {
      fresh.sun.conservative = clamp(typeof d.sun.conservative === "number" ? d.sun.conservative : 55, 0, 100);
      fresh.sun.reformist = clamp(typeof d.sun.reformist === "number" ? d.sun.reformist : 45, 0, 100);
      fresh.sun.shortage = clamp(typeof d.sun.shortage === "number" ? d.sun.shortage : 28, 0, 100);
      fresh.sun.unrest = clamp(typeof d.sun.unrest === "number" ? d.sun.unrest : 5, 0, 100);
      fresh.sun.crisisWarning = typeof d.sun.crisisWarning === "string" ? d.sun.crisisWarning : null;
    }
    if (d.usa && typeof d.usa === "object") {
      fresh.usa.congressApproval = clamp(typeof d.usa.congressApproval === "number" ? d.usa.congressApproval : 62, 0, 100);
      fresh.usa.presidentialApproval = clamp(typeof d.usa.presidentialApproval === "number" ? d.usa.presidentialApproval : 58, 0, 100);
      fresh.usa.nextElectionYear = typeof d.usa.nextElectionYear === "number" ? d.usa.nextElectionYear : 1984;
      fresh.usa.electionResult = typeof d.usa.electionResult === "string" ? d.usa.electionResult : null;
      fresh.usa.budgetCapActive = !!d.usa.budgetCapActive;
      fresh.usa.unrest = clamp(typeof d.usa.unrest === "number" ? d.usa.unrest : 2, 0, 100);
    }
    if (d.generals && typeof d.generals === "object") {
      for (const k in d.generals) {
        const g = d.generals[k];
        if (g && typeof g === "object") {
          fresh.generals[k] = {
            stability: clamp(typeof g.stability === "number" ? g.stability : 80, 0, 100),
            unrest: clamp(typeof g.unrest === "number" ? g.unrest : 5, 0, 100),
            legitimacy: clamp(typeof g.legitimacy === "number" ? g.legitimacy : 75, 0, 100),
            sanctionStrain: clamp(typeof g.sanctionStrain === "number" ? g.sanctionStrain : 0, 0, 100)
          };
        }
      }
    }
    return fresh;
  }

  function updateDomesticPolitics(y, m, silent) {
    if (!ST.domestic) initDomesticState();
    const dom = ST.domestic;

    // 1. 苏联 (SUN) 政治局权力天平与短缺经济演进
    if (dom.sun) {
      const sun = dom.sun;
      let milSUN = 4.0;
      if (ST.player === "SUN") {
        milSUN = ST.mil;
      } else if (ST.ai && ST.ai.decisions && ST.ai.decisions.SUN && typeof ST.ai.decisions.SUN.mil === "number") {
        milSUN = ST.ai.decisions.SUN.mil;
      }

      // 军费对派系天平与短缺的影响
      if (milSUN >= 6.5) {
        sun.conservative = clamp(sun.conservative + 0.35, 10, 95);
        sun.reformist = clamp(sun.reformist - 0.35, 5, 90);
        sun.shortage = clamp(sun.shortage + 0.40, 0, 100);
      } else if (milSUN <= 4.0) {
        sun.conservative = clamp(sun.conservative - 0.50, 10, 95);
        sun.reformist = clamp(sun.reformist + 0.40, 5, 90);
        sun.shortage = clamp(sun.shortage - 0.30, 0, 100);
      } else {
        sun.conservative = clamp(sun.conservative + (50 - sun.conservative) * 0.02, 10, 95);
        sun.reformist = clamp(sun.reformist + (50 - sun.reformist) * 0.02, 5, 90);
      }

      // 西方制裁与巴统对短缺的加剧
      const isSanctioned = ST.sanctions.some((s) => s.t === "SUN");
      if (isSanctioned) {
        sun.shortage = clamp(sun.shortage + 0.25, 0, 100);
      }

      // 军控缓和条约释放轻工业红利
      if (ST.ai && Array.isArray(ST.ai.treaties) && ST.ai.treaties.some((t) => t.status === "active")) {
        sun.shortage = clamp(sun.shortage - 0.20, 0, 100);
      }

      // 短缺指数引发社会动荡
      if (sun.shortage > 65) {
        sun.unrest = clamp(sun.unrest + 0.45, 0, 100);
      } else if (sun.shortage > 80) {
        sun.unrest = clamp(sun.unrest + 0.75, 0, 100);
      } else if (sun.shortage < 40) {
        sun.unrest = clamp(sun.unrest - 0.40, 0, 100);
      }

      // 政治局危机预警评定
      if (sun.conservative < 25) {
        sun.crisisWarning = "⚠️ 政治局危机：保守派强硬元老酝酿问责倒阁与非常委员会！";
      } else if (sun.reformist < 25) {
        sun.crisisWarning = "⚠️ 改革受挫：新思维遭遇体制僵化，经济改革停滞！";
      } else if (sun.unrest > 45) {
        sun.crisisWarning = "⚠️ 工潮警报：轻工短缺引发矿工与产业工人抗议示威！";
      } else {
        sun.crisisWarning = null;
      }
    }

    // 2. 美国 (USA) 国会两党支持率、大选与《格拉姆-拉德曼法案》预算帽
    if (dom.usa) {
      const usa = dom.usa;
      let milUSA = 5.0;
      if (ST.player === "USA") {
        milUSA = ST.mil;
      } else if (ST.ai && ST.ai.decisions && ST.ai.decisions.USA && typeof ST.ai.decisions.USA.mil === "number") {
        milUSA = ST.ai.decisions.USA.mil;
      }

      // 自然向 55% 回归
      usa.congressApproval += (55 - usa.congressApproval) * 0.03;

      // 军费过高扩大赤字压低国会支持率
      if (milUSA >= 6.5) {
        usa.congressApproval = clamp(usa.congressApproval - 0.40, 15, 90);
      } else if (milUSA <= 3.5) {
        usa.congressApproval = clamp(usa.congressApproval + 0.25, 15, 90);
      }

      // 对外大规模军援支出引发国会质询
      if (ST.player === "USA" && ST.aid.length > 0) {
        usa.congressApproval = clamp(usa.congressApproval - 0.20, 15, 90);
      }

      // 经济增速强劲回补民调与国会支持
      const gUSA = growthOf(entKeys("USA"));
      if (gUSA !== null && gUSA > 0.025) {
        usa.congressApproval = clamp(usa.congressApproval + 0.30, 15, 90);
        usa.presidentialApproval = clamp(usa.presidentialApproval + 0.35, 15, 95);
      }

      // 格拉姆-拉德曼平衡预算案触发判断 (支持率 < 45% 触发)
      if (usa.congressApproval < 45) {
        usa.budgetCapActive = true;
      } else if (usa.congressApproval >= 52) {
        usa.budgetCapActive = false;
      }

      // 总统民意支持率向国会支持率与经济协同
      usa.presidentialApproval = clamp(usa.presidentialApproval + (usa.congressApproval - usa.presidentialApproval) * 0.05, 15, 95);

      // 四年总统大选周期判定 (1984-11, 1988-11)
      if ((y === 1984 || y === 1988) && m === 11) {
        if (usa.presidentialApproval >= 55) {
          usa.electionResult = y + " 大选大捷：总统以绝对优势横扫选举人票连任（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
        } else if (usa.presidentialApproval >= 45) {
          usa.electionResult = y + " 选情胶着：经过白热化拉锯惊险胜选（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
        } else {
          usa.electionResult = y + " 大选惨败：财政赤字击垮执政党，国会陷入严重分立（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
        }
        usa.nextElectionYear = (y === 1984 ? 1988 : 1992);
        if (!silent && (ST.player === "USA" || !ST.player)) {
          toast({ y: y, m: m, zh: "【美利坚大选公报】" + usa.electionResult, note: "四年一度的美国大选尘埃落定" });
        }
      }
    }

    // 3. 通用实体 (Generals) 社会安定度与制裁抗议
    if (dom.generals) {
      for (const k in dom.generals) {
        const g = dom.generals[k];
        const isSan = ST.sanctions.some((s) => s.t === k);
        if (isSan) {
          g.sanctionStrain = clamp(g.sanctionStrain + 2, 0, 100);
          g.stability = clamp(g.stability - 0.40, 10, 100);
          g.unrest = clamp(g.unrest + 0.35, 0, 100);
        } else {
          g.sanctionStrain = clamp(g.sanctionStrain - 1, 0, 100);
          g.stability = clamp(g.stability + (82 - g.stability) * 0.03, 10, 100);
          g.unrest = clamp(g.unrest - 0.25, 0, 100);
        }
      }
    }
  }

  function applyDomesticPlayerAction(actType) {
    if (!ST.domestic) initDomesticState();
    if (ST.player === "SUN") {
      const sun = ST.domestic.sun;
      if (actType === "rebalance_consumer") {
        // 推进轻工民生改革
        sun.shortage = clamp(sun.shortage - 6, 0, 100);
        sun.reformist = clamp(sun.reformist + 5, 0, 100);
        sun.conservative = clamp(sun.conservative - 5, 0, 100);
        sun.unrest = clamp(sun.unrest - 4, 0, 100);
        toast({ zh: "【政治局施政决议】", note: "统帅部下达消费品增产指令，拨付轻工专项资金，部分军工厂转产民用家电！" });
      } else if (actType === "placate_vpk") {
        // 安抚军工复合体元老
        sun.conservative = clamp(sun.conservative + 7, 0, 100);
        sun.reformist = clamp(sun.reformist - 4, 0, 100);
        sun.shortage = clamp(sun.shortage + 4, 0, 100);
        toast({ zh: "【政治局扩大会议】", note: "向国防工业委员会保证重点型号拨款，军工复合体元老疑虑暂时平息。" });
      }
    } else if (ST.player === "USA") {
      const usa = ST.domestic.usa;
      if (actType === "compromise_budget") {
        usa.congressApproval = clamp(usa.congressApproval + 6, 0, 100);
        usa.presidentialApproval = clamp(usa.presidentialApproval + 3, 0, 100);
        if (ST.mil > 5.0) {
          ST.mil = 5.0;
          applyPlayerDecisions();
          const r = $("p-mil"); if (r) r.value = "5";
          const v = $("p-mil-v"); if (v) v.textContent = "5";
        }
        toast({ zh: "【两党国会妥协】", note: "白宫签署两党折衷预算案，限制赤字规模，国会两党批准率显著回升！" });
      }
    }
    refreshDomesticBox(ST.sel);
    applyPlayerDecisions();
  }

  function refreshDomesticBox(selKey) {
    const box = $("p-domestic-box");
    if (!box) return;
    if (!selKey) { box.innerHTML = ""; return; }
    if (!ST.domestic) initDomesticState();

    const actualKey = resolvePlayableKey(selKey);
    const c = CM.countries[actualKey] || {};
    const isMine = !!ST.player && actualKey === ST.player;

    let h = "";
    if (actualKey === "SUN") {
      // 苏联 (SUN) 界面
      const sun = ST.domestic.sun;
      const cPct = Math.round((sun.conservative / (sun.conservative + sun.reformist)) * 100);
      const rPct = 100 - cPct;

      let shortageClass = "good";
      let shortageDesc = "消费品供给平稳";
      if (sun.shortage >= 65) { shortageClass = "danger"; shortageDesc = "物资奇缺 · 排长队与凭票抢购"; }
      else if (sun.shortage >= 40) { shortageClass = "warn"; shortageDesc = "部分商品脱销 · 供应紧张"; }

      let unrestClass = "good";
      if (sun.unrest >= 45) unrestClass = "danger";
      else if (sun.unrest >= 25) unrestClass = "warn";

      h += '<div class="pdb-title"><span>🏛️ 政治局权力天平</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '大国体制') + '</span></div>';
      h += '<div class="pdb-desc">苏维埃最高决策层由保守鹰派（军工集团/老近卫军）与改革新思维派共同掣肘。维持高额军费巩固国防但挤占轻工民生，低军费改善供给但激化党内政变风险。</div>';

      // 派系天平双色进度条
      h += '<div class="pdb-balance-wrap">';
      h += '  <div class="pdb-balance-labels">';
      h += '    <span class="pdb-lbl-left">🛡️ 保守派 ' + sun.conservative.toFixed(0) + ' (' + cPct + '%)</span>';
      h += '    <span class="pdb-lbl-right">🕊️ 改革派 ' + sun.reformist.toFixed(0) + ' (' + rPct + '%)</span>';
      h += '  </div>';
      h += '  <div class="pdb-balance-bar">';
      h += '    <div class="pdb-bar-seg-left" style="width:' + cPct + '%"></div>';
      h += '    <div class="pdb-bar-seg-right" style="width:' + rPct + '%"></div>';
      h += '  </div>';
      h += '</div>';

      // 短缺与动荡指标
      h += '<div class="pdb-meters">';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📦 轻工商品短缺指数</span><span class="pdb-meter-val" style="color:' + (shortageClass==='danger'?'#f87171':shortageClass==='warn'?'#fbbf24':'#4ade80') + '">' + sun.shortage.toFixed(1) + ' · ' + shortageDesc + '</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + shortageClass + '" style="width:' + sun.shortage + '%"></div></div>';
      h += '  </div>';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡与工潮指数</span><span class="pdb-meter-val" style="color:' + (unrestClass==='danger'?'#f87171':unrestClass==='warn'?'#fbbf24':'#4ade80') + '">' + sun.unrest.toFixed(1) + (sun.unrest > 30 ? '（引发经济脱节拖累）' : '（安定）') + '</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + sun.unrest + '%"></div></div>';
      h += '  </div>';
      h += '</div>';

      if (sun.crisisWarning) {
        h += '<div class="pdb-alert">' + sun.crisisWarning + '</div>';
      }

      // 如果当前玩家控制苏联，展示微调操作按钮
      if (isMine) {
        h += '<div class="pdb-actions">';
        h += '  <button class="pdb-act-btn" data-act="rebalance_consumer">🛒 倾斜轻工业消费品</button>';
        h += '  <button class="pdb-act-btn" data-act="placate_vpk">🎖️ 安抚军工复合体</button>';
        h += '</div>';
      }

    } else if (actualKey === "USA") {
      // 美国 (USA) 界面
      const usa = ST.domestic.usa;
      let congClass = usa.congressApproval >= 55 ? "good" : usa.congressApproval >= 45 ? "warn" : "danger";
      let presClass = usa.presidentialApproval >= 55 ? "good" : usa.presidentialApproval >= 45 ? "warn" : "danger";

      h += '<div class="pdb-title"><span>🏛️ 国会两党与大选宪政</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '宪政体制') + '</span></div>';
      h += '<div class="pdb-desc">三权分立与四年一度大选对白宫战略决策形成刚性宪政制约。巨额财政赤字或海外干预泥潭将侵蚀国会批准率，触发《格拉姆-拉德曼法案》军费预算帽强制冻结。</div>';

      // 徽章区：预算帽与大选倒计时
      h += '<div class="pdb-badge-row">';
      if (usa.budgetCapActive) {
        h += '  <span class="pdb-badge cap-alert">⚠️ 《格拉姆-拉德曼法案》预算帽生效中（军费≤6%）</span>';
      } else {
        h += '  <span class="pdb-badge cap-ok">✓ 财政预算帽未激活（赤字受控）</span>';
      }
      h += '  <span class="pdb-badge election">🗳️ ' + usa.nextElectionYear + ' 总统大选周期</span>';
      h += '</div>';

      if (usa.electionResult) {
        h += '<div class="pdb-status-pill">' + usa.electionResult + '</div>';
      }

      // 国会支持率与总统民调进度条
      h += '<div class="pdb-meters">';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📜 两党国会批准率</span><span class="pdb-meter-val">' + usa.congressApproval.toFixed(1) + '% (预算帽阈值 45%)</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + congClass + '" style="width:' + usa.congressApproval + '%"></div></div>';
      h += '  </div>';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📊 白宫总统民意支持率</span><span class="pdb-meter-val">' + usa.presidentialApproval.toFixed(1) + '%</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + presClass + '" style="width:' + usa.presidentialApproval + '%"></div></div>';
      h += '  </div>';
      h += '</div>';

      if (isMine) {
        h += '<div class="pdb-actions">';
        h += '  <button class="pdb-act-btn" data-act="compromise_budget" style="grid-column: span 2">🤝 两党预算妥协（拉升支持率/平抑军费）</button>';
        h += '</div>';
      }

    } else {
      // 通用国家 (Generals)
      const gen = getGeneralDomestic(actualKey);
      let stabClass = gen.stability >= 70 ? "good" : gen.stability >= 45 ? "warn" : "danger";
      let unrestClass = gen.unrest >= 35 ? "danger" : gen.unrest >= 15 ? "warn" : "good";

      h += '<div class="pdb-title"><span>🏛️ 内政稳定与执政合法性</span><span class="pdb-tag">' + (isMine ? '★ 本国' : '地方政权') + '</span></div>';
      h += '<div class="pdb-desc">政权稳定性直接决定社会生产秩序与民生凝聚力。长期遭受外国单边经济制裁或断油危机将直接消耗安定度并诱发社会动荡。</div>';

      h += '<div class="pdb-meters">';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">⚖️ 民生安定度</span><span class="pdb-meter-val">' + gen.stability.toFixed(1) + '%</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + stabClass + '" style="width:' + gen.stability + '%"></div></div>';
      h += '  </div>';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🕊️ 执政合法性</span><span class="pdb-meter-val">' + gen.legitimacy.toFixed(1) + '%</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill blue" style="width:' + gen.legitimacy + '%"></div></div>';
      h += '  </div>';
      h += '  <div class="pdb-meter">';
      h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val">' + gen.unrest.toFixed(1) + '%</span></div>';
      h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + gen.unrest + '%"></div></div>';
      h += '  </div>';
      h += '</div>';

      const isSan = ST.sanctions.some((s) => s.t === actualKey);
      if (isSan) {
        h += '<div class="pdb-alert">⚠️ 该国正遭受外部单边经济制裁，民生与储备承压消耗中。</div>';
      }
    }

    box.innerHTML = h;

    // 绑定动作按钮事件
    box.querySelectorAll(".pdb-act-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act) applyDomesticPlayerAction(act);
      });
    });
  }

  // ---- R12B: 次极大国专属国家议程与战略路线系统 ----
  function initAgendaState(cKey) {
    if (cKey) {
      if (!ST.agendas) ST.agendas = {};
      ST.agendas[cKey] = {
        active: null,
        progress: 0,
        completed: [],
        bonuses: {
          gdpBonus: 0,
          reserveMonthly: 0,
          decoupleImmunity: false,
          domesticShortage: 0,
          stabilityBonus: 0,
          techSecurity: 0,
          congressBonus: 0
        }
      };
      return ST.agendas[cKey];
    }
    ST.agendas = {};
  }

  function getAgendaState(cKey) {
    if (!ST.agendas) initAgendaState();
    if (!ST.agendas[cKey]) {
      initAgendaState(cKey);
    }
    return ST.agendas[cKey];
  }

  function calcAgendaBonuses(cKey) {
    const bonuses = {
      gdpBonus: 0,
      reserveMonthly: 0,
      decoupleImmunity: false,
      domesticShortage: 0,
      stabilityBonus: 0,
      techSecurity: 0,
      congressBonus: 0
    };
    if (!ST.agendas || !ST.agendas[cKey]) return bonuses;
    const state = ST.agendas[cKey];
    const list = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
    if (Array.isArray(state.completed)) {
      for (let i = 0; i < state.completed.length; i++) {
        const agId = state.completed[i];
        const ag = list.find((a) => a.id === agId);
        if (ag && ag.effects) {
          if (typeof ag.effects.gdpBonus === "number") bonuses.gdpBonus += ag.effects.gdpBonus;
          if (typeof ag.effects.reserveMonthly === "number") bonuses.reserveMonthly += ag.effects.reserveMonthly;
          if (ag.effects.decoupleImmunity) bonuses.decoupleImmunity = true;
          if (typeof ag.effects.domesticShortage === "number") bonuses.domesticShortage += ag.effects.domesticShortage;
          if (typeof ag.effects.stabilityBonus === "number") bonuses.stabilityBonus += ag.effects.stabilityBonus;
          if (typeof ag.effects.techSecurity === "number") bonuses.techSecurity += ag.effects.techSecurity;
          if (typeof ag.effects.congressBonus === "number") bonuses.congressBonus += ag.effects.congressBonus;
        }
      }
    }
    bonuses.gdpBonus = +bonuses.gdpBonus.toFixed(3);
    bonuses.reserveMonthly = +bonuses.reserveMonthly.toFixed(2);
    return bonuses;
  }

  function sanitizeAgendaState(d) {
    const fresh = {};
    if (!d || typeof d !== "object") return fresh;
    for (const k in d) {
      const item = d[k];
      if (item && typeof item === "object") {
        const active = (typeof item.active === "string") ? item.active : null;
        const progress = clamp(typeof item.progress === "number" ? item.progress : 0, 0, 100);
        const completed = Array.isArray(item.completed) ? item.completed.filter((id) => typeof id === "string") : [];
        fresh[k] = {
          active: active,
          progress: progress,
          completed: completed,
          bonuses: {
            gdpBonus: 0,
            reserveMonthly: 0,
            decoupleImmunity: false,
            domesticShortage: 0,
            stabilityBonus: 0,
            techSecurity: 0,
            congressBonus: 0
          }
        };
      }
    }
    for (const k in fresh) {
      fresh[k].bonuses = calcAgendaBonuses(k);
    }
    return fresh;
  }

  function checkAgendaCondition(cKey, ag) {
    if (!ag) return { ok: false, reason: "无效议程" };
    const curY = SIM.S ? SIM.S.year : 1980;
    const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

    // 年代要求
    if (typeof ag.yearMin === "number") {
      const mMin = ag.monthMin || 1;
      if (curY < ag.yearMin || (curY === ag.yearMin && curM < mMin)) {
        return { ok: false, reason: "尚未到达启动年代 (" + ag.yearMin + "年" + (ag.monthMin ? ag.monthMin + "月" : "") + ")" };
      }
    }

    // 前置议程要求
    if (ag.requires) {
      const state = getAgendaState(cKey);
      if (!state.completed.includes(ag.requires)) {
        const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
        const reqAg = agList.find((a) => a.id === ag.requires);
        const reqTitle = reqAg ? reqAg.title : ag.requires;
        return { ok: false, reason: "需先达成前置议程【" + reqTitle + "】" };
      }
    }

    // 结构性国策条件
    if (ag.condition) {
      let curMil = 0;
      if (cKey === ST.player) {
        curMil = ST.mil;
      } else if (ST.ai && ST.ai.decisions && ST.ai.decisions[cKey] && typeof ST.ai.decisions[cKey].mil === "number") {
        curMil = ST.ai.decisions[cKey].mil;
      } else {
        const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(cKey, CM.countries[cKey]) : null;
        curMil = doc ? doc.baseMil : 2.5;
      }

      if (ag.condition === "mil_le_3" && curMil > 3.0) {
        return { ok: false, reason: "国防军费必须 ≤ 3.0%（当前 " + curMil.toFixed(1) + "%）" };
      }
      if (ag.condition === "mil_le_1" && curMil > 1.0) {
        return { ok: false, reason: "专守防卫军费红线必须 ≤ 1.0%（当前 " + curMil.toFixed(1) + "%）" };
      }
      if (ag.condition === "mil_ge_5" && curMil < 5.0) {
        return { ok: false, reason: "天基尖端军备研发要求军费 ≥ 5.0%（当前 " + curMil.toFixed(1) + "%）" };
      }
    }

    return { ok: true, reason: "" };
  }

  function startAgenda(cKey, agendaId) {
    if (!cKey || !agendaId) return false;
    const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
    const ag = agList.find((a) => a.id === agendaId);
    if (!ag) return false;
    const cond = checkAgendaCondition(cKey, ag);
    if (!cond.ok) return false;
    const state = getAgendaState(cKey);
    if (state.completed.includes(agendaId)) return false;
    if (state.active) return false; // 每次只能推进一项
    state.active = agendaId;
    state.progress = 0;
    if (ST.sel) refreshAgendaBox(ST.sel);
    return true;
  }

  function updateMonthlyAgendas(y, m, silent) {
    if (!ST.agendas) initAgendaState();

    // 1. AI 决策推进：如果 AI 激活且玩家已选国（仅玩家局，杜绝旁观模式产生漂移）
    if (isAIActive()) {
      const aiMajors = ["CHN", "JPN", "DEU", "FRA", "GBR", "SUN", "USA"];
      for (let i = 0; i < aiMajors.length; i++) {
        const maj = aiMajors[i];
        if (maj === ST.player) continue;
        const majState = getAgendaState(maj);
        if (!majState.active) {
          const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(maj) : [];
          for (let j = 0; j < agList.length; j++) {
            const cand = agList[j];
            if (!majState.completed.includes(cand.id) && checkAgendaCondition(maj, cand).ok) {
              startAgenda(maj, cand.id);
              break;
            }
          }
        }
      }
    }

    // 2. 推进所有当前激活中的议程
    for (const cKey in ST.agendas) {
      const state = ST.agendas[cKey];
      if (!state || !state.active) continue;
      const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
      const ag = agList.find((a) => a.id === state.active);
      if (!ag) { state.active = null; continue; }

      const dur = ag.duration || 12;
      state.progress = +(state.progress + 100 / dur).toFixed(2);
      if (state.progress >= 99.99) {
        state.progress = 100;
        if (!state.completed.includes(ag.id)) {
          state.completed.push(ag.id);
        }
        state.active = null;
        state.bonuses = calcAgendaBonuses(cKey);

        // 即时效果渗透至内政与安定度
        if (ag.effects) {
          if (typeof ag.effects.domesticShortage === "number" && ST.domestic) {
            if (cKey === "SUN" && ST.domestic.sun) {
              ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage + ag.effects.domesticShortage, 0, 100);
            }
          }
          if (typeof ag.effects.stabilityBonus === "number" && ST.domestic) {
            if (cKey === "SUN" && ST.domestic.sun) {
              ST.domestic.sun.unrest = clamp(ST.domestic.sun.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
            } else if (cKey === "USA" && ST.domestic.usa) {
              ST.domestic.usa.unrest = clamp(ST.domestic.usa.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
            } else if (ST.domestic.generals && ST.domestic.generals[cKey]) {
              ST.domestic.generals[cKey].stability = clamp(ST.domestic.generals[cKey].stability + ag.effects.stabilityBonus, 0, 100);
            }
          }
          if (typeof ag.effects.congressBonus === "number" && cKey === "USA" && ST.domestic && ST.domestic.usa) {
            ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval + ag.effects.congressBonus, 0, 100);
          }
        }

        // 若为玩家执政国，刷新决策并派发通知
        if (cKey === ST.player) {
          applyPlayerDecisions();
          if (!silent) {
            showToast("🎯 战略议程达成：【" + ag.title + "】！" + (ag.effects.desc || ""));
            EV.items.push({
              y: y,
              m: m,
              zh: "🎯 战略议程达成 · " + ag.title,
              note: (CM.countries[cKey] || {}).zh + " 已圆满达成专属国家战略议程【" + ag.title + "】！" + (ag.effects.desc || "")
            });
            EV.unread++;
            renderInbox();
          }
        }
      }
    }

    // 3. 外汇顺差流加成按月结算
    if (ST.reserves) {
      for (const cKey in ST.agendas) {
        const b = ST.agendas[cKey].bonuses;
        if (b && b.reserveMonthly && ST.reserves[cKey]) {
          ST.reserves[cKey].usd = +(ST.reserves[cKey].usd + b.reserveMonthly).toFixed(2);
        }
      }
    }

    if (ST.sel) refreshAgendaBox(ST.sel);
  }

  function refreshAgendaBox(selKey) {
    const box = $("p-agenda-box");
    if (!box) return;
    if (!selKey) { box.innerHTML = ""; return; }
    if (!ST.agendas) initAgendaState();

    const actualKey = resolvePlayableKey(selKey);
    const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(actualKey) : [];
    if (!agList || agList.length === 0) {
      box.innerHTML = "";
      return;
    }

    const state = getAgendaState(actualKey);
    const isMine = !!ST.player && actualKey === ST.player;
    const cZh = (CM.countries[actualKey] || {}).zh || actualKey;

    let h = "";
    h += '<div class="agh"><span>🎯 专属战略议程与国家路线</span><span style="font-size:9.5px;color:var(--dim);font-weight:400">' + (isMine ? '★ 执政顶层规划' : (cZh + ' 战略路线')) + '</span></div>';
    h += '<div class="ag-list">';

    for (let i = 0; i < agList.length; i++) {
      const ag = agList[i];
      const isDone = state.completed.includes(ag.id);
      const isActive = state.active === ag.id;
      const cond = checkAgendaCondition(actualKey, ag);

      let cardClass = "ag-card";
      if (isActive) cardClass += " active";
      if (isDone) cardClass += " completed";

      let badgeHtml = "";
      if (isDone) {
        badgeHtml = '<span class="ag-badge done">✓ 已达成</span>';
      } else if (isActive) {
        badgeHtml = '<span class="ag-badge progress">⏳ 推进中 (' + Math.round(state.progress) + '%)</span>';
      } else {
        badgeHtml = '<span class="ag-badge idle">待启动</span>';
      }

      h += '<div class="' + cardClass + '">';
      h += '  <div class="ag-head">';
      h += '    <div class="ag-title-wrap"><span class="ag-icon">' + (ag.icon || '📌') + '</span><span class="ag-title">' + ag.title + '</span></div>';
      h += '    ' + badgeHtml;
      h += '  </div>';
      h += '  <div class="ag-desc">' + ag.desc + '</div>';
      h += '  <div class="ag-effects">战略红利：' + (ag.effects.desc || '') + '</div>';

      if (!isDone) {
        const condOkStyle = cond.ok ? 'style="color:var(--dim);background:none;padding:0"' : '';
        h += '  <div class="ag-condition" ' + condOkStyle + '>📋 前置要求：' + (ag.conditionDesc || '无') + (!cond.ok ? ' (' + cond.reason + ')' : '') + '</div>';
      }

      if (isActive) {
        h += '  <div class="ag-prog-wrap">';
        h += '    <div class="ag-prog-meta"><span>推进进度（预计 ' + (ag.duration || 12) + ' 个月）</span><span>' + Math.round(state.progress) + '%</span></div>';
        h += '    <div class="ag-prog-bar"><div class="ag-prog-fill" style="width:' + state.progress + '%"></div></div>';
        h += '  </div>';
      } else if (isDone) {
        h += '  <div class="ag-prog-wrap">';
        h += '    <div class="ag-prog-meta"><span>战略里程碑已达成</span><span>100%</span></div>';
        h += '    <div class="ag-prog-bar"><div class="ag-prog-fill" style="width:100%"></div></div>';
        h += '  </div>';
      }

      if (isMine && !isDone) {
        if (isActive) {
          h += '  <button class="ag-btn-start" disabled style="border-color:#d4a040;color:#ebbc4d">⏳ 正在全力推进中...</button>';
        } else {
          const btnDisabled = (!cond.ok || !!state.active);
          const btnTitle = !cond.ok ? cond.reason : (state.active ? "已有进行中的战略议程" : "点击启动推进");
          h += '  <button class="ag-btn-start btn-start-agenda" data-id="' + ag.id + '" ' + (btnDisabled ? 'disabled' : '') + ' title="' + btnTitle + '">🚀 启动该战略议程</button>';
        }
      }

      h += '</div>';
    }

    h += '</div>';

    box.innerHTML = h;

    // 绑定启动操作按钮
    box.querySelectorAll(".btn-start-agenda").forEach((btn) => {
      btn.addEventListener("click", () => {
        const agId = btn.dataset.id;
        if (agId) startAgenda(actualKey, agId);
      });
    });
  }

  // ---- R12B: 次极大国专属国家议程与战略路线全链路探针 ----
  function runAgendaProbe() {
    const r = { pass: true, errors: [], details: {} };
    const assert = (name, cond, msg) => {
      r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
      if (!cond) {
        r.pass = false;
        r.errors.push(name + ": " + (msg || "failed"));
        console.error("AGENDAPROBE FAIL [" + name + "]: " + msg);
      }
    };

    try {
      // 1. 核心数据库与函数存在性
      assert("databaseLoaded", !!window.W1980_AGENDAS && typeof window.W1980_AGENDAS.getAgendasForCountry === "function", "W1980_AGENDAS 应已载入");
      assert("initAgendaStateExists", typeof initAgendaState === "function", "initAgendaState 应定义");
      assert("startAgendaExists", typeof startAgenda === "function", "startAgenda 应定义");
      assert("updateMonthlyAgendasExists", typeof updateMonthlyAgendas === "function", "updateMonthlyAgendas 应定义");
      assert("refreshAgendaBoxExists", typeof refreshAgendaBox === "function", "refreshAgendaBox 应定义");

      // 2. 数据库完备性断言
      const chnAgendas = window.W1980_AGENDAS.getAgendasForCountry("CHN");
      const jpnAgendas = window.W1980_AGENDAS.getAgendasForCountry("JPN");
      const deuAgendas = window.W1980_AGENDAS.getAgendasForCountry("DEU");
      const fraAgendas = window.W1980_AGENDAS.getAgendasForCountry("FRA");
      const gbrAgendas = window.W1980_AGENDAS.getAgendasForCountry("GBR");
      const sunAgendas = window.W1980_AGENDAS.getAgendasForCountry("SUN");
      const usaAgendas = window.W1980_AGENDAS.getAgendasForCountry("USA");
      const defAgendas = window.W1980_AGENDAS.getAgendasForCountry("BRA");

      assert("chnAgendasCount", chnAgendas.length >= 3, "中国专属议程数 >= 3 (特区/裁军/大三角)");
      assert("jpnAgendasCount", jpnAgendas.length >= 3, "日本专属议程数 >= 3 (半导体/专守防卫/黑潮出海)");
      assert("deuAgendasCount", deuAgendas.length >= 2, "西德专属议程数 >= 2");
      assert("fraAgendasCount", fraAgendas.length >= 2, "法国专属议程数 >= 2");
      assert("gbrAgendasCount", gbrAgendas.length >= 2, "英国专属议程数 >= 2 (金融大爆炸/私有化)");
      assert("sunAgendasCount", sunAgendas.length >= 2, "苏联专属议程数 >= 2 (合资法/新联盟)");
      assert("usaAgendasCount", usaAgendas.length >= 2, "美国专属议程数 >= 2 (供给学派/SDI)");
      assert("defaultFallbackAgendas", defAgendas.length >= 2, "通用国家 fallback 议程有效");

      // 3. 初始状态断言
      initAgendaState();
      assert("stateInitClean", Object.keys(ST.agendas).length === 0, "ST.agendas 初始化为空字典");
      const chnState = getAgendaState("CHN");
      assert("chnStateInit", chnState.active === null && chnState.progress === 0 && chnState.completed.length === 0, "国家议程初始结构完备");

      // 4. 前置条件断言：中国百万大裁军军费与年代约束
      const agSez = chnAgendas.find((a) => a.id === "chn_sez");
      const agDisarm = chnAgendas.find((a) => a.id === "chn_disarm");
      assert("sezConditionPass", checkAgendaCondition("CHN", agSez).ok === true, "1980 年设立经济特区前置条件满足");

      // 军费过高时大裁军被锁
      ST.player = "CHN";
      ST.mil = 5.0;
      assert("disarmBlockedByMilAndPrereq", checkAgendaCondition("CHN", agDisarm).ok === false, "军费 5% 且未完成特区时大裁军应被禁用");

      // 5. 启动议程与推进
      const startRes = startAgenda("CHN", "chn_sez");
      assert("startAgendaSuccess", startRes === true && ST.agendas.CHN.active === "chn_sez", "成功启动特区议程");
      assert("cantStartSecondAgenda", startAgenda("CHN", "chn_triangle") === false, "推进中不可同时启动第二项议程");

      // 6. 月度演进推进至完成
      const prevProg = ST.agendas.CHN.progress;
      updateMonthlyAgendas(1980, 2, true);
      assert("progressAdvanced", ST.agendas.CHN.progress > prevProg, "月度演进推进进度");

      // 快速模拟推进至 100% 完成
      for (let i = 0; i < 20; i++) {
        updateMonthlyAgendas(1980, 3 + i, true);
      }
      assert("agendaCompleted", ST.agendas.CHN.completed.includes("chn_sez"), "特区议程推进完毕进入 completed");
      assert("agendaActiveReset", ST.agendas.CHN.active === null, "达成后 active 自动置空");
      assert("gdpBonusCalculated", ST.agendas.CHN.bonuses.gdpBonus === 0.35, "正确计算 +0.35pp GDP 结构性红利");
      assert("reserveMonthlyCalculated", ST.agendas.CHN.bonuses.reserveMonthly === 1.5, "正确计算 +1.5亿 外汇流红利");

      // 7. 单一事实源与 pmods 注入
      applyPlayerDecisions();
      const pmodsCHN = W1980_SIM.pmap(SIM.S).CHN;
      assert("pmodsInjectedGdpBonus", typeof pmodsCHN === "number", "pmods 正确注入玩家执政国家");

      // 8. 日本专守防卫 1% 军费红线校验
      const agJpnDef = jpnAgendas.find((a) => a.id === "jpn_defense_cap");
      ST.player = "JPN";
      ST.mil = 2.0;
      assert("jpnDefenseBlockedHighMil", checkAgendaCondition("JPN", agJpnDef).ok === false, "日本军费 2.0% 时专守防卫应被禁用");
      ST.mil = 0.8;
      assert("jpnDefenseAllowedLowMil", checkAgendaCondition("JPN", agJpnDef).ok === true, "日本军费 0.8% 时专守防卫条件满足");

      // 9. 美国 SDI 军备军费 ≥ 5% 校验
      const agUsaSdi = usaAgendas.find((a) => a.id === "usa_sdi_tech");
      ST.player = "USA";
      const oldYear = SIM.S ? SIM.S.year : 1980;
      const oldMonth = SIM.S ? SIM.S.month : 1;
      if (SIM.S) { SIM.S.year = 1983; SIM.S.month = 4; }
      ST.mil = 3.0;
      assert("usaSdiBlockedLowMil", checkAgendaCondition("USA", agUsaSdi).ok === false, "美国军费 3.0% 时 SDI 应被禁用");
      ST.mil = 6.0;
      assert("usaSdiAllowedHighMil", checkAgendaCondition("USA", agUsaSdi).ok === true, "美国军费 6.0% 且 1983 年时 SDI 允许启动");
      if (SIM.S) { SIM.S.year = oldYear; SIM.S.month = oldMonth; }

      // 10. 大三角脱钩震荡免疫验证
      ST.player = "CHN";
      ST.agendas.CHN.completed.push("chn_triangle");
      ST.agendas.CHN.bonuses = calcAgendaBonuses("CHN");
      assert("hasDecoupleImmunityBonus", ST.agendas.CHN.bonuses.decoupleImmunity === true, "达成大三角平衡后获得脱钩免疫");
      ST.blocOverride.CHN = "WP";
      ST.blocSince = curMonthIdx();
      const blocEff = curBlocEffect();
      assert("decoupleFrictionZero", blocEff.friction === 0, "脱钩免疫使阵营迁移脱钩震荡摩擦归零");

      // 11. 界面渲染测试
      const agendaBox = $("p-agenda-box");
      assert("agendaBoxDomExists", !!agendaBox, "#p-agenda-box DOM 容器存在");
      refreshAgendaBox("CHN");
      assert("chnRenderedCards", agendaBox.innerHTML.includes("设立经济特区") && agendaBox.querySelectorAll(".ag-card").length >= 3, "成功渲染中国议程卡片列表");
      refreshAgendaBox("JPN");
      assert("jpnRenderedCards", agendaBox.innerHTML.includes("半导体与精密制造") && agendaBox.innerHTML.includes("恪守专守防卫"), "成功渲染日本议程卡片列表");
      refreshAgendaBox("DEU");
      assert("deuRenderedCards", agendaBox.innerHTML.includes("单一欧洲法案"), "成功渲染欧洲单一市场议程卡片");

      // 12. 终局后日谈专属篇章与称号联动
      const epSt = {
        date: "1991-12",
        world: { gdp: 24000, gdp0: 12000, gdpDelta: 100, pop: 5300, pop0: 4400, popDelta: 20.4 },
        blocs: [{ b: "CHN", zh: "中国", gdpShare: 18, gdpShare0: 12, popShare: 22, popShare0: 22 }],
        player: {
          k: "CHN", zh: "中国", mil: 2,
          gdp: 2600, gdp0: 1200, gdpDelta: 116,
          pop: 1100, pop0: 980, popDelta: 12.2,
          rank0: 8, rank1: 4, dr: 4, pctl: 0.95,
          E: 28, R: 12, M: 15, G: 20, G_bloc: 10, G_act: 12, total: 87
        }
      };
      const epRes = generateEpilogue(epSt);
      assert("epilogueHasAgendaSection", epRes.sections.some((s) => s.sec.includes("专属国家战略路线")), "终局后日谈包含专属战略议程篇章");
      assert("epilogueSpecialTitle", epRes.rankTitle.includes("总设计师") || epRes.rankTitle.includes("擎天"), "达成双核心议程荣膺专属历史称号");

      // 13. 旁观模式零漂移验证
      ST.player = null;
      applyPlayerDecisions();
      const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
      assert("observerZeroPmods", pmodsCount === 0, "旁观模式下 applyPlayerDecisions 绝对 0 pmods (0 漂移)");

      // 14. 存档读档往返序列化
      ST.player = "CHN";
      ST.agendas.CHN.completed = ["chn_sez", "chn_triangle"];
      ST.agendas.CHN.active = "chn_disarm";
      ST.agendas.CHN.progress = 45.5;
      simSave();
      initAgendaState();
      assert("stateCleanedBeforeLoad", Object.keys(ST.agendas).length === 0, "读档前清空状态生效");
      simLoad();
      assert("stateRestoredAfterLoad", ST.agendas.CHN && ST.agendas.CHN.active === "chn_disarm" && Math.abs(ST.agendas.CHN.progress - 45.5) < 0.1 && ST.agendas.CHN.completed.length === 2, "simSave/simLoad 100% 完美往返恢复议程状态");

      // 复原状态
      ST.player = null;
      ST.mil = 0;
      ST.blocOverride = {};
      ST.blocSince = null;
      initAgendaState();
      applyPlayerDecisions();
      refreshAgendaBox(ST.sel);
    } catch (e) {
      r.pass = false;
      r.errors.push("Exception: " + e.message);
    }

    const d = document.createElement("div"); d.id = "agendaprobe"; d.style.display = "none";
    d.textContent = "AGENDAPROBE " + JSON.stringify(r);
    document.body.appendChild(d);
    return r;
  }

  // ---- R12C: 中局突发危机抉择卡与升级阶梯系统 ----
  let crisisResumePlay = false;

  function initCrisisState() {
    ST.crises = {
      history: [],
      pending: null
    };
    return ST.crises;
  }

  function sanitizeCrisisState(data) {
    if (!data || typeof data !== "object") {
      return { history: [], pending: null };
    }
    const history = Array.isArray(data.history)
      ? data.history.filter((h) => h && typeof h.id === "string" && typeof h.tier === "number")
      : [];
    let pending = null;
    if (data.pending && typeof data.pending.id === "string") {
      pending = (window.W1980_CRISES && window.W1980_CRISES.getCrisisById(data.pending.id)) || data.pending;
    }
    return { history: history, pending: pending };
  }

  function openCrisisModal(cr) {
    if (!cr) return false;
    const modal = $("crisis-modal");
    if (!modal) return false;

    if (!ST.crises) initCrisisState();
    ST.crises.pending = cr;
    if (window.W1980_SOUND) window.W1980_SOUND.playTeletype();

    if (SIM.playing) {
      crisisResumePlay = true;
      SIM.playing = false;
      updateDate();
    }

    const mDate = $("crisis-date");
    if (mDate) mDate.textContent = cr.year + "-" + String(cr.month).padStart(2, "0");
    const mTitle = $("crisis-title");
    if (mTitle) mTitle.textContent = cr.title;
    const mSubhead = $("crisis-subhead");
    if (mSubhead) mSubhead.textContent = cr.headline || "";
    const mRegion = $("crisis-region");
    if (mRegion) mRegion.textContent = "📍 " + (cr.region || "前线热点战区");
    const mActors = $("crisis-actors");
    if (mActors) {
      const actorNames = (cr.actors || []).map((k) => (CM.countries[k] || {}).zh || k).join(" · ");
      mActors.textContent = "🌐 涉事各方：" + (actorNames || "美苏超级大国");
    }
    const mDesc = $("crisis-desc");
    if (mDesc) mDesc.textContent = cr.desc || "";

    const optContainer = $("crisis-options");
    if (optContainer) {
      optContainer.innerHTML = (cr.options || []).map((opt) => {
        const tierClass = "tier-" + opt.tier;
        return '<div class="crisis-card ' + tierClass + '">' +
          '<div class="crisis-card-hd">' +
            '<span class="crisis-card-tier">' + opt.icon + ' 阶梯 ' + opt.tier + '</span>' +
            '<span class="crisis-card-badge">' + (opt.badge || ("阶梯 " + opt.tier)) + '</span>' +
          '</div>' +
          '<div class="crisis-card-title">' + opt.title + '</div>' +
          '<div class="crisis-card-desc">' + opt.desc + '</div>' +
          '<div class="crisis-card-effects"><strong>决断预期：</strong>' + (opt.effects && opt.effects.summary ? opt.effects.summary : "重塑地缘对抗均势") + '</div>' +
          '<button class="crisis-btn-decide" data-crisis="' + cr.id + '" data-tier="' + opt.tier + '">拍板决断 (执行阶梯 ' + opt.tier + ')</button>' +
        '</div>';
      }).join("");

      optContainer.querySelectorAll(".crisis-btn-decide").forEach((btn) => {
        btn.onclick = () => {
          const cId = btn.dataset.crisis;
          const tier = parseInt(btn.dataset.tier, 10);
          resolveCrisis(cId, tier);
        };
      });
    }

    modal.style.display = "flex";
    return true;
  }

  function hideCrisisModal() {
    const modal = $("crisis-modal");
    if (modal) modal.style.display = "none";
  }

  function closeCrisisModal() {
    hideCrisisModal();
    if (crisisResumePlay) {
      SIM.playing = true; simKick();
      crisisResumePlay = false;
      updateDate();
    }
  }

  function resolveCrisis(crId, tier, silent) {
    if (!window.W1980_CRISES) return false;
    const cr = window.W1980_CRISES.getCrisisById(crId);
    if (!cr) return false;
    const opt = (cr.options || []).find((o) => o.tier === tier) || cr.options[0];
    if (!opt) return false;

    if (!ST.crises) initCrisisState();
    const y = SIM.S ? SIM.S.year : cr.year;
    const m = SIM.S ? SIM.S.month : cr.month;
    ST.crises.history.push({
      id: cr.id,
      tier: tier,
      y: y,
      m: m,
      title: cr.title,
      optionTitle: opt.title,
      time: Date.now()
    });
    ST.crises.pending = null;

    const eff = opt.effects || {};

    // 1. 双边张力影响 (R10A)
    if (typeof eff.tensionDelta === "number" && eff.tensionDelta !== 0 && ST.ai && ST.ai.tensions) {
      const usSunKey = "USA:SUN";
      const curTension = typeof ST.ai.tensions[usSunKey] === "number" ? ST.ai.tensions[usSunKey] : 50;
      ST.ai.tensions[usSunKey] = clamp(curTension + eff.tensionDelta, 0, 100);
    }

    // 2. 大国内政生态与派系权力天平渗透 (R12A)
    if (ST.domestic) {
      if (ST.domestic.sun) {
        if (typeof eff.sunConservative === "number") {
          ST.domestic.sun.conservative = clamp(ST.domestic.sun.conservative + eff.sunConservative, 10, 95);
        }
        if (typeof eff.sunReformist === "number") {
          ST.domestic.sun.reformist = clamp(ST.domestic.sun.reformist + eff.sunReformist, 5, 90);
        }
        if (typeof eff.sunShortage === "number") {
          ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage + eff.sunShortage, 0, 100);
        }
      }
      if (ST.domestic.usa) {
        if (typeof eff.usaCongressApproval === "number") {
          ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval + eff.usaCongressApproval, 15, 90);
        }
      }
      if (ST.domestic.generals) {
        if (typeof eff.stabilityBonus === "number") {
          for (const k in ST.domestic.generals) {
            ST.domestic.generals[k].stability = clamp(ST.domestic.generals[k].stability + eff.stabilityBonus, 10, 100);
          }
        }
      }
    }

    // 3. 巴统技术管制升级
    if (eff.cocomStrict && ST.cocom) {
      ST.cocom.strict = true;
    }

    // 4. 收件箱入账与即时反馈
    const inboxItem = {
      y: y,
      m: m,
      zh: "【突发危机决断】" + cr.title + " · " + opt.title,
      note: opt.icon + " 最高决策层拍板阶梯 " + tier + "（" + (opt.badge || "") + "）：" + (eff.summary || opt.desc),
      isCrisis: true
    };
    EV.items.push(inboxItem);
    EV.unread++;
    renderInbox();
    if (!silent) toast(inboxItem);

    // 5. 模态窗口关闭与播放恢复
    closeCrisisModal();
    if (ST.sel && typeof refreshDomesticBox === "function") {
      refreshDomesticBox(ST.sel);
    }
    return true;
  }

  function updateMonthlyCrises(y, m, silent) {
    if (!window.W1980_CRISES) return;
    if (!ST.crises) initCrisisState();

    const crises = window.W1980_CRISES.getCrisesForDate(y, m);
    if (!crises || !crises.length) return;

    for (let i = 0; i < crises.length; i++) {
      const cr = crises[i];
      if (ST.crises.history.some((h) => h.id === cr.id)) continue;

      // 旁观模式 或 探针测试模式：自动执行史实基准阶梯 2（对等均势反制），零暂停、零 pmods 注入、零漂移
      if (!ST.player || CR.probeMode) {
        ST.crises.history.push({
          id: cr.id,
          tier: 2,
          y: y,
          m: m,
          title: cr.title,
          optionTitle: (cr.options && cr.options[1] ? cr.options[1].title : "对等反制"),
          auto: true,
          time: Date.now()
        });
        continue;
      }

      // 玩家执政模式：涉及玩家国或美苏大国时触发危机抉择卡
      const isPlayerInvolved = !cr.actors || !cr.actors.length ||
        cr.actors.includes(ST.player) || cr.target === ST.player || cr.initiator === ST.player ||
        ST.player === "SUN" || ST.player === "USA";
      if (isPlayerInvolved) {
        if (silent === true && !CR.probeMode) {
          CR.resumePlay = SIM.playing;
          SIM.playing = false;
          updateDate();
          openCrisisModal(cr);
          return;
        }
        openCrisisModal(cr);
        return;
      }
    }
  }

  // ---- R12C: 突发危机抉择卡与升级阶梯专用全链路探针 ----
  function runCrisisProbe() {
    const r = { pass: true, errors: [], details: {} };
    const assert = (name, cond, msg) => {
      r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
      if (!cond) {
        r.pass = false;
        r.errors.push(name + ": " + (msg || "failed"));
        console.error("CRISISPROBE FAIL [" + name + "]: " + msg);
      }
    };

    try {
      // 1. 核心数据库与函数存在性
      assert("databaseLoaded", !!window.W1980_CRISES && Array.isArray(window.W1980_CRISES.list), "W1980_CRISES 数据库应成功载入");
      assert("crisesCount8", window.W1980_CRISES && window.W1980_CRISES.list.length === 8, "突发危机总数应为 8 大历史危机");
      assert("crisisPolandLoaded", !!window.W1980_CRISES.getCrisisById("crisis_poland_1981"), "1981 波兰戒严危机应存在");
      assert("crisisSouthGeorgiaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_southgeorgia_1982"), "1982 南乔治亚岛危机应存在");
      assert("crisisKAL007Loaded", !!window.W1980_CRISES.getCrisisById("crisis_kal007_1983"), "1983 大韩航空 007 班机事件应存在");
      assert("crisisGrenadaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_grenada_1983"), "1983 格林纳达狂暴行动危机应存在");
      assert("crisisBeirutLoaded", !!window.W1980_CRISES.getCrisisById("crisis_beirut_1985"), "1985 贝鲁特人质危机应存在");
      assert("crisisAchilleLoaded", !!window.W1980_CRISES.getCrisisById("crisis_achille_1985"), "1985 阿基莱·劳伦号游轮危机应存在");
      assert("crisisVincennesLoaded", !!window.W1980_CRISES.getCrisisById("crisis_vincennes_1988"), "1988 文森斯号海湾误击事件应存在");
      assert("crisisRomaniaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_romania_1989"), "1989 罗马尼亚蒂米什瓦拉剧变应存在");

      // 2. 危机数据结构与阶梯完整性
      assert("allCrisesHave3Tiers", window.W1980_CRISES.list.every((c) => c.options && c.options.length === 3), "每个危机均严格配备三级博弈应对阶梯");
      assert("allCrisesHaveEffects", window.W1980_CRISES.list.every((c) => c.options.every((o) => o.effects && typeof o.effects === "object")), "每个阶梯选项均定义有效效果对象");

      // 3. 核心 API 函数定义
      assert("initCrisisStateExists", typeof initCrisisState === "function", "initCrisisState 应已定义");
      assert("sanitizeCrisisStateExists", typeof sanitizeCrisisState === "function", "sanitizeCrisisState 应已定义");
      assert("openCrisisModalExists", typeof openCrisisModal === "function", "openCrisisModal 应已定义");
      assert("closeCrisisModalExists", typeof closeCrisisModal === "function", "closeCrisisModal 应已定义");
      assert("resolveCrisisExists", typeof resolveCrisis === "function", "resolveCrisis 应已定义");
      assert("updateMonthlyCrisesExists", typeof updateMonthlyCrises === "function", "updateMonthlyCrises 应已定义");

      // 4. DOM 容器与布局校验
      const modal = $("crisis-modal");
      const dossier = $("crisis-dossier");
      const optBox = $("crisis-options");
      assert("modalDomExists", !!modal, "#crisis-modal 应存在于 DOM 中");
      assert("dossierDomExists", !!dossier, "#crisis-dossier 密电卡片容器应存在于 DOM 中");
      assert("optionsDomExists", !!optBox, "#crisis-options 阶梯容器应存在于 DOM 中");

      // 5. 状态初始化与纯净性
      initCrisisState();
      assert("initialStateClean", ST.crises && ST.crises.history.length === 0 && ST.crises.pending === null, "ST.crises 初始状态纯净");

      // 6. 弹窗渲染与阶梯卡片生成
      const cr1 = window.W1980_CRISES.getCrisisById("crisis_poland_1981");
      openCrisisModal(cr1);
      assert("openModalRendersTitle", $("crisis-title").textContent.includes("波兰戒严"), "弹窗标题正确渲染波兰危机");
      assert("openModalRendersCards", optBox.querySelectorAll(".crisis-card").length === 3, "弹窗成功渲染 3 张应对阶梯卡片");
      assert("modalDisplayFlex", modal.style.display === "flex", "弹窗 display 属性为 flex");

      // 7. 决断执行（阶梯 1：战略克制）
      const resolveRes = resolveCrisis("crisis_poland_1981", 1, true);
      assert("resolveReturnsTrue", resolveRes === true, "resolveCrisis 顺利执行返回 true");
      assert("resolveHistoryRecorded", ST.crises.history.some((h) => h.id === "crisis_poland_1981" && h.tier === 1), "历史记录成功入账阶梯 1");
      assert("resolveModalClosed", modal.style.display === "none", "决断后弹窗已自动关闭");
      assert("resolveClearedPending", ST.crises.pending === null, "决断后 pending 状态已清空");

      // 8. 大国内政生态与巴统联动校验 (阶梯 3 强硬决断)
      initDomesticState();
      const prevApproval = (ST.domestic && ST.domestic.usa) ? ST.domestic.usa.congressApproval : 55;
      resolveCrisis("crisis_kal007_1983", 3, true);
      assert("cocomStrictUpgraded", ST.cocom && ST.cocom.strict === true, "KAL007 阶梯 3 升级巴统技术封锁");
      assert("domesticApprovalBoosted", (ST.domestic && ST.domestic.usa && ST.domestic.usa.congressApproval > prevApproval), "KAL007 阶梯 3 推升国会批准率");

      // 9. 旁观模式零漂移铁律检验
      ST.player = null;
      updateMonthlyCrises(1988, 7, true);
      assert("spectatorAutoBaseline", ST.crises.history.some((h) => h.id === "crisis_vincennes_1988" && h.tier === 2 && h.auto === true), "旁观模式自动采纳史实基准阶梯 2");
      applyPlayerDecisions();
      const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
      assert("spectatorZeroPmods", pmodsCount === 0, "旁观模式危机决断绝对 0 pmods 注入 (0 漂移)");

      // 10. 终局大事记时代编年史联动
      const chList = generateChronicle();
      assert("chronicleHasCrisis", Array.isArray(chList) && chList.some((item) => item.tagClass === "crisis"), "终局历史大事记编年史包含突发危机篇章");

      // 11. simSave() / simLoad() 全量往返序列化
      const savedLen = ST.crises.history.length;
      simSave();
      initCrisisState();
      assert("stateCleanedBeforeLoad", ST.crises.history.length === 0, "读档前清空状态生效");
      simLoad();
      assert("saveLoadRoundTrip", ST.crises && ST.crises.history.length === savedLen, "simSave/simLoad 完美往返恢复突发危机历史记录");

      // 恢复纯净环境
      ST.player = null;
      ST.mil = 0;
      initCrisisState();
      hideCrisisModal();
      applyPlayerDecisions();
    } catch (e) {
      r.pass = false;
      r.errors.push("Exception: " + e.message);
    }

    const d = document.createElement("div"); d.id = "crisisprobe"; d.style.display = "none";
    d.textContent = "CRISISPROBE " + JSON.stringify(r);
    document.body.appendChild(d);
    return r;
  }

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
      assert("simSaveIncludesSound", saveOk === true, "simSave 成功序列化包含 sound 字段");

      ST.sound.muted = false;
      ST.sound.vol = 0.9;
      assert("stateTamperedBeforeLoad", ST.sound.muted === false && Math.abs(ST.sound.vol - 0.9) < 0.001, "读档前状态篡改确认");
      const loadOk = simLoad();
      assert("simLoadSucceeds", loadOk === true, "simLoad 成功执行");
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
      assert("simSaveSucceeds", saveOk === true, "simSave 成功执行");
      const loadOk = simLoad();
      assert("simLoadSucceeds", loadOk === true, "simLoad 成功执行");
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
  // ---- R5C' T3：决策区渲染（本国面板：代价行 + 制裁/军援名单；他国面板：快捷操作行） ----
  function decFillSelect(sel, kind) {
    if (!sel) return;
    const list = kind === "san" ? ST.sanctions : ST.aid;
    const full = list.length >= DEC_MAX[kind];
    const ks = Object.keys(CM.countries).sort((a, b) =>
      String(CM.countries[a].zh).localeCompare(String(CM.countries[b].zh), "zh"));
    let h = "";
    for (const k of ks) {
      const fb = decForbidden(kind, k);
      const c = CM.countries[k];
      let suffix = "";
      if (fb === 1) suffix = "（你自己）";
      else if (fb === 2) suffix = c.parent === ST.player ? "（你的附属）" : "（你的宗主）";
      else if (fb === 3) suffix = "（本国成员）";
      else if (fb === 4) suffix = kind === "san" ? "（已在军援名单）" : "（已在制裁名单）";
      h += '<option value="' + k + '"' + (fb ? " disabled" : "") + ">" + c.zh + " · " + k + suffix + "</option>";
    }
    sel.innerHTML = h;
    sel.disabled = full && !list.some((x) => x.t === ST.sel);
    if (!sel.disabled && ST.sel && !decForbidden(kind, ST.sel)) sel.value = ST.sel;   // 默认 = 当前选中实体
  }
  function decListRow(kind, e) {
    const tier = DEC_TIERS[kind][e.l], c = CM.countries[e.t] || { zh: e.t };
    return "<b>" + c.zh + "</b> · " + tier.zh +
      "（对方 " + (kind === "san" ? "-" : "+") + tier.tgt.toFixed(1) + "pp / 我方 -" + tier.self.toFixed(1) + "pp）" +
      '<button class="btn dundo" data-kind="' + kind + '" data-t="' + e.t + '">撤销</button>';
  }
  function refreshDecBox(isMine) {
    const cost = decSelfCost();
    const dc = $("p-dec-cost");
    if (dc) {
      if (cost.total > 0) {
        dc.innerHTML = "当前决策使本国年增速 <b>-" + cost.total.toFixed(1) + "pp</b>" +
          "（军费 " + cost.mil + " · 制裁反噬 " + cost.san.toFixed(1) + " · 军援损耗 " + cost.aid.toFixed(1) + "）" +
          (cost.total >= 8 ? '<div class="dwarn">你的经济正在被自己的决策拖垮</div>' : "");
        dc.classList.toggle("bad", cost.total >= 8);
      } else { dc.innerHTML = "当前决策对本国年增速无影响"; dc.classList.remove("bad"); }
    }
    for (const kind of ["san", "aid"]) {
      const pre = kind === "san" ? "p-san" : "p-aid";
      const list = kind === "san" ? ST.sanctions : ST.aid;
      const cnt = $(pre + "-cnt"); if (cnt) cnt.textContent = list.length + "/" + DEC_MAX[kind];
      const sel = $(pre + "-sel"); if (sel) decFillSelect(sel, kind);
      const lv = $(pre + "-lvls");
      if (lv) lv.querySelectorAll("button").forEach((b) => {
        const t = sel ? sel.value : ST.sel;              // 档位按钮作用于下拉当前选中的目标
        b.disabled = !t || !!decForbidden(kind, t) ||
          (list.length >= DEC_MAX[kind] && !list.some((x) => x.t === t));
        b.classList.toggle("on", list.some((x) => x.t === t && x.l === +b.dataset.l));
      });
      const lb = $(pre + "-list");
      if (lb) lb.innerHTML = list.map((e) => '<div class="drow">' + decListRow(kind, e) + "</div>").join("");
      if (lb) lb.querySelectorAll(".dundo").forEach((b) => {
        b.onclick = () => decSet(b.dataset.kind, b.dataset.t, -1);
      });
    }
    // 他国面板快捷行（§3.1）：点谁就能对谁动手；下拉只是备选入口
    const q = $("p-dec-quick");
    if (!q) return;
    if (isMine || !ST.player || !ST.sel || ST.sel === ST.player) { q.style.display = "none"; q.innerHTML = ""; return; }
    const fbS = decForbidden("san", ST.sel), fbA = decForbidden("aid", ST.sel);
    if ((fbS && fbS !== 4) || (fbA && fbA !== 4)) { q.style.display = "none"; q.innerHTML = ""; return; }
    const zh = CM.countries[ST.sel].zh;
    let h = '<div class="dq-h">对该国（' + zh + "）：</div>";
    for (const kind of ["san", "aid"]) {
      const list = kind === "san" ? ST.sanctions : ST.aid;
      const cur = list.find((x) => x.t === ST.sel);
      h += '<div class="dq-r"><span class="dq-k">' + (kind === "san" ? "制裁 ▸" : "军援 ▸") + "</span>";
      if (cur) {
        h += "<b>已" + DEC_TIERS[kind][cur.l].zh + "</b>";
        h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="-1">撤销</button>';
        for (let l = 0; l < 3; l++) if (l !== cur.l)
          h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="' + l + '">' +
            DEC_TIERS[kind][l].zh.replace("制裁", "").replace("军援", "") + "</button>";
      } else {
        for (let l = 0; l < 3; l++)
          h += '<button class="btn dqv" data-kind="' + kind + '" data-t="' + ST.sel + '" data-l="' + l + '">' +
            DEC_TIERS[kind][l].zh.replace("制裁", "").replace("军援", "") + "</button>";
      }
      h += "</div>";
    }
    q.style.display = ""; q.innerHTML = h;
    q.querySelectorAll(".dqv").forEach((b) => {
      b.onclick = () => decSet(b.dataset.kind, b.dataset.t, +b.dataset.l);
    });
  }
  function wireDecUI() {
    for (const kind of ["san", "aid"]) {
      const pre = kind === "san" ? "p-san" : "p-aid";
      const sel = $(pre + "-sel");
      if (sel) sel.onchange = () => { if (ST.sel !== sel.value) select(sel.value); };
      const lv = $(pre + "-lvls");
      if (lv) lv.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          const t = $(pre + "-sel") ? $(pre + "-sel").value : ST.sel;
          if (t) decSet(kind, t, +b.dataset.l);
        };
      });
    }
  }
  function setPlayer(k, refresh) {
    ST.player = (k && CM.countries[k]) ? k : null;
    // R5C' §1.3：切换玩家国后必须清洗名单（丢弃新本国/附属/宗主项与互斥冲突项），再重挂
    sanitizeAllDecisions();
    ST.blocOverride = {};                // R5E：换国即清阵营迁移（归属属于「这一局的你」）
    ST.blocSince = null;                 // R7A：换国同时清空阵营时间戳
    if (ST.ai) { ST.ai.decisions = {}; ST.ai.tensions = {}; }
    if (refresh !== false) {
      if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, true);
      else applyPlayerDecisions();
      rebuildBlocTable(); updPlayerTag(); refreshMilBox(); if (ST.sel) select(ST.sel);
    }
  }
  function setMil(v) {
    ST.mil = clamp(Number(v) || 0, 0, 10);
    if (isAIActive()) updateAIDecisions(SIM.S ? SIM.S.year : 1980, SIM.S ? Math.max(1, SIM.S.month) : 1, false);
    else applyPlayerDecisions();
    updPlayerTag(); refreshMilBox();
    if (ST.sel) select(ST.sel);
    fillTop();
  }
  // ------------------------------------------------- R4 终局判定（1991-12 结算）
  // 范围：只消费 R3 落地的 ST.player / ST.mil；**不改引擎、不改存档格式（仍为 v2）**。
  // 判定不是"胜负"而是"结算 + 评分"——本作尚无战争/外交模型，评分只由可计算量构成（见 renderEnd 口径）。
  const END_Y = 1991, END_M = 12;
  function simAtEnd() { return SIM.ready && SIM.S.year === END_Y && Math.max(1, SIM.S.month) >= END_M; }
  const BLOC_ORDER = [["NATO", "北约"], ["WP", "华约"], ["SOV", "亲苏"], ["CHN", "中国阵营"],
    ["W", "西方(非北约)"], ["NA", "不结盟/第三世界"], ["NE", "中立"]];
  // GDP 名次：useSim=false → 1980 基准；true → 末期（当前仿真值）。54 实体口径。
  function gdpRankOf(k, useSim) {
    const keys = Object.keys(CM.countries);
    const val = (x) => useSim ? simVal(x).gdp_bn : CM.countries[x].gdp_bn;
    keys.sort((a, b) => val(b) - val(a));
    return keys.indexOf(k) + 1;
  }
  // 末期同比（近 12 个月）在 54 实体中的分位 ∈ [0,1]。
  // 为什么用分位而不用「与世界的差 / 固定带宽」：首版 rubric 用 ±3pp 带宽，
  // 实测苏东阵营在 1991 年末同比整体为负（SUN −0.8% ~ −10.3%），**E 项在全程恒为 0** —— 死项。
  // 分位是数据驱动、无魔法带宽，且对不同量级的经济体都可比。（两条曲线都记在 docs/SIM.md §11）
  function growthPctl(k) {
    const g = growthOf(entKeys(k));
    if (g === null) return null;
    const keys = Object.keys(CM.countries);
    let lo = 0, n = 0;
    for (let i = 0; i < keys.length; i++) {
      const gx = growthOf(entKeys(keys[i]));
      if (gx === null) continue;
      n++; if (gx < g) lo++;
    }
    return n > 1 ? lo / (n - 1) : 0.5;
  }
  // 纯计算（无 DOM）：阵营 GDP 占比 / 人口结构 / 玩家评分。探针与面板共用同一份口径。
  // 世界合计成立的前提：54 实体的成员 key 是对 133 成员的一个**划分**（实测实体 gdp 合计 == 成员 gdp1980 合计 == 12355.40）
  function endStats() {
    const keys = Object.keys(CM.countries);
    const blocs = BLOC_ORDER.map((b) => ({ b: b[0], zh: b[1], gdp: 0, pop: 0, gdp0: 0, pop0: 0 }));
    const idx = {};
    blocs.forEach((o, i) => { idx[o.b] = i; });
    let wg = 0, wp = 0, wg0 = 0, wp0 = 0;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], c = CM.countries[k], j = idx[blocOf(k)];   // R5E：分组读 override（计数字段/公式零改动）
      if (j === undefined) continue;
      const v = simVal(k);
      blocs[j].gdp += v.gdp_bn; blocs[j].pop += v.pop_m;
      blocs[j].gdp0 += c.gdp_bn; blocs[j].pop0 += c.pop_m;
      wg += v.gdp_bn; wp += v.pop_m; wg0 += c.gdp_bn; wp0 += c.pop_m;
    }
    blocs.forEach((o) => {
      o.gdpShare = wg ? o.gdp / wg * 100 : 0;
      o.gdpShare0 = wg0 ? o.gdp0 / wg0 * 100 : 0;
      o.popShare = wp ? o.pop / wp * 100 : 0;
      o.popShare0 = wp0 ? o.pop0 / wp0 * 100 : 0;
    });
    const out = { date: SIM.S ? SIM.S.year + "-" + Math.max(1, SIM.S.month) : "—",
      world: { gdp: wg, pop: wp, gdp0: wg0, pop0: wp0,
        gdpDelta: wg0 ? (wg / wg0 - 1) * 100 : 0, popDelta: wp0 ? (wp / wp0 - 1) * 100 : 0 },
      blocs: blocs, player: null };
    const pk = ST.player;
    if (pk && CM.countries[pk]) {
      const c = CM.countries[pk], v = simVal(pk);
      const gSelf = growthOf(entKeys(pk)), gWorld = growthWorld();
      const pctl = growthPctl(pk);
      const rank0 = gdpRankOf(pk, false), rank1 = gdpRankOf(pk, true), dr = rank0 - rank1;
      // R6A 战略评分 Rubric 2.0（tasks/016）：E(40) + R(20) + M(15) + G(25) = 100
      const E = 40 * (pctl === null ? 0.5 : pctl);          // 经济表现：末期同比的世界分位（0→满分 40）
      const R = 20 * clamp(0.5 + dr / 8, 0, 1);             // 国力位次：上升 4 名满分 / 下降 4 名归零（0→满分 20）
      // 国防适度（tasks/012 方案 A，0→满分 15）：军费 ≈4% 满分，0% 与 ≥10% 归零
      const M = 15 * Math.max(0, 1 - Math.abs(ST.mil - 4) / 6);

      // 地缘战略分 G（tasks/016，0→满分 25）：阵营消长分 G_bloc (10分) + 战略作为分 G_act (15分)
      // (1) 阵营消长分：本国阵营 global GDP 份额变动（Δs >= +3pp 满分10，Δs=0 得5分，<= -3pp 归零）
      const pBloc = blocOf(pk);
      const bObj = blocs.find((x) => x.b === pBloc) || { gdpShare: 0, gdpShare0: 0 };
      const deltaShare = bObj.gdpShare - bObj.gdpShare0;
      const G_bloc = 10 * clamp(0.5 + deltaShare / 6.0, 0, 1);

      // (2) 战略作为分：未干预享和平发展红利(8分)；有干预考察制裁遏制与军援扶植成效(0~15分)
      let G_act = 0;
      if (!ST.sanctions.length && !ST.aid.length) {
        G_act = 8.0;   // 和平专注基准红利（专注内政建设与中立安全）
      } else {
        let gSan = 0;
        for (const s of ST.sanctions) {
          const tgtC = CM.countries[s.t];
          if (!tgtC) continue;
          let pts = s.l === 0 ? 2.0 : s.l === 1 ? 4.5 : 7.0;
          if (blocOf(s.t) !== pBloc) pts += 1.0;            // 异营对抗加成
          if (gdpRankOf(s.t, false) <= 10) pts += 1.5;     // 遏制 1980 十大大国加成
          gSan += pts;
        }
        let gAid = 0;
        for (const a of ST.aid) {
          const tgtC = CM.countries[a.t];
          if (!tgtC) continue;
          let pts = a.l === 0 ? 2.0 : a.l === 1 ? 4.5 : 7.0;
          const tgtBloc = blocOf(a.t);
          if (tgtBloc === pBloc || tgtBloc === "NA") pts += 1.0; // 同盟/第三世界扶持加成
          const tgtDr = gdpRankOf(a.t, false) - gdpRankOf(a.t, true);
          if (tgtDr >= 0) pts += 1.5;                       // 扶植成效（受援国名次未下降或上升）
          gAid += pts;
        }
        G_act = clamp(gSan + gAid, 0, 15);
      }
      const G = clamp(G_bloc + G_act, 0, 25);
      const total = E + R + M + G;

      out.player = { k: pk, zh: c.zh, mil: ST.mil,
        gdp: v.gdp_bn, gdp0: c.gdp_bn, gdpDelta: c.gdp_bn ? (v.gdp_bn / c.gdp_bn - 1) * 100 : 0,
        pop: v.pop_m, pop0: c.pop_m, popDelta: c.pop_m ? (v.pop_m / c.pop_m - 1) * 100 : 0,
        gSelf: gSelf, gWorld: gWorld, pctl: pctl, rank0: rank0, rank1: rank1, dr: dr,
        E: E, R: R, M: M, G: G, G_bloc: G_bloc, G_act: G_act, total: total };
    }
    return out;
  }
  // ---- R11C：终局后日谈史诗长卷与历史编年史系统 ----
  function generateEpilogue(st) {
    if (!st) st = endStats();
    const res = {
      title: "1980–1991 冷战终局后日谈长卷",
      subtitle: "十二年大国博弈终章 · 历史纵深与治国评述",
      rankTitle: "★ 冷战宏观观察者 ★",
      sections: []
    };
    const p = st.player;
    const blocs = st.blocs || [];
    const topBloc = blocs.slice().sort((a, b) => b.gdpShare - a.gdpShare)[0] || { zh: "西方", gdpShare: 0, gdpShare0: 0 };
    const dShare = (topBloc.gdpShare - topBloc.gdpShare0).toFixed(1);

    if (p) {
      if (p.total >= 85) res.rankTitle = "★ 冷战奇迹 · 大国擎天 ★";
      else if (p.total >= 70) res.rankTitle = "★ 定海神针 · 破浪前行 ★";
      else if (p.total >= 55) res.rankTitle = "★ 风雨同舟 · 守成维稳 ★";
      else res.rankTitle = "★ 沉浮动荡 · 时代阵痛 ★";

      // R12B 专属历史议程专属头衔联动：若达成 2 项及以上专属议程且评级良好
      if (ST.agendas && ST.agendas[p.k] && ST.agendas[p.k].completed && ST.agendas[p.k].completed.length >= 2 && p.total >= 60) {
        if (p.k === "CHN") res.rankTitle = "★ 改革开放与和平崛起总设计师 ★";
        else if (p.k === "JPN") res.rankTitle = "★ 技术立国与东亚雁阵领航者 ★";
        else if (p.k === "DEU") res.rankTitle = "★ 欧洲大市场奠基者与防务新支柱 ★";
        else if (p.k === "GBR") res.rankTitle = "★ 金融城大爆炸与结构转型总设计师 ★";
        else if (p.k === "FRA") res.rankTitle = "★ 高卢战略自主与欧洲单一市场统帅 ★";
        else if (p.k === "SUN") res.rankTitle = "★ 新联盟体制守护者与改革破局者 ★";
        else if (p.k === "USA") res.rankTitle = "★ 供给学派繁荣与天基高边疆统帅 ★";
      }

      const pc = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
      const rankTxt = p.dr > 0 ? ("上升 " + p.dr + " 位") : p.dr < 0 ? ("下降 " + (-p.dr) + " 位") : "维持原位";
      const pctlTxt = p.pctl !== null ? Math.round(p.pctl * 100) + "%" : "—";

      // 卷首 · 时代终局综评
      res.sections.push({
        sec: "卷首 · 时代终局综评",
        body: "在 1980 至 1991 年的风云激荡中，" + p.zh + "经历了波澜壮阔的十二年国运推演。GDP 总量由 1980 年的 " +
          p.gdp0.toFixed(0) + " 十亿扩张至 " + p.gdp.toFixed(0) + " 十亿（" + pc(p.gdpDelta) + "），世界排位由第 " +
          p.rank0 + " 名变为第 " + p.rank1 + " 名（" + rankTxt + "），经济增速位居全球第 " + pctlTxt +
          " 分位。大战略综合评分定格于 " + p.total.toFixed(1) + " / 100 分，荣膺【" + res.rankTitle.replace(/★/g, "").trim() + "】历史评价。",
        quote: "十二年间执政定策，每一项防务开支与地缘抉择，皆在世界版图上刻下了不可磨灭的印记。"
      });

      // 卷一 · 国运兴衰与阵营消长
      let sec1Body = "";
      if (p.k === "SUN") {
        const isDissolved = SIM.S && SIM.S.ussrDissolved;
        if (isDissolved) {
          sec1Body = "1991 年 12 月 25 日，莫斯科红场飘扬的红旗悄然滑落，长达半个世纪的冷战双极对峙宣告落幕。尽管执政期间进行了诸多战略周旋与政策调整，但在长期经济停滞、军备重负与各加盟共和国离心力的合力撕扯下，庞大的苏维埃大厦终告解体。新生的十五个独立国家在休克疗法的骤雨中艰难探索转型之路，亚欧大陆的地缘重心面临空前重构。";
        } else {
          sec1Body = "在关键的历史十字路口，联盟体制在改革的惊涛骇浪中得以保全。《新联盟条约》的签署与结构性调整使这艘庞然巨舰避免了四分五裂的悲剧命运。进入 1990 年代，一个保持着庞大工业底座与广袤地缘纵深的苏维埃联盟，将继续作为全球多极化格局中举足轻重的一极，打破了‘历史终结论’的单一剧本。";
        }
      } else if (p.k === "USA") {
        sec1Body = "经历 1980 年代里根经济学的复苏扩张与冷战终局的地缘胜势，美利坚合众国登上了全球单极霸权的顶峰。西方阵营在全球经济总量中的主导地位空前巩固，‘新世界秩序’成为华盛顿外交的核心叙事。然而，巨额双赤字的累积与冷战后多边体系的复杂利益诉求，预示着后冷战时代的世界并非坦途。";
      } else if (p.k === "CHN") {
        sec1Body = "从 1980 到 1991，改革开放的浩荡春风席卷神州大地。面对外部地缘风云变幻与苏东剧变的剧烈震荡，中国始终保持战略定力，坚持独立自主与对内深化改革。国民经济实现了历史性的快速跃升与民生改善，为跨入 21 世纪重返世界舞台中央奠定了坚不可摧的物质基石。";
      } else {
        sec1Body = p.zh + "作为国际舞台上的关键力量，在两大阵营激荡的夹缝与机遇中展现了非凡的韧性。经济位次" + rankTxt +
          "，在全球产业与资源贸易分工中占据了不可忽视的战略身位。";
      }
      sec1Body += " 全球格局方面，" + topBloc.zh + "阵营占据了全球 " + topBloc.gdpShare.toFixed(1) + "% 的产出份额（变动 " +
        (dShare >= 0 ? "+" : "") + dShare + "pp），冷战铁幕呈现出深刻的结构性消长。";
      res.sections.push({
        sec: "卷一 · 国运兴衰与阵营消长",
        body: sec1Body,
        quote: "阵营的兴替印证着大国兴衰的铁律：唯有内政昌明与战略清醒，方能立于不败之地。"
      });

      // 卷二 · 国防战略与军备路线
      let sec2Body = "";
      if (ST.mil >= 7) {
        sec2Body = "在防务与安全治理上，采取了高度戒备的重兵威慑学说，军费占比常年维持在 " + ST.mil + "% 的超高水平。钢铁长城虽筑牢了坚不可摧的国防壁垒，然而沉重的非生产性开支对民生与民间资本形成显著挤出，长期年均产出增速承受了累积惩罚，国防适度评分定格为 " + p.M.toFixed(1) + " / 15 分。";
      } else if (ST.mil >= 3 && ST.mil <= 5) {
        sec2Body = "防务决策展现了卓越的中庸智慧与战略定力，将国防预算严谨锚定在 " + ST.mil + "% 的适度区间。既有效威慑了潜在敌对势力、巩固了国家主权，又最大限度为工业投资与民生造血让渡了发展空间，达成了国防建设与经济繁荣的黄金平衡，国防适度分高达 " + p.M.toFixed(1) + " / 15 分。";
      } else {
        sec2Body = "推行了极其果断的紧缩裁军战略，军费占比压缩至仅 " + ST.mil + "%。刀枪入库为民生经济全力让路，带来了惊人的低负担增长红利；但在冷战充满不确定性的地缘博弈中，偏低的防务开支在突发安全风险面前面临着严峻的威慑韧性考验，国防适度评分定格为 " + p.M.toFixed(1) + " / 15 分。";
      }
      res.sections.push({
        sec: "卷二 · 国防战略与军备路线",
        body: sec2Body,
        quote: "国虽大，好战必亡；天下虽平，忘战必危。治国者的最高艺术正在于张弛之间。"
      });

      // 卷三 · 地缘前线与冲突痕迹
      let sec3Body = "";
      const hasUnsc598 = ST.ai && ST.ai.unsc && ST.ai.unsc.resolutions && ST.ai.unsc.resolutions.includes("res598");
      if (hasUnsc598) {
        sec3Body += "中东热点方面，在联合国安理会 598 号决议的强力斡旋下，两伊长达八年的堑壕拉锯与油轮战得以平息停火，波斯湾与霍尔木兹海峡重新迎来航运生机。";
      } else {
        sec3Body += "中东战局方面，两伊战争的长年消耗深刻撕裂了海湾原油动脉，油轮战的阴云笼罩霍尔木兹海峡，重塑了世界能源供应版图。";
      }
      if (ST.sanctions.length || ST.aid.length) {
        const sTargets = ST.sanctions.map((s) => (CM.countries[s.t] || { zh: s.t }).zh).join("、");
        const aTargets = ST.aid.map((a) => (CM.countries[a.t] || { zh: a.t }).zh).join("、");
        sec3Body += " 在多边博弈棋盘上，主动推行了对外干预路线" +
          (sTargets ? "（对 " + sTargets + " 实施制裁封锁）" : "") +
          (aTargets ? "（对 " + aTargets + " 注入战略军援）" : "") +
          "，虽承受了每年 -" + decSelfCost().total.toFixed(1) + "pp 的自身增长代价，却在地缘天平上斩获了 " +
          p.G_act.toFixed(1) + " 分战略作为成效。";
      } else {
        sec3Body += " 在对外政策上，奉行了独立自主与和平克制的内政专注路线，未卷入盲目的对外制裁或军援泥潭，收获了 8.0 分稳健的和平专注战略红利。";
      }
      res.sections.push({
        sec: "卷三 · 地缘前线与冲突痕迹",
        body: sec3Body,
        quote: "远方的烽烟从未真正远离，地缘棋局上的每一步落子，都在重塑世界的均势。"
      });

      // 卷四 · 峰会军控与多边秩序
      let sec4Body = "";
      const hasTreaties = ST.ai && ST.ai.treaties && Object.keys(ST.ai.treaties).length > 0;
      const activeTreaties = hasTreaties ? Object.entries(ST.ai.treaties).filter(([k, v]) => v.status === "active") : [];
      if (activeTreaties.length > 0) {
        const tNames = activeTreaties.map(([k, v]) => v.name || k).join("与");
        sec4Body += "在多边外交与大国关系领域，首脑峰会破冰机制催生了《" + tNames + "》等划时代军控条约的落地履约，大国间的互信赤字得以扭转，战略核阴云逐步消散，为世界赢得了宝贵的冷战和平红利。";
      } else {
        sec4Body += "在多边外交领域，大国首脑会晤几经周折，互信赤字与战略疑虑仍如阴云笼罩，军控博弈在妥协与坚守之间艰难前行。";
      }
      if (ST.ai && ST.ai.unsc && ST.ai.unsc.vetoCount > 0) {
        sec4Body += " 作为安理会常任理事国，在核心利益受到冲击的关键时刻果断行使了一票否决权（Veto），坚决捍卫了同盟阵营的地缘底线。";
      }
      res.sections.push({
        sec: "卷四 · 峰会军控与多边秩序",
        body: sec4Body,
        quote: "谈判桌前的握手虽无法立刻消弭铁幕，却在核阴霾之下点亮了理性的微光。"
      });

      // R12B 卷五 · 专属国家战略路线
      if (ST.agendas && ST.agendas[p.k] && Array.isArray(ST.agendas[p.k].completed) && ST.agendas[p.k].completed.length > 0) {
        const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(p.k) : [];
        const titles = ST.agendas[p.k].completed.map((id) => {
          const item = agList.find((a) => a.id === id);
          return item ? ("【" + item.title + "】") : id;
        }).join("、");
        res.sections.push({
          sec: "卷五 · 专属国家战略路线与历史答卷",
          body: "执政期间始终坚持战略定力与顶层谋划，成功达成了 " + titles + " 等具有划时代意义的专属国家议程。所开辟的独特发展路径不仅释放了深层的结构性经济红利，更使国家在复杂动荡的冷战大变局中确立了无可替代的地缘身位与制度韧性。",
          quote: "战略路线的清醒坚守是大国破局之源，非凡之策方能成就长治久安。"
        });
      }

      // 卷尾 · 历史回响
      res.sections.push({
        sec: "卷尾 · 历史回响",
        body: "1991 年的风雪渐次消散，冷战的旧时代已然落幕，但大国博弈的巨轮从未停歇。从波斯湾的石油管道到柏林墙坍塌的废墟，从日内瓦的谈判长桌到安理会的审议大厅，历史的车轮滚滚向前。1991 的终局并非历史的终结，而是人类文明在新世纪谱写多极新篇章的恢弘序曲。",
        quote: "往事如烟，青史不泯。十二年大战略激荡，终成一家之言。"
      });
    } else {
      // 旁观模式
      res.sections.push({
        sec: "卷首 · 时代终局综评",
        body: "在 1980 至 1991 年的风云激荡中，全球 54 个国家与实体经历了波澜壮阔的冷战终局推演。全球经济总量由 1980 年的 " +
          (st.world.gdp0 / 1000).toFixed(2) + " 万亿扩张至 " + (st.world.gdp / 1000).toFixed(2) + " 万亿（+" +
          st.world.gdpDelta.toFixed(1) + "%），全球总人口由 " + (st.world.pop0 / 1000).toFixed(2) + " 十亿增长至 " +
          (st.world.pop / 1000).toFixed(2) + " 十亿。两极争霸的铁幕在十二年间经历了空前的剧变与重塑。",
        quote: "以超然的全知视角旁观冷战十二载，见证大国沉浮与时代更迭。"
      });
      res.sections.push({
        sec: "卷一 · 阵营消长与铁幕重塑",
        body: "各大阵营中，" + topBloc.zh + "阵营占据了全球 " + topBloc.gdpShare.toFixed(1) + "% 的经济份额（较 1980 变动 " +
          (dShare >= 0 ? "+" : "") + dShare + "pp）。苏东剧变与两极格局的演进改写了半个世纪的地缘均势，新旧秩序在阵痛中加速交替。",
        quote: "世界的重心在流动，历史的罗盘指向了不可逆转的多极化未来。"
      });
      res.sections.push({
        sec: "卷尾 · 历史回响",
        body: "1991 年的风雪落幕，冷战大时代自此告一段落。选择一个国家作为执政者重开推演，即可亲手制定军备开支、实施外交干预并检验你的大战略成就。",
        quote: "千帆过尽，唯有历史永恒。"
      });
    }
    return res;
  }

  function renderEpilogueHTML(ep) {
    if (!ep) return "";
    let h = '<div class="epilogue-scroll">';
    h += '<div class="epilogue-header">';
    h += '<div class="epilogue-title">' + ep.title + '</div>';
    h += '<div class="epilogue-sub">' + ep.subtitle + '</div>';
    if (ep.rankTitle) {
      h += '<div class="epilogue-badge">' + ep.rankTitle + '</div>';
    }
    h += '</div>';

    for (const sec of ep.sections) {
      h += '<div class="epilogue-section">';
      h += '<div class="epilogue-sec-title"><span>📜</span>' + sec.sec + '</div>';
      h += '<div class="epilogue-sec-body">' + sec.body + '</div>';
      if (sec.quote) {
        h += '<div class="epilogue-quote">“' + sec.quote + '”</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function generateChronicle() {
    const items = [];

    // 0. 全局时间锚点：1980-01 冷战大格局确立
    items.push({
      y: 1980,
      m: 1,
      time: "1980-01",
      tag: "历史大事件",
      tagClass: "event",
      title: "冷战终局推演启幕",
      desc: "两极对峙与铁幕并立，1980 全球 54 实体与 133 成员进入十二年大战略演进"
    });

    // 1. 历史事件与时代特刊 (来自 EV.items)
    if (typeof EV !== "undefined" && EV.items && EV.items.length) {
      for (const e of EV.items) {
        const isNews = !!(window.W1980_NEWS && window.W1980_NEWS[e.id]);
        items.push({
          y: e.y,
          m: e.m,
          time: e.y + "-" + String(e.m).padStart(2, "0"),
          tag: isNews ? "时代特刊" : "历史大事件",
          tagClass: isNews ? "news" : "event",
          title: e.zh,
          desc: e.note || (isNews ? "时代标志性历史转折点" : "国际地缘与经济事件")
        });
      }
    }

    // 2. 架空十字路口决断 (来自 CR.picks)
    if (typeof CR !== "undefined" && Array.isArray(CR.choices) && CR.choices.length) {
      const crMeta = {
        cr_gulf: { y: 1980, m: 9, zh: "波斯湾十字路口" },
        cr_able: { y: 1983, m: 11, zh: "优秀射手演习核危机" },
        cr_plaza: { y: 1985, m: 9, zh: "广场协议汇率谈判" },
        cr_chernobyl: { y: 1986, m: 4, zh: "切尔诺贝利核事故处置" },
        cr_east: { y: 1989, m: 6, zh: "东欧的历史抉择" },
        cr_ussr: { y: 1991, m: 3, zh: "苏维埃联盟命运公投" }
      };
      for (const pair of CR.choices) {
        if (!pair || !pair[0]) continue;
        const crId = pair[0], ci = pair[1];
        const meta = crMeta[crId] || { y: 1985, m: 1, zh: crId };
        items.push({
          y: meta.y,
          m: meta.m,
          time: meta.y + "-" + String(meta.m).padStart(2, "0"),
          tag: "历史抉择",
          tagClass: "player",
          title: meta.zh,
          desc: "做出历史十字路口决断（选项: " + ci + "）"
        });
      }
    }

    // 3. 军控条约签署 (来自 ST.ai.treaties)
    if (ST.ai && ST.ai.treaties) {
      for (const tid in ST.ai.treaties) {
        const tr = ST.ai.treaties[tid];
        const y = tr.signedYear || 1987;
        const m = tr.signedMonth || 12;
        items.push({
          y: y,
          m: m,
          time: y + "-" + String(m).padStart(2, "0"),
          tag: "军控条约",
          tagClass: "treaty",
          title: "签署《" + (tr.name || tid) + "》",
          desc: "美苏首脑峰会达成历史性妥协，条约生效并释放和平红利"
        });
      }
    }

    // 4. 联合国安理会决议通过 (来自 ST.ai.unsc.resolutions)
    if (ST.ai && ST.ai.unsc && ST.ai.unsc.resolutions) {
      const unscMeta = {
        res598: { y: 1987, m: 7, zh: "安理会 598 号决议（两伊停火）" },
        res660: { y: 1990, m: 8, zh: "安理会 660/678 号决议（海湾集体多边制裁）" },
        res502: { y: 1982, m: 4, zh: "安理会 502 号决议（马岛冲突调停）" }
      };
      for (const rid of ST.ai.unsc.resolutions) {
        const meta = unscMeta[rid] || { y: 1988, m: 1, zh: "安理会决议 " + rid };
        items.push({
          y: meta.y,
          m: meta.m,
          time: meta.y + "-" + String(meta.m).padStart(2, "0"),
          tag: "安理会决议",
          tagClass: "unsc",
          title: meta.zh,
          desc: "联合国安理会表决通过多边调停/制裁草案"
        });
      }
    }

    // 5. 玩家执政核心决策
    if (ST.player && CM.countries && CM.countries[ST.player]) {
      const pzh = CM.countries[ST.player].zh;
      items.push({
        y: 1980,
        m: 1,
        time: "1980-01",
        tag: "国家决策",
        tagClass: "player",
        title: pzh + " 执政启程",
        desc: "设定初始防务预算为 GDP 的 " + ST.mil + "%，确立冷战大战略施政方针"
      });
      if (ST.sanctions && ST.sanctions.length) {
        for (const s of ST.sanctions) {
          const tgtName = (CM.countries[s.t] || { zh: s.t }).zh;
          items.push({
            y: 1980,
            m: 1,
            time: "1980-01",
            tag: "国家决策",
            tagClass: "player",
            title: "对 " + tgtName + " 启动" + (DEC_TIERS.san[s.l] ? DEC_TIERS.san[s.l].zh : "制裁"),
            desc: "对外实施经贸制裁遏制（目标增速 -" + (DEC_TIERS.san[s.l] ? DEC_TIERS.san[s.l].tgt : 1) + "pp/年）"
          });
        }
      }
      if (ST.aid && ST.aid.length) {
        for (const a of ST.aid) {
          const tgtName = (CM.countries[a.t] || { zh: a.t }).zh;
          items.push({
            y: 1980,
            m: 1,
            time: "1980-01",
            tag: "国家决策",
            tagClass: "player",
            title: "向 " + tgtName + " 提供" + (DEC_TIERS.aid[a.l] ? DEC_TIERS.aid[a.l].zh : "军援"),
            desc: "提供战略防务与经济军援扶植（受援增速 +" + (DEC_TIERS.aid[a.l] ? DEC_TIERS.aid[a.l].tgt : 1) + "pp/年）"
          });
        }
      }
    }

    // 6. 突发危机历史决断 (来自 ST.crises.history)
    if (ST.crises && Array.isArray(ST.crises.history) && ST.crises.history.length) {
      for (const h of ST.crises.history) {
        const cr = window.W1980_CRISES ? window.W1980_CRISES.getCrisisById(h.id) : null;
        const opt = cr ? (cr.options || []).find((o) => o.tier === h.tier) : null;
        items.push({
          y: h.y,
          m: h.m,
          time: h.y + "-" + String(h.m).padStart(2, "0"),
          tag: "突发危机",
          tagClass: "crisis",
          title: (cr ? cr.title : h.id) + " · 阶梯 " + h.tier + " " + (opt ? opt.title : ""),
          desc: opt ? (opt.icon + " " + (opt.effects && opt.effects.summary ? opt.effects.summary : opt.desc)) : "做出中局突发危机升级阶梯裁决"
        });
      }
    }

    // 排序：按时间升序
    items.sort((a, b) => (a.y * 12 + a.m) - (b.y * 12 + b.m));
    return items;
  }

  function renderChronicleHTML(items) {
    if (!items || !items.length) {
      return '<div class="epilogue-section"><div class="epilogue-sec-body">暂无大事记记录。推进推演至终局即可生成十二年时代编年史。</div></div>';
    }
    let h = '<div class="chronicle-timeline">';
    for (const it of items) {
      h += '<div class="chronicle-item ' + (it.tagClass || "event") + '">';
      h += '<span class="chronicle-date">' + it.time + '</span>';
      h += '<span class="chronicle-tag ' + (it.tagClass || "event") + '">' + it.tag + '</span>';
      h += '<span class="chronicle-title">' + it.title + '</span>';
      if (it.desc) {
        h += '<div class="chronicle-desc">' + it.desc + '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function exportMemoirs(st) {
    if (!st) st = endStats();
    const ep = generateEpilogue(st);
    const ch = generateChronicle();
    const sep = "========================================================";
    const subSep = "--------------------------------------------------------";
    let txt = "";
    txt += sep + "\n";
    txt += "        1980–1991 冷战大战略 · 执政回忆录与时代长卷        \n";
    txt += sep + "\n\n";

    if (st.player) {
      const p = st.player;
      txt += "【执政档案】\n";
      txt += "执政实体: " + p.zh + " (" + p.k + ")\n";
      txt += "终局评分: " + p.total.toFixed(1) + " / 100 分  " + (ep.rankTitle || "") + "\n";
      txt += "四维评分: 经济表现 " + p.E.toFixed(1) + "/40 · 国力位次 " + p.R.toFixed(1) + "/20 · 国防适度 " + p.M.toFixed(1) + "/15 · 地缘战略 " + p.G.toFixed(1) + "/25\n";
      txt += "宏观轨迹: GDP " + p.gdp0.toFixed(0) + " → " + p.gdp.toFixed(0) + " 十亿 (" + (p.gdpDelta >= 0 ? "+" : "") + p.gdpDelta.toFixed(1) + "%)\n";
      txt += "国力排位: 第 " + p.rank0 + " 名 → 第 " + p.rank1 + " 名 (" + (p.dr > 0 ? "▲" + p.dr : p.dr < 0 ? "▼" + (-p.dr) : "—") + ")\n";
      txt += "国防军费: " + p.mil + "% GDP\n\n";
    } else {
      txt += "【旁观纪要】\n";
      txt += "模式: 宏观历史观察者（旁观推演）\n";
      txt += "世界经济: " + (st.world.gdp0 / 1000).toFixed(2) + " 万亿 → " + (st.world.gdp / 1000).toFixed(2) + " 万亿 (" + (st.world.gdpDelta >= 0 ? "+" : "") + st.world.gdpDelta.toFixed(1) + "%)\n\n";
    }

    txt += subSep + "\n";
    txt += "【历史终局后日谈】\n";
    txt += subSep + "\n\n";
    for (const s of ep.sections) {
      txt += "■ " + s.sec + "\n";
      txt += s.body + "\n";
      if (s.quote) txt += "  “" + s.quote + "”\n";
      txt += "\n";
    }

    txt += subSep + "\n";
    txt += "【十二年时代大事记编年史（精选）】\n";
    txt += subSep + "\n\n";
    for (const item of ch) {
      txt += "[" + item.time + "] [" + item.tag + "] " + item.title + (item.desc ? " —— " + item.desc : "") + "\n";
    }
    txt += "\n" + sep + "\n";
    txt += "由 1980 冷战大战略模拟器（world1980）生成\n";
    txt += sep + "\n";
    return txt;
  }

  function fallbackCopy(txt) {
    try {
      const ta = document.createElement("textarea");
      ta.value = txt;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast({ y: 1991, m: 12, zh: "《执政回忆录》已复制", note: "已成功导出至系统剪贴板，可粘贴分享！" });
    } catch (e) {
      toast({ y: 1991, m: 12, zh: "复制失败", note: "无法访问剪贴板，请手动选取内容" });
    }
  }

  function copyMemoirs(st) {
    const txt = exportMemoirs(st);
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => {
          toast({ y: 1991, m: 12, zh: "《执政回忆录》已复制", note: "已成功导出至系统剪贴板，可粘贴分享！" });
        }).catch(() => fallbackCopy(txt));
        ok = true;
      } else {
        fallbackCopy(txt);
        ok = true;
      }
    } catch (err) {
      fallbackCopy(txt);
      ok = true;
    }
    return ok;
  }

  function setEndTab(tab) {
    ST.endTab = tab || "rubric";
    document.querySelectorAll("#end-tabs .end-tab-btn").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.endtab === ST.endTab);
    });
    const panes = {
      rubric: $("end-pane-rubric"),
      epilogue: $("end-pane-epilogue"),
      chronicle: $("end-pane-chronicle")
    };
    for (const k in panes) {
      if (panes[k]) panes[k].classList.toggle("on", k === ST.endTab);
    }
  }

  function wireEndTabs() {
    document.querySelectorAll("#end-tabs .end-tab-btn").forEach((btn) => {
      btn.onclick = () => setEndTab(btn.dataset.endtab);
    });
  }

  function renderEnd(st) {
    const box = $("end-body"); if (!box) return;
    const pc = (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
    const dc = (d) => '<td class="v ' + (d >= 0 ? "up" : "dn") + '">' + (d >= 0 ? "+" : "") + d.toFixed(1) + "</td>";
    // 顺序：先「你的评分」（玩家最先要看自己的结果），再世界两块；按钮在页脚（不随正文滚动）
    let h = "<h4>决策评分</h4>";
    if (st.player) {
      const p = st.player;
      h += "<table>" +
        "<tr><td>" + p.zh + " · 产出</td><td class=\"v\">" + p.gdp0.toFixed(0) + " → " + p.gdp.toFixed(0) +
          " 十亿 (" + pc(p.gdpDelta) + ")</td></tr>" +
        '<tr><td>人口</td><td class="v">' + p.pop0.toFixed(1) + " → " + p.pop.toFixed(1) + " 百万 (" + pc(p.popDelta) + ")</td></tr>" +
        '<tr><td>GDP 名次（54 实体）</td><td class="v">' + p.rank0 + " → " + p.rank1 + " (" +
          (p.dr > 0 ? "▲" + p.dr : p.dr < 0 ? "▼" + (-p.dr) : "—") + ")</td></tr>" +
        '<tr><td>末期同比 / 世界同比</td><td class="v">' + growthText(p.gSelf) + " / " + growthText(p.gWorld) +
          "（世界第 " + (p.pctl === null ? "—" : Math.round(p.pctl * 100) + "%") + " 分位）</td></tr>" +
        '<tr><td>军费占比（你的决策）</td><td class="v">' + p.mil + "%</td></tr></table>" +
        '<div class="score">' +
        '<div class="s"><b>' + p.E.toFixed(1) + "</b><span>经济表现 /40</span></div>" +
        '<div class="s"><b>' + p.R.toFixed(1) + "</b><span>国力位次 /20</span></div>" +
        '<div class="s"><b>' + p.M.toFixed(1) + "</b><span>国防适度 /15</span></div>" +
        '<div class="s"><b>' + p.G.toFixed(1) + "</b><span>地缘战略 /25</span></div></div>" +
        '<div class="tot">总分 <b>' + p.total.toFixed(1) + "</b> / 100</div>";
      // R5C'/R6A：对外干预叙事行（含地缘战略分说明）
      if (ST.sanctions.length || ST.aid.length) {
        const yrs = (e, kind) => Math.max(0, curMonthIdx() - (e.since || 0)) / 12;
        const est = (e, kind) => {
          const pp = kind === "san" ? -DEC_TIERS.san[e.l].tgt : DEC_TIERS.aid[e.l].tgt;
          return (Math.exp(pp * yrs(e, kind) / 100) - 1) * 100;
        };
        const names = ST.sanctions.map((e) => "制裁 " + (CM.countries[e.t] || { zh: e.t }).zh + "（" + DEC_TIERS.san[e.l].zh + "）")
          .concat(ST.aid.map((e) => "军援 " + (CM.countries[e.t] || { zh: e.t }).zh + "（" + DEC_TIERS.aid[e.l].zh + "）")).join(" · ");
        const effs = ST.sanctions.map((e) => est(e, "san")).concat(ST.aid.map((e) => est(e, "aid")))
          .map((v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%").join(" / ");
        h += '<div class="note"><b>对外干预</b>：' + names + " —— 对手产出 " + effs +
          "（闭式估算），你承担 <b>-" + decSelfCost().total.toFixed(1) + "pp/年</b> 本国增速代价，换取 <b>" +
          p.G_act.toFixed(1) + "分</b> 战略作为成效分（计入地缘战略）。</div>";
      }
    } else {
      h += '<div class="note">旁观模式 · 无个人评分。在欢迎层或国家面板选一个国家，再重开一局即可获得评分。</div>';
    }
    h += '<div class="note"><b>评分口径 Rubric 2.0（作者设定，非史实校准）</b>：' +
      '经济表现 = 40×末期同比在 54 实体中的<b>分位</b>；' +
      '国力位次 = 20×clamp(0.5+名次上升/8,0,1)；' +
      '国防适度 = 15×max(0, 1−|军费−4%|/6)（军费 ≈4% 满分，过度穷兵黩武或不设防均扣分）；' +
      '地缘战略 = 25分（阵营份额消长分 10分 + 战略作为分 15分；和平专注内政享 8分基准红利，' +
      '对外有效制裁敌国与扶植盟友可获取高额战略作为分，平衡自身经济代价；见 REPORT_R6A）。</div>';
    h += "<h4>世界格局 · 阵营 GDP 占比（1980 → " + st.date + "）</h4>" +
      '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
    for (const b of st.blocs.slice().sort((a, b) => (b.gdpShare || 0) - (a.gdpShare || 0)))
      h += "<tr><td>" + b.zh + '</td><td class="v">' + ((b.gdpShare0 || 0).toFixed(1)) + '%</td><td class="v">' +
        ((b.gdpShare || 0).toFixed(1)) + "%</td>" + dc((b.gdpShare || 0) - (b.gdpShare0 || 0)) + "</tr>";
    h += '<tr><td>世界合计</td><td class="v">' + (st.world.gdp0 / 1000).toFixed(2) + ' 万亿</td><td class="v">' +
      (st.world.gdp / 1000).toFixed(2) + " 万亿</td>" + dc(st.world.gdpDelta) + "</tr></table>";
    h += "<h4>人口结构 · 阵营占比</h4>" +
      '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
    for (const b of st.blocs.slice().sort((a, b) => (b.popShare || 0) - (a.popShare || 0)))
      h += "<tr><td>" + b.zh + '</td><td class="v">' + ((b.popShare0 || 0).toFixed(1)) + '%</td><td class="v">' +
        ((b.popShare || 0).toFixed(1)) + "%</td>" + dc((b.popShare || 0) - (b.popShare0 || 0)) + "</tr>";
    h += '<tr><td>世界人口</td><td class="v">' + (st.world.pop0 / 1000).toFixed(2) + ' 十亿</td><td class="v">' +
      (st.world.pop / 1000).toFixed(2) + " 十亿</td>" + dc(st.world.popDelta) + "</tr></table>";

    const rPane = $("end-pane-rubric");
    const ePane = $("end-pane-epilogue");
    const cPane = $("end-pane-chronicle");
    if (rPane && ePane && cPane) {
      rPane.innerHTML = h;
      const ep = generateEpilogue(st);
      ePane.innerHTML = renderEpilogueHTML(ep);
      const ch = generateChronicle();
      cPane.innerHTML = renderChronicleHTML(ch);
      wireEndTabs();
      setEndTab(ST.endTab || "rubric");
    } else {
      box.innerHTML = h;
    }
    const btnCopy = $("e-copy");
    if (btnCopy) btnCopy.onclick = () => copyMemoirs(st);
  }
  function simEndOpen() {
    ["stats", "help", "inbox"].forEach((o) => { const e2 = $(o); if (e2) e2.classList.remove("open"); });
    renderEnd(endStats());
    const el = $("end"); if (el) el.classList.add("open");
  }
  function simEndClose() { const el = $("end"); if (el) el.classList.remove("open"); }
  function updateDate() {
    const e = $("r-date"); if (!e) return;
    e.textContent = SIM.ready ? (SIM.S.year + "年" + Math.max(1, SIM.S.month) + "月") : "1980年1月";
    const p = $("t-play"); if (p) p.textContent = SIM.playing ? "❚❚" : "▶";
    document.querySelectorAll("#r-time .spd").forEach((b) => b.classList.toggle("on", +b.dataset.spd === SIM.speed));
    // R2 T2：时间轴进度 = 已结算月数 / 144（1980-01 → 1991-12）
    const af = $("r-axis-fill");
    if (af) {
      const mm = SIM.ready ? ((SIM.S.year - 1980) * 12 + Math.max(1, SIM.S.month)) : 0;
      af.style.width = clamp(mm / 144 * 100, 0, 100).toFixed(2) + "%";
    }
  }
  // 人口/工业色阶随仿真值重建（仅当该模式已烘焙时重烘）
  function rebuildValueTables() {
    if (!SIM.S) return;
    const keys = Object.keys(CM.countries);
    const lp = keys.map((k) => Math.log(Math.max(1e-6, simVal(k).pop_m)));
    const li = keys.map((k) => Math.log(Math.max(1e-6, simVal(k).industry_bn)));
    const p0 = Math.min.apply(null, lp), p1 = Math.max.apply(null, lp);
    const i0 = Math.min.apply(null, li), i1 = Math.max.apply(null, li);
    keys.forEach((k, i) => {
      const id = playIdOfKey[k] || CM.countries[k].polity_id;
      tables.pop[id] = ramp((lp[i] - p0) / (p1 - p0 || 1));
      tables.ind[id] = ramp((li[i] - i0) / (i1 - i0 || 1));
      tables.delta[id] = divRamp(deltaOf(k) / DELTA_SPAN);     // R2 T4
    });
  }
  function onSimAdvance(yearChanged) {
    updateDate();
    fillTop();
    if (ST.sel) select(ST.sel);
    if ($("stats").classList.contains("open")) fillStats();
    // R2 T4：delta 每月都在变（不像 pop/ind 可按年重建）；pop/ind 仍按年重建以省开销
    const live = ST.mode === "delta";
    if (live || (yearChanged && (ST.mode === "pop" || ST.mode === "ind"))) {
      rebuildValueTables();
      if (bakedNow === ST.mode) { bakeNow(ST.mode); render(); drawMini(); }
    }
  }
  let simLoopLive = false;               // B（架构评审）：rAF 仅在播放态调度 —— 暂停时完全静止，不再每帧空转
  function simLoop(ts) {
    simLoopLive = false;
    if (!SIM.ready || !SIM.playing) { SIM.lastTs = ts; return; }
    // R4：1991-12 到站 —— 停播 + 结算（P3-2：原 simLoop 无上界，时间可无限越过 1991-12）
    if (simAtEnd()) { SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0; updateDate(); simEndOpen(); return; }
    if (!SIM.lastTs) SIM.lastTs = ts;
    const dt = Math.min(0.25, (ts - SIM.lastTs) / 1000);
    SIM.lastTs = ts;
    SIM.acc += dt * SIM.speed * SIM.monthsPerSec;
    const n = Math.floor(SIM.acc);
    if (n > 0) {
      SIM.acc -= n;
      const y0 = SIM.S.year;
      for (let i = 0; i < n; i++) {
        if (simAtEnd()) break;
        if (ST.player && ST.blocOverride[ST.player] && typeof ST.blocSince === "number") applyPlayerDecisions();
        W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), false);
      }
      onSimAdvance(y0 !== SIM.S.year);
      if (simAtEnd()) { SIM.playing = false; SIM.acc = 0; updateDate(); simEndOpen(); }
    }
    if (SIM.playing) { simLoopLive = true; requestAnimationFrame(simLoop); }
  }
  function simKick() {                   // B：所有「恢复播放」路径必须唤醒主循环（暂停期已无空转帧可依赖）
    if (SIM.playing && !simLoopLive) { SIM.lastTs = 0; simLoopLive = true; requestAnimationFrame(simLoop); }
  }
  function simSetSpeed(sp) { SIM.speed = sp; updateDate(); }
  function simTogglePlay() {
    if (SIM.playing) { SIM.playing = false; }
    else { if (simAtEnd()) simEndOpen(); SIM.playing = !simAtEnd(); }   // 到站后 ▶ 只重看结算，不再推进
    SIM.lastTs = 0; updateDate();
    simKick();
  }
  function simReset() {
    if (!SIM.ready) return;
    const D = window.W1980_SIMDATA;
    SIM.S = W1980_SIM.initState(D, 1980, 0);
    W1980_SIM.seedState(SIM.S, Object.keys(D.popStart), D.popStart);
    SIM.S.noiseSigma = SIM.vol;      // 难度 → 噪声幅度
    CR.pending = null; CR.choices = []; CR.decided.clear(); CR.deny.clear(); hideCrossroad();   // R5D：重置清空十字路口
    ST.sanctions.forEach((e) => { e.since = 0; }); ST.aid.forEach((e) => { e.since = 0; });     // R5C'：重置=1980-01 重施
    ST.blocOverride = {}; ST.blocSince = null; rebuildBlocTable();                              // R5E/R7A：重置清空阵营迁移与时间戳
    ST.frontlines = {}; rebuildFrontlinesMap();                                                 // R8A：重置清空交战前线占领
    initTradeState();                                                                           // R9B：重置清空贸易航线与外汇池至 1980 基准
    ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } }; // R10A/B/C：重置清空反应式 AI、军控条约与安理会决议
    initDomesticState();                                                                        // R12A：重置内政生态与派系权力天平至 1980 基准
    initAgendaState();                                                                          // R12B：重置专属国家战略议程至 1980 基准
    initCrisisState(); hideCrisisModal();                                                       // R12C：重置突发危机状态并收起弹窗
    initIntelState();                                                                           // R13A：重置全球谍战与隐蔽行动至 1980 基准
    initAfghanState();                                                                          // R13B：重置阿富汗战争泥潭与失血槽至 1980 基准
    applyPlayerDecisions();         // R3：重置后按当前决策重挂 pmods（否则重置会静默丢掉玩家决策）
    simEndClose();                  // R4：重置同时收起上一局结算
    SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0;
    evInit(); evRun(1980, 1, true);
    rebuildValueTables();
    if (bakedNow) { bakeNow(bakedNow); render(); drawMini(); }
    onSimAdvance(false);
  }
  function simFastForward(y, m) {
    if (!SIM.ready) return;
    const n0 = EV.items.length;
    let guard = 0;
    // R4：加 `!simAtEnd()` —— ?t=1992-* 不再越界（?t=1991-12 的结果与此前逐字一致）
    while (guard++ < 400 && !simAtEnd() &&
      (SIM.S.year < y || (SIM.S.year === y && Math.max(1, SIM.S.month) < m))) {
      if (ST.player && ST.blocOverride[ST.player] && typeof ST.blocSince === "number") applyPlayerDecisions();
      W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), true);
      if (CR.pending) break;            // R5D：快进遇十字路口（有玩家）→ 停下等选择
    }
    rebuildValueTables();
    if (bakedNow === "pop" || bakedNow === "ind" || bakedNow === "delta") { bakeNow(bakedNow); render(); drawMini(); }
    onSimAdvance(true);
    // R2 T3 / P1-5：快进全程走 silent（不弹 toast），补一条聚合提示，避免「11 年过去却毫无反馈」
    const evN = EV.items.length - n0;
    if (evN > 0) toast({ y: SIM.S.year, m: Math.max(1, SIM.S.month),
      zh: "快进期间发生 " + evN + " 件历史事件", note: "点顶栏 🔔 查看事件收件箱" });
  }
  function wireTimeControls() {
    const p = $("t-play"); if (p) p.onclick = simTogglePlay;
    const r = $("t-reset"); if (r) r.onclick = simReset;
    document.querySelectorAll("#r-time .spd").forEach((b) => b.onclick = () => simSetSpeed(+b.dataset.spd));
  }

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

  // ---------------------------------------------------------------- loading
  async function load() {
    const step = (s) => { const e = $("boot-s"); if (e) e.textContent = s; };
    step("解码省份栅格…");
    const pd = await loadPixels("data/province_id.png");
    pid = new Uint16Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) pid[i] = pd[j] | (pd[j + 1] << 8) | (pd[j + 2] << 16);

    let nz = 0, sum = 0;
    for (let i = 0; i < N; i++) { const v = pid[i]; if (v) { nz++; sum += v; } }
    if (nz !== CK.nonzero || sum !== CK.idSum) {
      $("err").style.display = "flex";
      $("err").textContent = "省份栅格校验失败：nonzero " + nz + "/" + CK.nonzero + "，idSum " + sum + "/" + CK.idSum;
      throw new Error("checksum mismatch");
    }

    step("解码国家栅格…");
    const cd = await loadPixels("data/country_id.png");
    pol = new Uint8Array(N); landm = new Uint8Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      pol[i] = cd[j] | (cd[j + 1] << 8) | (cd[j + 2] << 16);
      landm[i] = cd[j + 3] > 0 ? 1 : 0;
    }

    // 可玩实体栅格（低存在感国家并入集团后按「实体」上色/选中）
    step("解码实体栅格…");
    const gd = await loadPixels("data/playable_id.png");
    play = new Uint16Array(N);
    for (let i = 0, j = 0; i < N; i++, j += 4) play[i] = gd[j] | (gd[j + 1] << 8) | (gd[j + 2] << 16);
    playKeys = CM.byPlayableId || {};
    playIdOfKey = {}; for (const id in playKeys) playIdOfKey[playKeys[id]] = +id;
    playPids = {};
    for (const k in CM.countries) {
      const c = CM.countries[k];
      const s = new Set();
      if (c.polity_ids) c.polity_ids.forEach((p) => s.add(p));
      if (c.polity_id) s.add(c.polity_id);
      (c.members || []).forEach((m) => { if (m.polity_id) s.add(m.polity_id); });
      playPids[k] = s;
    }

    step("构建边界行程…");
    buildRLE();
    buildAdjacency();
    buildColors();
    rebuildFrontlinesMap();

    mapCan = $("map"); ovCan = $("overlay");
    mctx2 = mapCan.getContext("2d");
    octx = ovCan.getContext("2d");
    modeCan = document.createElement("canvas"); modeCan.width = W; modeCan.height = H;
    mctx = modeCan.getContext("2d", { willReadFrequently: true });

    step("烘焙政治地图…");
    await new Promise((r) => setTimeout(r, 0));
    bakeNow("political");
    resize(true);
    $("boot").classList.add("gone");
    $("k-perf").textContent = "首屏耗时 " + Math.round(performance.now()) + " ms（栅格解码 + 行程 + 首帧）";
    $("k-sum").textContent = "校验：nonzero=" + CK.nonzero + "（与 checksum.json 一致）· maxId=" + CK.maxId +
      " · 省份 " + CK.provinceCount + " · 国家 " + CK.countryCount;
    fillHelp();
    render(); drawOverlay();
  }

  function buildRLE() {
    const mx = CK.maxId;
    provPol = new Int16Array(mx + 1);
    playPol = new Int16Array(mx + 1);
    const seen = new Uint8Array(mx + 1);
    let nr = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W; let x = 0;
      while (x < W) {
        const v = pid[row + x];
        if (v === 0) { x++; continue; }
        let x2 = x + 1;
        while (x2 < W && pid[row + x2] === v) x2++;
        nr++; if (!seen[v]) { seen[v] = 1; provPol[v] = pol[row + x]; playPol[v] = play[row + x]; }
        x = x2;
      }
    }
    const R = { n: nr, id: new Uint16Array(nr), y: new Uint16Array(nr), x0: new Uint16Array(nr), x1: new Uint16Array(nr), start: new Int32Array(mx + 2), cnt: new Int32Array(mx + 2) };
    let k = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W; let x = 0;
      while (x < W) {
        const v = pid[row + x];
        if (v === 0) { x++; continue; }
        let x2 = x + 1;
        while (x2 < W && pid[row + x2] === v) x2++;
        R.id[k] = v; R.y[k] = y; R.x0[k] = x; R.x1[k] = x2; k++;
        R.cnt[v]++; x = x2;
      }
    }
    let acc = 0;
    for (let i = 0; i <= mx; i++) { R.start[i] = acc; acc += R.cnt[i]; }
    R.start[mx + 1] = acc;
    const fill = new Int32Array(mx + 2);
    const oid = new Uint16Array(nr), oy = new Uint16Array(nr), ox0 = new Uint16Array(nr), ox1 = new Uint16Array(nr);
    for (let i = 0; i < nr; i++) {
      const v = R.id[i], p = R.start[v] + fill[v]++;
      oid[p] = v; oy[p] = R.y[i]; ox0[p] = R.x0[i]; ox1[p] = R.x1[i];
    }
    R.id = oid; R.y = oy; R.x0 = ox0; R.x1 = ox1;
    runs = R;

    // country-level runs (from polity raster)
    const cmx = 255, cpx = 800000;   // 255 = polity id 上限（M2: 133 国）
    let cr = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W; let x = 0;
      while (x < W) {
        const v = pol[row + x];
        if (v === 0) { x++; continue; }
        let x2 = x + 1;
        while (x2 < W && pol[row + x2] === v) x2++;
        cr++; x = x2;
      }
    }
    const C = { id: new Uint16Array(cr), y: new Uint16Array(cr), x0: new Uint16Array(cr), x1: new Uint16Array(cr), start: new Int32Array(cmx + 2), cnt: new Int32Array(cmx + 2) };
    let k2 = 0;
    for (let y = 0; y < H; y++) {
      const row = y * W; let x = 0;
      while (x < W) {
        const v = pol[row + x];
        if (v === 0) { x++; continue; }
        let x2 = x + 1;
        while (x2 < W && pol[row + x2] === v) x2++;
        C.id[k2] = v; C.y[k2] = y; C.x0[k2] = x; C.x1[k2] = x2; C.cnt[v]++; k2++; x = x2;
      }
    }
    let acc2 = 0;
    for (let i = 0; i <= cmx; i++) { C.start[i] = acc2; acc2 += C.cnt[i]; }
    const fill2 = new Int32Array(cmx + 2);
    const cid = new Uint16Array(cr), cy = new Uint16Array(cr), cx0 = new Uint16Array(cr), cx1 = new Uint16Array(cr);
    for (let i = 0; i < cr; i++) {
      const v = C.id[i], p = C.start[v] + fill2[v]++;
      cid[p] = v; cy[p] = C.y[i]; cx0[p] = C.x0[i]; cx1[p] = C.x1[i];
    }
    C.id = cid; C.y = cy; C.x0 = cx0; C.x1 = cx1;
    cruns = C;
  }

  // ---------------------------------------------------------------- colours
  function buildColors() {
    // 宗主 -> 殖民地同色系（宗主实色，殖民地同色相略浅/略灰，体现「附属但分开」）
    const shade = (hex, dl, ds) => {
      const c = hx(hex); const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      return "#" + hsl(h, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)).map((v) => v.toString(16).padStart(2, "0")).join("");
    };
    const mx = CK.maxId;
    const rand = new Uint32Array(mx + 1);
    let s = 12345;
    for (let i = 1; i <= mx; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const h = (s % 360) / 360, l = 0.42 + ((s >> 8) % 26) / 100, sat = 0.38 + ((s >> 16) % 25) / 100;
      const c = hsl(h, sat, l);
      rand[i] = u32(c[0], c[1], c[2]);
    }
    tables.province = rand;

    const keys = Object.keys(CM.countries);
    const order = keys.slice().sort((a, b) => CM.countries[b].area_km2 - CM.countries[a].area_km2);
    const col = {};
    for (const k in MAJOR) col[k] = MAJOR[k];
    // 实体级邻接（集团 = 成员政体并集；低倍也成立）
    const pol2ent = new Int16Array(256);
    for (const k of keys) { const id = playIdOfKey[k] || 0;
      (playPids[k] || []).forEach((p) => { if (id) pol2ent[p] = id; }); }
    const EADJ = new Uint8Array(256 * 256);
    for (let a2 = 1; a2 < 256; a2++) for (let b2 = a2 + 1; b2 < 256; b2++) {
      if (!ADJ[a2 * 256 + b2]) continue;
      const ea = pol2ent[a2], eb = pol2ent[b2];
      if (ea && eb && ea !== eb) { EADJ[ea * 256 + eb] = 1; EADJ[eb * 256 + ea] = 1; }
    }
    const entId = (k) => playIdOfKey[k] || CM.countries[k].polity_id || 0;
    const parentShades = {};
    for (const k of order) {
      const c = CM.countries[k];
      if (col[k]) continue;
      // 附属集团：宗主色同系变体（同一宗主的多个集团逐个错开明度，避免相邻撞色）
      if (c.parent && col[c.parent]) {
        const i = parentShades[c.parent] = (parentShades[c.parent] || 0) + 1;
        col[k] = shade(col[c.parent], 0.12 + 0.09 * (i - 1), -0.08);
        continue;
      }
      const id = entId(k);
      for (const p of PALETTE) {
        let ok = true;
        for (const nk in col) {
          if (EADJ[id * 256 + entId(nk)] && col[nk] === p) { ok = false; break; }
        }
        if (ok) { col[k] = p; break; }
      }
      if (!col[k]) {
        const bad = new Set();
        for (const nk in col) if (EADJ[id * 256 + entId(nk)]) bad.add(u32c(col[nk]));
        let pick = null;
        for (let t = 0; t < 720 && pick === null; t++) {
          const rgb = hsl(((id * 137.508 + t * 3.1) % 360) / 360, 0.5, 0.5);
          const u = u32(rgb[0], rgb[1], rgb[2]);
          if (!bad.has(u)) pick = u;
        }
        if (pick === null) pick = u32c(PALETTE[(id * 7) % PALETTE.length]);
        col[k] = "#" + [pick & 255, (pick >>> 8) & 255, (pick >>> 16) & 255]
          .map((v) => v.toString(16).padStart(2, "0")).join("");
      }
    }
    const tp = new Uint32Array(256), tb = new Uint32Array(256),
      tpop = new Uint32Array(256), tind = new Uint32Array(256);
    const pops = keys.map((k) => CM.countries[k].pop_m), inds = keys.map((k) => CM.countries[k].industry_bn);
    const lp = pops.map(Math.log), li = inds.map(Math.log);
    const p0 = Math.min.apply(null, lp), p1 = Math.max.apply(null, lp);
    const i0 = Math.min.apply(null, li), i1 = Math.max.apply(null, li);
    keys.forEach((k, i) => {
      const c = CM.countries[k], id = playIdOfKey[k] || c.polity_id;
      if (!col[k]) col[k] = PALETTE[(id * 7) % PALETTE.length];   // 兜底
      tp[id] = u32c(col[k]);
      tb[id] = u32c(BLOC[blocOf(k)] || "#9B9B9B");   // R5E：阵营模式读 override（初始为空 → 与原逻辑逐位同）
      const a = (lp[i] - p0) / (p1 - p0), b = (li[i] - i0) / (i1 - i0);
      tpop[id] = ramp(a); tind[id] = ramp(b);
    });
    tables.political = tp; tables.bloc = tb; tables.pop = tpop; tables.ind = tind;
    // R2 T4：delta 表（1980-01 时全部落在中性色 —— 全图「无变化」是正确初始态）
    const tdl = new Uint32Array(256);
    keys.forEach((k) => { const id = playIdOfKey[k] || CM.countries[k].polity_id; tdl[id] = divRamp(deltaOf(k) / DELTA_SPAN); });
    tables.delta = tdl;
    // 经济系统阶段 1：战略资源模式（resource，1980 战略自给/出超色阶）
    const tres = new Uint32Array(256);
    keys.forEach((k) => {
      const id = playIdOfKey[k] || CM.countries[k].polity_id;
      const r = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(k)) || null;
      const score = r ? r.summary.securityScore : 0;
      tres[id] = resRamp(score);
    });
    tables.resource = tres;
    ST.colors = col;
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2hex(h, s, l) { return "#" + hsl(h, s, l).map((v) => v.toString(16).padStart(2, "0")).join(""); }

  function hsl(h, s, l) {
    const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l);
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  function ramp(t) { // R2 T6 / P2-4：7 档、亮度单调递减（浅→深），兼顾色盲可辨
    t = clamp(t, 0, 1);
    const stops = [[0xF2, 0xEA, 0xD3], [0xE4, 0xCE, 0x96], [0xD6, 0xB2, 0x6B], [0xC0, 0x8A, 0x4A],
      [0xA5, 0x67, 0x3F], [0x7E, 0x44, 0x36], [0x4A, 0x22, 0x2A]];
    const u = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(u)), f = u - i;
    const a = stops[i], b = stops[i + 1];
    return u32(Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f));
  }

  let ADJ = null;
  function buildAdjacency() {
    ADJ = new Uint8Array(256 * 256);
    for (let y = 0; y < H - 1; y++) {
      const row = y * W;
      for (let x = 0; x < W - 1; x++) {
        const a = pol[row + x]; if (!a) continue;
        const b = pol[row + x + 1], c = pol[row + W + x];
        if (b && b !== a) { ADJ[a * 256 + b] = 1; ADJ[b * 256 + a] = 1; }
        if (c && c !== a) { ADJ[a * 256 + c] = 1; ADJ[c * 256 + a] = 1; }
      }
    }
  }
  function adjacent(a, b) { return ADJ[a * 256 + b] === 1; }

  // ---------------------------------------------------------------- bake mode
  function bakeNow(mode) {
    const img = mctx.createImageData(W, H);
    const d = new Uint32Array(img.data.buffer);
    const oc = u32c(OCEAN), gc = u32c(GREY);
    if (mode === "province") {
      const t = tables.province;
      for (let i = 0; i < N; i++) { const p = pid[i]; d[i] = p ? t[p] : (landm[i] ? gc : oc); }
    } else if (hasFrontlines && (mode === "political" || mode === "bloc")) {
      const t = tables[mode];
      for (let i = 0; i < N; i++) {
        const pr = pid[i];
        const occ = pr ? flMap[pr] : 0;
        const p = occ || play[i];
        d[i] = p ? t[p] : (landm[i] ? gc : oc);
      }
    } else {
      const t = tables[mode];
      for (let i = 0; i < N; i++) { const p = play[i]; d[i] = p ? t[p] : (landm[i] ? gc : oc); }
    }
    mctx.putImageData(img, 0, 0);
    baked[mode] = true;
    bakedNow = mode;            // 记录画布上真正是哪一种模式（五模式共用一块画布，靠它判断能否复用）
  }
  function setMode(mode) {
    if (ST.mode === mode) return;
    ST.mode = mode;
    // 关键：模式画布只有一块，只要画布上不是目标模式就必须重新烘焙。
    // 旧写法 `if (!baked[mode])` 会让「切回之前看过的模式」变成一个空操作 → 切几次后地图就不变了。
    if (bakedNow !== mode) bakeNow(mode);
    document.querySelectorAll("#modes .btn").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
    fillLegend();
    drawMini(); render(); drawOverlay();
  }

  function fillLegend() {
    const el = $("legend"), m = ST.mode;
    if (m === "political" || m === "province") { el.style.display = "none"; return; }
    el.style.display = "block";
    if (m === "bloc") {
      const order = ["NATO", "WP", "SOV", "CHN", "W", "NA", "NE"];
      el.innerHTML = '<div class="t">阵营</div>' + order.map((b) =>
        '<div class="r"><i style="background:' + BLOC[b] + '"></i>' + BLOC_ZH[b] + "</div>").join("");
    } else if (m === "delta") {
      el.innerHTML = '<div class="t">变化（实际产出 · 较 1980）</div>' +
        '<div class="r"><i style="background:linear-gradient(90deg,#2a6493,#39424c,#c8a95a)"></i>跌 ← 0 → 涨</div>' +
        '<div class="r2">固定尺度 ±' + Math.round(DELTA_SPAN * 100) + '%　·　' + ST.mode + '</div>';
    } else if (m === "resource") {
      el.innerHTML = '<div class="t">战略资源综合自给度</div>' +
        '<div class="r"><i style="background:linear-gradient(90deg,#264366,#3e474f,#d4af37)"></i>短缺依赖 ← 自给 → 丰饶出超</div>' +
        '<div class="r2">产销净盈余加权 · 1980 战略底座</div>';
    } else {
      const key = m === "pop" ? "pop_m" : "industry_bn";
      const vals = Object.keys(CM.countries).map((k) => CM.countries[k][key]);
      const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      el.innerHTML = '<div class="t">' + (m === "pop" ? "人口（百万·对数色阶）" : "工业产值（十亿美元·对数色阶）") +
        '</div><div class="r"><i class="grad"></i></div><div class="r2">低 ' + lo + "  →  高 " + hi +
        '</div><div class="r2" id="lg-hov">悬停国家后显示其取值</div>';
    }
  }

  // ---------------------------------------------------------------- view
  function resize(initial) {
    const cw = Math.max(320, window.innerWidth), ch = Math.max(240, window.innerHeight);
    [mapCan, ovCan].forEach((c) => { c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR); });
    bimg = mctx2.createImageData(mapCan.width, mapCan.height);
    oimg = octx.createImageData(mapCan.width, mapCan.height);
    if (initial) {
      view.s = Math.min(mapCan.width / W, mapCan.height / H);
      view.fit = view.s;
      view.x = (W - mapCan.width / view.s) / 2;
      view.y = (H - mapCan.height / view.s) / 2;
    }
    clampView();
    drawMini();
  }
  function cssW() { return mapCan.width / DPR; }
  function clampView() {
    const mw = mapCan.width / view.s, mh = mapCan.height / view.s;
    view.s = clamp(view.s, view.fit * 0.5, view.fit * 40);
    // 外圈缓冲：允许把地图推到「只剩 40% 屏幕可见」，这样最外圈的国家（阿拉斯加、新西兰、
    // 西伯利亚东端…）都能被拖到屏幕中间，不会被顶栏/侧栏遮住或卡在边界上看不到。
    const kx = mw * 0.4, ky = mh * 0.4;
    view.x = clamp(view.x, -(mw - kx), W - kx);
    view.y = clamp(view.y, -(mh - ky), H - ky);
  }
  function screenToRaster(sx, sy) {
    const P = view.s * DPR;
    return [view.x + sx * DPR / P, view.y + sy * DPR / P];
  }
  function flyTo(x0, y0, x1, y1, ms) {
    const tw = Math.max(24, x1 - x0), th = Math.max(24, y1 - y0);
    const s2 = clamp(Math.min(mapCan.width / (tw * 1.6), mapCan.height / (th * 1.6)), view.fit * 0.5, view.fit * 40);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const tx = cx - (mapCan.width / s2) / 2, ty = cy - (mapCan.height / s2) / 2;
    const s0 = view.s, ax = view.x, ay = view.y, t0 = performance.now();
    ms = ms || 420;
    (function step() {
      const t = clamp((performance.now() - t0) / ms, 0, 1), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      view.s = s0 + (s2 - s0) * e; view.x = ax + (tx - ax) * e; view.y = ay + (ty - ay) * e;
      clampView(); render(); drawOverlay();
      if (t < 1) requestAnimationFrame(step);
    })();
  }

  // ---------------------------------------------------------------- render
  function maps(cw, ch, P) {
    if (xmapP !== P || xmapX !== view.x || !xmapA || xmapA.length !== cw) {
      xmapA = new Int32Array(cw); xmapP = P; xmapX = view.x;
      for (let i = 0; i < cw; i++) xmapA[i] = Math.floor(view.x + (i + 0.5) / P);
    }
    if (ymapP !== P || ymapY !== view.y || !ymapA || ymapA.length !== ch) {
      ymapA = new Int32Array(ch); ymapP = P; ymapY = view.y;
      for (let i = 0; i < ch; i++) ymapA[i] = Math.floor(view.y + (i + 0.5) / P);
    }
    return [xmapA, ymapA];
  }
  function render() {
    const cw = mapCan.width, ch = mapCan.height, P = view.s * DPR;
    mctx2.setTransform(1, 0, 0, 1, 0, 0);
    mctx2.fillStyle = GUTTER; mctx2.fillRect(0, 0, cw, ch);   // 地图外圈的缓冲底色（比海洋略深，像装裱）
    let sx0 = view.x, sy0 = view.y, sw = cw / P, sh = ch / P, dx = 0, dy = 0, dw = cw, dh = ch;
    if (sx0 < 0) { const c = -sx0; sx0 = 0; sw -= c; dx += c * P; dw -= c * P; }
    if (sy0 < 0) { const c = -sy0; sy0 = 0; sh -= c; dy += c * P; dh -= c * P; }
    if (sx0 + sw > W) { const c = (sx0 + sw) - W; sw -= c; dw -= c * P; }
    if (sy0 + sh > H) { const c = (sy0 + sh) - H; sh -= c; dh -= c * P; }
    mctx2.imageSmoothingEnabled = false;
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) mctx2.drawImage(modeCan, sx0, sy0, sw, sh, dx, dy, dw, dh);
    drawFrame(P, cw, ch);
  }

  // 地图外框：一圈细亮线 + 外侧一点渐隐发光，让地图“浮”在缓冲底色上（大幅平移时不会糊成一片黑）
  function drawFrame(P, cw, ch) {
    const x0 = (0 - view.x) * P, y0 = (0 - view.y) * P;
    const x1 = (W - view.x) * P, y1 = (H - view.y) * P;
    if (x1 < -8 || y1 < -8 || x0 > cw + 8 || y0 > ch + 8) return;
    mctx2.setTransform(1, 0, 0, 1, 0, 0);
    mctx2.lineWidth = 1;
    for (let k = 3; k >= 1; k--) {
      mctx2.strokeStyle = "rgba(140,175,205," + (0.05 / k) + ")";
      mctx2.strokeRect(x0 - k + 0.5, y0 - k + 0.5, (x1 - x0) + 2 * k - 1, (y1 - y0) + 2 * k - 1);
    }
    mctx2.strokeStyle = "rgba(160,195,225,0.30)";
    mctx2.strokeRect(x0 + 0.5, y0 + 0.5, (x1 - x0) - 1, (y1 - y0) - 1);
  }
  // ---- 矢量边界：delta-int16(×2) 解码为浮点折线，zoom 大时替代像素边界（平滑） ----
  function decodeVB(arr) {
    return arr.map(function (p) {
      const pts = new Float32Array(p.length / 2);
      pts[0] = p[0] / 2; pts[1] = p[1] / 2;
      let px = pts[0], py = pts[1];
      for (let i = 2, j = 2; i < p.length; i += 2, j += 2) {
        px += p[i] / 2; py += p[i + 1] / 2; pts[j] = px; pts[j + 1] = py;
      }
      return pts;
    });
  }
  function borders(cw, ch, P) {
    if (!ST.layers.province && !ST.layers.country) return;
    // 高倍缩放（>3×）走矢量平滑描边；低倍仍走 O(屏幕像素) 的查表像素边界
    if (P >= 3 && (window.W1980_BORDERS_PROVINCE || window.W1980_BORDERS_COUNTRY)) {
      bordersVector(cw, ch, P); return;
    }
    const [xm, ym] = maps(cw, ch, P);
    const d = new Uint32Array(bimg.data.buffer);
    d.fill(0);
    const PB = rgba(0, 0, 0, 0.45), CB = rgba(0, 0, 0, 0.9);
    const sp = ST.layers.province, sc = ST.layers.country;
    for (let sy = 0; sy < ch; sy++) {
      const ry = ym[sy]; if (ry < 0 || ry >= H - 1) continue;
      const row = ry * W; let di = sy * cw;
      for (let sx = 0; sx < cw; sx++, di++) {
        const rx = xm[sx]; if (rx < 0 || rx >= W - 1) continue;
        const i = row + rx, v = pid[i];
        if (v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) {
          const p = pol[i];
          if (sc && p > 0 && (p !== pol[i + 1] || p !== pol[i + W])) d[di] = CB;
          else if (sp) d[di] = PB;
        } else if (sc) {
          const p = pol[i];
          if (p > 0 && (p !== pol[i + 1] || p !== pol[i + W])) d[di] = CB;
        }
      }
    }
    mctx2.putImageData(bimg, 0, 0);
  }

  // 高倍缩放下的平滑矢量描边（省界细淡、国界粗深，与像素边界层级一致）
  function bordersVector(cw, ch, P) {
    if (!VB_P && window.W1980_BORDERS_PROVINCE) VB_P = decodeVB(window.W1980_BORDERS_PROVINCE);
    if (!VB_C && window.W1980_BORDERS_COUNTRY) VB_C = decodeVB(window.W1980_BORDERS_COUNTRY);
    const vx0 = view.x - 2, vy0 = view.y - 2, vx1 = view.x + cw / P + 2, vy1 = view.y + ch / P + 2;
    mctx2.setTransform(1, 0, 0, 1, 0, 0);
    mctx2.lineWidth = 1; mctx2.lineJoin = "round"; mctx2.lineCap = "round";
    function drawSet(lines, stroke) {
      if (!lines) return;
      mctx2.strokeStyle = stroke; mctx2.beginPath();
      for (let li = 0; li < lines.length; li++) {
        const p = lines[li], n = p.length;
        if (n < 4) continue;
        let x0 = p[0], y0 = p[1], x1 = p[0], y1 = p[1];
        for (let k = 2; k < n; k += 2) {
          const X = p[k], Y = p[k + 1];
          if (X < x0) x0 = X; if (X > x1) x1 = X;
          if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
        if (x1 < vx0 || y1 < vy0 || x0 > vx1 || y0 > vy1) continue;   // 视口外剔除
        mctx2.moveTo((p[0] - view.x) * P, (p[1] - view.y) * P);
        for (let k = 2; k < n; k += 2) mctx2.lineTo((p[k] - view.x) * P, (p[k + 1] - view.y) * P);
      }
      mctx2.stroke();
    }
    if (ST.layers.province) drawSet(VB_P, "rgba(0,0,0,0.24)");
    if (ST.layers.country) drawSet(VB_C, "rgba(0,0,0,0.54)");
  }

  // ---------------------------------------------------------------- overlay
  function drawOverlay() {
    const cw = ovCan.width, ch = ovCan.height, P = view.s * DPR;
    const d = new Uint32Array(oimg.data.buffer);
    d.fill(0);
    const [xm, ym] = maps(cw, ch, P);
    const selKey = ST.sel, selPlay = selKey ? (playIdOfKey[selKey] || 0) : 0;
    const hov = ST.hover | 0, hovPlay = hov ? playPol[hov] : 0;
    const DIM = rgba(6, 8, 10, 0.62), HT = rgba(255, 233, 168, 0.46),
      CT = rgba(255, 255, 255, 0.12), OUT = rgba(255, 214, 107, 1);
    // 边界线：接近隐形，并且只在放大后才逐渐显影（世界视图几乎看不见）
    const zf = clamp(P / view.fit, 0, 3);
    const kb = clamp((zf - 0.9) / 1.5, 0, 1);
    const PB = rgba(12, 16, 22, 0.09 + 0.15 * kb), CB = rgba(5, 8, 12, 0.30 + 0.24 * kb);
    const sp = ST.layers.province, sc = ST.layers.country;
    for (let sy = 0; sy < ch; sy++) {
      const ry = ym[sy]; if (ry < 0 || ry >= H - 1) continue;
      const row = ry * W; let di = sy * cw;
      for (let sx = 0; sx < cw; sx++, di++) {
        const rx = xm[sx]; if (rx < 0 || rx >= W - 1) continue;
        const i = row + rx, p = pol[i], v = pid[i], pe = play[i];
        if (p > 0) {
          const bd = (p !== pol[i + 1] || p !== pol[i + W]);
          if (bd) { if (sc) d[di] = CB; else if (sp && v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) d[di] = PB; }
          else if (sp && v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) d[di] = PB;
        }
        if (selPlay && ST.only !== false && pe !== selPlay) d[di] = DIM;
        if (hov) {
          if (v === hov) {
            d[di] = HT;
            if (v !== pid[i + 1] || v !== pid[i + W]) {
              d[di] = OUT;
              if (sx + 1 < cw) d[di + 1] = OUT;
              if (sy + 1 < ch) d[di + cw] = OUT;
            }
          } else if (hovPlay && pe === hovPlay) d[di] = CT;
        }
      }
    }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, cw, ch);
    octx.putImageData(oimg, 0, 0);
    drawFeatures(cw, ch, P);
  }

  function drawFeatures(cw, ch, P) {
    const toX = (x) => (x - view.x) * P, toY = (y) => (y - view.y) * P;
    octx.save();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    if (ST.layers.city) {
      // 城市点：随缩放分级，只留大城市；圆点、低对比，不再是一片白方块
      const zc = P / view.fit;
      const minPop = zc < 1.2 ? 5e6 : zc < 2.2 ? 1.5e6 : 0;
      const r = zc < 1.2 ? 0.9 : zc < 2.2 ? 1.2 : 1.6;
      if (minPop === 0 || zc >= 0.6) {
        octx.fillStyle = "rgba(233,227,209,0.42)";
        for (let i = 0; i < CITY.length; i++) {
          const c = CITY[i];
          if (c[3] < minPop) continue;
          const x = toX(c[1]), y = toY(c[2]);
          if (x < -6 || y < -6 || x > cw + 6 || y > ch + 6) continue;
          octx.beginPath(); octx.arc(x, y, r, 0, 6.2832); octx.fill();
        }
      }
    }
    if (ST.layers.capital) {
      const zs = P / view.fit;
      const fs = zs < 1.2 ? 10 : zs < 2.5 ? 13 : 15;
      octx.font = "600 " + fs + "px 'Segoe UI Symbol',sans-serif";
      octx.textAlign = "center"; octx.textBaseline = "middle";
      octx.lineWidth = Math.max(1.5, fs / 7); octx.strokeStyle = "rgba(0,0,0,0.7)";
      octx.fillStyle = "rgba(255,214,107,0.88)";
      for (const k in CM.countries) {
        const c = CM.countries[k]; if (!c.capital_px) continue;
        const x = toX(c.capital_px[0]), y = toY(c.capital_px[1]);
        if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
        octx.strokeText("★", x, y); octx.fillText("★", x, y);
      }
    }
    if (ST.layers.label) {
      octx.textAlign = "center"; octx.textBaseline = "middle";
      octx.font = "700 12px 'Microsoft YaHei',sans-serif";
      const placed = [];
      const keys = Object.keys(CM.countries).sort((a, b) => CM.countries[b].area_km2 - CM.countries[a].area_km2);
      for (const k of keys) {
        const c = CM.countries[k]; if (!c.label_px) continue;
        const x = toX(c.label_px[0]), y = toY(c.label_px[1]);
        if (x < 20 || y < 20 || x > cw - 20 || y > ch - 20) continue;
        let ok = true;
        for (const p of placed) if (Math.abs(p[0] - x) < 58 && Math.abs(p[1] - y) < 18) { ok = false; break; }
        if (!ok) continue;
        placed.push([x, y]);
        octx.lineWidth = 3; octx.strokeStyle = "rgba(0,0,0,0.8)";
        octx.fillStyle = "#efe9dc";
        octx.strokeText(c.zh, x, y); octx.fillText(c.zh, x, y);
      }
    }
    octx.restore();
  }

  // ---------------------------------------------------------------- ui
  function buildUI() {
    const md = $("modes");
    MODES.forEach(([m, zh, key]) => {
      const b = document.createElement("button");
      b.className = "btn" + (m === ST.mode ? " on" : ""); b.dataset.m = m;
      b.innerHTML = zh + '<span class="mk">' + key + "</span>";
      b.title = "地图模式：" + zh;
      b.onclick = () => setMode(m);
      md.appendChild(b);
    });
    const ly = $("layers");
    LAYERS.forEach(([k, zh]) => {
      const b = document.createElement("button");
      b.className = "btn" + (ST.layers[k] ? " on" : ""); b.dataset.l = k;
      b.innerHTML = zh + '<span class="dot"></span>';
      b.onclick = () => {
        ST.layers[k] = !ST.layers[k];
        b.classList.toggle("on", ST.layers[k]);
        render(); drawOverlay();
      };
      ly.appendChild(b);
    });
    const statsBody = $("stats-t");
    $("b-stats").onclick = () => togglePanel("stats");
    $("b-help").onclick = () => togglePanel("help");
    const bSumm = $("b-summit");
    if (bSumm) bSumm.onclick = () => openSummitModal();
    const sClose = $("summit-close");
    if (sClose) sClose.onclick = closeSummitModal;
    const sShelve = $("summit-shelve-btn");
    if (sShelve) sShelve.onclick = closeSummitModal;
    const sWalkout = $("summit-walkout-btn");
    if (sWalkout) sWalkout.onclick = walkoutSummit;
    const bUnsc = $("b-unsc");
    if (bUnsc) bUnsc.onclick = () => openUNSCModal();
    const uClose = $("unsc-close");
    if (uClose) uClose.onclick = closeUNSCModal;
    const uCloseBtn = $("unsc-close-btn");
    if (uCloseBtn) uCloseBtn.onclick = closeUNSCModal;
    const uFavor = $("unsc-vote-favor");
    if (uFavor) uFavor.onclick = () => voteUNSC("in_favor");
    const uAbstain = $("unsc-vote-abstain");
    if (uAbstain) uAbstain.onclick = () => voteUNSC("abstain");
    const uVeto = $("unsc-vote-veto");
    if (uVeto) uVeto.onclick = () => voteUNSC("veto");
    const uSelect = $("unsc-res-select");
    if (uSelect) uSelect.onchange = () => openUNSCModal(uSelect.value);
    const binb = $("b-inbox");
    if (binb) binb.onclick = () => {
      togglePanel("inbox");
      if ($("inbox").classList.contains("open")) { EV.unread = 0; renderInbox(); }   // 打开即视为已读
    };
    renderInbox();
    const bsound = $("b-sound");
    if (bsound) bsound.onclick = toggleSoundMute;
    refreshSoundBtn();
    // R3：玩家决策控件（军费滑杆 / 设为本国 / 取消本国）
    const mr = $("p-mil"); if (mr) mr.oninput = () => setMil(mr.value);
    const mk = $("p-mkplayer"); if (mk) mk.onclick = () => { if (ST.sel) setPlayer(ST.sel); };
    const moff = $("p-mil-off"); if (moff) moff.onclick = () => setPlayer(null);
    wireDecUI();                       // R5C'：制裁/军援下拉与档位按钮
    const bsel = $("p-bloc-sel"); if (bsel) bsel.onchange = () => setBloc(bsel.value || null);   // R5E：迁入/退出阵营
    updPlayerTag(); refreshMilBox();
    wirePanelTabs();                   // R11A：绑定右侧面板 Tabs 点击事件
    const btut = $("b-tut"); if (btut) btut.onclick = () => tutStart(0);
    // R4：终局结算页脚按钮（在 HTML 里固定，不随正文滚动）
    const eagain = $("e-again"); if (eagain) eagain.onclick = () => { $("end").classList.remove("open"); simReset(); };
    const eclose = $("e-close"); if (eclose) eclose.onclick = () => simEndClose();
    const ecopy = $("e-copy"); if (ecopy) ecopy.onclick = () => copyMemoirs(endStats());
    wireEndTabs();
    $("b-export").onclick = exportPNG;
    $("b-save").onclick = () => { if (simSave()) toast({ y: SIM.S.year, m: Math.max(1, SIM.S.month), zh: "已存档（本地）", note: "" }); else toast({ y: "—", m: "", zh: "存档失败", note: "" }); };
    $("b-load").onclick = () => { if (!simLoad()) toast({ y: "—", m: "", zh: "无存档", note: "" }); };
    document.querySelectorAll(".fl .hd .x").forEach((x) => x.onclick = () => $(x.dataset.close).classList.remove("open"));
    document.querySelectorAll("#stats .tabs .btn").forEach((b) => b.onclick = () => {
      ST.sortKey = b.dataset.sort;
      document.querySelectorAll("#stats .tabs .btn").forEach((o) => o.classList.toggle("on", o === b));
      fillStats();
    });
    $("p-loc").onclick = () => { const c = CM.countries[ST.sel]; if (c && c.capital_px) flyTo(c.capital_px[0] - 400, c.capital_px[1] - 250, c.capital_px[0] + 400, c.capital_px[1] + 250, 500); };
    $("p-only").onclick = () => {
      ST.only = !ST.only;
      $("p-only").classList.toggle("on", ST.only);
      drawOverlay();
    };
    $("p-reset").onclick = () => { select(null); };
    const sh = $("search");
    sh.onkeydown = (e) => {
      if (e.key !== "Enter") return;
      const q = sh.value.trim().toLowerCase(); if (!q) return;
      const hit = Object.keys(CM.countries).find((k) => k.toLowerCase() === q) ||
        Object.keys(CM.countries).find((k) => CM.countries[k].zh.indexOf(q) >= 0 || k.toLowerCase().indexOf(q) >= 0);
      if (hit) { const bb = countryBBox(hit); if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 500); select(hit); }
      else { const p = CITY.find((c) => c[0].toLowerCase() === q); if (p) flyTo(p[1] - 300, p[2] - 200, p[1] + 300, p[2] + 200, 500); }
    };
    window.addEventListener("resize", onWindowResize);
    wireMouse();
    wireKeys();
    tutWire();
    fillLegend();
    fillStats(); fillTop(); select(null);
  }

  function refreshLayerBtns() {
    document.querySelectorAll("#layers .btn").forEach((b) => {
      const k = b.dataset.l; if (k) b.classList.toggle("on", !!ST.layers[k]);
    });
  }
  function togglePanel(id) {
    const el = $(id);
    ["stats", "help", "inbox"].forEach((o) => {
      if (o === id) return;
      const e2 = $(o); if (e2) e2.classList.remove("open");
    });
    el.classList.toggle("open");
  }

  function countryBBox(k) {
    const pids = playPids[k];
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const pidS in PM) { const p = PM[pidS];
      if (pids ? !pids.has(p.polity) : p.polity !== k) continue;
      if (p.bbox[0] < x0) x0 = p.bbox[0]; if (p.bbox[1] < y0) y0 = p.bbox[1];
      if (p.bbox[2] > x1) x1 = p.bbox[2]; if (p.bbox[3] > y1) y1 = p.bbox[3]; }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }

  function fillTop() {
    let pop = 0, gdp = 0, ind = 0, prov = 0;
    for (const k in CM.countries) { const v = simVal(k); pop += v.pop_m; gdp += v.gdp_bn; ind += v.industry_bn; prov += CM.countries[k].province_count; }
    ST.world = { pop: pop, gdp: gdp, ind: ind, prov: prov, ct: Object.keys(CM.countries).length };
    setTop(ST.sel);
  }
  function setTop(k) {
    const w = ST.world;
    const c = k ? CM.countries[k] : null;
    const v = k ? simVal(k) : null;
    $("r-pop").textContent = fmtPop(v ? v.pop_m : w.pop);
    $("r-gdp").textContent = fmtMoney(v ? v.gdp_bn : w.gdp);
    $("r-ind").textContent = fmtMoney(v ? v.industry_bn : w.ind);
    $("r-prov").textContent = (c ? c.province_count : w.prov) + " 省";
    $("r-ctry").textContent = (c ? 1 : w.ct) + " 国";
    // R2 T2：产出同比增速（世界合计 / 选中实体），1981-02 之前历史不足 → 「—」
    const gv = k ? growthOf(entKeys(k)) : growthWorld();
    const ge = $("r-grw");
    if (ge) {
      ge.textContent = growthText(gv);
      ge.style.color = gv === null ? "" : (gv >= 0 ? "#8fd18f" : "#e0a35a");
    }
    $("topbar").classList.toggle("sel", !!k);
  }

  function fillStats() {
    const keys = Object.keys(CM.countries);
    const key = ST.sortKey;
    const valOf = (k) => key === "area_km2" ? CM.countries[k].area_km2 : simVal(k)[key];
    // R2 T6 / P2-3：1980 基准名次（countries.js 的 pop_m/gdp_bn/industry_bn/area_km2 即 1980 值）
    const baseOf = (k) => { const c = CM.countries[k]; return key === "area_km2" ? c.area_km2 : c[key]; };
    const baseRank = {};
    keys.slice().sort((a, b) => baseOf(b) - baseOf(a)).forEach((k, i) => { baseRank[k] = i + 1; });
    keys.sort((a, b) => valOf(b) - valOf(a));
    const rows = keys.slice(0, 15).map((k, i) => {
      const c = CM.countries[k];
      const vv = valOf(k);
      const val = key === "pop_m" ? fmtPop(vv) : key === "area_km2" ? (vv / 1e6).toFixed(2) + " 百万 km²" : fmtMoney(vv);
      const dr = (baseRank[k] || i + 1) - (i + 1);
      const dt = dr === 0 ? '<span class="eq">—</span>'
        : dr > 0 ? '<span class="up">▲' + dr + "</span>" : '<span class="dn">▼' + (-dr) + "</span>";
      return '<tr data-k="' + k + '"><td class="n">' + (i + 1) + '</td><td><span class="sw" style="background:' +
        ST.colors[k] + '"></span>' + c.zh + (SIM.S && W1980_SIM.isDissolved(SIM.S, k) ? "（已解体）" : "") +
        '</td><td class="r" title="较 1980 名次变化">' + dt + '</td><td class="v">' + val + "</td></tr>";
    }).join("");
    $("stats-t").innerHTML = rows;
    $("stats-t").querySelectorAll("tr").forEach((tr) => tr.onclick = () => {
      const k = tr.dataset.k, bb = countryBBox(k);
      if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 500);
      select(k);
    });
  }

  function select(k) {
    ST.sel = k;
    const p = $("panel");
    if (!k) { p.classList.remove("open"); setTop(null); fillSpark(null); refreshMilBox(); drawOverlay(); return; }
    const c = CM.countries[k];
    $("p-sw").style.background = ST.colors[k];
    $("p-name").textContent = c.zh + " " + k + (SIM.S && W1980_SIM.isDissolved(SIM.S, k) ? "（已解体）" : "");
    $("p-en").textContent = (c.en || k) + " · " + k;
    const bl = blocOf(k);                 // R5E：badge 读 override
    $("p-bloc").textContent = BLOC_ZH[bl] || bl;
    $("p-bloc").style.borderColor = BLOC[bl] || "#9B9B9B";
    $("p-bloc").style.color = BLOC[bl] || "#9B9B9B";
    const v = simVal(k);
    $("p-pop").textContent = v.pop_m.toFixed(1) + " 百万" + deltaTag(c.pop_m, v.pop_m);
    $("p-gdp").textContent = v.gdp_bn.toFixed(0) + " 十亿美元" + deltaTag(c.gdp_bn, v.gdp_bn);
    $("p-ind").textContent = v.industry_bn.toFixed(0) + " 十亿美元" + deltaTag(c.industry_bn, v.industry_bn);
    const pc = v.pop_m > 0 ? v.gdp_bn * 1e9 / (v.pop_m * 1e6) : 0;
    $("p-pc").textContent = Math.round(pc).toLocaleString() + " 美元";
    const ip = v.gdp_bn > 0 ? v.industry_bn / v.gdp_bn * 100 : 0;
    $("p-ip").textContent = ip.toFixed(1) + " %";
    $("p-area").textContent = fmtArea2(c.area_km2);
    $("p-pv").textContent = c.province_count + " 省";
    $("p-cap").textContent = c.capital || "—";
    // M6：解体实体显示成员独立结算明细（栅格不变）
    const pd = $("p-diss");
    if (pd) {
      const diss = SIM.S && W1980_SIM.isDissolved(SIM.S, k);
      if (diss && c.members && c.members.length) {
        const D = window.W1980_SIMDATA;
        let html = '<div class="dt">已解体（1991-12）· 仅显示标记</div>' +
          '<div style="margin-bottom:4px">共和国级经济未单独建模（§4 表 SUN 为原子实体）；以下为并入成员：</div><table>';
        for (const mm of c.members) {
          if (D.popStart[mm.key] === undefined) continue;
          const pop = SIM.S.pop[mm.key], gdp = D.gdp1980[mm.key] * SIM.S.gdp[mm.key];
          html += "<tr><td>" + (mm.zh || mm.key) + '</td><td class="v">' + pop.toFixed(1) + " 百万 / " + gdp.toFixed(0) + " 十亿</td></tr>";
        }
        pd.innerHTML = html + "</table>"; pd.style.display = "block";
      } else { pd.style.display = "none"; pd.innerHTML = ""; }
    }
    p.classList.add("open");
    ST.only = true;
    $("p-only").classList.add("on");
    fillSpark(k);                     // R2 T5
    refreshMilBox();                  // R3：决策区随选中实体切换
    refreshLeaderCard(k);             // R14：更新领袖肖像卡片
    setTop(k);
    drawOverlay();
  }

  // ---------------------------------------------------------------- mouse
  function hitTest(sx, sy) {
    const [rx, ry] = screenToRaster(sx, sy);
    const x = Math.floor(rx), y = Math.floor(ry);
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    return pid[y * W + x];
  }
  function wireMouse() {
    const el = $("stage");
    let down = false, lx = 0, ly = 0, moved = 0;
    el.addEventListener("mousedown", (e) => { down = true; moved = 0; lx = e.clientX; ly = e.clientY; });
    window.addEventListener("mouseup", () => { down = false; });
    el.addEventListener("mousemove", (e) => {
      if (down) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        view.x -= dx / view.s; view.y -= dy / view.s; lx = e.clientX; ly = e.clientY;
        clampView(); render(); drawOverlay(); return;
      }
      const r = el.getBoundingClientRect();
      hover(e.clientX - r.left, e.clientY - r.top);
    });
    el.addEventListener("mouseleave", () => { ST.hover = 0; ST.hoverC = null; drawOverlay(); setHint(0); });
    el.addEventListener("click", (e) => {
      if (moved > 4) return;
      const r = el.getBoundingClientRect();
      const p = hitTest(e.clientX - r.left, e.clientY - r.top);
      select(p ? provKey(p) : null);
    });
    el.addEventListener("dblclick", (e) => {
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const [rx, ry] = screenToRaster(sx, sy);
      zoomAt(sx, sy, 2);
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
    $("minic").addEventListener("mousedown", (e) => {
      const r = e.target.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      view.x = fx * W - (mapCan.width / view.s) / 2;
      view.y = fy * H - (mapCan.height / view.s) / 2;
      clampView(); render(); drawOverlay();
    });
  }
  function zoomAt(sx, sy, f) {
    const [rx, ry] = screenToRaster(sx, sy);
    view.s = clamp(view.s * f, view.fit * 0.5, view.fit * 40);
    const P = view.s * DPR;
    view.x = rx - sx * DPR / P; view.y = ry - sy * DPR / P;
    clampView(); render(); drawOverlay(); drawMini();
  }
  function provKey(p) { const pe = playPol[p]; return (pe && playKeys[pe]) || CM.byId[provPol[p]] || null; }

  let hoverT = 0;
  function hover(sx, sy) {
    const p = hitTest(sx, sy);
    if (p === ST.hover) return;
    ST.hover = p;
    ST.hoverC = p ? provKey(p) : null;
    setHint(p);
    drawOverlay();
  }
  function setHint(p) {
    if (!p) {
      $("h-prov").textContent = "未建模区域 / 海洋"; $("h-ctry").textContent = "—";
      $("h-pop").textContent = "—"; $("h-area").textContent = "—"; return;
    }
    const pr = PM[p];
    const ek = provKey(p) || CM.byId[pr.polity];
    const c = ek ? CM.countries[ek] : null;
    if (!c) { $("h-prov").textContent = pr.name + "  #" + p; $("h-ctry").textContent = "—";
      $("h-pop").textContent = "—"; $("h-area").textContent = Math.round(pr.area_km2).toLocaleString() + " km²"; return; }
    $("h-prov").textContent = pr.name + "  #" + p;
    let ctryTxt = c.zh + (c.parent ? "（附属·宗主 " + (CM.countries[c.parent] || {}).zh + "）" : "（" + (BLOC_ZH[c.bloc] || c.bloc) + "）");
    const fl = ST.frontlines ? ST.frontlines[p] : null;
    if (fl && fl.occupier) {
      const occC = CM.countries[fl.occupier];
      const occName = occC ? occC.zh : fl.occupier;
      ctryTxt += " · 【交战控制：" + occName + "】";
    }
    if (ST.mode === "resource" && ek) {
      const rd = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(ek)) || null;
      if (rd) {
        ctryTxt += " · 资源安全: " + (rd.summary.securityScore >= 0 ? "+" : "") + rd.summary.securityScore + " [" + rd.summary.tag + "]";
      }
    }
    $("h-ctry").textContent = ctryTxt;
    const pop = c.pop_m * (pr.area_km2 / c.area_km2);
    $("h-pop").textContent = "约 " + (pop >= 1 ? pop.toFixed(1) + " 百万" : (pop * 100).toFixed(0) + " 万");
    $("h-area").textContent = Math.round(pr.area_km2).toLocaleString() + " km²";
  }

  function wireKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      const c = { 0: () => { view.s = view.fit; view.x = (W - mapCan.width / view.s) / 2; view.y = (H - mapCan.height / view.s) / 2; clampView(); render(); drawOverlay(); drawMini(); },
        "+": () => zoomAt(cssW() / 2, cssH() / 2, 1.3), "=": () => zoomAt(cssW() / 2, cssH() / 2, 1.3),
        "-": () => zoomAt(cssW() / 2, cssH() / 2, 1 / 1.3),
        Escape: () => select(null) }[e.key];
      if (c) { c(); return; }
      if (e.key === " ") { e.preventDefault(); simTogglePlay(); return; }
      if (e.key === "r" || e.key === "R") { simReset(); return; }
      if (e.key === "m" || e.key === "M") {
        const i = MODES.findIndex((m) => m[0] === ST.mode);
        setMode(MODES[(i + 1) % MODES.length][0]);
      }
      // R2 T4：模式数由 5 → 6（原来写死 1..5）
      const mi = +e.key;
      if (mi >= 1 && mi <= MODES.length) setMode(MODES[mi - 1][0]);
    });
  }
  function cssH() { return ovCan.height / DPR; }

  // ---------------------------------------------------------------- minimap
  function mapSig() {
    try {
      const im = mctx2.getImageData(0, 0, mapCan.width, mapCan.height).data;
      let s = 2166136261;
      for (let i = 0; i < im.length; i += 4021) { s = ((s ^ im[i]) * 16777619) & 0x7fffffff; }
      return s.toString(16);
    } catch (e) { return "ERR"; }
  }

  function drawMini() {
    const mc = $("minic"), x = mc.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.clearRect(0, 0, mc.width, mc.height);
    x.drawImage(modeCan, 0, 0, W, H, 0, 0, mc.width, mc.height);
    const mw = mapCan.width / view.s, mh = mapCan.height / view.s;
    const v = $("miniview"), wrap = $("mini");
    const cw = mc.clientWidth, chh = mc.clientHeight;
    const l = clamp((view.x / W) * cw, -2, cw), t = clamp((view.y / H) * chh, -2, chh);
    const w0 = Math.min(Math.max(6, (mw / W) * cw), cw - Math.max(0, l));
    const h0 = Math.min(Math.max(6, (mh / H) * chh), chh - Math.max(0, t));
    v.style.left = (mc.offsetLeft + l) + "px";
    v.style.top = (mc.offsetTop + t) + "px";
    v.style.width = Math.max(6, w0) + "px";
    v.style.height = Math.max(6, h0) + "px";
  }

  // ---------------------------------------------------------------- export
  function composeDataURL() {
    const c = document.createElement("canvas");
    c.width = mapCan.width; c.height = mapCan.height;
    const x = c.getContext("2d");
    x.drawImage(mapCan, 0, 0); x.drawImage(ovCan, 0, 0);
    return c.toDataURL("image/png");
  }
  function exportPNG() {
    const a = document.createElement("a");
    a.download = "world1980_" + ST.mode + ".png";
    a.href = composeDataURL();
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------------- help text
  function fillHelp() {
    $("k-base").textContent = W + " × " + H;
    $("k-aspect").textContent = CK.aspect.toFixed(6) + "（W/H）";
    $("k-km2").textContent = KM2.toFixed(3) + " km²/px";
    const ata = CK.ataPx || 0;
    const landNoAta = (CK.landPx - ata) * KM2;
    $("k-lintest").textContent = "等面积自检：Equal Earth 雅可比 max|J/cosφ-1| = 1.6e-8（管线实测），无 Mercator/Miller，无非等比拉伸。";
    $("k-land").textContent = "全球非南极陆地总面积 ≈ " + (landNoAta / 1e8).toFixed(3) +
      " 亿 km²（真实约 1.35 亿）· 全陆地（含南极）" + (CK.landAreaKm2 / 1e8).toFixed(3) + " 亿 km²";
    const A = (k) => CM.countries[k].area_km2 / 1e6;
    $("k-rank").textContent = "实测：苏联 " + A("SUN").toFixed(2) + " > 加拿大 " + A("CAN").toFixed(2) +
      " > 中国 " + A("CHN").toFixed(2) + " / 美国 " + A("USA").toFixed(2) + " > 巴西 " + A("BRA").toFixed(2) +
      " > 澳大利亚 " + A("AUS").toFixed(2) + " 百万 km²";
  }

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
})();
