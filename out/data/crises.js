/**
 * world1980 - 冷战中局突发危机抉择卡与升级阶梯数据库 (R12C)
 * 涵盖 1981-1989 年间 8 大历史突发微观地缘危机与三级博弈升级阶梯
 */
(function (global) {
  "use strict";

  const CRISES = [
    {
      id: "crisis_poland_1981",
      year: 1981,
      month: 12,
      title: "波兰戒严与团结工会危机",
      headline: "华约重兵集结与战时戒严法案",
      region: "东欧 / 华沙",
      target: "POL",
      initiator: "SUN",
      actors: ["SUN", "USA", "POL"],
      desc: "波兰团结工会发起全国性抗议罢工，国内政治局势濒临失控。克里姆林宫面临出兵直接军事干预的巨大压力，雅鲁泽尔斯基宣布全国进入战时状态实施军事管制。",
      options: [
        {
          tier: 1,
          title: "战略克制与政治解决",
          icon: "🕊️",
          desc: "默许波兰军管自主平息局势，向华沙提供紧急小麦与物资贷款，不对西方阵营施加公开军事威胁。",
          badge: "缓和路线",
          effects: {
            tensionDelta: -15,
            sunConservative: -4,
            sunReformist: +5,
            stabilityBonus: +6,
            summary: "双边对抗张力显著缓和，避免直接武装卷入，但克里姆林宫保守派对未能展现钢铁意志表示不满。"
          }
        },
        {
          tier: 2,
          title: "对等威慑与联合演习",
          icon: "⚖️",
          desc: "在波兰边境举行华约代号‘西方-81’联合军事演习，对团结工会形成高压威慑，维持既有冷战均势与地缘安全边界。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            sunConservative: +2,
            summary: "成功稳固华约北线战略安全边界，双边对抗态势维持均势平衡。"
          }
        },
        {
          tier: 3,
          title: "强硬通牒与直接军事戒备",
          icon: "⚡",
          desc: "向波兰发出最后通牒，苏军近卫装甲集群开入战略交通枢纽协助军管，向北约展示华约不可动摇的钢铁意志。",
          badge: "极限升级",
          effects: {
            tensionDelta: +25,
            sunConservative: +6,
            sunShortage: +5,
            usSanctionPressure: true,
            summary: "华约阵营凝聚力空前巩固，但引爆西方极限制裁与国际舆论谴责，美苏对抗张力急剧飙升。"
          }
        }
      ]
    },
    {
      id: "crisis_southgeorgia_1982",
      year: 1982,
      month: 3,
      title: "南乔治亚岛升旗与马岛前奏摩擦",
      headline: "南大西洋废品商登岛与潜艇战云",
      region: "南大西洋 / 南乔治亚岛",
      target: "GBR",
      initiator: "ARG",
      actors: ["GBR", "ARG", "USA"],
      desc: "阿根廷废品商在英属南乔治亚岛勒斯港升起阿根廷国旗，加尔铁里军政府海军运兵船暗中策应。伦敦派遣破冰巡逻船与快速攻击核潜艇南下，南大西洋战火一触即发。",
      options: [
        {
          tier: 1,
          title: "外交调停与领事沟通",
          icon: "🕊️",
          desc: "经由泛美组织及联合国渠道展开紧急外交斡旋，提议共同科考开发与管辖权冻结，避免全面冲突。",
          badge: "多边斡旋",
          effects: {
            tensionDelta: -10,
            gbrPopularity: -3,
            stabilityBonus: +4,
            summary: "成功避免前线擦枪走火，但英国国内舆论对白厅未能果断亮剑产生微词。"
          }
        },
        {
          tier: 2,
          title: "遣使交涉与有限警备巡逻",
          icon: "⚖️",
          desc: "派遣皇家海军‘持久号’巡逻舰并向布宜诺斯艾利斯递交强硬外交照会，重申主权底线并对等驱逐违规人员。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            gbrPopularity: +2,
            summary: "展现坚定主权立场，维持现有南大西洋军事平衡而不至于过早失控摊牌。"
          }
        },
        {
          tier: 3,
          title: "特混舰队动员与核潜艇封锁",
          icon: "⚡",
          desc: "宣布南乔治亚及福克兰群岛进入战备全封闭区，向南大西洋调遣两栖特混舰队主力与核潜艇执行海空全面封锁。",
          badge: "极限升级",
          effects: {
            tensionDelta: +20,
            gbrPopularity: +6,
            defconRisk: +1,
            summary: "激发大英帝国爱国狂潮，但两军进入交火倒计时，南大西洋战火全面引爆。"
          }
        }
      ]
    },
    {
      id: "crisis_kal007_1983",
      year: 1983,
      month: 9,
      title: "大韩航空 007 班机偏航事件",
      headline: "远东空域防空拦截与国际震荡",
      region: "远东 / 库页岛",
      target: "SUN",
      initiator: "USA",
      actors: ["USA", "SUN", "KOR", "JPN"],
      desc: "大韩航空波音 747 客机偏航进入堪察加半岛及库页岛敏感防空识别区，苏军苏-15 截击机将其误判为美军 RC-135 侦察机发射导弹击落，机上 269 人全部遇难。",
      options: [
        {
          tier: 1,
          title: "联合调查与危机降温",
          icon: "🕊️",
          desc: "对误击事件深表遗憾，向民航国际组织开放黑匣子搜寻协同，双方危机热线保持通畅，避免战备警报升级。",
          badge: "危机软着陆",
          effects: {
            tensionDelta: -15,
            usaCongressApproval: -3,
            summary: "危机在多边外交斡旋中平稳软着陆，避免核战备警报升级，但受到保守派强硬批评。"
          }
        },
        {
          tier: 2,
          title: "严正抗议与驱逐使节",
          icon: "⚖️",
          desc: "宣布对涉事责任军官与外交使节实施对等驱逐，暂停部分双边民用航空协定以示严正抗议与制裁。",
          badge: "史实基准",
          effects: {
            tensionDelta: +5,
            summary: "对等展现外交抗议立场，维护国家威严而不至于引发失控摊牌。"
          }
        },
        {
          tier: 3,
          title: "极限谴责与天基战略动员",
          icon: "⚡",
          desc: "定性为对自由世界的野蛮暴行，启动‘优秀射手-83’最高级别战备演练，极限升级巴统技术封锁与雷达监视。",
          badge: "极限升级",
          effects: {
            tensionDelta: +30,
            usaCongressApproval: +5,
            cocomStrict: true,
            summary: "大幅推升两党国会支持率与盟友同仇敌忾，但美苏核威慑时钟逼近零点危机。"
          }
        }
      ]
    },
    {
      id: "crisis_grenada_1983",
      year: 1983,
      month: 10,
      title: "格林纳达狂暴行动地缘摊牌",
      headline: "加勒比空降突击与不结盟阵营抗议",
      region: "加勒比海 / 圣乔治",
      target: "GRD",
      initiator: "USA",
      actors: ["USA", "CUB", "SUN"],
      desc: "格林纳达发生激进军事政变，古巴派遣数百名工程兵与军事顾问进驻萨利内斯角机场。华盛顿以撤侨为由展开突袭，引发拉美与华约联合外交抨击。",
      options: [
        {
          tier: 1,
          title: "加勒比共同体斡旋与有限撤侨",
          icon: "🕊️",
          desc: "仅由外交官租用民船和平撤出医学院留学生，交由东加勒比国家联盟进行区域政治调解与中立维和。",
          badge: "外交调停",
          effects: {
            tensionDelta: -10,
            usaCongressApproval: -4,
            stabilityBonus: +3,
            summary: "展现对加勒比国家主权的尊重，避免国际舆论抨击，但被国内鹰派指责缺乏大国果决。"
          }
        },
        {
          tier: 2,
          title: "外交隔离与海上巡逻警戒",
          icon: "⚖️",
          desc: "对格林纳达实施港口禁运隔离，联合东加勒比多国警察部队实施海上监视封锁与对等外交孤立。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            usaCongressApproval: +2,
            summary: "稳步遏制古巴在前沿岛链的军事渗透，维持加勒比海地缘均势。"
          }
        },
        {
          tier: 3,
          title: "跨军种空降突击与战略拔点",
          icon: "⚡",
          desc: "出动第 82 空降师与海军陆战队展开‘狂暴行动’全面空降，彻底拔除加勒比亲古巴政权并向哈瓦那发出直接威慑。",
          badge: "极限升级",
          effects: {
            tensionDelta: +20,
            usaCongressApproval: +6,
            cubanTension: +15,
            summary: "迅速拔除加勒比据点极大振奋美军士气，但在联合国大会遭遇压倒性不赞成决议。"
          }
        }
      ]
    },
    {
      id: "crisis_beirut_1985",
      year: 1985,
      month: 6,
      title: "贝鲁特与环球航空 847 人质危机",
      headline: "地中海劫机对峙与秘密人质斡旋",
      region: "中东 / 贝鲁特",
      target: "USA",
      initiator: "LBN",
      actors: ["USA", "ISR", "SYR", "SUN"],
      desc: "环球航空 847 号班机遭武装分子劫持迫降贝鲁特机场，机上美国乘客沦为人质并有一名水兵被杀害。地中海第 6 舰队战机紧急升空，白宫面临反恐与外交两难。",
      options: [
        {
          tier: 1,
          title: "第三国幕后斡旋与人道交换",
          icon: "🕊️",
          desc: "借助瑞士、阿尔及利亚与叙利亚外交渠道低调施压，促成以方释放部分在押人员换取全体人质安全获释。",
          badge: "人道斡旋",
          effects: {
            tensionDelta: -10,
            usaCongressApproval: -2,
            summary: "确保人质全部安全生还，避免美军深陷中东泥潭，但被批评向恐怖勒索做出妥协。"
          }
        },
        {
          tier: 2,
          title: "国际通缉与经济制裁代理人",
          icon: "⚖️",
          desc: "对劫机责任组织实施精准金融资产冻结与全球红色通缉，协同国际民航组织加强机场安保标准与情报共享。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            summary: "依法合规推进多边反恐防御，维持中东战略安全框架的基本稳定。"
          }
        },
        {
          tier: 3,
          title: "航母特混群抵近威慑与特种战备",
          icon: "⚡",
          desc: "将‘艾森豪威尔’号航母战斗群部署至黎巴嫩近海展开实弹空中巡逻，三角洲特种部队就位随时准备发起越境突击营救。",
          badge: "极限升级",
          effects: {
            tensionDelta: +20,
            usaCongressApproval: +4,
            middleEastTension: +10,
            summary: "强力展现超级大国对国民安全的铁腕保护，但地中海东岸战云密布，前线擦枪走火风险倍增。"
          }
        }
      ]
    },
    {
      id: "crisis_achille_1985",
      year: 1985,
      month: 10,
      title: "阿基莱·劳伦号游轮劫持事件",
      headline: "公海游轮人质危机与西西里领空截击",
      region: "地中海 / 锡吉诺拉",
      target: "ITA",
      initiator: "EGY",
      actors: ["USA", "ITA", "EGY"],
      desc: "意大利‘阿基莱·劳伦’号游轮在公海被巴勒斯坦阵线劫持，美籍残障游客遇害。随后美军 F-14 战机在西西里空域空中拦截埃及转运客机，与意大利宪兵发生对峙。",
      options: [
        {
          tier: 1,
          title: "尊重盟国司法管辖与外交降温",
          icon: "🕊️",
          desc: "承认意大利对领土主权与被扣押客机的首要司法审判权，平息北约南翼互信裂痕，强化盟友凝聚力。",
          badge: "盟友协商",
          effects: {
            tensionDelta: -10,
            natoCohesion: +5,
            summary: "成功弥合北约盟友内部裂痕，维护南欧与地中海联合防御体系大局。"
          }
        },
        {
          tier: 2,
          title: "联合引渡交涉与国际反恐诉讼",
          icon: "⚖️",
          desc: "由两国外交与司法部门联合向涉案引渡国提出司法互助请求，按国际公约在多边法治框架下惩治首恶。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            natoCohesion: +2,
            summary: "在维护主权尊严与反恐法律正义之间取得平衡，维持地中海均势稳定。"
          }
        },
        {
          tier: 3,
          title: "极限施压与基地停机坪武装封锁",
          icon: "⚡",
          desc: "美军特战分队强行封锁西西里锡吉诺拉基地跑道，发出最后通牒要求即刻将首犯引渡至美国法庭受审。",
          badge: "极限升级",
          effects: {
            tensionDelta: +15,
            usaCongressApproval: +5,
            natoCohesion: -8,
            summary: "展现绝不妥协的绝对反恐决心，但引发意大利政坛强烈反弹与北约内部互信严重震荡。"
          }
        }
      ]
    },
    {
      id: "crisis_vincennes_1988",
      year: 1988,
      month: 7,
      title: "文森斯号巡洋舰波斯湾误击 655 航班",
      headline: "霍尔木兹海峡防空误判与两伊油轮战阴云",
      region: "波斯湾 / 霍尔木兹海峡",
      target: "IRN",
      initiator: "USA",
      actors: ["USA", "IRN", "SUN"],
      desc: "在霍尔木兹海峡护航的美军宙斯盾巡洋舰‘文森斯’号误将伊朗航空 655 号空客民航机判读为 F-14 战斗机发射标准导弹击落，机上 290 人全部罹难。",
      options: [
        {
          tier: 1,
          title: "人道哀悼与防空交战规则重审",
          icon: "🕊️",
          desc: "公开深表遗憾并设立人道主义抚恤基金，改革海军雷达空情识别与交战规则，避免波斯湾冲突失控。",
          badge: "危机软着陆",
          effects: {
            tensionDelta: -15,
            middleEastTension: -10,
            summary: "为波斯湾油轮战紧张局势及时降温，展示负责任大国姿态，缓和国际社会严厉谴责。"
          }
        },
        {
          tier: 2,
          title: "技术辩护与海峡航运维持",
          icon: "⚖️",
          desc: "发布战区空情调查报告阐述交战自卫权法理，继续维持‘诚挚意志行动’国际油轮护航任务。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            summary: "捍卫波斯湾国际航道通行安全，维持霍尔木兹海峡既定力量均势。"
          }
        },
        {
          tier: 3,
          title: "维持极限战备与向德黑兰强硬通牒",
          icon: "⚡",
          desc: "重申霍尔木兹海峡国际航道安全不可侵犯，警告伊朗革命卫队快艇切勿试探美军反击决心与红线。",
          badge: "极限升级",
          effects: {
            tensionDelta: +20,
            middleEastTension: +15,
            summary: "彻底慑止前线快艇袭扰，但中东对抗风险飙升至新高，美伊几乎逼近全面直接交火边缘。"
          }
        }
      ]
    },
    {
      id: "crisis_romania_1989",
      year: 1989,
      month: 12,
      title: "罗马尼亚蒂米什瓦拉剧变",
      headline: "东欧终局震荡与布加勒斯特政权更迭",
      region: "巴尔干 / 布加勒斯特",
      target: "ROU",
      initiator: "ROU",
      actors: ["SUN", "USA", "ROU"],
      desc: "罗马尼亚蒂米什瓦拉工潮演变为全国性起义，军方倒戈倒向救国阵线，齐奥塞斯库政权崩溃。华约东欧最后堡垒面临解体与阵营重新站队。",
      options: [
        {
          tier: 1,
          title: "恪守辛纳屈主义与不干涉声明",
          icon: "🕊️",
          desc: "莫斯科公开重申不干涉东欧各国人民历史选择，积极与救国阵线建立平稳过渡外交关系，向西方展现善意。",
          badge: "和平演进",
          effects: {
            tensionDelta: -20,
            sunReformist: +6,
            sunConservative: -5,
            summary: "东欧转型实现和平软着陆，赢得西方阵营广泛赞誉，但克里姆林宫保守派痛心疾首视其为地缘惨败。"
          }
        },
        {
          tier: 2,
          title: "领事撤侨与人道走廊保障",
          icon: "⚖️",
          desc: "华约各方严守既定边境秩序，组织红十字会医疗救护与难民人道走廊，保持巴尔干边境秩序平稳。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            summary: "平稳保全侨民利益并阻断局部动荡扩散，维持最低限度的战略安全缓冲。"
          }
        },
        {
          tier: 3,
          title: "华约紧急磋商与保卫阵营成果声明",
          icon: "⚡",
          desc: "召集华约常设政治委员会发布强硬联合声明，警告北约不得利用东欧动荡扩张地缘势力，战备戒备提升至二级。",
          badge: "极限升级",
          effects: {
            tensionDelta: +25,
            sunConservative: +6,
            sunReformist: -6,
            summary: "激起保守派誓死捍卫体制的政治同盟，但彻底激化东西方阵营对峙，东欧剧变转入对抗深水区。"
          }
        }
      ]
    }
  ];

  // 公共 API 工具库
  const API = {
    list: CRISES,

    getCrisisById: function (id) {
      if (!id) return null;
      return CRISES.find(function (c) { return c.id === id; }) || null;
    },

    getCrisesForDate: function (year, month) {
      return CRISES.filter(function (c) {
        return c.year === year && c.month === month;
      });
    },

    cloneCrises: function () {
      return JSON.parse(JSON.stringify(CRISES));
    }
  };

  global.W1980_CRISES = API;
})(typeof window !== "undefined" ? window : globalThis);
