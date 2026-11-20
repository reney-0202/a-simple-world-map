// world1980 核风险轴表（Phase N1 的单一事实源）
//
// 为什么需要这一层：`data/effects.js` 里有 6 个键**构建期合法、运行期无人消费** ——
// defconRisk / natoCohesion / middleEastTension / cubanTension /
// usSanctionPressure / gbrPopularity。它们是「面板上写着、引擎里没有分支」的戏台布景。
//
// 本阶段不去做「单点接线」（那只会得到一个没人会遇到的计数器），而是把它们
// 接成一整条**核风险轴**：
//
//   升级(escalation) ──┐
//                      ├──> 误判概率 / 月 ──> 事故 ──> 抉择 ──> 升级或降温
//   威慑可信度(credibility) ──┘                    │
//                                                  └──> DEFCON 1 持续 ──> 核战争（终局）
//
// 三条设计约束（与前几个阶段一致）：
//   1. **不消费引擎 RNG** —— 误判用确定性哈希（年, 月, 盐），核风险不得扰动仿真轨迹；
//   2. **无执政者时零回写** —— 旁观/史实探针只读计算，既不触发事故也不写内政；
//   3. **失败必须是战略性的而非运气** —— DEFCON 1 需要连续 3 个月维持 ≥80 的升级，
//      那只能靠持续选强硬、持续打仗、持续不降温换来。
(function (global) {
  "use strict";

  // DEFCON 阶梯：escalation 0..100 → 5..1。真实世界的 DEFCON 就是这个语义。
  // 阈值取整数便于面板与探针双向断言。
  const DEFCON = [
    { level: 1, from: 80, zh: "一号战备", note: "核战争被认为即将发生。任何一次误判都是最后一次。" },
    { level: 2, from: 60, zh: "二号战备", note: "部队进入最高戒备，核力量进入待发。误判窗口极窄。" },
    { level: 3, from: 40, zh: "三号战备", note: "军事对峙常态化，双方雷达与预警系统满负荷运转。" },
    { level: 4, from: 20, zh: "四号战备", note: "紧张加剧，预警系统加强值守，但沟通渠道仍然畅通。" },
    { level: 5, from: 0, zh: "五号战备", note: "和平时期的常态戒备。" }
  ];

  const PARAMS = {
    ESC_MIN: 0, ESC_MAX: 100,
    CRED_MIN: 5, CRED_MAX: 95, CRED_START: 50,

    // 危机的**阶梯选择**直接推升级：这是「强硬」的真实代价。
    TIER_ESC: [0, 3, 8, 18],          // 索引 = tier（0 = 没有/谈判）

    // 常态推拉（每月）
    TENSION_ESC: 4.0,                 // 美苏张力 100 → +4/月
    WAR_ESC: 3.0,                     // 每场进行中的战争
    TREATY_ESC: -2.0,                 // 每份生效军控条约（缓和是真的）
    DECAY: 1.2,                       // 朝 0 自然回落

    // 威慑可信度：军费落差、威望落差、同盟凝聚
    CRED_MIL: 6.0,                    // 每 1pp 军费落差
    CRED_PRESTIGE: 0.40,              // 每 1 点威望落差
    CRED_COHESION: 0.35,              // 每 1 点同盟凝聚（natoCohesion）

    // 误判概率：P = BASE × (esc/100)^2 × (CRED_START/cred)
    // 低升级时几乎为零（平方项），高升级且低可信度时才真正危险。
    RISK_BASE: 0.004,
    RISK_CAP: 0.02,                   // 单月上限定 2%（再高就成了掷骰游戏）

    // 核战争：DEFCON 1 连续 N 个月
    DOOMSDAY_MONTHS: 3,

    LOG_MAX: 24
  };

  // N2：核风险轴的 AI 侧（确定性规则，零 RNG，与 F2/E2/I2/Cov2/Dip2 同族）。
  // Dip2 只管峰会/条约/安理会仪式；本表只管升级 / 可信度 / 事故 / DEFCON。
  // 三条（及以上）规则：高升级主动降温、中段照会催降温、可信度吃紧拒强硬；
  // 附粘性与经济收手。量级必须喂真实消费者（ST.nuke / 威望 / 张力 / 动荡）。
  const AI_POLICY = {
    MIN_MONTHS: 2,              // 粘性：两次核风险管理至少隔 2 个月
    STRAIN_MAX: 0.75,           // 经济压力过高 → 收手
    COOL_ESC_MIN: 55,           // 升级 ≥ 此值 → 主动降温（约 DEFCON 2–3）
    COOL_ESC_DELTA: -8,         // 降温直接改 ST.nuke.esc
    COOL_TENSION_DELTA: -4,     // 同步压低美苏张力
    COOL_PRESTIGE: 0.6,         // 对手因克制得分
    WARN_ESC_MIN: 40,           // 中段升级 → 照会催降温
    WARN_ESC_MAX: 55,           // 与降温档互斥（半开）
    WARN_PRESTIGE: 0.5,         // 照会扣玩家威望
    WARN_UNREST: 2,             // 照会抬玩家动荡
    REJECT_CRED_MAX: 38,        // 可信度 ≤ 此值 → 拒强硬
    HAWK_OPT_ESC_MIN: 8,        // 事故选项 esc ≥ 此值算强硬
    HAWK_TIER_MIN: 2,           // 危机阶梯 ≥ 此值算强硬
    REJECT_FORCE_ESC: -6,       // 拒强硬后强制降温幅度
    REJECT_PRESTIGE: 1.0,       // 拒强硬扣玩家威望
    REJECT_UNREST: 2,           // 拒强硬抬动荡
    LOG_MAX: 24
  };

  // 事故类型。每次触发一个，玩家必须选应对 —— 这就是「误判」的可玩形态：
  // 真正杀死人的不是爆炸，是有人在压力下把雷达上的鸟群当成导弹。
  const INCIDENTS = [
    { id: "false_alarm", zh: "预警系统虚警", icon: "📡",
      note: "早期预警卫星报告多枚洲际导弹来袭。值班军官只有几分钟判断真伪。",
      // 历史原型：1983-09 斯坦尼斯拉夫·彼得罗夫
      options: [
        { id: "verify", zh: "交叉核实后再上报", esc: -6, cred: -3,
          note: "多花两分钟核实，可能耽误真实袭击的应对 —— 但虚警的可能性更高。" },
        { id: "retaliate", zh: "立即进入报复待发", esc: +14, cred: +6,
          note: "展示决不犹豫的决心。若这是虚警，你刚刚把世界推近了一步。" },
        { id: "ignore", zh: "判定为系统故障，压下不报", esc: -10, cred: -8,
          note: "压下警报。赌对了是克制，赌错了是灭国。" }
      ] },
    { id: "sub_incident", zh: "潜艇声呐接触", icon: "🌊",
      note: "反潜部队在受保护海域捕捉到持续接触信号，可能是一艘携带弹道导弹的敌潜艇。",
      options: [
        { id: "surface", zh: "要求其上浮识别", esc: -3, cred: -1,
          note: "按规程处理。对方可能视为羞辱，但冲突不会升级。" },
        { id: "depth_charge", zh: "投掷警告深弹", esc: +12, cred: +5,
          note: "把对方逼出水面 —— 也可能真的把它击伤，触发它自己的交战规则。" },
        { id: "withdraw", zh: "撤回反潜兵力", esc: -8, cred: -6,
          note: "用退让换取降温。盟友会记住这一步。" }
      ] },
    { id: "border_probe", zh: "边境雷达闯入", icon: "✈️",
      note: "一架不明飞机以攻击航线接近领空，应答机静默。防空部队等待开火授权。",
      options: [
        { id: "scramble", zh: "派机拦截并伴飞", esc: +2, cred: +3,
          note: "标准处置：既不失面子也不开第一枪。" },
        { id: "shoot", zh: "授权开火", esc: +16, cred: +8,
          note: "1978 年韩航班机、1983 年大韩航空 007 —— 击落民航的代价是道义与信誉双输。" },
        { id: "hold", zh: "按兵不动，记录备案", esc: -5, cred: -5,
          note: "避免擦枪走火，但示弱会被对手计入下次的算计。" }
      ] }
  ];

  global.W1980_NUKE = { DEFCON: DEFCON, PARAMS: PARAMS, INCIDENTS: INCIDENTS, AI_POLICY: AI_POLICY };
})(typeof window !== "undefined" ? window : globalThis);
