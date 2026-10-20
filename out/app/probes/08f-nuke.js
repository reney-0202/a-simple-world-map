"use strict";

// ---- Phase N1：核风险轴全链路探针 --------------------------------------------
// 这一阶段要把 6 个「面板上写着、引擎里没有分支」的键变成一条真实机制。
// 要证明五件事：
//   1. display-only 归零 —— 那 6 个键每一个都真的改状态；
//   2. 史实不变量 —— 无执政者时零回写、不触发事故；
//   3. 升级/可信度/误判三者的关系是对的（单调、有界、低升级时几乎为零）；
//   4. 事故是**两难**，不是「有一个正确答案」；
//   5. 核战争只能是战略性失败（DEFCON 1 连持），不是掷骰失败。
function runNukeProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("NUKEPROBE FAIL [" + name + "]: " + msg);
    }
  };
  const near = (a, b, eps) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= (eps || 1e-6);

  try {
    const T = nukeTable();
    assert("tableLoaded", !!T && !!T.DEFCON && !!T.INCIDENTS && !!T.PARAMS, "data/nuke.js 未载入");
    assert("apiPresent",
      typeof updateNukeRisk === "function" && typeof nukeSnapshot === "function" &&
      typeof nukeApplyEffect === "function" && typeof nukeEscalateByTier === "function" &&
      typeof resolveNukeIncident === "function" && typeof nukeRiskOf === "function" &&
      typeof nukeRoll === "function" && typeof nukePanelHtml === "function" &&
      typeof sanitizeNukeState === "function",
      "核风险 API 缺失");
    if (!T) throw new Error("cannot continue without the data table");

    // ---- 1. 表完整性：DEFCON 覆盖 5→1、事故都有两难选项 ----
    assert("defconCoversOneToFive", [1, 2, 3, 4, 5].every((lv) => T.DEFCON.some((d) => d.level === lv)),
      "DEFCON 必须覆盖 1..5 全部等级");
    assert("defconMonotonic", (() => {
      const asc = T.DEFCON.slice().sort((a, b) => a.level - b.level);
      for (let i = 1; i < asc.length; i++) if (!(asc[i].from < asc[i - 1].from)) return false;
      return true;
    })(), "DEFCON 阈值必须随等级降低而升高");
    assert("defconFiveStartsAtZero", T.DEFCON.some((d) => d.level === 5 && d.from === 0),
      "第 5 级必须从 0 起（低升级段要有定义）");
    assert("incidentsHaveDilemmas", T.INCIDENTS.every((i) =>
      i.options.some((o) => o.esc < 0 && o.cred < 0) && i.options.some((o) => o.esc > 0 && o.cred > 0)),
      "每个事故都必须同时有「降温丢面子」与「强硬有收益」的选项");

    // ---- 2. DEFCON 映射 ----
    assert("defconAtZero", nukeDefconOf(0) === 5, "升级 0 应为 DEFCON 5");
    assert("defconAtMax", nukeDefconOf(100) === 1, "升级 100 应为 DEFCON 1");
    assert("defconMonotoneInEsc", (() => {
      let prev = 5;
      for (let e = 0; e <= 100; e += 5) {
        const d = nukeDefconOf(e);
        if (d > prev) return false;      // 升级越高，等级数字越小
        prev = d;
      }
      return true;
    })(), "DEFCON 必须随升级单调不升（等级数字不增）");
    assert("defconCoversEveryBand", (() => {
      const seen = {};
      for (let e = 0; e <= 100; e++) seen[nukeDefconOf(e)] = true;
      return Object.keys(seen).length === 5;
    })(), "0..100 必须真的走过全部 5 个等级（否则有一级是死档）");

    // ---- 3. 误判概率：低升级几乎为零、随升级单调、随可信度下降、有上限 ----
    assert("riskZeroAtPeace", nukeRiskOf(0, 50) === 0, "和平时期的月误判概率必须为 0");
    assert("riskTinyAtLowEscalation", nukeRiskOf(20, 50) < 0.0005,
      "低升级段的误判概率必须极小（" + nukeRiskOf(20, 50) + "）");
    assert("riskMonotoneInEscalation", nukeRiskOf(80, 50) > nukeRiskOf(50, 50) &&
      nukeRiskOf(50, 50) > nukeRiskOf(30, 50), "误判概率必须随升级单调上升");
    assert("riskMonotoneInCredibility", nukeRiskOf(80, 30) > nukeRiskOf(80, 80),
      "威慑可信度越低，误判概率越高（裁军有战略风险）");
    assert("riskCapped", nukeRiskOf(100, 5) <= T.PARAMS.RISK_CAP + 1e-12,
      "误判概率必须有上限（否则成了掷骰游戏），实为 " + nukeRiskOf(100, 5));
    assert("riskRollDeterministic", nukeRoll(1985, 3, "x") === nukeRoll(1985, 3, "x"),
      "掷骰必须确定（同年/月/盐同结果）");
    assert("riskRollInRange", (() => {
      for (let i = 0; i < 40; i++) {
        const v = nukeRoll(1980 + (i % 12), 1 + (i % 12), "incident");
        if (!(v >= 0 && v < 1)) return false;
      }
      return true;
    })(), "掷骰结果必须落在 [0,1)");

    // ---- 4. 史实不变量：旁观零回写、不触发事故 ----
    const savedPlayer = ST.player;
    ST.player = null;
    initNukeState(true);
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const gdp0 = SIM.S ? JSON.stringify(SIM.S.gdp) : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    // 即便把升级推到极高的危险区，旁观也不该被事故惩罚
    ST.nuke.esc = 95;
    for (let i = 0; i < 24; i++) updateNukeRisk(1984, 1 + (i % 12), true);
    assert("spectatorNoIncident", ST.nuke.pending === null && ST.nuke.fired.length === 0,
      "无执政者时不得触发核危机事故（没有决策者，就不该被随机事件惩罚）");
    assert("spectatorNoDoomsday", !ST.nuke.over,
      "无执政者时不得判定核战争");
    assert("spectatorNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "核风险轴不得消费引擎 RNG");
    assert("spectatorNoGdpWrites", SIM.S ? JSON.stringify(SIM.S.gdp) === gdp0 : true, "不得改 gdp");
    assert("spectatorNoPmodWrites", SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true, "不得改 pmods");
    assert("spectatorNoDomesticWrites", ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true,
      "无执政者时不得写内政");
    assert("spectatorStillComputesState", typeof ST.nuke.esc === "number" && typeof ST.nuke.defcon === "number",
      "旁观也应计算 DEFCON（它是世界状态的一部分）");

    // ---- 5. 那 6 个「展示用」键现在真的改状态 ----
    initNukeState(true);
    const e0 = ST.nuke.esc, c0 = ST.nuke.credBonus;
    nukeApplyEffect({ defconRisk: +5 }, "t");
    assert("keyDefconRiskWorks", ST.nuke.esc === e0 + 5,
      "defconRisk 必须真的推升级（" + e0 + " → " + ST.nuke.esc + "）");
    initNukeState(true);
    nukeApplyEffect({ middleEastTension: +10 }, "t");
    assert("keyMiddleEastWorks", ST.nuke.esc === 10, "middleEastTension 必须真的推升级");
    initNukeState(true);
    nukeApplyEffect({ cubanTension: +15 }, "t");
    assert("keyCubanWorks", ST.nuke.esc === 15, "cubanTension 必须真的推升级");
    initNukeState(true);
    nukeApplyEffect({ usSanctionPressure: true }, "t");
    assert("keySanctionBooleanWorks", ST.nuke.esc === 4,
      "usSanctionPressure 在数据里是布尔，必须被接受并按 4 点计（实为 " + ST.nuke.esc + "）");
    initNukeState(true);
    nukeApplyEffect({ usSanctionPressure: 6 }, "t");
    assert("keySanctionNumberWorks", ST.nuke.esc === 6, "usSanctionPressure 为数字时按数值计");
    initNukeState(true);
    nukeApplyEffect({ natoCohesion: +5 }, "t");
    assert("keyCohesionWorks", ST.nuke.credBonus === c0 + 5,
      "natoCohesion 必须真的改威慑可信度加成（" + c0 + " → " + ST.nuke.credBonus + "）");
    initNukeState(true);
    if (!ST.domestic) initDomesticState();
    const gbrBefore = (ST.domestic && ST.domestic.gbr) ? ST.domestic.gbr.unrest : null;
    nukeApplyEffect({ gbrPopularity: +6 }, "t");
    const gbrAfter = (ST.domestic && ST.domestic.gbr) ? ST.domestic.gbr.unrest : null;
    assert("keyGbrPopularityWorks", gbrBefore !== null && gbrAfter !== null && gbrAfter < gbrBefore,
      "gbrPopularity 必须真的落到英国国内动荡（" + gbrBefore + " → " + gbrAfter + "）");
    assert("noDisplayOnlyLeft", (() => {
      // 词表里不该再有任何 target 写着「展示用」的键
      const EFF = window.W1980_EFFECTS;
      if (!EFF || !EFF.EFFECTS) return false;
      return Object.keys(EFF.EFFECTS).every((k) => String(EFF.EFFECTS[k].target || "").indexOf("展示用") < 0);
    })(), "效果词表里不得再有「展示用」键（6 个展示键必须全部接上消费者）");

    // ---- 6. 危机阶梯推升级 ----
    initNukeState(true);
    const add1 = nukeEscalateByTier(1), add3 = nukeEscalateByTier(3);
    assert("tierEscalates", add1 > 0 && add3 > add1, "危机阶梯越高，升级越大（" + add1 + " vs " + add3 + "）");
    assert("tierEscalationAccumulates", ST.nuke.esc === add1 + add3, "阶梯升级必须累加");
    assert("tierZeroIsNeutral", (() => {
      const before = ST.nuke.esc;
      return nukeEscalateByTier(0) === 0 && ST.nuke.esc === before;
    })(), "0 阶梯（没有选择/谈判）不得推升级");

    // ---- 7. 常态推拉：张力/战争/条约/衰减 ----
    initNukeState(true);
    ST.player = "SUN"; ST.mil = 4;
    ST.ai = { enabled: false, decisions: {}, tensions: { "USA:SUN": 100 }, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    ST.nuke.esc = 50;
    updateNukeRisk(1985, 6, true);
    assert("tensionDrivesEscalation", ST.nuke.esc > 50,
      "高张力应推高升级（50 → " + ST.nuke.esc + "）");
    ST.ai.tensions["USA:SUN"] = 0;
    ST.nuke.esc = 50;
    updateNukeRisk(1985, 7, true);
    assert("decayPullsDown", ST.nuke.esc < 50, "零张力时升级应自然回落（50 → " + ST.nuke.esc + "）");
    ST.ai.tensions["USA:SUN"] = 0;
    ST.ai.treaties = [{ id: "inf", status: "active", with: "USA" }];
    ST.nuke.esc = 50;
    updateNukeRisk(1985, 8, true);
    const withTreaty = ST.nuke.esc;
    ST.ai.treaties = [];
    ST.nuke.esc = 50;
    updateNukeRisk(1985, 9, true);
    assert("treatyCoolsEscalation", withTreaty < ST.nuke.esc,
      "生效军控条约应压低升级（有条约 " + withTreaty.toFixed(2) + " vs 无条约 " + ST.nuke.esc.toFixed(2) + "）");
    assert("escalationBounded", (() => {
      ST.ai.tensions["USA:SUN"] = 100;
      ST.nuke.esc = 99.9;
      for (let i = 0; i < 6; i++) updateNukeRisk(1986, 1 + i, true);
      return ST.nuke.esc <= 100 && ST.nuke.esc >= 0;
    })(), "升级必须恒在 [0,100]");

    // ---- 8. 事故裁决：三选一真的改状态、且必然结束待裁决 ----
    initNukeState(true);
    ST.player = "SUN";
    ST.nuke.esc = 50;
    ST.nuke.pending = { id: "false_alarm", y: 1987, m: 3 };
    const escBefore = ST.nuke.esc;
    const resHawk = resolveNukeIncident("retaliate", true);
    assert("incidentHawkApplies", resHawk.ok && ST.nuke.esc > escBefore,
      "强硬处置必须推高升级（" + escBefore + " → " + ST.nuke.esc + "）");
    assert("incidentClearsPending", ST.nuke.pending === null, "裁决后必须清空待裁决状态");
    initNukeState(true);
    ST.player = "SUN";
    ST.nuke.esc = 50;
    ST.nuke.pending = { id: "false_alarm", y: 1987, m: 3 };
    resolveNukeIncident("ignore", true);
    assert("incidentDoveLowers", ST.nuke.esc < 50, "压下警报必须降低升级（50 → " + ST.nuke.esc + "）");
    initNukeState(true);
    ST.player = "SUN";
    ST.nuke.pending = { id: "false_alarm", y: 1987, m: 3 };
    assert("incidentRejectsUnknownOption", (() => {
      const bad = resolveNukeIncident("nope", true);
      return bad.ok === false && bad.reason === "unknown-option" && ST.nuke.pending !== null;
    })(), "未知选项必须被拒绝且不清空待裁决");
    assert("incidentRejectsNoPending", (() => {
      ST.nuke.pending = null;
      return resolveNukeIncident("retaliate", true).reason === "no-pending";
    })(), "没有待裁决时裁决必须被拒绝");
    // 三个选项的结局必须**互不相同**（否则「三选一」是假选择）
    assert("incidentOptionsDiffer", (() => {
      const outs = [];
      for (const opt of nukeIncidentDef("false_alarm").options) {
        initNukeState(true);
        ST.player = "SUN";
        ST.nuke.esc = 50;
        ST.nuke.pending = { id: "false_alarm", y: 1987, m: 3 };
        resolveNukeIncident(opt.id, true);
        outs.push(ST.nuke.esc + "|" + ST.nuke.credBonus);
      }
      return new Set(outs).size === outs.length;
    })(), "同一事故的三个选项必须导致不同的状态（否则选择是假的）");
    // 冷却：两次事故之间至少隔 2 个月
    assert("incidentCooldown", (() => {
      initNukeState(true);
      ST.player = "SUN";
      const s = ST.nuke;
      s.lastIncidentM = 1987 * 12 + 6;
      // 强制 100% 触发：RISK_BASE 与 RISK_CAP 同时抬高（RISK_CAP 会先夹住概率）
      const oldBase = T.PARAMS.RISK_BASE, oldCap = T.PARAMS.RISK_CAP;
      T.PARAMS.RISK_BASE = 1; T.PARAMS.RISK_CAP = 1;
      s.esc = 100;
      updateNukeRisk(1987, 7, true);        // +1 个月 → 冷却内，不应触发
      const immediate = s.pending !== null;
      updateNukeRisk(1987, 9, true);        // +3 个月 → 冷却已过，应触发
      const later = s.pending !== null;
      T.PARAMS.RISK_BASE = oldBase; T.PARAMS.RISK_CAP = oldCap;
      return !immediate && later;
    })(), "两次核危机之间必须有冷却（否则一次升级会把玩家埋了）");

    // ---- 9. 核战争是战略性失败，不是掷骰失败 ----
    initNukeState(true);
    ST.player = "SUN";
    ST.nuke.esc = 95;
    updateNukeRisk(1988, 1, true);
    assert("doomsdayCounts", ST.nuke.doomsday === 1, "DEFCON 1 应开始累计末日计数");
    assert("noDoomsdayYet", !ST.nuke.over, "单月 DEFCON 1 不得判定核战争");
    updateNukeRisk(1988, 2, true);
    updateNukeRisk(1988, 3, true);
    assert("doomsdayAfterPersist", ST.nuke.over === "doomsday",
      "DEFCON 1 连续 " + T.PARAMS.DOOMSDAY_MONTHS + " 个月才判定核战争，实为 " + ST.nuke.over);
    assert("doomsdayResets", (() => {
      initNukeState(true);
      ST.player = "SUN";
      ST.nuke.esc = 95;
      updateNukeRisk(1988, 1, true);
      ST.nuke.esc = 10;                    // 降温
      updateNukeRisk(1988, 2, true);
      return ST.nuke.doomsday === 0;
    })(), "降温后末日计数必须清零（玩家总有救）");
    assert("doomsdayIsTerminal", (() => {
      initNukeState(true);
      ST.player = "SUN";
      ST.nuke.over = "doomsday";
      const before = JSON.stringify(ST.nuke);
      updateNukeRisk(1989, 1, true);
      return JSON.parse(before).over === ST.nuke.over;
    })(), "核战争后状态必须冻结（不再演化）");

    // ---- 10. 升级落回内政 ----
    initNukeState(true);
    ST.player = "SUN";
    ST.mil = 4;
    ST.ai = { enabled: false, decisions: {}, tensions: { "USA:SUN": 0 }, cables: [], treaties: [], unsc: { passed: [], history: [] } };
    const domSun = (typeof polEconDomesticOf === "function") ? polEconDomesticOf("SUN") : null;
    const u0 = (domSun && typeof domSun.unrest === "number") ? domSun.unrest : null;
    ST.nuke.esc = 95;
    updateNukeRisk(1990, 1, true);
    assert("highEscalationRaisesUnrest", u0 !== null && domSun.unrest > u0,
      "高升级应抬高社会动荡（" + u0 + " → " + (domSun && domSun.unrest) + "）");
    initNukeState(true);
    ST.player = "SUN";
    const u1 = domSun.unrest;
    ST.nuke.esc = 10;
    updateNukeRisk(1990, 2, true);
    assert("lowEscalationNoUnrest", domSun.unrest <= u1 + 1e-9,
      "低升级不得额外抬高动荡");

    // ---- 11. 存档往返与清洗 ----
    initNukeState(true);
    ST.nuke.esc = 63.5; ST.nuke.cred = 71.25; ST.nuke.credBonus = -4;
    ST.nuke.pending = { id: "sub_incident", y: 1988, m: 5 };
    ST.nuke.fired = ["false_alarm"];
    const rt = sanitizeNukeState(JSON.parse(JSON.stringify(ST.nuke)));
    assert("roundTripKeepsState",
      near(rt.esc, 63.5, 1e-9) && near(rt.cred, 71.25, 1e-9) &&
      rt.credBonus === -4 && rt.pending && rt.pending.id === "sub_incident" &&
      rt.fired.length === 1,
      "存档往返后状态应完整保留");
    const junk = sanitizeNukeState({ esc: NaN, cred: 999, defcon: "x", doomsday: -5,
      pending: { id: "nope" }, fired: [1, "false_alarm"], log: [1, { zh: "x" }] });
    assert("sanitizeRejectsJunk",
      rt.esc !== undefined && isFinite(junk.esc) && junk.esc === 0 &&
      junk.cred <= T.PARAMS.CRED_MAX && junk.doomsday === 0 &&
      junk.pending === null && junk.fired.length === 1 && junk.log.length === 1,
      "非法存档字段必须被清洗（实得 esc=" + junk.esc + " cred=" + junk.cred +
      " pending=" + JSON.stringify(junk.pending) + "）");
    assert("sanitizeNullSafe", !!sanitizeNukeState(null), "sanitizeNukeState(null) 必须返回缺省状态");
    assert("sanitizeKeepsOver", sanitizeNukeState({ over: "doomsday" }).over === "doomsday",
      "终局标记必须被保留（否则读档能复活）");

    // ---- 12. 面板 ----
    ST.player = "SUN";
    initNukeState(true);
    const p1 = nukePanelHtml();
    assert("panelRenders", p1.indexOf("核风险") >= 0 && p1.indexOf("DEFCON") >= 0,
      "面板应渲染核风险条与 DEFCON");
    ST.nuke.pending = { id: "false_alarm", y: 1988, m: 1 };
    const p2 = nukePanelHtml();
    assert("panelShowsIncidentOptions", /data-nkopt="/.test(p2),
      "有待裁决事故时面板必须给出选项按钮");
    assert("panelShowsAllOptions", (p2.match(/data-nkopt="/g) || []).length ===
      nukeIncidentDef("false_alarm").options.length,
      "事故面板必须给出全部选项（否则玩家看不到完整取舍）");
    assert("panelShowsDoomsday", (() => {
      ST.nuke.over = "doomsday";
      return nukePanelHtml().indexOf("核交换已经发生") >= 0;
    })(), "核战争后面板必须显式说明");

    // ---- 13. 端到端：推进整局，威慑演化但不炸 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1991, 12);
    const snap = nukeSnapshot();
    assert("endToEndSnapshot", !!snap && typeof snap.esc === "number" && typeof snap.defcon === "number",
      "端到端后应能取到快照");
    assert("endToEndBounded", snap.esc >= 0 && snap.esc <= 100 && snap.cred >= 5 && snap.cred <= 95,
      "升级与可信度必须始终在合法区间");
    assert("endToEndNoSpontaneousDoomsday", !snap.over,
      "默认推进（不做极端决策）不应自发进入核战争 —— 核战争必须是玩家造成的");
    assert("endToEndRiskNonNegative", snap.risk >= 0, "月误判概率不得为负");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "nukeprobe";
  d.style.display = "none";
  d.textContent = "NUKEPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
