// world1980 地面战争表（Phase D 的单一事实源）
//
// 为什么需要这一层：三场局部战争此前是**日期状态机** —— 到达某个月就换一批省份的
// occupier，玩家能影响的只有「停火日期提前/延后几个月」。于是：
//   · 战争没有「谁在赢」这个状态，只有「现在是第几阶段」；
//   · 胜负对经济与威望零影响，与 P1 的经济闭环、F 的威望竞赛都没接上；
//   · 面板在描述战局，代码在翻日历 —— 这是最典型的「面板与模拟脱节」。
//
// 本表把战争变成**可争夺的量**：control（战线优势，−100..100）。
//
// 一个关键建模决定（也是史实不变量能保住的唯一办法）：
//   历史路径的**战争经济代价已经被校准进 `gdpBase`**（伊拉克的锚点是 −0.76%/年，
//   这就是两伊战争+海湾战争的代价）。所以引擎只对**玩家造成的额外代价**计费，
//   即 `attrDev`（偏离史实的部分），而不是对战争总代价二次收费。
//   于是：不干预 = 零额外成本 = 史实轨迹一字不变。
//
// control 的构成：
//   control = 史实阶段基线(phases) + 偏离(deviation)
//   deviation 来自：大国干预分差（军援/制裁）、玩家作战方针、安理会决议
(function (global) {
  "use strict";

  // 每场战争：
  //   sideA / sideB —— 交战方（A 是史实上的主动方/侵略方）
  //   start / historicEnd —— 史实起止（用于「战争是否在进行」的判定）
  //   phases —— 史实 control 基线：到达 from 月份后 control 至少是 value（阶梯函数）
  //   stake —— 终局威望赌注（胜方 +stake，负方 −stake）
  //   decisive —— |control| 超过此值即判定决胜（提前结束）
  //   provinces —— 该战的战线省份（结局决胜时清空）
  //   ceaseRes —— 能让这场战争提前停火的安理会决议
  const WARS = {
    iran_iraq: {
      zh: "两伊战争", short: "IRAQ–IRAN",
      sideA: "IRQ", sideB: "IRN",
      start: [1980, 9], historicEnd: [1988, 8],
      // 1980-09 伊拉克突入胡齐斯坦（+28）→ 1982-05 伊朗反攻（−32）→ 停火回到边界（−8）
      phases: [[1980, 9, 28], [1982, 5, -32], [1988, 8, -8]],
      stake: 6, decisive: 70, ceaseRes: "res_598",
      provinces: [1663, 1684, 1692]
    },
    falklands: {
      zh: "马岛战役", short: "FALKLANDS",
      sideA: "LAP", sideB: "GBR",          // A = 阿根廷（LAP 联邦为可玩实体），B = 英国
      start: [1982, 4], historicEnd: [1982, 6],
      phases: [[1982, 4, 42], [1982, 6, -62]],
      stake: 5, decisive: 60, ceaseRes: "res_502",
      provinces: [1248, 1249]
    },
    gulf_war: {
      zh: "海湾战争", short: "GULF",
      sideA: "IRQ", sideB: "ARA",          // B = 阿拉伯半岛联邦（多国部队侧）
      start: [1990, 8], historicEnd: [1991, 3],
      phases: [[1990, 8, 55], [1991, 3, -72]],
      stake: 7, decisive: 65, ceaseRes: "res_660",
      provinces: [1809]
    }
  };

  // 玩家作为交战方时可以选择的作战方针。每场战争同时只允许一项
  // （政治资本是唯一的节流阀，不额外加一层冷却）。
  //   strength  —— 每月对 control 的偏移（正 = 推进，负 = 后撤）
  //   enemyAttr —— 每月对敌方 attrDev 的贡献
  //   selfAttr  —— 每月对己方 attrDev 的贡献
  //   gain      —— 每月对己方 wear 的影响（负 = 缓解）
  const OPS = {
    ground_offensive: {
      zh: "地面攻势", icon: "⚔️", pc: 18,
      strength: 6.5, enemyAttr: 0.55, selfAttr: 0.45, wear: 0.45,
      note: "集中装甲与炮兵突破正面。推进最快，但双方伤亡都最重。"
    },
    attrition_siege: {
      zh: "消耗围困", icon: "🪖", pc: 13,
      strength: 2.5, enemyAttr: 0.95, selfAttr: 0.25, wear: 0.25,
      note: "以火力与封锁磨掉对手的后勤与兵员。慢，但让对手先撑不住。"
    },
    air_campaign: {
      zh: "空中战役", icon: "✈️", pc: 15,
      strength: 4.0, enemyAttr: 0.60, selfAttr: 0.15, wear: 0.20,
      note: "以制空权换取推进，己方地面伤亡小 —— 但打不掉对方的地面力量。"
    },
    hold_line: {
      zh: "固守防线", icon: "🛡️", pc: 6,
      strength: 0.8, enemyAttr: 0.20, selfAttr: 0.10, wear: 0.10,
      note: "就地固守、保存实力。几乎不推进，也几乎不流血。"
    },
    seek_settlement: {
      zh: "寻求停火", icon: "🕊️", pc: 10,
      strength: 0, enemyAttr: 0, selfAttr: 0, wear: -0.30, endEarly: true,
      note: "以现有战线停火。若处于劣势，停火会在威望上留下代价 —— 但流血立刻停止。"
    }
  };

  const PARAMS = {
    CONTROL_MIN: -100, CONTROL_MAX: 100,
    DEVIATION_PER_SUPPORT: 7,   // 每 1 级干预分差 → control 偏移
    DEVIATION_CLAMP: 45,        // 偏离最多 ±45（史实惯性仍然很强）
    // 提前决胜必须由**偏离**造成：只靠基线恰好越线不算「你打赢了」。
    // 没有这一条，中等的军援就会把史实战线提前抹掉（warprobe 会立刻抓到）。
    DECISIVE_DEV: 28,
    ATTR_PER_DEV: 0.012,        // 每点 |deviation| 每月的额外消耗（pp·月）
    ATTR_DRAG: 0.45,            // attrDev → 每月 pmods 拖累的换算上限（pp/年）
    ATTR_DRAG_DIV: 6,           // attrDev 每 6 点换 0.45pp/年
    WEAR_MAX: 100,
    WEAR_UNREST: 0.22,          // 厌战 → 月度动荡
    WEAR_DECAY: 0.35,           // 停战后厌战的自然消退
    STALEMATE_BAND: 22,         // |control| 低于此值 = 僵持
    SETTLE_PRESTIGE: 0.45,      // 劣势停火时按 |control| 折算的威望代价系数
    LOG_MAX: 24
  };

  global.W1980_WARS = { WARS: WARS, OPS: OPS, PARAMS: PARAMS };
})(typeof window !== "undefined" ? window : globalThis);
