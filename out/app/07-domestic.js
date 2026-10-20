"use strict";

// ---- R12A: 大国内政生态与派系权力天平系统 ----
// M（卫生与闸门）：本模块原先承担四件事（内政 / 玩家能动性 / 议程 / 危机），
// 2995 行。现已按域拆分，本文件只保留**内政核心**：
//   · 本文件      状态初始化与清洗、七国月度推进器、外部压力评估、施政动作、八套内政面板
//   · 07a-agency  政治资本、施政方针、国家战略指令（Phase L 的玩家能动性层）
//   · 07b-agenda  国家议程链、加成结算、内政门控求值、月度推进
//   · 07c-crisis  危机抉择卡、结算与月度触发
// 拆分是纯搬运：函数与顶层声明一个未增未减，cmp 对基线仍 identical:25。
function initDomesticState() {
  ST.domestic = {
    sun: {
      conservative: 55,       // 保守鹰派满意度/权力份额 (0~100)
      reformist: 45,          // 改革新思维派满意度/权力份额 (0~100)
      shortage: 28,           // 消费品与轻工短缺指数 (0~100)
      unrest: 5,              // 社会动荡度 (0~100)
      crisisWarning: null     // 政治局警报
    },
    usa: {
      congressApproval: 62,   // 两党国会支持率 (0~100)
      presidentialApproval: 58,// 总统民调支持率 (0~100)
      nextElectionYear: 1984, // 下届总统大选年份
      electionResult: null,   // 大选选情公报
      budgetCapActive: false, // 《格拉姆-拉德曼法案》预算上限帽是否生效
      unrest: 2               // 社会动荡度 (0~100)
    },
    // E（玩法评审）：为重点国补专属内政（现仅 SUN/USA 有）。
    // CHN：改革开放期双轨制博弈——特区派 vs 计划派的路线拉锯，
    //       双轨物价与国企效益直接决定民生安稳。
    // DEU：新东方政策与西德社民/基民盟换届——缓和红利与北约义务的平衡，
    //       东西欧缓和深度决定其外交空间。
    chn: {
      reformist: 52,          // 特区/市场派权重 (0~100)
      planned: 48,            // 计划/国营派权重 (0~100)
      dualTrackPrice: 35,     // 双轨物价扭曲度 (0~100，越高越冲击民生)
      unrest: 3,              // 社会动荡度
      sezMomentum: 40,        // 特区开放动能 (0~100)
      externalStress: 20      // H：外部环境压力 (0~100，禁运/外汇/能源缺口)
    },
    deu: {
      spdApproval: 55,        // 社民党（SPD，施密特）支持率
      cduApproval: 45,        // 基民盟/基社盟（CDU/CSU）支持率
      detenteDepth: 60,       // 东西欧缓和深度 (0~100)
      natoBurden: 50,         // 北约防务义务分担度
      pipelineDependency: 30, // 对苏能源管道依赖度
      energyPressure: 24,     // H：能源供应压力 (0~100，油气通道受阻累积)
      unrest: 2               // H：社会动荡度 (0~100)
    },
    generals: {}              // 通用国家缓存
  };

  // K（玩法深度）：JPN/FRA/GBR 专属内政 —— 复制 CHN/DEU 已验证的
  // 「外部压力 → 内政天平 → 议程门控 → 完成回馈」模板。
  ST.domestic.jpn = {
    domesticist: 45,        // 内需开放派权重 (0~100)
    exportist: 55,          // 出口产业派权重 (0~100)
    tradeFriction: 35,      // 对美贸易摩擦压力 (0~100，出口通道受阻累积)
    unrest: 2               // 社会动荡度 (0~100)
  };
  ST.domestic.fra = {
    dirigiste: 55,          // 国家干预派权重 (0~100)
    rigueur: 45,            // 紧缩坚挺派权重 (0~100)
    francStrength: 45,      // 法郎平价与外部竞争力 (0~100)
    externalPressure: 30,   // 外部环境压力 (0~100，资本外逃/油气/巴统)
    unrest: 3               // 社会动荡度 (0~100)
  };
  ST.domestic.gbr = {
    monetarist: 50,         // 货币主义派权重 (0~100)
    welfarist: 50,          // 福利共识派权重 (0~100)
    cityStrength: 48,       // 金融城与服务业竞争力 (0~100)
    inflation: 55,          // 通胀压力 (0~100)
    unrest: 4               // 社会动荡度 (0~100)
  };
}

function getGeneralDomestic(k) {
  if (!ST.domestic) initDomesticState();
  if (!ST.domestic.generals) ST.domestic.generals = {};
  if (!ST.domestic.generals[k]) {
    ST.domestic.generals[k] = {
      stability: 82,
      unrest: 4,
      legitimacy: 78,
      sanctionStrain: 0
    };
  }
  return ST.domestic.generals[k];
}

// N1：把「国家键 → 该国内政状态对象」收敛成唯一入口。
// 七大国各有专属对象，其余实体走 generals 缓存。议程完成回馈、以及
// 短缺/安定/国会三种通用效果的分派都只通过它取对象，不再各自写一遍国家清单。
// 注意：这里**不做别名解析** —— 存进来的 cKey 一律是议程状态里的可玩实体键，
// 保持与拆分前逐位一致的取值语义。
function domesticStateOf(cKey) {
  if (!cKey || !ST.domestic) return null;
  if (cKey === "SUN") return ST.domestic.sun || null;
  if (cKey === "USA") return ST.domestic.usa || null;
  if (cKey === "CHN") return ST.domestic.chn || null;
  if (cKey === "DEU") return ST.domestic.deu || null;
  if (cKey === "JPN") return ST.domestic.jpn || null;
  if (cKey === "FRA") return ST.domestic.fra || null;
  if (cKey === "GBR") return ST.domestic.gbr || null;
  const g = ST.domestic.generals;
  return (g && g[cKey]) ? g[cKey] : null;
}

function sanitizeDomesticState(d) {
  const fresh = {
    sun: { conservative: 55, reformist: 45, shortage: 28, unrest: 5, crisisWarning: null },
    usa: { congressApproval: 62, presidentialApproval: 58, nextElectionYear: 1984, electionResult: null, budgetCapActive: false, unrest: 2 },
    // E：CHN/DEU 专属内政（与 initDomesticState 同构）
    chn: { reformist: 52, planned: 48, dualTrackPrice: 35, unrest: 3, sezMomentum: 40, externalStress: 20 },
    deu: { spdApproval: 55, cduApproval: 45, detenteDepth: 60, natoBurden: 50, pipelineDependency: 30, energyPressure: 24, unrest: 2 },
    // K（玩法深度）：JPN/FRA/GBR 专属内政（与 initDomesticState 同构）
    jpn: { domesticist: 45, exportist: 55, tradeFriction: 35, unrest: 2 },
    fra: { dirigiste: 55, rigueur: 45, francStrength: 45, externalPressure: 30, unrest: 3 },
    gbr: { monetarist: 50, welfarist: 50, cityStrength: 48, inflation: 55, unrest: 4 },
    generals: {}
  };
  if (!d || typeof d !== "object") return fresh;
  if (d.sun && typeof d.sun === "object") {
    fresh.sun.conservative = clamp(typeof d.sun.conservative === "number" ? d.sun.conservative : 55, 0, 100);
    fresh.sun.reformist = clamp(typeof d.sun.reformist === "number" ? d.sun.reformist : 45, 0, 100);
    fresh.sun.shortage = clamp(typeof d.sun.shortage === "number" ? d.sun.shortage : 28, 0, 100);
    fresh.sun.unrest = clamp(typeof d.sun.unrest === "number" ? d.sun.unrest : 5, 0, 100);
    fresh.sun.crisisWarning = typeof d.sun.crisisWarning === "string" ? d.sun.crisisWarning : null;
  }
  if (d.usa && typeof d.usa === "object") {
    fresh.usa.congressApproval = clamp(typeof d.usa.congressApproval === "number" ? d.usa.congressApproval : 62, 0, 100);
    fresh.usa.presidentialApproval = clamp(typeof d.usa.presidentialApproval === "number" ? d.usa.presidentialApproval : 58, 0, 100);
    fresh.usa.nextElectionYear = typeof d.usa.nextElectionYear === "number" ? d.usa.nextElectionYear : 1984;
    fresh.usa.electionResult = typeof d.usa.electionResult === "string" ? d.usa.electionResult : null;
    fresh.usa.budgetCapActive = !!d.usa.budgetCapActive;
    fresh.usa.unrest = clamp(typeof d.usa.unrest === "number" ? d.usa.unrest : 2, 0, 100);
  }
  // E：CHN/DEU 专属内政字段清洗
  if (d.chn && typeof d.chn === "object") {
    fresh.chn.reformist = clamp(typeof d.chn.reformist === "number" ? d.chn.reformist : 52, 0, 100);
    fresh.chn.planned = clamp(typeof d.chn.planned === "number" ? d.chn.planned : 48, 0, 100);
    fresh.chn.dualTrackPrice = clamp(typeof d.chn.dualTrackPrice === "number" ? d.chn.dualTrackPrice : 35, 0, 100);
    fresh.chn.unrest = clamp(typeof d.chn.unrest === "number" ? d.chn.unrest : 3, 0, 100);
    fresh.chn.sezMomentum = clamp(typeof d.chn.sezMomentum === "number" ? d.chn.sezMomentum : 40, 0, 100);
    fresh.chn.externalStress = clamp(typeof d.chn.externalStress === "number" ? d.chn.externalStress : 20, 0, 100);
  }
  if (d.deu && typeof d.deu === "object") {
    fresh.deu.spdApproval = clamp(typeof d.deu.spdApproval === "number" ? d.deu.spdApproval : 55, 0, 100);
    fresh.deu.cduApproval = clamp(typeof d.deu.cduApproval === "number" ? d.deu.cduApproval : 45, 0, 100);
    fresh.deu.detenteDepth = clamp(typeof d.deu.detenteDepth === "number" ? d.deu.detenteDepth : 60, 0, 100);
    fresh.deu.natoBurden = clamp(typeof d.deu.natoBurden === "number" ? d.deu.natoBurden : 50, 0, 100);
    fresh.deu.pipelineDependency = clamp(typeof d.deu.pipelineDependency === "number" ? d.deu.pipelineDependency : 30, 0, 100);
    fresh.deu.energyPressure = clamp(typeof d.deu.energyPressure === "number" ? d.deu.energyPressure : 24, 0, 100);
    fresh.deu.unrest = clamp(typeof d.deu.unrest === "number" ? d.deu.unrest : 2, 0, 100);
  }
  // K（玩法深度）：JPN/FRA/GBR 专属内政字段清洗
  if (d.jpn && typeof d.jpn === "object") {
    fresh.jpn.domesticist = clamp(typeof d.jpn.domesticist === "number" ? d.jpn.domesticist : 45, 0, 100);
    fresh.jpn.exportist = clamp(typeof d.jpn.exportist === "number" ? d.jpn.exportist : 55, 0, 100);
    fresh.jpn.tradeFriction = clamp(typeof d.jpn.tradeFriction === "number" ? d.jpn.tradeFriction : 35, 0, 100);
    fresh.jpn.unrest = clamp(typeof d.jpn.unrest === "number" ? d.jpn.unrest : 2, 0, 100);
  }
  if (d.fra && typeof d.fra === "object") {
    fresh.fra.dirigiste = clamp(typeof d.fra.dirigiste === "number" ? d.fra.dirigiste : 55, 0, 100);
    fresh.fra.rigueur = clamp(typeof d.fra.rigueur === "number" ? d.fra.rigueur : 45, 0, 100);
    fresh.fra.francStrength = clamp(typeof d.fra.francStrength === "number" ? d.fra.francStrength : 45, 0, 100);
    fresh.fra.externalPressure = clamp(typeof d.fra.externalPressure === "number" ? d.fra.externalPressure : 30, 0, 100);
    fresh.fra.unrest = clamp(typeof d.fra.unrest === "number" ? d.fra.unrest : 3, 0, 100);
  }
  if (d.gbr && typeof d.gbr === "object") {
    fresh.gbr.monetarist = clamp(typeof d.gbr.monetarist === "number" ? d.gbr.monetarist : 50, 0, 100);
    fresh.gbr.welfarist = clamp(typeof d.gbr.welfarist === "number" ? d.gbr.welfarist : 50, 0, 100);
    fresh.gbr.cityStrength = clamp(typeof d.gbr.cityStrength === "number" ? d.gbr.cityStrength : 48, 0, 100);
    fresh.gbr.inflation = clamp(typeof d.gbr.inflation === "number" ? d.gbr.inflation : 55, 0, 100);
    fresh.gbr.unrest = clamp(typeof d.gbr.unrest === "number" ? d.gbr.unrest : 4, 0, 100);
  }
  if (d.generals && typeof d.generals === "object") {
    for (const k in d.generals) {
      const g = d.generals[k];
      if (g && typeof g === "object") {
        fresh.generals[k] = {
          stability: clamp(typeof g.stability === "number" ? g.stability : 80, 0, 100),
          unrest: clamp(typeof g.unrest === "number" ? g.unrest : 5, 0, 100),
          legitimacy: clamp(typeof g.legitimacy === "number" ? g.legitimacy : 75, 0, 100),
          sanctionStrain: clamp(typeof g.sanctionStrain === "number" ? g.sanctionStrain : 0, 0, 100)
        };
      }
    }
  }
  return fresh;
}

function updateDomesticPolitics(y, m, silent) {
  if (!ST.domestic) initDomesticState();
  const dom = ST.domestic;

  // G（收尾评审）：各子系统按月演进已抽为独立推进器（见下方 updateDomestic*）。
  if (dom.sun) updateDomesticSun(dom, y, m, silent);
  if (dom.usa) updateDomesticUsa(dom, y, m, silent);
  if (dom.chn) updateDomesticChn(dom, y, m, silent);
  if (dom.deu) updateDomesticDeu(dom, y, m, silent);
  // K（玩法深度）：JPN/FRA/GBR 专属推进器（模板同 CHN/DEU）
  if (dom.jpn) updateDomesticJpn(dom, y, m, silent);
  if (dom.fra) updateDomesticFra(dom, y, m, silent);
  if (dom.gbr) updateDomesticGbr(dom, y, m, silent);
  if (dom.generals) updateDomesticGenerals(dom, y, m, silent);
  // L（战略灵活性）：施政方针的月度漂移 + 施政预算结算 + 战略指令结算
  updatePostureDrift();
  updatePoliticalCapital();
  updateMonthlyDirectives(y, m);
  // P1（账单到期）：经济表现以「与国民预期的落差」的形式回到内政天平上。
  // 放在最后是刻意的 —— 账单是当月政治结算的最后一句话，且它写的是
  // 上面几个推进器刚算完的字段（unrest / 派系 / 支持率）。
  // 无执政者（旁观 / 史实探针）时它立刻返回，轨迹一字不变。
  updatePoliticalEconomy(y, m, silent);
}

// G（收尾评审）：updateDomesticPolitics 的「苏联：政治局权力天平与短缺经济演进」块抽为独立推进器（原样搬运，无逻辑改动）
function updateDomesticSun(dom, y, m, silent) {
    const sun = dom.sun;
    let milSUN = 4.0;
    if (ST.player === "SUN") {
      milSUN = ST.mil;
    } else if (ST.ai && ST.ai.decisions && ST.ai.decisions.SUN && typeof ST.ai.decisions.SUN.mil === "number") {
      milSUN = ST.ai.decisions.SUN.mil;
    }

    // 军费对派系天平与短缺的影响
    if (milSUN >= 6.5) {
      sun.conservative = clamp(sun.conservative + 0.35, 10, 95);
      sun.reformist = clamp(sun.reformist - 0.35, 5, 90);
      sun.shortage = clamp(sun.shortage + 0.40, 0, 100);
    } else if (milSUN <= 4.0) {
      sun.conservative = clamp(sun.conservative - 0.50, 10, 95);
      sun.reformist = clamp(sun.reformist + 0.40, 5, 90);
      sun.shortage = clamp(sun.shortage - 0.30, 0, 100);
    } else {
      sun.conservative = clamp(sun.conservative + (50 - sun.conservative) * 0.02, 10, 95);
      sun.reformist = clamp(sun.reformist + (50 - sun.reformist) * 0.02, 5, 90);
    }

    // 西方制裁与巴统对短缺的加剧
    const isSanctioned = ST.sanctions.some((s) => s.t === "SUN");
    if (isSanctioned) {
      sun.shortage = clamp(sun.shortage + 0.25, 0, 100);
    }

    // 军控缓和条约释放轻工业红利
    if (ST.ai && Array.isArray(ST.ai.treaties) && ST.ai.treaties.some((t) => t.status === "active")) {
      sun.shortage = clamp(sun.shortage - 0.20, 0, 100);
    }

    // 短缺指数引发社会动荡
    // （P0：原先还有一档 `shortage > 80 → +0.75`，但前面 `> 65` 已经拦住，
    //   那一档永远不可达 —— 删掉是零数值改动的死代码清理。）
    if (sun.shortage > 65) {
      sun.unrest = clamp(sun.unrest + 0.45, 0, 100);
    } else if (sun.shortage < 40) {
      sun.unrest = clamp(sun.unrest - 0.40, 0, 100);
    }

    // 政治局危机预警评定
    if (sun.conservative < 25) {
      sun.crisisWarning = "⚠️ 政治局危机：保守派强硬元老酝酿问责倒阁与非常委员会！";
    } else if (sun.reformist < 25) {
      sun.crisisWarning = "⚠️ 改革受挫：新思维遭遇体制僵化，经济改革停滞！";
    } else if (sun.unrest > 45) {
      sun.crisisWarning = "⚠️ 工潮警报：轻工短缺引发矿工与产业工人抗议示威！";
    } else {
      sun.crisisWarning = null;
    }
}

// G（收尾评审）：updateDomesticPolitics 的「美国：国会支持率、大选与《格拉姆-拉德曼法案》预算帽」块抽为独立推进器（原样搬运，无逻辑改动）
function updateDomesticUsa(dom, y, m, silent) {
    const usa = dom.usa;
    let milUSA = 5.0;
    if (ST.player === "USA") {
      milUSA = ST.mil;
    } else if (ST.ai && ST.ai.decisions && ST.ai.decisions.USA && typeof ST.ai.decisions.USA.mil === "number") {
      milUSA = ST.ai.decisions.USA.mil;
    }

    // 自然向 55% 回归
    usa.congressApproval += (55 - usa.congressApproval) * 0.03;

    // 军费过高扩大赤字压低国会支持率
    if (milUSA >= 6.5) {
      usa.congressApproval = clamp(usa.congressApproval - 0.40, 15, 90);
    } else if (milUSA <= 3.5) {
      usa.congressApproval = clamp(usa.congressApproval + 0.25, 15, 90);
    }

    // 对外大规模军援支出引发国会质询
    if (ST.player === "USA" && ST.aid.length > 0) {
      usa.congressApproval = clamp(usa.congressApproval - 0.20, 15, 90);
    }

    // 经济增速强劲回补民调与国会支持
    // P1：这里原写 `gUSA > 0.025`，而 growthOf 返回的是**百分数**（02-sim.js:55
    // `(cur/prev-1)*100`），所以那个阈值其实是 0.025% —— 叠加实际年化 σ≈0.87pp，
    // 条件几乎每月为真，国会支持率无条件 +0.30。这是全游戏唯一一条「经济→政治」
    // 的边，而它是个恒真判断。此处改为 2.5%（2.5pp/年），是有意改变行为，不是漂移。
    // 注意它与 P1 的 polEcon 是两个不同的信号：这里是**绝对**增速水平，
    // polEcon 是相对国民预期的**落差**（谁都会习惯好年景，但没人会习惯低增速）。
    const gUSA = growthOf(entKeys("USA"));
    if (gUSA !== null && gUSA > 2.5) {
      usa.congressApproval = clamp(usa.congressApproval + 0.30, 15, 90);
      usa.presidentialApproval = clamp(usa.presidentialApproval + 0.35, 15, 95);
    }

    // 格拉姆-拉德曼平衡预算案触发判断 (支持率 < 45% 触发)
    if (usa.congressApproval < 45) {
      usa.budgetCapActive = true;
    } else if (usa.congressApproval >= 52) {
      usa.budgetCapActive = false;
    }

    // 总统民意支持率向国会支持率与经济协同
    usa.presidentialApproval = clamp(usa.presidentialApproval + (usa.congressApproval - usa.presidentialApproval) * 0.05, 15, 95);

    // 四年总统大选周期判定 (1984-11, 1988-11)
    if ((y === 1984 || y === 1988) && m === 11) {
      if (usa.presidentialApproval >= 55) {
        usa.electionResult = y + " 大选大捷：总统以绝对优势横扫选举人票连任（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
      } else if (usa.presidentialApproval >= 45) {
        usa.electionResult = y + " 选情胶着：经过白热化拉锯惊险胜选（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
      } else {
        usa.electionResult = y + " 大选惨败：财政赤字击垮执政党，国会陷入严重分立（民调 " + usa.presidentialApproval.toFixed(1) + "%）！";
      }
      usa.nextElectionYear = (y === 1984 ? 1988 : 1992);
      if (!silent && (ST.player === "USA" || !ST.player)) {
        toast({ y: y, m: m, zh: "【美利坚大选公报】" + usa.electionResult, note: "四年一度的美国大选尘埃落定" });
      }
    }
}

// ---- H（玩法深度）：CHN/DEU 内政 ↔ 经济系统双向耦合 ---------------------------
// 旧版 CHN/DEU 内政只受「军费」单变量驱动，与经济系统（贸易/禁运/能源）完全脱钩，
// 玩家看得见的两套系统互不相干。这里补一层「外部环境压力」：
//   禁运（巴统技术封锁）、单边制裁、能源通道受阻 → 转化为国内政治压力；
//   国内变量（特区动能 / 能源压力）再反向注入单一事实源 P.pmods（见 03-decisions.js）。
//
// 中国：外部环境压力（外汇/禁运/能源缺口）→ 特区动能、双轨物价、社会动荡。
// 西德：能源压力（油气通道通行度 + 巴统技术封锁 + 制裁，受管道依赖度放大）
//       → 执政联盟天平、缓和深度、社会动荡。
function chnExternalStress() {
  let s = 0;
  if (ST.sanctions && ST.sanctions.some((x) => x.t === "CHN")) s += 0.55;
  if (ST.cocom && ST.cocom.active) s += (ST.cocom.strict ? 0.35 : 0.15);
  if (typeof calcResourcePenalty === "function") {
    const rp = calcResourcePenalty("CHN");
    if (rp && typeof rp.ratio === "number" && rp.ratio < 1) s += Math.min(0.35, (1 - rp.ratio) * 1.5);
  }
  return clamp(s, 0, 1);
}

function deuEnergyStress() {
  let s = 0;
  const routes = (ST.tradeRoutes && ST.tradeRoutes.length) ? ST.tradeRoutes : [];
  // 油气进口通道通行度：东方（苏）管道权重高于海湾海运
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.to !== "DEU" || r.res !== "oil") continue;
    const st = getRouteStatus(r);
    const f = (st && typeof st.factor === "number") ? st.factor : 1;
    s += (1 - f) * (r.from === "SUN" ? 0.60 : 0.40);
  }
  // 巴统封锁西德→苏技术出口：油气换钢管的对价被切断，缓和红利流失
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.from !== "DEU" || r.res !== "tech") continue;
    const st = getRouteStatus(r);
    if (st && st.status !== "ok" && st.status !== "smuggled") s += 0.25;
  }
  if (ST.sanctions && ST.sanctions.some((x) => x.t === "DEU")) s += 0.50;
  return clamp(s, 0, 1);
}

// G（收尾评审）：updateDomesticPolitics 的「中国：双轨制博弈（市场派 vs 计划派、双轨物价、特区动能）」块抽为独立推进器（原样搬运，无逻辑改动）
function updateDomesticChn(dom, y, m, silent) {
    const chn = dom.chn;
    let milCHN = 2.5;
    if (ST.player === "CHN") milCHN = ST.mil;
    else if (ST.ai && ST.ai.decisions && ST.ai.decisions.CHN && typeof ST.ai.decisions.CHN.mil === "number") milCHN = ST.ai.decisions.CHN.mil;
    // 高军费 → 国营/计划派抬头，特区派受压
    if (milCHN >= 4.0) {
      chn.planned = clamp(chn.planned + 0.22, 10, 92);
      chn.reformist = clamp(chn.reformist - 0.22, 8, 90);
      chn.dualTrackPrice = clamp(chn.dualTrackPrice + 0.30, 0, 100);
    } else if (milCHN <= 2.0) {
      // 低军费 → 特区/市场派扩张，双轨物价逐步理顺
      chn.reformist = clamp(chn.reformist + 0.18, 8, 90);
      chn.planned = clamp(chn.planned - 0.18, 10, 92);
      chn.dualTrackPrice = clamp(chn.dualTrackPrice - 0.22, 0, 100);
      chn.sezMomentum = clamp(chn.sezMomentum + 0.15, 0, 100);
    }
    // 双轨物价过高 → 民生动荡
    if (chn.dualTrackPrice >= 70) chn.unrest = clamp(chn.unrest + 0.28, 0, 100);
    else chn.unrest = clamp(chn.unrest - 0.10, 0, 100);
    // H（玩法深度）：外部环境压力（禁运/外汇/能源缺口）→ 内政压力。
    // 压力向目标值平滑收敛（外部条件不变时不会无限累积），高压力压制特区动能、
    // 抬升双轨物价并累积动荡；低压力则释放开放红利。
    const cs = chnExternalStress();
    const csTarget = clamp(10 + cs * 75, 0, 100);
    chn.externalStress = clamp(chn.externalStress + (csTarget - chn.externalStress) * 0.12, 0, 100);
    if (chn.externalStress >= 55) {
      chn.sezMomentum = clamp(chn.sezMomentum - 0.30, 0, 100);
      chn.dualTrackPrice = clamp(chn.dualTrackPrice + 0.25, 0, 100);
      chn.unrest = clamp(chn.unrest + 0.18, 0, 100);
    } else if (chn.externalStress <= 30) {
      chn.sezMomentum = clamp(chn.sezMomentum + 0.12, 0, 100);
      chn.dualTrackPrice = clamp(chn.dualTrackPrice - 0.12, 0, 100);
    }
    // 特区动能低速衰减（开放红利边际递减）
    chn.sezMomentum = clamp(chn.sezMomentum - 0.05, 0, 100);
}

// G（收尾评审）：updateDomesticPolitics 的「西德：新东方政策与换届（缓和深度、北约义务、管道依赖）」块抽为独立推进器（原样搬运，无逻辑改动）
function updateDomesticDeu(dom, y, m, silent) {
    const deu = dom.deu;
    let milDEU = 3.0;
    if (ST.player === "DEU") milDEU = ST.mil;
    else if (ST.ai && ST.ai.decisions && ST.ai.decisions.DEU && typeof ST.ai.decisions.DEU.mil === "number") milDEU = ST.ai.decisions.DEU.mil;
    // 高军费 → 北约义务加重，社民党缓和派失分
    if (milDEU >= 4.5) {
      deu.natoBurden = clamp(deu.natoBurden + 0.30, 0, 100);
      deu.spdApproval = clamp(deu.spdApproval - 0.25, 0, 100);
      deu.cduApproval = clamp(deu.cduApproval + 0.25, 0, 100);
      deu.detenteDepth = clamp(deu.detenteDepth - 0.20, 0, 100);
    } else if (milDEU <= 2.5) {
      // 低军费 → 缓和红利，社民党得分
      deu.detenteDepth = clamp(deu.detenteDepth + 0.22, 0, 100);
      deu.spdApproval = clamp(deu.spdApproval + 0.20, 0, 100);
      deu.cduApproval = clamp(deu.cduApproval - 0.20, 0, 100);
      deu.pipelineDependency = clamp(deu.pipelineDependency + 0.12, 0, 100);
    }
    // 缓和越深，管道依赖越高（历史史实：新东方政策伴随油气换钢管）
    if (deu.detenteDepth >= 65) deu.pipelineDependency = clamp(deu.pipelineDependency + 0.08, 0, 100);
    // H（玩法深度）：能源供应压力 —— 由油气通道通行度、巴统技术封锁与制裁共同决定，
    // 并被对苏管道依赖度放大（依赖越深，同一条通道中断的政治代价越大）。
    // 压力向目标值平滑收敛；越过阈值后冲击执政联盟、缓和深度与社会安定。
    const ds = deuEnergyStress();
    const dsTarget = clamp(10 + ds * 70 * (0.6 + (deu.pipelineDependency / 100) * 0.8), 0, 100);
    deu.energyPressure = clamp(deu.energyPressure + (dsTarget - deu.energyPressure) * 0.10, 0, 100);
    if (deu.energyPressure >= 50) {
      deu.spdApproval = clamp(deu.spdApproval - 0.15, 0, 100);
      deu.cduApproval = clamp(deu.cduApproval + 0.15, 0, 100);
      deu.detenteDepth = clamp(deu.detenteDepth - 0.10, 0, 100);
      deu.unrest = clamp(deu.unrest + 0.20, 0, 100);
    } else {
      deu.unrest = clamp(deu.unrest - 0.10, 0, 100);
    }
}

// ---- K（玩法深度）：JPN/FRA/GBR 外部环境压力评估 -------------------------------
// 复制 H2/H3 已验证的模板：外部条件（通道通行度 / 巴统封锁 / 单边制裁）→ 单一标量压力，
// 再由各国推进器把压力转成内政天平与议程门控。
//   日本：对美高技术出口通道受阻 + 原油矿产进口受阻 + 巴统 → 贸易摩擦压力。
//   法国：地中海/海湾原油输入受阻 + 巴统 + 制裁 + 能源缺口 → 外部环境压力（法郎承压）。
//   英国：北海自给故能源通道影响弱，压力来自巴统封锁、制裁与全球金融风险溢价（美苏张力）。
function jpnTradeFrictionStress() {
  let s = 0;
  const routes = (ST.tradeRoutes && ST.tradeRoutes.length) ? ST.tradeRoutes : [];
  // 日本 → 美国高技术出口通道受阻（半导体/汽车摩擦的贸易载体）
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.from !== "JPN" || r.res !== "tech") continue;
    const st = getRouteStatus(r);
    if (st && st.status !== "ok" && st.status !== "smuggled") s += 0.40;
  }
  // 原油与矿产进口通道受阻 → 产业成本抬升，出口竞争力受压
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.to !== "JPN" || r.res === "agr") continue;
    const st = getRouteStatus(r);
    const f = (st && typeof st.factor === "number") ? st.factor : 1;
    s += (1 - f) * 0.30;
  }
  if (ST.cocom && ST.cocom.active) s += (ST.cocom.strict ? 0.30 : 0.15);
  if (ST.sanctions && ST.sanctions.some((x) => x.t === "JPN")) s += 0.55;
  return clamp(s, 0, 1);
}

function fraExternalStress() {
  let s = 0;
  const routes = (ST.tradeRoutes && ST.tradeRoutes.length) ? ST.tradeRoutes : [];
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (r.to !== "FRA" || r.res !== "oil") continue;
    const st = getRouteStatus(r);
    const f = (st && typeof st.factor === "number") ? st.factor : 1;
    s += (1 - f) * 0.45;
  }
  if (ST.cocom && ST.cocom.active) s += (ST.cocom.strict ? 0.35 : 0.20);
  if (ST.sanctions && ST.sanctions.some((x) => x.t === "FRA")) s += 0.50;
  if (typeof calcResourcePenalty === "function") {
    const rp = calcResourcePenalty("FRA");
    if (rp && typeof rp.ratio === "number" && rp.ratio < 1) s += Math.min(0.30, (1 - rp.ratio) * 1.2);
  }
  return clamp(s, 0, 1);
}

function gbrExternalStress() {
  let s = 0;
  if (ST.cocom && ST.cocom.active) s += (ST.cocom.strict ? 0.40 : 0.25);
  if (ST.sanctions && ST.sanctions.some((x) => x.t === "GBR")) s += 0.50;
  // 全球金融风险溢价：美苏张力抬升离岸金融中心的融资与避险成本
  const tn = (ST.ai && ST.ai.tensions && typeof ST.ai.tensions["USA:SUN"] === "number") ? ST.ai.tensions["USA:SUN"] : 0;
  s += clamp(tn / 100, 0, 1) * 0.35;
  return clamp(s, 0, 1);
}

// K（玩法深度）：日本 —— 出口产业派 vs 内需开放派，贸易摩擦压力决定天平与动荡。
function updateDomesticJpn(dom, y, m, silent) {
    const jpn = dom.jpn;
    let milJPN = 1.0;
    if (ST.player === "JPN") milJPN = ST.mil;
    else if (ST.ai && ST.ai.decisions && ST.ai.decisions.JPN && typeof ST.ai.decisions.JPN.mil === "number") milJPN = ST.ai.decisions.JPN.mil;
    // 突破 1% 红线 → 重工/军工出口导向抬头，出口产业派得势
    if (milJPN >= 2.0) {
      jpn.exportist = clamp(jpn.exportist + 0.22, 8, 92);
      jpn.domesticist = clamp(jpn.domesticist - 0.22, 8, 92);
      jpn.tradeFriction = clamp(jpn.tradeFriction + 0.20, 0, 100);
    } else if (milJPN <= 1.0) {
      // 恪守 1% 红线 → 财政资源转向内需与民生
      jpn.domesticist = clamp(jpn.domesticist + 0.18, 8, 92);
      jpn.exportist = clamp(jpn.exportist - 0.18, 8, 92);
    }
    // 贸易摩擦压力向目标值平滑收敛（外部条件不变时不会无限累积）
    const jf = jpnTradeFrictionStress();
    const jfTarget = clamp(10 + jf * 80, 0, 100);
    jpn.tradeFriction = clamp(jpn.tradeFriction + (jfTarget - jpn.tradeFriction) * 0.12, 0, 100);
    if (jpn.tradeFriction >= 60) {
      // 摩擦高压 → 民意转向内需开放派，但产业调整期动荡上升
      jpn.domesticist = clamp(jpn.domesticist + 0.20, 8, 92);
      jpn.exportist = clamp(jpn.exportist - 0.20, 8, 92);
      jpn.unrest = clamp(jpn.unrest + 0.18, 0, 100);
    } else if (jpn.tradeFriction <= 30) {
      jpn.unrest = clamp(jpn.unrest - 0.10, 0, 100);
    }
}

// K（玩法深度）：法国 —— 国家干预派 vs 紧缩坚挺派，外部约束决定法郎平价与路线转向。
function updateDomesticFra(dom, y, m, silent) {
    const fra = dom.fra;
    let milFRA = 3.5;
    if (ST.player === "FRA") milFRA = ST.mil;
    else if (ST.ai && ST.ai.decisions && ST.ai.decisions.FRA && typeof ST.ai.decisions.FRA.mil === "number") milFRA = ST.ai.decisions.FRA.mil;
    // 高军费 → 国家干预派抬头（军工与国家冠军），但赤字侵蚀法郎平价
    if (milFRA >= 4.5) {
      fra.dirigiste = clamp(fra.dirigiste + 0.22, 8, 92);
      fra.rigueur = clamp(fra.rigueur - 0.22, 8, 92);
      fra.francStrength = clamp(fra.francStrength - 0.25, 0, 100);
    } else if (milFRA <= 2.5) {
      fra.rigueur = clamp(fra.rigueur + 0.18, 8, 92);
      fra.dirigiste = clamp(fra.dirigiste - 0.18, 8, 92);
      fra.francStrength = clamp(fra.francStrength + 0.20, 0, 100);
    }
    const ff = fraExternalStress();
    const ffTarget = clamp(10 + ff * 75, 0, 100);
    fra.externalPressure = clamp(fra.externalPressure + (ffTarget - fra.externalPressure) * 0.12, 0, 100);
    // 外部约束越强，越被迫转向紧缩坚挺（1983 年转向的历史逻辑）
    if (fra.externalPressure >= 45) {
      fra.rigueur = clamp(fra.rigueur + 0.25, 8, 92);
      fra.dirigiste = clamp(fra.dirigiste - 0.25, 8, 92);
      fra.unrest = clamp(fra.unrest + 0.15, 0, 100);
      // 尚未完成紧缩转向时，资本外逃持续侵蚀法郎平价（转向完成后由坚挺政策托住）
      if (!(fra.rigueur > fra.dirigiste)) fra.francStrength = clamp(fra.francStrength - 0.25, 0, 100);
    } else if (fra.externalPressure <= 25) {
      fra.dirigiste = clamp(fra.dirigiste + 0.15, 8, 92);
      fra.rigueur = clamp(fra.rigueur - 0.15, 8, 92);
      fra.francStrength = clamp(fra.francStrength + 0.12, 0, 100);
      fra.unrest = clamp(fra.unrest - 0.10, 0, 100);
    }
    // 紧缩坚挺派执政 → 法郎平价走强（正反馈）；法郎走强又反过来压低外部压力
    if (fra.rigueur > fra.dirigiste) fra.francStrength = clamp(fra.francStrength + 0.30, 0, 100);
    if (fra.francStrength >= 65) fra.externalPressure = clamp(fra.externalPressure - 0.20, 0, 100);
}

// K（玩法深度）：英国 —— 货币主义派 vs 福利共识派，通胀压力决定路线与金融城竞争力。
function updateDomesticGbr(dom, y, m, silent) {
    const gbr = dom.gbr;
    let milGBR = 3.5;
    if (ST.player === "GBR") milGBR = ST.mil;
    else if (ST.ai && ST.ai.decisions && ST.ai.decisions.GBR && typeof ST.ai.decisions.GBR.mil === "number") milGBR = ST.ai.decisions.GBR.mil;
    // 高军费 → 财政紧缩优先，货币主义派得势；压缩军费 → 福利共识回潮
    if (milGBR >= 4.5) {
      gbr.monetarist = clamp(gbr.monetarist + 0.22, 8, 92);
      gbr.welfarist = clamp(gbr.welfarist - 0.22, 8, 92);
      gbr.inflation = clamp(gbr.inflation - 0.20, 0, 100);
    } else if (milGBR <= 2.5) {
      gbr.welfarist = clamp(gbr.welfarist + 0.18, 8, 92);
      gbr.monetarist = clamp(gbr.monetarist - 0.18, 8, 92);
      gbr.inflation = clamp(gbr.inflation + 0.18, 0, 100);
    }
    // 外部冲击（巴统封锁 / 制裁 / 全球金融风险溢价）→ 输入型通胀压力
    const gf = gbrExternalStress();
    const gfTarget = clamp(15 + gf * 70, 0, 100);
    gbr.inflation = clamp(gbr.inflation + (gfTarget - gbr.inflation) * 0.10, 0, 100);
    if (gbr.inflation >= 65) {
      // 恶性通胀 → 民意转向货币主义，同时社会张力上升
      gbr.monetarist = clamp(gbr.monetarist + 0.20, 8, 92);
      gbr.welfarist = clamp(gbr.welfarist - 0.20, 8, 92);
      gbr.unrest = clamp(gbr.unrest + 0.20, 0, 100);
    } else if (gbr.inflation <= 40) {
      gbr.welfarist = clamp(gbr.welfarist + 0.12, 8, 92);
      gbr.monetarist = clamp(gbr.monetarist - 0.12, 8, 92);
      gbr.unrest = clamp(gbr.unrest - 0.12, 0, 100);
    }
    // 货币主义派执政 → 通胀预期被锚定（正反馈）；通胀回落又抬升金融城竞争力
    if (gbr.monetarist > gbr.welfarist) gbr.inflation = clamp(gbr.inflation - 0.35, 0, 100);
    if (gbr.inflation <= 45) gbr.cityStrength = clamp(gbr.cityStrength + 0.25, 0, 100);
    else if (gbr.inflation >= 70) gbr.cityStrength = clamp(gbr.cityStrength - 0.25, 0, 100);
}

// G（收尾评审）：updateDomesticPolitics 的「通用实体：社会安定度与制裁抗议」块抽为独立推进器（原样搬运，无逻辑改动）
function updateDomesticGenerals(dom, y, m, silent) {
    for (const k in dom.generals) {
      const g = dom.generals[k];
      const isSan = ST.sanctions.some((s) => s.t === k);
      if (isSan) {
        g.sanctionStrain = clamp(g.sanctionStrain + 2, 0, 100);
        g.stability = clamp(g.stability - 0.40, 10, 100);
        g.unrest = clamp(g.unrest + 0.35, 0, 100);
      } else {
        g.sanctionStrain = clamp(g.sanctionStrain - 1, 0, 100);
        g.stability = clamp(g.stability + (82 - g.stability) * 0.03, 10, 100);
        g.unrest = clamp(g.unrest - 0.25, 0, 100);
      }
    }
}


function applyDomesticPlayerAction(actType) {
  if (!ST.domestic) initDomesticState();
  if (!actType) return false;
  // L（参与感/战略灵活性）：施政预算门 —— 必须在任何状态改动之前判定，
  // 保证「被拒绝的动作」不产生任何副作用（探针据此断言）。
  const cost = domesticActionCost(actType);
  if (!spendPoliticalCapital(cost)) {
    const pc = initPoliticalCapital();
    toast({
      zh: "【施政受阻】",
      note: "政治资本不足：该动作需 " + cost + " 点，当前仅 " + pc.value.toFixed(1) +
        " 点。先稳住国内局势（降低动荡、提高执政合法性）才能腾出施政空间。"
    });
    refreshDomesticBox(ST.sel);
    return false;
  }
  if (ST.player === "SUN") {
    const sun = ST.domestic.sun;
    if (actType === "rebalance_consumer") {
      // 推进轻工民生改革
      sun.shortage = clamp(sun.shortage - 6, 0, 100);
      sun.reformist = clamp(sun.reformist + 5, 0, 100);
      sun.conservative = clamp(sun.conservative - 5, 0, 100);
      sun.unrest = clamp(sun.unrest - 4, 0, 100);
      toast({ zh: "【政治局施政决议】", note: "统帅部下达消费品增产指令，拨付轻工专项资金，部分军工厂转产民用家电！" });
    } else if (actType === "placate_vpk") {
      // 安抚军工复合体元老
      sun.conservative = clamp(sun.conservative + 7, 0, 100);
      sun.reformist = clamp(sun.reformist - 4, 0, 100);
      sun.shortage = clamp(sun.shortage + 4, 0, 100);
      toast({ zh: "【政治局扩大会议】", note: "向国防工业委员会保证重点型号拨款，军工复合体元老疑虑暂时平息。" });
    }
  } else if (ST.player === "USA") {
    const usa = ST.domestic.usa;
    if (actType === "compromise_budget") {
      usa.congressApproval = clamp(usa.congressApproval + 6, 0, 100);
      usa.presidentialApproval = clamp(usa.presidentialApproval + 3, 0, 100);
      if (ST.mil > 5.0) {
        ST.mil = 5.0;
        applyPlayerDecisions();
        const r = $("p-mil"); if (r) r.value = "5";
        const v = $("p-mil-v"); if (v) v.textContent = "5";
      }
      toast({ zh: "【两党国会妥协】", note: "白宫签署两党折衷预算案，限制赤字规模，国会两党批准率显著回升！" });
    }
  } else if (ST.player === "CHN") {
    // E：中国专属动作
    const chn = ST.domestic.chn;
    if (actType === "chn_expand_sez") {
      chn.reformist = clamp(chn.reformist + 6, 0, 100);
      chn.planned = clamp(chn.planned - 5, 0, 100);
      chn.sezMomentum = clamp(chn.sezMomentum + 8, 0, 100);
      chn.dualTrackPrice = clamp(chn.dualTrackPrice + 2, 0, 100);
      toast({ zh: "【国务院特区扩权】", note: "新批沿海开放城市与外资优惠政策，特区动能显著抬升，但双轨价差短期扩大。" });
    } else if (actType === "chn_price_reform") {
      chn.dualTrackPrice = clamp(chn.dualTrackPrice - 9, 0, 100);
      chn.reformist = clamp(chn.reformist + 3, 0, 100);
      chn.planned = clamp(chn.planned - 3, 0, 100);
      chn.unrest = clamp(chn.unrest + 5, 0, 100);
      toast({ zh: "【价格并轨改革】", note: "闯关式价格改革推进，双轨套利空间收窄，但短期内需承受民生与通胀冲击。" });
    }
  } else if (ST.player === "DEU") {
    // E：西德专属动作
    const deu = ST.domestic.deu;
    if (actType === "deu_ostpolitik") {
      deu.detenteDepth = clamp(deu.detenteDepth + 7, 0, 100);
      deu.pipelineDependency = clamp(deu.pipelineDependency + 5, 0, 100);
      deu.spdApproval = clamp(deu.spdApproval + 4, 0, 100);
      deu.cduApproval = clamp(deu.cduApproval - 4, 0, 100);
      toast({ zh: "【新东方政策深化】", note: "波恩与莫斯科推进长期天然气供应与信贷合作，缓和高涨，但能源杠杆加深。" });
    } else if (actType === "deu_nato_pledge") {
      deu.natoBurden = clamp(deu.natoBurden + 8, 0, 100);
      deu.detenteDepth = clamp(deu.detenteDepth - 5, 0, 100);
      deu.cduApproval = clamp(deu.cduApproval + 5, 0, 100);
      deu.spdApproval = clamp(deu.spdApproval - 3, 0, 100);
      toast({ zh: "【北约防务承诺】", note: "联邦议院通过追加防务预算，重申北约前沿义务，缓和派民意受挫。" });
    }
  } else if (ST.player === "JPN") {
    // K（玩法深度）：日本专属动作 —— 外需/内需路线之争
    const jpn = ST.domestic.jpn;
    if (actType === "jpn_domestic_demand") {
      jpn.domesticist = clamp(jpn.domesticist + 7, 0, 100);
      jpn.exportist = clamp(jpn.exportist - 7, 0, 100);
      jpn.tradeFriction = clamp(jpn.tradeFriction - 4, 0, 100);
      jpn.unrest = clamp(jpn.unrest - 2, 0, 100);
      toast({ zh: "【前川报告路线】", note: "内阁决定扩大住宅与公共投资、开放国内市场，主动收窄顺差以缓解对美摩擦。" });
    } else if (actType === "jpn_export_push") {
      jpn.exportist = clamp(jpn.exportist + 7, 0, 100);
      jpn.domesticist = clamp(jpn.domesticist - 7, 0, 100);
      jpn.tradeFriction = clamp(jpn.tradeFriction + 6, 0, 100);
      toast({ zh: "【出口立国路线】", note: "通产省加码半导体与精密制造出口补贴，外需引擎全开，但贸易摩擦随之升温。" });
    }
  } else if (ST.player === "FRA") {
    // K（玩法深度）：法国专属动作 —— 国家干预与紧缩转向
    const fra = ST.domestic.fra;
    if (actType === "fra_industrial_policy") {
      fra.dirigiste = clamp(fra.dirigiste + 7, 0, 100);
      fra.rigueur = clamp(fra.rigueur - 7, 0, 100);
      fra.francStrength = clamp(fra.francStrength - 4, 0, 100);
      fra.unrest = clamp(fra.unrest - 2, 0, 100);
      toast({ zh: "【产业国有化扩权】", note: "政府扩大国有化范围并加码国家冠军产业投资，短期稳住就业，但法郎平价承压。" });
    } else if (actType === "fra_hard_franc") {
      fra.rigueur = clamp(fra.rigueur + 8, 0, 100);
      fra.dirigiste = clamp(fra.dirigiste - 8, 0, 100);
      fra.francStrength = clamp(fra.francStrength + 6, 0, 100);
      fra.unrest = clamp(fra.unrest + 4, 0, 100);
      toast({ zh: "【紧缩坚挺守汇】", note: "冻结工资与物价、削减公共开支以守住法郎平价，通胀预期回落但民怨上升。" });
    }
  } else if (ST.player === "GBR") {
    // K（玩法深度）：英国专属动作 —— 货币主义与福利共识
    const gbr = ST.domestic.gbr;
    if (actType === "gbr_tight_money") {
      gbr.monetarist = clamp(gbr.monetarist + 7, 0, 100);
      gbr.welfarist = clamp(gbr.welfarist - 7, 0, 100);
      gbr.inflation = clamp(gbr.inflation - 6, 0, 100);
      gbr.unrest = clamp(gbr.unrest + 4, 0, 100);
      toast({ zh: "【货币主义紧缩】", note: "大幅加息并严控货币供应量，通胀预期被强行锚定，工会与制造业反弹加剧。" });
    } else if (actType === "gbr_welfare_compromise") {
      gbr.welfarist = clamp(gbr.welfarist + 7, 0, 100);
      gbr.monetarist = clamp(gbr.monetarist - 7, 0, 100);
      gbr.inflation = clamp(gbr.inflation + 5, 0, 100);
      gbr.unrest = clamp(gbr.unrest - 3, 0, 100);
      toast({ zh: "【福利共识妥协】", note: "扩大公共开支与社会保障以安抚工会，社会张力缓解，但通胀压力重新抬头。" });
    }
  } else {
    // L（参与感）：通用实体施政 —— 47 个此前没有任何可点按钮的国家现在也能执政。
    // 三条路线互斥地消耗同一份政治资本：紧缩换合法性、福利换安定、治安压动荡，
    // 每条都有明确代价，因此「选哪条」是真实取舍而非无脑连点。
    const g = getGeneralDomestic(ST.player);
    if (actType === "gen_austerity") {
      g.legitimacy = clamp(g.legitimacy + 6, 0, 100);
      g.stability = clamp(g.stability - 3, 0, 100);
      g.unrest = clamp(g.unrest + 3, 0, 100);
      toast({ zh: "【财政紧缩法案】", note: "削减补贴与公共开支以平衡财政，国际信用与执政合法性上升，但民生与基层承压。" });
    } else if (actType === "gen_welfare") {
      g.stability = clamp(g.stability + 5, 0, 100);
      g.unrest = clamp(g.unrest - 4, 0, 100);
      g.legitimacy = clamp(g.legitimacy - 3, 0, 100);
      toast({ zh: "【社会福利扩张】", note: "扩大社会保障与食品补贴，社会安定度回升，但财政赤字侵蚀执政合法性。" });
    } else if (actType === "gen_crackdown") {
      g.unrest = clamp(g.unrest - 7, 0, 100);
      g.stability = clamp(g.stability + 2, 0, 100);
      g.legitimacy = clamp(g.legitimacy - 6, 0, 100);
      toast({ zh: "【强化治安管制】", note: "扩大治安与戒严力量，街头动荡被强行压下，但执政合法性明显受损。" });
    }
  }
  refreshDomesticBox(ST.sel);
  applyPlayerDecisions();
  return true;
}

function refreshDomesticBox(selKey) {
  const box = $("p-domestic-box");
  if (!box) return;
  if (!selKey) { box.innerHTML = ""; return; }
  if (!ST.domestic) initDomesticState();

  const actualKey = resolvePlayableKey(selKey);
  const isMine = !!ST.player && actualKey === ST.player;

  // G（收尾评审）：各分支的 HTML 构建已抽为独立构建器（见下方 domestic*Html），
  // 本函数只负责选择分支、写入面板与接线动作按钮。
  let h;
  if (actualKey === "SUN") h = domesticSunHtml(isMine);
  else if (actualKey === "USA") h = domesticUsaHtml(isMine);
  else if (actualKey === "CHN") h = domesticChnHtml(isMine);
  else if (actualKey === "DEU") h = domesticDeuHtml(isMine);
  else if (actualKey === "JPN") h = domesticJpnHtml(isMine);
  else if (actualKey === "FRA") h = domesticFraHtml(isMine);
  else if (actualKey === "GBR") h = domesticGbrHtml(isMine);
  else h = domesticGenericHtml(actualKey, isMine);

  // L（参与感）：执政国面板顶部统一插入「政治资本」预算条 —— 只加一次，
  // 无需改动 8 个分支构建器；非执政国不显示（资本只属于玩家）。
  // P1：紧随其后插入「经济账单」条 —— 落差与储备必须随时可见，
  // 不可见的机制等于不存在的机制。
  if (isMine) h = domesticCapitalHtml() + domesticPolEconHtml() + prestigeBoardHtml()
    + (typeof nukePanelHtml === "function" ? nukePanelHtml() : "")
    + (typeof ideologyPanelHtml === "function" ? ideologyPanelHtml() : "") + h;
  box.innerHTML = h;

  // 绑定动作按钮事件：标出成本、预算不足时禁用（禁用态不绑 click，杜绝绕过）
  const pc = initPoliticalCapital();
  box.querySelectorAll(".pdb-act-btn").forEach((btn) => {
    const act = btn.dataset.act;
    if (!act) return;
    const cost = domesticActionCost(act);
    btn.insertAdjacentHTML("beforeend", ' <span class="pdb-cost">-' + cost + '</span>');
    if (pc.value < cost) {
      btn.disabled = true;
      btn.title = "政治资本不足：需 " + cost + " 点，当前 " + pc.value.toFixed(1) + " 点";
      return;
    }
    btn.title = "消耗政治资本 " + cost + " 点（当前 " + pc.value.toFixed(1) + "）";
    btn.addEventListener("click", () => applyDomesticPlayerAction(act));
  });

  // L（战略灵活性）：施政方针切换按钮
  box.querySelectorAll(".pdb-posture-btn").forEach((btn) => {
    btn.addEventListener("click", () => setPosture(btn.dataset.posture));
  });

  // L（参与感）：战略指令采纳按钮
  box.querySelectorAll(".pdb-directive-btn").forEach((btn) => {
    btn.addEventListener("click", () => adoptDirective(btn.dataset.directive));
  });

  // F（威望竞赛）：工程启停按钮 —— 启动要消耗政治资本，停止不返还（沉没成本）
  box.querySelectorAll(".pdb-prog-btn").forEach((btn) => {
    if (btn.disabled) return;
    const id = btn.dataset.prog;
    const on = ST.prestige && Array.isArray(ST.prestige.active) && ST.prestige.active.indexOf(id) >= 0;
    btn.addEventListener("click", () => {
      if (on) stopPrestigeProgram(id);
      else startPrestigeProgram(id);
      refreshDomesticBox(ST.sel);
    });
  });

  // N1（核风险轴）：事故处置按钮 —— 三选一，没有「安全」的选项
  box.querySelectorAll(".nk-opt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      resolveNukeIncident(btn.dataset.nkopt);
      refreshDomesticBox(ST.sel);
    });
  });

  // S-17（意识形态资源化）：主张输出工程按钮 —— 与内政/威望/作战抢同一份政治资本
  box.querySelectorAll(".id-prog-btn").forEach((btn) => {
    if (btn.disabled) return;
    const id = btn.dataset.idprog;
    const on = ST.ideology && Array.isArray(ST.ideology.active) && ST.ideology.active.indexOf(id) >= 0;
    btn.addEventListener("click", () => {
      if (on) stopIdeologyProgram(id);
      else startIdeologyProgram(id);
      refreshDomesticBox(ST.sel);
    });
  });
}

// L（参与感）：政治资本预算条 —— 让「还能做几件事」成为随时可见的约束
function domesticCapitalHtml() {
  const pc = initPoliticalCapital();
  const pct = Math.round((pc.value / pc.cap) * 100);
  const cls = pc.value >= 60 ? "good" : pc.value >= 30 ? "warn" : "danger";
  const color = pc.value >= 60 ? "#4ade80" : pc.value >= 30 ? "#fbbf24" : "#f87171";
  const gain = politicalCapitalAccrual();
  const gainTxt = (gain >= 0 ? "+" : "") + gain.toFixed(1);
  let h = '<div class="pdb-capital">';
  h += '<div class="pdb-meter-row"><span class="pdb-meter-lbl">🏛️ 政治资本（施政预算）</span>' +
    '<span class="pdb-meter-val" style="color:' + color + '">' + pc.value.toFixed(1) + ' / ' + pc.cap +
    ' · 月结算 ' + gainTxt + '</span></div>';
  h += '<div class="pdb-meter-track"><div class="pdb-meter-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
  if (pc.value < DOMESTIC_ACTION_DEFAULT_COST) {
    h += '<div class="pdb-alert">⚠️ 政治资本已低于最低动作成本，需等待局势回稳才能继续施政。</div>';
  }
  // L（战略灵活性）：施政方针切换 —— 同一份预算，不同路线的机会成本不同
  const cur = initPosture(false);
  h += '<div class="pdb-postures">';
  for (const key in POSTURES) {
    const p = POSTURES[key];
    const on = key === cur;
    h += '<button class="pdb-posture-btn' + (on ? ' active' : '') + '" data-posture="' + key + '"' +
      (on ? ' disabled' : '') + ' title="' + p.desc + '">' + p.icon + ' ' + p.zh + '</button>';
  }
  h += '</div>';
  h += '<div class="pdb-posture-desc">' + POSTURES[cur].icon + ' <b>' + POSTURES[cur].zh + '</b>：' +
    POSTURES[cur].desc + (cur === "balanced" ? "" : '（切换消耗 ' + POSTURE_SWITCH_COST + ' 点政治资本）') + '</div>';
  h += domesticDirectivesHtml();
  // F（威望竞赛）：与内政动作抢同一份政治资本 —— 这才是「战略灵活性」
  h += prestigeProgramsHtml();
  h += '</div>';
  return h;
}

// L（参与感）：国家战略指令板 —— 同时最多 2 项，达标给回政治资本，逾期受罚
function domesticDirectivesHtml() {
  if (!ST.player) return "";
  const st = initDirectiveState(false);
  const nowIdx = simMonthIndex();
  let h = '<div class="pdb-directives">';
  h += '<div class="pdb-meter-row"><span class="pdb-meter-lbl">🎯 国家战略指令</span>' +
    '<span class="pdb-meter-val">' + st.active.length + ' / ' + DIRECTIVE_MAX_ACTIVE + '</span></div>';

  if (st.active.length) {
    for (let i = 0; i < st.active.length; i++) {
      const entry = st.active[i];
      const def = directiveDef(entry.id);
      if (!def) continue;
      const pct = Math.round(directiveProgress(entry, def) * 100);
      const left = directiveMonthsLeft(entry, def);
      const cls = pct >= 100 ? "good" : pct >= 50 ? "warn" : "danger";
      h += '<div class="pdb-directive">';
      h += '<div class="pdb-directive-row"><span>' + def.icon + ' <b>' + def.zh + '</b> · ' + def.desc + '</span>' +
        '<span class="pdb-directive-meta">' + pct + '% · 剩 ' + left + ' 月</span></div>';
      h += '<div class="pdb-meter-track"><div class="pdb-meter-fill ' + cls + '" style="width:' + pct + '%"></div></div>';
      h += '</div>';
    }
  } else {
    h += '<div class="pdb-directive-empty">尚未确立战略指令。采纳一项跨年度目标，可把短期施政与长期国策绑定。</div>';
  }

  const available = DIRECTIVES.filter((d) => st.done.indexOf(d.id) < 0 && !st.active.some((x) => x.id === d.id));
  if (st.active.length < DIRECTIVE_MAX_ACTIVE && available.length) {
    const pc = initPoliticalCapital();
    h += '<div class="pdb-directive-picks">';
    for (let i = 0; i < available.length; i++) {
      const d = available[i];
      const canAfford = pc.value >= DIRECTIVE_ADOPT_COST;
      h += '<button class="pdb-directive-btn" data-directive="' + d.id + '"' + (canAfford ? "" : " disabled") +
        ' title="' + d.desc + '（期限 ' + d.months + ' 个月；达成 +' + d.reward + ' 政治资本）">' +
        d.icon + ' ' + d.zh + '</button>';
    }
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// G（收尾评审）：refreshDomesticBox 的「苏联」分支抽为独立构建器（原样搬运，无逻辑改动）
function domesticSunHtml(isMine) {
  let h = "";
  // 苏联 (SUN) 界面
  const sun = ST.domestic.sun;
  const cPct = Math.round((sun.conservative / (sun.conservative + sun.reformist)) * 100);
  const rPct = 100 - cPct;

  let shortageClass = "good";
  let shortageDesc = "消费品供给平稳";
  if (sun.shortage >= 65) { shortageClass = "danger"; shortageDesc = "物资奇缺 · 排长队与凭票抢购"; }
  else if (sun.shortage >= 40) { shortageClass = "warn"; shortageDesc = "部分商品脱销 · 供应紧张"; }

  let unrestClass = "good";
  if (sun.unrest >= 45) unrestClass = "danger";
  else if (sun.unrest >= 25) unrestClass = "warn";

  h += '<div class="pdb-title"><span>🏛️ 政治局权力天平</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '大国体制') + '</span></div>';
  h += '<div class="pdb-desc">苏维埃最高决策层由保守鹰派（军工集团/老近卫军）与改革新思维派共同掣肘。维持高额军费巩固国防但挤占轻工民生，低军费改善供给但激化党内政变风险。</div>';

  // 派系天平双色进度条
  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🛡️ 保守派 ' + sun.conservative.toFixed(0) + ' (' + cPct + '%)</span>';
  h += '    <span class="pdb-lbl-right">🕊️ 改革派 ' + sun.reformist.toFixed(0) + ' (' + rPct + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + cPct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + rPct + '%"></div>';
  h += '  </div>';
  h += '</div>';

  // 短缺与动荡指标
  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📦 轻工商品短缺指数</span><span class="pdb-meter-val" style="color:' + (shortageClass==='danger'?'#f87171':shortageClass==='warn'?'#fbbf24':'#4ade80') + '">' + sun.shortage.toFixed(1) + ' · ' + shortageDesc + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + shortageClass + '" style="width:' + sun.shortage + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡与工潮指数</span><span class="pdb-meter-val" style="color:' + (unrestClass==='danger'?'#f87171':unrestClass==='warn'?'#fbbf24':'#4ade80') + '">' + sun.unrest.toFixed(1) + (sun.unrest > 30 ? '（引发经济脱节拖累）' : '（安定）') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + sun.unrest + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (sun.crisisWarning) {
    h += '<div class="pdb-alert">' + sun.crisisWarning + '</div>';
  }

  // 如果当前玩家控制苏联，展示微调操作按钮
  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="rebalance_consumer">🛒 倾斜轻工业消费品</button>';
    h += '  <button class="pdb-act-btn" data-act="placate_vpk">🎖️ 安抚军工复合体</button>';
    h += '</div>';
  }
  return h;
}

// G（收尾评审）：refreshDomesticBox 的「美国」分支抽为独立构建器（原样搬运，无逻辑改动）
function domesticUsaHtml(isMine) {
  let h = "";
  // 美国 (USA) 界面
  const usa = ST.domestic.usa;
  let congClass = usa.congressApproval >= 55 ? "good" : usa.congressApproval >= 45 ? "warn" : "danger";
  let presClass = usa.presidentialApproval >= 55 ? "good" : usa.presidentialApproval >= 45 ? "warn" : "danger";

  h += '<div class="pdb-title"><span>🏛️ 国会两党与大选宪政</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '宪政体制') + '</span></div>';
  h += '<div class="pdb-desc">三权分立与四年一度大选对白宫战略决策形成刚性宪政制约。巨额财政赤字或海外干预泥潭将侵蚀国会批准率，触发《格拉姆-拉德曼法案》军费预算帽强制冻结。</div>';

  // 徽章区：预算帽与大选倒计时
  h += '<div class="pdb-badge-row">';
  if (usa.budgetCapActive) {
    h += '  <span class="pdb-badge cap-alert">⚠️ 《格拉姆-拉德曼法案》预算帽生效中（军费≤6%）</span>';
  } else {
    h += '  <span class="pdb-badge cap-ok">✓ 财政预算帽未激活（赤字受控）</span>';
  }
  h += '  <span class="pdb-badge election">🗳️ ' + usa.nextElectionYear + ' 总统大选周期</span>';
  h += '</div>';

  if (usa.electionResult) {
    h += '<div class="pdb-status-pill">' + usa.electionResult + '</div>';
  }

  // 国会支持率与总统民调进度条
  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📜 两党国会批准率</span><span class="pdb-meter-val">' + usa.congressApproval.toFixed(1) + '% (预算帽阈值 45%)</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + congClass + '" style="width:' + usa.congressApproval + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📊 白宫总统民意支持率</span><span class="pdb-meter-val">' + usa.presidentialApproval.toFixed(1) + '%</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + presClass + '" style="width:' + usa.presidentialApproval + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="compromise_budget" style="grid-column: span 2">🤝 两党预算妥协（拉升支持率/平抑军费）</button>';
    h += '</div>';
  }
  return h;
}

// G（收尾评审）：refreshDomesticBox 的「中国」分支抽为独立构建器（原样搬运，无逻辑改动）
function domesticChnHtml(isMine) {
  let h = "";
  // E（玩法评审）：中国 (CHN) 改革开放期双轨制专属面板
  const chn = ST.domestic.chn;
  const rPct = Math.round((chn.reformist / (chn.reformist + chn.planned)) * 100);
  const pPct = 100 - rPct;
  const priceClass = chn.dualTrackPrice >= 70 ? "danger" : chn.dualTrackPrice >= 45 ? "warn" : "good";
  const unrestClass = chn.unrest >= 30 ? "danger" : chn.unrest >= 15 ? "warn" : "good";
  const sezClass = chn.sezMomentum >= 60 ? "good" : chn.sezMomentum >= 30 ? "warn" : "danger";
  const extClass = chn.externalStress >= 55 ? "danger" : chn.externalStress >= 35 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 改革开放 · 双轨制博弈</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '大国体制') + '</span></div>';
  h += '<div class="pdb-desc">特区/市场派与计划/国营派围绕改革节奏拉锯。高军费强化计划派并推高双轨物价扭曲；低军费释放特区动能、逐步理顺价格，但需防范民生冲击。</div>';

  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🏭 计划/国营派 ' + chn.planned.toFixed(0) + ' (' + pPct + '%)</span>';
  h += '    <span class="pdb-lbl-right">🏙️ 特区/市场派 ' + chn.reformist.toFixed(0) + ' (' + rPct + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + pPct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + rPct + '%"></div>';
  h += '  </div>';
  h += '</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">💰 双轨物价扭曲度</span><span class="pdb-meter-val" style="color:' + (priceClass === 'danger' ? '#f87171' : priceClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + chn.dualTrackPrice.toFixed(1) + (chn.dualTrackPrice >= 70 ? ' · 倒卖套利猖獗' : chn.dualTrackPrice >= 45 ? ' · 价格双轨摩擦' : ' · 价格趋近并轨') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + priceClass + '" style="width:' + chn.dualTrackPrice + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🚀 特区开放动能</span><span class="pdb-meter-val" style="color:' + (sezClass === 'danger' ? '#f87171' : sezClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + chn.sezMomentum.toFixed(1) + ' · 外向型增长弹性</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + sezClass + '" style="width:' + chn.sezMomentum + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val" style="color:' + (unrestClass === 'danger' ? '#f87171' : unrestClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + chn.unrest.toFixed(1) + (chn.unrest >= 30 ? '（引发生产脱节拖累）' : '（安定）') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + chn.unrest + '%"></div></div>';
  h += '  </div>';
  // H（玩法深度）：外部环境压力（禁运/外汇/能源缺口 → 内政压力）
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🌐 外部环境压力（禁运/外汇）</span><span class="pdb-meter-val" style="color:' + (extClass === 'danger' ? '#f87171' : extClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + chn.externalStress.toFixed(1) + (chn.externalStress >= 55 ? ' · 封锁压制改革动能' : chn.externalStress >= 35 ? ' · 外部环境趋紧' : ' · 外部环境可控') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + extClass + '" style="width:' + chn.externalStress + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="chn_expand_sez">🏙️ 扩大特区开放（推高市场派与动能）</button>';
    h += '  <button class="pdb-act-btn" data-act="chn_price_reform">💰 推进价格并轨（压双轨扭曲/冒民生风险）</button>';
    h += '</div>';
  }
  return h;
}

// G（收尾评审）：refreshDomesticBox 的「西德」分支抽为独立构建器（原样搬运，无逻辑改动）
function domesticDeuHtml(isMine) {
  let h = "";
  // E（玩法评审）：西德 (DEU) 新东方政策与换届专属面板
  const deu = ST.domestic.deu;
  const sPct = Math.round((deu.spdApproval / (deu.spdApproval + deu.cduApproval)) * 100);
  const cPct2 = 100 - sPct;
  const detClass = deu.detenteDepth >= 65 ? "good" : deu.detenteDepth >= 40 ? "warn" : "danger";
  const burdenClass = deu.natoBurden >= 65 ? "warn" : "good";
  const pipeClass = deu.pipelineDependency >= 60 ? "danger" : deu.pipelineDependency >= 35 ? "warn" : "good";
  const epClass = deu.energyPressure >= 50 ? "danger" : deu.energyPressure >= 35 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 新东方政策 · 波恩联合政府</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '宪政体制') + '</span></div>';
  h += '<div class="pdb-desc">身处冷战对抗前沿：社民党主张缓和与东方贸易，基民盟强调北约义务。军费抬升加重北约分担并激化反核民意；克制军费换取缓和红利，但加深对苏能源管道依赖。</div>';

  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🕊️ 社民党 SPD ' + deu.spdApproval.toFixed(0) + ' (' + sPct + '%)</span>';
  h += '    <span class="pdb-lbl-right">🛡️ 基民盟 CDU ' + deu.cduApproval.toFixed(0) + ' (' + cPct2 + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + sPct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + cPct2 + '%"></div>';
  h += '  </div>';
  h += '</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🤝 东西欧缓和深度</span><span class="pdb-meter-val" style="color:' + (detClass === 'danger' ? '#f87171' : detClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + deu.detenteDepth.toFixed(1) + ' · 外交回旋空间</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + detClass + '" style="width:' + deu.detenteDepth + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🛡️ 北约防务义务分担度</span><span class="pdb-meter-val" style="color:' + (burdenClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + deu.natoBurden.toFixed(1) + '%</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + burdenClass + '" style="width:' + deu.natoBurden + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🛢️ 对苏能源管道依赖度</span><span class="pdb-meter-val" style="color:' + (pipeClass === 'danger' ? '#f87171' : pipeClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + deu.pipelineDependency.toFixed(1) + (deu.pipelineDependency >= 60 ? '（能源杠杆风险）' : '') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + pipeClass + '" style="width:' + deu.pipelineDependency + '%"></div></div>';
  h += '  </div>';
  // H（玩法深度）：能源供应压力（油气通道受阻 + 巴统封锁 + 制裁 → 内政压力）
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">⚡ 能源供应压力</span><span class="pdb-meter-val" style="color:' + (epClass === 'danger' ? '#f87171' : epClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + deu.energyPressure.toFixed(1) + (deu.energyPressure >= 50 ? ' · 工业成本攀升' : deu.energyPressure >= 35 ? ' · 供应趋紧' : ' · 供应稳定') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + epClass + '" style="width:' + deu.energyPressure + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="deu_ostpolitik">🤝 深化新东方政策（推高缓和与管道依赖）</button>';
    h += '  <button class="pdb-act-btn" data-act="deu_nato_pledge">🛡️ 重申北约防务承诺（抬负担/压缓和）</button>';
    h += '</div>';
  }
  return h;
}

// K（玩法深度）：日本 (JPN) 技术立国与内需转型专属面板
function domesticJpnHtml(isMine) {
  let h = "";
  const jpn = ST.domestic.jpn;
  const dPct = Math.round((jpn.domesticist / (jpn.domesticist + jpn.exportist)) * 100);
  const ePct = 100 - dPct;
  const fricClass = jpn.tradeFriction >= 60 ? "danger" : jpn.tradeFriction >= 40 ? "warn" : "good";
  const unrestClass = jpn.unrest >= 30 ? "danger" : jpn.unrest >= 15 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 技术立国 · 外需与内需之争</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '大国体制') + '</span></div>';
  h += '<div class="pdb-desc">出口产业派主张以半导体与精密制造继续扩张外需，内需开放派主张主动收窄顺差、扩大内需以化解贸易摩擦。摩擦压力越高，民意越偏向内需转型，但产业调整期社会张力上升。</div>';

  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🚢 出口产业派 ' + jpn.exportist.toFixed(0) + ' (' + ePct + '%)</span>';
  h += '    <span class="pdb-lbl-right">🏙️ 内需开放派 ' + jpn.domesticist.toFixed(0) + ' (' + dPct + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + ePct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + dPct + '%"></div>';
  h += '  </div>';
  h += '</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🌐 对美贸易摩擦压力</span><span class="pdb-meter-val" style="color:' + (fricClass === 'danger' ? '#f87171' : fricClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + jpn.tradeFriction.toFixed(1) + (jpn.tradeFriction >= 60 ? ' · 出口通道受阻' : jpn.tradeFriction >= 40 ? ' · 摩擦升温' : ' · 摩擦可控') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + fricClass + '" style="width:' + jpn.tradeFriction + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val" style="color:' + (unrestClass === 'danger' ? '#f87171' : unrestClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + jpn.unrest.toFixed(1) + (jpn.unrest >= 30 ? '（引发生产脱节拖累）' : '（安定）') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + jpn.unrest + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="jpn_domestic_demand">🏙️ 扩大内需开放（推高内需派/压摩擦）</button>';
    h += '  <button class="pdb-act-btn" data-act="jpn_export_push">🚢 坚持出口立国（推高出口派/摩擦升温）</button>';
    h += '</div>';
  }
  return h;
}

// K（玩法深度）：法国 (FRA) 国家干预与紧缩转向专属面板
function domesticFraHtml(isMine) {
  let h = "";
  const fra = ST.domestic.fra;
  const dPct = Math.round((fra.dirigiste / (fra.dirigiste + fra.rigueur)) * 100);
  const rPct = 100 - dPct;
  const francClass = fra.francStrength >= 60 ? "good" : fra.francStrength >= 40 ? "warn" : "danger";
  const extClass = fra.externalPressure >= 50 ? "danger" : fra.externalPressure >= 35 ? "warn" : "good";
  const unrestClass = fra.unrest >= 30 ? "danger" : fra.unrest >= 15 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 国家干预 · 法郎平价之争</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '宪政体制') + '</span></div>';
  h += '<div class="pdb-desc">国家干预派以国有化与产业政策打造「国家冠军」，紧缩坚挺派主张冻结工资物价、削减赤字以守住法郎平价。外部约束（资本外逃、油气受阻、巴统封锁）越强，越被迫转向紧缩；法郎走强又反过来缓解外部压力。</div>';

  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🏭 国家干预派 ' + fra.dirigiste.toFixed(0) + ' (' + dPct + '%)</span>';
  h += '    <span class="pdb-lbl-right">💱 紧缩坚挺派 ' + fra.rigueur.toFixed(0) + ' (' + rPct + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + dPct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + rPct + '%"></div>';
  h += '  </div>';
  h += '</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">💱 法郎平价与外部竞争力</span><span class="pdb-meter-val" style="color:' + (francClass === 'danger' ? '#f87171' : francClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + fra.francStrength.toFixed(1) + (fra.francStrength >= 60 ? ' · 坚挺' : fra.francStrength >= 40 ? ' · 承压' : ' · 资本外逃') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + francClass + '" style="width:' + fra.francStrength + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🌐 外部环境压力</span><span class="pdb-meter-val" style="color:' + (extClass === 'danger' ? '#f87171' : extClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + fra.externalPressure.toFixed(1) + (fra.externalPressure >= 50 ? ' · 被迫转向紧缩' : fra.externalPressure >= 35 ? ' · 外部约束趋紧' : ' · 外部环境可控') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + extClass + '" style="width:' + fra.externalPressure + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val" style="color:' + (unrestClass === 'danger' ? '#f87171' : unrestClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + fra.unrest.toFixed(1) + (fra.unrest >= 30 ? '（引发生产脱节拖累）' : '（安定）') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + fra.unrest + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="fra_industrial_policy">🏭 扩大国有化与产业政策（推高干预派）</button>';
    h += '  <button class="pdb-act-btn" data-act="fra_hard_franc">💱 紧缩坚挺守住法郎（推高紧缩派/冒民怨）</button>';
    h += '</div>';
  }
  return h;
}

// K（玩法深度）：英国 (GBR) 撒切尔主义与福利共识专属面板
function domesticGbrHtml(isMine) {
  let h = "";
  const gbr = ST.domestic.gbr;
  const mPct = Math.round((gbr.monetarist / (gbr.monetarist + gbr.welfarist)) * 100);
  const wPct = 100 - mPct;
  const inflClass = gbr.inflation >= 65 ? "danger" : gbr.inflation >= 45 ? "warn" : "good";
  const cityClass = gbr.cityStrength >= 60 ? "good" : gbr.cityStrength >= 40 ? "warn" : "danger";
  const unrestClass = gbr.unrest >= 30 ? "danger" : gbr.unrest >= 15 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 撒切尔主义 · 通胀与共识之争</span><span class="pdb-tag ' + (isMine ? 'highlight' : '') + '">' + (isMine ? '★ 直辖执政' : '宪政体制') + '</span></div>';
  h += '<div class="pdb-desc">货币主义派以严控货币供应量压平通胀预期，宁付失业代价也要重建财政纪律；福利共识派主张维持战后需求管理与社会保障。通胀压力决定民意归属，货币主义执政又反过来锚定通胀、抬升金融城竞争力。</div>';

  h += '<div class="pdb-balance-wrap">';
  h += '  <div class="pdb-balance-labels">';
  h += '    <span class="pdb-lbl-left">🤝 福利共识派 ' + gbr.welfarist.toFixed(0) + ' (' + wPct + '%)</span>';
  h += '    <span class="pdb-lbl-right">📉 货币主义派 ' + gbr.monetarist.toFixed(0) + ' (' + mPct + '%)</span>';
  h += '  </div>';
  h += '  <div class="pdb-balance-bar">';
  h += '    <div class="pdb-bar-seg-left" style="width:' + wPct + '%"></div>';
  h += '    <div class="pdb-bar-seg-right" style="width:' + mPct + '%"></div>';
  h += '  </div>';
  h += '</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">📈 通胀压力</span><span class="pdb-meter-val" style="color:' + (inflClass === 'danger' ? '#f87171' : inflClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + gbr.inflation.toFixed(1) + (gbr.inflation >= 65 ? ' · 恶性通胀' : gbr.inflation >= 45 ? ' · 通胀偏高' : ' · 通胀受控') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + inflClass + '" style="width:' + gbr.inflation + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🏛️ 金融城与服务业竞争力</span><span class="pdb-meter-val" style="color:' + (cityClass === 'danger' ? '#f87171' : cityClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + gbr.cityStrength.toFixed(1) + ' · 离岸金融与服务业深度</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + cityClass + '" style="width:' + gbr.cityStrength + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val" style="color:' + (unrestClass === 'danger' ? '#f87171' : unrestClass === 'warn' ? '#fbbf24' : '#4ade80') + '">' + gbr.unrest.toFixed(1) + (gbr.unrest >= 30 ? '（引发生产脱节拖累）' : '（安定）') + '</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + gbr.unrest + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="gbr_tight_money">📉 坚持货币主义紧缩（推高货币派/压通胀）</button>';
    h += '  <button class="pdb-act-btn" data-act="gbr_welfare_compromise">🤝 回归福利共识妥协（推高共识派/通胀抬头）</button>';
    h += '</div>';
  }
  return h;
}

// G（收尾评审）：refreshDomesticBox 的「通用」分支抽为独立构建器（原样搬运，无逻辑改动）
function domesticGenericHtml(actualKey, isMine) {
  let h = "";
  // 通用国家 (Generals)
  const gen = getGeneralDomestic(actualKey);
  let stabClass = gen.stability >= 70 ? "good" : gen.stability >= 45 ? "warn" : "danger";
  let unrestClass = gen.unrest >= 35 ? "danger" : gen.unrest >= 15 ? "warn" : "good";

  h += '<div class="pdb-title"><span>🏛️ 内政稳定与执政合法性</span><span class="pdb-tag">' + (isMine ? '★ 本国' : '地方政权') + '</span></div>';
  h += '<div class="pdb-desc">政权稳定性直接决定社会生产秩序与民生凝聚力。长期遭受外国单边经济制裁或断油危机将直接消耗安定度并诱发社会动荡。</div>';

  h += '<div class="pdb-meters">';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">⚖️ 民生安定度</span><span class="pdb-meter-val">' + gen.stability.toFixed(1) + '%</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + stabClass + '" style="width:' + gen.stability + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🕊️ 执政合法性</span><span class="pdb-meter-val">' + gen.legitimacy.toFixed(1) + '%</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill blue" style="width:' + gen.legitimacy + '%"></div></div>';
  h += '  </div>';
  h += '  <div class="pdb-meter">';
  h += '    <div class="pdb-meter-row"><span class="pdb-meter-lbl">🔥 社会动荡指数</span><span class="pdb-meter-val">' + gen.unrest.toFixed(1) + '%</span></div>';
  h += '    <div class="pdb-meter-track"><div class="pdb-meter-fill ' + unrestClass + '" style="width:' + gen.unrest + '%"></div></div>';
  h += '  </div>';
  h += '</div>';

  const isSan = ST.sanctions.some((s) => s.t === actualKey);
  if (isSan) {
    h += '<div class="pdb-alert">⚠️ 该国正遭受外部单边经济制裁，民生与储备承压消耗中。</div>';
  }
  // L（参与感）：通用实体也能施政 —— 三条路线共用同一份政治资本，各有明确代价
  if (isMine) {
    h += '<div class="pdb-actions">';
    h += '  <button class="pdb-act-btn" data-act="gen_austerity">💼 财政紧缩（合法性↑ / 民生↓）</button>';
    h += '  <button class="pdb-act-btn" data-act="gen_welfare">🛒 扩大社会福利（安定↑ / 合法性↓）</button>';
    h += '  <button class="pdb-act-btn" data-act="gen_crackdown">🚨 强化治安管制（压动荡 / 合法性↓↓）</button>';
    h += '</div>';
  }
  return h;
}
