"use strict";


// ---- R10A：冷战大国战略性格与反应式 AI 决策机 ----
function dispatchDiplomaticCable(cable, y, m, silent) {
  if (!cable) return;
  const fromZh = (CM.countries[cable.from] || {}).zh || cable.from;
  const item = {
    id: "cable_" + cable.from + "_" + y + "_" + m + "_" + cable.type,
    y: y,
    m: m,
    zh: "【外交照会】" + fromZh + "：" + cable.zh,
    note: cable.desc
  };
  if (ST.ai && Array.isArray(ST.ai.cables)) {
    ST.ai.cables.push(item);
  }
  EV.items.push(item);
  EV.unread++;
  renderInbox();
  if (!silent) toast(item);
}

function updateAIDecisions(y, m, silent) {
  if (!window.W1980_AI || !CM.countries) return;
  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!isAIActive()) {
    ST.ai.decisions = {};
    ST.ai.tensions = {};
    return;
  }

  const curY = y || (SIM.S ? SIM.S.year : 1980);
  const curM = m || (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const playerDecisions = {
    mil: ST.mil,
    sanctions: ST.sanctions || [],
    aid: ST.aid || []
  };
  const worldState = {
    countries: CM.countries,
    year: curY,
    month: curM,
    frontlines: ST.frontlines,
    treaties: ST.ai.treaties || []
  };

  const newDecisions = {};
  const newTensions = {};

  for (const k in CM.countries) {
    if (k === ST.player) continue;
    const att = window.W1980_AI.calcAttitude(k, ST.player, playerDecisions, worldState);
    newTensions[k] = att;

    const react = window.W1980_AI.evaluateReactions(k, ST.player, playerDecisions, worldState);
    if (react) {
      // E（玩法评审）：主动战略目标 —— 与玩家是否出手无关，AI 按自身议程行动。
      // 合并规则：mil 取 max(反应式, 基础+目标偏移)；aid 名单合并去重（受 maxAid 限）；
      // 自主 sanctions 仅在反应式没有对该玩家反制时追加（避免双重惩罚）。
      let mil = react.mil;
      let aidList = (react.aid || []).slice();
      let sanList = (react.sanctions || []).slice();
      let objectives = [];
      if (window.W1980_AI.objectivesToActions) {
        const ow = {
          countries: CM.countries, year: curY, month: curM,
          tension: (newTensions[k] && typeof newTensions[k].tension === "number") ? newTensions[k].tension : 20,
          warActive: !!(ST.frontlines && Object.keys(ST.frontlines).length),
          peace: false, playerKey: ST.player
        };
        const act = window.W1980_AI.objectivesToActions(k, ow);
        objectives = act.objectives || [];
        if (act.milDelta > 0) mil = Math.max(mil, react.mil + act.milDelta);
        const doc = window.W1980_AI.getDoctrine(k, CM.countries[k]);
        const maxAid = doc.maxAid || 1;
        for (const a of act.aid) {
          if (aidList.length >= maxAid) break;
          if (!aidList.some((x) => x.t === a.t)) aidList.push(a);
        }
        if (sanList.length === 0 && act.sanctions.length) sanList = act.sanctions.slice();
      }

      newDecisions[k] = {
        mil: mil,
        sanctions: sanList,
        aid: aidList,
        objectives: objectives.map((o) => ({ id: o.id, zh: o.zh, kind: o.kind, note: o.note || "" }))
      };

      const oldDec = ST.ai.decisions ? ST.ai.decisions[k] : null;
      const hadSan = oldDec && Array.isArray(oldDec.sanctions) && oldDec.sanctions.length > 0;
      const nowSan = Array.isArray(sanList) && sanList.length > 0;
      const doc = window.W1980_AI.getDoctrine(k, CM.countries[k]);
      const hadMilUp = oldDec && typeof oldDec.mil === "number" && oldDec.mil > doc.baseMil + 0.05;
      const nowMilUp = mil > doc.baseMil + 0.05;

      if (!hadSan && nowSan && react.cable) {
        dispatchDiplomaticCable(react.cable, curY, curM, silent);
      } else if (hadSan && !nowSan) {
        const kZh = (CM.countries[k] || {}).zh || k;
        dispatchDiplomaticCable({
          type: "counter_sanction_revoked",
          from: k,
          target: ST.player,
          zh: "解除经贸反制",
          desc: kZh + "鉴于双方经贸争端缓解，宣布撤销对我国施加的一切反制裁措施。"
        }, curY, curM, silent);
      } else if (!hadMilUp && nowMilUp) {
        const kZh = (CM.countries[k] || {}).zh || k;
        dispatchDiplomaticCable({
          type: "arms_race_escalation",
          from: k,
          target: ST.player,
          zh: "防务戒备升级",
          desc: kZh + "鉴于我国强化战略军备态势，正式进入防务戒备并将预算提升至 " + mil.toFixed(1) + "% GDP！"
        }, curY, curM, silent);
      }
    }
  }

  // R10B：军控条约履约与违约判定回路 (Treaty Compliance & Breach Evaluation)
  if (Array.isArray(ST.ai.treaties)) {
    for (let i = 0; i < ST.ai.treaties.length; i++) {
      const tr = ST.ai.treaties[i];
      if (tr && tr.status === "active") {
        const br = window.W1980_AI.evaluateBreach(tr, playerDecisions, newDecisions[tr.with]);
        if (br && br.breached) {
          tr.warnings = (tr.warnings || 0) + 1;
          const aiZh = (CM.countries[tr.with] || {}).zh || tr.with;
          const tZh = (window.W1980_AI.TREATY_DEFS[tr.id] || {}).zh || tr.id;
          if (tr.warnings === 1) {
            dispatchDiplomaticCable({
              type: "treaty_breach_warning",
              from: tr.with,
              target: ST.player,
              zh: "军控履约照会",
              desc: "【违约抗议照会】" + aiZh + "抗议我国违反" + tZh + "规定：" + br.reason + "！敦促立即纠正，否则将单方面撕毁条约！"
            }, curY, curM, silent);
          } else if (tr.warnings >= 2) {
            tr.status = "nullified";
            tr.nullifiedReason = br.reason;
            dispatchDiplomaticCable({
              type: "treaty_nullified",
              from: tr.with,
              target: ST.player,
              zh: "条约单方面作废",
              desc: "【军控体系破裂】鉴于我国屡次违背军控承诺，" + aiZh + "正式宣告" + tZh + "废止！和平红利立即清零，双边戒备全面升级！"
            }, curY, curM, silent);
          }
        } else {
          tr.warnings = 0; // 恢复合规
        }
      }
    }
  }

  ST.ai.tensions = newTensions;
  ST.ai.decisions = newDecisions;

  applyPlayerDecisions();
  if (ST.sel) refreshAIBox(ST.sel);
}

function refreshAIBox(selKey) {
  const box = $("p-ai-box");
  if (!box) return;
  if (!selKey || !CM.countries[selKey] || !window.W1980_AI) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  const c = CM.countries[selKey];
  const doc = window.W1980_AI.getDoctrine(selKey, c);
  const isPlayer = !!ST.player && selKey === ST.player;

  if (isPlayer) {
    let h = '<div class="aih"><span>国家战略性格画像</span><span class="ai-badge ok">玩家直辖</span></div>';
    h += '<div class="ai-doctrine">';
    h += '<div class="ai-doc-name">' + doc.name + ' (' + doc.doctrine + ')</div>';
    h += '<div class="ai-doc-desc">' + doc.desc + '</div>';
    h += '</div>';
    h += '<div class="ai-stat"><span class="k">防务基准预算</span><span class="v">' + doc.baseMil.toFixed(1) + '% GDP</span></div>';
    box.innerHTML = h;
    box.style.display = "block";
    return;
  }

  const att = (ST.ai && ST.ai.tensions && ST.ai.tensions[selKey]) ? ST.ai.tensions[selKey] :
    window.W1980_AI.calcAttitude(selKey, ST.player, { mil: ST.mil, sanctions: ST.sanctions, aid: ST.aid }, { countries: CM.countries, treaties: ST.ai ? ST.ai.treaties : [] });
  const dec = (ST.ai && ST.ai.decisions && ST.ai.decisions[selKey]) || null;
  const curMil = (dec && typeof dec.mil === "number") ? dec.mil : doc.baseMil;
  const milDelta = +(curMil - doc.baseMil).toFixed(1);

  let h = '<div class="aih"><span>AI 战略性格与对华/对我国态度</span><span class="ai-badge ' + att.cls + '">' + att.label + '（张力 ' + att.tension + '）</span></div>';
  h += '<div class="ai-doctrine">';
  h += '<div class="ai-doc-name">' + doc.name + ' (' + doc.doctrine + ')</div>';
  h += '<div class="ai-doc-desc">' + doc.desc + '</div>';
  h += '</div>';

  h += '<div class="ai-stat"><span class="k">防务预算支出</span><span class="v' + (milDelta > 0.05 ? ' bad' : '') + '">' + curMil.toFixed(1) + '% GDP' +
    (milDelta > 0.05 ? '（跟进动员 +' + milDelta.toFixed(1) + '%）' : (milDelta < -0.05 ? '（军备缓和 ' + milDelta.toFixed(1) + '%）' : '')) + '</span></div>';

  const actions = [];
  if (dec && Array.isArray(dec.sanctions) && dec.sanctions.length > 0) {
    for (let i = 0; i < dec.sanctions.length; i++) {
      const s = dec.sanctions[i];
      actions.push('⚠️ 对我国实施对等反制裁（' + DEC_TIERS.san[s.l].zh + '，对方 -' + DEC_TIERS.san[s.l].tgt.toFixed(1) + 'pp/年）');
    }
  }
  if (dec && Array.isArray(dec.aid) && dec.aid.length > 0) {
    for (let i = 0; i < dec.aid.length; i++) {
      const a = dec.aid[i];
      const tZh = (CM.countries[a.t] || {}).zh || a.t;
      actions.push('🛡️ 向 ' + tZh + ' 提供对冲军援（' + DEC_TIERS.aid[a.l].zh + '）');
    }
  }
  if (milDelta > 0.05) {
    actions.push('⚔️ 军备竞赛警戒：防务支出已动员提升至 ' + curMil.toFixed(1) + '% GDP');
  }

  // E（玩法评审）：主动战略目标展示 —— 让玩家看见 AI「自己在想什么」，
  // 而不只是它对玩家动作的反应。
  if (dec && Array.isArray(dec.objectives) && dec.objectives.length > 0) {
    h += '<div class="ai-treaties-wrap"><div class="ai-treaty-title">🎯 主动战略目标（与我国行动无关）</div>';
    for (let i = 0; i < dec.objectives.length; i++) {
      const o = dec.objectives[i];
      const kindZh = o.kind === "mil" ? "军费调整" : (o.kind === "aid" ? "对外军援" :
        (o.kind === "sanction" ? "自主制裁" : "阵营倾向"));
      h += '<div class="ai-action-item">🎯 <b>' + o.zh + '</b>（' + kindZh + '）' +
        (o.note ? '<span style="color:var(--dim)"> — ' + o.note + '</span>' : '') + '</div>';
    }
    h += '</div>';
  }

  if (actions.length > 0) {
    h += '<div class="ai-action-list">';
    for (let i = 0; i < actions.length; i++) {
      h += '<div class="ai-action-item">' + actions[i] + '</div>';
    }
    h += '</div>';
  } else {
    h += '<div class="ai-stat" style="margin-top:3px"><span class="k">当前反制姿态</span><span class="v" style="color:var(--dim)">无敌对制裁与对冲行动</span></div>';
  }

  // R10B：生效军控条约与和平红利展示
  if (ST.ai && Array.isArray(ST.ai.treaties)) {
    const activeTs = ST.ai.treaties.filter((t) => t.with === selKey && t.status === "active");
    if (activeTs.length > 0) {
      h += '<div class="ai-treaties-wrap">';
      h += '<div class="ai-treaty-title">🕊️ 生效军控条约与和平红利</div>';
      for (let i = 0; i < activeTs.length; i++) {
        const at = activeTs[i];
        const tDef = (window.W1980_AI.TREATY_DEFS && window.W1980_AI.TREATY_DEFS[at.id]) || { zh: at.id, dividend: 0 };
        h += '<div class="ai-treaty-badge-item">';
        h += '<span>' + tDef.zh + '</span>';
        h += '<b style="color:var(--gold2)">+' + (at.dividend || tDef.dividend || 0).toFixed(2) + 'pp/年</b>';
        h += '</div>';
      }
      h += '</div>';
    }
  }

  if (ST.player && selKey !== ST.player) {
    h += '<button class="btn ai-summit-btn" id="p-ai-summit-btn">🕊️ 开启首脑峰会外交谈判</button>';
  }

  box.innerHTML = h;
  box.style.display = "block";

  const summitBtn = $("p-ai-summit-btn");
  if (summitBtn) {
    summitBtn.onclick = () => {
      openSummitModal(null, selKey);
    };
  }
}

// R10B：首脑峰会外交谈判与条约签署函数群
function openSummitModal(summitPresetId, targetAiKey) {
  const modal = $("summit-modal");
  if (!modal) return;
  if (!ST.player) {
    toast({ y: "—", m: "", zh: "旁观模式提示", note: "请先在开局或选国中选择你的国家，方可开启大国首脑外交会晤！" });
    return;
  }
  if (window.W1980_SOUND) window.W1980_SOUND.playHotline();
  const ctx = summitContext(summitPresetId, targetAiKey);
  if (!ctx) return;
  fillSummitHeader(ctx);
  fillSummitTreaties(ctx);
  fillSummitPhoto(ctx);
  modal.style.display = "flex";
}

// R10B：峰会上下文——对手解析（预设 → 指定目标 → 当前选中 → 宿敌 → 默认对极）与态度计算
function summitContext(summitPresetId, targetAiKey) {
  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;
  let preset = null;
  if (summitPresetId && window.W1980_AI && window.W1980_AI.SUMMIT_PRESETS) {
    preset = window.W1980_AI.SUMMIT_PRESETS.find((p) => p.id === summitPresetId);
  }

  let aiKey = targetAiKey;
  if (!aiKey && preset && Array.isArray(preset.participants)) {
    aiKey = preset.participants.find((p) => p !== ST.player);
  }
  if (!aiKey) {
    if (ST.sel && ST.sel !== ST.player && CM.countries[ST.sel]) {
      aiKey = ST.sel;
    } else {
      const pDoc = (window.W1980_AI && window.W1980_AI.AI_DOCTRINES) ? window.W1980_AI.AI_DOCTRINES[ST.player] : null;
      if (pDoc && pDoc.rivals && pDoc.rivals.length > 0) aiKey = pDoc.rivals[0];
      else if (ST.player === "USA") aiKey = "SUN";
      else if (ST.player === "SUN") aiKey = "USA";
      else aiKey = (CM.countries[ST.player] && (CM.countries[ST.player].bloc === "NATO" || CM.countries[ST.player].bloc === "W")) ? "SUN" : "USA";
    }
  }

  if (!CM.countries[aiKey] || aiKey === ST.player) {
    toast({ y: "—", m: "", zh: "会晤目标无效", note: "无法与自身或未定义实体开启首脑谈判！" });
    return null;
  }

  const pName = (CM.countries[ST.player] || {}).zh || ST.player;
  const aiName = (CM.countries[aiKey] || {}).zh || aiKey;
  const doc = (window.W1980_AI && window.W1980_AI.getDoctrine) ? window.W1980_AI.getDoctrine(aiKey, CM.countries[aiKey]) : { name: "中立国家", doctrine: "neutral" };
  const att = (ST.ai && ST.ai.tensions && ST.ai.tensions[aiKey]) ? ST.ai.tensions[aiKey] :
    (window.W1980_AI ? window.W1980_AI.calcAttitude(aiKey, ST.player, { mil: ST.mil, sanctions: ST.sanctions, aid: ST.aid }, { countries: CM.countries, treaties: ST.ai ? ST.ai.treaties : [] }) : { tension: 50, label: "警惕戒备" });

  return { preset: preset, aiKey: aiKey, curY: curY, curM: curM, pName: pName, aiName: aiName, doc: doc, att: att };
}

// 峰会头部信息填充（地点/主题/双方/张力态势/战略学说）
function fillSummitHeader(ctx) {
  const preset = ctx.preset, curY = ctx.curY, curM = ctx.curM, pName = ctx.pName, aiName = ctx.aiName, att = ctx.att, doc = ctx.doc;
  const locEl = $("summit-loc");
  const titleEl = $("summit-title");
  const descEl = $("summit-desc");
  const pNameEl = $("summit-p-name");
  const aiNameEl = $("summit-ai-name");
  const tensionEl = $("summit-tension-info");
  const docEl = $("summit-doctrine-info");

  if (locEl) locEl.textContent = preset ? (preset.city + " · " + preset.year + " 年 " + preset.month + " 月") : ("双边战略峰会 · " + curY + " 年 " + curM + " 月");
  if (titleEl) titleEl.textContent = preset ? preset.name : ("大国首脑会晤：" + pName + " ✕ " + aiName);
  if (descEl) descEl.textContent = preset ? preset.agenda : ("最高层闭门决断：通过军控妥协与缓和议程，释放巨额和平红利，重塑冷战均势格局。");
  if (pNameEl) pNameEl.textContent = pName;
  if (aiNameEl) aiNameEl.textContent = aiName;
  if (tensionEl) tensionEl.textContent = att.tension + " 点（" + att.label + "）";
  if (docEl) docEl.textContent = doc.name + " (" + doc.doctrine + ")";

}

// 峰会条约卡片列表（R10B：签署状态、条款标签与签署接线）
function fillSummitTreaties(ctx) {
  const preset = ctx.preset, aiKey = ctx.aiKey;
  const listEl = $("summit-treaty-list");
  if (listEl && window.W1980_AI && window.W1980_AI.TREATY_DEFS) {
    listEl.innerHTML = "";
    const treatyKeys = (preset && preset.treatyIds) ? preset.treatyIds : Object.keys(window.W1980_AI.TREATY_DEFS);
    const activeTreaties = (ST.ai && Array.isArray(ST.ai.treaties)) ? ST.ai.treaties : [];

    for (let i = 0; i < treatyKeys.length; i++) {
      const tId = treatyKeys[i];
      const tDef = window.W1980_AI.TREATY_DEFS[tId];
      if (!tDef) continue;

      const signed = activeTreaties.find((t) => t.id === tId && t.with === aiKey && t.status === "active");

      const card = document.createElement("div");
      card.className = "summit-treaty-card" + (signed ? " signed" : "");

      let ch = '<div class="stc-hd">';
      ch += '<div class="stc-name">' + tDef.zh + '</div>';
      ch += '<div class="stc-badge ' + (signed ? 'signed' : 'pending') + '">' + (signed ? '🕊️ 已签署履约中' : '待签署') + '</div>';
      ch += '</div>';

      ch += '<div class="stc-desc">' + tDef.desc + '</div>';

      ch += '<div class="stc-terms">';
      if (typeof tDef.milCap === "number") ch += '<span class="stc-term-tag">🛡️ 防务上限 ≤ ' + tDef.milCap.toFixed(1) + '% GDP</span>';
      if (typeof tDef.maxSanctionLvl === "number") ch += '<span class="stc-term-tag">🚫 撤销经贸封锁</span>';
      if (typeof tDef.tensionCap === "number") ch += '<span class="stc-term-tag">🔒 张力上限 ≤ ' + tDef.tensionCap + ' 点</span>';
      ch += '<span class="stc-term-tag" style="color:var(--gold2)">📈 和平红利 +' + (tDef.dividend || 0).toFixed(2) + 'pp/年</span>';
      ch += '</div>';

      ch += '<div class="stc-actions">';
      if (signed) {
        ch += '<button class="btn stc-sign-btn" disabled style="opacity:0.6">已生效履行</button>';
      } else {
        ch += '<button class="btn stc-sign-btn" data-tid="' + tId + '">签署条约 (Sign Treaty)</button>';
      }
      ch += '</div>';

      card.innerHTML = ch;

      const signBtn = card.querySelector(".stc-sign-btn:not([disabled])");
      if (signBtn) {
        signBtn.onclick = () => {
          signTreaty(tId, aiKey, preset);
        };
      }

      listEl.appendChild(card);
    }
  }

}

// R14：首脑会晤历史画报
function fillSummitPhoto(ctx) {
  const preset = ctx.preset, curY = ctx.curY;
  const sPhotoBox = $("summit-photo-box");
  const sPhotoImg = $("summit-photo-img");
  const sPhotoCap = $("summit-photo-caption");
  if (sPhotoBox && sPhotoImg && sPhotoCap && window.W1980_ASSETS) {
    const pId = preset ? preset.id : (curY >= 1986 ? "reykjavik_1986" : "geneva_1985");
    const p = window.W1980_ASSETS.getNewsPhoto(pId) || window.W1980_ASSETS.getNewsPhoto("geneva_1985");
    if (p) {
      sPhotoImg.src = p.url;
      sPhotoCap.textContent = p.caption;
      sPhotoBox.style.display = "block";
    } else {
      sPhotoBox.style.display = "none";
    }
  }

}

function closeSummitModal() {
  const modal = $("summit-modal");
  if (modal) modal.style.display = "none";
}

function walkoutSummit() {
  closeSummitModal();
  if (!ST.player) return;
  toast({
    y: SIM.S ? SIM.S.year : 1980,
    m: SIM.S ? Math.max(1, SIM.S.month) : 1,
    zh: "【首脑峰会破裂】双方拂袖而去",
    note: "由于核心战略互信赤字与诉求落差，首脑谈判不欢而散，双边张力急剧上升！"
  });
}

function signTreaty(treatyId, aiKey, preset) {
  if (!ST.player || !window.W1980_AI || !window.W1980_AI.TREATY_DEFS) return;
  const tDef = window.W1980_AI.TREATY_DEFS[treatyId];
  if (!tDef) return;

  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!Array.isArray(ST.ai.treaties)) ST.ai.treaties = [];

  const existing = ST.ai.treaties.find((t) => t.id === treatyId && t.with === aiKey && t.status === "active");
  if (existing) {
    toast({ y: "—", m: "", zh: "条约已生效", note: "该军控条约已在履行中，无需重复签署。" });
    return;
  }

  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

  if (treatyId === "inf" && ST.mil > 4.0) {
    ST.mil = 4.0;
    refreshMilBox();
  }
  if (treatyId === "start") {
    decSet("san", aiKey, -1);
  }

  ST.ai.treaties.push({
    id: treatyId,
    with: aiKey,
    sinceYear: curY,
    sinceMonth: curM,
    status: "active",
    dividend: tDef.dividend || 0,
    warnings: 0
  });

  const aiZh = (CM.countries[aiKey] || {}).zh || aiKey;
  const pZh = (CM.countries[ST.player] || {}).zh || ST.player;

  const cableItem = {
    type: "treaty_signed",
    from: aiKey,
    target: ST.player,
    zh: "签署" + tDef.zh,
    desc: "【军控外交突破】" + pZh + "与" + aiZh + "正式签署" + tDef.zh + "！双方共享 +" + (tDef.dividend || 0).toFixed(2) + "pp/年 结构性和平红利！"
  };
  dispatchDiplomaticCable(cableItem, curY, curM, false);
  if (window.W1980_SOUND) window.W1980_SOUND.playTreaty();

  updateAIDecisions(curY, curM, false);
  openSummitModal(preset ? preset.id : null, aiKey);
  if (ST.sel) refreshAIBox(ST.sel);
}

// ---- R10C：联合国安全理事会（UNSC）多边调停与一票否决权机制 ----
let curUNSCResId = "res_598";

function openUNSCModal(resolutionId) {
  const modal = $("unsc-modal");
  if (!modal) return;

  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

  if (resolutionId) {
    curUNSCResId = resolutionId;
  } else if (!curUNSCResId) {
    if (curY >= 1990) curUNSCResId = "res_660";
    else if (curY === 1982 && curM >= 4 && curM <= 6) curUNSCResId = "res_502";
    else curUNSCResId = "res_598";
  }

  if (!window.W1980_AI || !window.W1980_AI.UNSC_RESOLUTIONS) return;
  const res = window.W1980_AI.UNSC_RESOLUTIONS[curUNSCResId] || window.W1980_AI.UNSC_RESOLUTIONS.res_598;
  curUNSCResId = res.id;

  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

  // 同步下拉框与标题
  const selEl = $("unsc-res-select");
  if (selEl) selEl.value = curUNSCResId;
  const titleEl = $("unsc-res-title");
  if (titleEl) titleEl.textContent = res.name;

  // 发起方与草案正文
  const sponsorEl = $("unsc-res-sponsor");
  if (sponsorEl) {
    let spText = "联合国安全理事会协商起草";
    if (res.sponsor && res.sponsor !== "UNSC" && res.sponsor !== "player") {
      spText = ((CM.countries[res.sponsor] || {}).zh || res.sponsor) + " 提案";
    } else if (res.sponsor === "player" && ST.player) {
      spText = ((CM.countries[ST.player] || {}).zh || ST.player) + " 发起草案";
    }
    sponsorEl.textContent = spText;
  }

  const textEl = $("unsc-res-text");
  if (textEl) textEl.textContent = res.summary;

  const isPassed = Array.isArray(ST.ai.unsc.passed) && ST.ai.unsc.passed.includes(curUNSCResId);
  const vetoRecord = Array.isArray(ST.ai.unsc.history) ? ST.ai.unsc.history.slice().reverse().find((h) => h.id === curUNSCResId && h.status === "vetoed") : null;

  // 渲染五常席位卡片
  const gridEl = $("unsc-p5-grid");
  if (gridEl) {
    gridEl.innerHTML = "";
    const flags = { USA: "🇺🇸", SUN: "☭", CHN: "🇨🇳", GBR: "🇬🇧", FRA: "🇫🇷" };

    for (let i = 0; i < window.W1980_AI.UNSC_P5.length; i++) {
      const p5Key = window.W1980_AI.UNSC_P5[i];
      const ctry = CM.countries[p5Key] || {};
      const isPlayer = (ST.player === p5Key);

      const card = document.createElement("div");
      card.className = "p5-card" + (isPlayer ? " is-player" : "");

      let voteClass = "in_favor";
      let voteLabel = "赞成 (In Favor)";
      let reasonText = "支持维护和平与国际法秩序";

      if (isPassed) {
        voteClass = "in_favor";
        voteLabel = "赞成 (In Favor)";
        reasonText = isPlayer ? "本国常任理事国席位投赞成票" : "决议已通过生效";
      } else if (vetoRecord && vetoRecord.votes && vetoRecord.votes[p5Key]) {
        const v = vetoRecord.votes[p5Key];
        voteClass = v.vote;
        voteLabel = v.vote === "veto" ? "一票否决 (VETO)" : (v.vote === "abstain" ? "弃权 (Abstain)" : "赞成 (In Favor)");
        reasonText = v.reason || "";
      } else {
        if (isPlayer) {
          voteClass = "abstain";
          voteLabel = "待表决 (Pending)";
          reasonText = "等待玩家行使常任理事国表决权";
        } else {
          const aiV = window.W1980_AI.evaluateUNSCVote(p5Key, res, { countries: CM.countries, player: ST.player });
          voteClass = aiV.vote;
          voteLabel = aiV.vote === "veto" ? "一票否决 (VETO)" : (aiV.vote === "abstain" ? "弃权 (Abstain)" : "赞成 (In Favor)");
          reasonText = aiV.reason;
        }
      }

      let ch = '<div class="p5-flag">' + (flags[p5Key] || "") + " " + (ctry.zh || p5Key) + '</div>';
      ch += '<div class="p5-role">' + (isPlayer ? '常任理事国 (本国席位)' : '常任理事国') + '</div>';
      ch += '<div class="p5-vote-tag ' + voteClass + '">' + voteLabel + '</div>';
      ch += '<div class="p5-reason">' + reasonText + '</div>';
      card.innerHTML = ch;
      gridEl.appendChild(card);
    }
  }

  // 状态横幅与表决按钮状态
  const banner = $("unsc-status-banner");
  const bannerText = $("unsc-status-text");
  const btnFavor = $("unsc-vote-favor");
  const btnAbstain = $("unsc-vote-abstain");
  const btnVeto = $("unsc-vote-veto");

  const isP5Player = !!(ST.player && window.W1980_AI.UNSC_P5.includes(ST.player));

  if (isPassed) {
    if (banner) banner.className = "unsc-status-banner passed";
    if (bannerText) bannerText.textContent = "【决议已生效】该决议已在安理会表决通过，各项国际法效力履约中。";
    if (btnFavor) btnFavor.disabled = true;
    if (btnAbstain) btnAbstain.disabled = true;
    if (btnVeto) btnVeto.disabled = true;
  } else if (vetoRecord) {
    const vZh = (CM.countries[vetoRecord.vetoBy] || {}).zh || vetoRecord.vetoBy;
    if (banner) banner.className = "unsc-status-banner vetoed";
    if (bannerText) bannerText.textContent = "【草案遭否决】该草案在安理会审议中遭常任理事国（" + vZh + "）行使一票否决权（VETO）否决。";
    if (btnFavor) btnFavor.disabled = true;
    if (btnAbstain) btnAbstain.disabled = true;
    if (btnVeto) btnVeto.disabled = true;
  } else {
    if (banner) banner.className = "unsc-status-banner";
    if (bannerText) bannerText.textContent = isP5Player ?
      "草案审议中：需要至少 3 票赞成且零否决方可通过。请常任理事国代表行使表决权。" :
      (!ST.player ? "旁观模式仅供列席观摩联合国安理会审议。" : "非五常国家仅供列席观摩安理会多边审议程序。");

    if (btnFavor) btnFavor.disabled = !isP5Player;
    if (btnAbstain) btnAbstain.disabled = !isP5Player;
    if (btnVeto) btnVeto.disabled = !isP5Player;
  }

  // R14: 安理会决议裁决印章
  const uStamp = $("unsc-stamp-img");
  if (uStamp) {
    if (isPassed) {
      uStamp.src = "assets/ui/stamp_ratified.png";
      uStamp.style.display = "block";
    } else if (vetoRecord) {
      uStamp.src = "assets/ui/stamp_vetoed.png";
      uStamp.style.display = "block";
    } else {
      uStamp.style.display = "none";
    }
  }

  modal.style.display = "flex";
}

function closeUNSCModal() {
  const modal = $("unsc-modal");
  if (modal) modal.style.display = "none";
}

function voteUNSC(voteType) {
  if (!ST.player || !window.W1980_AI || !window.W1980_AI.UNSC_P5.includes(ST.player)) {
    toast({ y: "—", m: "", zh: "无表决权提示", note: "只有联合国安理会五大常任理事国（P5）拥有一票否决权与正式表决席位！" });
    return;
  }

  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

  const res = window.W1980_AI.UNSC_RESOLUTIONS[curUNSCResId];
  if (!res) return;

  if (ST.ai.unsc.passed.includes(res.id)) {
    toast({ y: "—", m: "", zh: "决议已生效", note: "该决议已在安理会通过生效，不可重复表决。" });
    return;
  }

  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

  const votes = {};
  let vetoes = 0;
  let favors = 0;
  let abstains = 0;
  let vetoCountry = null;

  for (let i = 0; i < window.W1980_AI.UNSC_P5.length; i++) {
    const p5 = window.W1980_AI.UNSC_P5[i];
    if (p5 === ST.player) {
      const pReason = (voteType === "veto") ? "玩家常任理事国代表行使一票否决权" :
        (voteType === "in_favor" ? "玩家常任理事国代表投赞成票" : "玩家常任理事国代表投弃权票");
      votes[p5] = { vote: voteType, reason: pReason };
    } else {
      votes[p5] = window.W1980_AI.evaluateUNSCVote(p5, res, { countries: CM.countries, player: ST.player });
    }

    if (votes[p5].vote === "veto") {
      vetoes++;
      if (!vetoCountry) vetoCountry = p5;
    } else if (votes[p5].vote === "in_favor") {
      favors++;
    } else {
      abstains++;
    }
  }

  if (window.W1980_SOUND) window.W1980_SOUND.playGavel();

  if (vetoes > 0) {
    const vZh = (CM.countries[vetoCountry] || {}).zh || vetoCountry;
    ST.ai.unsc.history.push({
      id: res.id,
      year: curY,
      month: curM,
      status: "vetoed",
      votes: votes,
      vetoBy: vetoCountry
    });
    toast({
      y: curY,
      m: curM,
      zh: "【安理会一票否决】" + res.shortTitle + " 未获通过",
      note: vZh + " 在安理会行使一票否决权（VETO），阻断了草案的通过！"
    });
    dispatchDiplomaticCable({
      type: "unsc_veto",
      from: vetoCountry,
      target: "UNSC",
      zh: "否决" + res.shortTitle,
      desc: vZh + " 在联合国安理会动用常任理事国一票否决权，阻止了 " + res.name + " 的通过。"
    }, curY, curM, false);
  } else if (favors >= 3) {
    executeResolution(res, votes);
  } else {
    ST.ai.unsc.history.push({
      id: res.id,
      year: curY,
      month: curM,
      status: "failed",
      votes: votes
    });
    toast({
      y: curY,
      m: curM,
      zh: "【决议未获通过】赞成票未达门槛",
      note: "该草案仅获得 " + favors + " 票赞成（需至少 3 票），未获通过。"
    });
  }

  openUNSCModal(res.id);
}

function executeResolution(res, votes) {
  if (window.W1980_SOUND) window.W1980_SOUND.playGavel();
  if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };
  if (!ST.ai.unsc) ST.ai.unsc = { passed: [], history: [] };

  if (!ST.ai.unsc.passed.includes(res.id)) {
    ST.ai.unsc.passed.push(res.id);
  }

  const curY = SIM.S ? SIM.S.year : 1980;
  const curM = SIM.S ? Math.max(1, SIM.S.month) : 1;

  ST.ai.unsc.history.push({
    id: res.id,
    year: curY,
    month: curM,
    status: "passed",
    votes: votes || {}
  });

  // 落地决议具体实操效力
  if (res.id === "res_598") {
    setFrontline(1684, null);
    setFrontline(1663, null);
    setFrontline(1692, null);
    if (ST.chokepoints) ST.chokepoints.hormuz = "open";
  } else if (res.id === "res_502") {
    setFrontline(1248, null);
    setFrontline(1249, null);
  } else if (res.id === "res_660") {
    setFrontline(1809, null);
  } else if (res.id === "res_peace_mediation") {
    const keys = Object.keys(ST.frontlines || {});
    for (let k = 0; k < keys.length; k++) {
      setFrontline(keys[k], null);
    }
  }

  applyPlayerDecisions();

  toast({
    y: curY,
    m: curM,
    zh: "【安理会决议生效】" + res.shortTitle,
    note: res.name + " 获安理会正式表决通过并立即执行！"
  });

  dispatchDiplomaticCable({
    type: "unsc_passed",
    from: "UNSC",
    target: "ALL",
    zh: "通过" + res.shortTitle,
    desc: res.desc
  }, curY, curM, false);

  if (ST.sel) {
    refreshAIBox(ST.sel);
    refreshTradeBox(ST.sel);
  }
}
function refreshBlocCtl() {            // 面板「迁入阵营」控件：仅玩家自己的面板可见
  const box = $("p-bloc-ctl");
  if (!box) return;
  const isMine = !!ST.player && ST.sel === ST.player;
  box.style.display = isMine ? "" : "none";
  if (!isMine) return;
  const sel = $("p-bloc-sel");
  if (sel && !sel.dataset.filled) {
    sel.innerHTML = '<option value="">退出阵营（回原阵营）</option>' +
      Object.keys(BLOC).map((b) => '<option value="' + b + '">' + (BLOC_ZH[b] || b) + " " + b + "</option>").join("");
    sel.dataset.filled = "1";
  }
  if (sel) sel.value = ST.blocOverride[ST.player] || "";
  const stat = $("p-bloc-status");
  if (stat) {
    const orig = CM.countries[ST.player].bloc;
    const curB = ST.blocOverride[ST.player];
    if (!curB || curB === orig) {
      stat.textContent = "当前为史实阵营（网络效应已内化于基准）";
      stat.className = "bloc-status norm";
    } else {
      const be = curBlocEffect();
      let s = "经贸网络：" + (be.net >= 0 ? "+" : "") + be.net.toFixed(2) + "pp/年";
      if (be.friction < 0 && be.monthsLeft > 0) {
        s += "（脱钩震荡 " + be.friction.toFixed(2) + "pp，剩 " + be.monthsLeft + " 月）";
        stat.className = "bloc-status shock";
      } else {
        stat.className = "bloc-status bonus";
      }
      stat.textContent = s;
    }
  }
}
function updPlayerTag() {
  const e = $("r-player"); if (!e) return;
  const c = ST.player ? CM.countries[ST.player] : null;
  e.textContent = c ? "⚑ " + c.zh + " · " + ST.player : "⚑ 旁观";
  if (c) {
    const cost = decSelfCost();
    let t = "你的国家：" + c.zh + (ST.mil > 0 ? "（军费 " + ST.mil + "%）" : "（军费 0%）");
    if (ST.sanctions.length || ST.aid.length)
      t += "（制裁 " + ST.sanctions.length + " / 军援 " + ST.aid.length + " · 自损 -" + cost.total.toFixed(1) + "pp）";
    if (ST.blocOverride[ST.player]) {
      const be = curBlocEffect();
      t += "（已迁入 " + (BLOC_ZH[ST.blocOverride[ST.player]] || "") + " · 网络净 " + (be.net >= 0 ? "+" : "") + be.net.toFixed(2) + "pp）";
    }
    e.title = t;
  } else e.title = "尚未选择你的国家（旁观模式）";
  e.classList.toggle("on", !!c);
}
function refreshMilBox() {
  const box = $("p-milbox"); if (!box) return;
  const isMine = !!ST.player && ST.sel === ST.player;
  const none = $("p-mil-none"), ctl = $("p-mil-ctl");
  if (none) none.style.display = isMine ? "none" : "";
  if (ctl) ctl.style.display = isMine ? "" : "none";
  const r = $("p-mil"); if (r) r.value = String(ST.mil);
  const v = $("p-mil-v"); if (v) v.textContent = String(ST.mil);
  const o = $("p-mil-other");
  if (o) o.textContent = ST.player ? ("你的国家：" + ((CM.countries[ST.player] || {}).zh || ST.player)) : "尚未选择你的国家";
  refreshBlocCtl();                 // R5E：迁入阵营控件（仅玩家自己的面板）
  refreshDecBox(isMine);            // R5C'：决策区（本国）与他国快捷行二选一可见
  refreshWarBox(ST.sel);            // R8C：战局态势与地缘前线面板反馈
  refreshResBox(ST.sel);            // 经济系统阶段 1：战略资源面板反馈
  refreshTradeBox(ST.sel);          // 经济系统阶段 2：贸易与硬通货清算面板反馈
  refreshAIBox(ST.sel);             // R10A：大国战略性格与双边态度面板反馈
  refreshOverviewCard(ST.sel);      // R11A：概览态势卡片与治理导航
  refreshDomesticBox(ST.sel);       // R12A：大国内政生态与派系权力天平
  refreshAgendaBox(ST.sel);         // R12B：次极大国专属国家议程与战略路线
  refreshCovertBox(ST.sel);         // R13A：隐蔽行动与全球谍战沙盒控制台
  refreshAfghanBox(ST.sel);         // R13B：阿富汗战区态势与帝国失血槽控制台
  updatePanelTabBadges(ST.sel);     // R11A：选项卡动态角标更新
  refreshLeaderCard(ST.sel);        // R14：冷战大国领袖肖像画廊与执政理念卡片
}

// ---- R11A: 面板 Tabs 选项卡与动态角标系统 ----
function setPanelTab(tabId) {
  const valid = ["overview", "defense", "economy", "diplomacy"];
  if (!valid.includes(tabId)) tabId = "overview";
  ST.panelTab = tabId;
  const btns = document.querySelectorAll(".p-tab-btn");
  btns.forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  const panes = document.querySelectorAll(".p-tab-pane");
  panes.forEach((p) => {
    p.classList.toggle("active", p.id === "p-pane-" + tabId);
  });
}

function updatePanelTabBadges(selKey) {
  const bDef = $("p-tb-defense");
  const bEco = $("p-tb-economy");
  const bDip = $("p-tb-diplomacy");
  const bOvw = $("p-tb-overview");
  if (!bDef || !bEco || !bDip) return;

  if (!selKey) {
    bDef.className = "p-tab-badge"; bDef.textContent = "";
    bEco.className = "p-tab-badge"; bEco.textContent = "";
    bDip.className = "p-tab-badge"; bDip.textContent = "";
    if (bOvw) { bOvw.className = "p-tab-badge"; bOvw.textContent = ""; }
    return;
  }

  const actualKey = resolvePlayableKey(selKey);
  const now = SIM.S ? SIM.S.year * 12 + Math.max(1, SIM.S.month) : 1980 * 12 + 1;

  // 1. 国防与干预角标 (Defense): 战火状态
  const isIranIraqActive = now >= (1980 * 12 + 9) && now <= (1988 * 12 + 8) && !(CR.deny && CR.deny.has("iran_iraq_war"));
  const isFalklandsActive = now >= (1982 * 12 + 4) && now <= (1983 * 12 + 6);
  const isGulfActive = now >= (1990 * 12 + 8) && now <= (1991 * 12 + 12);
  let inWar = false;
  if (isIranIraqActive && (actualKey === "IRQ" || actualKey === "IRN")) inWar = true;
  else if (isFalklandsActive && (actualKey === "GBR" || actualKey === "ARG")) inWar = true;
  else if (isGulfActive && (actualKey === "IRQ" || actualKey === "KWT" || actualKey === "USA")) inWar = true;
  if (!inWar && ST.frontlines) {
    for (const pid in ST.frontlines) {
      if (ST.frontlines[pid] && ST.frontlines[pid].occupier === actualKey) {
        inWar = true; break;
      }
    }
  }
  if (inWar) {
    bDef.textContent = "⚔️";
    bDef.className = "p-tab-badge show";
  } else {
    bDef.textContent = "";
    bDef.className = "p-tab-badge";
  }

  // 2. 经贸与能源角标 (Economy): 资源赤字 / 受制 / 禁运
  const rdata = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(actualKey)) || null;
  let ecoWarn = false;
  if (rdata && rdata.summary) {
    if (rdata.summary.securityScore < 0 || rdata.summary.tag === "极端短缺受制") ecoWarn = true;
  }
  if (ST.cocom && ST.cocom.active && (actualKey === "SUN" || actualKey === "WP" || actualKey === "CHN")) {
    ecoWarn = true;
  }
  if (ST.chokepoints && ST.chokepoints.hormuz !== "open" && (actualKey === "IRN" || actualKey === "IRQ" || actualKey === "SAU" || actualKey === "JPN")) {
    ecoWarn = true;
  }
  if (ecoWarn) {
    bEco.textContent = "⚠️";
    bEco.className = "p-tab-badge show";
  } else {
    bEco.textContent = "";
    bEco.className = "p-tab-badge";
  }

  // 3. 外交与战略角标 (Diplomacy): 条约履约 🕊️ 或 极端张力 ⚡
  let dipBadge = "";
  if (ST.ai) {
    const tension = (ST.player && actualKey !== ST.player && ST.ai.tensions && ST.ai.tensions[actualKey]) ? ST.ai.tensions[actualKey] : 0;
    const treaties = (ST.ai.treaties || []).filter((t) => t.active);
    const isSuperpower = actualKey === "USA" || actualKey === "SUN";
    if (isSuperpower && treaties.length > 0) {
      dipBadge = "🕊️";
    } else if (tension >= 70) {
      dipBadge = "⚡";
    }
  }
  if (dipBadge) {
    bDip.textContent = dipBadge;
    bDip.className = "p-tab-badge show";
  } else {
    bDip.textContent = "";
    bDip.className = "p-tab-badge";
  }

  // 4. 概览角标 (Overview): 玩家直辖国显示 ★
  if (bOvw) {
    if (ST.player && actualKey === ST.player) {
      bOvw.textContent = "★";
      bOvw.className = "p-tab-badge show";
    } else {
      bOvw.textContent = "";
      bOvw.className = "p-tab-badge";
    }
  }
}
