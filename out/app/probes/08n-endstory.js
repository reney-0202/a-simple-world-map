"use strict";

// ---- 终局叙事升级：史笔 · 七轴合评探针 --------------------------------------
// 七条轴的裁决行是并列的仪表盘，史笔把它们织成一篇连贯的「历史怎么写的你」。
// 要证明五件事：
//   1. 四幕结构完整 —— 七条轴每条都有落点（底盘/较量/舞蹈/人心）；
//   2. 判词跟着状态走 —— 双丰收/双失/赢面子输里子/赢里子输面子逐条验证；
//   3. 缺轴降级不抛错 —— 旁观与缺快照都能出完整叙事；
//   4. 织法是真的织 —— 幕间卷进了各轴的真实数字（不是模板套话）；
//   5. 渲染层不变量 —— 纯函数、零回写、零 RNG、确定性，epilogue 加卷安全。
function runEndStoryProbe() {
  const r = { pass: true, errors: [], details: {} };
  const assert = (name, cond, msg) => {
    r.details[name] = cond ? "PASS" : "FAIL: " + (msg || "");
    if (!cond) {
      r.pass = false;
      r.errors.push(name + ": " + (msg || "failed"));
      console.error("ENDSTORYPROBE FAIL [" + name + "]: " + msg);
    }
  };

  try {
    assert("apiPresent",
      typeof endStoryOf === "function" && typeof endStoryHtml === "function" &&
      typeof epilogueEndStorySection === "function" &&
      typeof endStoryAct1 === "function" && typeof endStoryAct4 === "function",
      "史笔 API 缺失");

    // ---- 1. 四幕结构完整 ----
    const savedPlayer = ST.player;
    ST.player = "SUN"; ST.mil = 4;
    const story = endStoryOf(endStats());
    assert("fourActs", story.acts.length === 4, "史笔必须是四幕，实为 " + story.acts.length);
    assert("actTitles",
      story.acts[0].title.indexOf("国运的底盘") >= 0 &&
      story.acts[1].title.indexOf("棋盘上的较量") >= 0 &&
      story.acts[2].title.indexOf("悬崖边的舞蹈") >= 0 &&
      story.acts[3].title.indexOf("旗帜与人心") >= 0,
      "四幕标题必须齐全");
    assert("actsHaveBody", story.acts.every((a) => a.body && a.body.length > 20),
      "每幕都必须有正文（空幕 = 轴没接上）");
    assert("titleSaysHistory", story.title.indexOf("历史怎么写") >= 0,
      "史笔标题必须回答「历史怎么写的你」");

    // ---- 2. 判词跟着状态走（四向逐条）----
    // 制造判词分支需要真实 st.player —— 直接构造最小 st 输入第四幕
    const mkSt = (total, gap, over) => ({
      player: {
        total: total,
        prestige: gap === null ? null : { gap: gap, rival: "USA", rivalScore: 50, score: 50 + (gap || 0) },
        nuke: { over: over || null }
      }
    });
    const verdictOf = (st) => endStoryAct4(st).body;
    assert("verdictWinWin", verdictOf(mkSt(75, 12)).indexOf("里子面子尽收") >= 0,
      "双丰收判词缺失");
    assert("verdictWinFaceLoseSubstance", verdictOf(mkSt(50, 12)).indexOf("赢了面子输了里子") >= 0,
      "赢面子输里子判词缺失");
    assert("verdictWinSubstanceLoseFace", verdictOf(mkSt(75, -12)).indexOf("赢了里子输了面子") >= 0,
      "赢里子输面子判词缺失");
    assert("verdictLoseLose", verdictOf(mkSt(50, -12)).indexOf("屋漏偏逢连夜雨") >= 0,
      "双失败词缺失");
    assert("verdictDoomsday", verdictOf(mkSt(75, 12, "doomsday")).indexOf("核火之后") >= 0,
      "核终局必须凌驾一切判词");
    assert("verdictNeutral", verdictOf(mkSt(62, 2)).indexOf("历史最终这样写你") >= 0,
      "均势也必须有判词");

    // ---- 3. 缺轴降级不抛错 ----
    ST.player = null;
    const specStory = endStoryOf(endStats());
    assert("spectatorStoryComplete", specStory.acts.length === 4 &&
      specStory.acts.every((a) => a.body.length > 20),
      "旁观模式也必须出完整四幕（降级句，不是空幕）");
    assert("spectatorVerdict", specStory.acts[3].body.indexOf("没有主角的编年史") >= 0,
      "旁观判词缺失");
    assert("degradesWithoutSnapshots", (() => {
      // 打桩：全部快照函数消失 → 史笔仍完整
      const names = ["polEconSnapshot", "fuseSnapshot", "prestigeSnapshot", "groundWarSnapshot",
        "nukeSnapshot", "deceptionSnapshot", "ideologySnapshot"];
      const saved = {};
      for (const n of names) { saved[n] = window[n]; window[n] = undefined; }
      let ok = true;
      try {
        const s = endStoryOf(null);
        ok = s.acts.length === 4 && s.acts.every((a) => a.body.length > 10);
      } catch (e) { ok = false; }
      for (const n of names) window[n] = saved[n];
      return ok;
    })(), "快照全部缺失时史笔必须降级而非崩溃");

    // ---- 4. 织法是真的织：幕文卷进真实数字 ----
    ST.player = "SUN"; ST.mil = 8; initPrestigeState(true); initNukeState(true);
    ST.prestige.scores.SUN = 70; ST.prestige.scores.USA = 50;
    const s2 = endStoryOf(endStats());
    assert("weavesPrestigeNumber", s2.acts[1].body.indexOf("20.0") >= 0,
      "威望幕必须把真实落差织进正文（期望 20.0，实为：" + s2.acts[1].body.slice(0, 120) + "）");
    assert("weavesEconNumbers", (() => {
      const s3 = endStoryOf(endStats());
      return s3.acts[0].body.length > 40;
    })(), "经济幕必须有正文");
    assert("nukeActMentionsDefcon", s2.acts[2].body.indexOf("DEFCON") >= 0 || s2.acts[2].body.indexOf("核") >= 0,
      "核幕必须提及核状态");
    assert("ideologyActPresent", s2.acts[3].body.indexOf("感召力") >= 0 || s2.acts[3].body.indexOf("历史最终") >= 0,
      "第四幕必须含意识形态或判词");

    // ---- 5. 渲染层不变量 ----
    const rng0 = SIM.S ? SIM.S.rngState : null;
    const pm0 = SIM.S ? JSON.stringify(SIM.S.P.pmods) : null;
    const dom0 = ST.domestic ? JSON.stringify(ST.domestic) : null;
    const sA = JSON.stringify(endStoryOf(endStats()));
    const sB = JSON.stringify(endStoryOf(endStats()));
    assert("deterministic", sA === sB, "同状态同叙事（史笔必须确定）");
    assert("consumesNoRng", SIM.S ? SIM.S.rngState === rng0 : true, "史笔不得消费引擎 RNG");
    assert("zeroWrites", (SIM.S ? JSON.stringify(SIM.S.P.pmods) === pm0 : true) &&
      (ST.domestic ? JSON.stringify(ST.domestic) === dom0 : true),
      "史笔是纯读：不得回写 pmods 或内政");
    const html = endStoryHtml(endStats());
    assert("htmlRendersActs", (html.match(/endstory-act-title/g) || []).length === 4,
      "HTML 必须渲染四幕");
    const sec = epilogueEndStorySection(endStats());
    assert("epilogueSectionShape", sec.sec === "史笔 · 七轴合评" && sec.body.length > 100 && !!sec.quote,
      "后日谈卷形状非法");

    // ---- 6. 集成：epilogue 加卷安全（卷数是下界断言）----
    const ep = generateEpilogue(endStats());
    assert("epilogueHasEndStory", ep.sections.some((x) => x.sec === "史笔 · 七轴合评"),
      "后日谈长卷必须含史笔压轴卷");
    assert("epilogueSectionsGrewOrEqual5", ep.sections.length >= 5,
      "玩家后日谈卷数不得少于 5（既有下界）");

    // ---- 7. 端到端：真实推进后史笔仍健全 ----
    simReset();
    ST.player = "SUN"; ST.mil = 4; applyPlayerDecisions();
    simFastForward(1986, 1);
    const s4 = endStoryOf(endStats());
    assert("endToEndSane", s4.acts.length === 4 && s4.acts.every((a) => a.body.length > 20),
      "端到端后史笔仍必须完整四幕");
    assert("endToEndHtmlRenders", endStoryHtml(endStats()).indexOf("史笔") >= 0,
      "端到端后 HTML 仍渲染");

    ST.player = savedPlayer;
  } catch (e) {
    r.pass = false;
    r.exception = String(e && e.stack || e);
    r.errors.push("exception: " + r.exception);
  }

  const d = document.createElement("div");
  d.id = "endstoryprobe";
  d.style.display = "none";
  d.textContent = "ENDSTORYPROBE " + JSON.stringify(r);
  document.body.appendChild(d);
}
