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
    ["ind", "工业", "4"], ["province", "政区随机色", "5"], ["delta", "变化", "6"]];
  const LAYERS = [["province", "省界"], ["country", "国界"], ["capital", "首都金星"],
    ["city", "城市点"], ["label", "地名标签"]];

  const ST = {
    mode: "political", sortKey: "pop_m", sel: null, hover: 0, hoverC: null,
    player: null, mil: 0,            // R3：玩家实体（可 null=旁观）与军费占比决策（%）
    layers: { province: true, country: true, capital: true, city: true, label: true }
  };
  const view = { x: 0, y: 0, s: 1, fit: 1 };

  let pid = null, pol = null, landm = null;      // rasters
  let play = null;                               // playable entity id per px（集团合并后）
  let playPol = null;                            // province -> playable entity id
  let playKeys = null;                           // entity id -> key（byPlayableId）
  let playIdOfKey = null;                        // key -> entity id
  let playPids = null;                           // key -> Set(polity_id)（集团=多个成员政体）
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
  // ---- R3：玩家决策（实体选择 + 军费占比）----
  // 军费占比 mil% → 本国全部成员 key 施加 -mil pp/年 的**玩家决策层**修正
  // （引擎 P.pmods，与事件层 P.mods 分离 → 不会互相覆盖，这是 R3 的关键设计）
  function applyPlayerMil() {
    if (!SIM.S) return;
    Object.keys(W1980_SIM.pmap(SIM.S)).forEach((k) => W1980_SIM.clearPMod(SIM.S, k));
    if (ST.player && ST.mil > 0) {
      const ek = entKeys(ST.player);
      for (let i = 0; i < ek.length; i++) W1980_SIM.setPMod(SIM.S, ek[i], -ST.mil);
    }
  }
  function updPlayerTag() {
    const e = $("r-player"); if (!e) return;
    const c = ST.player ? CM.countries[ST.player] : null;
    e.textContent = c ? "⚑ " + c.zh + " · " + ST.player : "⚑ 旁观";
    e.title = c ? "你的国家：" + c.zh + (ST.mil > 0 ? "（军费 " + ST.mil + "%）" : "（军费 0%）")
      : "尚未选择你的国家（旁观模式）";
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
  }
  function setPlayer(k, refresh) {
    ST.player = (k && CM.countries[k]) ? k : null;
    if (refresh !== false) { applyPlayerMil(); updPlayerTag(); refreshMilBox(); if (ST.sel) select(ST.sel); }
  }
  function setMil(v) {
    ST.mil = clamp(Number(v) || 0, 0, 10);
    applyPlayerMil(); updPlayerTag(); refreshMilBox();
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
      const k = keys[i], c = CM.countries[k], j = idx[c.bloc];
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
      const E = 60 * (pctl === null ? 0.5 : pctl);          // 经济表现：末期同比的世界分位（0→满分 60）
      const R = 20 * clamp(0.5 + dr / 8, 0, 1);             // 国力位次：上升 4 名满分 / 下降 4 名归零
      const M = 20 * (ST.mil / 10);                         // 军力投入：军费占比线性
      out.player = { k: pk, zh: c.zh, mil: ST.mil,
        gdp: v.gdp_bn, gdp0: c.gdp_bn, gdpDelta: c.gdp_bn ? (v.gdp_bn / c.gdp_bn - 1) * 100 : 0,
        pop: v.pop_m, pop0: c.pop_m, popDelta: c.pop_m ? (v.pop_m / c.pop_m - 1) * 100 : 0,
        gSelf: gSelf, gWorld: gWorld, pctl: pctl, rank0: rank0, rank1: rank1, dr: dr,
        E: E, R: R, M: M, total: E + R + M };
    }
    return out;
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
        '<div class="s"><b>' + p.E.toFixed(1) + "</b><span>经济表现 /60</span></div>" +
        '<div class="s"><b>' + p.R.toFixed(1) + "</b><span>国力位次 /20</span></div>" +
        '<div class="s"><b>' + p.M.toFixed(1) + "</b><span>军力投入 /20</span></div></div>" +
        '<div class="tot">总分 <b>' + p.total.toFixed(1) + "</b> / 100</div>";
    } else {
      h += '<div class="note">旁观模式 · 无个人评分。在欢迎层或国家面板选一个国家，再重开一局即可获得评分。</div>';
    }
    h += '<div class="note"><b>评分口径（作者设定，非史实校准）</b>：经济表现 = 60×末期同比在 54 实体中的<b>分位</b>；' +
      '国力位次 = 20×clamp(0.5+名次上升/8,0,1)；军力投入 = 20×军费占比/10。' +
      '军费每 +1% 让本国年产出增速 <b>−1pp</b> ⇒ 军力分与经济分是<b>真实取舍</b>，权重由作者设定、未做史实校准。<br>' +
      '实测（见 REPORT_R4）：当前权重下军力投入的线性回报高于经济分位损失 ⇒ 最优策略是顶格军费，已登记为待调平衡项。</div>';
    h += "<h4>世界格局 · 阵营 GDP 占比（1980 → " + st.date + "）</h4>" +
      '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
    for (const b of st.blocs.slice().sort((a, b) => b.gdpShare - a.gdpShare))
      h += "<tr><td>" + b.zh + '</td><td class="v">' + b.gdpShare0.toFixed(1) + '%</td><td class="v">' +
        b.gdpShare.toFixed(1) + "%</td>" + dc(b.gdpShare - b.gdpShare0) + "</tr>";
    h += '<tr><td>世界合计</td><td class="v">' + (st.world.gdp0 / 1000).toFixed(2) + ' 万亿</td><td class="v">' +
      (st.world.gdp / 1000).toFixed(2) + " 万亿</td>" + dc(st.world.gdpDelta) + "</tr></table>";
    h += "<h4>人口结构 · 阵营占比</h4>" +
      '<table><tr><td>阵营</td><td class="v">1980</td><td class="v">末期</td><td class="v">Δpp</td></tr>';
    for (const b of st.blocs.slice().sort((a, b) => b.popShare - a.popShare))
      h += "<tr><td>" + b.zh + '</td><td class="v">' + b.popShare0.toFixed(1) + '%</td><td class="v">' +
        b.popShare.toFixed(1) + "%</td>" + dc(b.popShare - b.popShare0) + "</tr>";
    h += '<tr><td>世界人口</td><td class="v">' + (st.world.pop0 / 1000).toFixed(2) + ' 十亿</td><td class="v">' +
      (st.world.pop / 1000).toFixed(2) + " 十亿</td>" + dc(st.world.popDelta) + "</tr></table>";
    box.innerHTML = h;
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
  function simLoop(ts) {
    requestAnimationFrame(simLoop);
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
        W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), false);
      }
      onSimAdvance(y0 !== SIM.S.year);
      if (simAtEnd()) { SIM.playing = false; SIM.acc = 0; updateDate(); simEndOpen(); }
    }
  }
  function simSetSpeed(sp) { SIM.speed = sp; updateDate(); }
  function simTogglePlay() {
    if (SIM.playing) { SIM.playing = false; }
    else { if (simAtEnd()) simEndOpen(); SIM.playing = !simAtEnd(); }   // 到站后 ▶ 只重看结算，不再推进
    SIM.lastTs = 0; updateDate();
  }
  function simReset() {
    if (!SIM.ready) return;
    const D = window.W1980_SIMDATA;
    SIM.S = W1980_SIM.initState(D, 1980, 0);
    W1980_SIM.seedState(SIM.S, Object.keys(D.popStart), D.popStart);
    SIM.S.noiseSigma = SIM.vol;      // 难度 → 噪声幅度
    applyPlayerMil();               // R3：重置后按当前决策重挂 pmods（否则重置会静默丢掉玩家决策）
    simEndClose();                  // R4：重置同时收起上一局结算
    SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0;
    evInit(); evRun(1980, 1, true);
    rebuildValueTables();
    if (bakedNow === "pop" || bakedNow === "ind" || bakedNow === "delta") { bakeNow(bakedNow); render(); drawMini(); }
    onSimAdvance(false);
  }
  function simFastForward(y, m) {
    if (!SIM.ready) return;
    const n0 = EV.items.length;
    let guard = 0;
    // R4：加 `!simAtEnd()` —— ?t=1992-* 不再越界（?t=1991-12 的结果与此前逐字一致）
    while (guard++ < 400 && !simAtEnd() &&
      (SIM.S.year < y || (SIM.S.year === y && Math.max(1, SIM.S.month) < m))) {
      W1980_SIM.tick(SIM.S); evRun(SIM.S.year, Math.max(1, SIM.S.month), true);
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
  // R2 T3：收件箱渲染（末尾 EV.unread 条标为未读）
  function renderInbox() {
    const box = $("inbox-list");
    if (box) {
      box.innerHTML = EV.items.length
        ? '<div class="sum">已发生 ' + EV.items.length + " / " + EV.list.length + ' 件（1980–1991）</div>' +
          EV.items.map((e, i) =>
            '<div class="ev' + (i >= EV.items.length - EV.unread ? " unread" : "") + '">' +
            '<span class="d">' + e.y + "-" + String(e.m).padStart(2, "0") + "</span>" +
            '<span class="t"><b>' + e.zh + (e.dissolve ? "（解体标记）" : "") + "</b>" +
            (e.note ? '<div class="n">' + e.note + "</div>" : "") + "</span></div>").join("")
        : '<div class="empty">暂无事件 —— 1980-01 起按历史日期触发（本局共 ' + EV.list.length + " 件待发生）。</div>";
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
    if (!silent) toast(e);
  }
  function evRun(y, m, silent) {
    if (!SIM.S || !EV.list.length) return;
    const now = y * 12 + m;
    while (EV.idx < EV.list.length && (EV.list[EV.idx].y * 12 + EV.list[EV.idx].m) <= now) evApply(EV.list[EV.idx++], silent);
    for (let i = EV.active.length - 1; i >= 0; i--) {
      const a = EV.active[i];
      if (a.end !== null && now >= a.end) {
        if (a.pop) a.targets.forEach((t) => W1980_SIM.clearPopMod(SIM.S, t));   // 机制③：到期清人口修正
        else a.targets.forEach((t) => W1980_SIM.clearMod(SIM.S, t));
        EV.active.splice(i, 1);
      }
    }
  }
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
      mode: ST.mode, layers: ST.layers, sel: ST.sel,
      view: { x: view.x, y: view.y, s: view.s } };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { return false; }
    return true;
  }
  function simLoad() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return false; }
    if (!d || d.v !== 2 || !d.S) return false;
    SIM.vol = d.vol || SIM.vol;
    ST.player = (d.player && CM.countries[d.player]) ? d.player : null;
    ST.mil = clamp(typeof d.mil === "number" ? d.mil : 0, 0, 10);
    try { W1980_SIM.hydrate(SIM.S, d.S); } catch (e) { return false; }   // ← 直接还原，不重放
    SIM.S.noiseSigma = SIM.vol;
    SIM.playing = false; SIM.acc = 0; SIM.lastTs = 0;
    evRebuild(SIM.S.year, Math.max(1, SIM.S.month));
    applyPlayerMil();                    // 幂等：结果与存档内的 pmods 一致
    simEndClose();                       // R4：读档收起上一局结算（若存档已在 1991-12，按 ▶ 可重看）
    rebuildValueTables();
    if (bakedNow) { bakeNow(bakedNow); render(); drawMini(); }
    SIM.speed = d.speed || 1;
    if (d.mode && MODES.some((m) => m[0] === d.mode)) setMode(d.mode);
    else { fillLegend(); render(); drawOverlay(); }
    if (d.layers) { for (const k in ST.layers) if (k in d.layers) ST.layers[k] = !!d.layers[k]; refreshLayerBtns(); }
    if (d.view) { view.x = d.view.x; view.y = d.view.y; view.s = d.view.s; clampView(); render(); drawOverlay(); drawMini(); }
    fillTop(); updPlayerTag(); refreshMilBox();
    select(d.sel && CM.countries[d.sel] ? d.sel : null);
    updateDate();
    return true;
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
      applyPlayerMil(); updPlayerTag(); refreshMilBox();
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
    if (q.has("nowelcome") || q.has("selftest") || q.has("simprobe") || q.has("end")) return;
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
      zh: "<b>拨第一笔预算</b>：在你的国家面板里调<b>军费占比</b>（0–10%）。每 +1% 让本国年产出增速 −1pp，<b>立即计入轨迹</b> —— 这是你的决策真正改写历史的入口。" },
    { sel: null, pos: "center",
      zh: "<b>玩起来</b>：点国家看面板（含「较1980」变化与 1980→当期实际产出<b>轨迹</b>）；时间推进中会按史实弹出事件；<b>1991-12 苏联标记为已解体</b>。" }
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
  function tutWire() {
    $("c-next").onclick = tutNext;
    $("c-skip").onclick = tutEnd;
    window.addEventListener("resize", () => { if (tutI >= 0) tutShow(); });
  }
  function tutMaybeAuto() {
    let done = null; try { done = localStorage.getItem(TUT_KEY); } catch (e) {}
    if (done) return;
    const q = new URLSearchParams(location.search);
    if (q.has("nowelcome") || q.has("selftest") || q.has("simprobe") || q.has("saveprobe")) return;
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
      tb[id] = u32c(BLOC[c.bloc] || "#9B9B9B");
      const a = (lp[i] - p0) / (p1 - p0), b = (li[i] - i0) / (i1 - i0);
      tpop[id] = ramp(a); tind[id] = ramp(b);
    });
    tables.political = tp; tables.bloc = tb; tables.pop = tpop; tables.ind = tind;
    // R2 T4：delta 表（1980-01 时全部落在中性色 —— 全图「无变化」是正确初始态）
    const tdl = new Uint32Array(256);
    keys.forEach((k) => { const id = playIdOfKey[k] || CM.countries[k].polity_id; tdl[id] = divRamp(deltaOf(k) / DELTA_SPAN); });
    tables.delta = tdl;
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
    const binb = $("b-inbox");
    if (binb) binb.onclick = () => {
      togglePanel("inbox");
      if ($("inbox").classList.contains("open")) { EV.unread = 0; renderInbox(); }   // 打开即视为已读
    };
    renderInbox();
    // R3：玩家决策控件（军费滑杆 / 设为本国 / 取消本国）
    const mr = $("p-mil"); if (mr) mr.oninput = () => setMil(mr.value);
    const mk = $("p-mkplayer"); if (mk) mk.onclick = () => { if (ST.sel) setPlayer(ST.sel); };
    const moff = $("p-mil-off"); if (moff) moff.onclick = () => setPlayer(null);
    updPlayerTag(); refreshMilBox();
    const btut = $("b-tut"); if (btut) btut.onclick = () => tutStart(0);
    // R4：终局结算页脚按钮（在 HTML 里固定，不随正文滚动）
    const eagain = $("e-again"); if (eagain) eagain.onclick = () => { $("end").classList.remove("open"); simReset(); };
    const eclose = $("e-close"); if (eclose) eclose.onclick = () => simEndClose();
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
    window.addEventListener("resize", () => { resize(false); render(); drawOverlay(); });
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
    $("p-bloc").textContent = BLOC_ZH[c.bloc] || c.bloc;
    $("p-bloc").style.borderColor = BLOC[c.bloc] || "#9B9B9B";
    $("p-bloc").style.color = BLOC[c.bloc] || "#9B9B9B";
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
    $("h-ctry").textContent = c.zh + (c.parent ? "（附属·宗主 " + (CM.countries[c.parent] || {}).zh + "）" : "（" + (BLOC_ZH[c.bloc] || c.bloc) + "）");
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
  // 验证钩子：?pan=<dx>,<dy> 可重复（等价于鼠标拖动），?selftest 由外部触发
  window.__W1980 = { view: view, render: render, drawOverlay: drawOverlay, drawMini: drawMini,
    zoomAt: zoomAt, maps: maps, ST: ST, setMode: setMode, sig: mapSig,
    sim: SIM, simVal: simVal, simFastForward: simFastForward, simTogglePlay: simTogglePlay, simReset: simReset,
    simAtEnd: simAtEnd, endStats: endStats, simEndOpen: simEndOpen,
    panBy: (dx, dy) => { view.x -= dx / view.s; view.y -= dy / view.s; clampView(); render(); drawOverlay(); drawMini(); } };
  load().then(() => {
    const q = new URLSearchParams(location.search);
    if (!q.has("simoff")) simInit();
    wireTimeControls(); updateDate(); requestAnimationFrame(simLoop);
    buildUI();
    maybeWelcome();
    tutMaybeAuto();
    if (/[?&]tut=1/.test(location.search)) { const w = $("welcome"); if (w) w.style.display = "none"; tutStart(0); }   // 无头验证钩子
  }).then(() => {
    if (SELFTEST) { runSelfTest(); return; }
    // R3：玩家实体 + 军费决策 —— **必须在 ?t= 快进之前生效**，否则快进段仍按 mil=0 计算
    const pq = /[?&]player=([A-Za-z]{3,4})/.exec(location.search);
    if (pq) { const pk = pq[1].toUpperCase(); if (CM.countries[pk]) ST.player = pk; }
    const mq1 = /[?&]mil=([\d.]+)/.exec(location.search);
    if (mq1) ST.mil = clamp(parseFloat(mq1[1]) || 0, 0, 10);
    applyPlayerMil(); updPlayerTag(); refreshMilBox();
    const tq = /[?&]t=(\d{4})-(\d{1,2})/.exec(location.search);
    if (tq && SIM.ready) simFastForward(+tq[1], +tq[2]);
    const spq = /[?&]sp=([124])/.exec(location.search);
    if (spq) simSetSpeed(+spq[1]);
    if (/[?&](play|autoplay)=1/.test(location.search) && SIM.ready) { SIM.playing = true; updateDate(); }
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
      applyPlayerMil();
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
      ST.mil = 0; applyPlayerMil(); r.tamperedMil = ST.mil;   // 故意篡改 → 读档应还原为存档里的 8
      r.loaded = simLoad();
      r.dateAfterLoad = SIM.S.year + "-" + Math.max(1, SIM.S.month);
      r.sunAfterLoad = +simVal("SUN").gdp_bn.toFixed(2);
      r.gdpAfterLoad = +SIM.S.gdp.SUN.toFixed(9);
      r.rngAfterLoad = SIM.S.rngState;
      r.rngStateOk = r.rngBefore === r.rngAfterLoad;
      r.exactOk = r.gdpBefore === r.gdpAfterLoad;
      r.milAfterLoad = ST.mil; r.milRestored = r.milAfterLoad === r.mil;
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
        r.score = { E: +p.E.toFixed(2), R: +p.R.toFixed(2), M: +p.M.toFixed(2), total: +p.total.toFixed(2),
          gSelf: p.gSelf === null ? null : +p.gSelf.toFixed(3), gWorld: p.gWorld === null ? null : +p.gWorld.toFixed(3),
          pctl: p.pctl === null ? null : +p.pctl.toFixed(4),
          gdp: +p.gdp.toFixed(1), gdpDelta: +p.gdpDelta.toFixed(2),
          rank0: p.rank0, rank1: p.rank1, dr: p.dr, mil: p.mil }; }
      // ?endact=1：点「重开一局」后必须回到 1980-01、面板收起、且**玩家决策不丢**（mil 仍在）
      if (/[?&]endact=1/.test(location.search)) {
        const ag = $("e-again"); if (ag) ag.click();
        r.afterAgain = { date: SIM.S.year + "-" + Math.max(1, SIM.S.month),
          open: $("end") ? $("end").classList.contains("open") : null,
          sunGdp: +simVal("SUN").gdp_bn.toFixed(1), milKept: ST.mil,
          pmodSUN: SIM.S.P.pmods.SUN === undefined ? null : SIM.S.P.pmods.SUN,
          histLen: (SIM.S.hist.gdp.SUN || []).length };   // 重开后 hist 为空 → 必须容错（首跑踩到 TypeError）
      }
      const dz = document.createElement("div"); dz.id = "endprobe"; dz.style.display = "none";
      dz.textContent = "ENDPROBE " + JSON.stringify(r);
      document.body.appendChild(dz);
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
    if (mq && CM.countries[mq[1].toUpperCase()]) {
      const k = mq[1].toUpperCase(), bb = countryBBox(k);
      if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 240);
      select(k);
    }
  }).catch((e) => {
    console.error(e);
    $("err").style.display = "flex";
    $("err").textContent = "加载失败：" + e.message;
  });
})();
