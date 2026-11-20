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
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          sezMomentum: 10
        },
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
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          dualTrackPrice: -8
        },
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
        // K（玩法深度）：门控统一由数据侧声明（faction），引擎只按声明求值，见 07-domestic.js checkAgendaCondition。
        condition: "domestic_faction",
        faction: { key: "chn", lead: "reformist", over: "planned", leadLabel: "特区/市场派", overLabel: "计划/国营派" },
        conditionDesc: "需完成百万大裁军，且特区/市场派权重高于计划/国营派",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          sezMomentum: 14,
          reformist: 6,
          planned: -6
        },
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
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          tradeFriction: -6,
          exportist: 4,
          domesticist: -4
        },
        effects: {
          gdpBonus: 0.25,
          reserveMonthly: 2.0,
          desc: "东亚雁阵分工成型，海外资产投资利润持续反哺本土母公司 (+0.25pp/年，外汇流 +2.0亿 USD/月)"
        }
      },
      {
        // K（玩法深度）：JPN 三步议程树的末步 —— 半导体 → 黑潮出海 → 前川报告。
        // 门控挂在「内政天平」上：只有内需开放派压过出口产业派（即海外摩擦产业已转移出去），
        // 主动收窄顺差、扩内需的路线才推得动。完成黑潮计划会压低外部摩擦压力，
        // 而摩擦压力回落又反哺内需开放派，形成「门控 → 议程 → 内政 → 解锁」闭环。
        id: "jpn_maekawa",
        title: "前川报告与内需主导转型",
        category: "结构转型",
        icon: "🏙️",
        desc: "落实前川报告路线：主动压缩经常收支顺差、开放国内市场、扩大住宅与公共投资，把增长动力从外需转向内需，从根上化解对美贸易摩擦。",
        yearMin: 1986,
        monthMin: 4,
        duration: 15,
        requires: "jpn_black_current",
        condition: "domestic_faction",
        faction: { key: "jpn", lead: "domesticist", over: "exportist", leadLabel: "内需开放派", overLabel: "出口产业派" },
        conditionDesc: "需完成黑潮计划，且内需开放派权重高于出口产业派",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          tradeFriction: -14,
          domesticist: 8,
          exportist: -8,
          unrest: -2
        },
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 10,
          desc: "贸易摩擦从根上缓和，增长动力切换至内需 (+0.30pp/年，安定度 +10)"
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
        // K（玩法深度）：门控统一由数据侧声明（faction），与 CHN 同构。
        condition: "domestic_faction",
        faction: { key: "deu", field: "detenteDepth", min: 55, fieldLabel: "东西欧缓和深度" },
        conditionDesc: "1980 年起可推进，且东西欧缓和深度 ≥ 55（内政天平偏向缓和派）",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          detenteDepth: 8
        },
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
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          natoBurden: -5
        },
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
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          natoBurden: 10
        },
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
      },
      {
        // K（玩法深度）：FRA 三步议程树 —— 国有化 → 紧缩转向 → 工业重组。
        // 第一步门控在「国家干预派」占优时开放；完成国有化会即时恶化法郎与外部压力，
        // 把内政天平推向紧缩坚挺派，从而解锁第二步；第二步执政后法郎回升，
        // 又解锁第三步的高竞争力门控。三者互为因果，与 CHN/DEU 同构。
        id: "fra_nationalization",
        title: "国有化浪潮与产业重整",
        category: "国家干预",
        icon: "🏭",
        desc: "对五大工业集团与三十余家银行实施国有化，以国家资本主导产业重整与就业保护，构筑「国家冠军」工业体系。",
        yearMin: 1981,
        monthMin: 6,
        duration: 15,
        condition: "domestic_faction",
        faction: { key: "fra", lead: "dirigiste", over: "rigueur", leadLabel: "国家干预派", overLabel: "紧缩坚挺派" },
        conditionDesc: "需由国家干预派掌舵（干预派权重高于紧缩派）",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          dirigiste: 6,
          rigueur: -6,
          francStrength: -12,
          externalPressure: 10
        },
        effects: {
          gdpBonus: 0.20,
          desc: "国家冠军工业体系成型，重化与军工产能扩张 (+0.20pp/年)"
        }
      },
      {
        id: "fra_rigueur",
        title: "紧缩转向与法郎坚挺",
        category: "货币纪律",
        icon: "💱",
        desc: "在赤字与通胀压力下强行掉头：冻结工资与物价、削减公共开支、坚持法郎在欧洲货币体系内的坚挺平价，压平通胀预期并止住资本外逃。",
        yearMin: 1983,
        monthMin: 3,
        duration: 15,
        requires: "fra_nationalization",
        condition: "domestic_faction",
        faction: { key: "fra", lead: "rigueur", over: "dirigiste", leadLabel: "紧缩坚挺派", overLabel: "国家干预派" },
        conditionDesc: "需完成国有化，且紧缩坚挺派权重高于国家干预派",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          rigueur: 8,
          dirigiste: -8,
          francStrength: 15,
          externalPressure: -8,
          unrest: 2
        },
        effects: {
          gdpBonus: 0.25,
          stabilityBonus: -4,
          desc: "通胀与资本外逃受控，法郎平价稳住 (+0.25pp/年，紧缩初期民怨上升 −4 安定)"
        }
      },
      {
        id: "fra_reconversion",
        title: "工业重组与私有化起步",
        category: "结构转型",
        icon: "⚙️",
        desc: "在市场纪律下推进亏损国企重组与首次私有化，裁撤过剩产能，把资源转向高附加值的航天、核能与高速铁路产业。",
        yearMin: 1986,
        monthMin: 6,
        duration: 15,
        requires: "fra_rigueur",
        condition: "domestic_faction",
        faction: { key: "fra", field: "francStrength", min: 55, fieldLabel: "法郎与外部竞争力" },
        conditionDesc: "需先完成紧缩转向，且法郎与外部竞争力 ≥ 55",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          francStrength: 10,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 8,
          desc: "高附加值产业接棒，出口竞争力回升 (+0.30pp/年，安定度 +8)"
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
      },
      {
        // K（玩法深度）：GBR 三步议程树 —— 货币主义转向 → 工会法制改革 → 大众持股。
        // 第一步门控在货币主义派占优时开放；完成转向会压低通胀、抬升金融城竞争力，
        // 为第三步的竞争力门控铺路；高动荡则反噬执政派，形成「激进改革 ↔ 社会代价」张力。
        id: "gbr_monetarist_turn",
        title: "货币主义转向与通胀压制",
        category: "撒切尔主义",
        icon: "📉",
        desc: "以严控货币供应量与高利率取代战后需求管理共识，宁可容忍失业上升也要压平通胀预期，重建财政纪律。",
        yearMin: 1980,
        monthMin: 5,
        duration: 15,
        condition: "domestic_faction",
        faction: { key: "gbr", lead: "monetarist", over: "welfarist", leadLabel: "货币主义派", overLabel: "福利共识派" },
        conditionDesc: "需由货币主义派掌舵（货币主义派权重高于福利共识派）",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          inflation: -14,
          cityStrength: 6,
          monetarist: 6,
          welfarist: -6,
          unrest: 3
        },
        effects: {
          gdpBonus: -0.15,
          stabilityBonus: -8,
          desc: "通胀预期被强行锚定，但产出与就业短期付代价 (−0.15pp/年，初期动荡上升 −8 安定)"
        }
      },
      {
        id: "gbr_union_reform",
        title: "工会法制改革与矿工对峙",
        category: "劳动市场",
        icon: "⚒️",
        desc: "以《工会法》限制次级纠察与政治性罢工，在煤炭、印刷等行业与工会正面对峙，解除劳动市场的制度性僵化。",
        yearMin: 1984,
        monthMin: 3,
        duration: 15,
        requires: "gbr_monetarist_turn",
        conditionDesc: "需先完成货币主义转向，1984 年矿工罢工期启动",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          inflation: -6,
          cityStrength: 4,
          unrest: 4
        },
        effects: {
          gdpBonus: 0.20,
          stabilityBonus: -6,
          desc: "罢工冲击被压制，劳动市场弹性回升 (+0.20pp/年，社会张力短期上升 −6 安定)"
        }
      },
      {
        id: "gbr_wider_shareholding",
        title: "大众持股与住房私有化",
        category: "社会结构",
        icon: "🏘️",
        desc: "扩大公房「购买权」与国企职工持股，把数百万家庭转化为有产者，以财产权重构投票基础并提振消费。",
        yearMin: 1986,
        monthMin: 6,
        duration: 15,
        requires: "gbr_union_reform",
        condition: "domestic_faction",
        faction: { key: "gbr", field: "cityStrength", min: 55, fieldLabel: "金融城与服务业竞争力" },
        conditionDesc: "需先完成工会法制改革，且金融城与服务业竞争力 ≥ 55",
        // 完成回馈：引擎按声明把增量施加到本国的内政状态（0~100 夹取）。
        onComplete: {
          cityStrength: 8,
          unrest: -4
        },
        effects: {
          gdpBonus: 0.30,
          stabilityBonus: 10,
          desc: "有产者阶层扩张带动消费与金融深化 (+0.30pp/年，安定度 +10)"
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

    // ---------------------------------------------------- Phase Mid：次极大国浅层议程
    // 纯数据 + 既有 onComplete / 门控词表；引擎不加国家分派。
    // 默认史实路径不自动启动（aiMajors 仍仅七大国），仅执政该国时由玩家推进。

    // ---------------------------------------------------- 印度 (IND)
    IND: [
      {
        id: "ind_green_revolution",
        title: "绿色革命深化与粮食自给",
        category: "农业立国",
        icon: "🌾",
        desc: "扩大高产小麦与水稻推广、灌溉与化肥配套，巩固粮食自给底线，减轻外汇购粮压力并为工业积累腾出空间。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.22,
          reserveMonthly: 0.8,
          desc: "粮仓稳住后进口粮开支下降，财政与外汇腾挪空间扩大 (+0.22pp/年，外汇流 +0.8亿/月)"
        }
      },
      {
        id: "ind_nonaligned_trade",
        title: "不结盟多元经贸与南南合作",
        category: "外交经济",
        icon: "🌐",
        desc: "在不结盟框架下拓宽对欧、海湾与东南亚的贸易结算通道，降低对单一超级大国市场与信贷的依附。",
        yearMin: 1983,
        monthMin: 1,
        duration: 12,
        requires: "ind_green_revolution",
        conditionDesc: "需先完成绿色革命深化，1983 年起推进",
        onComplete: {
          sanctionStrain: -8,
          legitimacy: 4
        },
        effects: {
          gdpBonus: 0.18,
          reserveMonthly: 1.0,
          stabilityBonus: 6,
          desc: "出口目的地分散，外部施压弹性上升 (+0.18pp/年，外汇流 +1.0亿/月，安定度 +6)"
        }
      },
      {
        id: "ind_soft_export",
        title: "软件与服务业外向化萌芽",
        category: "产业升级",
        icon: "💻",
        desc: "以班加罗尔等地为据点推动软件外包与工程服务出口，在轻装军费约束下把人力红利转成经常账户顺差。",
        yearMin: 1986,
        monthMin: 6,
        duration: 15,
        requires: "ind_nonaligned_trade",
        condition: "mil_le_3",
        conditionDesc: "需先完成多元经贸，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 6,
          stability: 5,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.28,
          reserveMonthly: 1.2,
          desc: "服务业出口开辟新的创汇通道 (+0.28pp/年，外汇流 +1.2亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 意大利 (ITA)
    ITA: [
      {
        id: "ita_ems_anchor",
        title: "里拉锚定与欧洲货币纪律",
        category: "货币财政",
        icon: "💶",
        desc: "借欧洲货币体系纪律压制通胀预期，整顿公共财政与工资指数化惯性，为北方工业恢复竞争力铺路。",
        yearMin: 1980,
        monthMin: 1,
        duration: 12,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          stability: 5,
          legitimacy: 3
        },
        effects: {
          gdpBonus: 0.15,
          stabilityBonus: 5,
          desc: "通胀预期收敛，投资信心回升 (+0.15pp/年，安定度 +5)"
        }
      },
      {
        id: "ita_industrial_triangle",
        title: "北方工业三角与南方基建",
        category: "区域发展",
        icon: "🏗️",
        desc: "巩固米兰—都灵—热那亚工业三角的出口产能，同时以结构性基金推进南方港口与交通基建，缓解南北裂隙。",
        yearMin: 1983,
        monthMin: 3,
        duration: 14,
        requires: "ita_ems_anchor",
        conditionDesc: "需先完成里拉锚定，1983 年起推进",
        onComplete: {
          legitimacy: 5,
          unrest: -4
        },
        effects: {
          gdpBonus: 0.24,
          reserveMonthly: 0.9,
          stabilityBonus: 7,
          desc: "制造业出口与基建投资并进 (+0.24pp/年，外汇流 +0.9亿/月，安定度 +7)"
        }
      },
      {
        id: "ita_nato_south",
        title: "北约南翼防务分担",
        category: "联盟防务",
        icon: "⚓",
        desc: "在地中海侧翼提高可部署兵力与港口保障，换取联盟内话语权与安全外溢，但须维持足够的防务开支。",
        yearMin: 1985,
        monthMin: 1,
        duration: 12,
        requires: "ita_industrial_triangle",
        condition: "mil_ge_5",
        conditionDesc: "需先完成工业三角，且国防军费占比 ≥ 5.0%",
        onComplete: {
          stability: 4,
          legitimacy: 4
        },
        effects: {
          gdpBonus: 0.12,
          stabilityBonus: 8,
          desc: "联盟可信度提升带来政治稳定红利 (+0.12pp/年，安定度 +8)"
        }
      }
    ],

    // ---------------------------------------------------- 巴西 (BRA)
    BRA: [
      {
        id: "bra_debt_turn",
        title: "债务危机应对与出口导向转向",
        category: "宏观稳定",
        icon: "📉",
        desc: "面对拉美债务冲击，以出口导向与财政整顿换取偿债喘息，稳住外汇储备与国际信用。",
        yearMin: 1982,
        monthMin: 8,
        duration: 14,
        conditionDesc: "1982 年债务危机窗口起可启动",
        onComplete: {
          sanctionStrain: -6,
          legitimacy: 4
        },
        effects: {
          gdpBonus: 0.12,
          reserveMonthly: 1.1,
          stabilityBonus: 4,
          desc: "经常账户改善，外债展期空间打开 (+0.12pp/年，外汇流 +1.1亿/月)"
        }
      },
      {
        id: "bra_democratization",
        title: "民主转型巩固与文官统治",
        category: "政体转型",
        icon: "🗳️",
        desc: "完成军政府向文官宪政的交接，重建政党竞争与社会契约，以合法性换取改革推进空间。",
        yearMin: 1985,
        monthMin: 3,
        duration: 12,
        requires: "bra_debt_turn",
        conditionDesc: "需先稳住债务危机，1985 年民主化窗口推进",
        onComplete: {
          legitimacy: 10,
          unrest: -5,
          stability: 6
        },
        effects: {
          gdpBonus: 0.18,
          stabilityBonus: 10,
          desc: "政治不确定性下降，投资与消费信心回暖 (+0.18pp/年，安定度 +10)"
        }
      },
      {
        id: "bra_regional_market",
        title: "南方共同市场萌芽",
        category: "区域一体化",
        icon: "🤝",
        desc: "与南锥体邻国推进关税协调与工业互补，把国内市场延伸为区域市场，分散对北美需求的依赖。",
        yearMin: 1988,
        monthMin: 1,
        duration: 15,
        requires: "bra_democratization",
        condition: "mil_le_3",
        conditionDesc: "需先完成民主转型，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.26,
          reserveMonthly: 1.0,
          desc: "区域贸易扩张抬升制造业产能利用率 (+0.26pp/年，外汇流 +1.0亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 韩国 (KOR)
    KOR: [
      {
        id: "kor_heavy_chemical",
        title: "汉江奇迹：重化工业冲刺",
        category: "产业政策",
        icon: "🏭",
        desc: "继续加码钢铁、造船、石化与汽车产业链，以出口信贷与财阀动员把赶超型工业化推到新台阶。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 4,
          stability: 3
        },
        effects: {
          gdpBonus: 0.32,
          reserveMonthly: 1.4,
          desc: "重化出口顺差扩大，储备快速累积 (+0.32pp/年，外汇流 +1.4亿/月)"
        }
      },
      {
        id: "kor_electronics_export",
        title: "电子与半导体出口崛起",
        category: "技术赶超",
        icon: "📺",
        desc: "从消费电子迈向存储芯片与电信设备，把日本雁阵中的下一阶梯变成本土主业。",
        yearMin: 1983,
        monthMin: 6,
        duration: 15,
        requires: "kor_heavy_chemical",
        conditionDesc: "需先完成重化工业冲刺，1983 年起推进",
        onComplete: {
          legitimacy: 5,
          sanctionStrain: -4
        },
        effects: {
          gdpBonus: 0.35,
          reserveMonthly: 1.6,
          stabilityBonus: 5,
          desc: "高附加值出口抬升贸易条件 (+0.35pp/年，外汇流 +1.6亿/月，安定度 +5)"
        }
      },
      {
        id: "kor_middle_class",
        title: "中产扩张与社会契约重订",
        category: "社会整合",
        icon: "🏙️",
        desc: "在出口繁荣基础上扩大住房、教育与工资分享，把增长红利转化为更稳的执政社会基础。",
        yearMin: 1987,
        monthMin: 6,
        duration: 12,
        requires: "kor_electronics_export",
        condition: "mil_le_3",
        conditionDesc: "需先完成电子出口崛起，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 8,
          stability: 8,
          unrest: -6
        },
        effects: {
          gdpBonus: 0.20,
          stabilityBonus: 12,
          desc: "内需与社会稳定支撑下一轮增长 (+0.20pp/年，安定度 +12)"
        }
      }
    ],

    // ---------------------------------------------------- Phase Mid2：次极议程第二批
    // 同 Mid：纯数据 + 既有 onComplete / 门控词表；引擎不加国家分派。
    // aiMajors 仍仅七大国 —— 默认史实路径不自动启动。

    // ---------------------------------------------------- 土耳其 (TUR)
    TUR: [
      {
        id: "tur_ozal_export",
        title: "厄扎尔出口导向与自由化",
        category: "开放改革",
        icon: "📦",
        desc: "以出口补贴、汇率弹性与进口替代松绑推动制造业出海，把政变后的稳定窗口换成经常账户改善。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.24,
          reserveMonthly: 1.0,
          desc: "出口订单带动产能利用率与外汇流入 (+0.24pp/年，外汇流 +1.0亿/月)"
        }
      },
      {
        id: "tur_anatolian_tigers",
        title: "安纳托利亚虎与侨汇网络",
        category: "区域工业",
        icon: "🐯",
        desc: "扶持内地中小出口商与欧洲侨汇回流通道，把沿海增长扩散到安纳托利亚腹地，缓解区域裂隙。",
        yearMin: 1983,
        monthMin: 6,
        duration: 13,
        requires: "tur_ozal_export",
        conditionDesc: "需先完成出口导向改革，1983 年起推进",
        onComplete: {
          legitimacy: 4,
          unrest: -4,
          sanctionStrain: -5
        },
        effects: {
          gdpBonus: 0.20,
          reserveMonthly: 1.1,
          stabilityBonus: 6,
          desc: "内地工业与侨汇并进，外部施压弹性上升 (+0.20pp/年，外汇流 +1.1亿/月，安定度 +6)"
        }
      },
      {
        id: "tur_nato_southeast",
        title: "北约东南翼防务加固",
        category: "联盟防务",
        icon: "🛡️",
        desc: "在东南翼提高可部署兵力与基地保障，换取联盟内话语权与安全外溢，但须维持足够的防务开支。",
        yearMin: 1986,
        monthMin: 1,
        duration: 12,
        requires: "tur_anatolian_tigers",
        condition: "mil_ge_5",
        conditionDesc: "需先完成安纳托利亚虎，且国防军费占比 ≥ 5.0%",
        onComplete: {
          stability: 5,
          legitimacy: 4
        },
        effects: {
          gdpBonus: 0.12,
          stabilityBonus: 8,
          desc: "联盟可信度提升带来政治稳定红利 (+0.12pp/年，安定度 +8)"
        }
      }
    ],

    // ---------------------------------------------------- 西班牙 (ESP)
    ESP: [
      {
        id: "esp_demo_consolidate",
        title: "民主巩固与宪法秩序",
        category: "政体巩固",
        icon: "📜",
        desc: "在后佛朗哥转型基础上巩固议会制与地方自治契约，以合法性换取改革推进空间，稳住投资预期。",
        yearMin: 1980,
        monthMin: 1,
        duration: 12,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 8,
          unrest: -5,
          stability: 6
        },
        effects: {
          gdpBonus: 0.16,
          stabilityBonus: 8,
          desc: "政治不确定性下降，投资与消费信心回暖 (+0.16pp/年，安定度 +8)"
        }
      },
      {
        id: "esp_ec_accession",
        title: "欧共体加入与单一市场对接",
        category: "欧洲一体化",
        icon: "🇪🇺",
        desc: "完成加入欧共体谈判与法规对接，以结构性基金与市场准入换取工业现代化压力下的转型窗口。",
        yearMin: 1986,
        monthMin: 1,
        duration: 14,
        requires: "esp_demo_consolidate",
        conditionDesc: "需先完成民主巩固，1986 年入盟窗口推进",
        onComplete: {
          legitimacy: 6,
          sanctionStrain: -6
        },
        effects: {
          gdpBonus: 0.26,
          reserveMonthly: 1.2,
          stabilityBonus: 5,
          desc: "单一市场准入与基金流入抬升产能 (+0.26pp/年，外汇流 +1.2亿/月，安定度 +5)"
        }
      },
      {
        id: "esp_reconversion",
        title: "工业重组与旅游创汇升级",
        category: "结构转型",
        icon: "🏖️",
        desc: "在轻装军费约束下推进夕阳产业重组，并把海岸旅游与服务业出口做成经常账户支柱。",
        yearMin: 1988,
        monthMin: 6,
        duration: 12,
        requires: "esp_ec_accession",
        condition: "mil_le_3",
        conditionDesc: "需先完成欧共体加入，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 5,
          stability: 5,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.22,
          reserveMonthly: 1.4,
          desc: "旅游与服务业顺差巩固储备 (+0.22pp/年，外汇流 +1.4亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 埃及 (EGY)
    EGY: [
      {
        id: "egy_camp_david_dividend",
        title: "戴维营和平红利与美援轴",
        category: "战略转向",
        icon: "🕊️",
        desc: "巩固与美战略伙伴关系与军经援助通道，把中东和平红利转化为财政喘息与外部信用。",
        yearMin: 1980,
        monthMin: 1,
        duration: 12,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 5,
          sanctionStrain: -8
        },
        effects: {
          gdpBonus: 0.14,
          reserveMonthly: 1.3,
          stabilityBonus: 5,
          desc: "援助与信用改善抬升储备缓冲 (+0.14pp/年，外汇流 +1.3亿/月，安定度 +5)"
        }
      },
      {
        id: "egy_suez_tourism",
        title: "苏伊士通道与旅游创汇",
        category: "外汇支柱",
        icon: "🚢",
        desc: "扩大运河通行效率与尼罗河—红海旅游走廊，把过境费与游客美元做成经常账户主轴。",
        yearMin: 1983,
        monthMin: 3,
        duration: 13,
        requires: "egy_camp_david_dividend",
        conditionDesc: "需先巩固美援轴，1983 年起推进",
        onComplete: {
          legitimacy: 4,
          stability: 4
        },
        effects: {
          gdpBonus: 0.20,
          reserveMonthly: 1.5,
          desc: "过境费与旅游顺差扩大 (+0.20pp/年，外汇流 +1.5亿/月)"
        }
      },
      {
        id: "egy_infitah_deepen",
        title: "开放政策深化与轻装军费",
        category: "经济开放",
        icon: "🏗️",
        desc: "在军费约束下深化私营部门与外资准入，把开放政策从口岸扩到制造业与服务业。",
        yearMin: 1986,
        monthMin: 6,
        duration: 14,
        requires: "egy_suez_tourism",
        condition: "mil_le_3",
        conditionDesc: "需先完成苏伊士—旅游支柱，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 6,
          stability: 5,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.25,
          reserveMonthly: 1.0,
          stabilityBonus: 7,
          desc: "私营投资与外资流入抬升增长 (+0.25pp/年，外汇流 +1.0亿/月，安定度 +7)"
        }
      }
    ],

    // ---------------------------------------------------- 巴基斯坦 (PAK)
    PAK: [
      {
        id: "pak_afghan_frontline",
        title: "阿富汗前沿与美援杠杆",
        category: "地缘窗口",
        icon: "🏔️",
        desc: "利用苏联入侵阿富汗的前沿地位换取美援与国际信用，稳住外汇储备并巩固执政联盟。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 5,
          sanctionStrain: -6
        },
        effects: {
          gdpBonus: 0.15,
          reserveMonthly: 1.2,
          stabilityBonus: 4,
          desc: "援助流入与信用改善打开财政喘息 (+0.15pp/年，外汇流 +1.2亿/月)"
        }
      },
      {
        id: "pak_remittance_textile",
        title: "侨汇网络与纺织出口扩张",
        category: "创汇产业",
        icon: "🧵",
        desc: "拓宽海湾侨汇通道与棉纺成衣出口配额，把人力红利转成经常账户顺差。",
        yearMin: 1983,
        monthMin: 6,
        duration: 13,
        requires: "pak_afghan_frontline",
        conditionDesc: "需先稳住前沿美援窗口，1983 年起推进",
        onComplete: {
          legitimacy: 4,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.22,
          reserveMonthly: 1.3,
          stabilityBonus: 5,
          desc: "侨汇与纺织顺差抬升储备 (+0.22pp/年，外汇流 +1.3亿/月，安定度 +5)"
        }
      },
      {
        id: "pak_heavy_chemical",
        title: "重化工业与战略自主",
        category: "产业自主",
        icon: "⚙️",
        desc: "在足够防务开支支撑下推进钢铁、化肥与战略工业配套，降低关键投入品的外部依附。",
        yearMin: 1986,
        monthMin: 1,
        duration: 15,
        requires: "pak_remittance_textile",
        condition: "mil_ge_5",
        conditionDesc: "需先完成纺织出口扩张，且国防军费占比 ≥ 5.0%",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.28,
          reserveMonthly: 0.9,
          techSecurity: 8,
          desc: "重化配套降低进口依赖并外溢技术安全 (+0.28pp/年，外汇流 +0.9亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- Phase Mid3：次极议程第三批（华约卫星）
    // 同 Mid/Mid2：纯数据 + 既有 onComplete / 门控词表；引擎不加国家分派。
    // aiMajors 仍仅七大国 —— 默认史实路径不自动启动；勿改默认史实 GDP 曲线。

    // ---------------------------------------------------- 波兰 (POL)
    POL: [
      {
        id: "pol_martial_credit",
        title: "军管后稳定与西方信贷喘息",
        category: "危机善后",
        icon: "🛡️",
        desc: "在戒严与团结工会冲击后以军管框架稳住供给链，并重新打开西方粮食与信贷窗口，换取财政喘息。",
        yearMin: 1982,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1982 年军管善后窗口起可启动",
        onComplete: {
          legitimacy: 4,
          unrest: -5,
          sanctionStrain: -6
        },
        effects: {
          gdpBonus: 0.12,
          reserveMonthly: 0.9,
          stabilityBonus: 6,
          desc: "供给链回稳与信贷流入打开喘息空间 (+0.12pp/年，外汇流 +0.9亿/月，安定度 +6)"
        }
      },
      {
        id: "pol_round_table",
        title: "圆桌会议与政治开放",
        category: "政体转型",
        icon: "🤝",
        desc: "以圆桌协商重建社会契约，放开有限政党竞争与工会合法空间，用合法性换取改革推进窗口。",
        yearMin: 1988,
        monthMin: 1,
        duration: 12,
        requires: "pol_martial_credit",
        conditionDesc: "需先稳住军管善后，1988 年圆桌窗口推进",
        onComplete: {
          legitimacy: 10,
          unrest: -6,
          stability: 5
        },
        effects: {
          gdpBonus: 0.16,
          stabilityBonus: 8,
          desc: "政治不确定性下降，投资与消费信心回暖 (+0.16pp/年，安定度 +8)"
        }
      },
      {
        id: "pol_market_transition",
        title: "价格自由化与轻装转型",
        category: "市场转型",
        icon: "📈",
        desc: "在轻装军费约束下推进价格自由化与贸易开放，把短缺经济改成可计价的市场配置。",
        yearMin: 1989,
        monthMin: 6,
        duration: 14,
        requires: "pol_round_table",
        condition: "mil_le_3",
        conditionDesc: "需先完成圆桌开放，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 6,
          stability: 4,
          unrest: -3
        },
        effects: {
          gdpBonus: 0.22,
          reserveMonthly: 1.1,
          desc: "价格信号恢复带动出口与储备回升 (+0.22pp/年，外汇流 +1.1亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 匈牙利 (HUN)
    HUN: [
      {
        id: "hun_nem_deepen",
        title: "新经济机制深化与小私有",
        category: "改革深化",
        icon: "🔧",
        desc: "扩大企业自主权与小私有经营空间，把卡达尔式改革从农业副业推进到工业与服务业。",
        yearMin: 1980,
        monthMin: 1,
        duration: 13,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.18,
          reserveMonthly: 0.8,
          stabilityBonus: 5,
          desc: "激励相容改善抬升产能利用率 (+0.18pp/年，外汇流 +0.8亿/月，安定度 +5)"
        }
      },
      {
        id: "hun_west_joint",
        title: "对西合资与旅游创汇",
        category: "开放窗口",
        icon: "🌏",
        desc: "扩大与西欧的合资与来访旅游，把多瑙河走廊做成经常账户与技术引进的窗口。",
        yearMin: 1983,
        monthMin: 6,
        duration: 13,
        requires: "hun_nem_deepen",
        conditionDesc: "需先深化新经济机制，1983 年起推进",
        onComplete: {
          legitimacy: 4,
          sanctionStrain: -5
        },
        effects: {
          gdpBonus: 0.22,
          reserveMonthly: 1.2,
          stabilityBonus: 5,
          desc: "旅游与合资顺差抬升储备 (+0.22pp/年，外汇流 +1.2亿/月，安定度 +5)"
        }
      },
      {
        id: "hun_border_open",
        title: "边境开放与市场导向",
        category: "转型加速",
        icon: "🚪",
        desc: "在轻装军费约束下拆除铁幕边防惯性，加速价格与贸易自由化，把改革红利兑现为增长。",
        yearMin: 1988,
        monthMin: 6,
        duration: 12,
        requires: "hun_west_joint",
        condition: "mil_le_3",
        conditionDesc: "需先完成对西开放窗口，且国防军费占比 ≤ 3.0%",
        onComplete: {
          legitimacy: 7,
          unrest: -4,
          stability: 5
        },
        effects: {
          gdpBonus: 0.26,
          reserveMonthly: 1.0,
          desc: "边境开放带动贸易与投资流入 (+0.26pp/年，外汇流 +1.0亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 捷克斯洛伐克 (CSK)
    CSK: [
      {
        id: "csk_normalize_industry",
        title: "正常化工业纪律与经互会分工",
        category: "工业纪律",
        icon: "🏭",
        desc: "在正常化框架下巩固机械与军工配套产能，按经互会分工稳住出口配额与就业。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 4,
          stability: 5
        },
        effects: {
          gdpBonus: 0.16,
          reserveMonthly: 0.7,
          stabilityBonus: 6,
          desc: "工业纪律回稳，配额出口与就业底线守住 (+0.16pp/年，外汇流 +0.7亿/月，安定度 +6)"
        }
      },
      {
        id: "csk_soft_export",
        title: "软出口与旅游解冻",
        category: "外汇窗口",
        icon: "🧳",
        desc: "扩大对西方的消费品软出口与布拉格旅游走廊，用有限开放换取硬通货与技术窗口。",
        yearMin: 1984,
        monthMin: 3,
        duration: 13,
        requires: "csk_normalize_industry",
        conditionDesc: "需先稳住工业纪律，1984 年起推进",
        onComplete: {
          legitimacy: 4,
          sanctionStrain: -4
        },
        effects: {
          gdpBonus: 0.20,
          reserveMonthly: 1.1,
          desc: "软出口与旅游顺差抬升储备 (+0.20pp/年，外汇流 +1.1亿/月)"
        }
      },
      {
        id: "csk_heavy_pact",
        title: "华约重工配套与防务分担",
        category: "联盟工业",
        icon: "⚙️",
        desc: "在足够防务开支支撑下强化华约机械—军工配套，以联盟内份额换取能源与市场配额。",
        yearMin: 1987,
        monthMin: 1,
        duration: 14,
        requires: "csk_soft_export",
        condition: "mil_ge_5",
        conditionDesc: "需先完成软出口解冻，且国防军费占比 ≥ 5.0%",
        onComplete: {
          legitimacy: 5,
          stability: 4
        },
        effects: {
          gdpBonus: 0.24,
          reserveMonthly: 0.8,
          techSecurity: 6,
          desc: "重工配套巩固联盟份额并外溢技术安全 (+0.24pp/年，外汇流 +0.8亿/月)"
        }
      }
    ],

    // ---------------------------------------------------- 罗马尼亚 (ROU)
    ROU: [
      {
        id: "rou_debt_payoff",
        title: "外债清偿与紧缩自主",
        category: "债务自主",
        icon: "📉",
        desc: "以出口创汇与国内紧缩加快清偿西方债务，换取政策自主与外部债权人压力下降。",
        yearMin: 1980,
        monthMin: 1,
        duration: 14,
        conditionDesc: "1980 年起即可启动",
        onComplete: {
          legitimacy: 3,
          sanctionStrain: -8,
          unrest: 2
        },
        effects: {
          gdpBonus: 0.10,
          reserveMonthly: 1.4,
          stabilityBonus: 3,
          desc: "偿债优先抬升储备、压缩外部施压 (+0.10pp/年，外汇流 +1.4亿/月)"
        }
      },
      {
        id: "rou_energy_autarky",
        title: "能源与石化自主",
        category: "产业自主",
        icon: "🛢️",
        desc: "加码本土油气与石化链条，降低对经互会能源配额的依附，把紧缩换来的自主落到产能上。",
        yearMin: 1983,
        monthMin: 6,
        duration: 13,
        requires: "rou_debt_payoff",
        conditionDesc: "需先推进外债清偿，1983 年起推进",
        onComplete: {
          legitimacy: 4,
          stability: 3
        },
        effects: {
          gdpBonus: 0.18,
          reserveMonthly: 1.0,
          stabilityBonus: 4,
          desc: "能源自主降低进口脆弱性 (+0.18pp/年，外汇流 +1.0亿/月，安定度 +4)"
        }
      },
      {
        id: "rou_securitate_fortress",
        title: "安全机器与战略工业堡垒",
        category: "政权加固",
        icon: "🏰",
        desc: "在高防务开支支撑下巩固安全机器与战略工业堡垒，以强制稳定换取政权存续窗口。",
        yearMin: 1986,
        monthMin: 1,
        duration: 15,
        requires: "rou_energy_autarky",
        condition: "mil_ge_5",
        conditionDesc: "需先完成能源自主，且国防军费占比 ≥ 5.0%",
        onComplete: {
          legitimacy: 2,
          unrest: -4,
          stability: 6
        },
        effects: {
          gdpBonus: 0.14,
          stabilityBonus: 8,
          techSecurity: 5,
          desc: "强制稳定抬升短期安定，工业堡垒外溢技术安全 (+0.14pp/年，安定度 +8)"
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
