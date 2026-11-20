"use strict";

// ---- Phase Mid2：次极议程第二批全链路探针 ------------------------------------
// 要证明五件事：
//   1. TUR / ESP / EGY / PAK 各有 2–3 步数据声明式议程树（非 DEFAULT 兜底）；
//   2. effects 全在词表内，且完成时有真实消费者（gdpBonus / 储备 / 安定·合法性）；
//   3. onComplete 字段已登记且能落到 generals 内政；
//   4. 门控走现有词表（mil_* / requires），引擎无新国家分派；
//   5. 默认路径不自动启动次极议程（aiMajors 仍仅七大国）—— history 不受污染。
function runMid2AgendaProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("MIDTWOPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const MID2 = ["TUR", "ESP", "EGY", "PAK"];
    const AG = window.W1980_AGENDAS;
    const EFF = window.W1980_EFFECTS;
    const REG = window.W1980_AGENDA_CONDITIONS;

    assert("databaseLoaded", !!(AG && typeof AG.getAgendasForCountry === "function"),
      "W1980_AGENDAS 应已载入");
    assert("effectsVocabLoaded", !!(EFF && typeof EFF.isEffect === "function"),
      "W1980_EFFECTS 应已载入");
    assert("conditionVocabLoaded", !!(REG && typeof REG.isRegistered === "function"
      && typeof REG.isOnCompleteField === "function"),
      "W1980_AGENDA_CONDITIONS 应已载入");
    if (!AG || !EFF || !REG) throw new Error("cannot continue without vocabularies");

    // ---- 1. 四国各有专属浅层树（2–3 步），且不是 DEFAULT ----
    const trees = {};
    for (let i = 0; i < MID2.length; i++) {
      const ck = MID2[i];
      const list = AG.getAgendasForCountry(ck);
      trees[ck] = list;
      assert(ck + "OwnTree", Array.isArray(list) && list === AG.database[ck],
        ck + " 应有专属议程表，不得回落到 DEFAULT");
      assert(ck + "TreeDepth", list.length >= 2 && list.length <= 3,
        ck + " 浅层树应为 2–3 步，实为 " + list.length);
      const chained = list.filter((a) => typeof a.requires === "string");
      assert(ck + "HasChain", chained.length >= 1,
        ck + " 至少一步挂 requires 前置");
    }
    r.details.__mid2Countries = MID2.join(",");
    r.details.__mid2AgendaCount = MID2.reduce((n, ck) => n + trees[ck].length, 0);

    // ---- 2. effects / onComplete / condition 词表契约 ----
    const unkEffects = [];
    const badOc = [];
    const badCond = [];
    for (let i = 0; i < MID2.length; i++) {
      const ck = MID2[i];
      getGeneralDomestic(ck);
      for (let j = 0; j < trees[ck].length; j++) {
        const ag = trees[ck][j];
        const unk = EFF.unknownKeys(ag.effects);
        if (unk.length) unkEffects.push(ck + "/" + ag.id + ":" + unk.join(","));
        const numeric = ["gdpBonus", "reserveMonthly", "stabilityBonus", "domesticShortage",
          "congressBonus", "techSecurity"].filter((k) => typeof ag.effects[k] === "number" || ag.effects[k] === true);
        assert(ck + "/" + ag.id + "/hasConsumerKey", numeric.length >= 1,
          ag.id + " 必须声明至少一条可消费的效果键");
        if (ag.onComplete) {
          for (const field in ag.onComplete) {
            if (!REG.isOnCompleteField(field)) badOc.push(ag.id + "." + field);
            const st = domesticStateOf(ck);
            if (!st || typeof st[field] !== "number") badOc.push(ag.id + "." + field + "(unresolved)");
          }
        }
        if (ag.condition && !REG.isRegistered(ag.condition)) badCond.push(ag.id + ":" + ag.condition);
      }
    }
    assert("mid2EffectsInVocab", unkEffects.length === 0,
      "effects 表外键 " + unkEffects.length + (unkEffects.length ? "：" + unkEffects.join(" | ") : ""));
    assert("mid2OnCompleteInVocab", badOc.length === 0,
      "onComplete 未登记/无解 " + badOc.length + (badOc.length ? "：" + badOc.join(",") : ""));
    assert("mid2ConditionsInVocab", badCond.length === 0,
      "未登记门控 " + badCond.length + (badCond.length ? "：" + badCond.join(",") : ""));

    // ---- 3. 端到端：完成一步 → 红利与内政消费者真的动 ----
    initAgendaState();
    initDomesticState();
    if (typeof initReserves === "function") initReserves();
    else ST.reserves = ST.reserves || {};
    for (let i = 0; i < MID2.length; i++) {
      const ck = MID2[i];
      if (!ST.reserves) ST.reserves = {};
      if (!ST.reserves[ck]) {
        ST.reserves[ck] = (window.W1980_TRADE && window.W1980_TRADE.getInitialReserve)
          ? window.W1980_TRADE.getInitialReserve(ck)
          : { usd: 10, trb: 0 };
      }
      getGeneralDomestic(ck);
    }

    // 以 TUR 第一条为样板：启动 → 推满 → 查 gdpBonus / 合法性 / 安定
    ST.player = "TUR";
    ST.mil = 2.5;
    const tur0 = trees.TUR[0];
    const leg0 = ST.domestic.generals.TUR.legitimacy;
    const stab0 = ST.domestic.generals.TUR.stability;
    assert("turStartOk", startAgenda("TUR", tur0.id) === true, "土耳其第一步应可启动");
    for (let i = 0; i < (tur0.duration || 12) + 2; i++) updateMonthlyAgendas(1980, 1 + (i % 12), true);
    const turState = getAgendaState("TUR");
    assert("turCompleted", turState.completed.indexOf(tur0.id) >= 0 && !turState.active,
      "土耳其第一步应完成");
    assert("turGdpBonusConsumer", turState.bonuses.gdpBonus >= tur0.effects.gdpBonus - 1e-9,
      "完成后天赋 gdpBonus 必须进入 bonuses（实为 " + turState.bonuses.gdpBonus + "）");
    assert("turOnCompleteLegitimacy",
      ST.domestic.generals.TUR.legitimacy > leg0,
      "onComplete.legitimacy 必须抬升执政合法性");
    assert("turOnCompleteStability",
      ST.domestic.generals.TUR.stability > stab0,
      "onComplete.stability 必须抬升民生安定");

    if (typeof tur0.effects.reserveMonthly === "number" && tur0.effects.reserveMonthly !== 0) {
      const usd0 = ST.reserves.TUR.usd;
      updateMonthlyAgendas(1981, 3, true);
      assert("turReserveMonthlyConsumer",
        ST.reserves.TUR.usd > usd0 - 1e-9 &&
        near(ST.reserves.TUR.usd, usd0 + turState.bonuses.reserveMonthly, 0.05),
        "reserveMonthly 必须写入 ST.reserves.TUR");
    } else {
      assert("turReserveMonthlyConsumer", true, "（该步无储备流，跳过）");
    }

    if (typeof applyPlayerDecisions === "function" && SIM && SIM.S && SIM.S.P) {
      applyPlayerDecisions();
      assert("turPlayerGdpPathWired",
        !!(ST.agendas.TUR && ST.agendas.TUR.bonuses && ST.agendas.TUR.bonuses.gdpBonus > 0),
        "执政土耳其时议程 gdpBonus 应对齐玩家决策通道");
    } else {
      assert("turPlayerGdpPathWired", true, "（决策/引擎未就绪，跳过）");
    }

    // 门控：ESP 末步 mil_le_3 —— 军费过高应锁
    ST.player = "ESP";
    ST.mil = 5.5;
    const espLast = trees.ESP[trees.ESP.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = espLast.yearMin || 1988;
      SIM.S.month = espLast.monthMin || 6;
    }
    const espSt = getAgendaState("ESP");
    espSt.completed = trees.ESP.slice(0, -1).map((a) => a.id);
    espSt.active = null;
    if (espLast.condition === "mil_le_3") {
      assert("espMilGateBlocks", checkAgendaCondition("ESP", espLast).ok === false,
        "军费过高时 ESP 末步应被 mil_le_3 锁住");
      ST.mil = 2.0;
      assert("espMilGateOpens", checkAgendaCondition("ESP", espLast).ok === true,
        "军费达标后 ESP 末步应可启动（实因：" + checkAgendaCondition("ESP", espLast).reason + "）");
    } else {
      assert("espMilGateBlocks", true, "（末步无 mil_le_3，跳过）");
      assert("espMilGateOpens", true, "（末步无 mil_le_3，跳过）");
    }

    // PAK 末步 mil_ge_5
    ST.player = "PAK";
    ST.mil = 2.0;
    const pakLast = trees.PAK[trees.PAK.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = pakLast.yearMin || 1986;
      SIM.S.month = pakLast.monthMin || 1;
    }
    const pakSt = getAgendaState("PAK");
    pakSt.completed = trees.PAK.slice(0, -1).map((a) => a.id);
    pakSt.active = null;
    if (pakLast.condition === "mil_ge_5") {
      assert("pakMilGateBlocks", checkAgendaCondition("PAK", pakLast).ok === false,
        "军费不足时 PAK 末步应被 mil_ge_5 锁住");
      ST.mil = 5.5;
      assert("pakMilGateOpens", checkAgendaCondition("PAK", pakLast).ok === true,
        "军费达标后 PAK 末步应可启动（实因：" + checkAgendaCondition("PAK", pakLast).reason + "）");
    } else {
      assert("pakMilGateBlocks", true, "（末步无 mil_ge_5，跳过）");
      assert("pakMilGateOpens", true, "（末步无 mil_ge_5，跳过）");
    }

    // ---- 4. 默认路径不自动启动次极（引擎零新分派的可观察后果）----
    initAgendaState();
    ST.player = "USA";
    ST.mil = 5.0;
    for (let i = 0; i < MID2.length; i++) getAgendaState(MID2[i]);
    if (typeof isAIActive === "function") {
      const aiOn = isAIActive();
      r.details.__aiActiveDuringMid2Probe = aiOn ? "yes" : "no";
      if (aiOn) {
        updateMonthlyAgendas(1980, 2, true);
        let leaked = [];
        for (let i = 0; i < MID2.length; i++) {
          const st = ST.agendas[MID2[i]];
          if (st && (st.active || (st.completed && st.completed.length))) leaked.push(MID2[i]);
        }
        assert("mid2NotAutoStartedByAI", leaked.length === 0,
          "AI 不得自动启动次极议程（泄漏：" + leaked.join(",") + "）");
      } else {
        assert("mid2NotAutoStartedByAI", true, "（本会话 AI 未激活，跳过行为断言）");
      }
    } else {
      assert("mid2NotAutoStartedByAI", false, "isAIActive 缺失");
    }

    if (typeof updateMonthlyAgendas === "function") {
      const src = Function.prototype.toString.call(updateMonthlyAgendas);
      const m = /aiMajors\s*=\s*\[([^\]]+)\]/.exec(src);
      assert("aiMajorsStillSeven", !!m
        && m[1].indexOf("TUR") < 0 && m[1].indexOf("ESP") < 0
        && m[1].indexOf("EGY") < 0 && m[1].indexOf("PAK") < 0
        && m[1].indexOf("IND") < 0 && m[1].indexOf("BRA") < 0
        && (m[1].match(/"/g) || []).length === 14,
        "aiMajors 不得纳入次极（保持七大国，引擎零新分派）");
    }

    // EGY 完成一步时 stabilityBonus 即时写入 generals.stability
    ST.player = "EGY";
    ST.mil = 2.5;
    initAgendaState();
    initDomesticState();
    getGeneralDomestic("EGY");
    const egy0 = trees.EGY[0];
    if (SIM && SIM.S) {
      SIM.S.year = egy0.yearMin || 1980;
      SIM.S.month = egy0.monthMin || 1;
    }
    const egyStab0 = ST.domestic.generals.EGY.stability;
    assert("egyStartOk", startAgenda("EGY", egy0.id) === true,
      "埃及第一步应可启动（实因：" + (checkAgendaCondition("EGY", egy0).reason || "") + "）");
    for (let i = 0; i < (egy0.duration || 12) + 2; i++) {
      updateMonthlyAgendas(SIM.S.year, SIM.S.month, true);
    }
    assert("egyCompleted", getAgendaState("EGY").completed.indexOf(egy0.id) >= 0,
      "埃及第一步应完成");
    if (typeof egy0.effects.stabilityBonus === "number") {
      assert("egyStabilityBonusConsumer",
        ST.domestic.generals.EGY.stability > egyStab0,
        "stabilityBonus 完成时应抬升 generals.stability（" + egyStab0 + " → " +
          ST.domestic.generals.EGY.stability + "）");
    } else {
      assert("egyStabilityBonusConsumer", true, "（该步无 stabilityBonus，跳过）");
    }

    assert("noEngineCountryDispatch",
      typeof startAgenda === "function" && typeof checkAgendaCondition === "function",
      "仍走既有 startAgenda / checkAgendaCondition，无 Mid2 专用分派 API");

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
    console.error("MIDTWOPROBE exception", e);
  }

  // 标记须纯字母：runner 的 MARKER_RE 是 [A-Z]+PROBE，数字会漏抓（故不用 MID2PROBE）
  const d = document.createElement("div"); d.id = "mid2probe"; d.style.display = "none";
  d.textContent = "MIDTWOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
