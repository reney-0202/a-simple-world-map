"use strict";
/* world1980 M4 — 仿真引擎核心（纯逻辑，无 DOM，可单测）。
 * 输入：window.W1980_SIMDATA（s6_export 从 pipeline/common.py SIM_* 导出）
 * 模型：成员级（133）人口指数增长 + GDP 实际产出指数；时变修正
 *       （油价双端通道 机制批次①、世界衰退 1982/1991、苏东停滞、中国改革+治理整顿）。
 * 确定性：mulberry32 PRNG + Box-Muller 高斯；同种子 + 同成员顺序 → 逐位一致。
 * 注意：与 Python 原型 work/_sim_proto.py 的随机流**不同**（Py random.gauss vs Box-Muller），
 *       因此两边轨迹只应在分布意义上一致，不可期望逐位相同。跨实现比对应比较统计量。
 * 校准状态：见 docs/SIM.md §5 —— 参数已按 World Bank 参照重拟合（R4C，refHash 2c870470），
 *       独立校准门槛 engine/ref_gate.js 仍红（机制缺口，见 REPORT_R4C §4）；不得称为史实校准通过。
 */
(function () {
  // R3 T1：PRNG 由闭包改为**状态字段** `state.rngState`（闭包不可序列化 → 全量存档做不到）。
  // 等价性：与旧 mulberry32 闭包逐步同构（同一常数、同一位运算顺序），故随机流**逐位不变**
  // —— 证据见 engine/test_sim.js 的 spot 值断言（改前后必须一字不差）。
  function rngStep(state) {
    let a = state.rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    state.rngState = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(state) {          // Box-Muller（消费顺序与旧版一致：先 u 后 v）
    let u = 0, v = 0;
    while (u === 0) u = rngStep(state);
    while (v === 0) v = rngStep(state);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const r5 = (v) => Math.round(v * 1e5) / 1e5;     // hist.gdp 存档精度（有损，见 tasks/005 §T1）
  const r3 = (v) => Math.round(v * 1e3) / 1e3;     // hist.pop 存档精度（有损）

  // R2 T1：成员级月度历史轨迹上限。144 tick 即整局长度；240 给 20 年余量，
  // 同时兜住「simLoop 无 1991 守卫」（REVIEW-FULL P3-2）导致的无限增长。
  const HIST_MAX = 240;

  // 与 Python 原型一致的时变 GDP 基线（%/年）；P.mods 为事件层注入的加性修正（百分点/年），对所有 key 生效
  function gdpBase(key, year, P) {
    let g;
    if (key === "SUN") g = 2.0 - (year - 1980) * 0.14;                 // 停滞
    else if (P.sunSet.has(key)) g = 1.6 - (year - 1980) * 0.05;        // 卫星国
    else {
      g = P.gdpBase[key];
      if (g === undefined) throw new Error("gdpBase: 参数缺失 " + key);   // 缺参数必须响亮失败
      // 机制批次①（tasks/009）：油价双端 —— 替换旧「1980-85 +1.5 / 1986 后 -2.2 两段常数 + 进口国 -0.25 镜像」。
      // 双通道：oilChg = 油价同比%（对「变化」响应，如 ARE）；oilLvl = log(P/P1979)×100（对「水平」响应，如 OPEC 配额国 SAU/NGA）。
      // 逐键弹性 [同比 ey, 水平 el]，至多一条非零；进口国无条目 = 零响应（参照实测最优 e≈0，旧镜像为伪机制）。
      const oe = P.oilElast[key];
      if (oe) {
        // E（玩法评审）：沙盒模式 —— oilChg/oilLvl 只覆盖 1980–1991（12 项）。原先越界取到
        // undefined → NaN，令 11 个产油国的 gdp 变 NaN 并连带 ramp() 崩溃（沙盒推进的真实阻断点）。
        // 语义：史实窗口之外，油价「水平」保持末值（不再有新冲击），「同比」归零
        // （否则最后一次 -15.6% 的同比会年年重复施加）。此分支只影响 year>=1992，
        // 而该区间在终局（1991-12）之前不可达，故史实路径逐位不变。
        const span = P.oilChg.length;
        const oi = year - 1980;
        if (oi < span) g += oe[0] * P.oilChg[oi] + oe[1] * P.oilLvl[oi];
        else g += oe[1] * P.oilLvl[span - 1];
      }
    }
    if (year === 1982) g += (key === "SUN" || key === "CHN") ? -0.3 : -1.5;   // 世界衰退（苏/中隔绝）
    if (year === 1991) g += (key === "SUN" || key === "CHN") ? -0.5 : -1.0;
    if (key === "CHN") {                                            // 改革 + 治理整顿（覆盖衰退项）
      g = 4.0 + Math.min(4.5, (year - 1980) * 0.75);
      if (year === 1989 || year === 1990) g -= 3.0;
    }
    if (P.mods && P.mods[key]) g += P.mods[key];                       // 事件层加性修正（含 SUN/卫星国）
    if (P.pmods && P.pmods[key]) g += P.pmods[key];                    // R3：玩家决策层（与事件层**分离**，互不覆盖）
    return g;
  }

  // state = {year, month, pop:{k:v}, gdp:{k:v}, rngState, P, noiseSigma, hist, order}
  function initState(data, startYear, startMonth) {
    const P = {
      popRate: data.popRate, gdpBase: data.gdpBase,
      // 机制批次①：油价双端通道与逐键弹性（缺省零响应）。通道表缺失则响亮失败（防 NaN 悄悄进轨迹）。
      oilElast: data.oilElast || {}, oilChg: data.oilChg, oilLvl: data.oilLvl,
      sunSet: new Set(data.sunSats),
      mods: {},                       // 事件层加性修正 {key: 百分点/年}（GDP 侧）
      pmods: {},                      // R3：玩家决策层加性修正 {key: 百分点/年}（与 mods 分开，避免互相覆盖）
      popMods: {},                    // 机制③（tasks/011）：事件层人口加性修正 {key: 百分点/年}（与 mods 平行，只进 pop 行）
    };
    if (Object.keys(P.oilElast).length && (!data.oilChg || !data.oilLvl))
      throw new Error("initState: oilElast 非空但缺 oilChg/oilLvl 通道表");
    return {
      P: P,
      year: (startYear === undefined ? 1980 : startYear),
      // month 语义：0 = 起始月尚未结算（首次 tick 结算 1980-01）；1..12 = 已结算到该月。
      // 注意不能写 `startMonth || 0`，否则传入的 0 会被误判缺省。
      month: (startMonth === undefined ? 0 : startMonth),
      pop: {}, gdp: {}, order: null,
      // R2 T1：月度历史轨迹 {pop:{k:[…]}, gdp:{k:[…]}}（纯观测数据，不参与 tick 计算）
      hist: { pop: {}, gdp: {} },
      rngState: data.seed >>> 0,     // R3 T1：PRNG 状态（数值、可 JSON 化）
      noiseSigma: 0.45,              // 年化 GDP 增速标准差（百分点）
    };
  }

  function seedState(state, members, popInit) {
    // 排序：与 Python 原型 sorted(table.keys()) 对齐，保证随机数消费顺序可复现、可比
    state.order = members.slice().sort();
    for (const k of state.order) {
      if (popInit[k] === undefined) throw new Error("seedState: popStart 缺少 " + k);
      state.pop[k] = popInit[k]; state.gdp[k] = 1.0;
    }
    return state;
  }

  // 推进一个月
  function tick(state) {
    state.month += 1;
    if (state.month > 12) { state.month = 1; state.year += 1; }
    const P = state.P, yr = state.year;
    for (const k of state.order) {
      // 机制③：事件层人口修正 popMods（加性 pp/年）并入 pop 行；与 GDP 侧 mods 平行、只进人口
      const pr = P.popRate[k] + (P.popMods[k] || 0);
      state.pop[k] *= (1.0 + pr / 100.0 / 12.0);
      // 年化 σ = noiseSigma（百分点），均摊到 12 个月：月度速率 = (基线 + N(0,σ)) /100 /12
      // （曾误写为 gauss*σ/12 再 /100/12 → 实际 σ 缩小 12 倍，随机项几乎失效）
      const g = (gdpBase(k, yr, P) + gauss(state) * state.noiseSigma) / 100.0 / 12.0;
      state.gdp[k] *= (1.0 + g);
    }
    // R2 T1：记录本月轨迹。**纯追加、不消费 rng** → 不改变随机流消费顺序，确定性契约不变
    // （同种子逐位一致仍成立；simReset/simFastForward 重放会重建出完全相同的历史）。
    const H = state.hist;
    if (H) {
      for (const k of state.order) {
        let hp = H.pop[k], hg = H.gdp[k];
        if (hp === undefined) { hp = H.pop[k] = []; hg = H.gdp[k] = []; }
        hp.push(state.pop[k]); hg.push(state.gdp[k]);
        if (hp.length > HIST_MAX) { hp.shift(); hg.shift(); }
      }
    }
    return state;
  }

  // ---- R3 T1：全量状态序列化（存档用；取代 R1/R2 的「日期+UI+难度 → 确定性重放」方案）----
  // 精度说明（**有损与否必须写清**）：pop/gdp/rngState/mods/dissolved 为**无损**；
  // hist 为**有损**（gdp 取 5 位、pop 取 3 位小数）——它只喂显示（增速/曲线/变化模式），
  // 不参与 tick 计算，故不影响轨迹复现。权威值永远是 pop/gdp。
  function serialize(state) {
    const o = { v: 2, year: state.year, month: state.month,
      rngState: state.rngState | 0, noiseSigma: state.noiseSigma,
      order: state.order.slice(), pop: {}, gdp: {}, mods: {}, pmods: {}, popMods: {}, dissolved: {},
      hist: { gdp: [], pop: [] }, histLen: 0 };
    for (let i = 0; i < state.order.length; i++) {
      const k = state.order[i];
      o.pop[k] = state.pop[k];
      o.gdp[k] = state.gdp[k];
      const hg = state.hist.gdp[k] || [], hp = state.hist.pop[k] || [];
      if (hg.length > o.histLen) o.histLen = hg.length;
      o.hist.gdp.push(hg.map(r5));
      o.hist.pop.push(hp.map(r3));
    }
    for (const k in state.P.mods) o.mods[k] = state.P.mods[k];
    for (const k in state.P.pmods) o.pmods[k] = state.P.pmods[k];
    for (const k in state.P.popMods) o.popMods[k] = state.P.popMods[k];
    for (const k in (state.dissolved || {})) o.dissolved[k] = state.dissolved[k];
    return o;
  }
  // 就地还原（state 需先经 initState/seedState 建好 P）
  function hydrate(state, o) {
    if (!o || o.v !== 2) throw new Error("hydrate: 不支持的存档版本 v=" + (o && o.v));
    state.year = o.year; state.month = o.month;
    state.rngState = o.rngState | 0;
    if (typeof o.noiseSigma === "number") state.noiseSigma = o.noiseSigma;
    state.order = (o.order || []).slice();
    state.pop = {}; state.gdp = {};
    for (const k in o.pop) state.pop[k] = o.pop[k];
    for (const k in o.gdp) state.gdp[k] = o.gdp[k];
    state.P.mods = {};
    for (const k in o.mods) state.P.mods[k] = o.mods[k];
    state.P.pmods = {};
    for (const k in o.pmods) state.P.pmods[k] = o.pmods[k];
    state.P.popMods = {};
    for (const k in (o.popMods || {})) state.P.popMods[k] = o.popMods[k];   // 机制③：旧存档缺省 = 空（该时点本无人口事件）
    state.dissolved = {};
    for (const k in o.dissolved) state.dissolved[k] = o.dissolved[k];
    state.hist = { pop: {}, gdp: {} };
    if (o.hist) {
      for (let i = 0; i < state.order.length; i++) {
        const k = state.order[i];
        state.hist.gdp[k] = (o.hist.gdp[i] || []).slice();
        state.hist.pop[k] = (o.hist.pop[i] || []).slice();
      }
    }
    return state;
  }

  // 事件层 API：加性增速修正（百分点/年）与一次性产出冲击（乘数）
  function setMod(state, key, pp) { state.P.mods[key] = pp; }
  function clearMod(state, key) { delete state.P.mods[key]; }
  // 机制③：事件层人口修正（与 mods 平行，只进 pop 行；tasks/011）
  function setPopMod(state, key, pp) { state.P.popMods[key] = pp; }
  function clearPopMod(state, key) { delete state.P.popMods[key]; }
  // R3：玩家决策层（与事件层分离，见 gdpBase）
  function setPMod(state, key, pp) { state.P.pmods[key] = pp; }
  function clearPMod(state, key) { delete state.P.pmods[key]; }
  function pmap(state) { return state.P.pmods; }   // 供 UI 清空决策层（取快照后逐个 clearPMod）
  function applyShock(state, key, mult) { state.gdp[key] *= mult; }
  // 解体标记：SUN 在 1991-12 后标记为已解体（仅显示/统计层；成员经济本就独立结算）
  function markDissolved(state, key, on) { state.dissolved = state.dissolved || {}; state.dissolved[key] = !!on; }
  function isDissolved(state, key) { return !!(state.dissolved && state.dissolved[key]); }

  window.W1980_SIM = { initState: initState, seedState: seedState, tick: tick, gdpBase: gdpBase,
    setMod: setMod, clearMod: clearMod, applyShock: applyShock,
    setPopMod: setPopMod, clearPopMod: clearPopMod,
    setPMod: setPMod, clearPMod: clearPMod, pmap: pmap,
    markDissolved: markDissolved, isDissolved: isDissolved,
    serialize: serialize, hydrate: hydrate, HIST_MAX: HIST_MAX };
})();
