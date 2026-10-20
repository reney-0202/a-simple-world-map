// world1980 情报估算表（Phase C 的单一事实源）
//
// 为什么需要这一层：玩家看到的敌方数字全是**精确值** ——
// 对手的威望分、对手的军费、战线的精确优势。于是：
//   · 「情报」不存在 —— 信息没有质量，也就没有不确定性；
//   · 决策不是在赌判断，而是在照着读数调参；
//   · F 的威望竞赛被削弱（你总能准确知道对手分数）、
//     N1 的威慑可信度读的是对手军费的真值、
//     D 的作战方针建立在精确的战线读数上。
//
// 本表定义的是**雾**：你能准确知道自己的账本，但对手的数字只能靠估。
//
// 误差模型（全部确定性，零 RNG）：
//
//   err = base[field] × (1 − quality(subject))
//   est = truth + uniform(−1, 1) × err        // 哈希取自 (subject, field, 季度)
//
// 按**季度**取哈希桶：同一个季度内评估稳定（情报不是每月重估），
// 季度之间会漂移（世界在动）。误差区间 [est−err, est+err] 是诚实的全幅可信区间。
//
// quality 的来源（真实资源，不是装饰）：
//   · 特情预算（ST.intel.budget，隐藏行动花的同一种钱）→ 长期侦察能力；
//   · 「情报评估」行动（花政治资本）→ 对特定目标 12 个月定向提升；
//   · 玩家自己的国家 quality = 1（误差为 0：你知道自己的账本）。
(function (global) {
  "use strict";

  // 每个被估算的量：{ base, lo, hi, consumer }
  // base 是 quality = 0 时的全幅误差；consumer 必须指向一个真实消费者 ——
  // 「展示但没人用」正是这个项目一直在消灭的东西（见 S-16 的教训）。
  const FIELDS = {
    // 对手威望：威望榜 + 顶栏。0..100 的量表，6 分误差 = 一个稳健的区间
    prestige: { base: 6, lo: 0, hi: 100, zh: "威望", consumer: "prestige board + topbar + war panel" },
    // 战线优势：作战决策的输入。-100..100 的量表，雾最重的量
    control: { base: 18, lo: -100, hi: 100, zh: "战线优势", consumer: "ground war panel + operation penalties" },
    // 对手军费：核威慑可信度的输入。0..12 的百分点量表
    mil: { base: 1.2, lo: 0, hi: 12, zh: "军费占比", consumer: "nuclear credibility + war panel" }
  };

  const PARAMS = {
    // 特情预算 → 侦察能力：预算从 BUDGET_Q0 起算、跨 BUDGET_Q_SPAN 线性到 BUDGET_Q_MAX。
    // 质量永远有上限（QUALITY_CAP）：雾不可能完全散去。
    BUDGET_Q0: 15,
    BUDGET_Q_SPAN: 45,
    BUDGET_Q_MAX: 0.45,

    // 「情报评估」：花政治资本给单个目标加一层定向提升
    FOCUS_Q: 0.35,          // quality 增量
    FOCUS_MONTHS: 12,       // 持续月数
    FOCUS_MAX: 2,           // 同时最多对几个目标评估（迫使取舍）
    FOCUS_COST_PC: 10,      // 政治资本成本（与内政/威望工程/作战方针同一份预算）

    QUARTER: 3,             // 估计按季度刷新（情报不是每月重估）
    QUALITY_CAP: 0.85,      // quality 上限：雾永远不可能完全散去

    // 冒进惩罚（基于**估计值**而非真值做决策的代价）：
    // 当估计把己方形势高估超过 OPTIMISM_BAND 时，进攻会一头撞进有备之敌 ——
    // 强度被削、自身消耗加重。这就是「买情报」的真正理由。
    OPTIMISM_BAND: 12,
    OP_STRENGTH_CUT: 0.30,  // 最多削 30% 的推进强度
    OP_ATTR_PENALTY: 0.35   // 最多加重 0.35/月的自身额外消耗
  };

  global.W1980_ESTIMATES = { FIELDS: FIELDS, PARAMS: PARAMS };
})(typeof window !== "undefined" ? window : globalThis);
