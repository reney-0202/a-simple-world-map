"use strict";
/* world1980 巴统出口管制、能源咽喉封锁与经济战数据模块（经济系统阶段 3）。
 * 核心机制：
 *   1. 巴统出口管制委员会（CoCom）：西方阵营对华约/社会主义国家实施的高新技术出口限制与特种走私溢价。
 *   2. 战略咽喉航道网络（Chokepoints）：霍尔木兹海峡油轮战威胁与封锁断航机制。
 *   3. 战略资源短缺经济冲击惩罚模型（Resource Deficit Penalty）。
 */
(function () {
  const COCOM = {
    defaultActive: true,
    restrictedRes: ["tech"],
    sourceBlocs: ["NATO", "W"],
    targetBlocs: ["WP", "SOV", "CHN"],
    smuggleMultiplier: 1.5 // 秘密反禁运走私渠道额外外汇溢价（150% 外汇成本）
  };

  const CHOKEPOINTS = {
    hormuz: {
      id: "hormuz",
      name: "霍尔木兹海峡",
      desc: "波斯湾咽喉要道，全球海上原油运输生命线",
      defaultState: "open",
      states: {
        open: { name: "正常通航", factor: 1.0, costFactor: 1.0, tagCls: "ok" },
        contested: { name: "油轮战交火威胁", factor: 0.7, costFactor: 1.25, tagCls: "warn", desc: "两伊袭船战交火，油轮遭受导弹袭击与水雷威胁，运费与战争险激增" },
        blocked: { name: "全面封锁断航", factor: 0.2, costFactor: 2.0, tagCls: "bad", desc: "海峡布雷封锁，油轮大面积停航，全球爆发严重能源危机" }
      },
      affectedRoutes: [
        "tr_sau_jpn_oil",
        "tr_sau_deu_oil",
        "tr_sau_fra_oil",
        "tr_ara_jpn_oil",
        "tr_irq_fra_oil"
      ]
    }
  };

  function isCocomRestricted(fromBloc, toBloc, res) {
    if (!res || !COCOM.restrictedRes.includes(res)) return false;
    const isSource = COCOM.sourceBlocs.includes(fromBloc);
    const isTarget = COCOM.targetBlocs.includes(toBloc);
    return isSource && isTarget;
  }

  function getChokepointImpact(routeId, chokepointsState) {
    const cp = CHOKEPOINTS.hormuz;
    if (cp.affectedRoutes.includes(routeId)) {
      const stKey = (chokepointsState && chokepointsState.hormuz) || "open";
      const stDef = cp.states[stKey] || cp.states.open;
      return {
        chokepoint: cp.id,
        state: stKey,
        factor: stDef.factor,
        costFactor: stDef.costFactor,
        name: cp.name,
        stateName: stDef.name
      };
    }
    return { chokepoint: null, state: "open", factor: 1.0, costFactor: 1.0, name: "", stateName: "" };
  }

  window.W1980_EMBARGO = {
    COCOM: COCOM,
    CHOKEPOINTS: CHOKEPOINTS,
    isCocomRestricted: isCocomRestricted,
    getChokepointImpact: getChokepointImpact
  };
})();
