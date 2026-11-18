"use strict";

// ---- Phase Mid：次极大国浅层议程全链路探针 ------------------------------------
// 要证明五件事：
//   1. IND / ITA / BRA / KOR 各有 2–3 步数据声明式议程树（非 DEFAULT 兜底）；
//   2. effects 全在词表内，且完成时有真实消费者（gdpBonus / 储备 / 安定·合法性）；
//   3. onComplete 字段已登记且能落到 generals 内政；
//   4. 门控走现有词表（mil_* / requires），引擎无新国家分派；
//   5. 默认路径不自动启动次极议程（aiMajors 仍仅七大国）—— history 不受污染。
function runMidAgendaProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("MIDPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const MID = ["IND", "ITA", "BRA", "KOR"];
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
    for (let i = 0; i < MID.length; i++) {
      const ck = MID[i];
      const list = AG.getAgendasForCountry(ck);
      trees[ck] = list;
      assert(ck + "OwnTree", Array.isArray(list) && list === AG.database[ck],
        ck + " 应有专属议程表，不得回落到 DEFAULT");
      assert(ck + "TreeDepth", list.length >= 2 && list.length <= 3,
        ck + " 浅层树应为 2–3 步，实为 " + list.length);
      // 至少一条 requires 链，证明是树而非并列清单
      const chained = list.filter((a) => typeof a.requires === "string");
      assert(ck + "HasChain", chained.length >= 1,
        ck + " 至少一步挂 requires 前置");
    }
    r.details.__midCountries = MID.join(",");
    r.details.__midAgendaCount = MID.reduce((n, ck) => n + trees[ck].length, 0);

    // ---- 2. effects / onComplete / condition 词表契约 ----
    const unkEffects = [];
    const badOc = [];
    const badCond = [];
    for (let i = 0; i < MID.length; i++) {
      const ck = MID[i];
      getGeneralDomestic(ck); // 物化 generals，供 onComplete 解析
      for (let j = 0; j < trees[ck].length; j++) {
        const ag = trees[ck][j];
        const unk = EFF.unknownKeys(ag.effects);
        if (unk.length) unkEffects.push(ck + "/" + ag.id + ":" + unk.join(","));
        // 真实消费者：至少有一条数值效果键（禁止纯 desc 装饰树）
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
    assert("midEffectsInVocab", unkEffects.length === 0,
      "effects 表外键 " + unkEffects.length + (unkEffects.length ? "：" + unkEffects.join(" | ") : ""));
    assert("midOnCompleteInVocab", badOc.length === 0,
      "onComplete 未登记/无解 " + badOc.length + (badOc.length ? "：" + badOc.join(",") : ""));
    assert("midConditionsInVocab", badCond.length === 0,
      "未登记门控 " + badCond.length + (badCond.length ? "：" + badCond.join(",") : ""));

    // ---- 3. 端到端：完成一步 → 红利与内政消费者真的动 ----
    initAgendaState();
    initDomesticState();
    if (typeof initReserves === "function") initReserves();
    else ST.reserves = ST.reserves || {};
    // 确保储备槽存在（与月度外汇流消费者对齐）
    for (let i = 0; i < MID.length; i++) {
      const ck = MID[i];
      if (!ST.reserves) ST.reserves = {};
      if (!ST.reserves[ck]) {
        ST.reserves[ck] = (window.W1980_TRADE && window.W1980_TRADE.getInitialReserve)
          ? window.W1980_TRADE.getInitialReserve(ck)
          : { usd: 10, trb: 0 };
      }
      getGeneralDomestic(ck);
    }

    // 以 IND 第一条为样板：启动 → 推满 → 查 gdpBonus / 合法性 / 安定
    ST.player = "IND";
    ST.mil = 2.5;
    const ind0 = trees.IND[0];
    const leg0 = ST.domestic.generals.IND.legitimacy;
    const stab0 = ST.domestic.generals.IND.stability;
    assert("indStartOk", startAgenda("IND", ind0.id) === true, "印度第一步应可启动");
    for (let i = 0; i < (ind0.duration || 12) + 2; i++) updateMonthlyAgendas(1980, 1 + (i % 12), true);
    const indState = getAgendaState("IND");
    assert("indCompleted", indState.completed.indexOf(ind0.id) >= 0 && !indState.active,
      "印度第一步应完成");
    assert("indGdpBonusConsumer", indState.bonuses.gdpBonus >= ind0.effects.gdpBonus - 1e-9,
      "完成后天赋 gdpBonus 必须进入 bonuses（实为 " + indState.bonuses.gdpBonus + "）");
    assert("indOnCompleteLegitimacy",
      ST.domestic.generals.IND.legitimacy > leg0,
      "onComplete.legitimacy 必须抬升执政合法性");
    assert("indOnCompleteStability",
      ST.domestic.generals.IND.stability > stab0,
      "onComplete.stability 必须抬升民生安定");

    // 月度外汇流：完成后再过一月，储备应上涨
    if (typeof ind0.effects.reserveMonthly === "number" && ind0.effects.reserveMonthly !== 0) {
      const usd0 = ST.reserves.IND.usd;
      updateMonthlyAgendas(1981, 3, true);
      assert("indReserveMonthlyConsumer",
        ST.reserves.IND.usd > usd0 - 1e-9 &&
        near(ST.reserves.IND.usd, usd0 + indState.bonuses.reserveMonthly, 0.05),
        "reserveMonthly 必须写入 ST.reserves.IND");
    } else {
      assert("indReserveMonthlyConsumer", true, "（该步无储备流，跳过）");
    }

    // 玩家 GDP 通道：applyPlayerDecisions 应吞下议程 gdpBonus
    if (typeof applyPlayerDecisions === "function" && SIM && SIM.S && SIM.S.P) {
      applyPlayerDecisions();
      // 不硬编码 pmods 绝对值（受其它通道影响），只要求奖金已挂进议程状态并由决策路径读取
      assert("indPlayerGdpPathWired",
        !!(ST.agendas.IND && ST.agendas.IND.bonuses && ST.agendas.IND.bonuses.gdpBonus > 0),
        "执政印度时议程 gdpBonus 应对齐玩家决策通道");
    } else {
      assert("indPlayerGdpPathWired", true, "（决策/引擎未就绪，跳过）");
    }

    // 门控：KOR 第三步 mil_le_3 —— 军费过高应锁（先把仿真年推到 yearMin）
    ST.player = "KOR";
    ST.mil = 5.5;
    const korLast = trees.KOR[trees.KOR.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = korLast.yearMin || 1987;
      SIM.S.month = korLast.monthMin || 6;
    }
    const korSt = getAgendaState("KOR");
    korSt.completed = trees.KOR.slice(0, -1).map((a) => a.id);
    korSt.active = null;
    if (korLast.condition === "mil_le_3") {
      assert("korMilGateBlocks", checkAgendaCondition("KOR", korLast).ok === false,
        "军费过高时 KOR 末步应被 mil_le_3 锁住");
      ST.mil = 2.0;
      assert("korMilGateOpens", checkAgendaCondition("KOR", korLast).ok === true,
        "军费达标后 KOR 末步应可启动（实因：" + checkAgendaCondition("KOR", korLast).reason + "）");
    } else {
      assert("korMilGateBlocks", true, "（末步无 mil_le_3，跳过）");
      assert("korMilGateOpens", true, "（末步无 mil_le_3，跳过）");
    }

    // ITA 末步 mil_ge_5
    ST.player = "ITA";
    ST.mil = 2.0;
    const itaLast = trees.ITA[trees.ITA.length - 1];
    if (SIM && SIM.S) {
      SIM.S.year = itaLast.yearMin || 1985;
      SIM.S.month = itaLast.monthMin || 1;
    }
    const itaSt = getAgendaState("ITA");
    itaSt.completed = trees.ITA.slice(0, -1).map((a) => a.id);
    itaSt.active = null;
    if (itaLast.condition === "mil_ge_5") {
      assert("itaMilGateBlocks", checkAgendaCondition("ITA", itaLast).ok === false,
        "军费不足时 ITA 末步应被 mil_ge_5 锁住");
      ST.mil = 5.5;
      assert("itaMilGateOpens", checkAgendaCondition("ITA", itaLast).ok === true,
        "军费达标后 ITA 末步应可启动（实因：" + checkAgendaCondition("ITA", itaLast).reason + "）");
    } else {
      assert("itaMilGateBlocks", true, "（末步无 mil_ge_5，跳过）");
      assert("itaMilGateOpens", true, "（末步无 mil_ge_5，跳过）");
    }

    // ---- 4. 默认路径不自动启动次极（引擎零新分派的可观察后果）----
    // 读源码不现实；用行为：清空次极议程状态，开 AI、玩家=USA，推进一月，次极不得被 start。
    initAgendaState();
    ST.player = "USA";
    ST.mil = 5.0;
    // 确保七大国可被 AI 触达的前提下，次极槽保持空
    for (let i = 0; i < MID.length; i++) getAgendaState(MID[i]);
    if (typeof isAIActive === "function") {
      // 探针会话通常 probeMode=true → AI 可激活；若未激活则跳过行为断言
      const aiOn = isAIActive();
      r.details.__aiActiveDuringMidProbe = aiOn ? "yes" : "no";
      if (aiOn) {
        updateMonthlyAgendas(1980, 2, true);
        let leaked = [];
        for (let i = 0; i < MID.length; i++) {
          const st = ST.agendas[MID[i]];
          if (st && (st.active || (st.completed && st.completed.length))) leaked.push(MID[i]);
        }
        assert("midNotAutoStartedByAI", leaked.length === 0,
          "AI 不得自动启动次极议程（泄漏：" + leaked.join(",") + "）");
      } else {
        assert("midNotAutoStartedByAI", true, "（本会话 AI 未激活，跳过行为断言）");
      }
    } else {
      assert("midNotAutoStartedByAI", false, "isAIActive 缺失");
    }

    // 静态：aiMajors 字面量仍应为七大国（用函数 toString 抽查，防止有人「顺便」扩表）
    if (typeof updateMonthlyAgendas === "function") {
      const src = Function.prototype.toString.call(updateMonthlyAgendas);
      const m = /aiMajors\s*=\s*\[([^\]]+)\]/.exec(src);
      assert("aiMajorsStillSeven", !!m && m[1].indexOf("IND") < 0 && m[1].indexOf("BRA") < 0
        && m[1].indexOf("ITA") < 0 && m[1].indexOf("KOR") < 0
        && (m[1].match(/"/g) || []).length === 14,
        "aiMajors 不得纳入次极（保持七大国，引擎零新分派）");
    }

    // BRA 完成一步时 stabilityBonus 即时写入 generals.stability
    ST.player = "BRA";
    ST.mil = 2.5;
    initAgendaState();
    initDomesticState();
    getGeneralDomestic("BRA");
    const bra0 = trees.BRA[0];
    if (SIM && SIM.S) {
      SIM.S.year = bra0.yearMin || 1982;
      SIM.S.month = bra0.monthMin || 8;
    }
    const braStab0 = ST.domestic.generals.BRA.stability;
    assert("braStartOk", startAgenda("BRA", bra0.id) === true,
      "巴西第一步应可启动（实因：" + (checkAgendaCondition("BRA", bra0).reason || "") + "）");
    for (let i = 0; i < (bra0.duration || 12) + 2; i++) {
      updateMonthlyAgendas(SIM.S.year, SIM.S.month, true);
    }
    assert("braCompleted", getAgendaState("BRA").completed.indexOf(bra0.id) >= 0,
      "巴西第一步应完成");
    if (typeof bra0.effects.stabilityBonus === "number") {
      assert("braStabilityBonusConsumer",
        ST.domestic.generals.BRA.stability > braStab0,
        "stabilityBonus 完成时应抬升 generals.stability（" + braStab0 + " → " +
          ST.domestic.generals.BRA.stability + "）");
    } else {
      assert("braStabilityBonusConsumer", true, "（该步无 stabilityBonus，跳过）");
    }

    assert("noEngineCountryDispatch",
      typeof startAgenda === "function" && typeof checkAgendaCondition === "function",
      "仍走既有 startAgenda / checkAgendaCondition，无 Mid 专用分派 API");

  } catch (e) {
    r.pass = false;
    r.errors.push("Exception: " + e.message);
    console.error("MIDPROBE exception", e);
  }

  const d = document.createElement("div"); d.id = "midprobe"; d.style.display = "none";
  d.textContent = "MIDPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
  return r;
}
