"use strict";
/* world1980 贸易路线与硬通货双轨清算数据模块（经济系统阶段 2）。
 * 核心机制：
 *   1. 两大平行清算货币：
 *      - USD: 国际自由兑换硬通货（美元 / 亿）
 *      - TRB: 经互会内部记账卢布（转账卢布 / 亿，不可自由兑换）
 *   2. 历史大宗物资国际贸易大动脉（波斯湾原油、跨铁幕油气换钢管、北美谷物、经互会友谊管道、特种矿产）
 *   3. 动态可用资源计算与外汇储备月度现金流
 */
(function () {
  const PRICES = {
    oil:  1.2,  // 亿美元 / 单位
    min:  0.8,  // 亿美元 / 单位
    agr:  0.6,  // 亿美元 / 单位
    tech: 2.5   // 亿美元 / 单位
  };

  // 1980 初始外汇储备基准（十亿美元 / 亿美元）
  const INIT_RESERVES = {
    USA:  { usd: 150.0, trb: 0.0 },
    DEU:  { usd: 52.0,  trb: 0.0 },
    JPN:  { usd: 32.0,  trb: 0.0 },
    FRA:  { usd: 28.0,  trb: 0.0 },
    GBR:  { usd: 24.0,  trb: 0.0 },
    ITA:  { usd: 20.0,  trb: 0.0 },
    SAU:  { usd: 38.0,  trb: 0.0 },
    ARA:  { usd: 22.0,  trb: 0.0 },
    IRQ:  { usd: 14.0,  trb: 0.0 },
    IRN:  { usd: 12.0,  trb: 0.0 },
    LBY:  { usd: 10.0,  trb: 0.0 },
    SUN:  { usd: 12.0,  trb: 85.0 }, // 外汇极度稀缺，但持有巨额经互会转账卢布记账
    CHN:  { usd: 2.8,   trb: 0.0 },  // 改革开放初期外汇储备极低
    POL:  { usd: 1.8,   trb: 22.0 }, // 1980 东欧债务危机边缘
    DDR:  { usd: 4.5,   trb: 28.0 },
    CSK:  { usd: 5.0,   trb: 25.0 },
    HUN:  { usd: 2.4,   trb: 15.0 },
    ROU:  { usd: 2.0,   trb: 12.0 },
    BGR:  { usd: 1.5,   trb: 16.0 },
    CAN:  { usd: 16.0,  trb: 0.0 },
    AUS:  { usd: 12.0,  trb: 0.0 },
    BRA:  { usd: 6.5,   trb: 0.0 },
    LAP:  { usd: 4.0,   trb: 0.0 },
    AND:  { usd: 3.5,   trb: 0.0 },
    MEX:  { usd: 4.5,   trb: 0.0 },
    SAF:  { usd: 8.0,   trb: 0.0 },
    KOR:  { usd: 3.2,   trb: 0.0 },
    TWN:  { usd: 5.5,   trb: 0.0 },
    IND:  { usd: 5.0,   trb: 0.0 },
    TUR:  { usd: 2.2,   trb: 0.0 }
  };

  // 1980 历史基准贸易大动脉
  const BASELINE_ROUTES = [
    // ① 波斯湾石油航线（美元结算）
    { id: "tr_sau_jpn_oil", from: "SAU", to: "JPN", res: "oil", amount: 35, cur: "USD", desc: "沙特至日本原油海上生命线" },
    { id: "tr_sau_deu_oil", from: "SAU", to: "DEU", res: "oil", amount: 20, cur: "USD", desc: "沙特至西德油轮航线" },
    { id: "tr_sau_fra_oil", from: "SAU", to: "FRA", res: "oil", amount: 15, cur: "USD", desc: "沙特至法国地中海原油输入" },
    { id: "tr_ara_jpn_oil", from: "ARA", to: "JPN", res: "oil", amount: 20, cur: "USD", desc: "海湾联邦至日本石油航线" },
    { id: "tr_irq_fra_oil", from: "IRQ", to: "FRA", res: "oil", amount: 15, cur: "USD", desc: "伊拉克至法国原油供应" },
    { id: "tr_car_usa_oil", from: "CAR", to: "USA", res: "oil", amount: 18, cur: "USD", desc: "加勒比委内瑞拉至美东炼厂" },

    // ② 跨铁幕能源与技术贸易（以物易物与美元结算）
    { id: "tr_sun_deu_oil", from: "SUN", to: "DEU", res: "oil", amount: 18, cur: "USD", desc: "西伯利亚天然气换西德大口径钢管" },
    { id: "tr_sun_ita_oil", from: "SUN", to: "ITA", res: "oil", amount: 10, cur: "USD", desc: "苏联至意大利管道能源协议" },
    { id: "tr_deu_sun_tech",from: "DEU", to: "SUN", res: "tech", amount: 6, cur: "USD", desc: "西德成套精密机床出口" },

    // ③ 北美大平原粮食走廊（美加粮食出口，美元现金结算）
    { id: "tr_usa_sun_agr", from: "USA", to: "SUN", res: "agr", amount: 22, cur: "USD", desc: "美国小麦大豆向苏联粮食出口" },
    { id: "tr_can_sun_agr", from: "CAN", to: "SUN", res: "agr", amount: 10, cur: "USD", desc: "加拿大向苏联小麦长期协议" },
    { id: "tr_usa_jpn_agr", from: "USA", to: "JPN", res: "agr", amount: 20, cur: "USD", desc: "美国向日本农粮与饲料大宗出口" },
    { id: "tr_lap_sun_agr", from: "LAP", to: "SUN", res: "agr", amount: 8,  cur: "USD", desc: "阿根廷避开禁运向苏联粮肉出口" },

    // ④ 经互会“友谊”输油大动脉（转账卢布 TRB 计划清算）
    { id: "tr_sun_pol_oil", from: "SUN", to: "POL", res: "oil", amount: 14, cur: "TRB", desc: "经互会友谊管道：波兰廉价原油配额" },
    { id: "tr_sun_ddr_oil", from: "SUN", to: "DDR", res: "oil", amount: 15, cur: "TRB", desc: "经互会友谊管道：东德石化原料配额" },
    { id: "tr_sun_csk_oil", from: "SUN", to: "CSK", res: "oil", amount: 12, cur: "TRB", desc: "经互会友谊管道：捷克斯洛伐克配额" },
    { id: "tr_ddr_sun_tech",from: "DDR", to: "SUN", res: "tech", amount: 8, cur: "TRB", desc: "东德蔡司光学与微电子向苏联交付" },

    // ⑤ 战略特种矿产航线（工业原材料）
    { id: "tr_saf_usa_min", from: "SAF", to: "USA", res: "min", amount: 15, cur: "USD", desc: "南部非洲特种特材(铬/锰/铂)输美" },
    { id: "tr_aus_jpn_min", from: "AUS", to: "JPN", res: "min", amount: 28, cur: "USD", desc: "澳大利亚铁矿石与优质煤炭输日" },
    { id: "tr_and_usa_min", from: "AND", to: "USA", res: "min", amount: 16, cur: "USD", desc: "智利铜矿与安第斯金属输美" },
    { id: "tr_jpn_usa_tech",from: "JPN", to: "USA", res: "tech", amount: 15, cur: "USD", desc: "日本消费电子与高精度半导体输美" }
  ];

  // 复制深拷贝
  function cloneBaselineRoutes() {
    return JSON.parse(JSON.stringify(BASELINE_ROUTES));
  }

  function getPrice(resKey) {
    return PRICES[resKey] || 1.0;
  }

  function calcAnnualFlow(route) {
    const p = getPrice(route.res);
    return route.amount * p;
  }

  window.W1980_TRADE = {
    PRICES: PRICES,
    INIT_RESERVES: INIT_RESERVES,
    BASELINE_ROUTES: BASELINE_ROUTES,
    cloneBaselineRoutes: cloneBaselineRoutes,
    getPrice: getPrice,
    calcAnnualFlow: calcAnnualFlow,
    getInitialReserve: function (k) {
      if (INIT_RESERVES[k]) return { usd: INIT_RESERVES[k].usd, trb: INIT_RESERVES[k].trb };
      // 默认兜底
      return { usd: 3.0, trb: 0.0 };
    }
  };
})();
