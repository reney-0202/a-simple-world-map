// world1980 · 次极大国专属国家议程与战略路线数据库 (R12B)
// 纯数据，无逻辑，挂载在 window.W1980_AGENDAS
(function () {
  "use strict";

  const AGENDAS = {
    // ---------------------------------------------------- 中国 (CHN)
    CHN: [
      {
        id: "chn_sez",
        title: "设立经济特区与沿海开放",
        category: "改革开放",
        icon: "🏭",
        desc: "兴办深圳、珠海、汕头、厦门经济特区，实行特殊经济政策与体制，大力吸引侨资外资，开辟外向型经济增长极。",
        yearMin: 1980,
        monthMin: 1,
        duration: 18,
        conditionDesc: "1980 年起即可启动",
        effects: {
          gdpBonus: 0.35,
          reserveMonthly: 1.5,
          desc: "沿海制造业投资涌入，对外贸易持续出超 (+0.35pp/年 增速，外汇流 +1.5亿 USD/月)"
        }
      },
      {
        id: "chn_disarm",
        title: "百万大裁军与军工转向民用",
        category: "战略调整",
        icon: "🕊️",
        desc: "对世界大势作出和平与发展的科学判断，果断裁军百万人，压缩防务开支，军工产能全面转向民用家电与基建投资。",
        yearMin: 1985,
        monthMin: 6,
        duration: 12,
        requires: "chn_sez",
        condition: "mil_le_3",
        conditionDesc: "需完成特区开放，且国防军费占比 ≤ 3.0%",
        effects: {
          gdpBonus: 0.40,
          domesticShortage: -8,
          desc: "释放庞大基础设施内需红利，家电轻工供给大幅充裕 (+0.40pp/年，商品短缺 -8)"
        }
      },
      {
        id: "chn_triangle",
        title: "大三角战略平衡与独立自主",
        category: "外交定力",
        icon: "🌐",
        desc: "坚持不结盟、不对抗、不称霸，在中美苏大三角角逐中保持超然战略定力，免遭阵营冷战摩擦波及与脱钩惩罚。",
        yearMin: 1982,
        monthMin: 1,
        duration: 12,
        requires: null,
        conditionDesc: "1982 年起即可推进",
        effects: {
          decoupleImmunity: true,
          stabilityBonus: 12,
          desc: "坚持独立自主和平外交，彻底免疫阵营脱钩震荡惩罚，社会安定度 +12"
        }
      },
      {
        // H（玩法深度）：CHN 三步议程树的第三步 —— 特区 → 裁军 → 市场化。
        // 门控挂在「内政天平」上：只有特区/市场派压过计划/国营派，价格闯关才推得动。
        id: "chn_market",
        title: "价格闯关与市场化并轨",
        category: "改革开放",
        icon: "💰",
        desc: "在裁军释放的财政空间上推进价格并轨与国企承包制，双轨价差收窄，市场派彻底主导改革议程。",
        yearMin: 1988,
        monthMin: 1,
        duration: 15,
        requires: "chn_disarm",
        condition: "domestic_reform_lead",
        conditionDesc: "需完成百万大裁军，且特区/市场派权重高于计划/国营派",
        effects: {
          gdpBonus: 0.45,
          domesticShortage: -10,
          desc: "价格并轨打通全国统一市场，资源配置效率跃升 (+0.45pp/年，商品短缺 -10)"
        }
      }
    ],

    // ---------------------------------------------------- 日本 (JPN)
    JPN: [
      {
        id: "jpn_semiconductor",
        title: "半导体与精密制造全球霸权",
        category: "技术立国",
        icon: "💻",
        desc: "推进超大规模集成电路（VLSI）国家攻关，在 DRAM 存储芯片、精密数控机床与汽车工业确立全球代差优势。",
        yearMin: 1980,
        monthMin: 1,
        duration: 18,
        conditionDesc: "1980 年起即可启动",
        effects: {
          gdpBonus: 0.30,
          reserveMonthly: 2.5,
          desc: "高科技制造业垄断出口溢价，巨额外汇顺差加速累积 (+0.30pp/年，外汇流 +2.5亿 USD/月)"
        }
      },
      {
        id: "jpn_defense_cap",
        title: "恪守专守防卫（1% GDP 军费红线）",
        category: "和平国策",
        icon: "⚖️",
        desc: "严格恪守和平宪法第九条原则，国防开支绝不上浮超过 GDP 1%，全部财政资源专注实体民用工业飞跃。",
        yearMin: 1980,
        monthMin: 1,
        duration: 12,
        condition: "mil_le_1",
        conditionDesc: "国防军费占比严守 ≤ 1.0%",
        effects: {
          gdpBonus: 0.45,
          desc: "极致的轻装上阵增长加成，国民经济免除任何军备负担拖累 (+0.45pp/年 极速飞跃)"
        }
      },
      {
        id: "jpn_black_current",
        title: "黑潮计划：东亚雁阵产业出海",
        category: "产业跨国化",
        icon: "🚢",
        desc: "反向消化日元升值与海外反倾销摩擦，启动大规模对外直接投资，将中低端制造梯次转移至东亚形成雁阵产业链。",
        yearMin: 1985,
        monthMin: 9,
        duration: 15,
        requires: "jpn_semiconductor",
        conditionDesc: "需完成半导体霸权，1985 年后开启",
        effects: {
          gdpBonus: 0.25,
          reserveMonthly: 2.0,
          desc: "东亚雁阵分工成型，海外资产投资利润持续反哺本土母公司 (+0.25pp/年，外汇流 +2.0亿 USD/月)"
        }
      }
    ],

    // ---------------------------------------------------- 西德 / 欧洲 (DEU, FRA, GBR)
    // ---------------------------------------------------- 西德 (DEU)
    // H（玩法深度）：DEU 三步议程树 —— 新东方政策 → 单一市场 → 防务支柱。
    // 第一步门控挂在「内政天平」上（缓和深度 ≥ 55），后两步为前置链。
    DEU: [
      {
        id: "deu_ostpolitik",
        title: "新东方政策与莫斯科条约",
        category: "东方外交",
        icon: "🤝",
        desc: "延续勃兰特的东方政策路线，与莫斯科、华沙签署互不侵犯条约，以经贸与人员往来松动铁幕，换取缓和红利。",
        yearMin: 1980,
        monthMin: 1,
        duration: 15,
        condition: "domestic_detente",
        conditionDesc: "1980 年起可推进，且东西欧缓和深度 ≥ 55（内政天平偏向缓和派）",
        effects: {
          gdpBonus: 0.25,
          reserveMonthly: 1.5,
          desc: "东方贸易与信贷渠道打开，出口订单与侨汇稳步增加 (+0.25pp/年，外汇流 +1.5亿 USD/月)"
        }
      },
      {
        id: "eur_single_market_deu",
        title: "单一欧洲法案与欧共体大市场",
        category: "欧洲一体化",
        icon: "🇪🇺",
        desc: "全面拆除西欧内部关税壁垒、技术壁垒与资本流动管制，构筑 3.2 亿人口的统一欧共体内部大市场。",
        yearMin: 1986,
        monthMin: 1,
        duration: 15,
        requires: "deu_ostpolitik",
        conditionDesc: "需先达成新东方政策，1986 年起欧共体成型",
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 8,
          desc: "欧洲内部跨国贸易零壁垒，规模经济协作红利显著释放 (+0.30pp/年，安定度 +8)"
        }
      },
      {
        id: "eur_defense_pillar_deu",
        title: "法德轴心与欧洲防务自主支柱",
        category: "防务一体化",
        icon: "🛡️",
        desc: "深化法德战略协调与防务联合，筹建法德混合旅与欧洲军团，构建欧洲防务第二支柱以降低对美依附。",
        yearMin: 1988,
        monthMin: 1,
        duration: 12,
        requires: "eur_single_market_deu",
        conditionDesc: "需先达成欧洲单一市场，1988 年起协调建军",
        effects: {
          gdpBonus: 0.15,
          stabilityBonus: 10,
          desc: "欧洲自主防卫韧性成型，对外部冷战前线安全震荡吸收能力提升 (+0.15pp/年，安定度 +10)"
        }
      }
    ],

    FRA: [
      {
        id: "eur_single_market_fra",
        title: "单一欧洲法案与欧共体大市场",
        category: "欧洲一体化",
        icon: "🇪🇺",
        desc: "消除关税与贸易摩擦，主导欧洲共同大市场与共同农业政策（CAP），巩固欧洲大陆产业竞争力。",
        yearMin: 1986,
        monthMin: 1,
        duration: 15,
        conditionDesc: "1986 年起欧共体成型",
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 8,
          desc: "欧洲共同大市场规模协作红利，外向型经贸稳步扩张 (+0.30pp/年，安定度 +8)"
        }
      },
      {
        id: "eur_nuclear_deter_fra",
        title: "独立打击力量与高卢战略自主",
        category: "战略独立",
        icon: "🚀",
        desc: "坚持不完全受制于北约联合指挥部，保持海空独立核威慑打击力量与军工独立设计自主权。",
        yearMin: 1982,
        monthMin: 1,
        duration: 12,
        conditionDesc: "1982 年起推进",
        effects: {
          gdpBonus: 0.20,
          stabilityBonus: 8,
          desc: "高卢战略自主定力确立，军工技术独立出口顺差增加 (+0.20pp/年，安定度 +8)"
        }
      }
    ],

    GBR: [
      {
        id: "gbr_financial_bigbang",
        title: "金融城大爆炸与服务业全球化",
        category: "金融改革",
        icon: "🏛️",
        desc: "废除伦敦城传统金融管制壁垒，引入电子化自动清算与外资投行准入，重建伦敦全球顶级离岸金融中心地位。",
        yearMin: 1986,
        monthMin: 10,
        duration: 12,
        conditionDesc: "1986 年起即可推进",
        effects: {
          gdpBonus: 0.35,
          reserveMonthly: 2.0,
          desc: "国际跨境资本急速涌入伦敦金融城，现代金融服务业爆发 (+0.35pp/年，外汇流 +2.0亿 USD/月)"
        }
      },
      {
        id: "gbr_privatization",
        title: "国企私有化与供给侧结构转型",
        category: "撒切尔主义",
        icon: "⚡",
        desc: "对英国电信、天然气、钢铁等低效公用事业实施市场化改制，打破工会垄断并大幅减轻财政赤字包袱。",
        yearMin: 1983,
        monthMin: 1,
        duration: 15,
        conditionDesc: "1983 年起推进",
        effects: {
          gdpBonus: 0.25,
          stabilityBonus: -5,
          desc: "国有资本包袱出清，工业生产效率反弹回升 (+0.25pp/年，初期伴随适度工潮)"
        }
      }
    ],

    // ---------------------------------------------------- 苏联 (SUN)
    SUN: [
      {
        id: "sun_joint_venture",
        title: "合资企业法与民生轻工改组",
        category: "经济改组",
        icon: "🛒",
        desc: "颁布《合资企业法》，允许外资参与轻工、食品与民用消费品制造，部分重工厂转产民用家电以平抑商品脱销。",
        yearMin: 1987,
        monthMin: 1,
        duration: 15,
        conditionDesc: "1987 年新思维改组期启动",
        effects: {
          gdpBonus: 0.25,
          domesticShortage: -14,
          desc: "消费品供给显著回暖，百货商场排长队现象有效平抑 (+0.25pp/年，短缺 -14)"
        }
      },
      {
        id: "sun_union_reform",
        title: "主权国家新联盟经济共同体",
        category: "体制重构",
        icon: "🤝",
        desc: "重构各加盟共和国分工合作框架，赋予加盟国充分经济财政自治，建立主权共和国共同经济自贸区以避解体休克。",
        yearMin: 1990,
        monthMin: 3,
        duration: 12,
        conditionDesc: "1990 年末期宪政转折",
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 16,
          desc: "维系原苏东经贸生产协作大网络，抵御经济断崖式失序与休克瓦解 (+0.30pp/年，安定度 +16)"
        }
      }
    ],

    // ---------------------------------------------------- 美国 (USA)
    USA: [
      {
        id: "usa_supply_side",
        title: "供给学派减税与硅谷科技繁荣",
        category: "里根经济学",
        icon: "📈",
        desc: "降低企业所得税与个人最高边际税率，放松对交通、能源及金融管制，极大激发硅谷风险投资与微型计算机浪潮。",
        yearMin: 1981,
        monthMin: 8,
        duration: 15,
        conditionDesc: "1981 年减税法案启动",
        effects: {
          gdpBonus: 0.35,
          congressBonus: 6,
          desc: "技术创新与私人创业投资迎来黄金繁荣期，两党国会支持率 +6 (+0.35pp/年)"
        }
      },
      {
        id: "usa_sdi_tech",
        title: "战略防御倡议（SDI 星球大战）",
        category: "太空军备",
        icon: "🛰️",
        desc: "开启天基激光与动能拦截导弹等尖端高边疆技术攻关，以巨额科技研发投入对华约形成极限技术与财政压制。",
        yearMin: 1983,
        monthMin: 3,
        duration: 18,
        condition: "mil_ge_5",
        conditionDesc: "国防军费占比要求 ≥ 5.0%",
        effects: {
          gdpBonus: 0.15,
          techSecurity: 25,
          desc: "国防高精尖技术外溢带动本土超级计算机与航天工业，确立技术代差优势 (+0.15pp/年)"
        }
      }
    ],

    // ---------------------------------------------------- 通用区域国家 (ALL / Default)
    DEFAULT: [
      {
        id: "gen_resource_sovereignty",
        title: "战略资源自主与多元经贸网络",
        category: "资源主权",
        icon: "🛢️",
        desc: "巩固本土核心矿产或农粮出口定价权，开辟多元化国际结算航线，减轻对单一超级大国阵营的附庸依附。",
        yearMin: 1980,
        monthMin: 1,
        duration: 12,
        conditionDesc: "1980 年起即可推进",
        effects: {
          gdpBonus: 0.20,
          reserveMonthly: 1.0,
          stabilityBonus: 6,
          desc: "资源出超外汇流入提升，抵御国际价格震荡韧性增强 (+0.20pp/年，外汇流 +1.0亿/月)"
        }
      },
      {
        id: "gen_import_substitution",
        title: "进口替代与本土基础工业体系",
        category: "工业化",
        icon: "🏗️",
        desc: "对关键工业品建立本土化配套替代产能，保护本土新兴民族工业，减轻外汇储备赤字消耗压力。",
        yearMin: 1982,
        monthMin: 1,
        duration: 15,
        conditionDesc: "1982 年起即可推进",
        effects: {
          gdpBonus: 0.25,
          stabilityBonus: 8,
          desc: "本土基础工业门类补齐，经常账户赤字压力有所改善 (+0.25pp/年，安定度 +8)"
        }
      }
    ]
  };

  // 纯函数辅助：按国家代码获取该国议程列表
  function getAgendasForCountry(cKey) {
    if (!cKey) return AGENDAS.DEFAULT;
    return AGENDAS[cKey] || AGENDAS.DEFAULT;
  }

  window.W1980_AGENDAS = {
    database: AGENDAS,
    getAgendasForCountry: getAgendasForCountry
  };
})();
