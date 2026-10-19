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
    // M3：门控名字必须先登记在 data/agenda-conditions.js。未登记的名字一律**判未通过**
    // —— 一个无法求值的条件绝不能默认放行（那正是「写错名字 → 门控静默失效」的成因）。
    const condReg = window.W1980_AGENDA_CONDITIONS;
    if (!condReg || typeof condReg.isRegistered !== "function" || !condReg.isRegistered(ag.condition)) {
      return { ok: false, reason: "未注册的议程门控『" + ag.condition + "』（见 data/agenda-conditions.js）" };
    }

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
      // N1：完成回馈改为**数据声明式**。此前这里是 7 国 if-else + 14 段按议程 id 的
      // 硬编码，加一个国家的议程树就必须回来改引擎。现在：
      //   · 通用规则（短缺 / 安定 / 国会）按「本国状态里有没有这个字段」分派；
      //   · 每项议程的专属回馈由 agendas.js 的 `onComplete: {字段: 增量}` 声明。
      const st = domesticStateOf(cKey);
      if (st && ag.effects) {
        // 短缺：只有拥有 shortage 的内政模型（苏联）会命中
        if (typeof ag.effects.domesticShortage === "number" && typeof st.shortage === "number") {
          st.shortage = clamp(st.shortage + ag.effects.domesticShortage, 0, 100);
        }
        // 安定：专属内政有 unrest 而无 stability → 压动荡；通用国家相反 → 抬稳定性
        if (typeof ag.effects.stabilityBonus === "number") {
          if (typeof st.unrest === "number" && typeof st.stability !== "number") {
            st.unrest = clamp(st.unrest - ag.effects.stabilityBonus * 0.4, 0, 100);
          } else if (typeof st.stability === "number") {
            st.stability = clamp(st.stability + ag.effects.stabilityBonus, 0, 100);
          }
        }
        // 国会：只有拥有 congressApproval 的内政模型（美国）会命中
        if (typeof ag.effects.congressBonus === "number" && typeof st.congressApproval === "number") {
          st.congressApproval = clamp(st.congressApproval + ag.effects.congressBonus, 0, 100);
        }
      }
      // 议程专属回馈：完全由数据声明，引擎不认任何国家名或议程 id
      if (st && ag.onComplete && typeof ag.onComplete === "object") {
        for (const field in ag.onComplete) {
          const delta = ag.onComplete[field];
          if (typeof delta !== "number" || !isFinite(delta)) continue;
          if (typeof st[field] !== "number") continue;
          st[field] = clamp(st[field] + delta, 0, 100);
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
