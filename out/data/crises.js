/**
 * world1980 - 冷战中局突发危机抉择卡与升级阶梯数据库 (R12C + Cri2 + Cri3)
 * 原 8 张 + Cri2 扩写 5 张（Able Archer / 黄金峡谷 / 切尔诺贝利 / 鲁斯特 / 柏林墙）
 * + Cri3 再扩 5 张（莫斯科奥运抵制 / 黎巴嫩战争 / 英国矿工潮 / 中导条约 /
 * 海湾前奏）。门控卡带 gate：日历仍是触发真理，国势只调制后果幅度与玩家是否弹窗，
 * 旁观仍按月记史实阶梯 2。Cri3 刻意避开 Able Archer / 切尔诺贝利等同月同效果双计。
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
      // D（数据层评审）：原 "GRD" 是悬空引用——格林纳达不在 54 实体/133 成员任一地址空间。
      // 修正为其所属可玩实体 CAR（加勒比联邦），危机地区语义不变（region 已写明圣乔治）。
      target: "CAR",
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
    },
    // ---- Phase Cri2：扩写 5 张史实热点（带国势门控）---------------------------
    {
      id: "crisis_ablearcher_1983",
      year: 1983,
      month: 11,
      title: "优秀射手-83 核误判危机",
      headline: "北约指挥所演习与华约最高战备误读",
      region: "中欧 / 北约指挥链",
      target: "DEU",
      initiator: "USA",
      actors: ["USA", "SUN", "DEU", "GBR"],
      gate: { modulate: true, minHeat: 0.28 },
      desc: "北约『优秀射手-83』指挥所演习逼近实战通信形态，克里姆林宫部分情报评估误判为核打击前奏，华约战略火箭军进入高度戒备。华盛顿与莫斯科的热线窗口骤然收窄。",
      options: [
        {
          tier: 1,
          title: "透明通报与演习降级",
          icon: "🕊️",
          desc: "提前向苏方通报演习脚本与终止时间表，压缩核指挥演练科目，热线保持高频通畅。",
          badge: "危机降温",
          effects: {
            tensionDelta: -18,
            defconRisk: -6,
            natoCohesion: -3,
            prestigeDelta: -2,
            summary: "成功避免核误判螺旋，但盟友批评演练可信度受损。"
          }
        },
        {
          tier: 2,
          title: "按既定脚本完成并加强热线",
          icon: "⚖️",
          desc: "按计划完成指挥所科目，同时加密热线通报与观察员通道，维持威慑可信而不主动加码。",
          badge: "史实基准",
          effects: {
            tensionDelta: +4,
            defconRisk: +3,
            natoCohesion: +2,
            summary: "演习按期收束，双边张力微升但核指挥链未失控。"
          }
        },
        {
          tier: 3,
          title: "实战化加码与前沿警戒提升",
          icon: "⚡",
          desc: "将部分实弹警戒与机动科目并入演练窗口，向前沿战区下达更高戒备等级以展示北约决心。",
          badge: "极限升级",
          effects: {
            tensionDelta: +28,
            defconRisk: +12,
            natoCohesion: +5,
            usaCongressApproval: +4,
            prestigeDelta: +3,
            summary: "同盟凝聚力上升，但核误判风险骤增，美苏对抗逼近事故边缘。"
          }
        }
      ]
    },
    {
      id: "crisis_eldorado_1986",
      year: 1986,
      month: 4,
      title: "黄金峡谷行动与的黎波里空袭",
      headline: "美利冲突升级与地中海空袭摊牌",
      region: "北非 / 的黎波里",
      target: "LBY",
      initiator: "USA",
      actors: ["USA", "LBY", "SUN", "GBR"],
      gate: { modulate: true, minHeat: 0.24 },
      desc: "柏林迪斯科厅爆炸牵出利比亚情报线，里根政府决定对卡扎菲指挥与防空节点实施『黄金峡谷』空袭。莫斯科与不结盟阵营强烈抗议，地中海战云密布。",
      options: [
        {
          tier: 1,
          title: "多边制裁与定向通缉",
          icon: "🕊️",
          desc: "推动安理会与欧共体定向制裁，冻结相关资产并扩大国际刑警通缉，避免直接空袭。",
          badge: "多边施压",
          effects: {
            tensionDelta: -8,
            usaCongressApproval: -4,
            prestigeDelta: -2,
            stabilityBonus: +3,
            summary: "避开直接交火，但国内鹰派指责白宫软弱。"
          }
        },
        {
          tier: 2,
          title: "有限打击军事与恐袭设施",
          icon: "⚖️",
          desc: "精确打击防空与训练营地，避开民用目标，事后向盟国通报法理依据。",
          badge: "史实基准",
          effects: {
            tensionDelta: +8,
            usaCongressApproval: +3,
            middleEastTension: +6,
            summary: "展示反恐决心，地中海张力可控上升。"
          }
        },
        {
          tier: 3,
          title: "扩大打击与政权更迭施压",
          icon: "⚡",
          desc: "扩大目标清单至指挥核心与港口设施，公开暗示政权更迭选项，航母战斗群抵近威慑。",
          badge: "极限升级",
          effects: {
            tensionDelta: +22,
            usaCongressApproval: +6,
            middleEastTension: +14,
            prestigeDelta: +4,
            usSanctionPressure: true,
            summary: "美国国内支持上升，但美苏与中东对抗急剧升温。"
          }
        }
      ]
    },
    {
      id: "crisis_chernobyl_1986",
      year: 1986,
      month: 5,
      title: "切尔诺贝利核灾难与信息公开",
      headline: "核电站熔毁、放射性尘埃与改革派压力",
      region: "东欧 / 普里皮亚季",
      target: "SUN",
      initiator: "SUN",
      actors: ["SUN", "USA", "POL", "DEU"],
      gate: { modulate: true },
      desc: "切尔诺贝利四号机组爆炸后，放射性尘埃越过国境。克里姆林宫面临封锁消息与公开改革的十字路口——保守派要维稳，改革派要透明，西方则借机施压。",
      options: [
        {
          tier: 1,
          title: "全面公开与国际援助通道",
          icon: "🕊️",
          desc: "向国际原子能机构开放现场，接受医疗与技术援助，加速信息公开与疏散。",
          badge: "透明改革",
          effects: {
            tensionDelta: -12,
            sunReformist: +7,
            sunConservative: -5,
            sunShortage: +4,
            prestigeDelta: +2,
            summary: "赢得国际同情与改革派支持，但短期物资与政治代价高昂。"
          }
        },
        {
          tier: 2,
          title: "有限通报与内部抢险优先",
          icon: "⚖️",
          desc: "对邻国做最低限度通报，集中力量封堆与疏散，对外口径保持克制。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            sunReformist: +2,
            sunShortage: +3,
            summary: "抢险优先稳住局面，信息公开仍滞后但未全面对抗。"
          }
        },
        {
          tier: 3,
          title: "封锁消息与强硬维稳",
          icon: "⚡",
          desc: "严格管制境外报道与国内舆论，以国家安全名义压制异议，拒绝西方『干涉性』援助。",
          badge: "极限维稳",
          effects: {
            tensionDelta: +15,
            sunConservative: +6,
            sunReformist: -6,
            sunShortage: +6,
            prestigeDelta: -4,
            summary: "保守派短期得势，但国际孤立与国内信任危机加深。"
          }
        }
      ]
    },
    {
      id: "crisis_rust_1987",
      year: 1987,
      month: 5,
      title: "马蒂亚斯·鲁斯特红场降落事件",
      headline: "西德少年驾机穿越防空网降落莫斯科",
      region: "东欧 / 红场",
      target: "SUN",
      initiator: "DEU",
      actors: ["SUN", "DEU", "USA"],
      gate: { modulate: true, minHeat: 0.20 },
      desc: "西德少年鲁斯特驾轻型飞机穿越苏联防空识别区，降落红场。国防与防空军高层颜面扫地，戈尔巴乔夫借机整肃军内保守派，西方则观察苏军戒备是否松弛。",
      options: [
        {
          tier: 1,
          title: "人道审判与防务改革公开化",
          icon: "🕊️",
          desc: "从轻处置飞行员，公开检讨防空指挥漏洞，推动文官对军队的监督改革。",
          badge: "改革借力",
          effects: {
            tensionDelta: -10,
            sunReformist: +6,
            sunConservative: -4,
            prestigeDelta: +1,
            summary: "改革派借势整肃防务，东西方缓和信号增强。"
          }
        },
        {
          tier: 2,
          title: "军法处置与有限人事调整",
          icon: "⚖️",
          desc: "军法审判涉事军官，撤换防空军主官，对外强调『孤立事故』与制度自纠。",
          badge: "史实基准",
          effects: {
            tensionDelta: -2,
            sunReformist: +3,
            sunConservative: -2,
            summary: "人事整肃完成，防空信誉受损但未引发全面对抗。"
          }
        },
        {
          tier: 3,
          title: "强硬定罪并提升全国防空戒备",
          icon: "⚡",
          desc: "以间谍嫌疑重判并全面提升防空战备，借机回击西方『渗透』叙事。",
          badge: "极限升级",
          effects: {
            tensionDelta: +16,
            sunConservative: +5,
            sunReformist: -3,
            defconRisk: +5,
            prestigeDelta: -2,
            summary: "强硬姿态提振保守派，但改革受阻、对抗风险回升。"
          }
        }
      ]
    },
    {
      id: "crisis_berlinwall_1989",
      year: 1989,
      month: 11,
      title: "柏林墙开放与德意志命运抉择",
      headline: "东德边境开放令与欧洲终局震荡",
      region: "中欧 / 柏林",
      target: "DDR",
      initiator: "DDR",
      actors: ["DDR", "DEU", "SUN", "USA"],
      gate: { modulate: true },
      desc: "东德边防开放令引发柏林人潮冲关，冷战最醒目的地理分割线一夜松动。莫斯科、波恩与华盛顿必须在数周内决定：护送统一、冻结分裂，还是以阵营安全为由重新收紧。",
      options: [
        {
          tier: 1,
          title: "护送和平统一与安全安排",
          icon: "🕊️",
          desc: "支持两德加速谈判，同步讨论北约/中立安全安排与苏军有序撤离时间表。",
          badge: "和平统一",
          effects: {
            tensionDelta: -22,
            sunReformist: +5,
            sunConservative: -6,
            natoCohesion: +4,
            prestigeDelta: +4,
            stabilityBonus: +4,
            summary: "欧洲终局软着陆，改革派与西方同声赞誉，保守派痛失前沿屏障。"
          }
        },
        {
          tier: 2,
          title: "有序开放与分阶段谈判",
          icon: "⚖️",
          desc: "承认既成开放事实，推动四方与两德分阶段谈判，避免边境再度封锁或军事对峙。",
          badge: "史实基准",
          effects: {
            tensionDelta: -8,
            sunReformist: +2,
            natoCohesion: +2,
            summary: "柏林墙事实开放，谈判框架稳住欧洲，未触发军事摊牌。"
          }
        },
        {
          tier: 3,
          title: "重新收紧与阵营安全红线",
          icon: "⚡",
          desc: "以华约安全红线为由推动临时边境管制与联合声明，警告北约不得借机东扩。",
          badge: "极限升级",
          effects: {
            tensionDelta: +24,
            sunConservative: +7,
            sunReformist: -5,
            natoCohesion: -4,
            prestigeDelta: -3,
            summary: "阵营对峙回潮，东欧转型转入对抗深水区，统一前景蒙阴。"
          }
        }
      ]
    },
    // ---- Phase Cri3：再扩写 5 张史实热点（带国势门控；避开 Able Archer / 切尔诺贝利双计）----
    {
      id: "crisis_olympics_1980",
      year: 1980,
      month: 7,
      title: "莫斯科奥运抵制余波",
      headline: "西方集体抵制与东西方体育外交摊牌",
      region: "东欧 / 莫斯科",
      target: "SUN",
      initiator: "USA",
      actors: ["USA", "SUN", "GBR", "DEU"],
      gate: { modulate: true, minHeat: 0.22 },
      desc: "苏联出兵阿富汗后，卡特政府推动西方集体抵制莫斯科夏季奥运会。克里姆林宫与白宫必须决定：把抵制做成长期孤立，还是借体育通道保留外交回旋余地。",
      options: [
        {
          tier: 1,
          title: "保留通道与有限参赛斡旋",
          icon: "🕊️",
          desc: "允许部分盟国自行决定参赛，强调人道与体育中立，避免把奥运彻底武器化。",
          badge: "软着陆",
          effects: {
            tensionDelta: -12,
            usaCongressApproval: -4,
            sunReformist: +2,
            prestigeDelta: -2,
            summary: "对抗降温，但国内鹰派指责白宫向莫斯科示弱。"
          }
        },
        {
          tier: 2,
          title: "主导抵制并保留热线",
          icon: "⚖️",
          desc: "坚持集体抵制核心项目，同时保持危机热线与粮食贸易谈判窗口，避免全面断交。",
          badge: "史实基准",
          effects: {
            tensionDelta: +6,
            usaCongressApproval: +3,
            sunConservative: +2,
            prestigeDelta: +1,
            summary: "展示惩罚代价，双边张力可控上升，未切断全部沟通。"
          }
        },
        {
          tier: 3,
          title: "全面孤立与联动制裁加码",
          icon: "⚡",
          desc: "把抵制升级为科技与信贷联动制裁，公开要求苏军限期撤阿，否则扩大巴统清单。",
          badge: "极限升级",
          effects: {
            tensionDelta: +20,
            usaCongressApproval: +5,
            sunConservative: +4,
            sunShortage: +3,
            cocomStrict: true,
            prestigeDelta: +3,
            summary: "西方政治动员成功，但美苏对抗与苏联物资压力同步抬升。"
          }
        }
      ]
    },
    {
      id: "crisis_lebanon_1982",
      year: 1982,
      month: 6,
      title: "加利利和平行动与黎巴嫩战火",
      headline: "以色列入黎、贝卡谷地空战与多国部队阴影",
      region: "中东 / 贝鲁特—贝卡",
      // D：LBN 仅为成员键；可玩实体用 LEV（黎凡特联邦），地区语义不变。
      target: "LEV",
      initiator: "ISR",
      actors: ["USA", "SUN", "ISR", "LEV", "EGY"],
      gate: { modulate: true, minHeat: 0.24 },
      desc: "以色列发动『加利利和平』越境行动，贝卡谷地空战与贝鲁特围城把超级大国卷进黎巴嫩棋局。华盛顿与莫斯科必须在斡旋停火、有限介入与公开站队之间抉择——与日后人质危机不同，此刻争的是前线战局本身。",
      options: [
        {
          tier: 1,
          title: "紧急停火斡旋与人道走廊",
          icon: "🕊️",
          desc: "推动安理会与区域调停，开辟贝鲁特人道走廊，劝阻大规模巷战与长期占领。",
          badge: "多边斡旋",
          effects: {
            tensionDelta: -10,
            middleEastTension: -8,
            usaCongressApproval: -3,
            prestigeDelta: +1,
            stabilityBonus: +3,
            summary: "中东战火短暂降温，但国内舆论批评未能展示实力。"
          }
        },
        {
          tier: 2,
          title: "有限外交施压与海上监视",
          icon: "⚖️",
          desc: "第六舰队抵近监视，同步向各方施压接受分阶段撤军与缓冲安排，避免直接交火。",
          badge: "史实基准",
          effects: {
            tensionDelta: +4,
            middleEastTension: +5,
            usaCongressApproval: +2,
            summary: "维持前沿存在与外交杠杆，黎巴嫩战局未全面失控。"
          }
        },
        {
          tier: 3,
          title: "公开站队与扩大威慑部署",
          icon: "⚡",
          desc: "加大军援与情报协同，航母战斗群进入高强度战备，警告第三方勿扩大介入。",
          badge: "极限升级",
          effects: {
            tensionDelta: +18,
            middleEastTension: +12,
            usaCongressApproval: +4,
            defconRisk: +4,
            prestigeDelta: +2,
            summary: "威慑信号清晰，但中东与美苏对抗风险同步飙升。"
          }
        }
      ]
    },
    {
      id: "crisis_miners_1984",
      year: 1984,
      month: 3,
      title: "英国矿工大罢工与同盟侧翼",
      headline: "煤矿关闭潮、警力对峙与北约南翼注意力分流",
      region: "西欧 / 英格兰—威尔士煤田",
      target: "GBR",
      initiator: "GBR",
      actors: ["GBR", "USA", "SUN"],
      gate: { modulate: true, minHeat: 0.18 },
      desc: "撒切尔政府推动关闭亏损矿井，全国矿工联合会发动持久大罢工。伦敦政局动荡牵动北约凝聚力与苏联对『西方内伤』的评估——这是内政危机外溢到冷战叙事的一刻。",
      options: [
        {
          tier: 1,
          title: "谈判妥协与社区纾困",
          icon: "🕊️",
          desc: "重启三方谈判，保留部分矿区过渡安置与补贴，优先社会和解。",
          badge: "社会和解",
          effects: {
            tensionDelta: -4,
            gbrPopularity: +4,
            natoCohesion: -3,
            stabilityBonus: +4,
            prestigeDelta: -1,
            summary: "国内动荡回落，但盟友质疑伦敦改革意志不足。"
          }
        },
        {
          tier: 2,
          title: "依法对峙与有限对话窗口",
          icon: "⚖️",
          desc: "坚持关闭亏损矿井时间表，同时保持有限对话与能源替代预案，避免全面社会失序。",
          badge: "史实基准",
          effects: {
            tensionDelta: 0,
            gbrPopularity: +1,
            natoCohesion: +1,
            summary: "改革路线推进，同盟侧翼基本稳住。"
          }
        },
        {
          tier: 3,
          title: "强硬清场与冷战叙事加码",
          icon: "⚡",
          desc: "扩大警力清场，公开把罢工定性为对自由世界秩序的挑战，寻求华盛顿政治背书。",
          badge: "极限升级",
          effects: {
            tensionDelta: +10,
            gbrPopularity: -3,
            natoCohesion: +4,
            usaCongressApproval: +2,
            prestigeDelta: +2,
            summary: "同盟强硬叙事升温，但英国社会撕裂加深。"
          }
        }
      ]
    },
    {
      id: "crisis_inf_1987",
      year: 1987,
      month: 12,
      title: "中导条约签署前后的信任考验",
      headline: "陆基中导销毁、核查准入与欧洲安全安排",
      region: "欧陆 / 华盛顿—莫斯科",
      target: "DEU",
      initiator: "USA",
      actors: ["USA", "SUN", "DEU", "GBR"],
      gate: { modulate: true },
      desc: "美苏临近签署《中导条约》，销毁陆基中程导弹并引入现场核查。欧洲盟国既欢迎降级，又担心『双零方案』削弱前沿威慑。这与 1983 年优秀射手误判危机不同——此刻争的是裁军可信度，而非核误判螺旋。",
      options: [
        {
          tier: 1,
          title: "加速核查与更深裁减信号",
          icon: "🕊️",
          desc: "主动开放更多核查站点，推动配套信任措施，向欧洲保证裁军不等于解除防卫。",
          badge: "信任加速",
          effects: {
            tensionDelta: -16,
            defconRisk: -5,
            natoCohesion: -2,
            sunReformist: +4,
            prestigeDelta: +3,
            summary: "缓和红利显现，改革派得分，部分盟友忧虑威慑空洞。"
          }
        },
        {
          tier: 2,
          title: "按约销毁并稳住同盟磋商",
          icon: "⚖️",
          desc: "严格执行条约时间表与核查条款，同步在北约内完成常规力量补偿磋商。",
          badge: "史实基准",
          effects: {
            tensionDelta: -8,
            defconRisk: -2,
            natoCohesion: +2,
            sunReformist: +2,
            summary: "中导如约推进，欧洲安全磋商稳住同盟。"
          }
        },
        {
          tier: 3,
          title: "挂钩条件与前沿补偿加码",
          icon: "⚡",
          desc: "把条约执行与更多地缘让步挂钩，同时加快前沿常规部署与演训，以防『裁军陷阱』。",
          badge: "极限对冲",
          effects: {
            tensionDelta: +12,
            defconRisk: +6,
            natoCohesion: +5,
            sunConservative: +3,
            sunReformist: -2,
            prestigeDelta: +1,
            summary: "同盟对冲到位，但裁军互信受损、对抗读数回升。"
          }
        }
      ]
    },
    {
      id: "crisis_gulfprelude_1990",
      year: 1990,
      month: 7,
      title: "海湾前奏：伊拉克陈兵科威特边境",
      headline: "债务争执、油价施压与波斯湾战云",
      region: "波斯湾 / 科威特边境",
      // D：科威特成员键 KWT 可解析；可玩落点用 ARA（阿拉伯半岛联邦），与 MAP_FED_TARGET 一致。
      target: "ARA",
      initiator: "IRQ",
      actors: ["IRQ", "USA", "SUN", "SAU", "KWT"],
      gate: { modulate: true, minHeat: 0.26 },
      desc: "伊拉克就债务与油价向科威特摊牌，共和国卫队向边境集结。这与 1980 两伊开战十字路口、1988 文森斯误击都不同——此刻是海湾战争爆发前夜的最后外交窗口。",
      options: [
        {
          tier: 1,
          title: "紧急调停与债务重组方案",
          icon: "🕊️",
          desc: "推动阿拉伯联盟斡旋，打包石油配额与债务重组，劝退边境集结。",
          badge: "区域斡旋",
          effects: {
            tensionDelta: -8,
            middleEastTension: -10,
            usaCongressApproval: -2,
            prestigeDelta: +1,
            stabilityBonus: +2,
            summary: "战云短暂后退，但被批评对萨达姆让步过多。"
          }
        },
        {
          tier: 2,
          title: "外交警告与有限威慑部署",
          icon: "⚖️",
          desc: "公开警告不得侵犯主权，向海湾友邦预置有限海空资产，同时保留谈判桌。",
          badge: "史实基准",
          effects: {
            tensionDelta: +5,
            middleEastTension: +6,
            usaCongressApproval: +2,
            summary: "威慑与外交并行，边境危机未立即引爆。"
          }
        },
        {
          tier: 3,
          title: "最后通牒与战备升级",
          icon: "⚡",
          desc: "发出明确军事后果通牒，加速航母与预置弹药部署，准备多国部队框架。",
          badge: "极限升级",
          effects: {
            tensionDelta: +16,
            middleEastTension: +14,
            usaCongressApproval: +5,
            defconRisk: +5,
            prestigeDelta: +3,
            usSanctionPressure: true,
            summary: "战争机器上膛，海湾对抗进入倒计时。"
          }
        }
      ]
    }
  ];

  // Cri2 / Cri3 扩写卡 id（探针对齐；勿用「凡 gated 即 Cri2」，以免后批污染）
  const CRI2_IDS = [
    "crisis_ablearcher_1983",
    "crisis_eldorado_1986",
    "crisis_chernobyl_1986",
    "crisis_rust_1987",
    "crisis_berlinwall_1989"
  ];
  const CRI3_IDS = [
    "crisis_olympics_1980",
    "crisis_lebanon_1982",
    "crisis_miners_1984",
    "crisis_inf_1987",
    "crisis_gulfprelude_1990"
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

    /** Cri2/Cri3：是否声明国势门控（调制后果 / 软触发） */
    isGated: function (cr) {
      return !!(cr && cr.gate && typeof cr.gate === "object");
    },

    /** Cri2 扩写卡 id 列表（探针与文档对齐；固定五张，不受后批影响） */
    cri2Ids: function () {
      return CRI2_IDS.slice();
    },

    /** Cri3 扩写卡 id 列表 */
    cri3Ids: function () {
      return CRI3_IDS.slice();
    },

    cloneCrises: function () {
      return JSON.parse(JSON.stringify(CRISES));
    }
  };

  global.W1980_CRISES = API;
})(typeof window !== "undefined" ? window : globalThis);
