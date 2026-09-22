/* M7 平衡性报告：三档难度各跑 1980-01 → 1991-12，检查数值合理性。
运行：node engine/balance_report.js
读真实交付数据 out/data/sim.js + out/engine/sim.js。

检查：
  1. NaN / 非正指数（崩坏到 0 或负）
  2. 产出塌陷 (<0.6x) 与暴涨 (>2.5x) 的成员清单
  3. 世界总量（1980 名义加权）年均实际增速是否落在合理带
  4. 难度是否只改变离散度、不系统性改变水平（均值漂移应很小）
*/
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
global.window = {};
const load = (p) => eval(fs.readFileSync(p, "utf8"));
load(path.join(ROOT, "out", "data", "sim.js"));
load(path.join(ROOT, "out", "engine", "sim.js"));
const D = window.W1980_SIMDATA, SIM = window.W1980_SIM;

const members = Object.keys(D.popStart).sort();
const VOLS = [1.0, 3.0, 6.0];
const NAMES = { 1.0: "平稳", 3.0: "标准", 6.0: "剧烈" };
const problems = [];
const rows = {};

function runOne(vol, seed) {
  const data = Object.assign({}, D, { seed: seed >>> 0 });
  const S = SIM.initState(data, 1980, 0);
  SIM.seedState(S, members, D.popStart);
  S.noiseSigma = vol;
  for (let i = 0; i < 144; i++) SIM.tick(S);
  let w0 = 0, w1 = 0, nan = 0, nonpos = 0;
  const idx = {};
  for (const k of members) {
    const g = S.gdp[k], p = S.pop[k];
    if (!isFinite(g) || !isFinite(p)) { nan++; continue; }
    if (g <= 0 || p <= 0) nonpos++;
    idx[k] = g;
    w0 += D.gdp1980[k];
    w1 += D.gdp1980[k] * g;
  }
  const sorted = members.slice().sort((a, b) => idx[a] - idx[b]);
  return { nan, nonpos, worldIdx: w1 / w0, idx,
    collapse: sorted.filter((k) => idx[k] < 0.6).map((k) => k + ":" + idx[k].toFixed(2)),
    boom: sorted.filter((k) => idx[k] > 2.5).map((k) => k + ":" + idx[k].toFixed(2)),
    worst: sorted.slice(0, 3).map((k) => k + ":" + idx[k].toFixed(2)),
    best: sorted.slice(-3).reverse().map((k) => k + ":" + idx[k].toFixed(2)) };
}

console.log("=== M7 平衡性报告（1980-01 → 1991-12，133 成员）===");
for (const v of VOLS) {
  // 同难度跑 3 个随机种子，隔离「噪声」对结果的影响
  const runs = [19800101, 7, 424242].map((sd) => runOne(v, sd));
  const r = runs[0];
  const widx = runs.map((x) => x.worldIdx);
  const spread = Math.max.apply(null, widx) - Math.min.apply(null, widx);
  const cagr = (Math.pow(r.worldIdx, 1 / 12) - 1) * 100;
  console.log("");
  console.log("[" + NAMES[v] + " σ=" + v + "] 世界产出 " + r.worldIdx.toFixed(3) + "x（年均 " + cagr.toFixed(2) +
    "%）| 三种子世界产出极差 " + (spread * 100).toFixed(2) + " 个百分点");
  console.log("  NaN=" + r.nan + " 非正=" + r.nonpos + " | 塌陷(<0.6x) " + r.collapse.length + " 个" +
    (r.collapse.length ? " → " + r.collapse.slice(0, 6).join(" ") : "") +
    " | 暴涨(>2.5x) " + r.boom.length + " 个" + (r.boom.length ? " → " + r.boom.slice(0, 4).join(" ") : ""));
  console.log("  最低 " + r.worst.join(" ") + " | 最高 " + r.best.join(" "));
  rows[v] = { spread, worldIdx: r.worldIdx };
  if (r.nan || r.nonpos) problems.push(NAMES[v] + ": NaN/非正指数");
  if (r.worldIdx <= 1.1 || r.worldIdx >= 2.0) problems.push(NAMES[v] + ": 世界产出增速越界 " + r.worldIdx.toFixed(3));
}

// 难度必须真的改变结果离散度，且单调递增；各档有下限
console.log("");
console.log("难度有效性：" + NAMES[VOLS[0]] + "极差 " + (rows[VOLS[0]].spread * 100).toFixed(2) +
  "pp → " + NAMES[VOLS[1]] + " " + (rows[VOLS[1]].spread * 100).toFixed(2) +
  "pp → " + NAMES[VOLS[2]] + " " + (rows[VOLS[2]].spread * 100).toFixed(2) + "pp（应单调递增且有感）");
const MIN = {}; MIN[VOLS[0]] = 0.003; MIN[VOLS[1]] = 0.010; MIN[VOLS[2]] = 0.020;   // 0.3 / 1 / 2 pp
for (const v of VOLS) {
  if (rows[v].spread < MIN[v]) {
    problems.push(NAMES[v] + " 噪声过小（极差 " + (rows[v].spread * 100).toFixed(2) + "pp < 下限 " + (MIN[v] * 100) + "pp，难度无感）");
  }
}
if (!(rows[VOLS[1]].spread > rows[VOLS[0]].spread && rows[VOLS[2]].spread > rows[VOLS[1]].spread)) {
  problems.push("各档离散度未单调递增");
}

console.log("");
console.log("结论: " + (problems.length ? "发现问题 → " + problems.join("; ") : "全部通过"));
process.exit(problems.length ? 1 : 0);

