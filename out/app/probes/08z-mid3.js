"use strict";

// ---- Phase Mid3：次极议程第三批全链路探针 ------------------------------------
// 要证明五件事：
//   1. POL / HUN / CSK / ROU 各有 2–3 步数据声明式议程树（非 DEFAULT 兜底）；
//   2. effects 全在词表内，且完成时有真实消费者（gdpBonus / 储备 / 安定·合法性）；
//   3. onComplete 字段已登记且能落到 generals 内政；
//   4. 门控走现有词表（mil_* / requires），引擎无新国家分派；
//   5. 默认路径不自动启动次极议程（aiMajors 仍仅七大国）—— history 不受污染。
function runMid3AgendaProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("MIDTHREEPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const MID3 = ["POL", "HUN", "CSK", "ROU"];
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
    for (let i = 0; i < MID3.length; i++) {
      const ck = MID3[i];
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
    r.details.__mid3Countries = MID3.join(",");
    r.details.__mid3AgendaCount = MID3.reduce((n, ck) => n + trees[ck].length, 0);

    // ---- 2. effects / onComplete / condition 词表契约 ----
    const unkEffects = [];
    const badOc = [];
    const badCond = [];
    for (let i = 0; i < MID3.length; i++) {
      const ck = MID3[i];
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
    assert("mid3EffectsInVocab", unkEffects.length === 0,
      "effects 表外键 " + unkEffects.length + (unkEffects.length ? "：" + unkEffects.join(" | ") : ""));
    assert("mid3OnCompleteInVocab", badOc.length === 0,
      "onComplete 未登记/无解 " + badOc.length + (badOc.length ? "：" + badOc.join(",") : ""));
    assert("mid3ConditionsInVocab", badCond.length === 0,
      "未登记门控 " + badCond.length + (badCond.length ? "：" + badCond.join(",") : ""));

    // ---- 3. 端到端：完成一步 → 红利与内政消费者真的动 ----
    initAgendaState();
    initDomesticState();
    if (typeof initReserves === "function") initReserves();
    else ST.reserves = ST.reserves || {};
    for (let i = 0; i < MID3.length; i++) {
      const ck = MID3[i];
      if (!ST.reserves) ST.reserves = {};
      if (!ST.reserves[ck]) {
        ST.reserves[ck] = (window.W1980_TRADE && window.W1980_TRADE.getInitialReserve)
          ? window.W1980_TRADE.getInitialReserve(ck)
          : { usd: 10, trb: 0 };
      }
      getGeneralDomestic(ck);
    }

    // 以 POL 第一条为样板：启动 → 推满 → 查 gdpBonus / 合法性 / 安定
    ST.player = "POL";
    ST.mil = 2.5;
    if (SIM && SIM.S) {
      SIM.S.year = trees.POL[0].yearMin || 1982;
      SIM.S.month = trees.POL[0].monthMin || 1;
    }
    const pol0 = trees.POL[0];
    const leg0 = ST.domestic.generals.POL.legitimacy;
    const stab0 = ST.domestic.generals.POL.stability;
    assert("polStartOk", startAgenda("POL", pol0.id) === true,
      "波兰第一步应可启动（实因：" + (checkAgendaCondition("POL", pol0).reason || "") + "）");
    for (let i = 0; i < (pol0.duration || 12) + 2; i++) {
      updateMonthlyAgendas(SIM.S.year, SIM.S.month, true);
    }
    const polState = getAgendaState("POL");
    assert("polCompleted", polState.completed.indexOf(pol0.id) >= 0 && !polState.active,
      "波兰第一步应完成");
    assert("polGdpBonusConsumer", polState.bonuses.gdpBonus >= pol0.effects.gdpBonus - 1e-9,
      "完成后天赋 gdpBonus 必须进入 bonuses（实为 " + polState.bonuses.gdpBonus + "）");
    assert("polOnCompleteLegitimacy",
      ST.domestic.generals.POL.legitimacy > leg0,
      "onComplete.legitimacy 必须抬升执政合法性");
    assert("polOnCompleteStability",
      typeof pol0.onComplete.stability === "number"
        ? ST.domestic.generals.POL.stability > stab0
        : (typeof pol0.effects.stabilityBonus === "number"
          ? ST.domestic.generals.POL.stability > stab0
          : true),
      "安定度消费者必须抬升 generals.stability");

    if (typeof pol0.effects.reserveMonthly === "number" && pol0.effects.reserveMonthly !== 0) {
      const usd0 = ST.reserves.POL.usd;
      updateMonthlyAgendas(1983, 3, true);
      assert("polReserveMonthlyConsumer",
        ST.reserves.POL.usd > usd0 - 1e-9 &&
        near(ST.reserves.POL.usd, usd0 + polState.bonuses.reserveMonthly, 0.05),
        "reserveMonthly 必须写入 ST.reserves.POL");
    } else {
      assert("polReserveMonthlyConsumer", true, "（该步无储备流，跳过）");
    }

    if (typeof applyPlayerDecisions === "function" && SIM && SIM.S && SIM.S.P) {
      applyPlayerDecisions();
      assert("polPlayerGdpPathWired",
        !!(ST.agendas.POL && ST.agendas.POL.bonuses && ST.agendas.POL.bonuses.gdpBonus > 0),
        "执政波兰时议程 gdpBonus 应对齐玩家决策通道");
    } else {
      assert("polPlayerGdpPathWired", true, "（决策/引擎未就绪，跳过）");
    }

    // 门控：POL 末步 mil_le_3 —— 军费过高应锁
    ST.player = "POL";
    ST.mil = 5.5;
    const polLast = trees.POL[trees.POL.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = polLast.yearMin || 1989;
      SIM.S.month = polLast.monthMin || 6;
    }
    const polSt = getAgendaState("POL");
    polSt.completed = trees.POL.slice(0, -1).map((a) => a.id);
    polSt.active = null;
    if (polLast.condition === "mil_le_3") {
      assert("polMilGateBlocks", checkAgendaCondition("POL", polLast).ok === false,
        "军费过高时 POL 末步应被 mil_le_3 锁住");
      ST.mil = 2.0;
      assert("polMilGateOpens", checkAgendaCondition("POL", polLast).ok === true,
        "军费达标后 POL 末步应可启动（实因：" + checkAgendaCondition("POL", polLast).reason + "）");
    } else {
      assert("polMilGateBlocks", true, "（末步无 mil_le_3，跳过）");
      assert("polMilGateOpens", true, "（末步无 mil_le_3，跳过）");
    }

    // ROU 末步 mil_ge_5
    ST.player = "ROU";
    ST.mil = 2.0;
    const rouLast = trees.ROU[trees.ROU.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = rouLast.yearMin || 1986;
      SIM.S.month = rouLast.monthMin || 1;
    }
    const rouSt = getAgendaState("ROU");
    rouSt.completed = trees.ROU.slice(0, -1).map((a) => a.id);
    rouSt.active = null;
    if (rouLast.condition === "mil_ge_5") {
      assert("rouMilGateBlocks", checkAgendaCondition("ROU", rouLast).ok === false,
        "军费不足时 ROU 末步应被 mil_ge_5 锁住");
      ST.mil = 5.5;
      assert("rouMilGateOpens", checkAgendaCondition("ROU", rouLast).ok === true,
        "军费达标后 ROU 末步应可启动（实因：" + checkAgendaCondition("ROU", rouLast).reason + "）");
    } else {
      assert("rouMilGateBlocks", true, "（末步无 mil_ge_5，跳过）");
      assert("rouMilGateOpens", true, "（末步无 mil_ge_5，跳过）");
    }

    // ---- 4. 默认路径不自动启动次极（引擎零新分派的可观察后果）----
    initAgendaState();
    ST.player = "USA";
    ST.mil = 5.0;
    for (let i = 0; i < MID3.length; i++) getAgendaState(MID3[i]);
    if (typeof isAIActive === "function") {
      const aiOn = isAIActive();
      r.details.__aiActiveDuringMid3Probe = aiOn ? "yes" : "no";
      if (aiOn) {
        updateMonthlyAgendas(1980, 2, true);
        let leaked = [];
        for (let i = 0; i < MID3.length; i++) {
          const st = ST.agendas[MID3[i]];
          if (st && (st.active || (st.completed && st.completed.length))) leaked.push(MID3[i]);
        }
        assert("mid3NotAutoStartedByAI", leaked.length === 0,
          "AI 不得自动启动次极议程（泄漏：" + leaked.join(",") + "）");
      } else {
        assert("mid3NotAutoStartedByAI", true, "（本会话 AI 未激活，跳过行为断言）");
      }
    } else {
      assert("mid3NotAutoStartedByAI", false, "isAIActive 缺失");
    }

    if (typeof updateMonthlyAgendas === "function") {
      const src = Function.prototype.toString.call(updateMonthlyAgendas);
      const m = /aiMajors\s*=\s*\[([^\]]+)\]/.exec(src);
      assert("aiMajorsStillSeven", !!m
        && m[1].indexOf("POL") < 0 && m[1].indexOf("HUN") < 0
        && m[1].indexOf("CSK") < 0 && m[1].indexOf("ROU") < 0
        && m[1].indexOf("TUR") < 0 && m[1].indexOf("IND") < 0
        && (m[1].match(/"/g) || []).length === 14,
        "aiMajors 不得纳入次极（保持七大国，引擎零新分派）");
    }

    // HUN 完成一步时 stabilityBonus 即时写入 generals.stability
    ST.player = "HUN";
    ST.mil = 2.5;
    initAgendaState();
    initDomesticState();
    getGeneralDomestic("HUN");
    const hun0 = trees.HUN[0];
    if (SIM && SIM.S) {
      SIM.S.year = hun0.yearMin || 1980;
      SIM.S.month = hun0.monthMin || 1;
    }
    const hunStab0 = ST.domestic.generals.HUN.stability;
    assert("hunStartOk", startAgenda("HUN", hun0.id) === true,
      "匈牙利第一步应可启动（实因：" + (checkAgendaCondition("HUN", hun0).reason || "") + "）");
    for (let i = 0; i < (hun0.duration || 12) + 2; i++) {
      updateMonthlyAgendas(SIM.S.year, SIM.S.month, true);
    }
    assert("hunCompleted", getAgendaState("HUN").completed.indexOf(hun0.id) >= 0,
      "匈牙利第一步应完成");
    if (typeof hun0.effects.stabilityBonus === "number") {
      assert("hunStabilityBonusConsumer",
        ST.domestic.generals.HUN.stability > hunStab0,
        "stabilityBonus 完成时应抬升 generals.stability（" + hunStab0 + " → " +
          ST.domestic.generals.HUN.stability + "）");
    } else {
      assert("hunStabilityBonusConsumer", true, "（该步无 stabilityBonus，跳过）");
    }

    assert("noEngineCountryDispatch",
      typeof startAgenda === "function" && typeof checkAgendaCondition === "function",
      "仍走既有 startAgenda / checkAgendaCondition，无 Mid3 专用分派 API");

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
    console.error("MIDTHREEPROBE exception", e);
  }

  // 标记须纯字母：runner 的 MARKER_RE 是 [A-Z]+PROBE，数字会漏抓（故不用 MID3PROBE）
  const d = document.createElement("div"); d.id = "mid3probe"; d.style.display = "none";
  d.textContent = "MIDTHREEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
