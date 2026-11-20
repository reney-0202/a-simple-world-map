"use strict";

// ---- Phase End2：史笔织入新轴全链路探针 --------------------------------------
// 要证明：
//   1. End2 小句 API 齐全；缺轴降级不抛错；
//   2. 四幕仍完整，既有 endstory 判词不塌缩；
//   3. Cov2 / Dip2 / N2 / Afg2 / Mid 快照字段真的织进正文（带数字）；
//   4. 纯函数：零 RNG、零回写、确定性；
//   5. 端到端后史笔仍健全。
function runEnd2Probe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ENDTWOPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    assert("apiPresent",
      typeof endStoryOf === "function" && typeof endStoryAct2 === "function" &&
      typeof endStoryAct3 === "function" && typeof endStoryAfg2Clause === "function" &&
      typeof endStoryMidClause === "function" && typeof endStoryN2Clause === "function" &&
      typeof endStoryCov2Clause === "function" && typeof endStoryDip2Clause === "function",
      "End2 史笔 API 缺失");

    // ---- 1. 缺轴降级不抛错 ----
    assert("degradesWithoutNewAxes", (() => {
      const names = ["afghanAiSnapshot", "nukeAiSnapshot", "covertAiSnapshot",
        "dipAiSnapshot"];
      const saved = {};
      for (let i = 0; i < names.length; i++) {
        saved[names[i]] = window[names[i]];
        window[names[i]] = undefined;
      }
      const savedAgendas = ST.agendas;
      ST.agendas = null;
      let ok = true;
      try {
        const s = endStoryOf(typeof endStats === "function" ? endStats() : null);
        ok = s.acts.length === 4 && s.acts.every((a) => a.body && a.body.length > 10);
        ok = ok && endStoryAfg2Clause() === null && endStoryN2Clause() === null &&
          endStoryCov2Clause() === null && endStoryDip2Clause() === null &&
          endStoryMidClause() === null;
      } catch (e) { ok = false; }
      for (let i = 0; i < names.length; i++) window[names[i]] = saved[names[i]];
      ST.agendas = savedAgendas;
      return ok;
    })(), "新轴快照全部缺失时史笔必须降级而非崩溃");

    // ---- 2. 既有四幕 + 判词不塌缩 ----
    const savedPlayer = ST.player;
    ST.player = "SUN"; ST.mil = 4;
    const base = endStoryOf(endStats());
    assert("fourActsIntact", base.acts.length === 4, "End2 不得拆四幕结构");
    assert("actTitlesIntact",
      base.acts[0].title.indexOf("国运的底盘") >= 0 &&
      base.acts[1].title.indexOf("棋盘上的较量") >= 0 &&
      base.acts[2].title.indexOf("悬崖边的舞蹈") >= 0 &&
      base.acts[3].title.indexOf("旗帜与人心") >= 0,
      "四幕标题必须保持");
    const mkSt = (total, gap, over) => ({
      player: {
        total: total,
        prestige: gap === null ? null : { gap: gap, rival: "USA", rivalScore: 50, score: 50 + (gap || 0) },
        nuke: { over: over || null }
      }
    });
    assert("verdictWinWinIntact", endStoryAct4(mkSt(75, 12)).body.indexOf("里子面子尽收") >= 0,
      "既有双丰收判词不得塌缩");
    assert("verdictDoomsdayIntact", endStoryAct4(mkSt(75, 12, "doomsday")).body.indexOf("核火之后") >= 0,
      "既有核终局判词不得塌缩");

    // ---- 3. 织法：把新轴真实数字织进正文 ----
    simReset();
    ST.player = "SUN"; ST.mil = 6;
    applyPlayerDecisions();
    if (typeof initCovertAiState === "function") initCovertAiState(true);
    if (typeof initDipAiState === "function") initDipAiState(true);
    if (typeof initNukeAiState === "function") initNukeAiState(true);
    if (typeof initAfghanAiState === "function") initAfghanAiState(true);
    if (typeof initAfghanState === "function") initAfghanState();
    if (typeof initNukeState === "function") initNukeState(true);
    if (typeof initPrestigeState === "function") initPrestigeState(true);
    if (typeof initDomesticState === "function") initDomesticState();
    if (!ST.ai) ST.ai = { enabled: true, decisions: {}, tensions: {}, cables: [], treaties: [], unsc: { passed: [], history: [] } };

    // 手工灌入各轴日志，确保小句有数字可织（不依赖月度 AI 门控）
    ST.covertAi.log.push({ kind: "hit", ym: "1984-03", by: "USA" });
    ST.covertAi.log.push({ kind: "hit", ym: "1985-07", by: "USA" });
    ST.covertAi.log.push({ kind: "standDown", ym: "1986-01", by: "USA" });
    ST.dipAi.log.push({ kind: "propose", ym: "1985-11", by: "USA" });
    ST.dipAi.log.push({ kind: "press", ym: "1986-06", by: "USA" });
    ST.dipAi.log.push({ kind: "reject", ym: "1987-02", by: "USA" });
    ST.nukeAi.log.push({ kind: "cool", ym: "1983-11", by: "USA" });
    ST.nukeAi.log.push({ kind: "warn", ym: "1984-05", by: "USA" });
    ST.nukeAi.log.push({ kind: "reject", ym: "1985-09", by: "USA" });
    ST.afghanAi.log.push({ kind: "stinger_early", ym: "1985-03", by: "USA" });
    ST.afghanAi.log.push({ kind: "arm_resistance", ym: "1985-08", by: "USA" });
    ST.afghanAi.log.push({ kind: "surge", ym: "1986-02", by: "SUN" });
    if (ST.afghan) { ST.afghan.bleedDev = 1.25; ST.afghan.contested = true; }
    // 强制 contested 读数：afghanContested 可能看别的字段；小句也读 snap.contested
    // 若 afghanAiSnapshot 的 contested 来自函数，灌 log 仍应产出 moves 子句

    if (!ST.agendas) ST.agendas = {};
    ST.agendas.IND = { active: null, progress: 0, completed: ["ind_step_a", "ind_step_b"], bonuses: {} };
    ST.agendas.TUR = { active: null, progress: 0, completed: ["tur_step_a"], bonuses: {} };

    const afgClause = endStoryAfg2Clause();
    assert("afg2ClausePresent", !!(afgClause && afgClause.length > 20),
      "Afg2 小句应产出（有还手或偏离）");
    assert("afg2WeavesNumber", !!(afgClause && (/\d/.test(afgClause))),
      "Afg2 小句必须织进数字");

    const midClause = endStoryMidClause();
    assert("midClausePresent", !!(midClause && midClause.indexOf("2 个战略节点") >= 0),
      "Mid 小句应读到 IND+TUR 完成步");
    assert("midWeavesSteps", !!(midClause && midClause.indexOf("3 步") >= 0),
      "Mid 小句应织入完成步数 3");

    const n2Clause = endStoryN2Clause();
    assert("n2ClausePresent", !!(n2Clause && n2Clause.indexOf("降温") >= 0),
      "N2 小句应提及降温");
    assert("n2WeavesCounts", !!(n2Clause && n2Clause.indexOf("1 次") >= 0),
      "N2 小句应织入次数");

    const cov2Clause = endStoryCov2Clause();
    assert("cov2ClausePresent", !!(cov2Clause && cov2Clause.indexOf("还了") >= 0),
      "Cov2 小句应提及还手");
    assert("cov2WeavesHits", !!(cov2Clause && cov2Clause.indexOf("2") >= 0),
      "Cov2 小句应织入 hit 次数");

    const dip2Clause = endStoryDip2Clause();
    assert("dip2ClausePresent", !!(dip2Clause && dip2Clause.indexOf("峰会") >= 0),
      "Dip2 小句应提及峰会");
    assert("dip2WeavesReject", !!(dip2Clause && dip2Clause.indexOf("拒绝空谈") >= 0),
      "Dip2 小句应织入拒签");

    const story = endStoryOf(endStats());
    assert("act2WeavesAfgOrMid",
      story.acts[1].body.indexOf("阿富汗") >= 0 || story.acts[1].body.indexOf("次极") >= 0,
      "第二幕必须织入 Afg2 或 Mid");
    assert("act3WeavesNewAxes",
      (story.acts[2].body.indexOf("风险管理") >= 0 || story.acts[2].body.indexOf("降温") >= 0) &&
      (story.acts[2].body.indexOf("谍战") >= 0 || story.acts[2].body.indexOf("还了") >= 0) &&
      (story.acts[2].body.indexOf("峰会") >= 0 || story.acts[2].body.indexOf("外交") >= 0),
      "第三幕必须同时织入 N2 / Cov2 / Dip2 痕迹");

    // ---- 4. 渲染层不变量 ----
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const cov0 = ST.covertAi ? JSON.stringify(ST.covertAi) : null;
    const dip0 = ST.dipAi ? JSON.stringify(ST.dipAi) : null;
    const nk0 = ST.nukeAi ? JSON.stringify(ST.nukeAi) : null;
    const afg0 = ST.afghanAi ? JSON.stringify(ST.afghanAi) : null;
    const sA = JSON.stringify(endStoryOf(endStats()));
    const sB = JSON.stringify(endStoryOf(endStats()));
    assert("deterministic", sA === sB, "同状态同叙事");
    assert("consumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "End2 不得消费引擎 RNG");
    assert("zeroWrites",
      (SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true) &&
      (ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true) &&
      (ST.covertAi ? JSON.stringify(ST.covertAi) === cov0 : true) &&
      (ST.dipAi ? JSON.stringify(ST.dipAi) === dip0 : true) &&
      (ST.nukeAi ? JSON.stringify(ST.nukeAi) === nk0 : true) &&
      (ST.afghanAi ? JSON.stringify(ST.afghanAi) === afg0 : true),
      "End2 是纯读：不得回写 pmods / 内政 / 各 AI 槽");

    // ---- 5. 端到端 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const s4 = endStoryOf(endStats());
    assert("endToEndSane", s4.acts.length === 4 && s4.acts.every((a) => a.body.length > 20),
      "端到端后史笔仍必须完整四幕");
    assert("endToEndHtmlRenders", endStoryHtml(endStats()).indexOf("史笔") >= 0,
      "端到端后 HTML 仍渲染");

    // 旁观完整
    ST.player = null;
    const spec = endStoryOf(endStats());
    assert("spectatorComplete", spec.acts.length === 4 &&
      spec.acts.every((a) => a.body.length > 20),
      "旁观模式仍须完整四幕");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "end2probe";
  d.style.display = "none";
  d.textContent = "ENDTWOPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
