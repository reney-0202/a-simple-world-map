// world1980 - data/afghan.js
// R13B: 阿富汗战争泥潭与帝国消耗槽（Afghan Quagmire & Empire Bleeding Database）
// Afg2: 史实基线 + 偏离计费 + 对手方针（确定性规则，零 RNG）

(function () {
  const PHASES = [
    {
      id: "stalemate_1980",
      name: "介入初期与山地扫荡 (1980–1982)",
      startY: 1980, startM: 1, endY: 1982, endM: 12,
      desc: "苏军第 40 集团军进驻阿富汗主要城镇与交通线，在潘杰希尔峡谷展开多轮大规模山地攻势，但游击队依托复杂地形展开伏击。"
    },
    {
      id: "attrition_1983",
      name: "全面拉锯与相持消耗 (1983–1985)",
      startY: 1983, startM: 1, endY: 1985, endM: 12,
      desc: "战争陷入全面阵地与公路伏击消耗战，苏军米-24 雌鹿武装直升机维持空中火力垄断，但后勤车队在萨朗隧道周边频繁遇袭。"
    },
    {
      id: "stinger_1986",
      name: "旋风行动与毒刺导弹转折 (1986–1987)",
      startY: 1986, startM: 1, endY: 1987, endM: 12,
      desc: "中情局启动旋风行动秘密输送毒刺便携式防空导弹，打破苏军空中优势，直升机与运输机战损飙升，战争演化为帝国流血伤口。"
    },
    {
      id: "withdrawal_1988",
      name: "日内瓦协议与友谊桥大撤军 (1988–1989)",
      startY: 1988, startM: 1, endY: 1989, endM: 2,
      desc: "戈尔巴乔夫签署日内瓦协议，苏军启动分阶段撤军。1989年2月15日格罗莫夫中将率部走过阿姆河友谊桥，十年战争正式终结。"
    },
    {
      id: "post_soviet_1989",
      name: "纳吉布拉政权后苏残局 (1989–1991)",
      startY: 1989, startM: 3, endY: 1991, endM: 12,
      desc: "苏军全部撤离阿富汗后，喀布尔纳吉布拉政权在苏联物资支援下孤军坚守，与各路游击武装继续相持。"
    }
  ];

  const POLICIES = {
    standard: {
      id: "standard",
      name: "维持既有防区与史实战备",
      desc: "按照既定战略维护主要交通线与基地，保持正常山地巡逻与战备。",
      costBleed: 0,
      shortageImpact: 0,
      resistanceMod: 0
    },
    surge: {
      id: "surge",
      name: "派驻增援部队强硬扫荡",
      desc: "向战区紧急增调 2 万名近卫空降精锐，向兴都库什山脉发动强硬扫荡，压制游击活动，但加剧月度失血与国内轻工物资短缺。",
      costBleed: 1.5,
      shortageImpact: 6,
      resistanceMod: -15,
      troopsDelta: 20000
    },
    consolidate: {
      id: "consolidate",
      name: "收缩防卫·固守核心要点",
      desc: "从边远偏僻哨所撤军，全力布防喀布尔市区、巴格拉姆空军基地与萨朗公路咽喉，降低人员伤亡与燃油弹药消耗。",
      costBleed: -1.0,
      shortageImpact: -3,
      resistanceMod: 10,
      troopsDelta: -15000
    },
    geneva_withdraw: {
      id: "geneva_withdraw",
      name: "签署日内瓦协议·友谊桥撤军",
      desc: "在联合国斡旋下签署日内瓦停火撤军协议，启动为期 9 个月的平稳撤离程序。完成后彻底解除帝国失血槽，并释放 +0.35pp/年 和平红利！",
      durationMonths: 9,
      peaceDividend: 0.35
    }
  };

  // Afg2：偏离计费与月度漂移（只对偏离史实的失血计费 —— D.3 同构）
  const PARAMS = {
    BASE_TROOPS: 105000,
    BASE_AIR: 85,
    BASE_RES: 65,
    STINGER_AIR: 35,
    STINGER_RES_BUMP: 15,
    STINGER_Y: 1986, STINGER_M: 6,
    WITHDRAW_START_Y: 1988, WITHDRAW_START_M: 5,
    WITHDRAW_END_Y: 1989, WITHDRAW_END_M: 2,
    WITHDRAW_MONTHS: 9,
    // 失血偏离 → 增速拖累（$/亿·月 → pp/年）；上限对齐地面战争量级
    BLEED_PP_PER_UNIT: 0.08,
    BLEED_PP_CAP: 0.45,
    // 方针月度漂移（有执政者且非旁观时）
    SURGE_RES_DELTA: -1.0,
    CONS_RES_DELTA: 0.5,
    ARM_RES_DELTA: 1.2,
    ARM_AIR_DELTA: -0.8,
    SURGE_SHORTAGE_DRIP: 0.4,
    RES_FLOOR: 20, RES_CAP: 95,
    AIR_FLOOR: 15, AIR_CAP: 95,
    LOG_MAX: 24
  };

  // Afg2：对手方针（确定性规则，零 RNG；与 F2/E2/I2/Cov2/Dip2/N2 同族）
  // 美方：提前毒刺 / 武装抵抗 / 外交施压
  // 苏方：增兵扫荡 / 要点收缩 / 日内瓦撤军
  const AI_POLICY = {
    MIN_MONTHS: 2,                 // 粘性：两次出手至少隔 2 个月
    STRAIN_MAX: 0.75,              // 经济压力过高 → 收手
    // 美方规则阈值
    STINGER_AIR_MIN: 60,           // 苏军空优仍高 → 提前投毒刺
    ARM_RES_MAX: 88,               // 抵抗未顶满 → 可武装
    ARM_AFTER_STINGER: true,       // 毒刺后优先武装
    PRESS_BLEED_MIN: 4.0,          // 苏军仍在高失血 → 外交施压
    PRESS_PRESTIGE: 0.45,          // 施压扣苏方威望
    PRESS_UNREST: 1.5,             // 施压抬苏方动荡
    STINGER_PRESTIGE: 0.55,        // 提前毒刺给美方威望
    // 苏方规则阈值
    SURGE_RES_MIN: 70,             // 抵抗过高且毒刺未入 → 增兵
    CONS_BLEED_MIN: 4.8,           // 失血过高 → 收缩
    CONS_AIR_MAX: 45,              // 或空优崩塌 → 收缩
    GENEVA_BLEED_MIN: 5.2,         // 失血极高 → 日内瓦
    GENEVA_YEAR_MIN: 1987,         // 或不早于 1987 且空优崩 + 抵抗高
    GENEVA_AIR_MAX: 40,
    GENEVA_RES_MIN: 78,
    LOG_MAX: 24
  };

  function getPhase(y, m) {
    for (let i = 0; i < PHASES.length; i++) {
      const p = PHASES[i];
      if (y > p.startY || (y === p.startY && m >= p.startM)) {
        if (y < p.endY || (y === p.endY && m <= p.endM)) {
          return p;
        }
      }
    }
    return PHASES[PHASES.length - 1];
  }

  function calcBleedingCost(troops, airSuperiority, stingerActive, policyId) {
    let base = (troops / 100000) * 3.5; // 基准 10 万人月消耗约 $3.5 亿 (年均约 42 亿)
    if (stingerActive) base += 0.8;    // 毒刺逼迫战机高空投弹与耗费热诱弹/装甲维护
    if (airSuperiority < 50) base += 0.5;
    const pol = POLICIES[policyId] || POLICIES.standard;
    base += (pol.costBleed || 0);
    return Math.max(0.5, +base.toFixed(2));
  }

  function calcMonthlyCasualties(troops, resistance, airSuperiority, stingerActive) {
    let base = 80 + Math.round((troops / 10000) * 12); // 月均约 180~250 人战损
    base += Math.round((resistance / 100) * 60);
    if (stingerActive) base += 75; // 毒刺入阿后空地协同被打破，月均战损上升
    if (airSuperiority > 70) base -= 40;
    return Math.max(30, base);
  }

  // 史实轨迹纯函数：旁观/无干预时引擎必须与此对齐，偏离才计费。
  function historicAt(y, m) {
    const P = PARAMS;
    const stinger = (y > P.STINGER_Y || (y === P.STINGER_Y && m >= P.STINGER_M));
    const air = stinger ? P.STINGER_AIR : P.BASE_AIR;
    const resistance = stinger ? Math.min(95, P.BASE_RES + P.STINGER_RES_BUMP) : P.BASE_RES;

    if (y > P.WITHDRAW_END_Y || (y === P.WITHDRAW_END_Y && m >= P.WITHDRAW_END_M)) {
      return {
        troops: 0, airSuperiority: air, resistance: resistance,
        stingerActive: true, withdrawn: true, withdrawing: false,
        withdrawMonths: P.WITHDRAW_MONTHS, policy: "standard", bleedingCost: 0
      };
    }

    let troops = P.BASE_TROOPS;
    let withdrawing = false;
    let withdrawMonths = 0;
    if (y > P.WITHDRAW_START_Y || (y === P.WITHDRAW_START_Y && m >= P.WITHDRAW_START_M)) {
      withdrawing = true;
      withdrawMonths = Math.min(P.WITHDRAW_MONTHS,
        (y - P.WITHDRAW_START_Y) * 12 + (m - P.WITHDRAW_START_M) + 1);
      troops = Math.max(0, P.BASE_TROOPS - Math.round((P.BASE_TROOPS / P.WITHDRAW_MONTHS) * withdrawMonths));
    }
    const bleedingCost = calcBleedingCost(troops, air, stinger, "standard");
    return {
      troops: troops, airSuperiority: air, resistance: resistance,
      stingerActive: stinger, withdrawn: false, withdrawing: withdrawing,
      withdrawMonths: withdrawMonths, policy: "standard", bleedingCost: bleedingCost
    };
  }

  window.W1980_AFGHAN = {
    PHASES: PHASES,
    POLICIES: POLICIES,
    PARAMS: PARAMS,
    AI_POLICY: AI_POLICY,
    getPhase: getPhase,
    calcBleedingCost: calcBleedingCost,
    calcMonthlyCasualties: calcMonthlyCasualties,
    historicAt: historicAt
  };
})();
