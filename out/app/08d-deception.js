"use strict";

// ---- Phase C2：情报误报（雾的最后一个问题：雾不总是诚实的）------------------
// C（情报估算）建模了**诚实的雾**：估计值围绕真值波动、区间永远罩住真值。
// 但真实的冷战情报不是「有噪声的测量」，而是**有人在撒谎** ——
// 苏联的军演故意让西方高估、美国的宣传让苏联以为差距更大、
// 马岛的战报被双方各执一词。噪声考验耐心，**误报考验胆识**。
//
// 本模块的三个件：
//   1. 欺敌（deception）—— 让**除撒谎者以外的读者**的估计值带方向性偏差。
//      偏差不进噪声，而是把整个可信区间推离真值 —— 诚实的雾破了。
//   2. 甄别（counter-intel）—— 花政治资本买一段「照妖镜」期：必然识破并
//      清除针对自己的欺敌，同时挡住新的欺敌（花钱买真相）。
//   3. 曝光（exposure）—— 欺敌在点火时掷一次确定性哈希：败露 = 威望 +
//      感召力双扣。被抓到撒谎比没撒成更丢脸。
//
// 三个真实消费者（S-16 的教训）：
//   · 玩家的读数（08a-estimates 的 estimateOf / estimateControlOf）——
//     敌方的假战报让玩家冒进（C 的冒进惩罚因此变成一个陷阱）；
//   · AI 的战局判断（04a 的 aiPickWarOp）—— 我方的假战报让对手误判攻防；
//   · 核威慑可信度（07f 的 nukeCredibilityNow）—— 威慑是**双方的认知**：
//     对方眼里的我方军力 − 我方眼里的对方军力，两个项都是感知。
//
// 不变量：零 RNG（曝光/调度用 FNV 哈希）、旁观零回写、存档 sanitize、
// 不升版本；**撒谎者永远不被自己的谎误导**（planter ≠ reader 才加偏差）。
function deceptionTable() {
  return (typeof window !== "undefined" && window.W1980_DECEPTION) || null;
}

function deceptionBlank() {
  return { plants: {}, shield: 0, lastAuto: null, log: [] };
}

function initDeceptionState(force) {
  if (force || !ST.deception || typeof ST.deception !== "object") ST.deception = deceptionBlank();
  const s = ST.deception;
  if (!s.plants || typeof s.plants !== "object") s.plants = {};
  if (!Array.isArray(s.log)) s.log = [];
  if (typeof s.shield !== "number" || !isFinite(s.shield)) s.shield = 0;
  return s;
}

// 纯函数：只吃 d、只吐新状态
function sanitizeDeceptionState(d) {
  const s = deceptionBlank();
  const T = deceptionTable();
  if (!d || typeof d !== "object") return s;
  const known = T ? T.DECEPTIONS : {};
  if (d.plants && typeof d.plants === "object") {
    for (const subj in d.plants) {
      const p = d.plants[subj];
      if (!p || typeof p !== "object") continue;
      const def = known[p.id];
      if (!def) continue;
      // 主体键必须真实存在（国家或战争）—— 否则伪造档能凭空造出幽灵主体
      const subjOk = !!(CM.countries[subj] ||
        (typeof window !== "undefined" && window.W1980_WARS && window.W1980_WARS.WARS && window.W1980_WARS.WARS[subj]));
      if (!subjOk) continue;
      if (typeof p.bias !== "number" || !isFinite(p.bias)) continue;
      if (typeof p.months !== "number" || !isFinite(p.months) || p.months <= 0) continue;
      s.plants[subj] = {
        id: p.id, field: def.field, bias: p.bias,
        months: Math.min(Math.round(p.months), def.months),
        by: (typeof p.by === "string" && (CM.countries[p.by] || p.by === "war")) ? p.by : null
      };
    }
  }
  s.shield = (typeof d.shield === "number" && isFinite(d.shield))
    ? clamp(Math.round(d.shield), 0, T ? T.PARAMS.SHIELD_MAX * 24 : 24) : 0;
  s.lastAuto = (typeof d.lastAuto === "number" && isFinite(d.lastAuto)) ? d.lastAuto : null;
  if (Array.isArray(d.log)) {
    s.log = d.log.slice(-(T ? T.PARAMS.LOG_MAX : 24))
      .filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  return s;
}

// 确定性掷骰：(盐, 年, 月, 主体, 对象) 的 FNV 哈希，零引擎 RNG
function deceptionRoll(salt, y, m, a, b) {
  let h = 2166136261;
  const s = String(salt) + "|" + y + "|" + m + "|" + a + "|" + b;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function deceptionRecord(kind, zh, extra) {
  const T = deceptionTable();
  const s = initDeceptionState();
  const e = { y: SIM.S ? SIM.S.year : 1980, m: SIM.S ? Math.max(1, SIM.S.month) : 1, kind: kind, zh: zh };
  if (extra) for (const k in extra) e[k] = extra[k];
  s.log.push(e);
  if (s.log.length > (T ? T.PARAMS.LOG_MAX : 24)) s.log.shift();
  return e;
}

// ---- 核心：偏差读数 ---------------------------------------------------------
// bias 存的是**侧 A 取向的原始数**（control）或**数值取向**（mil/prestige）：
//   · control：rawA 加在 groundWarControl 的返回值上，读者各自按 ± 换算己方视角；
//   · mil/prestige：直接加在读数上。
// 撒谎者（planter === reader）读到 0 —— 自己造的谣自己不会信。
function deceptionBiasRaw(subject, field, readerKey) {
  const s = initDeceptionState();
  const p = s.plants[subject];
  if (!p || p.field !== field || p.months <= 0) return 0;
  if (readerKey && p.by === readerKey) return 0;
  return p.bias;
}

// 命中率探测：这个量当前**有没有被污染**（面板用「可能被误导」提示，不泄露方向）
function deceptionActiveOn(subject, field) {
  const s = ST.deception;
  const p = s && s.plants ? s.plants[subject] : null;
  return !!(p && p.field === field && p.months > 0 && p.by !== ST.player);
}

// ---- 撒谎：玩家点火 ---------------------------------------------------------
// target：side=self → 主体是玩家自己；side=war → 主体是玩家参战的那场战争；
//         side=shield → 护盾（不装偏差）。
function startDeception(id) {
  const T = deceptionTable();
  if (!T || !ST.player) return { ok: false, reason: "no-player" };
  const def = T.DECEPTIONS[id];
  if (!def) return { ok: false, reason: "unknown" };
  const s = initDeceptionState();

  if (def.side === "shield") {
    if (s.shield > 0) return { ok: false, reason: "already", def: def };
    if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(def.cost)) {
      return { ok: false, reason: "capital", cost: def.cost };
    }
    s.shield = def.months;
    if (!CR.probeMode) {
      toast({ zh: "【反情报甄别】🔍 照妖镜开启", note: def.note });
    }
    return { ok: true, def: def };
  }

  // 选主体
  let subject = null;
  if (def.side === "self") subject = ST.player;
  else if (def.side === "war") {
    // 玩家参战且进行中的第一场战争
    const T2 = window.W1980_WARS;
    if (T2 && T2.WARS && typeof groundWarActive === "function") {
      for (const wid in T2.WARS) {
        const wdef = T2.WARS[wid];
        if ((wdef.sideA === ST.player || wdef.sideB === ST.player) && groundWarActive(wid)) {
          subject = wid; break;
        }
      }
    }
    if (!subject) return { ok: false, reason: "no-war", def: def };
  }
  if (!subject) return { ok: false, reason: "unknown", def: def };

  const nPlants = Object.keys(s.plants).filter((k) => s.plants[k].by === ST.player).length;
  if (nPlants >= T.PARAMS.MAX_ACTIVE && !s.plants[subject]) {
    return { ok: false, reason: "full", def: def };
  }
  if (typeof spendPoliticalCapital !== "function" || !spendPoliticalCapital(def.cost)) {
    return { ok: false, reason: "capital", cost: def.cost };
  }

  // 曝光：点火时掷一次确定性哈希。败露 = 威望 + 感召力双扣，且什么都不装。
  const y = SIM.S ? SIM.S.year : 1980, m = SIM.S ? Math.max(1, SIM.S.month) : 1;
  if (def.risk > 0 && deceptionRoll("expose", y, m, id, subject) < def.risk) {
    if (typeof prestigeAdd === "function") {
      prestigeAdd(ST.player, -def.failLossPrestige, def.zh + "曝光");
    }
    if (typeof ideologyAppealOf === "function" && ST.ideology) {
      const cur = ideologyAppealOf(ST.player);
      ST.ideology.appeal[ST.player] = clamp(cur - def.failLossAppeal, 0, 100);
    }
    deceptionRecord("exposed", def.zh + "曝光", { k: subject });
    if (!CR.probeMode) {
      const item = { y: y, m: m, zh: "⚠️【欺敌曝光】" + def.icon + " " + def.zh + "被对方情报机关拆穿",
        note: "被抓到撒谎比没撒成更丢脸：威望 −" + def.failLossPrestige + "，感召力 −" + def.failLossAppeal + "。" };
      EV.items.push(item);
      EV.unread++;
      renderInbox();
      toast(item);
    }
    return { ok: true, def: def, exposed: true, subject: subject };
  }

  // 装偏差。control 侧换算成侧 A 取向：让**被骗方**看起来更好。
  // 被骗方 = 与撒谎者对立的一侧（自欺没有意义）。
  let biasRaw = def.bias;
  if (def.side === "war") {
    const T2 = window.W1980_WARS;
    const wdef = T2.WARS[subject];
    const deceivedSide = wdef.sideA === ST.player ? "B" : "A";
    biasRaw = Math.abs(def.bias) * (deceivedSide === "A" ? 1 : -1);
  }
  s.plants[subject] = {
    id: id, field: def.field, bias: biasRaw, months: def.months,
    by: ST.player
  };
  deceptionRecord("plant", def.zh, { k: subject, bias: biasRaw });
  if (!CR.probeMode) {
    toast({ zh: "【欺敌部署】" + def.icon + " " + def.zh,
      note: def.note + "（持续 " + def.months + " 个月；曝光风险 " + Math.round(def.risk * 100) + "%）" });
  }
  return { ok: true, def: def, exposed: false, subject: subject };
}

function cancelDeception(subject) {
  const s = initDeceptionState();
  if (!s.plants[subject] || s.plants[subject].by !== ST.player) return { ok: false, reason: "none" };
  delete s.plants[subject];
  applyPlayerDecisions();
  return { ok: true };
}

// ---- 月度推进 ---------------------------------------------------------------
// 门控：与 D2 同族 —— 敌方自动欺敌只在真实游戏（或 ?c2probe=1 会话）发生。
// 探针会话默认关闭：既有 33 个探针的诚实雾断言（区间罩真值）不受影响。
function deceptionAiActive() {
  return !!ST.player && (!CR.probeMode || /[?&]c2probe=1/.test(location.search));
}

function updateMonthlyDeception(y, m, silent) {
  const T = deceptionTable();
  if (!T) return null;
  const s = initDeceptionState();

  // 1) 偏差过期
  for (const subj in s.plants) {
    s.plants[subj].months -= 1;
    if (s.plants[subj].months <= 0) delete s.plants[subj];
  }

  // 2) 护盾：照妖镜期 —— 必然识破并清除外敌欺敌，且挡住新的欺敌
  if (s.shield > 0) {
    s.shield -= 1;
    const cleared = [];
    for (const subj in s.plants) {
      if (s.plants[subj].by !== ST.player) {
        cleared.push(subj);
        delete s.plants[subj];
      }
    }
    if (cleared.length) {
      deceptionRecord("cleared", "识破并清除敌方欺敌", { n: cleared.length });
      if (!silent) {
        const item = { y: y, m: m, zh: "🔍【反情报甄别】识破敌方情报欺骗",
          note: "照妖镜下 " + cleared.length + " 条伪造读数被清除 —— 你买到的是真相。" };
        EV.items.push(item);
        EV.unread++;
        renderInbox();
        toast(item);
      }
    }
    return deceptionSnapshot();
  }

  // 3) 敌方自动欺敌（确定性调度：战争优先，其次示弱）
  if (!deceptionAiActive() || !ST.player) return deceptionSnapshot();
  const P = T.PARAMS;
  const now = y * 12 + m;
  if (s.lastAuto !== null && now - s.lastAuto < P.AUTO_MONTHS) return deceptionSnapshot();

  // 3a. 假战报：玩家是交战方的进行中战争 → 诱玩家冒进
  let warId = null, enemyKey = null, playerSide = null;
  const T2 = window.W1980_WARS;
  if (T2 && T2.WARS && typeof groundWarActive === "function") {
    for (const wid in T2.WARS) {
      const wdef = T2.WARS[wid];
      if (wdef.sideA === ST.player) { warId = wid; enemyKey = wdef.sideB; playerSide = "A"; break; }
      if (wdef.sideB === ST.player) { warId = wid; enemyKey = wdef.sideA; playerSide = "B"; break; }
    }
  }
  if (warId && groundWarActive(warId) && deceptionRoll("ff", y, m, warId, ST.player) < P.AUTO_FALSE_FRONT) {
    // 让玩家（被骗方）看起来更好 → rawA 按玩家所站侧换算
    const biasRaw = 20 * (playerSide === "A" ? 1 : -1);
    s.plants[warId] = { id: "false_front", field: "control", bias: biasRaw, months: 12, by: enemyKey };
    s.lastAuto = now;
    deceptionRecord("planted", "敌方伪造战报", { k: warId, by: enemyKey });
    return deceptionSnapshot();
  }

  // 3b. 示例弱：敌方把自己描述得虚弱，诱玩家低估风险（污染核威慑读数）
  const rival = (typeof prestigeRivalOf === "function") ? prestigeRivalOf(ST.player) : null;
  if (rival && deceptionRoll("wk", y, m, rival, ST.player) < P.AUTO_WEAKNESS) {
    s.plants[rival] = { id: "plant_weakness", field: "mil", bias: -1.2, months: 18, by: rival };
    s.lastAuto = now;
    deceptionRecord("planted", "敌方示弱欺敌", { k: rival, by: rival });
  }
  return deceptionSnapshot();
}

function deceptionSnapshot() {
  const T = deceptionTable();
  if (!T) return null;
  const s = initDeceptionState();
  const out = {
    player: ST.player || null,
    shield: s.shield,
    own: [],
    detected: s.log.filter((e) => e.kind === "cleared").length,
    exposed: s.log.filter((e) => e.kind === "exposed").length
  };
  for (const subj in s.plants) {
    const p = s.plants[subj];
    if (p.by === ST.player) {
      out.own.push({ subject: subj, field: p.field, months: p.months });
    }
    // 敌方的欺敌**不外泄**：你不知道有人在骗你（照妖镜识破的除外）
  }
  return out;
}

// ---- 面板（情报机构面板里的一节）-------------------------------------------
// 诚实性：只显示**自己**的欺敌与护盾。敌方的伪造读数不可见 ——
// 否则「误报」就没有意义了。识破记录在 deceptionSnapshot 的计数里。
function deceptionPanelHtml() {
  const T = deceptionTable();
  if (!T || !ST.player) return "";
  const s = initDeceptionState();
  let h = '<div class="dc-block"><div class="dc-hd">🎭 情报欺骗 · 你在骗谁</div>';
  if (s.shield > 0) {
    h += '<div class="dc-row"><span>🔍 反情报护盾（照妖镜）</span><b class="est-good">' + s.shield + ' 月</b></div>';
  }
  const own = [];
  for (const subj in s.plants) {
    const p = s.plants[subj];
    if (p.by === ST.player) own.push([subj, p]);
  }
  for (const [subj, p] of own) {
    const zh = (CM.countries[subj] || {}).zh || ((window.W1980_WARS && window.W1980_WARS.WARS[subj]) || {}).zh || subj;
    const dir = p.field === "control" ? "" : (p.bias >= 0 ? "（虚高）" : "（虚低）");
    h += '<div class="dc-row"><span>' + zh + ' · ' + (p.field === "mil" ? "军费" : p.field === "prestige" ? "威望" : "战线") + dir + '</span><b>' + p.months + ' 月</b></div>';
  }
  if (!own.length && s.shield <= 0) {
    h += '<div class="dc-note">没有进行中的欺骗行动。</div>';
  }
  h += '<div class="dc-grid">';
  for (const id in T.DECEPTIONS) {
    const d = T.DECEPTIONS[id];
    const isShield = d.side === "shield";
    const on = isShield ? s.shield > 0 : (s.plants[ST.player] && s.plants[ST.player].id === id) ||
      Object.keys(s.plants).some((k) => s.plants[k].by === ST.player && s.plants[k].id === id);
    const disabled = isShield ? s.shield > 0 : false;
    h += '<button class="dc-btn' + (on ? " active" : "") + (disabled ? " disabled" : "") +
      '" data-dec="' + id + '"' + (disabled ? " disabled" : "") + ' title="' + d.note + '">' +
      d.icon + " " + d.zh + " <i>-" + d.cost + "</i></button>";
  }
  h += '</div>';
  h += '<div class="dc-note">撒谎可以让对手误判，但曝光的代价是威望与感召力双扣；' +
    '反情报护盾是唯一能买到真相的东西。</div></div>';
  return h;
}
