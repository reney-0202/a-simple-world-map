/**
 * world1980 - 全球隐蔽行动与情报暗战数据库 (R13A)
 * 涵盖各国专属特情局架构、四大核心隐蔽行动与成功率/反噬模型
 */
(function (global) {
  "use strict";

  const AGENCIES = {
    USA: {
      key: "USA",
      name: "中央情报局 (CIA)",
      code: "CIA / 兰利特情局",
      icon: "🦅",
      motto: "“自由世界的情报前哨与隐秘之矛”",
      initialBudget: 25.0,
      initialCounter: 65
    },
    SUN: {
      key: "SUN",
      name: "国家安全委员会 (KGB)",
      code: "KGB / 卢比扬卡第一总局",
      icon: "🗡️",
      motto: "“苏维埃铁幕的利剑与坚盾”",
      initialBudget: 22.0,
      initialCounter: 70
    },
    CHN: {
      key: "CHN",
      name: "国家安全特情部 (MSS)",
      code: "MSS / 隐蔽战线",
      icon: "🐉",
      motto: "“无名丰碑，经纬天下，隐蔽防线”",
      initialBudget: 15.0,
      initialCounter: 60
    },
    GBR: {
      key: "GBR",
      name: "秘密情报局 (MI6)",
      code: "MI6 / 军情六处",
      icon: "🦁",
      motto: "“陛下政府遍布五大洲的秘密耳目”",
      initialBudget: 12.0,
      initialCounter: 60
    },
    FRA: {
      key: "FRA",
      name: "对外安全总局 (DGSE)",
      code: "DGSE / 游泳池行动局",
      icon: "🐓",
      motto: "“法兰西独立自主与海外干预中枢”",
      initialBudget: 10.0,
      initialCounter: 55
    },
    DEU: {
      key: "DEU",
      name: "联邦情报局 (BND)",
      code: "BND / 普拉赫总部",
      icon: "🏰",
      motto: "“前沿铁幕的信息截获与穿透前哨”",
      initialBudget: 10.0,
      initialCounter: 55
    },
    JPN: {
      key: "JPN",
      name: "内阁调查室 (CIRO)",
      code: "CIRO / 永田町特情室",
      icon: "🏯",
      motto: "“全球经贸与前沿产业的情报雷达”",
      initialBudget: 8.0,
      initialCounter: 50
    },
    DEFAULT: {
      key: "DEFAULT",
      name: "国家安全与反间谍局 (DIS)",
      code: "DIS / 国家安全局",
      icon: "🕵️",
      motto: "“捍卫国家主权与战略边疆防线”",
      initialBudget: 6.0,
      initialCounter: 45
    }
  };

  const ACTIONS = [
    {
      id: "proxy_insurgency",
      name: "代理人游击武装赞助",
      icon: "🪖",
      cost: 3.0,
      apCost: 2,
      desc: "秘密划拨黑金与军械，向目标国反政府武装或游击战线提供走私补给，牵制削弱其阵营影响力。",
      blowbackRisk: 0.18,
      effectSummary: "削弱目标国社会稳定度 (-10~-15)；若目标国为敌对阵营，将对其阵营经济网络施加摩擦惩罚。"
    },
    {
      id: "coup_attempt",
      name: "策动政局变动与兵变",
      icon: "⚡",
      cost: 6.0,
      apCost: 4,
      desc: "联络目标国前线少壮派军官策动不流血兵变，推翻激进政权并扶植亲己方军政过渡委员会。",
      blowbackRisk: 0.32,
      minStabilityTarget: 60,
      effectSummary: "高风险行动。成功可迫使小国政权更迭、甚至倒向己方阵营或转为中立；一旦败露将引发严重外交丑闻反噬。"
    },
    {
      id: "counter_intel",
      name: "反渗透排查与全面除奸",
      icon: "🛡️",
      cost: 2.0,
      apCost: 2,
      desc: "在本土驻防与核心盟友外交中枢清查通信暗号，排查抓捕渗透特工，大幅筑牢反间谍防御壁垒。",
      blowbackRisk: 0.0,
      effectSummary: "本土反间谍防御等级永久提升 (+15)，大幅降低敌特行动成功率并增加破获敌特间谍概率。"
    },
    {
      id: "tech_smuggle",
      name: "高技术特种走私与测绘",
      icon: "💾",
      cost: 4.5,
      apCost: 3,
      desc: "经由中立国离岸空壳网络走私先进工业数控芯片与精密机床，实施逆向测绘以冲破巴统封锁。",
      blowbackRisk: 0.22,
      effectSummary: "逆向工业测绘：提升本国技术自给率 (+10%)，若为苏联可直接缓解轻工消费品短缺 (-6)。"
    }
  ];

  const API = {
    AGENCIES: AGENCIES,
    ACTIONS: ACTIONS,

    getAgency: function (countryKey) {
      if (!countryKey) return AGENCIES.DEFAULT;
      return AGENCIES[countryKey] || AGENCIES.DEFAULT;
    },

    getActions: function () {
      return JSON.parse(JSON.stringify(ACTIONS));
    },

    getActionById: function (id) {
      return ACTIONS.find(function (a) { return a.id === id; }) || null;
    },

    /**
     * 计算行动成功率与反噬风险
     */
    calcOperationOdds: function (actionId, sourceKey, targetKey, sourceCounter, targetStability) {
      const act = this.getActionById(actionId);
      if (!act) return { successRate: 0.5, blowbackRate: 0.2 };

      let baseSuccess = 0.65;
      let blowback = act.blowbackRisk;

      if (actionId === "counter_intel") {
        return { successRate: 1.0, blowbackRate: 0.0 };
      }

      if (actionId === "proxy_insurgency") {
        baseSuccess = 0.70 - (targetStability || 50) * 0.003;
      } else if (actionId === "coup_attempt") {
        const stab = targetStability || 50;
        baseSuccess = Math.max(0.20, 0.85 - stab * 0.008);
      } else if (actionId === "tech_smuggle") {
        baseSuccess = 0.60;
      }

      // 特工局经验与反间谍加成
      const srcBonus = ((sourceCounter || 50) - 50) * 0.002;
      const successRate = Math.min(0.95, Math.max(0.15, baseSuccess + srcBonus));
      return {
        successRate: +successRate.toFixed(2),
        blowbackRate: +blowback.toFixed(2)
      };
    }
  };

  global.W1980_INTEL = API;
})(typeof window !== "undefined" ? window : globalThis);
