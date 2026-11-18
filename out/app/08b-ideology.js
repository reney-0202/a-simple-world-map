"use strict";

// ---- Phase S-17：意识形态资源化（把「主张」变成可输出的资产）----------------
// 冷战少了第四根支柱：物质（P）、竞赛（F）、核风险（N1）都建模了，
// 但「谁的制度更有吸引力」不存在 —— 意识形态只是领袖肖像下的一行文字。
//
// 本模块补上**感召力**（appeal，0..100）：一个国家的主张有多少人信。
//
//   来源（真实代价，不是装饰）：
//     ① 对外输出工程 —— 花政治资本 + 拖累 GDP + 当众翻车风险（确定性哈希）；
//     ② 经济兑现 —— P1 的「实际 − 期望」落差：制度说到做到才有说服力；
//     ③ 执政合法性 —— 治理得好本身就是最好的宣传。
//   消费（三个真实落点）：
//     ① 每月向感召力领先方汇入威望（软实力 → 硬通货，喂给 F 的记分牌）；
//     ② 玩家的合法性/动荡回流（站在历史正确一边 vs 被打脸）；
//     ③ 第三世界漂移（感召力落差与 F 的威望落差同样能改变阵营归属）。
//
// 与 F（威望）的分工：威望是**做过什么**（史实梯子/工程/战争胜负），
// 感召力是**相信什么**（制度兑现/主张输出）。互喂但不可互替。
//
// 不变量：零 RNG（翻车用哈希）、旁观零回写、存档 sanitize 缺省补齐、
// 史实门不受影响（感召力不写 pmods/gdp）。
function ideologyTable() {
  return (typeof window !== "undefined" && window.W1980_IDEOLOGY) || null;
}

function ideologyBlank() {
  return { appeal: {}, active: [], since: {}, drift: [], leadMonths: 0, rivalLeadMonths: 0, ai: {}, log: [] };
}

function initIdeologyState(force) {
  if (force || !ST.ideology || typeof ST.ideology !== "object") ST.ideology = ideologyBlank();
  const s = ST.ideology;
  if (!s.appeal || typeof s.appeal !== "object") s.appeal = {};
  if (!Array.isArray(s.active)) s.active = [];
  if (!s.since || typeof s.since !== "object") s.since = {};
  if (!Array.isArray(s.drift)) s.drift = [];
  if (!Array.isArray(s.log)) s.log = [];
  if (typeof s.leadMonths !== "number" || !isFinite(s.leadMonths)) s.leadMonths = 0;
  if (!s.ai || typeof s.ai !== "object") s.ai = {};
  if (typeof s.rivalLeadMonths !== "number" || !isFinite(s.rivalLeadMonths)) s.rivalLeadMonths = 0;
  return s;
}

// I2：某选手的输出工程槽（惰性建档）
function aiIdeologySlotOf(k) {
  const s = initIdeologyState();
  if (!s.ai[k] || typeof s.ai[k] !== "object") s.ai[k] = { active: [], since: {} };
  if (!Array.isArray(s.ai[k].active)) s.ai[k].active = [];
  if (!s.ai[k].since || typeof s.ai[k].since !== "object") s.ai[k].since = {};
  return s.ai[k];
}

// 纯函数：只吃 d、只吐新状态（与 sanitizePrestigeState 同一约定）
function sanitizeIdeologyState(d) {
  const s = ideologyBlank();
  const T = ideologyTable();
  if (!d || typeof d !== "object") return s;
  const lo = T ? T.PARAMS.APPEAL_MIN : 0, hi = T ? T.PARAMS.APPEAL_MAX : 100;
  if (d.appeal && typeof d.appeal === "object") {
    for (const k in d.appeal) {
      const v = d.appeal[k];
      if (typeof v === "number" && isFinite(v) && !!CM.countries[k]) s.appeal[k] = clamp(v, lo, hi);
    }
  }
  const known = T ? T.PROGRAMS : {};
  if (Array.isArray(d.active)) {
    s.active = d.active.filter((id) => typeof id === "string" && !!known[id])
      .slice(0, T ? T.PARAMS.MAX_ACTIVE : 2);
  }
  if (d.since && typeof d.since === "object") {
    for (const id of s.active) {
      const v = d.since[id];
      if (typeof v === "number" && isFinite(v)) s.since[id] = v;
    }
  }
  if (Array.isArray(d.drift)) {
    s.drift = d.drift.filter((k) => typeof k === "string" && !!CM.countries[k]);
  }
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.zh === "string");
  }
  if (typeof d.leadMonths === "number" && isFinite(d.leadMonths)) s.leadMonths = Math.max(0, Math.round(d.leadMonths));
  // I2：各选手的输出工程与反向漂移计数（旧档缺该项 → 空状态）
  if (d.ai && typeof d.ai === "object") {
    const aiMax = T ? T.PARAMS.MAX_ACTIVE : 2;
    for (const k in d.ai) {
      if (!CM.countries[k]) continue;
      const slot = d.ai[k];
      if (!slot || typeof slot !== "object") continue;
      const act = Array.isArray(slot.active)
        ? slot.active.filter((id) => typeof id === "string" && !!known[id]).slice(0, aiMax)
        : [];
      const since = {};
      if (slot.since && typeof slot.since === "object") {
        for (const id of act) {
          const v = slot.since[id];
          if (typeof v === "number" && isFinite(v)) since[id] = v;
        }
      }
      s.ai[k] = { active: act, since: since };
    }
  }
  if (typeof d.rivalLeadMonths === "number" && isFinite(d.rivalLeadMonths)) {
    s.rivalLeadMonths = Math.max(0, Math.round(d.rivalLeadMonths));
  }
  return s;
}

function ideologySystemOf(k) {
  const T = ideologyTable();
  if (!T) return null;
  return T.SYSTEMS[k] || T.SYSTEMS.DEFAULT;
}

function ideologyAppealOf(k) {
  const T = ideologyTable();
  const s = initIdeologyState();
  const def = ideologySystemOf(k);
  const start = def ? def.base : (T ? T.PARAMS.APPEAL_START : 50);
  if (typeof s.appeal[k] !== "number" || !isFinite(s.appeal[k])) s.appeal[k] = start;
  return s.appeal[k];
}

// 感召力对手：与威望竞赛同一个对手口径（超级大国固定表 → 阵营领袖 → 最强超级大国）
function ideologyRivalOf(k) {
  return (typeof prestigeRivalOf === "function") ? prestigeRivalOf(k) : null;
}

// 确定性「翻车」掷骰：只用 (年, 月, 工程 id) 的 FNV 哈希，不碰 SIM.S.rngState。
function ideologyRoll(y, m, id) {
  let h = 2166136261;
  const s = "ideo|" + String(y) + "|" + String(m) + "|" + String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function ideologyProgramDrag() {
  const T = ideologyTable();
  const s = ST.ideology;
  if (!T || !s || !Array.isArray(s.active) || !s.active.length) return 0;
  let drag = 0;
  for (const id of s.active) {
    const def = T.PROGRAMS[id];
    if (def) drag += def.drag;
  }
  return -drag;
}

// ---- I2（感召力的 AI 侧）：对手也输出主张 ------------------------------------
// 与 D2 / C2 / F2 同族的白名单门控：探针会话默认关闭（既有探针逐位不变），
// 只有 ?i2probe=1 或真实游戏才打开；旁观模式永远关闭。
function ideologyAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]i2probe=1/.test(location.search));
}

function aiIdeologyOpponentOf(k) {
  const player = ST.player;
  if (player && ideologyRivalOf(player) === k) return player;
  return ideologyRivalOf(k);
}

function ideologyAiActors() {
  const player = ST.player;
  if (!player) return [];
  const out = [];
  const push = (k) => { if (k && k !== player && CM.countries[k] && out.indexOf(k) < 0) out.push(k); };
  push(ideologyRivalOf(player));
  push("USA");
  push("SUN");
  return out;
}

function aiPickIdeologyProgram(k, y, m) {
  const T = ideologyTable();
  if (!T || !T.AI_POLICY) return null;
  const P = T.AI_POLICY;
  const slot = aiIdeologySlotOf(k);
  const opp = aiIdeologyOpponentOf(k);
  if (!opp) return null;
  const gap = ideologyAppealOf(k) - ideologyAppealOf(opp);
  const strain = (typeof polEconStrainOf === "function") ? polEconStrainOf(k) : 0;
  const active = slot.active;

  if (gap >= P.COAST_GAP && active.length) return { stopAll: true, reason: "coast", gap: gap };
  if (strain >= P.STRAIN_MAX && active.length) {
    let worst = active[0];
    for (const id of active) {
      const a = T.PROGRAMS[id], b = T.PROGRAMS[worst];
      if (a && b && a.drag > b.drag) worst = id;
    }
    return { stop: worst, reason: "strain", gap: gap };
  }
  if (active.length >= (T.PARAMS.MAX_ACTIVE || 2)) return null;
  const yy = (y !== undefined) ? y : (SIM.S ? SIM.S.year : 1980);
  const mm = (m !== undefined) ? m : (SIM.S ? Math.max(1, SIM.S.month) : 1);
  const ym = yy * 12 + mm;
  for (const id of active) {
    const since = slot.since[id];
    if (typeof since === "number" && ym - since < P.MIN_MONTHS) return null;
  }
  if (gap <= -P.CATCHUP_GAP) {
    const tier = strain < P.PICK_HI_STRAIN ? "hi" : (strain < P.PICK_MID_STRAIN ? "mid" : "lo");
    for (const id of (P.PICK[tier] || [])) {
      if (active.indexOf(id) < 0 && T.PROGRAMS[id]) return { start: id, reason: "catchup", gap: gap, tier: tier };
    }
  }
  return null;
}

function aiStopIdeologyProgram(k, id) {
  const slot = aiIdeologySlotOf(k);
  const i = slot.active.indexOf(id);
  if (i < 0) return false;
  slot.active.splice(i, 1);
  delete slot.since[id];
  return true;
}

function aiIdeologyDragFor(k) {
  const T = ideologyTable();
  if (!T || !ideologyAiActive()) return 0;
  const s = ST.ideology;
  if (!s || !s.ai || !s.ai[k]) return 0;
  let drag = 0;
  for (const id of s.ai[k].active) {
    const def = T.PROGRAMS[id];
    if (def) drag += def.drag;
  }
  return -drag;
}

function startIdeologyProgram(id) {
  const T = ideologyTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  const def = T.PROGRAMS[id];
  if (!def) return { ok: false, reason: "unknown" };
  const s = initIdeologyState();
  if (s.active.indexOf(id) >= 0) return { ok: false, reason: "already", def: def };
  if (s.active.length >= T.PARAMS.MAX_ACTIVE) return { ok: false, reason: "full", def: def };
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(def.cost)) {
    return { ok: false, reason: "capital", def: def, cost: def.cost };
  }
  s.active.push(id);
  s.since[id] = curMonthIdx();
  if (!CR.probeMode) {
    toast({ zh: "【主张输出启动】" + def.icon + " " + def.zh,
      note: def.note + "（每月感召力 +" + def.gain.toFixed(2) + "，GDP 增速 −" + def.drag.toFixed(2) +
        "pp/年；同时最多 " + T.PARAMS.MAX_ACTIVE + " 项）" });
  }
  applyPlayerDecisions();
  return { ok: true, def: def };
}

function stopIdeologyProgram(id) {
  const T = ideologyTable();
  const s = ST.ideology;
  if (!T || !s || !Array.isArray(s.active)) return { ok: false, reason: "no-state" };
  const i = s.active.indexOf(id);
  if (i < 0) return { ok: false, reason: "inactive" };
  s.active.splice(i, 1);
  delete s.since[id];
  applyPlayerDecisions();
  return { ok: true };
}

function ideologyRecord(kind, zh, extra) {
  const T = ideologyTable();
  const s = initIdeologyState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const k in extra) e[k] = extra[k];
  s.log.push(e);
  if (s.log.length > (T ? T.PARAMS.LOG_MAX : 24)) s.log.shift();
  return e;
}

// ---- 月度推进 ---------------------------------------------------------------
function updateIdeology(y, m, silent) {
  const T = ideologyTable();
  if (!T) return null;
  const s = initIdeologyState();
  const P = T.PARAMS;

  // 1) 衰减：主张会被遗忘，朝各自主张的 base 回归
  for (const k in s.appeal) {
    const def = ideologySystemOf(k);
    const base = def ? def.base : P.APPEAL_START;
    s.appeal[k] = clamp(s.appeal[k] + (base - s.appeal[k]) * P.DECAY, P.APPEAL_MIN, P.APPEAL_MAX);
  }

  // 2) 输出工程的产出与翻车（执政者资助的工程）
  if (ST.player) {
    for (const id of s.active.slice()) {
      const def = T.PROGRAMS[id];
      if (!def) continue;
      const before = ideologyAppealOf(ST.player);
      s.appeal[ST.player] = clamp(before + def.gain, P.APPEAL_MIN, P.APPEAL_MAX);
      if (ideologyRoll(y, m, id) < def.risk) {
        // 翻车：宣传被戳穿，丢的是**可信度** —— 大跌而不是小减
        s.appeal[ST.player] = clamp(ideologyAppealOf(ST.player) - def.failLoss, P.APPEAL_MIN, P.APPEAL_MAX);
        ideologyRecord("fail", def.zh + "翻车", { d: -def.failLoss });
        if (!silent) {
          const item = { y: y, m: m, zh: "【主张输出受挫】" + def.icon + " " + def.zh + "被当众戳穿",
            note: "感召力 −" + def.failLoss + "：宣传最怕的不是没人听，是被人抓住把柄。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }

    // 3) 经济兑现 + 执政合法性 → 感召力（制度说到做到才有说服力）
    const snap = (typeof polEconSnapshot === "function") ? polEconSnapshot() : null;
    if (snap && typeof snap.surprise === "number") {
      const delivery = clamp(snap.surprise / P.DELIVERY_DIV, -1, 1) * P.DELIVERY_CAP;
      s.appeal[ST.player] = clamp(ideologyAppealOf(ST.player) + delivery, P.APPEAL_MIN, P.APPEAL_MAX);
    }
    if (typeof politicalLegitimacy === "function") {
      const leg = clamp(politicalLegitimacy(), 0, 100);
      if (leg > 60) {
        const add = P.LEGIT_GAIN * ((leg - 60) / 40);
        s.appeal[ST.player] = clamp(ideologyAppealOf(ST.player) + add, P.APPEAL_MIN, P.APPEAL_MAX);
      }
    }
  }

  // I2：选手们也输出主张 —— 选棋、执行、产感召力、掷翻车。
  // 零政治资本、零引擎 RNG；拖累进 pmods 由 accIdeologyAiDrag 结算。
  if (ideologyAiActive()) {
    for (const k of ideologyAiActors()) {
      const slot = aiIdeologySlotOf(k);
      const pick = aiPickIdeologyProgram(k, y, m);
      if (pick && pick.stopAll) {
        for (const id of slot.active.slice()) aiStopIdeologyProgram(k, id);
      } else if (pick && pick.stop) {
        aiStopIdeologyProgram(k, pick.stop);
      } else if (pick && pick.start) {
        slot.active.push(pick.start);
        slot.since[pick.start] = y * 12 + m;
        if (!silent) {
          const item = { y: y, m: m,
            zh: "【主张输出】" + (CM.countries[k] || {}).zh + "启动" + T.PROGRAMS[pick.start].zh,
            note: "对手不再只靠制度惯性吃饭 —— 辩论的另一侧开始主动输出了。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
      for (const id of slot.active.slice()) {
        const def = T.PROGRAMS[id];
        if (!def) continue;
        s.appeal[k] = clamp(ideologyAppealOf(k) + def.gain, P.APPEAL_MIN, P.APPEAL_MAX);
        if (ideologyRoll(y, m, id + ":" + k) < def.risk) {
          s.appeal[k] = clamp(ideologyAppealOf(k) - def.failLoss, P.APPEAL_MIN, P.APPEAL_MAX);
          ideologyRecord("fail", (CM.countries[k] || {}).zh + "·" + def.zh + "翻车", { d: -def.failLoss, k: k });
          if (!silent) {
            const item = { y: y, m: m,
              zh: "【主张输出受挫】" + (CM.countries[k] || {}).zh + "的" + def.zh + "被当众戳穿",
              note: "对手的翻车就是你的机会 —— 感召力是说服力存量，此消即彼长。" };
            EV.items.push(item);
            EV.unread++;
            renderInbox();
            toast(item);
          }
        }
      }
    }
  }

  // 4) 消费者 ①：软实力变现 —— 感召力领先方每月汇入威望
  // 静默小额（reason 传空）：这是持续的涓流，不是事件，不该每月刷战史日志。
  const player = ST.player;
  const rival = player ? ideologyRivalOf(player) : null;
  if (player && rival && typeof prestigeAdd === "function") {
    const gap = ideologyAppealOf(player) - ideologyAppealOf(rival);
    if (Math.abs(gap) >= 2) {
      const winner = gap > 0 ? player : rival;
      prestigeAdd(winner, P.PRESTIGE_PER_MONTH * Math.min(1, Math.abs(gap) / 20), null);
    }
  }

  // 5) 消费者 ②：合法性/动荡回流（有执政者才写内政）
  if (player && rival) {
    const gap = ideologyAppealOf(player) - ideologyAppealOf(rival);
    const norm = clamp(Math.abs(gap) / 25, 0, 1);
    const dom = (typeof polEconDomesticOf === "function") ? polEconDomesticOf(player) : null;
    if (dom && norm > 0) {
      if (gap > 0) {
        if (typeof dom.unrest === "number") dom.unrest = clamp(dom.unrest - P.UNREST_FEEDBACK * norm, 0, 100);
        if (typeof dom.legitimacy === "number") dom.legitimacy = clamp(dom.legitimacy + P.LEGIT_FEEDBACK * norm, 0, 100);
      } else {
        if (typeof dom.unrest === "number") dom.unrest = clamp(dom.unrest + P.UNREST_FEEDBACK * norm, 0, 100);
        if (typeof dom.legitimacy === "number") dom.legitimacy = clamp(dom.legitimacy - P.LEGIT_FEEDBACK * norm, 0, 100);
      }
    }
  }

  // 6) 消费者 ③：第三世界漂移（与 F 的威望漂移同机制、独立计数）
  if (player && rival) {
    const gap = ideologyAppealOf(player) - ideologyAppealOf(rival);
    if (gap > 0) s.leadMonths += 1;
    else s.leadMonths = 0;

    // I2：反向漂移 —— 对手领先同样会拉走第三世界（共用 DRIFT_TOTAL）
    if (ideologyAiActive()) {
      if (gap < 0) s.rivalLeadMonths += 1;
      else s.rivalLeadMonths = 0;
      if (s.rivalLeadMonths >= P.DRIFT_MONTHS && -gap >= P.DRIFT_GAP &&
          s.drift.length < P.DRIFT_TOTAL) {
        const rivalBloc = (typeof blocOf === "function") ? blocOf(rival) : null;
        const eligible = Object.keys(CM.countries)
          .filter((k) => k !== player && k !== rival && !ST.blocOverride[k] &&
            T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[k].bloc) >= 0)
          .sort();
        if (eligible.length && rivalBloc) {
          const pick = eligible[(y * 12 + m) % eligible.length];
          ST.blocOverride[pick] = rivalBloc;
          s.drift.push(pick);
          s.rivalLeadMonths = 0;
          ideologyRecord("drift", CM.countries[pick].zh + "倒向" + (BLOC_ZH[rivalBloc] || rivalBloc),
            { k: pick, rival: true });
          if (typeof rebuildBlocTable === "function") rebuildBlocTable();
          if (typeof select === "function" && ST.sel) select(ST.sel);
          if (!silent) {
            const item = { y: y, m: m,
              zh: "【感召力漂移】" + CM.countries[pick].zh + "倒向" + (BLOC_ZH[rivalBloc] || rivalBloc),
              note: "对手的持续主张优势开始改变第三世界的选择 —— 辩论的输赢不只在口号上。" };
            EV.items.push(item);
            EV.unread++;
            renderInbox();
            toast(item);
          }
        }
      }
    }

    if (s.leadMonths >= P.DRIFT_MONTHS && gap >= P.DRIFT_GAP && s.drift.length < P.DRIFT_TOTAL) {
      const targetBloc = (typeof blocOf === "function") ? blocOf(player) : null;
      const eligible = Object.keys(CM.countries)
        .filter((k) => k !== player && k !== rival && !ST.blocOverride[k] &&
          T.PARAMS.DRIFT_ELIGIBLE.indexOf(CM.countries[k].bloc) >= 0)
        .sort();
      if (eligible.length && targetBloc) {
        const pick = eligible[(y * 12 + m) % eligible.length];
        ST.blocOverride[pick] = targetBloc;
        s.drift.push(pick);
        s.leadMonths = 0;
        ideologyRecord("drift", CM.countries[pick].zh + "倒向" + (BLOC_ZH[targetBloc] || targetBloc), { k: pick });
        if (typeof rebuildBlocTable === "function") rebuildBlocTable();
        if (typeof select === "function" && ST.sel) select(ST.sel);
        if (!silent) {
          const item = { y: y, m: m, zh: "【感召力漂移】" + CM.countries[pick].zh + "倒向" + (BLOC_ZH[targetBloc] || targetBloc),
            note: "不是因为军援，不是因为威望事件，而是因为「谁的制度更有说服力」开始改变选择。" };
          EV.items.push(item);
          EV.unread++;
          renderInbox();
          toast(item);
        }
      }
    }
  }

  return ideologySnapshot();
}

function ideologySnapshot() {
  const T = ideologyTable();
  if (!T) return null;
  const s = initIdeologyState();
  const player = ST.player || null;
  const rival = player ? ideologyRivalOf(player) : null;
  const out = {
    player: player,
    appeal: player ? +ideologyAppealOf(player).toFixed(2) : null,
    rival: rival,
    rivalAppeal: rival ? +ideologyAppealOf(rival).toFixed(2) : null,
    gap: (player && rival) ? +(ideologyAppealOf(player) - ideologyAppealOf(rival)).toFixed(2) : null,
    active: s.active.slice(),
    // I2：对手在跑的输出工程（公开 —— 广播战与文化输出藏不住）
    rivalActive: (rival && s.ai && s.ai[rival]) ? s.ai[rival].active.slice() : [],
    drag: +ideologyProgramDrag().toFixed(3),
    leadMonths: s.leadMonths,
    drifted: s.drift.length
  };
  if (!player) {
    const keys = Object.keys(s.appeal);
    let best = null, bestV = -1;
    for (const k of keys) if (s.appeal[k] > bestV) { best = k; bestV = s.appeal[k]; }
    out.worldLeader = best;
    out.worldLeaderAppeal = bestV === -1 ? null : +bestV.toFixed(2);
  }
  return out;
}

// ---- 面板 -------------------------------------------------------------------
function ideologyPanelHtml() {
  const T = ideologyTable();
  if (!T) return "";
  const s = initIdeologyState();
  const player = ST.player;
  const mine = ideologySystemOf(player || "DEFAULT");
  let h = '<div class="id-block">';
  h += '<div class="id-row"><span>🕊️ 感召力 · ' + (mine ? mine.zh : "主张") + '</span>';
  if (player) {
    const rv = ideologyRivalOf(player);
    const gap = rv ? ideologyAppealOf(player) - ideologyAppealOf(rv) : 0;
    const col = gap >= 0 ? "#4ade80" : "#f87171";
    h += '<b style="color:' + col + '">' + ideologyAppealOf(player).toFixed(1) +
      (rv ? " vs " + ideologyAppealOf(rv).toFixed(1) + "（" + (gap >= 0 ? "+" : "") + gap.toFixed(1) + "）" : "") + '</b>';
  } else {
    h += '<b>—</b>';
  }
  h += '</div>';
  if (mine) h += '<div class="id-note">' + mine.note + '</div>';
  if (player) {
    h += '<div class="id-progs">';
    for (const id in T.PROGRAMS) {
      const d = T.PROGRAMS[id];
      const on = s.active.indexOf(id) >= 0;
      const full = s.active.length >= T.PARAMS.MAX_ACTIVE && !on;
      h += '<button class="id-prog-btn' + (on ? " active" : "") + (full ? " disabled" : "") +
        '" data-idprog="' + id + '"' + (full ? " disabled" : "") + ' title="' + d.note + '">' +
        d.icon + " " + d.zh + " <i>" + (on ? "运行中" : "-" + d.cost) + "</i></button>";
    }
    h += '</div>';
    if (s.active.length) {
      h += '<div class="id-note">输出使感召力 +' +
        s.active.reduce((a, id) => a + T.PROGRAMS[id].gain, 0).toFixed(2) + '/月，GDP 增速 ' +
        ideologyProgramDrag().toFixed(2) + 'pp/年</div>';
    }
    // I2：对手工程公开上榜（广播战上天是藏不住的）
    const rv = ideologyRivalOf(player);
    if (rv && s.ai && s.ai[rv] && s.ai[rv].active.length) {
      h += '<div class="id-note" style="color:#f0987d">对手输出：' +
        s.ai[rv].active.map((id) => (T.PROGRAMS[id] || {}).icon + (T.PROGRAMS[id] || {}).zh).join(" · ") +
        '</div>';
    }
    if (s.leadMonths > 0 && s.drift.length < T.PARAMS.DRIFT_TOTAL) {
      h += '<div class="id-note">感召力连续领先 ' + s.leadMonths + '/' + T.PARAMS.DRIFT_MONTHS +
        ' 个月（落差需 ≥ ' + T.PARAMS.DRIFT_GAP + '）：说服力正在改变第三世界的选择。</div>';
    }
    if (s.drift.length) {
      h += '<div class="id-note">因感召力倒向我国：' + s.drift.map((k) => (CM.countries[k] || {}).zh).join("、") + '</div>';
    }
  }
  h += '</div>';
  return h;
}
