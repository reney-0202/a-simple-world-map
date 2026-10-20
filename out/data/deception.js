// world1980 情报误报表（Phase C2 的单一事实源）
//
// C（情报估算）建模了**诚实的雾**：估计值围绕真值波动，误差区间永远罩住真值。
// 但真实的冷战情报不是「有噪声的测量」，而是**有人在撒谎**：
// 苏联的军事演习故意让西方高估、美国的「星球大战」宣传让苏联以为差距更大、
// 马岛的战报被双方各执一词。雾的最后一面是 —— **雾不总是诚实的**。
//
// 本表定义「欺敌 / 反情报」行动：
//
//   撒谎（deception）—— 让**除自己以外的读者**的估计值带方向性偏差
//   甄别（counter-intel）—— 花政治资本买一段「照妖镜」时期：识破并清除
//                         针对自己的欺敌，并挡住新的欺敌
//
// 为什么偏差必须是方向性的：噪声让估计值在真值附近摆动（判断变难），
// 误报让估计值**系统性偏向一边**（判断变错）。前者考验耐心，后者考验胆识 ——
// 玩家必须决定信不信自己的读数。
//
// 撒谎有曝光风险（确定性哈希）：欺敌行动败露 = 威望 + 感召力双扣 ——
// 被抓到撒谎比没撒成更丢脸。
(function (global) {
  "use strict";

  // 每项行动：
  //   cost    —— 政治资本（与内政/威望工程/作战方针/主张输出/情报评估/长引信
  //              同一份预算 —— 第七条取舍轴）
  //   months  —— 欺敌效果持续月数（counter_intel 是自己的护盾期）
  //   field   —— 被污染的量（mil / prestige / control）
  //   bias    —— 偏差幅度（control 侧以「读者所站侧」计：正 = 读者看起来更好）
  //   risk    —— 曝光概率（确定性哈希，只在点火时掷一次）
  //   side    —— "self" = 撒谎者把自己（subject = 自己）描述得更强/更弱
  //              "war" = 污染某场战争的战线读数（subject = 战争 id）
  const DECEPTIONS = {
    plant_strength: {
      zh: "示强欺敌", icon: "💪", cost: 12, months: 18, field: "mil", bias: 1.2,
      side: "self", risk: 0.08, failLossPrestige: 3, failLossAppeal: 2,
      note: "让对手以为你的军备投入高于实际：威慑更可信，但被拆穿就是虚张声势。"
    },
    plant_weakness: {
      zh: "示弱欺敌", icon: "🫥", cost: 12, months: 18, field: "mil", bias: -1.2,
      side: "self", risk: 0.08, failLossPrestige: 3, failLossAppeal: 2,
      note: "装穷诱敌冒进：对手以为你虚弱而低估风险 —— 也可能真的被认为虚弱。"
    },
    plant_prestige: {
      zh: "形象粉饰", icon: "🖼️", cost: 10, months: 15, field: "prestige", bias: 5,
      side: "self", risk: 0.07, failLossPrestige: 4, failLossAppeal: 2,
      note: "让自己的国际形象看起来更好。便宜，但被媒体拆穿的代价不小。"
    },
    false_front: {
      zh: "假战报", icon: "🎭", cost: 14, months: 12, field: "control", bias: 20,
      side: "war", risk: 0.10, failLossPrestige: 4, failLossAppeal: 3,
      note: "伪造战线态势让对手误判攻防形势：诱其冒进，或迫其不战自退。"
    },
    counter_intel: {
      zh: "反情报甄别", icon: "🔍", cost: 10, months: 12, field: "shield", bias: 0,
      side: "shield", risk: 0,
      note: "照妖镜时期：识破并清除针对自己的欺敌，同时挡住新的欺敌。"
    }
  };

  const PARAMS = {
    MAX_ACTIVE: 3,           // 同时生效的欺敌（不含护盾）上限
    SHIELD_MAX: 1,           // 护盾同时最多一段

    // 敌方自动欺敌（确定性调度）：只在玩家卷入战争时下手
    AUTO_MONTHS: 18,         // 两次自动欺敌的最小间隔
    AUTO_FALSE_FRONT: 0.06,  // 每月命中率（有战争且玩家是交战方时）
    AUTO_WEAKNESS: 0.03,     // 每月命中率（示弱欺敌，污染玩家对敌方军费的读数）

    // 甄别：护盾生效期间清除全部外敌欺敌（确定性，每月检查一次）
    DETECT_GUARANTEED: true, // 有护盾 = 必然识破（花钱买真相）

    LOG_MAX: 24
  };

  global.W1980_DECEPTION = { DECEPTIONS: DECEPTIONS, PARAMS: PARAMS };
})(typeof window !== "undefined" ? window : globalThis);
