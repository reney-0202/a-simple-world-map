"use strict";
/* world1980 事件效果统一词表（EFFECT VOCABULARY）· D（数据层评审）
 *
 * 背景：crises.js / agendas.js / ai.js 各自声明 effects 对象，键名分散在三个数据模块里，
 * 引擎侧（applyCrisisEffects / agenda 加成累计 / 安理会决议效应）按 typeof 逐个判断消费。这导致：
 *   · 拼错一个键 = 静默无效（没有任何地方会报错）；
 *   · 新增效果要在数据与引擎两处手工对齐，容易漏。
 *
 * 这里把「合法效果键 + 语义」收敛成单一事实源。数据模块与引擎都引用本表。
 *
 * 双保险（Phase I）：
 *   1. 构建期 —— tools/validate_data.js 扫全部数据站点，表外键直接判 CI 失败；
 *   2. 运行期 —— 本模块的 report() / auditData() 在浏览器里做同一件事，
 *      并写入 violations 注册表。auditData() 覆盖「从未被玩到」的数据分支，
 *      探针断言 violations 为空即可把拼写错误挡在发布之前。
 *
 * 分组（按消费者）：
 *   crisis   —— 危机抉择卡（data/crises.js → applyCrisisEffects）
 *   agenda   —— 国家议程（data/agendas.js → calcAgendaBonuses）
 *   ai       —— 安理会决议与 AI 决策（data/ai.js → accUnscResolutionEffects）
 */
(function (global) {
  "use strict";

  // 每个条目：{ group, type, target, zh }  —— type 用于说明值形态，target 说明作用对象
  const EFFECTS = {
    // ---- crisis：危机抉择卡 ------------------------------------------------------
    tensionDelta: { group: "crisis", type: "number", target: "ST.ai.tensions[USA:SUN]", zh: "美苏双边张力增减（0-100）" },
    sunConservative: { group: "crisis", type: "number", target: "ST.domestic.sun.conservative", zh: "苏联保守派影响力" },
    sunReformist: { group: "crisis", type: "number", target: "ST.domestic.sun.reformist", zh: "苏联改革派影响力" },
    sunShortage: { group: "crisis", type: "number", target: "ST.domestic.sun.shortage", zh: "苏联物资短缺度" },
    usaCongressApproval: { group: "crisis", type: "number", target: "ST.domestic.usa.congressApproval", zh: "美国国会支持率" },
    stabilityBonus: { group: "crisis", type: "number", target: "ST.domestic.generals[*].stability（通用实体）；七大国为 *.unrest -= 值×0.4", zh: "次极大国政局稳定度加成" },
    cocomStrict: { group: "crisis", type: "boolean", target: "ST.cocom.strict", zh: "巴统极严格出口管制开关" },
    defconRisk: { group: "crisis", type: "number", target: "展示用（核威慑时钟）", zh: "核威慑风险读数" },
    natoCohesion: { group: "crisis", type: "number", target: "展示用（阵营凝聚）", zh: "北约凝聚力" },
    middleEastTension: { group: "crisis", type: "number", target: "展示用（地区张力）", zh: "中东局势张力" },
    gbrPopularity: { group: "crisis", type: "number", target: "展示用", zh: "英国国内民意" },
    cubanTension: { group: "crisis", type: "number", target: "展示用", zh: "古巴-美国关系张力" },
    usSanctionPressure: { group: "crisis", type: "number", target: "展示用", zh: "美国制裁压力" },
    summary: { group: "crisis", type: "string", target: "收件箱文案", zh: "效果摘要文案（非数值效果）" },

    // ---- agenda：国家议程 --------------------------------------------------------
    gdpBonus: { group: "agenda", type: "number", target: "P.gdp 乘性加成", zh: "GDP 增速加成（pp/年）" },
    reserveMonthly: { group: "agenda", type: "number", target: "ST.reserves 月度现金流", zh: "月度外汇储备变动" },
    domesticShortage: { group: "agenda", type: "number", target: "ST.domestic.*.shortage", zh: "国内短缺度" },
    congressBonus: { group: "agenda", type: "number", target: "拥有 congressApproval 的内政模型（当前仅 USA）", zh: "国会支持率加成" },
    decoupleImmunity: { group: "agenda", type: "boolean", target: "阵营脱钩震荡免疫", zh: "脱钩震荡免疫开关" },
    techSecurity: { group: "agenda", type: "number", target: "技术安全评级", zh: "技术安全评级加成" },
    // 注：agendas 的 effects 里还带一条 desc（效果摘要文案，与 crisis 的 summary 同类）。
    // 它不产生数值效果，但历史上一直放在 effects 内，故登记为「文案」类型以免误判为表外键。
    desc: { group: "agenda", type: "string", target: "议程效果摘要文案", zh: "效果摘要文案（非数值效果）" },

    // ---- ai：安理会决议与 AI 决策机 ----------------------------------------------
    // 实际数据源是 ai.js 的 UNSC_RESOLUTIONS（res_598 / res_660 / res_502 / res_peace_mediation），
    // 消费方是 03-decisions.js 的 accUnscResolutionEffects。
    ceasefire: { group: "ai", type: "boolean", target: "停火决策标记", zh: "停火开关" },
    economicRelief: { group: "ai", type: "number", target: "经济纾困强度", zh: "经济纾困强度" },
    embargoPenalty: { group: "ai", type: "number", target: "禁运反噬", zh: "禁运反噬强度" },
    multilateralEmbargo: { group: "ai", type: "string", target: "entKeys(...) 目标实体键", zh: "多边禁运目标（实体键）" },
    liberateKuwait: { group: "ai", type: "boolean", target: "解放科威特决策标记", zh: "解放科威特开关" },
    openChokepoint: { group: "ai", type: "string", target: "咽喉航道 id", zh: "重开咽喉航道开关" },
    restoreBorders: { group: "ai", type: "string[]", target: "实体键数组", zh: "边界复原目标" }
  };

  const violations = [];          // [{ label, keys }] —— 每个站点只记一次
  const seen = new Set();         // 去重键，避免每月重复计入同一站点
  let strict = false;             // 探针/开发模式：同时向控制台报错

  function isEffect(k) { return Object.prototype.hasOwnProperty.call(EFFECTS, k); }

  /** 数据模块自检：返回 effects 对象里的表外键（拼写错误/过期键） */
  function unknownKeys(effects) {
    if (!effects || typeof effects !== "object") return [];
    return Object.keys(effects).filter(function (k) { return !isEffect(k); });
  }

  /**
   * 运行期站点登记：把 effects 对象交给词表检查。
   * 同一站点（label + 表外键集合）只登记一次，因此可以安全地在每月结算里调用。
   * @returns {string[]} 表外键（空数组 = 合规）
   */
  function report(label, effects) {
    const unk = unknownKeys(effects);
    if (!unk.length) return unk;
    const key = String(label) + "|" + unk.join(",");
    if (seen.has(key)) return unk;
    seen.add(key);
    violations.push({ label: String(label), keys: unk });
    if (strict && typeof console !== "undefined" && console.error) {
      console.error("[W1980] 未登记效果键 @ " + label + "：" + unk.join(", ") + "（合法键见 data/effects.js）");
    }
    return unk;
  }

  /** 遍历 AI 教条里任意深度的 effects（教条未来若加 effects 也自动纳入）。 */
  function walkDoctrines(o, label, out) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(function (v, i) { walkDoctrines(v, label + "[" + i + "]", out); }); return; }
    if (o.effects && typeof o.effects === "object") out.push([label, o.effects]);
    for (const k of Object.keys(o)) walkDoctrines(o[k], label + "." + k, out);
  }

  /**
   * 运行期全量审计：把「数据里声明过的每一个 effects 站点」都过一遍词表，
   * 包括那些在本局里从未被触发的分支。构建期校验器做同样的事；
   * 这里做是为了让「改了数据但没跑 CI」也能在浏览器里立刻暴露。
   * @returns {{sites:number, keys:number, violations:number}}
   */
  function auditData() {
    const sites = [];
    const CRISES = global.W1980_CRISES;
    if (CRISES && CRISES.list) {
      for (const c of CRISES.list) for (const o of (c.options || [])) sites.push(["crises " + c.id + " tier" + o.tier, o.effects]);
    }
    const AGD = (global.W1980_AGENDAS || {}).database || {};
    for (const ck of Object.keys(AGD)) {
      for (const a of (AGD[ck] || [])) sites.push(["agenda " + ck + "/" + a.id, a.effects]);
    }
    const U = (global.W1980_AI || {}).UNSC_RESOLUTIONS || {};
    for (const id of Object.keys(U)) sites.push(["unsc " + id, U[id].effects]);
    walkDoctrines((global.W1980_AI || {}).AI_DOCTRINES || {}, "ai doctrine", sites);

    let keys = 0;
    for (const s of sites) keys += report(s[0], s[1]).length;
    return { sites: sites.length, keys: keys, violations: violations.length };
  }

  global.W1980_EFFECTS = {
    EFFECTS: EFFECTS,
    isEffect: isEffect,
    get: function (k) { return EFFECTS[k] || null; },
    keysOf: function (group) {
      return Object.keys(EFFECTS).filter(function (k) { return !group || EFFECTS[k].group === group; });
    },
    unknownKeys: unknownKeys,
    // ---- 运行期双保险 ----------------------------------------------------------
    violations: violations,
    report: report,
    auditData: auditData,
    setStrict: function (v) { strict = !!v; },
    isStrict: function () { return strict; },
    isClean: function () { return violations.length === 0; },
    resetViolations: function () { violations.length = 0; seen.clear(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
