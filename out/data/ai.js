"use strict";
/* world1980 大国战略性格画像与反应式 AI 决策数据模块（进阶方向四 · 阶段 1）。
 * 核心机制：
 *   1. 54 实体历史战略性格（Doctrines）：鹰派遏制、全面对抗、独立务实、欧罗巴自主、专守防卫、区域宿敌等。
 *   2. 战略互信与对抗紧张度模型（Attitude & Tension Model）。
 *   3. 反应式对抗决策评估引擎（Reactive Decision Engine）：对等反制裁、对冲军援、军备动员跟进。
 */
(function () {
  const AI_DOCTRINES = {
    USA: {
      name: "全球威慑与前沿遏制",
      doctrine: "hawk",
      desc: "依托全球同盟网络对华约实施前沿军事威慑与技术封锁，对任何威胁盟友安全的挑衅予以对等惩戒。",
      rivals: ["SUN"],
      allies: ["DEU", "GBR", "FRA", "JPN", "KOR", "ARA"],
      baseMil: 5.0,
      armsRaceSensitivity: 0.85,
      sanctionThreshold: 1,
      maxSanctions: 2,
      maxAid: 2
    },
    SUN: {
      name: "战略均势与全面抗衡",
      doctrine: "titan",
      desc: "维护华约铁幕安全边界与超级大国战略均势，坚决反制西方经济封锁，在第三世界争夺地缘支点。",
      rivals: ["USA"],
      allies: ["POL", "CSK", "DDR", "CUB", "VNM", "SYR"],
      baseMil: 6.0,
      armsRaceSensitivity: 0.90,
      sanctionThreshold: 1,
      maxSanctions: 2,
      maxAid: 2
    },
    CHN: {
      name: "独立自主与战略韬光",
      doctrine: "pragmatist",
      desc: "奉行独立自主和平外交，不结盟不称霸，在大国对抗中维持战略灵活性与和平建设环境。",
      rivals: [],
      allies: ["PRK", "PAK"],
      baseMil: 3.5,
      armsRaceSensitivity: 0.25,
      sanctionThreshold: 2,
      maxSanctions: 1,
      maxAid: 1
    },
    DEU: {
      name: "新东方政策与欧罗巴自主",
      doctrine: "autonomy",
      desc: "身处冷战对抗前沿，极力推动东西欧政治缓和与能源管道合作，主张克制，抗拒单边激化制裁。",
      rivals: [],
      allies: ["USA", "FRA", "GBR"],
      baseMil: 3.0,
      armsRaceSensitivity: 0.35,
      sanctionThreshold: 2,
      maxSanctions: 1,
      maxAid: 1
    },
    FRA: {
      name: "戴高乐主义与独立大国",
      doctrine: "gaullist",
      desc: "保持独立核威慑与防务自主，既立足西方阵营又抗拒盲从华盛顿，致力于欧洲自身地缘主导权。",
      rivals: [],
      allies: ["USA", "DEU", "GBR"],
      baseMil: 3.5,
      armsRaceSensitivity: 0.40,
      sanctionThreshold: 2,
      maxSanctions: 1,
      maxAid: 1
    },
    GBR: {
      name: "大西洋特殊同盟",
      doctrine: "atlanticist",
      desc: "坚定维护英美特殊同盟与北大西洋前沿防线，坚决捍卫海外核心利益（如福克兰群岛）。",
      rivals: ["SUN", "ARG", "LAP"],
      allies: ["USA"],
      baseMil: 4.5,
      armsRaceSensitivity: 0.65,
      sanctionThreshold: 1,
      maxSanctions: 1,
      maxAid: 1
    },
    JPN: {
      name: "专守防卫与通商立国",
      doctrine: "merchant",
      desc: "恪守和平宪法与专守防卫，依托日美安保条约维持国防，以高科技与全球远洋贸易为核心利益。",
      rivals: [],
      allies: ["USA"],
      baseMil: 1.0,
      armsRaceSensitivity: 0.15,
      sanctionThreshold: 2,
      maxSanctions: 1,
      maxAid: 1
    },
    IRN: {
      name: "伊斯兰革命与圣战自卫",
      doctrine: "revolutionary",
      desc: "打碎旧有秩序，誓死抵抗伊拉克入侵并在波斯湾捍卫主导权，对西方大国干预充满敌意。",
      rivals: ["IRQ", "USA"],
      allies: ["SYR"],
      baseMil: 6.0,
      armsRaceSensitivity: 0.75,
      sanctionThreshold: 1,
      maxSanctions: 1,
      maxAid: 1
    },
    IRQ: {
      name: "阿拉伯复兴与海湾争霸",
      doctrine: "expansionist",
      desc: "追求两河流域地缘霸权，为出海口与石油定价权竭力对伊朗作战，对波斯湾小国形成直接威慑。",
      rivals: ["IRN"],
      allies: ["ARA"],
      baseMil: 6.5,
      armsRaceSensitivity: 0.80,
      sanctionThreshold: 1,
      maxSanctions: 1,
      maxAid: 1
    }
  };

  function getDoctrine(k, ctry) {
    if (AI_DOCTRINES[k]) return AI_DOCTRINES[k];
    const c = ctry || {};
    const b = c.bloc || "NE";
    let docType = "neutral_defensive";
    let name = "中立自守与区域平衡";
    let rivals = [];
    let allies = [];
    let baseMil = 2.0;

    if (b === "NATO" || b === "W") {
      docType = "western_aligned";
      name = "西方防务协作";
      allies = ["USA"];
      baseMil = 2.5;
    } else if (b === "WP" || b === "SOV") {
      docType = "eastern_aligned";
      name = "华约前沿协防";
      allies = ["SUN"];
      baseMil = 3.5;
    } else if (b === "CHN") {
      allies = ["CHN"];
      baseMil = 2.5;
    }

    return {
      name: name,
      doctrine: docType,
      desc: "遵循阵营防务协定，维护本国主权安全，对外部直接干涉保持警惕。",
      rivals: rivals,
      allies: allies,
      baseMil: baseMil,
      armsRaceSensitivity: 0.3,
      sanctionThreshold: 2,
      maxSanctions: 1,
      maxAid: 1
    };
  }

  function calcAttitude(aiKey, playerKey, playerDecisions, worldState) {
    if (!aiKey || !playerKey) return { tension: 0, attitude: "neutral", label: "中立观望", cls: "neutral" };
    if (aiKey === playerKey) return { tension: 0, attitude: "self", label: "玩家控制", cls: "allied" };

    const doc = getDoctrine(aiKey, worldState && worldState.countries ? worldState.countries[aiKey] : null);
    const pBloc = (worldState && worldState.countries && worldState.countries[playerKey]) ? worldState.countries[playerKey].bloc : "NE";
    const aiBloc = (worldState && worldState.countries && worldState.countries[aiKey]) ? worldState.countries[aiKey].bloc : "NE";

    let tension = 20; // 基础平稳张力

    // 1. 宿敌与同盟基准
    if (doc.rivals.includes(playerKey)) tension += 40;
    if (doc.allies.includes(playerKey)) tension -= 25;
    if (aiBloc === pBloc && aiBloc !== "NE" && aiBloc !== "NA") tension -= 20;
    else if ((aiBloc === "NATO" || aiBloc === "W") && (pBloc === "WP" || pBloc === "SOV")) tension += 25;
    else if ((aiBloc === "WP" || aiBloc === "SOV") && (pBloc === "NATO" || pBloc === "W")) tension += 25;

    // 2. 玩家制裁影响（直接制裁或制裁核心盟友）
    const sanctions = (playerDecisions && playerDecisions.sanctions) || [];
    const directSan = sanctions.find((s) => s.t === aiKey);
    if (directSan) {
      tension += (directSan.l + 1) * 20; // l=0: +20, l=1: +40, l=2: +60
    } else {
      const allySan = sanctions.filter((s) => doc.allies.includes(s.t));
      if (allySan.length > 0) tension += allySan.length * 15;
    }

    // 3. 玩家军费施压（仅当双方为对立阵营或宿敌时）
    const playerMil = (playerDecisions && typeof playerDecisions.mil === "number") ? playerDecisions.mil : 0;
    if (doc.rivals.includes(playerKey) && playerMil > 5) {
      tension += (playerMil - 5) * 4;
    }

    // 4. 生效军控条约缓和效应 (R10B Treaty Effects)
    const activeTreaties = (worldState && Array.isArray(worldState.treaties)) ? worldState.treaties : [];
    let hasHotline = false;
    for (let i = 0; i < activeTreaties.length; i++) {
      const t = activeTreaties[i];
      if (t.status === "active" && t.with === aiKey) {
        if (t.id === "inf") tension -= 25;
        else if (t.id === "start") tension -= 30;
        else if (t.id === "hotline") {
          tension -= 20;
          hasHotline = true;
        }
      }
    }

    tension = Math.max(0, Math.min(100, Math.round(tension)));
    if (hasHotline && tension > 50) {
      tension = 50; // 《危机热线与互信准则》锁定张力上限
    }

    let attitude = "neutral";
    let label = "务实中立";
    let cls = "neutral";

    if (tension >= 75) {
      attitude = "hostile";
      label = "极度敌对";
      cls = "bad";
    } else if (tension >= 50) {
      attitude = "guarded";
      label = "警惕戒备";
      cls = "warn";
    } else if (tension <= 20) {
      attitude = "allied";
      label = "亲密盟友";
      cls = "ok";
    } else {
      attitude = "cordial";
      label = "友好合作";
      cls = "cordial";
    }

    return { tension: tension, attitude: attitude, label: label, cls: cls };
  }

  function evaluateReactions(aiKey, playerKey, playerDecisions, worldState) {
    if (!aiKey || !playerKey || aiKey === playerKey) return null;
    const doc = getDoctrine(aiKey, worldState && worldState.countries ? worldState.countries[aiKey] : null);
    const att = calcAttitude(aiKey, playerKey, playerDecisions, worldState);

    const sanctions = (playerDecisions && playerDecisions.sanctions) || [];
    const directSan = sanctions.find((s) => s.t === aiKey);
    const allySan = sanctions.find((s) => doc.allies.includes(s.t));

    const result = {
      sanctions: [],
      aid: [],
      mil: doc.baseMil,
      cable: null
    };

    // 1. 对等反制裁逻辑 (Tit-for-Tat)
    if (directSan && directSan.l >= doc.sanctionThreshold) {
      const counterLvl = Math.min(directSan.l, 2);
      result.sanctions.push({ t: playerKey, l: counterLvl, since: 0 });
      result.cable = {
        type: "counter_sanction",
        from: aiKey,
        target: playerKey,
        lvl: counterLvl,
        zh: "对等经贸反制",
        desc: "针对" + (worldState.countries[playerKey] ? worldState.countries[playerKey].zh : playerKey) + "的不当制裁实施对等反击措施！"
      };
    } else if (!directSan && allySan && allySan.l === 2 && doc.rivals.includes(playerKey)) {
      // 盟友遭全面封锁且为宿敌时，施加轻度外交反制
      result.sanctions.push({ t: playerKey, l: 0, since: 0 });
      result.cable = {
        type: "counter_sanction_ally",
        from: aiKey,
        target: playerKey,
        lvl: 0,
        zh: "阵营外交照会与抵制",
        desc: "对针对核心同盟成员的经济封锁提出严正交涉与外交抵制。"
      };
    }

    // 2. 军备竞赛动员跟进 (Arms Race Adaptation)
    const playerMil = (playerDecisions && typeof playerDecisions.mil === "number") ? playerDecisions.mil : 0;
    if (doc.rivals.includes(playerKey)) {
      if (playerMil >= 6.0) {
        // 玩家高军费引发敌对军备动员
        const addMil = (playerMil - 5.0) * doc.armsRaceSensitivity;
        result.mil = Math.min(10.0, Math.round((doc.baseMil + addMil) * 10) / 10);
      } else if (playerMil <= 2.0) {
        // 玩家军费自制带来部分缓和
        result.mil = Math.max(1.0, Math.round((doc.baseMil - 1.5) * 10) / 10);
      }
    }

    // 3. 代理人战线对冲军援 (Proxy Counter-Aid)
    const playerAid = (playerDecisions && playerDecisions.aid) || [];
    for (let i = 0; i < playerAid.length; i++) {
      const pa = playerAid[i];
      if (pa.t === "IRN" && (aiKey === "USA" || aiKey === "IRQ")) {
        if (aiKey !== "IRQ" && result.aid.length < (doc.maxAid || 1)) {
          const aidL = Math.min(pa.l, 1);
          result.aid.push({ t: "IRQ", l: aidL, since: 0 });
          if (!result.cable) {
            result.cable = {
              type: "counter_aid",
              from: aiKey,
              target: "IRQ",
              lvl: aidL,
              zh: "海湾防务对冲军援",
              desc: "向伊拉克提供战略军援以平衡波斯湾均势。"
            };
          }
        }
      } else if (pa.t === "IRQ" && (aiKey === "SUN" || aiKey === "IRN")) {
        if (aiKey !== "IRN" && result.aid.length < (doc.maxAid || 1)) {
          const aidL = Math.min(pa.l, 1);
          result.aid.push({ t: "IRN", l: aidL, since: 0 });
          if (!result.cable) {
            result.cable = {
              type: "counter_aid",
              from: aiKey,
              target: "IRN",
              lvl: aidL,
              zh: "代理人对冲军援",
              desc: "向伊朗提供防御性军火与物资以抵抗外力干预。"
            };
          }
        }
      }
    }

    // 4. 生效军控条约对 AI 的约束 (R10B AI Treaty Compliance)
    const activeTreaties = (worldState && Array.isArray(worldState.treaties)) ? worldState.treaties : [];
    for (let i = 0; i < activeTreaties.length; i++) {
      const t = activeTreaties[i];
      if (t.status === "active" && t.with === aiKey) {
        if (t.id === "inf") {
          result.mil = Math.min(result.mil, 4.0); // 遵守中导条约军备上限
        } else if (t.id === "start") {
          result.sanctions = result.sanctions.filter((s) => s.t !== playerKey || s.l < 1); // 撤销高阶反制裁
        }
      }
    }

    return result;
  }

  const TREATY_DEFS = {
    inf: {
      id: "inf",
      zh: "《消除中程核导弹条约》（INF Treaty）",
      shortZh: "中导条约",
      milCap: 4.0,
      dividend: 0.40,
      tensionRelief: 25,
      desc: "全面销毁射程 500-5500 公里的陆基中程弹道与巡航导弹，签约双方防务预算上限不超过 4.0% GDP，每年为双方释放 +0.40pp 结构性和平红利（Détente Dividend）。"
    },
    start: {
      id: "start",
      zh: "《削减战略进攻性武器协定》（START Accord）",
      shortZh: "战略核军控",
      maxSanctionLvl: 0,
      dividend: 0.25,
      tensionRelief: 30,
      desc: "削减进攻性战略核武库规模，承诺禁止对签约大国实施高阶经贸封锁，修复大国贸易航线信任，每年释放 +0.25pp 经贸稳定红利。"
    },
    hotline: {
      id: "hotline",
      zh: "《危机热线与互信准则》（Hotline & Confidence Accord）",
      shortZh: "热线与互信",
      tensionCap: 50,
      dividend: 0.15,
      tensionRelief: 20,
      desc: "建立首脑危机直通卫星热线与战略演习提前通报准则，双边对抗张力上限锁死在 50 点以内，每年释放 +0.15pp 稳定红利。"
    }
  };

  const SUMMIT_PRESETS = [
    {
      id: "geneva_1985",
      name: "日内瓦峰会 (1985)",
      city: "日内瓦 (Geneva)",
      year: 1985,
      month: 11,
      participants: ["USA", "SUN"],
      title: "战后新缓和破冰会晤",
      agenda: "美苏最高领导人六年来首次直接会晤，确立『核战争打不赢也打不得』原则，重申通过热线与互信机制降低误判风险。",
      treatyIds: ["hotline"],
      tensionReq: 85,
      desc: "日内瓦湖畔的初冬炉边谈话，美苏最高领袖达成重启战略对话的共识。"
    },
    {
      id: "reykjavik_1986",
      name: "雷克雅未克峰会 (1986)",
      city: "雷克雅未克 (Reykjavík)",
      year: 1986,
      month: 10,
      participants: ["USA", "SUN"],
      title: "霍夫迪之约：战略裁军大博弈",
      agenda: "冰岛霍夫迪故居的暴风雨之约。深入探讨全面销毁中程与战略核武器，但受 SDI（战略防御倡议）分歧阻碍。",
      treatyIds: ["inf", "hotline"],
      tensionReq: 80,
      desc: "大西洋孤岛上的极昼交锋，虽未达成最终协议，但为《中导条约》扫清了关键文本障碍。"
    },
    {
      id: "washington_1987",
      name: "华盛顿峰会 (1987)",
      city: "华盛顿 (Washington D.C.)",
      year: 1987,
      month: 12,
      participants: ["USA", "SUN"],
      title: "历史性握手：《中导条约》签署",
      agenda: "美苏正式签署《消除中程核导弹条约》（INF Treaty），人类历史上首次实质性销毁整整一个类别的现代核武器武器库！",
      treatyIds: ["inf"],
      tensionReq: 75,
      desc: "白宫东厅的历史性笔尖，终结了欧洲大陆长达十年的潘多拉中导危机。"
    },
    {
      id: "moscow_1988",
      name: "莫斯科峰会 (1988)",
      city: "莫斯科 (Moscow)",
      year: 1988,
      month: 5,
      participants: ["USA", "SUN"],
      title: "红场漫步：战略核军控与互信",
      agenda: "美苏交换《中导条约》批准书并漫步红场，公开声明冷战心理坚冰已经消融，全力推进 START 削减战略核武器草案。",
      treatyIds: ["inf", "start"],
      tensionReq: 70,
      desc: "红场钟楼下的微笑漫步，宣告了超级大国关系的不可逆实质性缓和。"
    },
    {
      id: "malta_1989",
      name: "马耳他峰会 (1989)",
      city: "马耳他海域 (Malta)",
      year: 1989,
      month: 12,
      participants: ["USA", "SUN"],
      title: "终结冷战：地中海狂风中的新秩序",
      agenda: "在『马克西姆·高尔基』号巡洋舰上，大国领袖宣告冷战正式落幕，开启大国全方位经贸稳定与合作新篇章。",
      treatyIds: ["start", "hotline"],
      tensionReq: 65,
      desc: "地中海惊涛骇浪中的历史定格，雅尔塔格局宣告终结，世界步入后冷战时代。"
    }
  ];

  function canHoldSummit(playerKey, aiKey, worldState, currentTreaties) {
    if (!playerKey || !aiKey || playerKey === aiKey) {
      return { ok: false, reason: "无法与自身举行首脑会晤" };
    }
    const att = calcAttitude(aiKey, playerKey, worldState ? worldState.playerDecisions : null, worldState);
    if (att.tension > 85) {
      return { ok: false, reason: "双边对抗张力过高（" + att.tension + " > 85），缺乏首脑互信基础，AI 拒绝赴会", tension: att.tension };
    }
    const signedIds = (currentTreaties || []).filter((t) => t.with === aiKey && t.status === "active").map((t) => t.id);
    const available = Object.keys(TREATY_DEFS).filter((id) => !signedIds.includes(id));
    return { ok: true, tension: att.tension, availableTreaties: available };
  }

  function evaluateBreach(treaty, playerDecisions, aiDecisions) {
    if (!treaty || treaty.status !== "active") return { breached: false };
    const pMil = (playerDecisions && typeof playerDecisions.mil === "number") ? playerDecisions.mil : 0;
    const pSan = (playerDecisions && Array.isArray(playerDecisions.sanctions)) ? playerDecisions.sanctions : [];

    if (treaty.id === "inf") {
      if (pMil > 4.05) {
        return {
          breached: true,
          party: "player",
          reason: "防务动员预算超过《中导条约》规定的 4.0% 上限（当前 " + pMil.toFixed(1) + "% GDP）"
        };
      }
    } else if (treaty.id === "start") {
      const directSan = pSan.find((s) => s.t === treaty.with);
      if (directSan && directSan.l >= 1) {
        return {
          breached: true,
          party: "player",
          reason: "单方面施加高阶经贸封锁，违反《削减战略进攻性武器协定》（当前制裁等级 " + directSan.l + "）"
        };
      }
    }
    return { breached: false };
  }

  const UNSC_P5 = ["USA", "SUN", "CHN", "GBR", "FRA"];

  const UNSC_RESOLUTIONS = {
    res_598: {
      id: "res_598",
      num: 598,
      name: "第 598 号决议：两伊全面停火与和平调解",
      shortTitle: "598 号决议 (两伊停火)",
      year: 1987,
      month: 7,
      targetConflict: "iran_iraq",
      parties: ["IRN", "IRQ"],
      sponsor: "UNSC",
      summary: "安理会一致要求伊朗与伊拉克作为和平解决的第一步立即停火，撤回国界，并在秘书长调解下全面战俘交换与和平谈判。",
      effects: {
        ceasefire: true,
        restoreBorders: ["IRN", "IRQ"],
        openChokepoint: "hormuz",
        economicRelief: 0.20
      },
      desc: "安理会通过里程碑式第 598 号决议，呼吁立即停火并解除波斯湾油轮战危机。"
    },
    res_660: {
      id: "res_660",
      num: 660,
      name: "第 660/678 号决议：海湾危机与集体授权制裁",
      shortTitle: "660/678 号决议 (海湾危机)",
      year: 1990,
      month: 8,
      targetConflict: "gulf_war",
      parties: ["IRQ", "KWT"],
      sponsor: "USA",
      summary: "严厉谴责伊拉克对科威特的侵略与吞并，要求立即无条件撤军，授权多边联合经济禁运与集体自卫。",
      effects: {
        multilateralEmbargo: "IRQ",
        embargoPenalty: -2.0,
        liberateKuwait: true
      },
      desc: "安理会形成国际统一战线，对侵略行径实施全面多边经济制裁与撤军最后通牒。"
    },
    res_502: {
      id: "res_502",
      num: 502,
      name: "第 502 号决议：福克兰群岛敌对行动与停火撤军",
      shortTitle: "502 号决议 (马岛争端)",
      year: 1982,
      month: 4,
      targetConflict: "falklands",
      parties: ["ARG", "GBR"],
      sponsor: "GBR",
      summary: "要求阿根廷部队立即从马尔维纳斯/福克兰群岛撤军，呼吁当事国寻求外交解决、避免战事升级。",
      effects: {
        ceasefire: true,
        restoreBorders: ["GBR"]
      },
      desc: "安理会呼吁停止南大西洋敌对武装行动，捍卫联合国宪章关于和平解决国际争端原则。"
    },
    res_peace_mediation: {
      id: "res_peace_mediation",
      num: 0,
      name: "国际热点危机通用和平斡旋与多边调停草案",
      shortTitle: "多边调停草案",
      targetConflict: "any",
      sponsor: "player",
      summary: "呼吁冲突各方保持克制、立即冻结接触线前线并开启多边外交斡旋谈判，防止冲突外溢。",
      effects: {
        ceasefire: true,
        economicRelief: 0.15
      },
      desc: "大国在安理会发起穿梭外交斡旋草案，缓和区域地缘对抗紧张局势。"
    }
  };

  function evaluateUNSCVote(aiKey, resolution, worldState) {
    if (!aiKey || !UNSC_P5.includes(aiKey)) return { vote: "abstain", reason: "非五常无表决权" };
    if (!resolution) return { vote: "abstain", reason: "草案未指定" };

    const doc = getDoctrine(aiKey, worldState && worldState.countries ? worldState.countries[aiKey] : null);
    const parties = resolution.parties || [];
    const isSponsor = resolution.sponsor === aiKey;
    if (isSponsor) return { vote: "in_favor", reason: "提案发起国投赞成票" };

    // 1. 若决议严厉制裁或惩罚本国盟友，行使一票否决权
    const sanctionsTarget = resolution.effects && resolution.effects.multilateralEmbargo;
    if (sanctionsTarget && doc.allies.includes(sanctionsTarget)) {
      return { vote: "veto", reason: "坚定捍卫核心盟友利益，行使一票否决权阻止制裁草案！" };
    }

    // 2. 针对具体历史决议的立场
    if (resolution.id === "res_598") {
      // 两伊停火：美苏中英法五常在历史上一致赞成 598 号决议
      return { vote: "in_favor", reason: "支持维护波斯湾航行自由与中东和平稳定，投赞成票。" };
    } else if (resolution.id === "res_660") {
      // 海湾危机：谴责伊拉克侵略科威特
      if (aiKey === "USA" || aiKey === "GBR" || aiKey === "FRA") {
        return { vote: "in_favor", reason: "坚决捍卫国际法与主权完整，支持多边反侵略行动。" };
      } else if (aiKey === "SUN") {
        return { vote: "in_favor", reason: "维护联合国多边集体安全法统，支持撤军决议。" };
      } else if (aiKey === "CHN") {
        return { vote: "in_favor", reason: "谴责以武力吞并主权国家，赞成恢复科威特独立地位。" };
      }
    } else if (resolution.id === "res_502") {
      // 马岛冲突：
      if (aiKey === "GBR" || aiKey === "USA" || aiKey === "FRA") {
        return { vote: "in_favor", reason: "支持西方盟友主权诉求与和平解决。" };
      } else {
        return { vote: "abstain", reason: "主张不结盟与和平谈判，投弃权票。" };
      }
    }

    // 3. 通用调停草案：
    if (doc.rivals.includes(resolution.sponsor)) {
      // 对手发起，若损害自身阵营则否决，否则弃权或勉强赞成
      const harmsAllies = parties.some((p) => doc.allies.includes(p));
      if (harmsAllies) return { vote: "veto", reason: "战略对手草案威胁我方同盟利益，行使否决权！" };
      return { vote: "abstain", reason: "对对手主导的多边草案持保留态度，投弃权票。" };
    }

    return { vote: "in_favor", reason: "支持多边缓和与危机管控倡议，投赞成票。" };
  }

  function canTableResolution(playerKey, resolutionId, worldState) {
    if (!playerKey) return { ok: false, reason: "旁观模式无法提交安理会决议草案" };
    const res = UNSC_RESOLUTIONS[resolutionId];
    if (!res) return { ok: false, reason: "决议草案不存在" };
    return { ok: true, isP5: UNSC_P5.includes(playerKey) };
  }

  // ---- E（玩法评审）：主动战略目标 -------------------------------------------
  // 旧 AI 是纯反应式（evaluateReactions 只在玩家出手后才回应），无自身议程。
  // 这里给每个有 doctrine 的国家声明一份「战略目标」清单，由 evaluateObjectives
  // 每 tick 评估达成度；引擎据结果自主行动（扩军/军援/制裁/管道合作），与玩家是否出手无关。
  //
  // kind:
  //   mil        —— 目标军费占比（相对 baseMil 的偏移，pp）
  //   aid        —— 对盟友的军援（{t: KEY, l: 0..2}）
  //   sanction   —— 对目标的制裁（{t: KEY, l: 0..2}）
  //   cohesion   —— 阵营内聚力（体现为对同阵营弱国的军援倾向）
  // weight 决定同 tick 内多个目标同时成立时的优先级（高者先）。
  //
  // H（玩法深度）：目标强度平滑化 ---------------------------------------------------
  // 旧版每个目标只有硬阈值 cond（成立=满强度 1、不成立=0），AI 在阈值两侧行为突变。
  // 现在给目标加 ramp(w) → [0,1] 连续强度：effWeight = weight × intensity 决定同 tick
  // 优先级，mil 偏移按 intensity 线性缩放，aid/sanction 档位按强度量化，强度同时作为
  // UI 进度条数据源（progress）。
  // **不变量**：ramp 的饱和点一律取旧 cond 的阈值（或更低），因此「旧 cond 成立」的
  // 状态区间内 intensity 恒为 1 —— 既有决策逐位不变；新行为只出现在旧 cond 不成立的
  // 过渡带（阈值下方），即把「突变开关」变为「渐进爬坡」。
  // 纯事件型条件（warActive）保持二值：战争本身就是开/关，不存在中间态。
  function rampLin(v, a, b) {
    if (typeof v !== "number" || !isFinite(v)) return 0;
    if (b === a) return v >= b ? 1 : 0;
    const t = (v - a) / (b - a);
    return t <= 0 ? 0 : (t >= 1 ? 1 : t);
  }
  // 张力爬坡：张力到达旧阈值 thr 时饱和为 1
  function rampTension(lo, thr) { return (w) => rampLin(w.tension, lo, thr); }
  // 年份爬坡：年份到达旧阈值 thr 时饱和为 1
  function rampYear(lo, thr) { return (w) => rampLin(w.year, lo, thr); }
  const OBJ_MIN_INTENSITY = 0.02;

  const STRATEGIC_OBJECTIVES = {
    USA: [
      { id: "usa_frontline_deterrence", kind: "mil", delta: +0.6, weight: 8,
        zh: "前沿遏制", ramp: rampTension(40, 55),
        note: "对苏张力高企时追加前沿威慑军费" },
      { id: "usa_ally_binding", kind: "aid", target: "DEU", l: 1, weight: 5,
        zh: "同盟绑定", ramp: rampYear(1980, 1983),
        note: "潘兴/中导部署后强化对西德安全承诺" },
      { id: "usa_gulf_oil", kind: "aid", target: "SAU", l: 1, weight: 6,
        zh: "海湾石油线", cond: (w) => !w.peace, ramp: rampYear(1978, 1981),
        note: "两伊开战后保障沙特油线与地区存在" }
    ],
    SUN: [
      { id: "sun_parity", kind: "mil", delta: +0.8, weight: 9,
        zh: "战略均势", ramp: rampTension(38, 50),
        note: "对美张力升高时恢复军备竞赛投入" },
      { id: "sun_bloc_glue", kind: "aid", target: "POL", l: 1, weight: 5,
        zh: "华约黏合", ramp: rampYear(1977, 1980),
        note: "以经援/军援维系波兰团结工会危机后的阵营" },
      { id: "sun_third_world", kind: "aid", target: "LEV", l: 1, weight: 4,
        zh: "第三世界支点", ramp: rampYear(1979, 1982),
        note: "在地中海东岸维持苏联海军与顾问存在" }
    ],
    CHN: [
      { id: "chn_sez_growth", kind: "mil", delta: -0.4, weight: 7,
        zh: "韬光养晦", ramp: rampYear(1977, 1980),
        note: "特区开放期主动压缩军费占比，把资源让给经济建设" },
      { id: "chn_prk_deterrence", kind: "aid", target: "PRK", l: 1, weight: 5,
        zh: "半岛威慑", ramp: rampYear(1981, 1984),
        note: "南北对峙升温时维持对朝安全承诺" },
      { id: "chn_pak_balance", kind: "aid", target: "PAK", l: 1, weight: 5,
        zh: "南亚制衡", ramp: rampYear(1979, 1982),
        note: "苏联入侵阿富汗后深化中巴战略协作" }
    ],
    DEU: [
      { id: "deu_detente", kind: "mil", delta: -0.5, weight: 7,
        zh: "新东方政策", ramp: rampYear(1977, 1980),
        note: "推动东西欧缓和，克制军费增速" },
      { id: "deu_gas_pipeline", kind: "aid", target: "SUN", l: 0, weight: 4,
        zh: "油气换钢管", ramp: rampYear(1978, 1981),
        note: "以经贸纽带换取能源供应与缓和红利（低档往来）" },
      { id: "deu_atlantic_bond", kind: "cohesion", weight: 5,
        zh: "大西洋纽带", ramp: rampTension(30, 45),
        note: "对抗升级时向西约同盟靠拢" }
    ],
    GBR: [
      { id: "gbr_special_relationship", kind: "aid", target: "USA", l: 1, weight: 6,
        zh: "特殊关系", ramp: rampYear(1979, 1982),
        note: "马岛胜利后强化对美协调" },
      { id: "gbr_falklands_vigil", kind: "mil", delta: +0.3, weight: 5,
        zh: "远海警戒", cond: (w) => w.year <= 1984, ramp: rampYear(1980, 1982),
        note: "马岛战后维持远海投送能力" }
    ],
    FRA: [
      { id: "fra_independence", kind: "mil", delta: +0.4, weight: 6,
        zh: "戴高乐主义", ramp: rampTension(38, 50),
        note: "对抗升级时强化独立核威慑与常规力量" },
      { id: "fra_africa_sway", kind: "aid", target: "LBY", l: 1, weight: 4,
        zh: "非洲影响", ramp: rampYear(1980, 1983),
        note: "在乍得/非洲之角维系法语区影响" }
    ],
    JPN: [
      { id: "jpn_economic_security", kind: "mil", delta: -0.2, weight: 5,
        zh: "经济优先", ramp: rampYear(1977, 1980),
        note: "贸易立国，压低军费占比" },
      { id: "jpn_sea_lane", kind: "aid", target: "KOR", l: 1, weight: 6,
        zh: "海上生命线", ramp: rampYear(1980, 1983),
        note: "保障对马海峡—波斯湾航线安全" }
    ],
    IRN: [
      { id: "irn_revolution_export", kind: "aid", target: "LEV", l: 1, weight: 6,
        zh: "革命输出", ramp: rampYear(1979, 1982),
        note: "两伊战争中向黎凡特方向延伸影响" },
      { id: "irn_war_mobilization", kind: "mil", delta: +0.7, weight: 8,
        zh: "战争动员", cond: (w) => w.warActive,
        note: "战争期间维持高战备" }
    ],
    IRQ: [
      { id: "irq_war_mobilization", kind: "mil", delta: +0.9, weight: 9,
        zh: "战争动员", cond: (w) => w.warActive,
        note: "两伊战争期间全力扩军" },
      { id: "irq_gulf_sway", kind: "aid", target: "LEV", l: 1, weight: 4,
        zh: "阿拉伯纽带", ramp: rampYear(1980, 1983),
        note: "在阿拉伯世界维系盟友圈" }
    ]
  };

  // 评估某 AI 国当前成立的目标（按 effWeight = weight × intensity 降序）。worldState 需带：
  //   tension（该国对玩家张力 0-100）、year、month、warActive、peace、
  //   playerMil（玩家军费占比，供军备落差类目标使用）、treatyCount（生效军控条约数）
  // H（玩法深度）：返回浅拷贝并附加 intensity / effWeight / progress，不再外泄数据表引用。
  function evaluateObjectives(aiKey, worldState) {
    const list = STRATEGIC_OBJECTIVES[aiKey];
    if (!list || !worldState) return [];
    const w = {
      tension: typeof worldState.tension === "number" ? worldState.tension : 20,
      year: worldState.year || 1980,
      month: worldState.month || 1,
      warActive: !!worldState.warActive,
      peace: !!worldState.peace,
      playerMil: typeof worldState.playerMil === "number" ? worldState.playerMil : 0,
      treatyCount: typeof worldState.treatyCount === "number" ? worldState.treatyCount : 0
    };
    const out = [];
    for (const o of list) {
      let gate = true;
      if (typeof o.cond === "function") { try { gate = o.cond(w); } catch (e) { gate = false; } }
      if (!gate) continue;
      let inten = 1;
      if (typeof o.ramp === "function") { try { inten = o.ramp(w); } catch (e) { inten = 1; } }
      if (typeof inten !== "number" || !isFinite(inten)) inten = 1;
      inten = inten <= 0 ? 0 : (inten >= 1 ? 1 : inten);
      if (inten <= OBJ_MIN_INTENSITY) continue;
      out.push({
        id: o.id, zh: o.zh, kind: o.kind, note: o.note || "",
        delta: typeof o.delta === "number" ? o.delta : 0,
        target: o.target, l: o.l, weight: o.weight || 0,
        intensity: inten, effWeight: (o.weight || 0) * inten, progress: inten
      });
    }
    // Array.prototype.sort 稳定：effWeight 相同时保持声明顺序（与旧版 weight 排序逐位一致）。
    out.sort((a, b) => b.effWeight - a.effWeight);
    return out;
  }

  // 把成立目标折算成「与反应式结果合并前」的自主行动增量：
  //   mil      —— 军费偏移（多个 mil 目标取最大正值 × 强度，避免叠加失控）
  //   aid      —— 军援名单（按 effWeight 降序，受 maxAid 限制）
  //   sanctions—— 自主制裁（kind=sanction，受 maxSanctions 限制）
  // H（玩法深度）：名单条目携带 intensity，由引擎（accAiDecisions）按比例折算其
  // 对目标国与自身的 pmod 效应——半心半意的目标只产生一半的军援/制裁强度。
  // 强度 = 1 时条目形态与旧版等价（只多一个 intensity 字段），既有数值逐位不变。
  function objectivesToActions(aiKey, worldState) {
    const doc = getDoctrine(aiKey, worldState && worldState.countries ? worldState.countries[aiKey] : null);
    const objs = evaluateObjectives(aiKey, worldState);
    const act = { milDelta: 0, aid: [], sanctions: [], objectives: objs };
    let aidN = 0, sanN = 0;
    for (const o of objs) {
      if (o.kind === "mil") {
        const d = o.delta * o.intensity;
        if (d > act.milDelta) act.milDelta = d;
      } else if (o.kind === "aid") {
        if (aidN >= (doc.maxAid || 1)) continue;
        if (!o.target || o.target === worldState.playerKey) continue;
        // 目标必须是已知实体（数据层外键自检）
        const tgt = worldState && worldState.countries ? worldState.countries[o.target] : null;
        if (!tgt) continue;
        act.aid.push({ t: o.target, l: typeof o.l === "number" ? o.l : 1, since: 0, obj: o.id, intensity: o.intensity });
        aidN++;
      } else if (o.kind === "sanction") {
        if (sanN >= (doc.maxSanctions || 1)) continue;
        if (!o.target) continue;
        const tgt = worldState && worldState.countries ? worldState.countries[o.target] : null;
        if (!tgt) continue;
        act.sanctions.push({ t: o.target, l: typeof o.l === "number" ? o.l : 1, since: 0, obj: o.id, intensity: o.intensity });
        sanN++;
      }
      // cohesion 类目标只作为「倾向」参与态度计算，不直接产生名单动作
    }
    return act;
  }

  window.W1980_AI = {
    AI_DOCTRINES: AI_DOCTRINES,
    STRATEGIC_OBJECTIVES: STRATEGIC_OBJECTIVES,
    getDoctrine: getDoctrine,
    calcAttitude: calcAttitude,
    evaluateReactions: evaluateReactions,
    evaluateObjectives: evaluateObjectives,
    objectivesToActions: objectivesToActions,
    TREATY_DEFS: TREATY_DEFS,
    SUMMIT_PRESETS: SUMMIT_PRESETS,
    canHoldSummit: canHoldSummit,
    evaluateBreach: evaluateBreach,
    UNSC_P5: UNSC_P5,
    UNSC_RESOLUTIONS: UNSC_RESOLUTIONS,
    evaluateUNSCVote: evaluateUNSCVote,
    canTableResolution: canTableResolution
  };
})();
