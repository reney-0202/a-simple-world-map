"use strict";

// ---- Phase E2：长引信的 AI 侧全链路探针 --------------------------------------
// E 建立了长引信，但对手只会旁观 —— 36–72 月的战略工程是单方面的：
// 你点火，他看戏。E2 让对手也埋引信。要证明六件事：
//   1. 对手真的会动 —— 养得起点火 / 养不起砍最贵 / 粘性防翻烧饼；
//   2. 决策确定且零 RNG —— 同状态同结果，不动引擎随机流；
//   3. 代价是真的 —— AI 引信走 pmods 拖累 GDP（P2/D2 读得到）；
//   4. 引爆按国势 —— 对手引信按对手国势分三档兑现，效果落到对手身上；
//   5. 选手可见 —— 面板与快照公开对方燃烧中的引信；
//   6. 史实不变量 —— 白名单门控、旁观零回写、存档可清洗。
function runFuseAiProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("FUSEAIPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = fuseTable();
    assert("tableLoaded", !!T && !!T.AI_POLICY && !!T.FUSES,
      "data/fuse.js 未载入（缺 AI_POLICY）");
    assert("apiPresent",
      typeof fuseAiActive === "function" && typeof aiPickFuse === "function" &&
      typeof aiFuseDragFor === "function" && typeof accFuseAiDrag === "function" &&
      typeof aiFuseSlotOf === "function" && typeof aiStopFuse === "function" &&
      typeof fuseAiActors === "function" && typeof fuseOutcomeFor === "function",
      "E2 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");
    const P = T.AI_POLICY;

    // ---- 1. 规则表完整性 ----
    assert("policyThresholdsOrdered",
      P.WANT_ACTIVE >= 1 && P.STRAIN_MAX > 0 && P.STRAIN_MAX <= 1 &&
      P.MIN_MONTHS >= 1 && P.PICK_HI_STRAIN > 0 && P.PICK_HI_STRAIN < P.PICK_MID_STRAIN &&
      P.PICK_MID_STRAIN < P.STRAIN_MAX,
      "AI_POLICY 阈值必须自洽（0 < HI < MID < STRAIN_MAX）");
    assert("pickTiersReal", ["hi", "mid", "lo"].every((t) =>
      Array.isArray(P.PICK[t]) && P.PICK[t].length > 0 &&
      P.PICK[t].every((id) => !!T.FUSES[id])),
      "PICK 三档必须都非空且全部指向真实引信");
    assert("pickTiersOrderedByCost", (() => {
      const d = (t) => Math.max(...P.PICK[t].map((id) => T.FUSES[id].drag));
      return d("hi") > d("mid") && d("mid") > d("lo");
    })(), "档位必须按拖累分层（压力越大越不敢上大工程）");

    // ---- 2. 开关：只有「有玩家 + 显式 ?e2probe」才让 AI 动 ----
    const savedPlayer = ST.player;
    ST.player = null;
    assert("gateOffWithoutPlayer", fuseAiActive() === false,
      "旁观者没有长引信竞赛");
    ST.player = "SUN";
    assert("gateOnInE2Probe", fuseAiActive() === true,
      "?e2probe=1 且有玩家时 AI 才决策（本探针会话应为 true）");

    // ---- 3. 选棋规则逐条验证（显式月 + 受控状态 + strain 桩）----
    const realStrain = window.polEconStrainOf;
    let strainStub = 0;
    window.polEconStrainOf = () => strainStub;
    initFuseState(true);
    ST.player = "SUN";
    const NOWY = 1985, NOWM = 6;
    const setCase = (strain, burning) => {
      const slot = aiFuseSlotOf("USA");
      slot.burning = {};
      slot.since = {};
      slot.bonuses = [];
      for (const id of (burning || [])) {
        slot.burning[id] = T.FUSES[id].months;
        slot.since[id] = (NOWY * 12 + NOWM) - P.MIN_MONTHS - 1;
      }
      strainStub = strain;
    };
    // 养得起 → 点火
    setCase(0, []);
    const pickIgnite = aiPickFuse("USA", NOWY, NOWM);
    assert("ruleIgniteStarts", !!(pickIgnite && pickIgnite.start),
      "压力低且无燃烧应点火，实得 " + JSON.stringify(pickIgnite));
    assert("ruleIgnitePicksHighTier", pickIgnite && pickIgnite.tier === "hi",
      "经济压力低时应上大工程（hi 档），实为 " + (pickIgnite && pickIgnite.tier));
    // 粘性：最近一项不满 MIN_MONTHS → 不再加新的
    setCase(0, ["welfare_compact"]);
    aiFuseSlotOf("USA").since.welfare_compact = NOWY * 12 + NOWM - 1;
    // WANT_ACTIVE=1 时已有一条 → 直接不点火；抬高 WANT 测粘性需临时改表
    const savedWant = P.WANT_ACTIVE;
    P.WANT_ACTIVE = 2;
    assert("ruleStickyBlocksChurn", aiPickFuse("USA", NOWY, NOWM) === null,
      "粘性窗口内不得再加新引信（防逐月翻烧饼）");
    P.WANT_ACTIVE = savedWant;
    // 满仓：MAX_ACTIVE 用满 → 不再加
    setCase(0, ["welfare_compact", "alliance_deepening"]);
    assert("ruleFullStopsAdding", aiPickFuse("USA", NOWY, NOWM) === null,
      "满仓不得再加引信");
    // 已达 WANT_ACTIVE → 不再加
    setCase(0, ["welfare_compact"]);
    assert("ruleWantSatisfied", aiPickFuse("USA", NOWY, NOWM) === null,
      "已达 WANT_ACTIVE 不应再点火");
    // 确定性 + 零 RNG
    setCase(0, []);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pick1 = aiPickFuse("USA", NOWY, NOWM);
    const pick2 = aiPickFuse("USA", NOWY, NOWM);
    assert("ruleDeterministic",
      JSON.stringify(pick1) === JSON.stringify(pick2), "同状态同结果");
    assert("ruleConsumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "AI 选棋不得消费引擎 RNG");
    // 压力分档
    setCase(P.PICK_HI_STRAIN + 0.05, []);
    assert("ruleMidTierUnderStrain", aiPickFuse("USA", NOWY, NOWM).tier === "mid",
      "中等压力应降到 mid 档");
    setCase(P.PICK_MID_STRAIN + 0.05, []);
    assert("ruleLoTierUnderStrain", aiPickFuse("USA", NOWY, NOWM).tier === "lo",
      "高压力应降到 lo 档");
    // 养不起 → 砍最贵的
    setCase(P.STRAIN_MAX + 0.05, ["welfare_compact", "missile_modernization"]);
    const pickStrain = aiPickFuse("USA", NOWY, NOWM);
    assert("ruleStrainCutsDearest", !!(pickStrain && pickStrain.stop === "missile_modernization"),
      "经济吃紧应停掉拖累最大的引信，实得 " + JSON.stringify(pickStrain));
    window.polEconStrainOf = realStrain;

    // ---- 4. 月度执行：点火 / 倒计时 ----
    initFuseState(true);
    ST.player = "SUN";
    updateMonthlyFuse(1985, 6, true);
    const slotUSA = aiFuseSlotOf("USA");
    assert("monthlyStartsIgnite", Object.keys(slotUSA.burning).length > 0,
      "月度推进后对手应已点火");
    const startedId = Object.keys(slotUSA.burning)[0];
    const left0 = slotUSA.burning[startedId];
    updateMonthlyFuse(1985, 7, true);
    assert("monthlyCountdownTicks", slotUSA.burning[startedId] === left0 - 1,
      "燃烧倒计时应逐月减少");

    // ---- 5. 代价是真的：pmods 拖累 ----
    initFuseState(true);
    ST.player = "SUN";
    aiFuseSlotOf("USA").burning = { missile_modernization: 48 };
    aiFuseSlotOf("USA").since = { missile_modernization: 1 };
    const drag = aiFuseDragFor("USA");
    assert("dragIsNegative", near(drag, -T.FUSES.missile_modernization.drag, 1e-9),
      "引信拖累应为负值（" + drag + "）");
    applyPlayerDecisions();
    const ekUSA = entKeys("USA");
    const pmUSA = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragEntersPmods", pmUSA <= -T.FUSES.missile_modernization.drag + 0.05,
      "AI 引信拖累必须进 pmods（实为 " + pmUSA + "）");
    aiFuseSlotOf("USA").burning = {};
    applyPlayerDecisions();
    const pmAfter = SIM.S.P.pmods[ekUSA[0]] || 0;
    assert("dragReleasedOnStop", pmAfter > pmUSA,
      "停掉引信后拖累应释放");
    assert("dragGatedOffWithoutPlayer", (() => {
      ST.player = null;
      const d = aiFuseDragFor("USA");
      ST.player = "SUN";
      return d === 0;
    })(), "无玩家时拖累必须归零（白名单门控）");

    // ---- 6. 引爆按国势落到对手身上 ----
    initFuseState(true);
    ST.player = "SUN";
    if (typeof initPrestigeState === "function") initPrestigeState(true);
    ST.prestige.scores.USA = 50;
    const before = prestigeOf("USA");
    // 强制辉煌：桩 unrest 低 + growth 高
    const realDom = window.polEconDomesticOf;
    const realGrowth = window.growthOf;
    window.polEconDomesticOf = (k) => (k === "USA" ? { unrest: 10, legitimacy: 50 } : realDom(k));
    window.growthOf = (keys) => 5.0;   // 远高于史实锚 → surprise 大正
    fuseApplyOutcome("alliance_deepening", "triumph", "USA");
    assert("outcomeLandsOnOwner", prestigeOf("USA") > before,
      "对手引信辉煌应给对手加威望");
    assert("outcomeSkipsPlayerCred", (() => {
      const cred0 = (ST.nuke && ST.nuke.credBonus) || 0;
      fuseApplyOutcome("alliance_deepening", "triumph", "USA");
      const cred1 = (ST.nuke && ST.nuke.credBonus) || 0;
      return cred1 === cred0;
    })(), "对手引爆不得改玩家的威慑可信度");
    // 强制惨败
    const beforeBad = prestigeOf("USA");
    fuseApplyOutcome("missile_modernization", "fiasco", "USA");
    assert("fiascoHurtsOwner", prestigeOf("USA") < beforeBad,
      "对手引信惨败应扣对手威望");
    window.polEconDomesticOf = realDom;
    window.growthOf = realGrowth;
    assert("outcomeForDeterministic",
      fuseOutcomeFor("USA") === fuseOutcomeFor("USA"), "同状态同结局");

    // ---- 7. 可见性：对手引信公开在面板与快照 ----
    initFuseState(true);
    ST.player = "SUN";
    aiFuseSlotOf("USA").burning = { naval_expansion: 20 };
    aiFuseSlotOf("USA").since = { naval_expansion: 1 };
    const snap = fuseSnapshot();
    assert("snapshotExposesRivalBurning",
      Array.isArray(snap.rivalBurning) && snap.rivalBurning.indexOf("naval_expansion") >= 0,
      "快照应公开对手燃烧中的引信");
    const panel = fusePanelHtml();
    assert("panelShowsRivalPrograms", panel.indexOf("对手工程") >= 0,
      "面板应显示对手工程行");

    // ---- 8. 存档往返与垃圾清洗 ----
    initFuseState(true);
    aiFuseSlotOf("USA").burning = { tech_education: 40 };
    aiFuseSlotOf("USA").since = { tech_education: 123 };
    aiFuseSlotOf("USA").bonuses = [{ gdpBonus: 0.2, months: 10 }];
    const rt = sanitizeFuseState(JSON.parse(JSON.stringify(ST.fuses)));
    assert("roundTripKeepsAi", !!(rt.ai && rt.ai.USA && rt.ai.USA.burning.tech_education === 40 &&
      rt.ai.USA.since.tech_education === 123 && rt.ai.USA.bonuses.length === 1),
      "存档往返后对手引信应保留");
    const junk = sanitizeFuseState({ ai: {
      ZZZ: { burning: { tech_education: 10 }, since: {} },
      USA: { burning: { nope: 10, tech_education: 5 }, since: { nope: 5, tech_education: 7 },
        bonuses: [{ gdpBonus: 0, months: 3 }, { gdpBonus: 0.1, months: 2 }] },
      SUN: { burning: { tech_education: -1 }, since: {} }
    } });
    assert("sanitizeRejectsJunk",
      !junk.ai.ZZZ && junk.ai.USA && junk.ai.USA.burning.tech_education === 5 &&
      junk.ai.USA.burning.nope === undefined && junk.ai.USA.since.tech_education === 7 &&
      !junk.ai.USA.since.nope && junk.ai.USA.bonuses.length === 1 &&
      junk.ai.SUN && Object.keys(junk.ai.SUN.burning).length === 0,
      "幽灵选手/未知引信/负数倒计时必须被清洗");
    assert("sanitizeNullSafe", !!sanitizeFuseState(null), "sanitizeFuseState(null) 必须返回缺省状态");

    // ---- 9. 旁观不变量：零回写 ----
    ST.player = null;
    initFuseState(true);
    const rngS = SIM.S ? SIM.S.rngState : null;
    const pmS = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    for (let i = 0; i < 6; i++) updateMonthlyFuse(1987, 1 + i, true);
    assert("spectatorNoAiPrograms", fuseAiActors().length === 0 && Object.keys(ST.fuses.ai).length === 0,
      "旁观者没有 AI 引信");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rngS : true, "不得消费引擎 RNG");
    assert("spectatorNoPmods", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pmS : true,
      "旁观不得改 pmods");

    // ---- 10. 端到端：真实推进，引信活着且不炸 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const snap2 = fuseSnapshot();
    assert("endToEndStateSane", !!snap2 && Array.isArray(snap2.rivalBurning),
      "端到端后快照应健全");
    assert("endToEndPanelRenders", fusePanelHtml().indexOf("长引信") >= 0,
      "端到端后面板仍在渲染");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "fuseaiprobe";
  d.style.display = "none";
  d.textContent = "FUSEAIPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
