"use strict";


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
