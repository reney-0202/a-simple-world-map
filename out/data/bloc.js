// world1980 阵营凝聚浅层表（Phase Bloc2 的单一事实源）
//
// 第三世界漂移（F/I）已有；阵营**内部**此前几乎无杠杆。
// 本表声明浅层凝聚 / 卫星离心规则的阈值与消费者量级，供 app/06b-blocai.js 消费。
//
// 设计约束：
//   1. 零引擎 RNG；门控白名单（?bloc2probe=1 或真实有玩家）；
//   2. 不升存档版；不把次极推进 aiMajors；不开贸易迷你游戏；
//   3. 不与 Dip2/N2 重叠（无峰会拒签 / 无 DEFCON 拒强硬）。
(function (global) {
  "use strict";

  // 铁幕两侧的「阵营内侧」卫星清单（不含阵营领袖）。
  // WEST：美方核心北约盟友；EAST：华约卫星（含 Mid3 四国）。
  const CAMPS = {
    WEST: {
      leader: "USA",
      blocs: ["NATO", "W"],
      satellites: ["DEU", "GBR", "FRA", "ITA", "TUR", "CAN"]
    },
    EAST: {
      leader: "SUN",
      blocs: ["WP", "SOV"],
      satellites: ["POL", "HUN", "CSK", "ROU", "DDR", "BGR"]
    }
  };

  const AI_POLICY = {
    MIN_MONTHS: 2,                 // 粘性：两次阵营动作至少隔 2 个月
    STRAIN_MAX: 0.78,              // 领袖经济压力过高 → 收手
    COHESION_START: 50,            // 浅层凝聚起点
    COHESION_MIN: 0,
    COHESION_MAX: 100,

    // 规则 1：卫星离心 —— 卫星动荡/压力高且未获军援 → 凝聚下降
    SPIN_UNREST_MIN: 28,           // 卫星动荡 ≥ 此值可触发离心
    SPIN_STRAIN_MIN: 0.55,         // 或经济压力 ≥ 此值
    SPIN_COHESION: -6,             // 凝聚度变化
    SPIN_SAT_UNREST: 4,            // 卫星动荡再抬
    SPIN_LEADER_UNREST: 2,         // 领袖国内动荡
    SPIN_CRED: -3,                 // 同步扣 natoCohesion→credBonus

    // 规则 2：凝聚维稳 —— 军援卫星或军费到位 → 凝聚回升
    GLUE_MIL_MIN: 4.5,             // 军费 ≥ 此值视为「前沿承诺」
    GLUE_COHESION: +5,
    GLUE_SAT_UNREST: -3,
    GLUE_CRED: +3,
    GLUE_AID_EFF: 0.12,            // 军援效率向 1.0 回升

    // 规则 3：军援空转 —— 凝聚过低时对阵营内军援打折
    HOLLOW_COHESION_MAX: 32,       // 凝聚 ≤ 此值 → 军援空转
    HOLLOW_AID_EFF: 0.55,          // 军援目标增速乘数
    HOLLOW_LEADER_UNREST: 2,
    HOLLOW_COHESION: -2,
    HOLLOW_CRED: -2,

    AID_EFF_MIN: 0.45,
    AID_EFF_MAX: 1.0,
    AID_EFF_START: 1.0,
    LOG_MAX: 24
  };

  global.W1980_BLOC = { CAMPS: CAMPS, AI_POLICY: AI_POLICY };
})(typeof window !== "undefined" ? window : globalThis);
