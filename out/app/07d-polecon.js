"use strict";

// ---- Phase P1：账单到期（经济 → 政治闭环）------------------------------------
// 这是全游戏第一条真正**双向**的边。在此之前：
//   政策 → P.pmods → 引擎增速 → 记分牌/走势图 → 结束。
// 经济崩了没有政治后果，经济好了换不到任何东西 —— 所以「增长」从来不是决策，
// 只是背景噪声。本模块把出口接上：经济增长会以「与国民预期的落差」的形式
// 回到内政天平上，而内政天平经 03-decisions.js 的 unrest 拖累再回到经济。
// 于是有了一个真正的回路，也有了真正的时间压力。
//
// 三条设计约束（本模块刻意遵守）：
//   1. 不消费 RNG —— 逐位确定性契约不受影响。
//   2. 不写 P.pmods / gdp —— 它只写**既有内政字段**，因此存档无需升版，
//      旧档按缺省值补齐即可（与 L 的 politicalCapital 同一套路）。
//   3. 无执政者即无政治 —— ST.player 为空（旁观/史实探针）时立刻返回，
//      所以 simprobe / selftest / endprobe 的轨迹一字不变。

// 期望锚是**适应性**的：它每月朝实际增速挪一小步。这一点很关键 ——
// 如果锚固定，任何一次性刺激都能永久换来政治红利（刷红利漏洞）。
// 适应性预期让一次跃升只买到约一年的红利，之后选民把它当成新常态。
// 反过来说，崩盘之所以致命，正是因为人们还记着崩盘前的水平。
function polEconTable() {
  return (typeof window !== "undefined" && window.W1980_POLECON) || null;
}

function initPolEcon(force) {
  if (force || !ST.polEcon || typeof ST.polEcon !== "object") {
    ST.polEcon = polEconBlank();
  }
  const p = ST.polEcon;
  if (!p.anchor || typeof p.anchor !== "object") p.anchor = {};
  if (!Array.isArray(p.events)) p.events = [];
  if (!Array.isArray(p.alerts)) p.alerts = [];
  if (typeof p.bad !== "number" || !isFinite(p.bad)) p.bad = 0;
  if (typeof p.good !== "number" || !isFinite(p.good)) p.good = 0;
  return p;
}

// 纯函数：只吃 d、只吐新状态，**不动 ST.polEcon**
// （与 sanitizeDomesticState / sanitizePoliticalCapital 同一约定 —— 清洗与写入分开，
//  否则探针里的「往返清洗」会顺手清空被断言的对象，断言就永远空转为绿。）
function polEconBlank() {
  return {
    anchor: {}, bad: 0, good: 0, lastActual: null, lastExpect: null,
    lastSurprise: null, lastZ: null, reserveMonths: null, lastBill: null,
    events: [], alerts: []
  };
}

function sanitizePolEcon(d) {
  const p = polEconBlank();
  if (!d || typeof d !== "object") return p;
  if (d.anchor && typeof d.anchor === "object") {
    for (const k in d.anchor) {
      const v = d.anchor[k];
      if (typeof v === "number" && isFinite(v)) p.anchor[k] = clamp(v, -30, 30);
    }
  }
  const num = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v)) ? clamp(v, lo, hi) : dflt;
  p.bad = Math.round(num(d.bad, 0, 600, 0));
  p.good = Math.round(num(d.good, 0, 600, 0));
  p.lastActual = num(d.lastActual, -100, 100, null);
  p.lastExpect = num(d.lastExpect, -100, 100, null);
  p.lastSurprise = num(d.lastSurprise, -200, 200, null);
  p.lastZ = num(d.lastZ, -100, 100, null);
  p.reserveMonths = num(d.reserveMonths, 0, 100000, null);
  p.lastBill = typeof d.lastBill === "string" ? d.lastBill : null;
  if (Array.isArray(d.events)) {
    p.events = d.events.slice(-40).filter((e) => e && typeof e === "object" && typeof e.kind === "string");
  }
  if (Array.isArray(d.alerts)) {
    p.alerts = d.alerts.slice(-40).filter((n) => typeof n === "number" && isFinite(n));
  }
  return p;
}

// 国别期望锚：ANCHOR[国] = [史实均值, 史实标准差]。
// 返回 { mean: 当期锚, hist: 史实均值, sd: 史实标准差 } —— hist 用于回拉，
// mean 用于判账。两者分开是刻意的：判账看「现在的国民预期」，
// 回拉看「这个国家历史上正常长什么样」。
function polEconAnchor(cKey, table) {
  const T = table || polEconTable();
  const row = (T.ANCHOR && T.ANCHOR[cKey]) || T.ANCHOR.DEFAULT;
  const p = initPolEcon();
  if (typeof p.anchor[cKey] !== "number" || !isFinite(p.anchor[cKey])) p.anchor[cKey] = row[0];
  return { mean: p.anchor[cKey], hist: row[0], sd: Math.max(0.2, row[1]) };
}

// 储备月数：净流出为正时 = USD 储备 / 月均净流出；净流入或没有航线 → 无压力（null）
// 这是「外汇」第一次真正约束政治：储备见底不再只是一个变红的数字。
//
// 重要性门槛（RESERVE_GDP_SHARE）是这里的关键：只看「储备 ÷ 月流出」会让任何
// 长期小额逆差的国家在储备归零后永久处于危机态（苏联的硬通货缺口相对其 GDP
// 微不足道，却会被读成濒临违约）。所以要求年净流出达到 GDP 的某个比例。
function polEconReserveMonths(cKey) {
  const T = polEconTable();
  if (!T || typeof getTradeFlows !== "function") return null;
  const flows = getTradeFlows(cKey);
  if (!flows) return null;
  const monthly = flows.netUsd / 12;              // 亿/月
  if (!(monthly < 0)) return null;                // 没有净流出 → 无压力
  const annualBn = -monthly * 12 * 0.1;           // 亿 → 十亿美元
  const gdp = simVal(cKey).gdp_bn;
  if (!(gdp > 0)) return null;
  if (annualBn < T.RESERVE_GDP_SHARE * gdp) return null;   // 相对 GDP 不构成压力
  const res = (ST.reserves && ST.reserves[cKey]) || null;
  if (!res || typeof res.usd !== "number") return null;
  return Math.max(0, res.usd / -monthly);
}

// 把社会动荡朝某个目标拉一格。目标式（而非累加式）让张力有均衡点：
// 持续困境支撑起某个动荡水平，压力消失后回落，任何单一渠道都不会把动荡推满。
function polEconPullUnrest(dom, target, table) {
  if (!dom || typeof dom.unrest !== "number") return;
  const T = table || polEconTable();
  const cur = dom.unrest;
  const up = target > cur;
  const rate = up ? T.UNREST_PULL_UP : T.UNREST_PULL_DOWN;
  dom.unrest = clamp(cur + (target - cur) * rate, 0, 100);
}

function polEconSinkOf(cKey, table) {
  const T = table || polEconTable();
  return (T.BLAME && T.BLAME[cKey]) || T.BLAME.DEFAULT;
}

// 玩家国内政对象的唯一取法：七大国各有专属对象，其余实体走通用缓存。
// 注意必须回落到 getGeneralDomestic —— 否则 47 个通用国家拿不到对象，
// 账单会静默写不进去（这正是「面板写着但代码没接」的经典死法）。
function polEconDomesticOf(cKey) {
  if (!cKey) return null;
  const d = domesticStateOf(cKey);
  if (d) return d;
  return (typeof getGeneralDomestic === "function") ? getGeneralDomestic(cKey) : null;
}

// 把压力写进既有内政字段。返回被写到的字段名（供探针断言「账单真的到了」）。
function polEconApplyBlame(cKey, table, downAmt, upAmt, unrestAmt) {
  const dom = polEconDomesticOf(cKey);
  if (!dom) return [];
  const sink = polEconSinkOf(cKey, table);
  const touched = [];
  for (const f of sink.down) {
    if (typeof dom[f] !== "number") continue;
    dom[f] = clamp(dom[f] - downAmt, 0, 100);
    touched.push(f);
  }
  for (const f of sink.up) {
    if (typeof dom[f] !== "number") continue;
    dom[f] = clamp(dom[f] + upAmt, 0, 100);
    touched.push(f);
  }
  if (typeof dom.unrest === "number" && unrestAmt) {
    dom.unrest = clamp(dom.unrest + unrestAmt, 0, 100);
    touched.push("unrest");
  }
  return touched;
}

function polEconRecord(kind, y, m, extra) {
  const p = initPolEcon();
  const e = { kind: kind, y: y, m: m };
  if (extra) for (const k in extra) e[k] = extra[k];
  p.events.push(e);
  if (p.events.length > 40) p.events.shift();
  p.lastBill = kind;
  return e;
}

// 月度推进。返回一份快照（探针与 UI 都读它，不重复计算）。
function updatePoliticalEconomy(y, m, silent) {
  const T = polEconTable();
  if (!T) return null;
  const cKey = ST.player;
  if (!cKey) return null;                       // 旁观：没有执政者，就没有政治账单
  const keys = entKeys(cKey);
  if (!keys.length) return null;
  const actual = growthOf(keys);
  if (actual === null) return null;             // 历史不足 13 个月：还谈不上「落差」

  const p = initPolEcon();
  const A = polEconAnchor(cKey, T);
  const surprise = actual - A.mean;
  const z = surprise / A.sd;
  p.lastActual = +actual.toFixed(3);
  p.lastExpect = +A.mean.toFixed(3);
  p.lastSurprise = +surprise.toFixed(3);
  p.lastZ = +z.toFixed(3);
  p.reserveMonths = polEconReserveMonths(cKey);

  // 适应性预期：锚朝现实挪一步，同时被史实均值拉回一步。
  // 只用 ADAPT：任何一次性水平跃升的红利都会在约一年内被「习惯」掉，
  // 但线性外推也会让长期崩塌把锚拖到不现实的位置（苏联 -6%）。
  // 只用 REVERT：一次技术冲击的红利永远不会消失，可以无限刷。
  // 两者并存 → 锚收敛到「史实均值与当期现实之间」，两个漏洞同时堵住。
  const adapt = (actual - A.mean) * T.ANCHOR_ADAPT;
  const revert = (A.hist - A.mean) * T.ANCHOR_REVERT;
  p.anchor[cKey] = A.mean + adapt + revert;

  // 连续性计数：单月噪声不算数，两个月经得起才认账
  if (z <= T.Z_BAD) { p.bad += 1; p.good = 0; }
  else if (z >= T.Z_GOOD) { p.good += 1; p.bad = 0; }
  else { p.bad = 0; p.good = 0; }

  const dom = polEconDomesticOf(cKey);
  let touched = [];
  // 两个渠道各自给出一个「目标动荡」，取较高者后统一拉一格 ——
  // 相加会让同时触发的渠道叠加放大，取 max 则让最严重的那个定义局面。
  let unrestTarget = 0;
  let blameDown = 0, blameUp = 0;

  if (p.bad >= T.PERSIST) {
    // severity：z 越过阈值多少（0 = 刚越线，1 = 越线 2 个标准差以上）
    const sev = clamp((T.Z_BAD - z) / 2, 0, 1);
    unrestTarget = Math.max(unrestTarget, T.UNREST_TARGET_BAD_BASE + T.UNREST_TARGET_BAD_SPAN * sev);
    blameDown = T.BLAME_BASE + T.BLAME_SCALE * sev;
    blameUp = T.ALT_BASE + T.ALT_SCALE * sev;
    if (p.bad === T.PERSIST) {
      polEconRecord("bad", y, m, { z: +z.toFixed(2), surprise: +surprise.toFixed(2) });
      if (!silent) {
        toast({ y: y, m: m, zh: "【经济账单到期】增长显著低于国民预期",
          note: "近 12 个月实际 " + actual.toFixed(1) + "%，社会预期 " + A.mean.toFixed(1) +
            "%（落差 " + surprise.toFixed(1) + " 个百分点）。执政路线开始被问责。" });
      }
    }
  } else if (p.good >= T.PERSIST) {
    const sev = clamp((z - T.Z_GOOD) / 2, 0, 1);
    blameDown = -(T.CREDIT_BASE + T.CREDIT_SCALE * sev);   // 负的「归咎」= 执政路线得分
    unrestTarget = 0;                                      // 好年景把张力拉回 0
    if (p.good === T.PERSIST) {
      polEconRecord("good", y, m, { z: +z.toFixed(2), surprise: +surprise.toFixed(2) });
      if (!silent) {
        toast({ y: y, m: m, zh: "【经济红利入账】增长显著高于国民预期",
          note: "近 12 个月实际 " + actual.toFixed(1) + "%，社会预期 " + A.mean.toFixed(1) +
            "%（超出 " + surprise.toFixed(1) + " 个百分点）。执政路线获得信用。" });
      }
    }
  }

  // 国际收支：储备见底是第二种账单，与增长落差独立
  const rm = p.reserveMonths;
  if (rm !== null && rm < T.RESERVE_WARN_MONTHS && dom) {
    const sevR = clamp((T.RESERVE_WARN_MONTHS - rm) / T.RESERVE_WARN_MONTHS, 0, 1);
    unrestTarget = Math.max(unrestTarget, T.UNREST_TARGET_BOP_BASE + T.UNREST_TARGET_BOP_SPAN * sevR);
    blameDown = Math.max(blameDown, T.RESERVE_BLAME * (0.5 + sevR));
    if (rm < T.RESERVE_CRIT_MONTHS) {
      const now = y * 12 + m;
      const last = p.alerts.length ? p.alerts[p.alerts.length - 1] : -1e9;
      if (now - last >= T.RESERVE_ALERT_COOLDOWN) {
        p.alerts.push(now);
        polEconRecord("bop", y, m, { months: +rm.toFixed(2) });
        const item = { y: y, m: m, zh: "【国际收支危机】自由外汇储备即将耗尽",
          note: "按当前净流出速度，USD 储备仅够 " + rm.toFixed(1) + " 个月。必须削减进口、开辟顺差或寻求外部纾困，否则将被迫违约。" };
        EV.items.push(item);
        EV.unread++;
        renderInbox();
        if (!silent) toast(item);
      }
    }
  }

  if (blameDown || blameUp) touched = polEconApplyBlame(cKey, T, blameDown, blameUp, 0);
  // 无论有没有账单，动荡都朝当期目标靠拢：没有压力 → 目标 0 → 自然回落。
  // （单个统一出口，避免「上升走累加、下降走衰减」两套逻辑互相打架。）
  polEconPullUnrest(dom, clamp(unrestTarget, 0, 100), T);
  if (dom && typeof dom.unrest === "number" && touched.indexOf("unrest") < 0) touched.push("unrest");

  return polEconSnapshot();
}

// ---- P2（AI 睁眼）：经济快照 ------------------------------------------------
// AI 此前对世界经济完全失明：worldState 只有 1980 静态元数据 + 张力/年份/战争标志。
// 于是「援助一个快破产的盟友」「对一个破产的对手趁火打劫」「经济吃紧就削减军费」
// 这些真实战略选择对 AI 根本不存在。这里给它一副只读的眼睛。
//
// 只读是硬约束：不创建任何内政对象、不消费 RNG、不写 pmods/gdp。
function polEconStrainOf(k) {
  const T = polEconTable();
  if (!T) return 0;
  const S = T.STRAIN;
  let strain = 0;

  // 渠道一：增长低于史实常态多少
  const actual = growthOf(entKeys(k));
  if (actual !== null) {
    const anchor = (T.ANCHOR && T.ANCHOR[k]) || T.ANCHOR.DEFAULT;
    const gap = anchor[0] - actual;                 // 正 = 比历史常态差
    strain = Math.max(strain, clamp(gap / S.GROWTH_FLOOR, 0, 1));
  }

  // 渠道二：外汇储备见底（已在 polEconReserveMonths 里过掉「相对 GDP 不显著」）
  const rm = polEconReserveMonths(k);
  if (rm !== null) strain = Math.max(strain, clamp((S.RESERVE_WARN - rm) / S.RESERVE_WARN, 0, 1));

  // 渠道三：社会动荡
  const dom = domesticStateOf(k) || T.DEFAULT_STATE;
  const unrest = typeof dom.unrest === "number" ? dom.unrest : 0;
  strain = Math.max(strain, clamp((unrest - S.UNREST_BASE) / S.UNREST_SPAN, 0, 1));

  return strain;
}

// 逐实体的只读经济读数：{growth, gdp, reserveMonths, unrest, strain}
function polEconReadOf(k) {
  const T = polEconTable();
  const g = growthOf(entKeys(k));
  const dom = (T && domesticStateOf(k)) || (T && T.DEFAULT_STATE) || { unrest: 0 };
  return {
    growth: g === null ? null : +g.toFixed(2),
    gdp: +simVal(k).gdp_bn.toFixed(1),
    reserveMonths: polEconReserveMonths(k),
    unrest: typeof dom.unrest === "number" ? +dom.unrest.toFixed(1) : 0,
    strain: +polEconStrainOf(k).toFixed(3)
  };
}

// 一次性为全体实体建快照（月度调用一次，不在每国循环里重复算）
function polEconWorldSnapshot() {
  const out = {};
  if (!CM || !CM.countries) return out;
  for (const k in CM.countries) out[k] = polEconReadOf(k);
  return out;
}

// 只读快照：UI 与探针共用一份口径，避免各写一遍算术
function polEconSnapshot() {
  const p = ST.polEcon;
  if (!p) return null;
  const T = polEconTable();
  const cKey = ST.player;
  const dom = cKey ? polEconDomesticOf(cKey) : null;
  return {
    player: cKey || null,
    actual: p.lastActual,
    expect: p.lastExpect,
    surprise: p.lastSurprise,
    z: p.lastZ,
    bad: p.bad,
    good: p.good,
    reserveMonths: p.reserveMonths,
    lastBill: p.lastBill,
    bills: p.events.length,
    badBills: p.events.filter((e) => e.kind === "bad").length,
    goodBills: p.events.filter((e) => e.kind === "good").length,
    bopAlerts: p.events.filter((e) => e.kind === "bop").length,
    anchor: cKey && typeof p.anchor[cKey] === "number" ? +p.anchor[cKey].toFixed(3) : null,
    unrest: dom && typeof dom.unrest === "number" ? +dom.unrest.toFixed(2) : null,
    touched: polEconSinkOf(cKey || "DEFAULT", T).down.slice()
  };
}

// 内政面板上的「经济账单」条：让落差、储备与连续计数随时可见 ——
// 不可见的机制等于不存在的机制。
function domesticPolEconHtml() {
  const T = polEconTable();
  if (!T) return "";
  const s = polEconSnapshot();
  let h = '<div class="pdb-polecon">';
  h += '<div class="pdb-meter-row"><span class="pdb-meter-lbl">📉 经济账单（增长落差）</span>';
  if (!s || s.actual === null || s.actual === undefined) {
    h += '</div><div class="pdb-polecon-note">尚无足够经济史（需 13 个月）—— 账单从 1981 年起开始到期。</div></div>';
    return h;
  }
  const tone = s.surprise >= 0 ? "#4ade80" : (s.z <= T.Z_BAD ? "#f87171" : "#fbbf24");
  h += '<span class="pdb-meter-val" style="color:' + tone + '">' +
    (s.surprise >= 0 ? "+" : "") + s.surprise.toFixed(1) + ' pp</span></div>';
  h += '<div class="pdb-polecon-note">实际 ' + s.actual.toFixed(1) + '% vs 国民预期 ' + s.expect.toFixed(1) +
    '%　·　标准化落差 ' + s.z.toFixed(2) + 'σ</div>';
  if (s.bad >= T.PERSIST) {
    h += '<div class="pdb-alert">⚠️ 账单到期：连续 ' + s.bad + ' 个月增长低于预期，执政路线正在被问责。</div>';
  } else if (s.good >= T.PERSIST) {
    h += '<div class="pdb-polecon-good">✦ 经济红利：连续 ' + s.good + ' 个月超出预期，执政路线获得信用。</div>';
  }
  if (s.reserveMonths !== null && s.reserveMonths !== undefined) {
    const rm = s.reserveMonths;
    const rc = rm < T.RESERVE_CRIT_MONTHS ? "#f87171" : rm < T.RESERVE_WARN_MONTHS ? "#fbbf24" : "#7ba4d9";
    h += '<div class="pdb-polecon-note">USD 储备可支撑 <b style="color:' + rc + '">' + rm.toFixed(1) +
      '</b> 个月净流出</div>';
  }
  if (s.bills) {
    h += '<div class="pdb-polecon-note">已入账：亏损 ' + s.badBills + ' · 红利 ' + s.goodBills +
      ' · 收支危机 ' + s.bopAlerts + '</div>';
  }
  h += '</div>';
  return h;
}
