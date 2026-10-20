"use strict";

// ---- 终局叙事升级：史笔 · 七轴合评 -------------------------------------------
// 问题：七条轴的裁决行在评分页是**并列**的 —— 七段互不相认的 note，
// 各自报各自的数字。但历史不是并列的：经济账单的到期与引信的引爆是同一条
// 时间线，威望的较量与战线的推移是同一场对抗，核阴影与情报的迷雾是同一种
// 不确定性。终局该回答的问题是「历史怎么写的你」，不是「七个仪表盘各是多少」。
//
// 本模块把七轴织成**四幕连贯叙事**：
//   第一幕 · 国运的底盘 —— P1 经济账单 × E 长引信（时间性：到期与引爆）
//   第二幕 · 棋盘上的较量 —— F/F2 威望 × D/D2 战争（对抗性：谁在赢）
//   第三幕 · 悬崖边的舞蹈 —— N1 核风险 × C/C2 情报（不确定性：误判与迷雾）
//   第四幕 · 旗帜与人心 —— S-17 意识形态 + 终局判词（意义：这一切为了什么）
//
// 织法的关键不是排版，是**连接词跟着状态走**：经济兑现而威望失守时是
// 「赢了里子输了面子」，双丰收时是「物质与名望互相成全」，双失时是
// 「屋漏偏逢连夜雨」。句子的因果方向由真实快照的符号决定。
//
// 不变量（与渲染层同一约定）：纯函数读快照、零回写、零 RNG、确定性。
// ---- 幕内小句构造（全部只读快照，缺轴时降级，不抛错）----

// 第一幕：经济账单（P1）× 长引信（E）
function endStoryAct1() {
  const pe = (typeof polEconSnapshot === "function") ? polEconSnapshot() : null;
  const fu = (typeof fuseSnapshot === "function") ? fuseSnapshot() : null;
  const parts = [];

  if (pe && pe.player) {
    // 经济账单：落差是「承诺 vs 兑现」，动荡是「社会的耐心」
    const surprise = pe.surprise, z = pe.z;
    const econClause = (surprise === null || surprise === undefined)
      ? "经济账单尚未到期 —— 十二年里没有积累起足够的统计纵深来评判兑现。"
      : surprise >= 1.0
        ? "经济增长以 " + surprise.toFixed(1) + "pp 跑赢了国民预期（z=" + z.toFixed(1) + "），账单变成了红利，" +
          (pe.goodBills > 0 ? "执政合法性在一次次兑现中被喂养" : "社会的耐心被持续充值")
        : surprise <= -1.0
          ? "增长比国民预期低了 " + (-surprise).toFixed(1) + "pp（z=" + z.toFixed(1) + "），欠下的账一次次到期，" +
            (pe.badBills > 2 ? "累计 " + pe.badBills + " 次坏账单把动荡推到了 " + (pe.unrest === null ? "高位" : pe.unrest.toFixed(0)) : "动荡在缓慢抬头")
          : "增长与国民预期大体持平（z=" + z.toFixed(1) + "），经济账单既没有变成选票也没有变成催命符，" +
            (pe.reserveMonths !== null && pe.reserveMonths < 6 ? "但储备只剩 " + pe.reserveMonths.toFixed(0) + " 个月的缓冲" : "国库维持着体面的缓冲");
    parts.push(econClause + "。");
  } else {
    parts.push("没有执政者的十二年里，经济账单无人签署，历史只记录了世界的增长。");
  }

  if (fu && fu.player) {
    const act = fu.active, logged = fu.logged;
    const fuseClause = act > 0
      ? "长引信仍在燃烧 —— " + act + " 项战略工程的拖累（" + fu.drag.toFixed(2) + "pp/年）将由后来人结账，历史会记住点火者，未必记住买单者"
      : logged > 0
        ? "埋下的引信已经引爆完毕：当下的国势预判是「" + (fu.outcomeNow || "未定") + "」，" +
          (fu.bonusGdp > 0 ? "引信兑现的增长红利（+" + fu.bonusGdp.toFixed(2) + "pp/年）还在账上" : "辉煌或惨败都已落定成账")
        : "没有点过一根引信 —— 稳是稳了，但十二年没有埋下任何一件跨任期的事业";
    parts.push(fuseClause + "。");
  }

  return { title: "第一幕 · 国运的底盘", body: parts.join("") };
}

// 第二幕：威望竞赛（F/F2）× 地面战争（D/D2）
function endStoryAct2() {
  const pr = (typeof prestigeSnapshot === "function") ? prestigeSnapshot() : null;
  const gw = (typeof groundWarSnapshot === "function") ? groundWarSnapshot() : null;
  const parts = [];

  if (pr && pr.player) {
    const gap = pr.gap;
    const prestigeClause = gap === null
      ? "威望的账本上没有对手，也就没有竞赛"
      : gap >= 8
        ? "威望以 " + gap.toFixed(1) + " 分的优势压过" + pr.rival + " —— " +
          (pr.drifted > 0 ? pr.drifted + " 个国家因此倒向我国阵营，「谁代表未来」有了答案" : "榜单上的领先尚未变成版图上的投靠")
        : gap <= -8
          ? "威望落后" + pr.rival + " " + (-gap).toFixed(1) + " 分 —— " +
            (pr.rivalActive && pr.rivalActive.length ? "对手的工程（" + pr.rivalActive.join("、") + "）正在全世界面前表演" : "落后本身就是一种叙事，第三世界看得见")
          : "威望与" + pr.rival + "缠斗成 " + gap.toFixed(1) + " 分的均势，竞赛没有终局，只有下一次表演";
    parts.push(prestigeClause + "。");
    if (pr.rivalActive && pr.rivalActive.length) {
      parts.push("终局时刻，" + pr.rival + "仍在跑 " + pr.rivalActive.length + " 项威望工程 —— 竞赛在 1991 年的风雪里没有结束。");
    }
  }

  if (gw && gw.wars) {
    const wars = Object.keys(gw.wars).map((id) => gw.wars[id]).filter(Boolean);
    const decided = wars.filter((w) => w.outcome);
    const warClause = decided.length === 0
      ? "三场局部战争的战线维持着史实的形状 —— 没有偏离，也就没有额外的代价与荣耀"
      : "战争的账目上，" + decided.map((w) => w.zh + "（" + (w.control >= 0 ? "A 侧" : "B 侧") +
          " 偏离 " + w.control.toFixed(0) + " 点）").join("、") +
        " —— 每一点偏离都折算成了消耗（A " + wars.reduce((s, w) => s + w.attrDevA, 0).toFixed(1) +
        " / B " + wars.reduce((s, w) => s + w.attrDevB, 0).toFixed(1) + "）";
    parts.push(warClause + "。");
  }

  if (!parts.length) parts.push("棋盘上没有落子，也就没有输赢。");
  return { title: "第二幕 · 棋盘上的较量", body: parts.join("") };
}

// 第三幕：核风险（N1）× 情报与欺敌（C/C2）
function endStoryAct3() {
  const nk = (typeof nukeSnapshot === "function") ? nukeSnapshot() : null;
  const de = (typeof deceptionSnapshot === "function") ? deceptionSnapshot() : null;
  const parts = [];

  if (nk) {
    const nukeClause = nk.over === "doomsday"
      ? "核交换已经发生 —— 此后的一切统计都只是废墟上的注脚"
      : nk.defcon <= 2
        ? "DEFCON " + nk.defcon + "（" + nk.defconZh + "）的红灯亮到了最后，升级指数 " + nk.esc.toFixed(0) +
          "，威慑可信度 " + nk.cred.toFixed(0) + " —— 悬崖边上的十二年，靠的不全是运气"
        : nk.defcon === 3
          ? "对峙在 DEFCON 3 的高位徘徊（升级 " + nk.esc.toFixed(0) + " / 可信度 " + nk.cred.toFixed(0) +
            "），" + (nk.fired > 0 ? "处置过的 " + nk.fired + " 次核危机每一次都是豪赌" : "没有一次危机走到不可收拾")
          : "核阴影被维持在 DEFCON " + nk.defcon + "（" + nk.defconZh + "）的低位，" +
            (nk.fired > 0 ? nk.fired + " 次危机被化解于无形" : "十二年没有一次核危机走到台前");
    parts.push(nukeClause + "。");
  }

  if (de && de.player) {
    const own = (de.own || []).length;
    const intelClause = (own > 0 || de.exposed > 0 || de.detected > 0)
      ? "情报战同样没有缺席：我方布置过 " + own + " 项欺敌" +
        (de.exposed > 0 ? "，其中 " + de.exposed + " 次曝光让威望与感召力陪葬" : "") +
        (de.detected > 0 ? "，反情报照妖镜识破 " + de.detected + " 次外敌伪造" : "") +
        " —— 雾不总是诚实的，能看穿多少取决于愿意花多少"
      : "情报的雾始终没有被人主动搅浑 —— 读数里有误差，但没有谎言";
    parts.push(intelClause + "。");
  } else if (de) {
    parts.push("旁观者看见的迷雾里没有人撒谎 —— 但那只是因为没有人需要撒谎。");
  }

  if (!parts.length) parts.push("悬崖边上什么也没有发生 —— 这本身就是最好的消息。");
  return { title: "第三幕 · 悬崖边的舞蹈", body: parts.join("") };
}

// 第四幕：意识形态（S-17）+ 终局判词（四幕合评）
function endStoryAct4(st) {
  const ideo = (typeof ideologySnapshot === "function") ? ideologySnapshot() : null;
  const parts = [];

  if (ideo && ideo.player) {
    const gap = ideo.gap;
    const ideoClause = gap === null
      ? "感召力的赛场上没有对手"
      : gap >= 15
        ? "感召力（" + ideo.appeal.toFixed(0) + " vs " + ideo.rival + " " + ideo.rivalAppeal.toFixed(0) +
          "）赢得压倒性认同 —— 主张的胜利比领土更持久"
        : gap <= -15
          ? "感召力（" + ideo.appeal.toFixed(0) + " vs " + ideo.rival + " " + ideo.rivalAppeal.toFixed(0) +
            "）输掉了人心之争 —— 没人信的故事讲得再响也只是广播"
          : "感召力与" + ideo.rival + "犬牙交错（" + ideo.appeal.toFixed(0) + " vs " + ideo.rivalAppeal.toFixed(0) +
            "），意识形态的阵地战没有决定性会战";
    parts.push(ideoClause + "。");
    if (ideo.active && ideo.active.length) {
      parts.push("直到终局，仍有 " + ideo.active.length + " 项主张输出在运行 —— 信念的工程从不竣工。");
    }
  }

  // 判词：把四幕的符号合成一句「历史怎么写的你」
  const p = st && st.player;
  if (p) {
    const pr = p.prestige, nk = p.nuke;
    const wonPrestige = pr && pr.gap !== null && pr.gap >= 8;
    const lostPrestige = pr && pr.gap !== null && pr.gap <= -8;
    const doomsday = nk && nk.over === "doomsday";
    const strong = p.total >= 70, weak = p.total < 55;
    const verdict = doomsday
      ? "历史最终这样写你：核火之后，胜负已无意义。"
      : (wonPrestige && strong) ? "历史最终这样写你：里子面子尽收 —— 物质的崛起与名望的登顶互相成全，这是大战略最好的一种结局。"
      : (wonPrestige && weak) ? "历史最终这样写你：赢了面子输了里子 —— 舞台上的领先没能兑换成餐桌上的富足，威望终究要由国力找零。"
      : (lostPrestige && strong) ? "历史最终这样写你：赢了里子输了面子 —— 国力的位次在上升，故事却在别人嘴里，沉默的崛起也是崛起。"
      : (lostPrestige && weak) ? "历史最终这样写你：屋漏偏逢连夜雨 —— 经济与名望同时失守的十二年，是任何执政者最深的教案。"
      : strong ? "历史最终这样写你：务实的十二年 —— 没有压倒性的名望，却有实实在在的国运，史书偏爱赢家，更偏爱活得久的赢家。"
      : weak ? "历史最终这样写你：艰难维持的十二年 —— 没有崩盘，但每一次账单到期都是一次抽签。"
      : "历史最终这样写你：平实的守成者 —— 十二年没有奇迹，也没有灾难，而冷战年代，活着本身就是成绩。";
    parts.push(verdict);
  } else {
    parts.push("历史最终这样写：世界走完了 1980 到 1991，没有执政者的十二年，是一部没有主角的编年史。");
  }

  return { title: "第四幕 · 旗帜与人心", body: parts.join("") };
}

// ---- 主入口：四幕史笔 -------------------------------------------------------
// 纯函数：只读快照与 st（endStats 的产物），零回写、零 RNG、确定性。
function endStoryOf(st) {
  const acts = [endStoryAct1(), endStoryAct2(), endStoryAct3(), endStoryAct4(st || (typeof endStats === "function" ? endStats() : null))];
  const subtitle = (st && st.player)
    ? st.player.zh + " · 1980–1991 · 七轴合评"
    : "世界 · 1980–1991 · 七轴合评";
  return { title: "📜 史笔 · 历史怎么写的你", subtitle: subtitle, acts: acts };
}

// 渲染：并入评分页（renderEnd 调用）与后日谈长卷（generateEpilogue 调用）
function endStoryHtml(st) {
  const story = endStoryOf(st);
  let h = '<div class="endstory"><div class="endstory-title">' + story.title +
    '<span class="endstory-sub">' + story.subtitle + "</span></div>";
  for (const act of story.acts) {
    h += '<div class="endstory-act"><div class="endstory-act-title">' + act.title + "</div>" +
      '<div class="endstory-act-body">' + act.body + "</div></div>";
  }
  h += "</div>";
  return h;
}

// 后日谈卷（插进 generateEpilogue 的 sections —— 卷数是下界断言，加卷安全）
function epilogueEndStorySection(st) {
  const story = endStoryOf(st);
  return {
    sec: "史笔 · 七轴合评",
    body: story.acts.map((a) => a.body).join(""),
    quote: "七条轴的数字各自为政，历史只写一篇 —— 而这一篇，是它们合写的。"
  };
}
