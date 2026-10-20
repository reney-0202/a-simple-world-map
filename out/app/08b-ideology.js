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
  return { appeal: {}, active: [], since: {}, drift: [], leadMonths: 0, log: [] };
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
  return s;
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

  // 2) 输出工程的产出与翻车（只有执政者资助的工程）
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
    const lead = gap > 0;
    if (lead) s.leadMonths += 1;
    else s.leadMonths = 0;

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
