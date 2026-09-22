"use strict";
/* world1980 · R4 后半 —— **参照校准门槛**（独立于标准回归基线）
 *
 * 运行：node engine/ref_gate.js   →  全过 exit 0；有违例 exit 1（并打印逐条违例）
 *
 * ## 它是什么
 * `docs/SIM.md §5` 待办 2 的落地：用**可溯源**参照（World Bank，见 docs/data-refs.md）
 * 判定人口与不变价 GDP 的年度增长形状，容差 **人口 ≤3% / GDP ≤15%**（沿用 §5 原定值，本批未放宽）。
 *
 * ## 它不是什么（**重要**）
 * - **不属于标准回归基线**。标准回归 = `engine/test_sim.js` + `engine/balance_report.js`
 *   + `pipeline/s8_verify.py` + `pipeline/s9_regress.py`（四项都必须 exit 0）。
 * - 本门槛**故意会红**：`SIM_POP_R` / `SIM_GDP_R` 尚未按参照重拟合（重拟合需重跑 `s6_export.py`，
 *   属下一批的显式豁免事项）。红了代表**未校准**，不代表代码坏了。
 * - 它**不修改任何数据**，只读 `out/data/sim.js` + `engine/ref_table.js`，只打印与返回 exit code。
 *
 * ## 判定口径
 * 逐年同比（YoY）而非窗口总量倍数 —— 原因见 `engine/ref_compare.js` 文件头（端点比法自带
 * ~0.9 年窗口长度偏差）。只对 `coverage === "direct"`（两项 12/12 年齐）的键判定；
 * `partial` / `none` 列出但不判定（无序列或口径断裂，理由见 docs/data-refs.md）。
 */
const fs = require("fs");
const path = require("path");
const REFC = require("./ref_compare.js");

const ROOT = path.join(__dirname, "..");
global.window = {};
function load(p) { eval(fs.readFileSync(p, "utf8")); }
load(path.join(ROOT, "out", "data", "sim.js"));
load(path.join(ROOT, "out", "engine", "sim.js"));
load(path.join(__dirname, "ref_table.js"));
const D = window.W1980_SIMDATA, SIM = window.W1980_SIM, REFS = window.W1980_REFS;

function main() {
  if (!D || !SIM || !REFS) { console.log("REFGATE {ok:false,reason:\"缺少 SIMDATA / SIM / REFS\"}"); return 1; }
  const members = Object.keys(D.popStart).sort();
  const run = REFC.runAndSample(SIM, D, members);
  const res = REFC.compare(run.snap, REFS);
  const M = REFS.meta;

  console.log("参照来源: %s", M.src);
  console.log("指标: pop=%s · gdp=%s（不变价基准年见 docs/data-refs.md）", M.indicators.pop, M.indicators.gdp);
  console.log("API lastupdated=%s · 取数日=%s · 参照表指纹=%s", M.apiLastUpdated, M.fetchedAt, REFC.refHash(REFS));
  console.log("覆盖（API 可得性）: direct=%d partial=%d none=%d；判定（>=%d 个同比年）: 人口 %d 键 / GDP %d 键",
    res.counts.direct, res.counts.partial, res.counts.none, res.minYears, res.judgedPop, res.judgedGdp);
  console.log("判定口径: 逐年同比(YoY) · 容差 人口<=%d%% / GDP<=%d%%", REFC.TOL.popPct, REFC.TOL.gdpPct);
  console.log("");

  const rows = Object.keys(res.perKey).filter((k) => res.perKey[k].gdpYoY !== null)
    .sort((a, b) => Math.abs(res.perKey[b].gdpYoY) - Math.abs(res.perKey[a].gdpYoY));
  const pad = (s, n) => String(s).padStart(n);
  const num = (v, n) => (v >= 0 ? "+" : "") + v.toFixed(n);
  console.log("最差 12 键（按 GDP 同比偏差绝对值）：");
  console.log("  键    年数(pop/gdp)  人口YoY%   GDPYoY%   端点倍数偏差(pop/gdp)% [仅参考]");
  for (const k of rows.slice(0, 12)) {
    const v = res.perKey[k];
    console.log("  %s  %s  %s %s   %s / %s", k.padEnd(4), pad(v.popYears + "/" + v.gdpYears, 6),
      pad(v.popYoY === null ? "n/a" : num(v.popYoY, 2), 8), pad(num(v.gdpYoY, 2), 8),
      v.popTotal === null ? "  n/a" : pad(num(v.popTotal, 1), 6), v.gdpTotal === null ? "  n/a" : pad(num(v.gdpTotal, 1), 6));
  }
  console.log("");
  // 分布（比"最差值"更能说明问题：是普遍性偏差还是少数极端国）
  const dist = (pick) => {
    const a = Object.keys(res.perKey).map((k) => pick(res.perKey[k])).filter((v) => v !== null)
      .map((v) => Math.abs(v)).sort((x, y) => x - y);
    const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    return { n: a.length, median: q(0.5), p90: q(0.9), max: a[a.length - 1] };
  };
  const dp = dist((v) => v.popYoY), dg = dist((v) => v.gdpYoY);
  console.log("分布（|偏差|）: 人口 n=%d 中位 %s / p90 %s / 最大 %s ｜ GDP n=%d 中位 %s / p90 %s / 最大 %s",
    dp.n, dp.median.toFixed(2), dp.p90.toFixed(2), dp.max.toFixed(2),
    dg.n, dg.median.toFixed(2), dg.p90.toFixed(2), dg.max.toFixed(2));
  console.log("最差值: 人口 %s%% / GDP %s%%", num(res.worstPopPct, 2), num(res.worstGdpPct, 2));

  // 诊断：端点倍数偏差里混了多少"窗口长度错配"？
  // 错配是**定义层面**的：引擎窗口 1979-12→1991-12 = **12 年**，参照 1980 年均→1991 年均 = **11 年**
  // （见 ref_compare.js 文件头）。但实测偏差与参照增速的相关 r 在重拟合前后为 −0.813 → +0.013，
  // 说明端点超限**主要由形状误差**主导（战争/油价冲击未建模），**不能**把错配当解释项。
  // 错配只说明"端点这个量不可比"，故判定只用 YoY，端点仅作参考。
  const pairs = Object.keys(res.perKey).map((k) => {
    const v = res.perKey[k], r = REFS.gdp[k], base = (REFS.gdpBase || {})[k];
    if (base !== 1980) return null;
    const g = (Math.pow(r[11] / r[0], 1 / 11) - 1) * 100;
    return { g: g, d: v.gdpTotal, artifact: 0.92 * g };
  }).filter((o) => o && o.d !== null);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mg = mean(pairs.map((o) => o.g)), md = mean(pairs.map((o) => o.d));
  let cv = 0, vg = 0, vd = 0;
  for (const o of pairs) { cv += (o.g - mg) * (o.d - md); vg += (o.g - mg) ** 2; vd += (o.d - md) ** 2; }
  const r = cv / Math.sqrt(vg * vd);
  console.log("诊断: 端点倍数偏差 vs 参照年均增速 r=%s（n=%d）", r.toFixed(3), pairs.length);
  console.log("      端点与 YoY 的差别是**定义性**的：引擎窗口 12 年（1979-12→1991-12）vs 参照 11 年（年均→年均）");
  console.log("      实测 r≈0（重拟合前后 −0.813 → +0.013）⇒ 端点超限由**形状误差**主导，不是该错配的解释；");
  console.log("      错配只说明端点量不可比 ⇒ **判定只用 YoY**，端点仅作参考。");
  console.log("");

  // 参考 · 起点对照（**仅报告**）：冻结的 §4 表 1980 人口 vs 参照 1980。
  // 为什么单列：起点人口是**冻结数据**（pipeline 产物），本批不许改；但溯源之后它第一次有了外部对照，
  // 差得多的地方（如 BTN/SAU）应在"重拟合批次"一并核 —— 可能是 §4 表口径或笔误，不能装看不见。
  const st = [];
  for (const k in REFS.pop) {
    if (REFS.coverage[k] !== "direct") continue;
    const a = D.popStart[k], b = REFS.pop[k][0];
    if (a === undefined || !(b > 0)) continue;
    st.push({ k: k, dev: (a / b - 1) * 100 });
  }
  st.sort((x, y) => Math.abs(y.dev) - Math.abs(x.dev));
  const ast = st.map((o) => Math.abs(o.dev)).sort((x, y) => x - y);
  console.log("参考 · 起点对照（§4 表 1980 人口 vs 参照 1980，n=%d，仅报告）:", st.length);
  console.log("      中位 %s%% / p90 %s%% / 最大 %s%%", ast[Math.floor(ast.length / 2)].toFixed(2),
    ast[Math.floor(ast.length * 0.9)].toFixed(2), ast[ast.length - 1].toFixed(2));
  console.log("      偏离最大的 6 键: %s", st.slice(0, 6).map((o) => o.k + ":" + o.dev.toFixed(1) + "%").join(" "));
  console.log("      读法: 差异大的键要分三类 —— ①实体口径不同（DEU=西德 vs WB 的德国序列，KHM/ETH 等战乱年估计分歧）；");
  console.log("            ②§4 表本身的估计偏差（BTN/SAU 量级可疑，**应在重拟合批次核**）；③四舍五入到百万级的正常差。");
  console.log("");

  const bad = [];
  if (res.popOver3.length) bad.push("人口超 3%：" + res.popOver3.length + " 键 → " + res.popOver3.join(" "));
  if (res.gdpOver15.length) bad.push("GDP 超 15%：" + res.gdpOver15.length + " 键 → " + res.gdpOver15.join(" "));
  const noneKeys = Object.keys(REFS.coverage).filter((k) => REFS.coverage[k] === "none").sort();
  console.log("未判定 %d 键（年数不足 %d）: %s", res.undecided.length, res.minYears,
    res.undecided.sort().join(" "));
  console.log("其中 API 无该国家码（政体已消失 / 无独立序列）%d 键: %s", noneKeys.length, noneKeys.join(" "));
  console.log("参考(不判定) · 端点倍数超限: 人口 %d 键 / GDP %d 键 —— %s",
    res.info.endpointPopOver3.length, res.info.endpointGdpOver15.length, res.info.endpointCaveat);
  console.log("");
  if (bad.length) {
    console.log("REFGATE {\"ok\":false,\"judgedPop\":%d,\"judgedGdp\":%d,\"worstPopPct\":%s,\"worstGdpPct\":%s,\"popOver\":%d,\"gdpOver\":%d}",
      res.judgedPop, res.judgedGdp, res.worstPopPct, res.worstGdpPct, res.popOver3.length, res.gdpOver15.length);
    for (const b of bad) console.log("  违例 · " + b);
    console.log("⇒ **未校准**：门槛红属预期（重拟合需重跑 s6_export.py，见 tasks/007 §附 / REPORT_R4B）。");
    return 1;
  }
  console.log("REFGATE {\"ok\":true,\"judgedPop\":%d,\"judgedGdp\":%d,\"worstPopPct\":%s,\"worstGdpPct\":%s}",
    res.judgedPop, res.judgedGdp, res.worstPopPct, res.worstGdpPct);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main: main };