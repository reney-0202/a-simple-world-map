"use strict";
/* world1980 M4 — 仿真引擎单测（Node，无浏览器）。
 * 运行：node engine/test_sim.js
 * 读取真实交付数据 out/data/sim.js + 引擎 out/engine/sim.js（同时验证导出管线）。
 *
 * 检查项：
 *   A. 自洽性：仿真轨迹 vs 所用增长率的闭式解（算术一致性；门槛 <0.01%）
 *   B. 参照表偏差：**已溯源、仍仅报告**（R4 后半改了）——
 *      参照值来自 World Bank API v2（见 docs/data-refs.md），由 work/fetch_refs.py 生成 engine/ref_table.js。
 *      **报告项保留在此、硬门槛移到 engine/ref_gate.js**：本文件是"契约门"（确定性/自洽/存档往返），
 *      必须恒 exit 0；校准质量是"未完成状态"，红在独立的 ref_gate.js 里，不污染标准回归基线。
 *      R4 后半同时把对照口径从「窗口总量倍数」升级为**逐年同比（YoY）**（理由见 engine/ref_compare.js 文件头）。
 *   C. 确定性：同种子两次运行逐位一致
 *   D. 随机性确实生效：换种子 → 结果不同
 *   E. 起点守卫：popStart 缺 key 时抛错
 *   F. 日期推进：144 tick 从 1980-01 到 1991-12
 *   G. 性能：单 tick < 50ms
 *   H~J. 事件层 / 解体标记 / 历史轨迹 / 全量序列化往返
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REFC = require("./ref_compare.js");
global.window = {};
function load(p) { eval(fs.readFileSync(p, "utf8")); }

load(path.join(ROOT, "out", "data", "sim.js"));
load(path.join(ROOT, "out", "engine", "sim.js"));
load(path.join(__dirname, "ref_table.js"));       // R4 后半：溯源参照表（window.W1980_REFS）
const D = window.W1980_SIMDATA, SIM = window.W1980_SIM, REFS = window.W1980_REFS;

// 参照表：R4 后半起来自 engine/ref_table.js（World Bank API v2 生成，非手写估计）。
// 旧版此处是手写的 REF_POP / REF_GDPX「量级估计」，已在 tasks/007 与 docs/SIM.md §5 记明被替换。

const out = { ok: true };
const fail = (name, msg) => { out.ok = false; out[name] = "FAIL: " + msg; };

if (!SIM || !D || !D.popStart) { fail("boot", "缺少 SIMDATA(含 popStart) 或 SIM"); }
else {
  const members = Object.keys(D.popStart).sort();

  // ---- 主运行 144 tick ----
  const S = SIM.initState(D, 1980, 0);
  SIM.seedState(S, members, D.popStart);
  let maxTick = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 144; i++) {
    const a = process.hrtime.bigint();
    SIM.tick(S);
    const ms = Number(process.hrtime.bigint() - a) / 1e6;
    if (ms > maxTick) maxTick = ms;
  }
  const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;

  // A. 自洽性（闭式解）
  let worstSelf = 0;
  for (const k of members) {
    const closed = D.popStart[k] * Math.pow(1 + D.popRate[k] / 100 / 12, 144);
    const d = Math.abs((S.pop[k] - closed) / closed * 100);
    if (d > worstSelf) worstSelf = d;
  }
  out.selfConsistencyPct = +worstSelf.toFixed(6);
  if (!(worstSelf < 0.01)) fail("selfConsistency", worstSelf + "% >= 0.01%");

  // B. 参照表（**已溯源，仍仅报告**；硬门槛在 engine/ref_gate.js）
  //   2026-09-22（R4 后半）之前：这里比的是手写估计表的"窗口总量倍数"，且人口项是恒等式（参数由同一张表反推）。
  //   现在：参照 = World Bank API v2（人口 SP.POP.TOTL / GDP NY.GDP.MKTP.KD，见 docs/data-refs.md），
  //   对照口径 = **逐年同比 YoY**（消掉"引擎 11.92 年 vs 参照 11 年"的窗口长度偏差，见 ref_compare.js 文件头）。
  const rc = REFC.runAndSample(SIM, D, members);
  const refRes = REFS ? REFC.compare(rc.snap, REFS) : null;
  if (!refRes) fail("refTable", "缺少 engine/ref_table.js（跑 work/fetch_refs.py 生成）");
  else {
    // 交叉校验：ref_compare 的独立采样跑完 144 tick 后必须与主运行逐位一致（顺带再证确定性）
    const sameAsMain = members.every((k) => rc.snap[11].pop[k] === S.pop[k] && rc.snap[11].gdp[k] === S.gdp[k]);
    if (!sameAsMain) fail("refTable", "ref_compare 独立运行与主运行不一致（确定性被破坏？）");
    out.refTable = {
      src: REFS.meta.src, indicators: REFS.meta.indicators, apiLastUpdated: REFS.meta.apiLastUpdated,
      fetchedAt: REFS.meta.fetchedAt, refHash: REFC.refHash(REFS), metric: "yoy",
      counts: refRes.counts, judgedPop: refRes.judgedPop, judgedGdp: refRes.judgedGdp,
      minYears: refRes.minYears, undecided: refRes.undecided, sampleRunMatches: sameAsMain,
      worstPopPct: refRes.worstPopPct, worstGdpPct: refRes.worstGdpPct,
      popOver3: refRes.popOver3, gdpOver15: refRes.gdpOver15,
      tol: REFC.TOL, gate: "见 engine/ref_gate.js（独立校准门槛，不属于标准回归基线）",
      endpointInfo: { popOver3: refRes.info.endpointPopOver3.length, gdpOver15: refRes.info.endpointGdpOver15.length,
        caveat: refRes.info.endpointCaveat },
    };
  }

  // C. 确定性
  const S2 = SIM.initState(D, 1980, 0);
  SIM.seedState(S2, members, D.popStart);
  for (let i = 0; i < 144; i++) SIM.tick(S2);
  const det = members.every((k) => S2.pop[k] === S.pop[k] && S2.gdp[k] === S.gdp[k]);
  out.deterministic = det;
  if (!det) fail("deterministic", "同种子两次结果不同");

  // D. 换种子应改变结果（证明随机数确实参与）
  const D2 = Object.assign({}, D, { seed: (D.seed ^ 0x5bf03635) >>> 0 });
  const S3 = SIM.initState(D2, 1980, 0);
  SIM.seedState(S3, members, D.popStart);
  for (let i = 0; i < 144; i++) SIM.tick(S3);
  out.seedSensitive = members.some((k) => S3.gdp[k] !== S.gdp[k]);
  if (!out.seedSensitive) fail("seedSensitive", "换种子后结果完全相同（随机数未生效？）");

  // E. 起点守卫
  let guarded = false;
  try { SIM.seedState(SIM.initState(D, 1980, 0), members, { USA: 1 }); } catch (e) { guarded = true; }
  out.popStartGuard = guarded;
  if (!guarded) fail("popStartGuard", "缺 key 时未抛错");

  // F. 日期推进
  out.endDate = S.year + "-" + S.month;
  if (!(S.year === 1991 && S.month === 12)) fail("endDate", out.endDate + " != 1991-12");

  // F2. 1980 基准守恒：Σ成员 1980 基准 == 交付实体值（防"用已合并宿主值重复计数"）
  const raw = fs.readFileSync(path.join(ROOT, "out", "data", "countries.js"), "utf8");
  const CJ = JSON.parse(raw.slice(raw.indexOf("=") + 1, raw.lastIndexOf(";")));
  let maxDev = 0; const badEnt = [];
  for (const k in CJ.countries) {
    const c = CJ.countries[k];
    const keys = [];
    if (D.popStart[k] !== undefined) keys.push(k);
    for (const m of (c.members || [])) if (D.popStart[m.key] !== undefined) keys.push(m.key);
    const g = keys.reduce((s, kk) => s + D.gdp1980[kk], 0);
    const i = keys.reduce((s, kk) => s + D.ind1980[kk], 0);
    const p = keys.reduce((s, kk) => s + D.popStart[kk], 0);
    const dev = Math.max(Math.abs(g - c.gdp_bn) / c.gdp_bn, Math.abs(i - c.industry_bn) / c.industry_bn,
                         Math.abs(p - c.pop_m) / c.pop_m) * 100;
    if (dev > maxDev) maxDev = dev;
    if (dev > 0.5) badEnt.push(k + ":" + dev.toFixed(2) + "%");
  }
  out.entityBaseline = { worstDevPct: +maxDev.toFixed(4), over05: badEnt.slice(0, 5) };
  if (maxDev > 0.5) fail("entityBaseline", "实体 1980 基准 != Σ成员基准（重复计数？）：" + badEnt.slice(0, 3).join(","));

  // G. 性能
  out.perf = { totalMs: +totalMs.toFixed(1), maxTickMs: +maxTick.toFixed(3) };
  if (maxTick > 50) fail("perf", maxTick + "ms >= 50ms");

  out.members = members.length;
  out.spot = { popUSA: +S.pop.USA.toFixed(1), popCHN: +S.pop.CHN.toFixed(0),
    gdpUSA: +S.gdp.USA.toFixed(3), gdpCHN: +S.gdp.CHN.toFixed(3),
    gdpSUN: +S.gdp.SUN.toFixed(3), gdpJPN: +S.gdp.JPN.toFixed(3) };

  // G. 事件层 mods：setMod 改变 gdpBase，clearMod 还原
  const ENG = window.W1980_SIM;
  const b0 = ENG.gdpBase("USA", 1985, S2.P);
  ENG.setMod(S2, "USA", -2.0);
  const b1 = ENG.gdpBase("USA", 1985, S2.P);
  ENG.clearMod(S2, "USA");
  const b2 = ENG.gdpBase("USA", 1985, S2.P);
  out.mods = { delta: +(b1 - b0).toFixed(4), restored: Math.abs(b2 - b0) < 1e-9 };
  if (Math.abs((b1 - b0) - (-2.0)) > 1e-9) fail("mods", "setMod 未生效");
  if (!out.mods.restored) fail("mods", "clearMod 未还原");

  // H. 解体标记
  ENG.markDissolved(S2, "SUN", true);
  out.dissolved = ENG.isDissolved(S2, "SUN") === true && ENG.isDissolved(S2, "USA") === false;
  if (!out.dissolved) fail("dissolved", "解体标记不正确");

  // I. R2 T1 历史轨迹：纯追加记录，末值 = 当前值，且两次运行逐位一致
  const h = S.hist, h2 = S2.hist;
  out.hist = {
    len: (h && h.gdp && h.gdp.USA) ? h.gdp.USA.length : 0,
    lastEqGdp: !!(h && h.gdp.USA && h.gdp.USA[h.gdp.USA.length - 1] === S.gdp.USA),
    lastEqPop: !!(h && h.pop.CHN && h.pop.CHN[h.pop.CHN.length - 1] === S.pop.CHN),
    firstPositive: !!(h && h.gdp.USA && h.gdp.USA[0] > 0),
    histDeterministic: !!(h2 && h2.gdp.USA && h2.gdp.USA.length === 144 &&
      h2.gdp.USA.every((v, i) => v === h.gdp.USA[i])),
  };
  if (out.hist.len !== 144) fail("hist", "hist 长度 " + out.hist.len + " != 144（144 tick 应记录 144 个月）");
  if (!out.hist.lastEqGdp || !out.hist.lastEqPop) fail("hist", "轨迹末值与当前状态不一致");
  if (!out.hist.histDeterministic) fail("hist", "历史轨迹不确定（同种子两次运行不一致）");

  // J. R3 T1 全量序列化：往返无损（pop/gdp/rngState 精确；hist 有损但仅喂显示）
  const SJ = SIM.initState(D, 1980, 0);
  SIM.seedState(SJ, members, D.popStart);
  for (let i = 0; i < 40; i++) SIM.tick(SJ);
  const preState = members.map((k) => SJ.pop[k] + "|" + SJ.gdp[k]).join(",");
  const preHist = SJ.hist.gdp.USA.slice();
  const snap = SIM.serialize(SJ);
  const snapBytes = JSON.stringify(snap).length;
  const SK = SIM.initState(D, 1980, 0);
  SIM.seedState(SK, members, D.popStart);
  SIM.hydrate(SK, JSON.parse(JSON.stringify(snap)));
  const postState = members.map((k) => SK.pop[k] + "|" + SK.gdp[k]).join(",");
  const histOk = SK.hist.gdp.USA.length === preHist.length &&
    SK.hist.gdp.USA.every((v, i) => Math.abs(v - preHist[i]) <= 1e-5);
  const metaOk = SK.year === SJ.year && SK.month === SJ.month &&
    SK.rngState === SJ.rngState && SK.order.join() === SJ.order.join() &&
    SK.noiseSigma === SJ.noiseSigma;
  for (let i = 0; i < 20; i++) { SIM.tick(SJ); SIM.tick(SK); }
  const rtOk = members.every((k) => SJ.pop[k] === SK.pop[k] && SJ.gdp[k] === SK.gdp[k]);
  out.serializeRT = { stateExact: preState === postState, metaOk: metaOk, histOk: histOk,
    rtOk: rtOk, rngStateType: typeof snap.rngState, bytes: snapBytes,
    histLen: snap.histLen, orderLen: snap.order.length };
  if (preState !== postState) fail("serializeRT", "hydrate 后 pop/gdp != 序列化前（非无损）");
  if (!metaOk) fail("serializeRT", "year/month/rngState/order/noiseSigma 未完整还原");
  if (!histOk) fail("serializeRT", "hist 往返误差 > 1e-5");
  if (!rtOk) fail("serializeRT", "往返后继续 tick 的轨迹与不中断轨迹不一致");
  if (typeof snap.rngState !== "number") fail("serializeRT", "rngState 非数值（不可 JSON 化）");

  // K. 机制③ popMod：setPopMod 改变人口轨迹、clearPopMod 还原、serialize/hydrate 含 popMods 往返
  //    口径：popMod = 加性 pp/年（与 mods 平行），只进 pop 行，GDP 零影响。独立 S 实例避免污染 hist 断言。
  const PK = SIM.initState(D, 1980, 0);
  SIM.seedState(PK, members, D.popStart);
  const popBase0 = PK.pop.KWT;
  ENG.setPopMod(PK, "KWT", -25.0);
  for (let i = 0; i < 12; i++) SIM.tick(PK);
  const popWith = PK.pop.KWT;
  const popEff = (popWith / popBase0 - 1) * 100;             // 一年等效年化效果（含基数，负值=下降）
  ENG.clearPopMod(PK, "KWT");
  const popClear0 = PK.pop.KWT;
  for (let i = 0; i < 12; i++) SIM.tick(PK);
  const popAfterClear = PK.pop.KWT;
  // clear 恢复的是「修正项」而非人口水平：clear 后 12 个月只剩基线速率（KWT 基速约 −1%/年），
  // 其降幅应远小于 popMod 生效期（约 −23%）。这才是「clearPopMod 确实摘掉了修正」的正确断言。
  const clearDropPct = (popAfterClear / popClear0 - 1) * 100;
  // serialize 往返：在 popMod 生效中快照 → hydrate → popMods 仍在且后续轨迹一致
  const PR = SIM.initState(D, 1980, 0);
  SIM.seedState(PR, members, D.popStart);
  ENG.setPopMod(PR, "KWT", -25.0);
  for (let i = 0; i < 24; i++) SIM.tick(PR);
  const snapP = SIM.serialize(PR);
  const PQ = SIM.initState(D, 1980, 0);
  SIM.seedState(PQ, members, D.popStart);
  SIM.hydrate(PQ, JSON.parse(JSON.stringify(snapP)));
  const popModOk = PQ.P.popMods.KWT === -25.0 && PQ.pop.KWT === PR.pop.KWT;
  for (let i = 0; i < 12; i++) { SIM.tick(PR); SIM.tick(PQ); }
  const popModRtOk = PR.pop.KWT === PQ.pop.KWT;
  out.popMods = { popEffectPct: +popEff.toFixed(4), popDeclined: popWith < popBase0,
    clearDropPct: +clearDropPct.toFixed(4), clearedRestores: clearDropPct > -3,
    serializeCarries: popModOk, rtOk: popModRtOk };
  if (!(popWith < popBase0)) fail("popMods", "setPopMod(-25) 后人口未下降（popMod 未进 pop 行？）");
  if (!(clearDropPct > -3)) fail("popMods", "clearPopMod 后仍以 ~-23%/年 下降（修正未摘除）");
  if (!popModOk) fail("popMods", "serialize/hydrate 未携带 popMods");
  if (!popModRtOk) fail("popMods", "popMod 状态下 hydrate 后继续 tick 与不中断轨迹不一致");
}

console.log("SIMTEST " + JSON.stringify(out));
process.exit(out.ok ? 0 : 1);
