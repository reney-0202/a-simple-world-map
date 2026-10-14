"use strict";
/* world1980 — 时代美术与游戏资源元数据库 (R14)
 * 整合钢铁雄心4风格领袖肖像、时代重大历史特刊配图、绝密公文印章与冷战留声机原声
 */
(function () {
  const LEADERS = {
    USA: [
      {
        startYear: 1980, endYear: 1980,
        name: "吉米·卡特", en: "Jimmy Carter",
        title: "美利坚合众国第 39 任总统",
        ideology: "人权外交与国家安全综合战略",
        quote: "“美国决不会向恐吓低头，我们捍卫自由与人权的决心不可动摇。”",
        photo: "assets/portraits/portrait_usa_carter.jpg",
        stamp: "top_secret"
      },
      {
        startYear: 1981, endYear: 1988,
        name: "罗纳德·里根", en: "Ronald Reagan",
        title: "美利坚合众国第 40 任总统",
        ideology: "实力求和平 (Peace through Strength) 与战略防御倡议",
        quote: "“和平不是没有冲突，而是有能力通过实力阻止一切侵略。”",
        photo: "assets/portraits/portrait_usa_reagan.jpg",
        stamp: "top_secret"
      },
      {
        startYear: 1989, endYear: 1991,
        name: "乔治·H·W·布什", en: "George H. W. Bush",
        title: "美利坚合众国第 41 任总统",
        ideology: "超越遏制战略与世界新秩序",
        quote: "“铁幕正在破碎，一个摆脱恐怖平衡的自由新世界即将诞生。”",
        photo: "assets/portraits/portrait_usa_bush.jpg",
        stamp: "top_secret"
      }
    ],
    SUN: [
      {
        startYear: 1980, endYear: 1982,
        name: "列昂尼德·勃列日涅夫", en: "Leonid Brezhnev",
        title: "苏联共产党中央委员会总书记",
        ideology: "发达社会主义学说与战略核均势",
        quote: "“苏维埃国家的稳定与华约联盟的统一，是一切战略的基石。”",
        photo: "assets/portraits/portrait_sun_brezhnev.jpg",
        stamp: "soviet_secret"
      },
      {
        startYear: 1983, endYear: 1984,
        name: "尤里·安德罗波夫", en: "Yuri Andropov",
        title: "苏联共产党中央委员会总书记",
        ideology: "整肃劳动纪律与国家机器效能",
        quote: "“没有铁一般的纪律与严格整肃，任何宏伟计划都无法维系。”",
        photo: "assets/portraits/portrait_sun_andropov.jpg",
        stamp: "soviet_secret"
      },
      {
        startYear: 1985, endYear: 1991,
        name: "米哈伊尔·戈尔巴乔夫", en: "Mikhail Gorbachev",
        title: "苏共中央总书记 · 苏联首任总统",
        ideology: "新思维外交 (New Thinking) 与民主化改革",
        quote: "“全人类的共同价值高于任何意识形态的分歧。”",
        photo: "assets/portraits/portrait_sun_gorbachev.jpg",
        stamp: "soviet_secret"
      }
    ],
    CHN: [
      {
        startYear: 1980, endYear: 1991,
        name: "邓小平", en: "Deng Xiaoping",
        title: "中央顾问委员会主任 · 改革开放总设计师",
        ideology: "对内改革对外开放 · 韬光养晦有所作为",
        quote: "“发展才是硬道理。不坚持社会主义，不改革开放，只能是死路一条。”",
        photo: "assets/portraits/portrait_chn_deng.jpg",
        stamp: "top_secret"
      }
    ],
    GBR: [
      {
        startYear: 1980, endYear: 1990,
        name: "玛格丽特·撒切尔", en: "Margaret Thatcher",
        title: "联合王国首相 (铁娘子)",
        ideology: "撒切尔主义自由市场与坚决反共大西洋同盟",
        quote: "“妥协不会带来长久和平，自由国家必须永远保持坚定意志。”",
        photo: "assets/portraits/portrait_gbr_thatcher.jpg",
        stamp: "top_secret"
      }
    ],
    FRA: [
      {
        startYear: 1980, endYear: 1991,
        name: "弗朗索瓦·密特朗", en: "François Mitterrand",
        title: "法兰西共和国总统",
        ideology: "欧洲一体化双重支柱与独立核威慑",
        quote: "“法兰西的命运与欧洲大厦紧密交织，我们将主导自己的未来。”",
        photo: "assets/portraits/portrait_fra_mitterrand.jpg",
        stamp: "top_secret"
      }
    ],
    DEU: [
      {
        startYear: 1980, endYear: 1991,
        name: "赫尔穆特·科尔", en: "Helmut Kohl",
        title: "德意志联邦共和国总理 (统一总理)",
        ideology: "欧洲大市场主导与两德和平统一步骤",
        quote: "“统一的列车已经开出，没有任何力量能够逆转历史的洪流。”",
        photo: "assets/portraits/portrait_deu_kohl.jpg",
        stamp: "top_secret"
      }
    ],
    DDR: [
      {
        startYear: 1980, endYear: 1989,
        name: "埃里希·昂纳克", en: "Erich Honecker",
        title: "德意志民主共和国国务委员会主席",
        ideology: "正统马列阵营前哨与坚决抵制资本主义渗透",
        quote: "“柏林墙是和平与主权的屏障，只要威胁存在，它就永远屹立。”",
        photo: "assets/portraits/portrait_ddr_honecker.jpg",
        stamp: "soviet_secret"
      }
    ],
    JPN: [
      {
        startYear: 1980, endYear: 1991,
        name: "中曾根康弘", en: "Yasuhiro Nakasone",
        title: "日本内阁总理大臣",
        ideology: "战后政治总决算 · 太平洋不沉航空母舰",
        quote: "“日本不仅是经济大国，更要在国际风云中承担起坚定的战略支柱角色。”",
        photo: "assets/portraits/portrait_jpn_nakasone.jpg",
        stamp: "top_secret"
      }
    ],
    IRN: [
      {
        startYear: 1980, endYear: 1989,
        name: "鲁霍拉·穆萨维·霍梅尼", en: "Ruhollah Khomeini",
        title: "伊朗伊斯兰革命最高领袖",
        ideology: "法基赫监国学说 · 既不靠东也不靠西",
        quote: "“无论大撒旦还是红色帝国，都不可动摇伊斯兰革命的纯洁信念。”",
        photo: "assets/portraits/portrait_irn_khomeini.jpg",
        stamp: "top_secret"
      }
    ],
    IRQ: [
      {
        startYear: 1980, endYear: 1991,
        name: "萨达姆·侯赛因", en: "Saddam Hussein",
        title: "伊拉克共和国总统",
        ideology: "复兴党泛阿拉伯主义与海湾区域霸权",
        quote: "“两河的子民将以钢铁与鲜血，筑起保卫阿拉伯东大门的坚固长城。”",
        photo: "assets/portraits/portrait_irq_saddam.jpg",
        stamp: "top_secret"
      }
    ],
    SAU: [
      {
        startYear: 1980, endYear: 1991,
        name: "法赫德·本·阿卜杜勒-阿齐兹", en: "King Fahd",
        title: "两圣地监护人 · 沙特阿拉伯国王",
        ideology: "石油美元稳定支柱与伊斯兰温和联盟",
        quote: "“能源命脉的稳定关系着全球秩序，王国将以智慧引导风浪。”",
        photo: "assets/portraits/portrait_sau_fahd.jpg",
        stamp: "top_secret"
      }
    ],
    IND: [
      {
        startYear: 1980, endYear: 1984,
        name: "英迪拉·甘地", en: "Indira Gandhi",
        title: "印度共和国总理",
        ideology: "不结盟运动领袖与南亚区域大国自主",
        quote: "“印度决不做任何超级大国的附庸，我们的立场只由人民的利益决定。”",
        photo: "assets/portraits/portrait_ind_gandhi.jpg",
        stamp: "top_secret"
      }
    ],
    CUB: [
      {
        startYear: 1980, endYear: 1991,
        name: "菲德尔·卡斯特罗", en: "Fidel Castro",
        title: "古巴国务委员会主席兼部长会议主席",
        ideology: "加勒比社会主义不沉堡垒与国际主义援助",
        quote: "“誓死保卫祖国！在距离帝国主义九十英里的海面上，红旗永远飘扬！”",
        photo: "assets/portraits/portrait_cub_castro.jpg",
        stamp: "soviet_secret"
      }
    ],
    POL: [
      {
        startYear: 1980, endYear: 1990,
        name: "沃伊切赫·雅鲁泽尔斯基", en: "Wojciech Jaruzelski",
        title: "波兰统一工人党第一书记 · 部长会议主席",
        ideology: "战时状态维稳以阻苏联干涉 · 圆桌妥协路线",
        quote: "“这是两害相权取其轻的艰难抉择，我的唯一初衷是避免民族遭受灭顶之灾。”",
        photo: "assets/portraits/portrait_pol_jaruzelski.jpg",
        stamp: "soviet_secret"
      }
    ],
    EGY: [
      {
        startYear: 1981, endYear: 1991,
        name: "胡斯尼·穆巴拉克", en: "Hosni Mubarak",
        title: "阿拉伯埃及共和国总统",
        ideology: "戴维营协议恪守与中东斡旋平衡",
        quote: "“稳定是发展的生命线，中东承受不起又一场吞噬一切的战火。”",
        photo: "assets/portraits/portrait_egy_mubarak.jpg",
        stamp: "top_secret"
      }
    ],
    ISR: [
      {
        startYear: 1980, endYear: 1983,
        name: "梅纳赫姆·贝京", en: "Menachem Begin",
        title: "以色列国总理",
        ideology: "贝京主义先发制人威慑 (巴比伦行动)",
        quote: "“犹太民族的生存不寄托于敌人的善意，唯有压倒性的实力才能铸就和平。”",
        photo: "assets/portraits/portrait_isr_begin.jpg",
        stamp: "top_secret"
      }
    ]
  };

  // 时代重大特刊与峰会历史新闻画报映射
  const NEWS_PHOTOS = {
    oil_crash: {
      url: "assets/news/news_oil_crash_1986.jpg",
      caption: "1986 年波斯湾海上钻井平台与超大型原油运输轮。沙特开闸增产引爆全球油价雪崩。"
    },
    chernobyl: {
      url: "assets/news/news_chernobyl_1986.jpg",
      caption: "1986 年 4 月切尔诺贝利核电站第 4 号反应堆废墟与军民抢险构筑的石棺工程。"
    },
    east_europe: {
      url: "assets/news/news_berlin_wall_1989.jpg",
      caption: "1989 年 11 月东德民众涌上勃兰登堡门柏林墙，敲碎冷战铁幕象征。"
    },
    perestroika: {
      url: "assets/news/news_berlin_wall_1989.jpg",
      caption: "1989 年柏林墙倒塌历史转折，东欧剧变席卷华约集团。"
    },
    ussr_dissolution: {
      url: "assets/news/news_ussr_dissolution_1991.jpg",
      caption: "1991 年 12 月克里姆林宫顶端苏联国旗徐徐降下，宣告一个超级大国时代的落幕。"
    },
    iran_iraq_war: {
      url: "assets/news/news_iran_iraq_war_1980.jpg",
      caption: "1980 年两伊战争爆发，阿拉伯河沿岸与胡齐斯坦陷入长达八年的残酷拉锯。"
    },
    gulf_war: {
      url: "assets/news/news_gulf_war_1990.jpg",
      caption: "1990 年海湾多国部队沙漠风暴集结，科威特油井大火冲天。"
    },
    geneva_1985: {
      url: "assets/news/summit_geneva_1985.jpg",
      caption: "1985 年 11 月日内瓦峰会壁炉会晤，美苏最高领导人六年来首次握手破冰。"
    },
    reykjavik_1986: {
      url: "assets/news/summit_reykjavik_1986.jpg",
      caption: "1986 年 10 月雷克雅未克霍夫迪庄园峰会，就核裁军举行历史性极限博弈。"
    }
  };

  // 机密印章映射
  const UI_STAMPS = {
    top_secret: "assets/ui/stamp_top_secret.png",
    soviet_secret: "assets/ui/stamp_soviet_secret.png",
    ratified: "assets/ui/stamp_ratified.png",
    vetoed: "assets/ui/stamp_vetoed.png"
  };

  // 辅助函数：根据国家 key 与当前推演年份获取对应时期的领袖
  function getLeader(countryKey, currentYear) {
    const list = LEADERS[countryKey];
    if (!list || !list.length) return null;
    const y = typeof currentYear === "number" ? currentYear : 1980;
    const l = list.find((item) => y >= item.startYear && y <= item.endYear);
    return l || list[list.length - 1];
  }

  // 辅助函数：获取新闻事件的画报
  function getNewsPhoto(newsId) {
    return NEWS_PHOTOS[newsId] || null;
  }

  // 辅助函数：获取印章图片
  function getStamp(stampId) {
    return UI_STAMPS[stampId] || UI_STAMPS.top_secret;
  }

  window.W1980_ASSETS = {
    LEADERS: LEADERS,
    NEWS_PHOTOS: NEWS_PHOTOS,
    UI_STAMPS: UI_STAMPS,
    getLeader: getLeader,
    getNewsPhoto: getNewsPhoto,
    getStamp: getStamp
  };
})();
