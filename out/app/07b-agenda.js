"use strict";

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
        // I（数据层工具链）：议程效果同样过词表 —— 运行期登记，构建期由校验器强制
        if (window.W1980_EFFECTS && window.W1980_EFFECTS.report) {
          window.W1980_EFFECTS.report("agenda " + cKey + "/" + ag.id, ag.effects);
        }
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
    // H（玩法深度）：议程树门控挂在「内政天平」上 —— 改革/缓和派压过对手才推得动下一步
    if (ag.condition === "domestic_reform_lead") {
      const chn = (ST.domestic && ST.domestic.chn) ? ST.domestic.chn : null;
      if (!chn) return { ok: false, reason: "内政天平尚未初始化" };
      if (!(chn.reformist > chn.planned)) {
        return { ok: false, reason: "特区/市场派权重必须高于计划/国营派（当前 " + chn.reformist.toFixed(0) + " vs " + chn.planned.toFixed(0) + "）" };
      }
    }
    if (ag.condition === "domestic_detente") {
      const deu = (ST.domestic && ST.domestic.deu) ? ST.domestic.deu : null;
      if (!deu) return { ok: false, reason: "内政天平尚未初始化" };
      if (deu.detenteDepth < 55) {
        return { ok: false, reason: "东西欧缓和深度必须 ≥ 55（当前 " + deu.detenteDepth.toFixed(1) + "）" };
      }
    }
    // K（玩法深度）：内政门控统一由数据侧声明（ag.faction），引擎只按声明求值，
    // 复制 CHN/DEU 的模板到 JPN/FRA/GBR 时无需再改引擎分支。
    //   派系型：{ key, lead, over }        —— lead 权重必须严格高于 over
    //   指标型：{ key, field, min }        —— field 必须 ≥ min
    if (ag.condition === "domestic_faction") {
      const f = ag.faction;
      if (!f || !f.key) return { ok: false, reason: "内政门控声明缺失" };
      const st = (ST.domestic && ST.domestic[f.key]) ? ST.domestic[f.key] : null;
      if (!st) return { ok: false, reason: "内政天平尚未初始化" };
      if (f.lead) {
        const a = st[f.lead], b = st[f.over];
        if (typeof a !== "number" || typeof b !== "number") return { ok: false, reason: "内政天平字段缺失" };
        if (!(a > b)) {
          return {
            ok: false,
            reason: (f.leadLabel || f.lead) + "权重必须高于" + (f.overLabel || f.over) + "（当前 " + a.toFixed(0) + " vs " + b.toFixed(0) + "）"
          };
        }
      }
      if (f.field) {
        const v = st[f.field];
        if (typeof v !== "number") return { ok: false, reason: "内政字段缺失" };
        if (v < f.min) {
          return { ok: false, reason: (f.fieldLabel || f.field) + "必须 ≥ " + f.min + "（当前 " + v.toFixed(1) + "）" };
        }
      }
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
          } else if (cKey === "CHN" && ST.domestic.chn) {
            ST.domestic.chn.unrest = clamp(ST.domestic.chn.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (cKey === "DEU" && ST.domestic.deu) {
            ST.domestic.deu.unrest = clamp(ST.domestic.deu.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (cKey === "JPN" && ST.domestic.jpn) {
            ST.domestic.jpn.unrest = clamp(ST.domestic.jpn.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (cKey === "FRA" && ST.domestic.fra) {
            ST.domestic.fra.unrest = clamp(ST.domestic.fra.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (cKey === "GBR" && ST.domestic.gbr) {
            ST.domestic.gbr.unrest = clamp(ST.domestic.gbr.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (ST.domestic.generals && ST.domestic.generals[cKey]) {
            ST.domestic.generals[cKey].stability = clamp(ST.domestic.generals[cKey].stability + ag.effects.stabilityBonus, 0, 100);
          }
        }
        // H（玩法深度）：CHN/DEU 议程树与内政天平双向联动 —— 完成节点即时回馈内政变量，
        // 使「内政门控 → 推进议程 → 内政改善 → 解锁下一步」形成闭环。
        if (cKey === "CHN" && ST.domestic && ST.domestic.chn) {
          if (ag.id === "chn_sez") ST.domestic.chn.sezMomentum = clamp(ST.domestic.chn.sezMomentum + 10, 0, 100);
          else if (ag.id === "chn_disarm") ST.domestic.chn.dualTrackPrice = clamp(ST.domestic.chn.dualTrackPrice - 8, 0, 100);
          else if (ag.id === "chn_market") {
            ST.domestic.chn.sezMomentum = clamp(ST.domestic.chn.sezMomentum + 14, 0, 100);
            ST.domestic.chn.reformist = clamp(ST.domestic.chn.reformist + 6, 0, 100);
            ST.domestic.chn.planned = clamp(ST.domestic.chn.planned - 6, 0, 100);
          }
        }
        if (cKey === "DEU" && ST.domestic && ST.domestic.deu) {
          if (ag.id === "deu_ostpolitik") ST.domestic.deu.detenteDepth = clamp(ST.domestic.deu.detenteDepth + 8, 0, 100);
          else if (ag.id === "eur_single_market_deu") ST.domestic.deu.natoBurden = clamp(ST.domestic.deu.natoBurden - 5, 0, 100);
          else if (ag.id === "eur_defense_pillar_deu") ST.domestic.deu.natoBurden = clamp(ST.domestic.deu.natoBurden + 10, 0, 100);
        }
        // K（玩法深度）：JPN/FRA/GBR 议程树与内政天平双向联动（模板同 CHN/DEU）。
        if (cKey === "JPN" && ST.domestic && ST.domestic.jpn) {
          const jpn = ST.domestic.jpn;
          if (ag.id === "jpn_black_current") {
            jpn.tradeFriction = clamp(jpn.tradeFriction - 6, 0, 100);
            jpn.exportist = clamp(jpn.exportist + 4, 0, 100);
            jpn.domesticist = clamp(jpn.domesticist - 4, 0, 100);
          } else if (ag.id === "jpn_maekawa") {
            jpn.tradeFriction = clamp(jpn.tradeFriction - 14, 0, 100);
            jpn.domesticist = clamp(jpn.domesticist + 8, 0, 100);
            jpn.exportist = clamp(jpn.exportist - 8, 0, 100);
            jpn.unrest = clamp(jpn.unrest - 2, 0, 100);
          }
        }
        if (cKey === "FRA" && ST.domestic && ST.domestic.fra) {
          const fra = ST.domestic.fra;
          if (ag.id === "fra_nationalization") {
            // 国有化 → 赤字与资本外逃：干预派得势但法郎承压、外部约束加剧
            fra.dirigiste = clamp(fra.dirigiste + 6, 0, 100);
            fra.rigueur = clamp(fra.rigueur - 6, 0, 100);
            fra.francStrength = clamp(fra.francStrength - 12, 0, 100);
            fra.externalPressure = clamp(fra.externalPressure + 10, 0, 100);
          } else if (ag.id === "fra_rigueur") {
            // 紧缩转向 → 法郎平价回升、外部压力回落，但紧缩初期民怨上升
            fra.rigueur = clamp(fra.rigueur + 8, 0, 100);
            fra.dirigiste = clamp(fra.dirigiste - 8, 0, 100);
            fra.francStrength = clamp(fra.francStrength + 15, 0, 100);
            fra.externalPressure = clamp(fra.externalPressure - 8, 0, 100);
            fra.unrest = clamp(fra.unrest + 2, 0, 100);
          } else if (ag.id === "fra_reconversion") {
            fra.francStrength = clamp(fra.francStrength + 10, 0, 100);
            fra.unrest = clamp(fra.unrest - 3, 0, 100);
          }
        }
        if (cKey === "GBR" && ST.domestic && ST.domestic.gbr) {
          const gbr = ST.domestic.gbr;
          if (ag.id === "gbr_monetarist_turn") {
            gbr.inflation = clamp(gbr.inflation - 14, 0, 100);
            gbr.cityStrength = clamp(gbr.cityStrength + 6, 0, 100);
            gbr.monetarist = clamp(gbr.monetarist + 6, 0, 100);
            gbr.welfarist = clamp(gbr.welfarist - 6, 0, 100);
            gbr.unrest = clamp(gbr.unrest + 3, 0, 100);
          } else if (ag.id === "gbr_union_reform") {
            gbr.inflation = clamp(gbr.inflation - 6, 0, 100);
            gbr.cityStrength = clamp(gbr.cityStrength + 4, 0, 100);
            gbr.unrest = clamp(gbr.unrest + 4, 0, 100);
          } else if (ag.id === "gbr_wider_shareholding") {
            gbr.cityStrength = clamp(gbr.cityStrength + 8, 0, 100);
            gbr.unrest = clamp(gbr.unrest - 4, 0, 100);
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
