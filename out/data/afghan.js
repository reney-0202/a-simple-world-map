// world1980 - data/afghan.js
// R13B: 阿富汗战争泥潭与帝国消耗槽（Afghan Quagmire & Empire Bleeding Database）

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

  window.W1980_AFGHAN = {
    PHASES: PHASES,
    POLICIES: POLICIES,
    getPhase: getPhase,
    calcBleedingCost: calcBleedingCost,
    calcMonthlyCasualties: calcMonthlyCasualties
  };
})();
