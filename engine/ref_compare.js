"use strict";
/* world1980 · R4 后半 —— 参照对照共享逻辑（Node 模块）
 *
 * 为什么单列一个文件：`engine/test_sim.js`（报告项）与 `engine/ref_gate.js`（硬门槛）
 * **必须同源同值**，否则就会出现"截图一个数、门槛另一个数"的两套真相。
 *
 * ## 口径：逐年同比（YoY），不是窗口总量倍数
 * **计数论证（定义层面的不可比）**：引擎的状态起点是 **1979-12**（`month=0` = 1980-01 尚未结算），
 * 跑到第 144 tick 是 **1991-12** ⇒ 引擎窗口 = **12 年**；而参照的 1980=1 是**日历年 1980 年均值**、
 * 1991 也是年均值 ⇒ 参照窗口 = **11 年**。端点比法把「12 年的增长」对「11 年的增长」，
 * 多算的那一年与增速成正比 ⇒ 端点倍数**在定义上就不可比**，与模型好坏无关。
 * 逐年同比两端都是**12 个月比率**（年末对上年末 / 年均对上年均），这个错配在取比率时抵消，
 * 因此「模型能不能复现**年度增长形状**」被干净地隔离出来。
 * 窗口总量倍数**仍然报告**（字段 `info.*`），但**只作参考、不判定**。
 *
 * **诚实校正（R4 后半·二阶段实测）**：曾把端点超限归因于上述错配（"伪影"），
 * 但重拟合前后实测「端点偏差 vs 参照年均增速」的相关为 **r = −0.813 → +0.013** ——
 * 说明端点超限**主要由形状误差**（战争/油价冲击等未建模机制）主导，不能拿错配当解释。
 * 错配是**口径问题**（故判定不用它），但不是超限幅度的解释项。
 *
 * ## 数据来源
 * 参照序列 = `engine/ref_table.js`（由 `work/fetch_refs.py` 从 World Bank API v2 生成，
 * 引用与缺口见 `docs/data-refs.md`）。判定逐键逐指标按**可得年数**进行（≥ MIN_YEARS 个同比年），
 * 缺年不参与 —— 因此 1984 起才有数据的键也能用其子窗口被判定，而不是整键丢掉。
 */
const TOL = { popPct: 3, gdpPct: 15 };   // SIM.md §5 待办 2 定的容差（本批不改）
const NV = 12;                            // 1980..1991 共 12 个日历年
const MIN_YEARS = 5;                      // 判定某键某指标至少要 5 个同比年（= 至少覆盖 6 个连续年）

/* 跑满 144 tick，并在每个**年末**（第 12·m tick）采样 pop/gdp。
 * 返回 snap[m-1] = {pop,gdp}（m=1..12 → 1980-12 .. 1991-12）。 */
function runAndSample(SIM, D, members) {
  const S = SIM.initState(D, 1980, 0);
  SIM.seedState(S, members, D.popStart);
  const snap = [];
  for (let m = 1; m <= NV; m++) {
    for (let i = 0; i < 12; i++) SIM.tick(S);
    snap.push({ pop: Object.assign({}, S.pop), gdp: Object.assign({}, S.gdp) });
  }
  return { S: S, snap: snap };
}

/* 一条序列的逐年同比偏差。model[m] 为年末值；ref 为年末/年均序列（ref[0] 已归一为 1，此处只用比率）。
 * 只统计两端都有定义、且分母非零的年份（1981..1991）。 */
function yoyDev(model, ref) {
  let max = 0;
  const per = [];
  for (let m = 1; m < NV; m++) {
    const a = model[m], b = model[m - 1], c = ref[m], d = ref[m - 1];
    if (!(a > 0) || !(b > 0) || !(c > 0) || !(d > 0)) continue;
    const mR = a / b, rR = c / d;
    const dev = (mR / rR - 1) * 100;
    per.push({ y: 1980 + m, dev: +dev.toFixed(3) });
    if (Math.abs(dev) > Math.abs(max)) max = dev;
  }
  return { maxPct: +max.toFixed(3), years: per.length, per: per };
}

/* 窗口总量倍数偏差（**仅报告**；含 ~0.9 年窗口长度偏差，见文件头）。 */
function totalDev(model, ref) {
  const r = ref[NV - 1];
  if (!(r > 0) || !(model[NV - 1] > 0)) return null;
  return +((model[NV - 1] / r - 1) * 100).toFixed(3);
}

/* 主对照：**逐键逐指标按"可得年数"判定**（≥ MIN_YEARS 个同比年才判），缺年不参与。
 * 不按 coverage==="direct" 一刀切 —— 那样会把 VNM/PRK/POL/…（1984/1990 起才有数据的键）
 * 整键丢掉；而同比与基准年无关，只用其可得子窗口（如 1985–1991）就是有效证据。 */
function compare(snap, REFS) {
  const R = REFS, cov = R.coverage || {};
  // 键集合取 pop 与 gdp 的并集：归一化基准年不同后，两表的键集合不再必然相同（某指标整键无数据时会缺席）
  const keys = Array.from(new Set(Object.keys(R.pop || {}).concat(Object.keys(R.gdp || {})))).sort();
  const perKey = {};
  let worstPop = 0, worstGdp = 0;
  const popOver = [], gdpOver = [], popOverTotal = [], gdpOverTotal = [];
  const undecided = [];
  const EMPTY = { years: 0, maxPct: 0, per: [] };
  let judgedPop = 0, judgedGdp = 0;
  for (const k of keys) {
    const mp = snap.map((s) => s.pop[k]), mg = snap.map((s) => s.gdp[k]);
    const rp = R.pop[k], rg = R.gdp[k];
    const pv = rp ? yoyDev(mp, rp) : EMPTY, gv = rg ? yoyDev(mg, rg) : EMPTY;
    const pt = rp ? totalDev(mp, rp) : null;
    const gt = (rg && (R.gdpBase || {})[k] === 1980) ? totalDev(mg, rg) : null;   // 基准年非 1980 则端点倍数不可比
    const okP = pv.years >= MIN_YEARS, okG = gv.years >= MIN_YEARS;
    if (okP) judgedPop++;
    if (okG) judgedGdp++;
    if (okP && Math.abs(pv.maxPct) > Math.abs(worstPop)) worstPop = pv.maxPct;
    if (okG && Math.abs(gv.maxPct) > Math.abs(worstGdp)) worstGdp = gv.maxPct;
    if (okP && Math.abs(pv.maxPct) > TOL.popPct) popOver.push(k + ":" + pv.maxPct.toFixed(1));
    if (okG && Math.abs(gv.maxPct) > TOL.gdpPct) gdpOver.push(k + ":" + gv.maxPct.toFixed(1));
    if (pt !== null && Math.abs(pt) > TOL.popPct) popOverTotal.push(k + ":" + pt.toFixed(1));
    if (gt !== null && Math.abs(gt) > TOL.gdpPct) gdpOverTotal.push(k + ":" + gt.toFixed(1));
    if (!okP || !okG) undecided.push(k + "(pop:" + pv.years + "y,gdp:" + gv.years + "y,cov:" + (cov[k] || "?") + ")");
    perKey[k] = { popYoY: okP ? pv.maxPct : null, gdpYoY: okG ? gv.maxPct : null,
      popYears: pv.years, gdpYears: gv.years, popTotal: pt, gdpTotal: gt };
  }
  const cnt = { direct: 0, partial: 0, none: 0 };
  for (const k in cov) if (cnt[cov[k]] !== undefined) cnt[cov[k]]++;
  return {
    judgedPop: judgedPop, judgedGdp: judgedGdp, minYears: MIN_YEARS, counts: cnt,
    worstPopPct: +worstPop.toFixed(2), worstGdpPct: +worstGdp.toFixed(2),
    popOver3: popOver, gdpOver15: gdpOver, undecided: undecided,
    info: { metric: "yoy", endpointPopOver3: popOverTotal, endpointGdpOver15: gdpOverTotal,
      endpointCaveat: "端点倍数含 ~0.9 年窗口长度偏差（引擎 11.92 年 vs 参照 11 年）且基准年未必为 1980，仅参考、不判定" },
    perKey: perKey,
  };
}

/* 参照表指纹：让"文档里记的结论"能对上"当时用的表"（改表即变） */
function refHash(REFS) {
  const s = JSON.stringify(REFS);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ("00000000" + h.toString(16)).slice(-8);
}

module.exports = { TOL: TOL, runAndSample: runAndSample, yoyDev: yoyDev, totalDev: totalDev,
  compare: compare, refHash: refHash };