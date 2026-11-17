// world1980 长引信计划表（Phase E 的单一事实源）
//
// 为什么需要这一层：44 年里只有 14 个剧本决策点（6 十字路口 + 8 危机卡，
// 约每 10 个月一次）。六条机制轴已经把被动月数变成有意义的**等待**，
// 但玩家主动**点火**的时刻仍然稀少 —— 大战略的节奏不是「被历史推着走」，
// 而是「现在埋下引信，三年后收割」。
//
// 长引信（long fuse）= 立即点火、数年后果的战略工程：
//   · 点火：一次性政治资本（与内政/威望工程/作战方针/主张输出同一份预算 ——
//     第六条取舍轴）；
//   · 燃烧：36–72 个月的 GDP 拖累（真金白银的机会成本）；
//   · 引爆：**结局由引爆当月的国势决定，不掷骰** ——
//     经济兑现 + 社会安定 = 辉煌；经济崩溃 + 动荡 = 惨败；中间 = 不了了之。
//     所以「什么时候点火」本身就是决策：经济好时点火稳赢，
//     经济差时点火是在赌翻盘。
//
// 引爆落点跨全部既有轴：威望（F）、感召力（S-17）、合法性/动荡（P1）、
// 威慑可信度（N1）、增长红利（P1 的 pmods 链）。每项引信踩不同的轴。
(function (global) {
  "use strict";

  // 每项长引信：
  //   months  —— 引信长度（≥24 个月，短于此不配叫长引信）
  //   cost    —— 点火的政治资本
  //   drag    —— 燃烧期每月 GDP 增速拖累（pp/年）
  //   good    —— 辉煌结局的效果（引爆时按国势全量兑现）
  //   bad     —— 惨败结局的效果（引爆时按国势兑现）
  //   bonus   —— 可选：持续性增长红利（{ gdpBonus, months }，走 pmods 链）
  const FUSES = {
    missile_modernization: {
      zh: "战略武器现代化", icon: "🚀", months: 48, cost: 20, drag: 0.35,
      good: { prestige: 8, credBonus: 4, appeal: 3 },
      bad: { prestige: -6, unrest: 3 },
      note: "新一代洲际导弹与潜射力量。点火即锁定四年预算，换一张长期的威慑底牌。"
    },
    tech_education: {
      zh: "教育与科技改革", icon: "🎓", months: 60, cost: 15, drag: 0.20,
      good: { appeal: 6, legitimacy: 4, prestige: 3 },
      bad: { prestige: -3, unrest: 4, legitimacy: -3 },
      note: "一代人的事：教材、实验室与留学潮。慢，但成功了没人能夺走。"
    },
    alliance_deepening: {
      zh: "联盟体系深化", icon: "🤝", months: 36, cost: 12, drag: 0.15,
      good: { credBonus: 5, prestige: 4, legitimacy: 2 },
      bad: { prestige: -4, appeal: -2 },
      note: "联合指挥、互操作与共同宣言。盟友的承诺是威慑可信度的另一半。"
    },
    energy_independence: {
      zh: "能源自主计划", icon: "⛽", months: 72, cost: 18, drag: 0.30,
      good: { prestige: 5, legitimacy: 3, unrest: -3 },
      bad: { prestige: -5, unrest: 3 },
      bonus: { gdpBonus: 0.35, months: 36 },
      note: "核电、煤田与战略储备。七十二个月的煎熬，换三年的能源红利。"
    },
    naval_expansion: {
      zh: "远洋海军建设", icon: "🚢", months: 42, cost: 16, drag: 0.28,
      good: { credBonus: 3, prestige: 6 },
      bad: { prestige: -6, unrest: 2 },
      note: "从近海到远洋：航母、补给链与海外存在。贵，而且会先被看见。"
    },
    welfare_compact: {
      zh: "社会契约重塑", icon: "🏥", months: 36, cost: 14, drag: 0.12,
      good: { legitimacy: 6, unrest: -5, appeal: 2 },
      bad: { prestige: -2, legitimacy: -4, unrest: 3 },
      note: "医疗、住房与养老金改革。兑现了就是执政合法性，拖黄了就是丑闻。"
    }
  };

  const PARAMS = {
    MAX_ACTIVE: 2,           // 同时点火的引信上限（与威望工程/主张输出一致的取舍形状）
    MIN_MONTHS: 24,          // 「长引信」的定义下限（校验器强制）

    // 引爆判定（确定性，零 RNG）：按引爆当月的国势分三档
    GOOD_SURPRISE: 1.0,      // 经济兑现：polEcon 落差 ≥ +1.0pp = 说到做到
    GOOD_UNREST: 40,         // 社会安定：动荡 ≤ 40
    BAD_SURPRISE: -1.5,      // 经济失约：落差 ≤ −1.5pp
    BAD_UNREST: 70,          // 社会失控：动荡 ≥ 70

    PARTIAL_SCALE: 0.5,      // 「不了了之」档：good 效果减半
    LOG_MAX: 24
  };

  // E2：长引信的 AI 侧（确定性规则，零 RNG，与 F2 的 AI_POLICY 同一模式）。
  // 玩家能点火埋下 36–72 月的战略工程，对手此前只会旁观 —— 时间尺度的赌注是单方面的。
  // 本表让对手也埋引信：养得起就点火、养不起砍最贵的、粘性防翻烧饼。
  // 没有「分数竞赛」也没有反向漂移 —— 引信是赌国运，不是位置性计分；
  // 真实代价仍是 GDP 拖累进 pmods（P2/D2 读得到）。
  //
  //   WANT_ACTIVE   养得起时希望维持几条燃烧中的引信（通常 1，逼出取舍）
  //   STRAIN_MAX    经济压力到此 → 砍掉拖累最大的一条
  //   MIN_MONTHS    新引信粘性窗口：最近一项不满此月数 → 不再加新的
  //   PICK_*_STRAIN 压力分档：压力越低越敢上大工程
  //   PICK          三档候选（档内按 drag 降序意图，取第一个未在烧的）
  //
  // AI 不花政治资本（那是玩家的节流阀），但照常付 GDP 拖累、照常按国势引爆。
  const AI_POLICY = {
    WANT_ACTIVE: 1,
    STRAIN_MAX: 0.7,
    MIN_MONTHS: 12,
    PICK_HI_STRAIN: 0.3,
    PICK_MID_STRAIN: 0.55,
    PICK: {
      hi: ["missile_modernization", "energy_independence"],
      mid: ["naval_expansion", "tech_education"],
      lo: ["alliance_deepening", "welfare_compact"]
    }
  };

  global.W1980_FUSES = { FUSES: FUSES, PARAMS: PARAMS, AI_POLICY: AI_POLICY };
})(typeof window !== "undefined" ? window : globalThis);
