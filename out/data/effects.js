"use strict";
/* world1980 事件效果统一词表（EFFECT VOCABULARY）· D（数据层评审）
 *
 * 背景：crises.js / agendas.js / ai.js 各自声明 effects 对象，键名分散在三个数据模块里，
 * 引擎侧（applyCrisisEffects / agenda 加成累计）按 typeof 逐个判断消费。这导致：
 *   · 拼错一个键 = 静默无效（没有任何地方会报错）；
 *   · 新增效果要在数据与引擎两处手工对齐，容易漏。
 *
 * 这里把「合法效果键 + 语义」收敛成单一事实源。数据模块与引擎都引用本表；
 * tools/validate_data.js 用它做构建期校验：数据里出现表外键 → 直接判失败。
 *
 * 分组（按消费者）：
 *   crisis   —— 危机抉择卡（data/crises.js → applyCrisisEffects）
 *   agenda   —— 国家议程（data/agendas.js → agenda 加成累计）
 *   ai       —— 反应式 AI 决策机（data/ai.js → 引擎 AI 结算）
 */
(function (global) {
  "use strict";

  // 每个条目：{ group, type, target, zh }  —— type 用于校验值类型，target 说明作用对象
  const EFFECTS = {
    // ---- crisis：危机抉择卡 ------------------------------------------------------
    tensionDelta: { group: "crisis", type: "number", target: "ST.ai.tensions[USA:SUN]", zh: "美苏双边张力增减（0-100）" },
    sunConservative: { group: "crisis", type: "number", target: "ST.domestic.sun.conservative", zh: "苏联保守派影响力" },
    sunReformist: { group: "crisis", type: "number", target: "ST.domestic.sun.reformist", zh: "苏联改革派影响力" },
    sunShortage: { group: "crisis", type: "number", target: "ST.domestic.sun.shortage", zh: "苏联物资短缺度" },
    usaCongressApproval: { group: "crisis", type: "number", target: "ST.domestic.usa.congressApproval", zh: "美国国会支持率" },
    stabilityBonus: { group: "crisis", type: "number", target: "ST.domestic.generals[*].stability", zh: "次极大国政局稳定度加成" },
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
    congressBonus: { group: "agenda", type: "number", target: "ST.domestic.usa.congressApproval", zh: "国会支持率加成" },
    decoupleImmunity: { group: "agenda", type: "boolean", target: "阵营脱钩震荡免疫", zh: "脱钩震荡免疫开关" },
    techSecurity: { group: "agenda", type: "number", target: "技术安全评级", zh: "技术安全评级加成" },
    // 注：agendas 的 effects 里还带一条 desc（效果摘要文案，与 crisis 的 summary 同类）。
    // 它不产生数值效果，但历史上一直放在 effects 内，故登记为「文案」类型以免误判为表外键。
    desc: { group: "agenda", type: "string", target: "议程效果摘要文案", zh: "效果摘要文案（非数值效果）" },

    // ---- ai：反应式 AI 决策机 ----------------------------------------------------
    ceasefire: { group: "ai", type: "boolean", target: "停火决策标记", zh: "停火开关" },
    economicRelief: { group: "ai", type: "number", target: "经济纾困强度", zh: "经济纾困强度" },
    embargoPenalty: { group: "ai", type: "number", target: "禁运反噬", zh: "禁运反噬强度" },
    multilateralEmbargo: { group: "ai", type: "string", target: "entKeys(...) 目标实体键", zh: "多边禁运目标（实体键）" },
    liberateKuwait: { group: "ai", type: "boolean", target: "解放科威特决策标记", zh: "解放科威特开关" },
    openChokepoint: { group: "ai", type: "boolean", target: "咽喉航道重开标记", zh: "重开咽喉航道开关" },
    restoreBorders: { group: "ai", type: "boolean", target: "边界复原标记", zh: "边界复原开关" }
  };

  global.W1980_EFFECTS = {
    EFFECTS: EFFECTS,
    /** 是否为合法效果键 */
    isEffect: function (k) { return Object.prototype.hasOwnProperty.call(EFFECTS, k); },
    /** 取某个键的声明（含 group/type/target/zh）；未知键返回 null */
    get: function (k) { return EFFECTS[k] || null; },
    /** 按消费者分组列出键名 */
    keysOf: function (group) {
      return Object.keys(EFFECTS).filter(function (k) { return !group || EFFECTS[k].group === group; });
    },
    /** 数据模块自检：返回 effects 对象里的表外键（拼写错误/过期键） */
    unknownKeys: function (effects) {
      if (!effects || typeof effects !== "object") return [];
      return Object.keys(effects).filter(function (k) { return !global.W1980_EFFECTS.isEffect(k); });
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
