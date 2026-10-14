"use strict";
/* world1980 战略资源禀赋数据模块（经济系统阶段 1，1980 基准）。
 * 定义四大核心战略资源：
 *   - oil:  🛢️ 石油与天然气 (Hydrocarbons / Energy)
 *   - min:  ⛏️ 关键战略矿产与金属原材料 (Strategic Minerals & Metals)
 *   - agr:  🌾 农粮大宗与初级农产品 (Agriculture & Bulk Food)
 *   - tech: 💻 先进精密技术与高端装备资本品 (High-Tech & Precision Equipment)
 *
 * 字段结构（54 个可玩实体）：
 *   prod: 基础产能指数 (1980 历史产能水平)
 *   cons: 基础国内需求 (与人口、工业比重及 GDP 体量相关)
 *   net:  净盈余/赤字 (prod - cons > 0 为出超国，< 0 为入超依赖国)
 *   ratio: 自给率 (prod / max(1, cons))
 */
(function () {
  const RES_DEF = {
    oil:  { zh: "石油与天然气", icon: "🛢️", unit: "Mtoe", desc: "工业动能与战略机动基础；出口换汇大宗" },
    min:  { zh: "关键战略矿产", icon: "⛏️", unit: "Mt",   desc: "冶金与军工机械基础；特种特材直接制约重工上限" },
    agr:  { zh: "农粮大宗物资", icon: "🌾", unit: "Mt",   desc: "维系基本口粮与民生底线；缺口国被迫动用外汇买粮" },
    tech: { zh: "先进精密技术", icon: "💻", unit: "Idx",  desc: "全要素生产率与现代化倍增器；巴统出口禁运标的" }
  };

  const ENTITIES = {
    USA:  { oil: [85, 110], min: [70, 85], agr: [130, 55], tech: [140, 60] },
    SUN:  { oil: [125, 60], min: [110, 70], agr: [65, 105], tech: [40, 70] },
    JPN:  { oil: [1, 75],   min: [5, 70],   agr: [25, 65],  tech: [130, 55] },
    DEU:  { oil: [4, 55],   min: [20, 55],  agr: [40, 45],  tech: [110, 50] },
    SAU:  { oil: [105, 12], min: [5, 10],   agr: [2, 25],   tech: [5, 25] },
    ARA:  { oil: [60, 8],   min: [3, 6],    agr: [2, 18],   tech: [4, 16] },
    IRQ:  { oil: [45, 10],  min: [4, 8],    agr: [12, 18],  tech: [5, 18] },
    IRN:  { oil: [40, 15],  min: [10, 12],  agr: [20, 28],  tech: [6, 22] },
    LBY:  { oil: [30, 5],   min: [2, 4],    agr: [2, 10],   tech: [3, 12] },
    CHN:  { oil: [32, 30],  min: [35, 30],  agr: [65, 68],  tech: [15, 40] },
    GBR:  { oil: [35, 30],  min: [15, 35],  agr: [30, 38],  tech: [70, 40] },
    FRA:  { oil: [3, 45],   min: [15, 38],  agr: [55, 42],  tech: [85, 45] },
    CAN:  { oil: [30, 24],  min: [50, 22],  agr: [65, 20],  tech: [35, 25] },
    AUS:  { oil: [15, 20],  min: [60, 18],  agr: [50, 15],  tech: [25, 20] },
    BRA:  { oil: [12, 35],  min: [55, 25],  agr: [60, 40],  tech: [15, 30] },
    LAP:  { oil: [18, 16],  min: [12, 15],  agr: [55, 22],  tech: [14, 25] },
    AND:  { oil: [22, 18],  min: [55, 16],  agr: [25, 24],  tech: [10, 25] },
    SAF:  { oil: [5, 25],   min: [80, 20],  agr: [25, 20],  tech: [18, 22] },
    CAR:  { oil: [50, 20],  min: [15, 12],  agr: [28, 24],  tech: [10, 25] },
    MEX:  { oil: [40, 22],  min: [25, 18],  agr: [25, 26],  tech: [15, 28] },
    POL:  { oil: [2, 22],   min: [30, 22],  agr: [24, 28],  tech: [18, 25] },
    ROU:  { oil: [18, 16],  min: [14, 16],  agr: [22, 18],  tech: [12, 20] },
    CSK:  { oil: [1, 18],   min: [16, 20],  agr: [16, 17],  tech: [28, 22] },
    DDR:  { oil: [1, 22],   min: [15, 22],  agr: [16, 18],  tech: [32, 24] },
    HUN:  { oil: [3, 12],   min: [8, 12],   agr: [20, 13],  tech: [14, 16] },
    BGR:  { oil: [1, 12],   min: [6, 10],   agr: [15, 12],  tech: [10, 14] },
    TUR:  { oil: [5, 20],   min: [18, 15],  agr: [26, 22],  tech: [10, 20] },
    IND:  { oil: [15, 35],  min: [35, 28],  agr: [55, 58],  tech: [18, 35] },
    PAK:  { oil: [3, 16],   min: [6, 12],   agr: [22, 24],  tech: [8, 18] },
    KOR:  { oil: [1, 30],   min: [4, 25],   agr: [14, 24],  tech: [35, 25] },
    TWN:  { oil: [1, 22],   min: [3, 18],   agr: [10, 16],  tech: [32, 18] },
    ITA:  { oil: [3, 45],   min: [8, 35],   agr: [32, 34],  tech: [60, 38] },
    IBE:  { oil: [3, 35],   min: [16, 25],  agr: [32, 28],  tech: [25, 30] },
    LOW:  { oil: [12, 32],  min: [5, 25],   agr: [30, 24],  tech: [65, 28] },
    ALP:  { oil: [2, 20],   min: [10, 16],  agr: [14, 15],  tech: [55, 20] },
    SCA:  { oil: [26, 22],  min: [30, 18],  agr: [22, 20],  tech: [55, 22] },
    BALK: { oil: [6, 22],   min: [22, 16],  agr: [24, 20],  tech: [16, 22] },
    FNA:  { oil: [35, 12],  min: [25, 10],  agr: [14, 18],  tech: [6, 18] },
    GBWA: { oil: [40, 10],  min: [12, 8],   agr: [18, 20],  tech: [5, 18] },
    CONG: { oil: [8, 6],    min: [40, 8],   agr: [14, 15],  tech: [4, 15] },
    BSA:  { oil: [1, 6],    min: [35, 6],   agr: [12, 12],  tech: [4, 14] },
    BEA:  { oil: [1, 8],    min: [8, 6],    agr: [18, 16],  tech: [4, 14] },
    HORN: { oil: [2, 8],    min: [5, 6],    agr: [14, 18],  tech: [3, 14] },
    AFRF: { oil: [14, 8],   min: [25, 8],   agr: [15, 16],  tech: [3, 14] },
    INS:  { oil: [35, 18],  min: [25, 14],  agr: [35, 30],  tech: [10, 24] },
    SEA:  { oil: [18, 14],  min: [20, 12],  agr: [40, 28],  tech: [12, 22] },
    EGY:  { oil: [16, 14],  min: [8, 10],   agr: [18, 22],  tech: [8, 18] },
    LEV:  { oil: [6, 16],   min: [8, 10],   agr: [12, 14],  tech: [24, 16] },
    CAM:  { oil: [3, 10],   min: [6, 6],    agr: [18, 12],  tech: [5, 14] },
    OCE:  { oil: [3, 8],    min: [15, 6],   agr: [20, 8],   tech: [14, 10] },
    AFG:  { oil: [2, 5],    min: [8, 4],    agr: [8, 9],    tech: [2, 8] },
    PRK:  { oil: [0, 10],   min: [20, 12],  agr: [10, 12],  tech: [8, 12] },
    SAS:  { oil: [0, 4],    min: [2, 3],    agr: [6, 6],    tech: [1, 5] },
    YAR:  { oil: [1, 6],    min: [2, 4],    agr: [5, 6],    tech: [1, 6] }
  };

  const countries = {};
  for (const k in ENTITIES) {
    const raw = ENTITIES[k];
    const item = {};
    let totalProd = 0, totalCons = 0;
    for (const rk of ["oil", "min", "agr", "tech"]) {
      const p = raw[rk][0], c = raw[rk][1];
      const net = p - c;
      const ratio = c > 0 ? (p / c) : 1.0;
      item[rk] = { prod: p, cons: c, net: net, ratio: Math.round(ratio * 100) / 100 };
      totalProd += p; totalCons += c;
    }
    // 综合资源安全指数：各资源出超分加权（-100 ~ +100）
    const score = Math.round(((totalProd - totalCons) / Math.max(1, totalCons)) * 100);
    item.summary = {
      totalProd: totalProd,
      totalCons: totalCons,
      net: totalProd - totalCons,
      securityScore: score,
      // 战略安全标签
      tag: score >= 30 ? "资源丰饶大国" :
           score >= 0  ? "战略基本自给" :
           score >= -35 ? "中度依赖外贸" : "极端短缺受制"
    };
    countries[k] = item;
  }

  window.W1980_RESOURCES = {
    meta: RES_DEF,
    countries: countries,
    get: function (k) { return countries[k] || null; }
  };
})();
