// world1980 威望竞赛表（Phase F 的单一事实源）
//
// 为什么需要这一层：冷战的身份不只是**物质**（GDP / 石油 / 咽喉 / 巴统），
// 而是**竞赛** —— 「谁代表未来」。在这之前游戏里完全缺这一轴：
// 意识形态只是领袖肖像下的说明文字，`defconRisk` 只是展示用的效果键，
// 苏联解体是一个标记而不是一场输掉的比赛。
//
// 威望与 GDP/军费的正交性（这是它值一个子系统而不是一个数字的原因）：
//
//   |      | GDP      | 军费     | 威望                   |
//   | 性质 | 绝对、累积 | 绝对、成本 | **位置性、会衰减**      |
//   | 获得 | 增长      | 花钱      | **可见的「第一」**      |
//   | 失去 | 几乎不会  | 几乎不会   | **对手的第一 + 可见的失败** |
//   | 兑现 | 记分牌     | 安全      | **阵营归属 + 执政合法性** |
//   | 代价 | —        | 预算      | **预算 + 政治资本，且可能当众失败** |
//
// 关键设计：里程碑（MILESTONES）就是**史实梯子**——它们按历史日期对史实主人生效。
// 玩家不是与一个虚构的 AI 预算竞争，而是与**历史本身**竞争：苏联玩家必须想办法
// 抵消切尔诺贝利与柏林墙，美国玩家可以抢跑太空梯子。于是「史实轨迹」从背景
// 变成了一个你正在与之对抗的对手。
(function (global) {
  "use strict";

  // 每个里程碑：{ id, y, m, owner, gain, rival, rivalLoss, zh, note }
  //   owner      —— 史实上做出这件事的一方（"BOTH" = 双方共同得分，如中导条约）
  //   gain       —— 该方威望变化（可以为负：1980 莫斯科奥运会是被抵制的）
  //   rival      —— 相对受损的一方（可省略）
  //   rivalLoss  —— 对手直接扣分（通常很小：位置性计分本身已经让对手相对变差）
  //
  // 相对计分的好处是：对手的灾难不需要我们额外奖励我们 —— 我们自动就领先了。
  // 所以只有**真正伤害对方威信**的事件才给 rivalLoss（例如苏联抵制洛杉矶奥运）。
  const MILESTONES = [
    { id: "ms_moscow_olympics", y: 1980, m: 7, owner: "SUN", gain: -5, zh: "莫斯科奥运会遭西方集体抵制",
      note: "六十七国缺席，苏联用体育换来的国际声望变成了一场空场表演。" },
    { id: "ms_shuttle_columbia", y: 1981, m: 4, owner: "USA", gain: +8, rival: "SUN", rivalLoss: 2,
      zh: "哥伦比亚号航天飞机首飞",
      note: "可重复使用航天器成功入轨，美国宣告太空时代的技术领导权回到自己手里。" },
    { id: "ms_salyut7", y: 1982, m: 4, owner: "SUN", gain: +5, zh: "礼炮七号空间站长期驻留",
      note: "苏联以长期在轨驻留证明自己仍是唯一能「住在太空」的国家。" },
    { id: "ms_sdi", y: 1983, m: 3, owner: "USA", gain: +7, rival: "SUN", rivalLoss: 3,
      zh: "战略防御倡议（星球大战）",
      note: "美国把竞赛从「谁能毁灭对方」推向「谁能不被毁灭」，直接打乱苏联的军备规划。" },
    { id: "ms_la_olympics", y: 1984, m: 7, owner: "USA", gain: +4, rival: "SUN", rivalLoss: 4,
      zh: "洛杉矶奥运会（苏联阵营抵制）",
      note: "以牙还牙的抵制让苏联失去了一次展示开放的机会，美国则收获了商业与形象双赢。" },
    { id: "ms_challenger", y: 1986, m: 1, owner: "USA", gain: -7, zh: "挑战者号失事",
      note: "七名宇航员罹难，航天飞机计划停飞三十二个月 —— 技术威望的代价被全国直播。" },
    { id: "ms_mir", y: 1986, m: 2, owner: "SUN", gain: +8, rival: "USA", rivalLoss: 2,
      zh: "和平号空间站发射",
      note: "人类第一个模块化长期空间站。苏联在挑战者号的废墟上抢回了一个「第一」。" },
    { id: "ms_chernobyl", y: 1986, m: 4, owner: "SUN", gain: -9, zh: "切尔诺贝利核事故",
      note: "一次把「先进制度」的自信暴露给全世界的灾难；信息公开的迟缓放大了伤害。" },
    { id: "ms_inf_treaty", y: 1987, m: 12, owner: "BOTH", gain: +4, zh: "中导条约签署",
      note: "第一次真正销毁一整类核武器。双方都得分 —— 缓和本身就是一种威望商品。" },
    { id: "ms_buran", y: 1988, m: 11, owner: "SUN", gain: +6, rival: "USA", rivalLoss: 1,
      zh: "暴风雪号航天飞机无人往返",
      note: "苏联证明自己也能造出可重复使用航天器，尽管只飞了这一次。" },
    { id: "ms_berlin_wall", y: 1989, m: 11, owner: "USA", gain: +9, rival: "SUN", rivalLoss: 6,
      zh: "柏林墙倒塌",
      note: "一个阵营的物理边界在直播中消失 —— 这是整场竞赛里最大的一次威望转移。" },
    { id: "ms_hubble", y: 1990, m: 4, owner: "USA", gain: +6, rival: "SUN", rivalLoss: 1,
      zh: "哈勃太空望远镜入轨",
      note: "美国把「看得更远」变成了国家叙事的一部分。" },
    { id: "ms_dissolution", y: 1991, m: 12, owner: "USA", gain: +10, rival: "SUN", rivalLoss: 12,
      zh: "苏联解体",
      note: "竞赛的终局：一方不再存在。这不是一场平局，也不是一次谈判的结果。" }
  ];

  // 玩家可资助的威望工程。全部消耗**政治资本**（与内政动作抢同一份预算），
  // 并在持续期间造成**GDP 增速拖累**（与军费抢同一份资源）。
  // 这就是「战略灵活性」的具体形态：多一条投资轴，而不是多一个按钮。
  //   cost      启动/停止不返还的政治资本
  //   drag      生效期间的 GDP 增速拖累（pp/年）—— 真实的机会成本
  //   gain      每月威望
  //   risk      每月「当众失败」概率（用确定性哈希，不消费引擎 RNG）
  //   failLoss  失败时损失的威望
  const PROGRAMS = {
    space_station: { zh: "空间站工程", icon: "🛰️", cost: 22, drag: 0.30, gain: 1.1, risk: 0.012, failLoss: 6,
      note: "长期在轨驻留能力。最贵、最慢，也最能把「第一」变成日常。" },
    manned_first: { zh: "载人航天冲刺", icon: "🚀", cost: 18, drag: 0.25, gain: 0.9, risk: 0.020, failLoss: 5,
      note: "抢在对手之前把人送上去。收益高，但失败是全国直播的。" },
    tech_showcase: { zh: "高技术出口展示", icon: "💠", cost: 16, drag: 0.20, gain: 0.75, risk: 0.010, failLoss: 4,
      note: "用可出口的技术证明「我们的制度能造出好东西」。" },
    olympic_bid: { zh: "申办奥运会", icon: "🏟️", cost: 14, drag: 0.14, gain: 0.60, risk: 0.008, failLoss: 3,
      note: "把国家形象一次性摊开给全世界看。抵制的风险是真实存在的。" },
    ideology_export: { zh: "意识形态输出", icon: "📣", cost: 12, drag: 0.08, gain: 0.50, risk: 0.006, failLoss: 2,
      note: "宣传攻势与文化渗透：最便宜，也最容易被对手的成功抵消。" },
    cultural_expo: { zh: "世界博览会", icon: "🎪", cost: 10, drag: 0.10, gain: 0.45, risk: 0.004, failLoss: 2,
      note: "低风险的常规形象工程。稳，但慢。" }
  };

  const PARAMS = {
    SCORE_MIN: 0, SCORE_MAX: 100, SCORE_START: 50,   // 每国威望起点 = 世界的「应有水准」
    DECAY: 0.025,            // 每月朝 50 回归的比例：昨天的凯旋变成今天的常态
    MAX_ACTIVE: 2,           // 同时运行的工程上限（迫使取舍）
    RIVAL: { SUN: "USA", USA: "SUN" },               // 超级大国的对手；其余国家取本阵营领袖
    BLOC_LEADER: { NATO: "USA", W: "USA", WP: "SUN", SOV: "SUN" },

    // 威望落回内政：国民自豪会压低动荡，民族羞辱会抬高它。
    // 系数刻意很小 —— 威望不该盖过经济（P1 的账单才是主因），它只是第二层。
    LEGIT_GAP_DIV: 200,      // 每 200 点「落差×月」换 1 点合法性
    UNREST_GAP: 0.06,        // 落后时的月度动荡增量（乘以归一化落差）
    UNREST_PRIDE: 0.05,      // 领先时的月度动荡回落

    // 第三世界漂移：威望差距足够大且持续时，不结盟国家会「用脚投票」。
    DRIFT_GAP: 12,           // 触发漂移所需的威望落差
    DRIFT_MONTHS: 6,         // 需要连续领先多少个月
    DRIFT_TOTAL: 6,          // 整局最多漂移多少个实体（避免世界被一方吞掉）
    DRIFT_ELIGIBLE: ["NA", "NE"],

    // 里程碑与工程共用的公示长度上限
    LOG_MAX: 40
  };

  // F2：威望竞赛的 AI 侧（确定性规则，零 RNG，与 D2 的 AI_POLICY 同一模式）。
  // 玩家能跑工程，而对手此前只会被动吃里程碑+衰减 —— 竞赛是单方面的。
  // 本表让对手也下棋：落后就追赶、领先就收手、经济吃紧就先停最贵的。
  //
  //   CATCHUP_GAP  落后玩家多少分 → 启动追赶工程
  //   COAST_GAP    领先玩家多少分 → 全部收手（省 GDP，威望会衰减回来）
  //   STRAIN_MAX   经济压力（polEconStrainOf）到此值 → 养不起，停最贵的
  //   MIN_MONTHS   新工程的粘性窗口：最近一项不满此月数 → 不再加新的（防逐月翻烧饼）
  //   PICK_*_STRAIN  压力分档阈值：压力越低越敢上大工程
  //   PICK         三档候选（档内按 gain 降序，取第一个未在跑的）—— 全确定性
  //
  // AI 不花政治资本（那是玩家的节流阀），但照常付 GDP 拖累、照常当众失败 ——
  // 「耗得起吗」对两边都成立。
  const AI_POLICY = {
    CATCHUP_GAP: 6,
    COAST_GAP: 10,
    STRAIN_MAX: 0.7,
    MIN_MONTHS: 6,
    PICK_HI_STRAIN: 0.3,
    PICK_MID_STRAIN: 0.55,
    PICK: {
      hi: ["space_station", "manned_first"],
      mid: ["tech_showcase", "olympic_bid"],
      lo: ["ideology_export", "cultural_expo"]
    }
  };

  // 供事件层（crisis / agenda）写入威望的效果键。
  // 注意：这里只声明语义，合法性由 data/effects.js 的词表登记；
  // 引擎侧的落点是 applyCrisisEffects / prestigeAdd。
  const CRISIS_HINT = {
    prestigeDelta: "危机抉择对威望的即时影响（正=得分，负=丢脸）"
  };

  global.W1980_PRESTIGE = {
    MILESTONES: MILESTONES,
    PROGRAMS: PROGRAMS,
    PARAMS: PARAMS,
    AI_POLICY: AI_POLICY,
    CRISIS_HINT: CRISIS_HINT
  };
})(typeof window !== "undefined" ? window : globalThis);
