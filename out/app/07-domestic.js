"use strict";


// ---- R14: 钢铁雄心4风格大国领袖肖像与执政理念卡片 ----
function refreshLeaderCard(selKey) {
  const card = $("p-leader-card");
  if (!card) return;
  if (!selKey || !window.W1980_ASSETS) {
    card.style.display = "none";
    card.innerHTML = "";
    return;
  }
  const actualKey = resolvePlayableKey(selKey);
  const curY = SIM.S ? SIM.S.year : 1980;
  const leader = window.W1980_ASSETS.getLeader(actualKey, curY);

  if (!leader) {
    card.style.display = "none";
    card.innerHTML = "";
    return;
  }

  card.style.display = "flex";
  let html = '<div class="p-leader-frame">' +
    '<img src="' + leader.photo + '" alt="' + leader.name + '" onerror="this.style.display=\'none\'">' +
    '</div>' +
    '<div class="p-leader-info">' +
    '<div class="p-leader-name"><span>' + leader.name + '</span><span class="p-leader-en">' + (leader.en || "") + '</span></div>' +
    '<div class="p-leader-title">' + leader.title + '</div>' +
    '<div class="p-leader-ideology">' + leader.ideology + '</div>' +
    (leader.quote ? '<div class="p-leader-quote">' + leader.quote + '</div>' : '') +
    '</div>';

  card.innerHTML = html;
}

function refreshOverviewCard(selKey) {
  const card = $("p-overview-card");
  if (!card) return;
  if (!selKey) { card.innerHTML = ""; return; }
  const actualKey = resolvePlayableKey(selKey);
  const c = CM.countries[actualKey] || {};
  const isMine = !!ST.player && actualKey === ST.player;

  let h = '<div class="poc-title"><span>🏛️ 态势综述</span>' +
    '<span class="poc-tag ' + (isMine ? 'mine' : 'other') + '">' +
    (isMine ? '★ 本国直辖' : (ST.player ? '外邦实体' : '世界实体')) + '</span></div>';

  let desc = "";
  if (isMine) {
    desc = "本国处于最高统帅直辖状态。通过各治理模块可调节防务军费、审定战略物资储备及阵营归属。";
  } else if (!ST.player) {
    desc = "当前处于旁观者观察模式。可将该国设为本国以执掌其军政大权与外交走向。";
  } else {
    desc = "该国为外部地缘实体。可通过对外制裁或军援施加影响，亦可在外交面板查看其 AI 战略性格。";
  }
  h += '<div class="poc-desc">' + desc + '</div>';

  // 快捷直达导航
  h += '<div class="poc-navs">' +
    '<button class="poc-nav-btn" data-go="defense"><span>⚖️ 防务与干预</span><span class="arr">▸</span></button>' +
    '<button class="poc-nav-btn" data-go="economy"><span>🚢 经贸与储备</span><span class="arr">▸</span></button>' +
    '<button class="poc-nav-btn" data-go="diplomacy"><span>🌐 外交与阵营</span><span class="arr">▸</span></button>' +
    (!isMine ? '<button class="poc-nav-btn" data-go="setmine"><span style="color:var(--gold2)">★ 设为本国</span><span class="arr">▸</span></button>' :
               '<button class="poc-nav-btn" data-go="defense"><span style="color:#7bc67e">✓ 统帅执政中</span><span class="arr">▸</span></button>') +
    '</div>';

  // 预警汇总
  const alerts = [];
  const now = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;
  const isIranIraqActive = now >= (1980 * 12 + 9) && now <= (1988 * 12 + 8) && !(CR.deny && CR.deny.has("iran_iraq_war"));
  const isFalklandsActive = now >= (1982 * 12 + 4) && now <= (1983 * 12 + 6);
  const isGulfActive = now >= (1990 * 12 + 8) && now <= (1991 * 12 + 12);
  if ((isIranIraqActive && (actualKey === "IRQ" || actualKey === "IRN")) ||
      (isFalklandsActive && (actualKey === "GBR" || actualKey === "ARG")) ||
      (isGulfActive && (actualKey === "IRQ" || actualKey === "KWT" || actualKey === "USA"))) {
    alerts.push('<div class="poc-alert-item war">⚔️ 卷入局部热点交战，前线推演中</div>');
  }
  const rdata = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(actualKey)) || null;
  if (rdata && rdata.summary && rdata.summary.securityScore < 0) {
    alerts.push('<div class="poc-alert-item warn">⚠️ 战略资源安全度评级处于逆差受制区间</div>');
  }
  if (alerts.length > 0) {
    h += '<div class="poc-alerts">' + alerts.join("") + '</div>';
  }

  card.innerHTML = h;

  // 绑定快捷跳转按钮
  card.querySelectorAll(".poc-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const go = btn.dataset.go;
      if (go === "setmine") {
        setPlayer(actualKey);
        setPanelTab("defense");
      } else if (go) {
        setPanelTab(go);
      }
    });
  });
}

// ---- R12A: 大国内政生态与派系权力天平系统 ----
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

function sanitizeDomesticState(d) {
  const fresh = {
    sun: { conservative: 55, reformist: 45, shortage: 28, unrest: 5, crisisWarning: null },
    usa: { congressApproval: 62, presidentialApproval: 58, nextElectionYear: 1984, electionResult: null, budgetCapActive: false, unrest: 2 },
    // E：CHN/DEU 专属内政（与 initDomesticState 同构）
    chn: { reformist: 52, planned: 48, dualTrackPrice: 35, unrest: 3, sezMomentum: 40, externalStress: 20 },
    deu: { spdApproval: 55, cduApproval: 45, detenteDepth: 60, natoBurden: 50, pipelineDependency: 30, energyPressure: 24, unrest: 2 },
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
  if (dom.generals) updateDomesticGenerals(dom, y, m, silent);
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
    if (sun.shortage > 65) {
      sun.unrest = clamp(sun.unrest + 0.45, 0, 100);
    } else if (sun.shortage > 80) {
      sun.unrest = clamp(sun.unrest + 0.75, 0, 100);
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
    const gUSA = growthOf(entKeys("USA"));
    if (gUSA !== null && gUSA > 0.025) {
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
  }
  refreshDomesticBox(ST.sel);
  applyPlayerDecisions();
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
  else h = domesticGenericHtml(actualKey, isMine);

  box.innerHTML = h;

  // 绑定动作按钮事件
  box.querySelectorAll(".pdb-act-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      if (act) applyDomesticPlayerAction(act);
    });
  });
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
  return h;
}


// ---- R12B: 次极大国专属国家议程与战略路线系统 ----
function initAgendaState(cKey) {
  if (cKey) {
    if (!ST.agendas) ST.agendas = {};
    ST.agendas[cKey] = {
      active: null,
      progress: 0,
      completed: [],
      bonuses: {
        gdpBonus: 0,
        reserveMonthly: 0,
        decoupleImmunity: false,
        domesticShortage: 0,
        stabilityBonus: 0,
        techSecurity: 0,
        congressBonus: 0
      }
    };
    return ST.agendas[cKey];
  }
  ST.agendas = {};
}

function getAgendaState(cKey) {
  if (!ST.agendas) initAgendaState();
  if (!ST.agendas[cKey]) {
    initAgendaState(cKey);
  }
  return ST.agendas[cKey];
}

function calcAgendaBonuses(cKey) {
  const bonuses = {
    gdpBonus: 0,
    reserveMonthly: 0,
    decoupleImmunity: false,
    domesticShortage: 0,
    stabilityBonus: 0,
    techSecurity: 0,
    congressBonus: 0
  };
  if (!ST.agendas || !ST.agendas[cKey]) return bonuses;
  const state = ST.agendas[cKey];
  const list = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
  if (Array.isArray(state.completed)) {
    for (let i = 0; i < state.completed.length; i++) {
      const agId = state.completed[i];
      const ag = list.find((a) => a.id === agId);
      if (ag && ag.effects) {
        if (typeof ag.effects.gdpBonus === "number") bonuses.gdpBonus += ag.effects.gdpBonus;
        if (typeof ag.effects.reserveMonthly === "number") bonuses.reserveMonthly += ag.effects.reserveMonthly;
        if (ag.effects.decoupleImmunity) bonuses.decoupleImmunity = true;
        if (typeof ag.effects.domesticShortage === "number") bonuses.domesticShortage += ag.effects.domesticShortage;
        if (typeof ag.effects.stabilityBonus === "number") bonuses.stabilityBonus += ag.effects.stabilityBonus;
        if (typeof ag.effects.techSecurity === "number") bonuses.techSecurity += ag.effects.techSecurity;
        if (typeof ag.effects.congressBonus === "number") bonuses.congressBonus += ag.effects.congressBonus;
      }
    }
  }
  bonuses.gdpBonus = +bonuses.gdpBonus.toFixed(3);
  bonuses.reserveMonthly = +bonuses.reserveMonthly.toFixed(2);
  return bonuses;
}

function sanitizeAgendaState(d) {
  const fresh = {};
  if (!d || typeof d !== "object") return fresh;
  for (const k in d) {
    const item = d[k];
    if (item && typeof item === "object") {
      const active = (typeof item.active === "string") ? item.active : null;
      const progress = clamp(typeof item.progress === "number" ? item.progress : 0, 0, 100);
      const completed = Array.isArray(item.completed) ? item.completed.filter((id) => typeof id === "string") : [];
      fresh[k] = {
        active: active,
        progress: progress,
        completed: completed,
        bonuses: {
          gdpBonus: 0,
          reserveMonthly: 0,
          decoupleImmunity: false,
          domesticShortage: 0,
          stabilityBonus: 0,
          techSecurity: 0,
          congressBonus: 0
        }
      };
    }
  }
  for (const k in fresh) {
    fresh[k].bonuses = calcAgendaBonuses(k);
  }
  return fresh;
}

function checkAgendaCondition(cKey, ag) {
  if (!ag) return { ok: false, reason: "无效议程" };
  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

  // 年代要求
  if (typeof ag.yearMin === "number") {
    const mMin = ag.monthMin || 1;
    if (curY < ag.yearMin || (curY === ag.yearMin && curM < mMin)) {
      return { ok: false, reason: "尚未到达启动年代 (" + ag.yearMin + "年" + (ag.monthMin ? ag.monthMin + "月" : "") + ")" };
    }
  }

  // 前置议程要求
  if (ag.requires) {
    const state = getAgendaState(cKey);
    if (!state.completed.includes(ag.requires)) {
      const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
      const reqAg = agList.find((a) => a.id === ag.requires);
      const reqTitle = reqAg ? reqAg.title : ag.requires;
      return { ok: false, reason: "需先达成前置议程【" + reqTitle + "】" };
    }
  }

  // 结构性国策条件
  if (ag.condition) {
    let curMil = 0;
    if (cKey === ST.player) {
      curMil = ST.mil;
    } else if (ST.ai && ST.ai.decisions && ST.ai.decisions[cKey] && typeof ST.ai.decisions[cKey].mil === "number") {
      curMil = ST.ai.decisions[cKey].mil;
    } else {
      const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(cKey, CM.countries[cKey]) : null;
      curMil = doc ? doc.baseMil : 2.5;
    }

    if (ag.condition === "mil_le_3" && curMil > 3.0) {
      return { ok: false, reason: "国防军费必须 ≤ 3.0%（当前 " + curMil.toFixed(1) + "%）" };
    }
    if (ag.condition === "mil_le_1" && curMil > 1.0) {
      return { ok: false, reason: "专守防卫军费红线必须 ≤ 1.0%（当前 " + curMil.toFixed(1) + "%）" };
    }
    if (ag.condition === "mil_ge_5" && curMil < 5.0) {
      return { ok: false, reason: "天基尖端军备研发要求军费 ≥ 5.0%（当前 " + curMil.toFixed(1) + "%）" };
    }
  }

  return { ok: true, reason: "" };
}

function startAgenda(cKey, agendaId) {
  if (!cKey || !agendaId) return false;
  const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
  const ag = agList.find((a) => a.id === agendaId);
  if (!ag) return false;
  const cond = checkAgendaCondition(cKey, ag);
  if (!cond.ok) return false;
  const state = getAgendaState(cKey);
  if (state.completed.includes(agendaId)) return false;
  if (state.active) return false; // 每次只能推进一项
  state.active = agendaId;
  state.progress = 0;
  if (ST.sel) refreshAgendaBox(ST.sel);
  return true;
}

function updateMonthlyAgendas(y, m, silent) {
  if (!ST.agendas) initAgendaState();

  // 1. AI 决策推进：如果 AI 激活且玩家已选国（仅玩家局，杜绝旁观模式产生漂移）
  if (isAIActive()) {
    const aiMajors = ["CHN", "JPN", "DEU", "FRA", "GBR", "SUN", "USA"];
    for (let i = 0; i < aiMajors.length; i++) {
      const maj = aiMajors[i];
      if (maj === ST.player) continue;
      const majState = getAgendaState(maj);
      if (!majState.active) {
        const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(maj) : [];
        for (let j = 0; j < agList.length; j++) {
          const cand = agList[j];
          if (!majState.completed.includes(cand.id) && checkAgendaCondition(maj, cand).ok) {
            startAgenda(maj, cand.id);
            break;
          }
        }
      }
    }
  }

  // 2. 推进所有当前激活中的议程
  for (const cKey in ST.agendas) {
    const state = ST.agendas[cKey];
    if (!state || !state.active) continue;
    const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(cKey) : [];
    const ag = agList.find((a) => a.id === state.active);
    if (!ag) { state.active = null; continue; }

    const dur = ag.duration || 12;
    state.progress = +(state.progress + 100 / dur).toFixed(2);
    if (state.progress >= 99.99) {
      state.progress = 100;
      if (!state.completed.includes(ag.id)) {
        state.completed.push(ag.id);
      }
      state.active = null;
      state.bonuses = calcAgendaBonuses(cKey);

      // 即时效果渗透至内政与安定度
      if (ag.effects) {
        if (typeof ag.effects.domesticShortage === "number" && ST.domestic) {
          if (cKey === "SUN" && ST.domestic.sun) {
            ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage + ag.effects.domesticShortage, 0, 100);
          }
        }
        if (typeof ag.effects.stabilityBonus === "number" && ST.domestic) {
          if (cKey === "SUN" && ST.domestic.sun) {
            ST.domestic.sun.unrest = clamp(ST.domestic.sun.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (cKey === "USA" && ST.domestic.usa) {
            ST.domestic.usa.unrest = clamp(ST.domestic.usa.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (ST.domestic.generals && ST.domestic.generals[cKey]) {
            ST.domestic.generals[cKey].stability = clamp(ST.domestic.generals[cKey].stability + ag.effects.stabilityBonus, 0, 100);
          }
        }
        if (typeof ag.effects.congressBonus === "number" && cKey === "USA" && ST.domestic && ST.domestic.usa) {
          ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval + ag.effects.congressBonus, 0, 100);
        }
      }

      // 若为玩家执政国，刷新决策并派发通知
      if (cKey === ST.player) {
        applyPlayerDecisions();
        if (!silent) {
          showToast("🎯 战略议程达成：【" + ag.title + "】！" + (ag.effects.desc || ""));
          EV.items.push({
            y: y,
            m: m,
            zh: "🎯 战略议程达成 · " + ag.title,
            note: (CM.countries[cKey] || {}).zh + " 已圆满达成专属国家战略议程【" + ag.title + "】！" + (ag.effects.desc || "")
          });
          EV.unread++;
          renderInbox();
        }
      }
    }
  }

  // 3. 外汇顺差流加成按月结算
  if (ST.reserves) {
    for (const cKey in ST.agendas) {
      const b = ST.agendas[cKey].bonuses;
      if (b && b.reserveMonthly && ST.reserves[cKey]) {
        ST.reserves[cKey].usd = +(ST.reserves[cKey].usd + b.reserveMonthly).toFixed(2);
      }
    }
  }

  if (ST.sel) refreshAgendaBox(ST.sel);
}

function refreshAgendaBox(selKey) {
  const box = $("p-agenda-box");
  if (!box) return;
  if (!selKey) { box.innerHTML = ""; return; }
  if (!ST.agendas) initAgendaState();

  const actualKey = resolvePlayableKey(selKey);
  const agList = window.W1980_AGENDAS ? window.W1980_AGENDAS.getAgendasForCountry(actualKey) : [];
  if (!agList || agList.length === 0) {
    box.innerHTML = "";
    return;
  }

  const state = getAgendaState(actualKey);
  const isMine = !!ST.player && actualKey === ST.player;
  const cZh = (CM.countries[actualKey] || {}).zh || actualKey;

  let h = "";
  h += '<div class="agh"><span>🎯 专属战略议程与国家路线</span><span style="font-size:9.5px;color:var(--dim);font-weight:400">' + (isMine ? '★ 执政顶层规划' : (cZh + ' 战略路线')) + '</span></div>';
  h += '<div class="ag-list">';

  for (let i = 0; i < agList.length; i++) {
    const ag = agList[i];
    const isDone = state.completed.includes(ag.id);
    const isActive = state.active === ag.id;
    const cond = checkAgendaCondition(actualKey, ag);

    let cardClass = "ag-card";
    if (isActive) cardClass += " active";
    if (isDone) cardClass += " completed";

    let badgeHtml = "";
    if (isDone) {
      badgeHtml = '<span class="ag-badge done">✓ 已达成</span>';
    } else if (isActive) {
      badgeHtml = '<span class="ag-badge progress">⏳ 推进中 (' + Math.round(state.progress) + '%)</span>';
    } else {
      badgeHtml = '<span class="ag-badge idle">待启动</span>';
    }

    h += '<div class="' + cardClass + '">';
    h += '  <div class="ag-head">';
    h += '    <div class="ag-title-wrap"><span class="ag-icon">' + (ag.icon || '📌') + '</span><span class="ag-title">' + ag.title + '</span></div>';
    h += '    ' + badgeHtml;
    h += '  </div>';
    h += '  <div class="ag-desc">' + ag.desc + '</div>';
    h += '  <div class="ag-effects">战略红利：' + (ag.effects.desc || '') + '</div>';

    if (!isDone) {
      const condOkStyle = cond.ok ? 'style="color:var(--dim);background:none;padding:0"' : '';
      h += '  <div class="ag-condition" ' + condOkStyle + '>📋 前置要求：' + (ag.conditionDesc || '无') + (!cond.ok ? ' (' + cond.reason + ')' : '') + '</div>';
    }

    if (isActive) {
      h += '  <div class="ag-prog-wrap">';
      h += '    <div class="ag-prog-meta"><span>推进进度（预计 ' + (ag.duration || 12) + ' 个月）</span><span>' + Math.round(state.progress) + '%</span></div>';
      h += '    <div class="ag-prog-bar"><div class="ag-prog-fill" style="width:' + state.progress + '%"></div></div>';
      h += '  </div>';
    } else if (isDone) {
      h += '  <div class="ag-prog-wrap">';
      h += '    <div class="ag-prog-meta"><span>战略里程碑已达成</span><span>100%</span></div>';
      h += '    <div class="ag-prog-bar"><div class="ag-prog-fill" style="width:100%"></div></div>';
      h += '  </div>';
    }

    if (isMine && !isDone) {
      if (isActive) {
        h += '  <button class="ag-btn-start" disabled style="border-color:#d4a040;color:#ebbc4d">⏳ 正在全力推进中...</button>';
      } else {
        const btnDisabled = (!cond.ok || !!state.active);
        const btnTitle = !cond.ok ? cond.reason : (state.active ? "已有进行中的战略议程" : "点击启动推进");
        h += '  <button class="ag-btn-start btn-start-agenda" data-id="' + ag.id + '" ' + (btnDisabled ? 'disabled' : '') + ' title="' + btnTitle + '">🚀 启动该战略议程</button>';
      }
    }

    h += '</div>';
  }

  h += '</div>';

  box.innerHTML = h;

  // 绑定启动操作按钮
  box.querySelectorAll(".btn-start-agenda").forEach((btn) => {
    btn.addEventListener("click", () => {
      const agId = btn.dataset.id;
      if (agId) startAgenda(actualKey, agId);
    });
  });
}

// ---- R12B: 次极大国专属国家议程与战略路线全链路探针 ----
function runAgendaProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("AGENDAPROBE FAIL [" + name + "]: " + msg);
    }
  };

  // G（收尾评审）：14 个步骤按阶段抽为四个推进器；跨阶段的议程列表经 ctx 传递。
  try {
    const ctx = {};
    agendaProbeDatabase(r, assert, ctx);
    agendaProbeLifecycle(r, assert, ctx);
    agendaProbeGuardsAndUi(r, assert, ctx);
    agendaProbeEndgameAndState(r, assert, ctx);
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "agendaprobe"; d.style.display = "none";
  d.textContent = "AGENDAPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}

// G（收尾评审）：runAgendaProbe 的 步骤 1-2：核心 API 存在性 + 议程数据库完备性（原样搬运，无逻辑改动）
function agendaProbeDatabase(r, assert, ctx) {
  // 1. 核心数据库与函数存在性
  assert("databaseLoaded", !!window.W1980_AGENDAS && typeof window.W1980_AGENDAS.getAgendasForCountry === "function", "W1980_AGENDAS 应已载入");
  assert("initAgendaStateExists", typeof initAgendaState === "function", "initAgendaState 应定义");
  assert("startAgendaExists", typeof startAgenda === "function", "startAgenda 应定义");
  assert("updateMonthlyAgendasExists", typeof updateMonthlyAgendas === "function", "updateMonthlyAgendas 应定义");
  assert("refreshAgendaBoxExists", typeof refreshAgendaBox === "function", "refreshAgendaBox 应定义");

  // 2. 数据库完备性断言
  const chnAgendas = window.W1980_AGENDAS.getAgendasForCountry("CHN");
  const jpnAgendas = window.W1980_AGENDAS.getAgendasForCountry("JPN");
  const deuAgendas = window.W1980_AGENDAS.getAgendasForCountry("DEU");
  const fraAgendas = window.W1980_AGENDAS.getAgendasForCountry("FRA");
  const gbrAgendas = window.W1980_AGENDAS.getAgendasForCountry("GBR");
  const sunAgendas = window.W1980_AGENDAS.getAgendasForCountry("SUN");
  const usaAgendas = window.W1980_AGENDAS.getAgendasForCountry("USA");
  const defAgendas = window.W1980_AGENDAS.getAgendasForCountry("BRA");

  assert("chnAgendasCount", chnAgendas.length >= 3, "中国专属议程数 >= 3 (特区/裁军/大三角)");
  assert("jpnAgendasCount", jpnAgendas.length >= 3, "日本专属议程数 >= 3 (半导体/专守防卫/黑潮出海)");
  assert("deuAgendasCount", deuAgendas.length >= 2, "西德专属议程数 >= 2");
  assert("fraAgendasCount", fraAgendas.length >= 2, "法国专属议程数 >= 2");
  assert("gbrAgendasCount", gbrAgendas.length >= 2, "英国专属议程数 >= 2 (金融大爆炸/私有化)");
  assert("sunAgendasCount", sunAgendas.length >= 2, "苏联专属议程数 >= 2 (合资法/新联盟)");
  assert("usaAgendasCount", usaAgendas.length >= 2, "美国专属议程数 >= 2 (供给学派/SDI)");
  assert("defaultFallbackAgendas", defAgendas.length >= 2, "通用国家 fallback 议程有效");

  // G：跨阶段复用的议程列表经 ctx 传递（后续阶段按原名取回，逻辑不变）
  ctx.chnAgendas = chnAgendas;
  ctx.jpnAgendas = jpnAgendas;
  ctx.usaAgendas = usaAgendas;
}

// G（收尾评审）：runAgendaProbe 的 步骤 3-7：初始状态、前置条件、启动/推进/完成、红利与 pmods 注入（原样搬运，无逻辑改动）
function agendaProbeLifecycle(r, assert, ctx) {
  const chnAgendas = ctx.chnAgendas;
  // 3. 初始状态断言
  initAgendaState();
  assert("stateInitClean", Object.keys(ST.agendas).length === 0, "ST.agendas 初始化为空字典");
  const chnState = getAgendaState("CHN");
  assert("chnStateInit", chnState.active === null && chnState.progress === 0 && chnState.completed.length === 0, "国家议程初始结构完备");

  // 4. 前置条件断言：中国百万大裁军军费与年代约束
  const agSez = chnAgendas.find((a) => a.id === "chn_sez");
  const agDisarm = chnAgendas.find((a) => a.id === "chn_disarm");
  assert("sezConditionPass", checkAgendaCondition("CHN", agSez).ok === true, "1980 年设立经济特区前置条件满足");

  // 军费过高时大裁军被锁
  ST.player = "CHN";
  ST.mil = 5.0;
  assert("disarmBlockedByMilAndPrereq", checkAgendaCondition("CHN", agDisarm).ok === false, "军费 5% 且未完成特区时大裁军应被禁用");

  // 5. 启动议程与推进
  const startRes = startAgenda("CHN", "chn_sez");
  assert("startAgendaSuccess", startRes === true && ST.agendas.CHN.active === "chn_sez", "成功启动特区议程");
  assert("cantStartSecondAgenda", startAgenda("CHN", "chn_triangle") === false, "推进中不可同时启动第二项议程");

  // 6. 月度演进推进至完成
  const prevProg = ST.agendas.CHN.progress;
  updateMonthlyAgendas(1980, 2, true);
  assert("progressAdvanced", ST.agendas.CHN.progress > prevProg, "月度演进推进进度");

  // 快速模拟推进至 100% 完成
  for (let i = 0; i < 20; i++) {
    updateMonthlyAgendas(1980, 3 + i, true);
  }
  assert("agendaCompleted", ST.agendas.CHN.completed.includes("chn_sez"), "特区议程推进完毕进入 completed");
  assert("agendaActiveReset", ST.agendas.CHN.active === null, "达成后 active 自动置空");
  assert("gdpBonusCalculated", ST.agendas.CHN.bonuses.gdpBonus === 0.35, "正确计算 +0.35pp GDP 结构性红利");
  assert("reserveMonthlyCalculated", ST.agendas.CHN.bonuses.reserveMonthly === 1.5, "正确计算 +1.5亿 外汇流红利");

  // 7. 单一事实源与 pmods 注入
  applyPlayerDecisions();
  const pmodsCHN = W1980_SIM.pmap(SIM.S).CHN;
  assert("pmodsInjectedGdpBonus", typeof pmodsCHN === "number", "pmods 正确注入玩家执政国家");
}

// G（收尾评审）：runAgendaProbe 的 步骤 8-11：日本 1% 红线、美国 SDI 阈值、脱钩免疫、界面渲染（原样搬运，无逻辑改动）
function agendaProbeGuardsAndUi(r, assert, ctx) {
  const jpnAgendas = ctx.jpnAgendas, usaAgendas = ctx.usaAgendas;
  // 8. 日本专守防卫 1% 军费红线校验
  const agJpnDef = jpnAgendas.find((a) => a.id === "jpn_defense_cap");
  ST.player = "JPN";
  ST.mil = 2.0;
  assert("jpnDefenseBlockedHighMil", checkAgendaCondition("JPN", agJpnDef).ok === false, "日本军费 2.0% 时专守防卫应被禁用");
  ST.mil = 0.8;
  assert("jpnDefenseAllowedLowMil", checkAgendaCondition("JPN", agJpnDef).ok === true, "日本军费 0.8% 时专守防卫条件满足");

  // 9. 美国 SDI 军备军费 ≥ 5% 校验
  const agUsaSdi = usaAgendas.find((a) => a.id === "usa_sdi_tech");
  ST.player = "USA";
  const oldYear = SIM.S ? SIM.S.year : 1980;
  const oldMonth = SIM.S ? SIM.S.month : 1;
  if (SIM.S) { SIM.S.year = 1983; SIM.S.month = 4; }
  ST.mil = 3.0;
  assert("usaSdiBlockedLowMil", checkAgendaCondition("USA", agUsaSdi).ok === false, "美国军费 3.0% 时 SDI 应被禁用");
  ST.mil = 6.0;
  assert("usaSdiAllowedHighMil", checkAgendaCondition("USA", agUsaSdi).ok === true, "美国军费 6.0% 且 1983 年时 SDI 允许启动");
  if (SIM.S) { SIM.S.year = oldYear; SIM.S.month = oldMonth; }

  // 10. 大三角脱钩震荡免疫验证
  ST.player = "CHN";
  ST.agendas.CHN.completed.push("chn_triangle");
  ST.agendas.CHN.bonuses = calcAgendaBonuses("CHN");
  assert("hasDecoupleImmunityBonus", ST.agendas.CHN.bonuses.decoupleImmunity === true, "达成大三角平衡后获得脱钩免疫");
  ST.blocOverride.CHN = "WP";
  ST.blocSince = curMonthIdx();
  const blocEff = curBlocEffect();
  assert("decoupleFrictionZero", blocEff.friction === 0, "脱钩免疫使阵营迁移脱钩震荡摩擦归零");

  // 11. 界面渲染测试
  const agendaBox = $("p-agenda-box");
  assert("agendaBoxDomExists", !!agendaBox, "#p-agenda-box DOM 容器存在");
  refreshAgendaBox("CHN");
  assert("chnRenderedCards", agendaBox.innerHTML.includes("设立经济特区") && agendaBox.querySelectorAll(".ag-card").length >= 3, "成功渲染中国议程卡片列表");
  refreshAgendaBox("JPN");
  assert("jpnRenderedCards", agendaBox.innerHTML.includes("半导体与精密制造") && agendaBox.innerHTML.includes("恪守专守防卫"), "成功渲染日本议程卡片列表");
  refreshAgendaBox("DEU");
  assert("deuRenderedCards", agendaBox.innerHTML.includes("单一欧洲法案"), "成功渲染欧洲单一市场议程卡片");
}

// G（收尾评审）：runAgendaProbe 的 步骤 12-14：后日谈联动、旁观零漂移、存档往返与状态复原（原样搬运，无逻辑改动）
function agendaProbeEndgameAndState(r, assert, ctx) {
  // 12. 终局后日谈专属篇章与称号联动
  const epSt = {
    date: "1991-12",
    world: { gdp: 24000, gdp0: 12000, gdpDelta: 100, pop: 5300, pop0: 4400, popDelta: 20.4 },
    blocs: [{ b: "CHN", zh: "中国", gdpShare: 18, gdpShare0: 12, popShare: 22, popShare0: 22 }],
    player: {
      k: "CHN", zh: "中国", mil: 2,
      gdp: 2600, gdp0: 1200, gdpDelta: 116,
      pop: 1100, pop0: 980, popDelta: 12.2,
      rank0: 8, rank1: 4, dr: 4, pctl: 0.95,
      E: 28, R: 12, M: 15, G: 20, G_bloc: 10, G_act: 12, total: 87
    }
  };
  const epRes = generateEpilogue(epSt);
  assert("epilogueHasAgendaSection", epRes.sections.some((s) => s.sec.includes("专属国家战略路线")), "终局后日谈包含专属战略议程篇章");
  assert("epilogueSpecialTitle", epRes.rankTitle.includes("总设计师") || epRes.rankTitle.includes("擎天"), "达成双核心议程荣膺专属历史称号");

  // 13. 旁观模式零漂移验证
  ST.player = null;
  applyPlayerDecisions();
  const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
  assert("observerZeroPmods", pmodsCount === 0, "旁观模式下 applyPlayerDecisions 绝对 0 pmods (0 漂移)");

  // 14. 存档读档往返序列化
  ST.player = "CHN";
  ST.agendas.CHN.completed = ["chn_sez", "chn_triangle"];
  ST.agendas.CHN.active = "chn_disarm";
  ST.agendas.CHN.progress = 45.5;
  simSave();
  initAgendaState();
  assert("stateCleanedBeforeLoad", Object.keys(ST.agendas).length === 0, "读档前清空状态生效");
  simLoad();
  assert("stateRestoredAfterLoad", ST.agendas.CHN && ST.agendas.CHN.active === "chn_disarm" && Math.abs(ST.agendas.CHN.progress - 45.5) < 0.1 && ST.agendas.CHN.completed.length === 2, "simSave/simLoad 100% 完美往返恢复议程状态");

  // 复原状态
  ST.player = null;
  ST.mil = 0;
  ST.blocOverride = {};
  ST.blocSince = null;
  initAgendaState();
  applyPlayerDecisions();
  refreshAgendaBox(ST.sel);
}

// ---- R12C: 中局突发危机抉择卡与升级阶梯系统 ----
let crisisResumePlay = false;

function initCrisisState() {
  ST.crises = {
    history: [],
    pending: null
  };
  return ST.crises;
}

function sanitizeCrisisState(data) {
  if (!data || typeof data !== "object") {
    return { history: [], pending: null };
  }
  const history = Array.isArray(data.history)
    ? data.history.filter((h) => h && typeof h.id === "string" && typeof h.tier === "number")
    : [];
  let pending = null;
  if (data.pending && typeof data.pending.id === "string") {
    pending = (window.W1980_CRISES && window.W1980_CRISES.getCrisisById(data.pending.id)) || data.pending;
  }
  return { history: history, pending: pending };
}

function openCrisisModal(cr) {
  if (!cr) return false;
  const modal = $("crisis-modal");
  if (!modal) return false;

  if (!ST.crises) initCrisisState();
  ST.crises.pending = cr;
  if (window.W1980_SOUND) window.W1980_SOUND.playTeletype();

  if (SIM.playing) {
    crisisResumePlay = true;
    SIM.playing = false;
    updateDate();
  }

  const mDate = $("crisis-date");
  if (mDate) mDate.textContent = cr.year + "-" + String(cr.month).padStart(2, "0");
  const mTitle = $("crisis-title");
  if (mTitle) mTitle.textContent = cr.title;
  const mSubhead = $("crisis-subhead");
  if (mSubhead) mSubhead.textContent = cr.headline || "";
  const mRegion = $("crisis-region");
  if (mRegion) mRegion.textContent = "📍 " + (cr.region || "前线热点战区");
  const mActors = $("crisis-actors");
  if (mActors) {
    const actorNames = (cr.actors || []).map((k) => (CM.countries[k] || {}).zh || k).join(" · ");
    mActors.textContent = "🌐 涉事各方：" + (actorNames || "美苏超级大国");
  }
  const mDesc = $("crisis-desc");
  if (mDesc) mDesc.textContent = cr.desc || "";

  const optContainer = $("crisis-options");
  if (optContainer) {
    optContainer.innerHTML = (cr.options || []).map((opt) => {
      const tierClass = "tier-" + opt.tier;
      return '<div class="crisis-card ' + tierClass + '">' +
        '<div class="crisis-card-hd">' +
          '<span class="crisis-card-tier">' + opt.icon + ' 阶梯 ' + opt.tier + '</span>' +
          '<span class="crisis-card-badge">' + (opt.badge || ("阶梯 " + opt.tier)) + '</span>' +
        '</div>' +
        '<div class="crisis-card-title">' + opt.title + '</div>' +
        '<div class="crisis-card-desc">' + opt.desc + '</div>' +
        '<div class="crisis-card-effects"><strong>决断预期：</strong>' + (opt.effects && opt.effects.summary ? opt.effects.summary : "重塑地缘对抗均势") + '</div>' +
        '<button class="crisis-btn-decide" data-crisis="' + cr.id + '" data-tier="' + opt.tier + '">拍板决断 (执行阶梯 ' + opt.tier + ')</button>' +
      '</div>';
    }).join("");

    optContainer.querySelectorAll(".crisis-btn-decide").forEach((btn) => {
      btn.onclick = () => {
        const cId = btn.dataset.crisis;
        const tier = parseInt(btn.dataset.tier, 10);
        resolveCrisis(cId, tier);
      };
    });
  }

  modal.style.display = "flex";
  return true;
}

function hideCrisisModal() {
  const modal = $("crisis-modal");
  if (modal) modal.style.display = "none";
}

function closeCrisisModal() {
  hideCrisisModal();
  if (crisisResumePlay) {
    SIM.playing = true; simKick();
    crisisResumePlay = false;
    updateDate();
  }
}

function resolveCrisis(crId, tier, silent) {
  if (!window.W1980_CRISES) return false;
  const cr = window.W1980_CRISES.getCrisisById(crId);
  if (!cr) return false;
  const opt = (cr.options || []).find((o) => o.tier === tier) || cr.options[0];
  if (!opt) return false;

  if (!ST.crises) initCrisisState();
  const y = SIM.S ? SIM.S.year : cr.year;
  const m = SIM.S ? SIM.S.month : cr.month;
  ST.crises.history.push({
    id: cr.id,
    tier: tier,
    y: y,
    m: m,
    title: cr.title,
    optionTitle: opt.title,
    time: Date.now()
  });
  ST.crises.pending = null;

  const eff = opt.effects || {};

  // D（数据层评审）：统一效果词表自检 —— 数据里出现表外键 = 拼错或过期，静默无效最危险。
  // 词表见 data/effects.js（W1980_EFFECTS）；构建期由 tools/validate_data.js 强制校验。
  const unknownEff = (window.W1980_EFFECTS && window.W1980_EFFECTS.unknownKeys) ? window.W1980_EFFECTS.unknownKeys(eff) : [];
  if (unknownEff.length) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[W1980] 危机 " + cr.id + " 阶梯 " + tier + " 含未登记效果键：" + unknownEff.join(", ")
        + "（合法键见 data/effects.js）");
    }
  }

  // 1. 双边张力影响 (R10A)
  if (typeof eff.tensionDelta === "number" && eff.tensionDelta !== 0 && ST.ai && ST.ai.tensions) {
    const usSunKey = "USA:SUN";
    const curTension = typeof ST.ai.tensions[usSunKey] === "number" ? ST.ai.tensions[usSunKey] : 50;
    ST.ai.tensions[usSunKey] = clamp(curTension + eff.tensionDelta, 0, 100);
  }

  // 2. 大国内政生态与派系权力天平渗透 (R12A)
  if (ST.domestic) {
    if (ST.domestic.sun) {
      if (typeof eff.sunConservative === "number") {
        ST.domestic.sun.conservative = clamp(ST.domestic.sun.conservative + eff.sunConservative, 10, 95);
      }
      if (typeof eff.sunReformist === "number") {
        ST.domestic.sun.reformist = clamp(ST.domestic.sun.reformist + eff.sunReformist, 5, 90);
      }
      if (typeof eff.sunShortage === "number") {
        ST.domestic.sun.shortage = clamp(ST.domestic.sun.shortage + eff.sunShortage, 0, 100);
      }
    }
    if (ST.domestic.usa) {
      if (typeof eff.usaCongressApproval === "number") {
        ST.domestic.usa.congressApproval = clamp(ST.domestic.usa.congressApproval + eff.usaCongressApproval, 15, 90);
      }
    }
    if (ST.domestic.generals) {
      if (typeof eff.stabilityBonus === "number") {
        for (const k in ST.domestic.generals) {
          ST.domestic.generals[k].stability = clamp(ST.domestic.generals[k].stability + eff.stabilityBonus, 10, 100);
        }
      }
    }
  }

  // 3. 巴统技术管制升级
  if (eff.cocomStrict && ST.cocom) {
    ST.cocom.strict = true;
  }

  // 4. 收件箱入账与即时反馈
  const inboxItem = {
    y: y,
    m: m,
    zh: "【突发危机决断】" + cr.title + " · " + opt.title,
    note: opt.icon + " 最高决策层拍板阶梯 " + tier + "（" + (opt.badge || "") + "）：" + (eff.summary || opt.desc),
    isCrisis: true
  };
  EV.items.push(inboxItem);
  EV.unread++;
  renderInbox();
  if (!silent) toast(inboxItem);

  // 5. 模态窗口关闭与播放恢复
  closeCrisisModal();
  if (ST.sel && typeof refreshDomesticBox === "function") {
    refreshDomesticBox(ST.sel);
  }
  return true;
}

function updateMonthlyCrises(y, m, silent) {
  if (!window.W1980_CRISES) return;
  if (!ST.crises) initCrisisState();

  const crises = window.W1980_CRISES.getCrisesForDate(y, m);
  if (!crises || !crises.length) return;

  for (let i = 0; i < crises.length; i++) {
    const cr = crises[i];
    if (ST.crises.history.some((h) => h.id === cr.id)) continue;

    // 旁观模式 或 探针测试模式：自动执行史实基准阶梯 2（对等均势反制），零暂停、零 pmods 注入、零漂移
    if (!ST.player || CR.probeMode) {
      ST.crises.history.push({
        id: cr.id,
        tier: 2,
        y: y,
        m: m,
        title: cr.title,
        optionTitle: (cr.options && cr.options[1] ? cr.options[1].title : "对等反制"),
        auto: true,
        time: Date.now()
      });
      continue;
    }

    // 玩家执政模式：涉及玩家国或美苏大国时触发危机抉择卡
    const isPlayerInvolved = !cr.actors || !cr.actors.length ||
      cr.actors.includes(ST.player) || cr.target === ST.player || cr.initiator === ST.player ||
      ST.player === "SUN" || ST.player === "USA";
    if (isPlayerInvolved) {
      if (silent === true && !CR.probeMode) {
        CR.resumePlay = SIM.playing;
        SIM.playing = false;
        updateDate();
        openCrisisModal(cr);
        return;
      }
      openCrisisModal(cr);
      return;
    }
  }
}

// ---- R12C: 突发危机抉择卡与升级阶梯专用全链路探针 ----
function runCrisisProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("CRISISPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    // 1. 核心数据库与函数存在性
    assert("databaseLoaded", !!window.W1980_CRISES && Array.isArray(window.W1980_CRISES.list), "W1980_CRISES 数据库应成功载入");
    assert("crisesCount8", window.W1980_CRISES && window.W1980_CRISES.list.length === 8, "突发危机总数应为 8 大历史危机");
    assert("crisisPolandLoaded", !!window.W1980_CRISES.getCrisisById("crisis_poland_1981"), "1981 波兰戒严危机应存在");
    assert("crisisSouthGeorgiaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_southgeorgia_1982"), "1982 南乔治亚岛危机应存在");
    assert("crisisKAL007Loaded", !!window.W1980_CRISES.getCrisisById("crisis_kal007_1983"), "1983 大韩航空 007 班机事件应存在");
    assert("crisisGrenadaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_grenada_1983"), "1983 格林纳达狂暴行动危机应存在");
    assert("crisisBeirutLoaded", !!window.W1980_CRISES.getCrisisById("crisis_beirut_1985"), "1985 贝鲁特人质危机应存在");
    assert("crisisAchilleLoaded", !!window.W1980_CRISES.getCrisisById("crisis_achille_1985"), "1985 阿基莱·劳伦号游轮危机应存在");
    assert("crisisVincennesLoaded", !!window.W1980_CRISES.getCrisisById("crisis_vincennes_1988"), "1988 文森斯号海湾误击事件应存在");
    assert("crisisRomaniaLoaded", !!window.W1980_CRISES.getCrisisById("crisis_romania_1989"), "1989 罗马尼亚蒂米什瓦拉剧变应存在");

    // 2. 危机数据结构与阶梯完整性
    assert("allCrisesHave3Tiers", window.W1980_CRISES.list.every((c) => c.options && c.options.length === 3), "每个危机均严格配备三级博弈应对阶梯");
    assert("allCrisesHaveEffects", window.W1980_CRISES.list.every((c) => c.options.every((o) => o.effects && typeof o.effects === "object")), "每个阶梯选项均定义有效效果对象");

    // 3. 核心 API 函数定义
    assert("initCrisisStateExists", typeof initCrisisState === "function", "initCrisisState 应已定义");
    assert("sanitizeCrisisStateExists", typeof sanitizeCrisisState === "function", "sanitizeCrisisState 应已定义");
    assert("openCrisisModalExists", typeof openCrisisModal === "function", "openCrisisModal 应已定义");
    assert("closeCrisisModalExists", typeof closeCrisisModal === "function", "closeCrisisModal 应已定义");
    assert("resolveCrisisExists", typeof resolveCrisis === "function", "resolveCrisis 应已定义");
    assert("updateMonthlyCrisesExists", typeof updateMonthlyCrises === "function", "updateMonthlyCrises 应已定义");

    // 4. DOM 容器与布局校验
    const modal = $("crisis-modal");
    const dossier = $("crisis-dossier");
    const optBox = $("crisis-options");
    assert("modalDomExists", !!modal, "#crisis-modal 应存在于 DOM 中");
    assert("dossierDomExists", !!dossier, "#crisis-dossier 密电卡片容器应存在于 DOM 中");
    assert("optionsDomExists", !!optBox, "#crisis-options 阶梯容器应存在于 DOM 中");

    // 5. 状态初始化与纯净性
    initCrisisState();
    assert("initialStateClean", ST.crises && ST.crises.history.length === 0 && ST.crises.pending === null, "ST.crises 初始状态纯净");

    // 6. 弹窗渲染与阶梯卡片生成
    const cr1 = window.W1980_CRISES.getCrisisById("crisis_poland_1981");
    openCrisisModal(cr1);
    assert("openModalRendersTitle", $("crisis-title").textContent.includes("波兰戒严"), "弹窗标题正确渲染波兰危机");
    assert("openModalRendersCards", optBox.querySelectorAll(".crisis-card").length === 3, "弹窗成功渲染 3 张应对阶梯卡片");
    assert("modalDisplayFlex", modal.style.display === "flex", "弹窗 display 属性为 flex");

    // 7. 决断执行（阶梯 1：战略克制）
    const resolveRes = resolveCrisis("crisis_poland_1981", 1, true);
    assert("resolveReturnsTrue", resolveRes === true, "resolveCrisis 顺利执行返回 true");
    assert("resolveHistoryRecorded", ST.crises.history.some((h) => h.id === "crisis_poland_1981" && h.tier === 1), "历史记录成功入账阶梯 1");
    assert("resolveModalClosed", modal.style.display === "none", "决断后弹窗已自动关闭");
    assert("resolveClearedPending", ST.crises.pending === null, "决断后 pending 状态已清空");

    // 8. 大国内政生态与巴统联动校验 (阶梯 3 强硬决断)
    initDomesticState();
    const prevApproval = (ST.domestic && ST.domestic.usa) ? ST.domestic.usa.congressApproval : 55;
    resolveCrisis("crisis_kal007_1983", 3, true);
    assert("cocomStrictUpgraded", ST.cocom && ST.cocom.strict === true, "KAL007 阶梯 3 升级巴统技术封锁");
    assert("domesticApprovalBoosted", (ST.domestic && ST.domestic.usa && ST.domestic.usa.congressApproval > prevApproval), "KAL007 阶梯 3 推升国会批准率");

    // 9. 旁观模式零漂移铁律检验
    ST.player = null;
    updateMonthlyCrises(1988, 7, true);
    assert("spectatorAutoBaseline", ST.crises.history.some((h) => h.id === "crisis_vincennes_1988" && h.tier === 2 && h.auto === true), "旁观模式自动采纳史实基准阶梯 2");
    applyPlayerDecisions();
    const pmodsCount = Object.keys((SIM.S && SIM.S.P && SIM.S.P.pmods) || {}).length;
    assert("spectatorZeroPmods", pmodsCount === 0, "旁观模式危机决断绝对 0 pmods 注入 (0 漂移)");

    // 10. 终局大事记时代编年史联动
    const chList = generateChronicle();
    assert("chronicleHasCrisis", Array.isArray(chList) && chList.some((item) => item.tagClass === "crisis"), "终局历史大事记编年史包含突发危机篇章");

    // 11. simSave() / simLoad() 全量往返序列化
    const savedLen = ST.crises.history.length;
    simSave();
    initCrisisState();
    assert("stateCleanedBeforeLoad", ST.crises.history.length === 0, "读档前清空状态生效");
    simLoad();
    assert("saveLoadRoundTrip", ST.crises && ST.crises.history.length === savedLen, "simSave/simLoad 完美往返恢复突发危机历史记录");

    // 恢复纯净环境
    ST.player = null;
    ST.mil = 0;
    initCrisisState();
    hideCrisisModal();
    applyPlayerDecisions();
  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
  }

  const d = document.createElement("div"); d.id = "crisisprobe"; d.style.display = "none";
  d.textContent = "CRISISPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
