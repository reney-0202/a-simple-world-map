'use strict';
/* world1980 data-layer contract checks — one exported function per check class.
 *
 * Every check is a pure function of a `ctx` bag and returns
 * `{ problems: string[], notes: string[], stats?: object }`. That keeps each
 * class independently unit-testable against synthetic fixtures (see
 * tools/validate.test.js) without a browser, an out/ directory, or a DOM.
 *
 * ctx = {
 *   data,            // the loaded globals (W1980_COUNTRIES, W1980_TRADE, ...)
 *   entities,        // string[]  — the 54 playable entity keys
 *   members,         // Set<string> — sim member keys (second address space)
 *   MAP_FED_TARGET,  // { [alias]: federationKey } documented federation aliases
 *   resolves(k),     // boolean — k belongs to either address space (or an alias)
 *   outDir           // string — used by the file-based border check
 * }
 */

// ---- shared helpers ----------------------------------------------------------

/** Which address space does `k` belong to? Used by the coverage report. */
function addressSpaceOf(ctx, k) {
  if (ctx.entities.indexOf(k) >= 0) return 'entity';
  if (ctx.members.has(k)) return 'member';
  if (ctx.MAP_FED_TARGET[k]) return 'alias';
  return 'unknown';
}

function unresolvable(ctx, keys) {
  return (keys || []).filter((k) => !ctx.resolves(k));
}

// ---- 1. the two address spaces -------------------------------------------------

function checkAddressSpaces(ctx) {
  const notes = [];
  const problems = [];
  notes.push(`entities=${ctx.entities.length} members=${ctx.members.size}`);
  notes.push(`entities without own sim row: ${ctx.entities.filter((k) => !ctx.members.has(k)).join(',') || '(none)'}`);
  // every alias must point at a real entity, otherwise the alias itself dangles
  for (const alias of Object.keys(ctx.MAP_FED_TARGET)) {
    const target = ctx.MAP_FED_TARGET[alias];
    if (ctx.entities.indexOf(target) < 0) problems.push(`MAP_FED_TARGET: "${alias}" -> "${target}" 目标不是可玩实体`);
  }
  return { problems, notes };
}

// ---- 2a. crises ----------------------------------------------------------------

function checkCrises(ctx) {
  const notes = [];
  const problems = [];
  const CRISES = ctx.data.W1980_CRISES;
  if (!CRISES || !CRISES.list) {
    return { problems: ['crises.js: no W1980_CRISES.list'], notes };
  }
  let bad = 0;
  for (const c of CRISES.list) {
    for (const fld of ['target', 'initiator']) {
      if (c[fld] && !ctx.resolves(c[fld])) { problems.push(`crises.js: ${c.id}.${fld} = "${c[fld]}" 不可解析`); bad++; }
    }
    for (const k of unresolvable(ctx, c.actors)) { problems.push(`crises.js: ${c.id}.actors 含 "${k}"`); bad++; }
  }
  notes.push(`crises: ${CRISES.list.length} entries, ${bad} unresolvable keys`);
  return { problems, notes };
}

// ---- 2b. reserves coverage + trade routes --------------------------------------

function checkTrade(ctx) {
  const notes = [];
  const problems = [];
  const TRADE = ctx.data.W1980_TRADE;
  if (!TRADE || !TRADE.INIT_RESERVES) {
    return { problems: ['trade.js: no W1980_TRADE.INIT_RESERVES'], notes };
  }
  const IR = TRADE.INIT_RESERVES;
  const missing = ctx.entities.filter((k) => IR[k] === undefined);
  notes.push(`INIT_RESERVES covers ${Object.keys(IR).length}/${ctx.entities.length} entities`);
  if (missing.length) problems.push(`INIT_RESERVES 缺 ${missing.length}/${ctx.entities.length}: ${missing.join(',')}`);
  for (const k of Object.keys(IR)) {
    if (ctx.entities.indexOf(k) < 0) problems.push(`INIT_RESERVES 含未知实体 "${k}"`);
  }
  if (TRADE.BASELINE_ROUTES) {
    let bad = 0;
    for (const r of TRADE.BASELINE_ROUTES) {
      for (const f of ['from', 'to']) {
        if (r[f] && !ctx.resolves(r[f])) { problems.push(`trade.js: ${r.id}.${f} = "${r[f]}" 不可解析`); bad++; }
      }
    }
    notes.push(`BASELINE_ROUTES: ${TRADE.BASELINE_ROUTES.length} routes, ${bad} unresolvable endpoints`);
  }
  return { problems, notes };
}

// ---- 2c. events / crossroads / keyed databases ---------------------------------

function checkEvents(ctx) {
  const notes = [];
  const problems = [];
  const EV = ctx.data.W1980_EVENTS;
  if (!Array.isArray(EV)) return { problems: ['events.js: W1980_EVENTS 不是数组'], notes };
  let bad = 0;
  for (const e of EV) {
    for (const k of unresolvable(ctx, e.targets)) { problems.push(`events.js: ${e.id}.targets 含 "${k}"`); bad++; }
  }
  notes.push(`events: ${EV.length} entries, ${bad} unresolvable targets`);
  return { problems, notes };
}

function checkCrossroads(ctx) {
  const notes = [];
  const problems = [];
  const CRX = ctx.data.W1980_CROSSROADS;
  if (!Array.isArray(CRX)) return { problems: ['cr.js: W1980_CROSSROADS 不是数组'], notes };
  let bad = 0;
  for (const c of CRX) {
    for (const k of unresolvable(ctx, c.actors)) { problems.push(`cr.js: ${c.id}.actors 含 "${k}"`); bad++; }
  }
  notes.push(`cr: ${CRX.length} entries, ${bad} unresolvable actors`);
  return { problems, notes };
}

function checkKeyedDatabases(ctx) {
  const notes = [];
  const problems = [];
  const d = ctx.data;
  const checkKeys = (label, obj, keyName) => {
    const keys = Object.keys(obj).filter((k) => k !== 'DEFAULT');
    const bad = keys.filter((k) => !ctx.resolves(k));
    notes.push(`${label}: ${Object.keys(obj).length} ${keyName}, ${bad.length} unresolvable`);
    bad.forEach((k) => problems.push(`${label} 含 "${k}"`));
  };

  const AG = d.W1980_AGENDAS;
  if (AG && AG.database) checkKeys('agendas.database', AG.database, 'countries');
  const IN = d.W1980_INTEL;
  if (IN && IN.AGENCIES) checkKeys('intel.AGENCIES', IN.AGENCIES, 'entries');
  // afghan.POLICIES is keyed by strategy id, not by country - skip (vocabulary, not FK)
  const AF = d.W1980_AFGHAN;
  if (AF && AF.POLICIES) notes.push(`afghan.POLICIES: ${Object.keys(AF.POLICIES).length} strategies (id-keyed, not a country FK)`);
  const AI = d.W1980_AI;
  if (AI && AI.AI_DOCTRINES) checkKeys('ai.AI_DOCTRINES', AI.AI_DOCTRINES, 'entries');
  const RES = d.W1980_RESOURCES;
  if (RES && RES.countries) checkKeys('resources.countries', RES.countries, 'entries');
  return { problems, notes };
}

// ---- 2d. embargo / CoCom / chokepoints -----------------------------------------
// The original validator guarded this with `EMB.COMCOM`, but the data key is
// `COCOM` — so the check had been dead code since it was written and never once
// ran. COCOM is not keyed by country either: it declares bloc + resource
// vocabularies and a list of route ids. Those are the real contracts, because a
// renamed route id or a typo'd bloc name silently disables the chokepoint and
// CoCom mechanics at runtime without any error.
const BLOC_KEYS = ['NATO', 'WP', 'SOV', 'CHN', 'W', 'NA', 'NE']; // mirrored from app/01-core.js BLOC

function checkEmbargo(ctx) {
  const notes = [];
  const problems = [];
  const EMB = ctx.data.W1980_EMBARGO;
  if (!EMB) return { problems: ['embargo.js: no W1980_EMBARGO'], notes };
  const COCOM = EMB.COCOM;
  if (!COCOM) return { problems: ['embargo.js: no W1980_EMBARGO.COCOM'], notes };

  const resKeys = Object.keys(((ctx.data.W1980_RESOURCES || {}).meta) || {});
  const routeIds = new Set((((ctx.data.W1980_TRADE || {}).BASELINE_ROUTES) || []).map((r) => r.id));
  let bad = 0;
  for (const list of ['sourceBlocs', 'targetBlocs']) {
    for (const k of (COCOM[list] || [])) {
      if (BLOC_KEYS.indexOf(k) < 0) {
        problems.push(`embargo.js: COCOM.${list} 含未知阵营 "${k}"（合法：${BLOC_KEYS.join('/')}）`); bad++;
      }
    }
  }
  for (const k of (COCOM.restrictedRes || [])) {
    if (resKeys.indexOf(k) < 0) {
      problems.push(`embargo.js: COCOM.restrictedRes 含未知资源 "${k}"（合法：${resKeys.join('/')}）`); bad++;
    }
  }
  notes.push(`embargo.COCOM: sourceBlocs=${(COCOM.sourceBlocs || []).length} targetBlocs=${(COCOM.targetBlocs || []).length} restrictedRes=${(COCOM.restrictedRes || []).length}, ${bad} unresolvable`);

  const CPS = EMB.CHOKEPOINTS || {};
  const cpIds = Object.keys(CPS);
  let cpBad = 0, cpRoutes = 0;
  for (const id of cpIds) {
    const cp = CPS[id];
    if (!cp.states || !cp.states[cp.defaultState]) {
      problems.push(`embargo.js: 咽喉 ${id}.defaultState = "${cp.defaultState}" 不在 states 内`); cpBad++;
    }
    for (const st of Object.keys(cp.states || {})) {
      const s = cp.states[st];
      if (typeof s.factor !== 'number' || typeof s.costFactor !== 'number') {
        problems.push(`embargo.js: 咽喉 ${id}.states.${st} 缺数值 factor/costFactor`); cpBad++;
      }
    }
    for (const rid of (cp.affectedRoutes || [])) {
      cpRoutes++;
      if (!routeIds.has(rid)) { problems.push(`embargo.js: 咽喉 ${id}.affectedRoutes 含未知航线 "${rid}"`); cpBad++; }
    }
  }
  notes.push(`embargo.CHOKEPOINTS: ${cpIds.length} chokepoints, ${cpRoutes} affected routes, ${cpBad} bad`);
  return { problems, notes, stats: { cocomBad: bad, chokepointBad: cpBad } };
}

// ---- 2e. raster integrity manifest ---------------------------------------------
// checksum.json — and the copy the app actually reads, CM.checksum — carry a
// sha256 of the province raster. Nothing ever read that field, so it had gone
// stale: the shipped PNG no longer matched its recorded digest. A hash nobody
// verifies is a trap for whoever wires it up next, so it is checked here.
function checkIntegrityManifest(ctx) {
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const notes = [];
  const problems = [];

  const CM = ctx.data.W1980_COUNTRIES || {};
  const inMemory = (CM.checksum || {}).sha256_province_id_png;
  const jsonPath = path.join(ctx.outDir, 'data/checksum.json');
  let onDisk = null;
  if (fs.existsSync(jsonPath)) {
    try { onDisk = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).sha256_province_id_png; }
    catch (e) { problems.push(`checksum.json: JSON 解析失败：${e.message}`); }
  } else {
    problems.push('checksum.json: 缺少 data/checksum.json');
  }

  if (inMemory && onDisk && inMemory !== onDisk) {
    problems.push(`栅格完整性摘要不一致：countries.js checksum=${inMemory.slice(0, 12)}… vs checksum.json=${onDisk.slice(0, 12)}…`);
  }

  const pngPath = path.join(ctx.outDir, 'data/province_id.png');
  let actual = null;
  if (fs.existsSync(pngPath)) {
    actual = crypto.createHash('sha256').update(fs.readFileSync(pngPath)).digest('hex');
  } else {
    problems.push('province_id.png: 缺少 data/province_id.png');
  }

  const recorded = inMemory || onDisk;
  if (actual && recorded && actual !== recorded) {
    problems.push(`province_id.png 的 sha256 与清单不符：实际 ${actual.slice(0, 12)}… vs 清单 ${recorded.slice(0, 12)}…（PNG 被改动但清单未更新）`);
  }
  notes.push(`raster integrity: province_id.png sha256 ${actual ? actual.slice(0, 12) + '…' : '(missing)'}, manifest ${recorded ? recorded.slice(0, 12) + '…' : '(missing)'}, ${problems.length} mismatch`);
  return { problems, notes, stats: { matched: problems.length === 0 } };
}

// ---- 2f. borders ---------------------------------------------------------------
// D：两个巨型边界数据已改为 JSON 按需加载，校验改为直接读 JSON。
// 注意：数据是「delta-int16 折线数组」——每条折线是一串 int16 增量（decodeVB 解码为
// 浮点点列），端点并不是 province id，因此只做结构与量程校验，不做 FK 校验。
const BORDER_FILES = [
  ['data/borders_province.json', 'borders_province'],
  ['data/borders_country.json', 'borders_country'],
];

function checkBorders(ctx) {
  const fs = require('fs');
  const path = require('path');
  const notes = [];
  const problems = [];
  const PM = ctx.data.W1980_PROVINCES;
  notes.push(`provinces: ${Object.keys(PM || {}).length} ids`);
  for (const [json, label] of BORDER_FILES) {
    const f = path.join(ctx.outDir, json);
    if (!fs.existsSync(f)) { problems.push(`${label}: 缺少 ${json}`); continue; }
    let arr = null;
    try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); }
    catch (e) { problems.push(`${label}: ${json} JSON 解析失败：${e.message}`); continue; }
    if (!Array.isArray(arr)) { problems.push(`${label}: ${json} 不是数组`); continue; }
    let bad = 0, pts = 0;
    for (const p of arr) {
      if (!Array.isArray(p) || p.length < 4 || p.length % 2 !== 0) {
        if (bad < 5) problems.push(`${label}: 折线长度非法（${p && p.length}）`);
        bad++; continue;
      }
      for (const v of p) {
        if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 32767) {
          if (bad < 5) problems.push(`${label}: 增量值越界 ${v}`);
          bad++; break;
        }
      }
      pts += p.length / 2;
    }
    notes.push(`${label}: ${arr.length} polylines, ${pts} points, ${bad} malformed`);
  }
  return { problems, notes };
}

// ---- 2g. effect vocabulary -----------------------------------------------------

/** Collect every `effects` object declared anywhere in the loaded data modules.
 *
 *  The AI-side effects live on `UNSC_RESOLUTIONS` (consumed by
 *  accUnscResolutionEffects), NOT on AI_DOCTRINES — the original scan walked
 *  AI_DOCTRINES, which declares no effects at all, so the whole `ai` group of
 *  the vocabulary went unvalidated. Both are walked now. */
function collectEffectSites(ctx) {
  const sites = [];
  for (const c of ((ctx.data.W1980_CRISES || {}).list || [])) {
    for (const o of (c.options || [])) sites.push({ label: `crises.js: ${c.id} tier${o.tier}`, effects: o.effects });
  }
  const AGD = (ctx.data.W1980_AGENDAS || {}).database || {};
  for (const ck of Object.keys(AGD)) {
    for (const a of (AGD[ck] || [])) sites.push({ label: `agendas.js: ${ck}/${a.id}`, effects: a.effects });
  }
  const U = (ctx.data.W1980_AI || {}).UNSC_RESOLUTIONS || {};
  for (const id of Object.keys(U)) sites.push({ label: `ai.js: UNSC_RESOLUTIONS.${id}`, effects: U[id].effects });
  const walk = (o, label) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, label + '[' + i + ']')); return; }
    if (o.effects && typeof o.effects === 'object') sites.push({ label, effects: o.effects });
    for (const k of Object.keys(o)) walk(o[k], label + '.' + k);
  };
  walk((ctx.data.W1980_AI || {}).AI_DOCTRINES || {}, 'ai.AI_DOCTRINES');
  return sites;
}

function checkEffectVocabulary(ctx) {
  const notes = [];
  const problems = [];
  const EFF = ctx.data.W1980_EFFECTS;
  if (!EFF || !EFF.EFFECTS) return { problems: ['effects.js: no W1980_EFFECTS.EFFECTS'], notes };
  notes.push(`effect vocabulary: ${Object.keys(EFF.EFFECTS).length} keys (crisis=${EFF.keysOf('crisis').length}, agenda=${EFF.keysOf('agenda').length}, ai=${EFF.keysOf('ai').length})`);
  const sites = collectEffectSites(ctx);
  let bad = 0;
  for (const site of sites) {
    const unk = EFF.unknownKeys(site.effects);
    if (unk.length) { problems.push(`${site.label}: 未登记效果键 ${unk.join(', ')}`); bad += unk.length; }
  }
  notes.push(`effect vocabulary violations: ${bad}`);
  return { problems, notes, stats: { violations: bad, sites: sites.length } };
}

// ---- 2h. AI strategic objectives ----------------------------------------------

function checkStrategicObjectives(ctx) {
  const notes = [];
  const problems = [];
  const OBJ = (ctx.data.W1980_AI || {}).STRATEGIC_OBJECTIVES;
  if (!OBJ) return { problems: ['ai.js: no STRATEGIC_OBJECTIVES'], notes };
  let objBad = 0, objN = 0, dynN = 0;
  for (const k of Object.keys(OBJ)) {
    if (!ctx.resolves(k)) { problems.push(`ai.js: STRATEGIC_OBJECTIVES 属主 "${k}" 不可解析`); objBad++; }
    for (const o of OBJ[k]) {
      objN++;
      if (o.target && !ctx.resolves(o.target)) { problems.push(`ai.js: ${k}/${o.id}.target = "${o.target}" 不可解析`); objBad++; }
      if (o.kind === 'mil' && typeof o.delta !== 'number') { problems.push(`ai.js: ${k}/${o.id} kind=mil 缺 delta`); objBad++; }
      // P2：aid / sanction 目标可以是静态 target，也可以是评估期解析的 `pick`。
      // 两者都没有 = AI 会宣称一个自己无法执行的目标（面板上写着「援助某国」却没有某国）。
      if (o.kind === 'aid' || o.kind === 'sanction') {
        const hasStatic = typeof o.target === 'string' && o.target;
        const hasPick = typeof o.pick === 'function';
        if (hasPick) dynN++;
        if (!hasStatic && !hasPick) {
          problems.push(`ai.js: ${k}/${o.id} kind=${o.kind} 既无 target 也无 pick（目标无处落地）`);
          objBad++;
        }
        if (hasStatic && hasPick) {
          problems.push(`ai.js: ${k}/${o.id} 同时给了 target 与 pick（pick 会覆盖 target，意图不清）`);
          objBad++;
        }
      }
      // 负向军费目标必须真的为负；为 0 就是「宣称裁军但什么都不做」
      if (o.kind === 'mil' && typeof o.delta === 'number' && o.delta === 0) {
        problems.push(`ai.js: ${k}/${o.id} kind=mil 的 delta 为 0（不产生任何效果）`);
        objBad++;
      }
    }
  }
  notes.push(`ai strategic objectives: ${objN} entries across ${Object.keys(OBJ).length} countries, `
    + `${dynN} dynamically targeted, ${objBad} bad`);
  return { problems, notes, stats: { objectives: objN, countries: Object.keys(OBJ).length, dynamic: dynN, bad: objBad } };
}

// ---- registry ------------------------------------------------------------------
// Order matters: it defines the note/problem ordering of the human-readable output
// and therefore what the CI log looks like.
// ---- 2i. probe registry ------------------------------------------------------
// M2（探针注册收敛）：data/probes.js 是探针的唯一事实源 —— 浏览器用它判定
// CR.probeMode 并驱动分派，tools/probe_runner.py 用同一份 entries 启动探针。
// 这里校验它内部自洽，避免出现「params 里登记了但 entries 没有」这类会让探针
// 静默不跑的形态。
function probeParamToken(qs) {
  return String(qs || '').split('&')[0].split('=')[0];
}

function checkProbeRegistry(ctx) {
  const notes = [];
  const problems = [];
  const REG = ctx.data.W1980_PROBES;
  if (!REG) return { problems: ['probes.js: 未定义 W1980_PROBES'], notes };
  const params = REG.params;
  const entries = REG.entries;
  if (!Array.isArray(params) || !params.length) return { problems: ['probes.js: params 必须是非空数组'], notes };
  if (!entries || typeof entries !== 'object') return { problems: ['probes.js: entries 必须是对象'], notes };

  const dupes = params.filter((p, i) => params.indexOf(p) !== i);
  if (dupes.length) problems.push(`probes.js: params 有重复项 ${[...new Set(dupes)].join(', ')}`);

  const claimed = {};
  const markers = {};
  const classes = { history: [], mechanics: [] };
  for (const key of Object.keys(entries)) {
    const e = entries[key] || {};
    if (typeof e.qs !== 'string' || !e.qs) { problems.push(`probes.js: entries.${key}.qs 必须是非空字符串`); continue; }
    if (typeof e.marker !== 'string' || e.marker !== e.marker.toUpperCase()) {
      problems.push(`probes.js: entries.${key}.marker 必须是大写字符串`);
    }
    if (typeof e.budget !== 'number' || !(e.budget > 0)) {
      problems.push(`probes.js: entries.${key}.budget 必须是正数`);
    }
    // P0：探针分两类，`cmp --class=history` 是 CI 硬门，所以 class 必须是
    // 登记过的两个值之一 —— 写错一个字母就会让那个探针悄悄退出硬门。
    if (e.class !== 'history' && e.class !== 'mechanics') {
      problems.push(`probes.js: entries.${key}.class 必须是 history 或 mechanics，实为 ${JSON.stringify(e.class)}`);
    } else {
      classes[e.class].push(key);
    }
    if (markers[e.marker]) problems.push(`probes.js: marker ${e.marker} 被 ${markers[e.marker]} 与 ${key} 同时使用`);
    markers[e.marker] = key;
    const tok = probeParamToken(e.qs);
    if (claimed[tok]) problems.push(`probes.js: 参数 ${tok} 被 ${claimed[tok]} 与 ${key} 同时占用`);
    claimed[tok] = key;
  }

  // 硬门空转比没有硬门更糟：history 一个都没有时，`cmp --class=history` 会
  // 永远绿，而「历史不漂移」的承诺已经失效。
  if (!classes.history.length) {
    problems.push('probes.js: 没有 class="history" 的探针，cmp --class=history 硬门会空转');
  }
  if (!classes.mechanics.length) {
    problems.push('probes.js: 没有 class="mechanics" 的探针');
  }

  const onlyParams = params.filter((p) => !claimed[p]);
  const onlyEntries = Object.keys(claimed).filter((t) => params.indexOf(t) < 0);
  if (onlyParams.length) problems.push(`probes.js: params 里登记但没有对应 entries：${onlyParams.join(', ')}`);
  if (onlyEntries.length) problems.push(`probes.js: entries 用了未登记的参数：${onlyEntries.join(', ')}`);

  notes.push(`probe registry: ${Object.keys(entries).length} probes, ${params.length} url params, `
    + `${classes.history.length} history / ${classes.mechanics.length} mechanics, ${problems.length} problem(s)`);
  return {
    problems, notes,
    stats: {
      probes: Object.keys(entries).length, params: params.length,
      history: classes.history.length, mechanics: classes.mechanics.length,
    },
  };
}

// ---- 2k. political-economy table (P1) ----------------------------------------
// data/polecon.js 是「经济 → 政治」唯一的参数来源。它有两个会让机制**静默失效**
// 的坏法：期望锚缺一国（该国永远算不出落差，也就永远没有政治后果），
// 或者归咎映射指向一个拼错的字段名（账单写进虚空）。两者都必须构建期失败。
function checkPolEcon(ctx) {
  const notes = [];
  const problems = [];
  const PC = ctx.data.W1980_POLECON;
  if (!PC) return { problems: ['polecon.js: 未定义 W1980_POLECON'], notes };
  const ANCHOR = PC.ANCHOR, BLAME = PC.BLAME;
  if (!ANCHOR || typeof ANCHOR !== 'object') return { problems: ['polecon.js: ANCHOR 必须是对象'], notes };
  if (!BLAME || typeof BLAME !== 'object') return { problems: ['polecon.js: BLAME 必须是对象'], notes };
  const ents = ctx.entities;
  const missingAnchor = ents.filter((k) => !ANCHOR[k]);
  if (missingAnchor.length) {
    problems.push(`polecon.js: ANCHOR 缺少实体 ${missingAnchor.join(', ')}（该国永远算不出落差）`);
  }
  // BLAME 允许靠 DEFAULT 兜底：47 个通用国家的内政对象字段完全相同
  // （stability/unrest/legitimacy/sanctionStrain），给它们各写一行只会是
  // 54 份一模一样的拷贝。真正必须保证的是「兜底存在」且「显式行不指向假实体」。
  if (!BLAME.DEFAULT) problems.push('polecon.js: BLAME 缺少 DEFAULT 兜底行（47 个通用国家会没有落点）');
  const blameCovered = ents.filter((k) => !BLAME[k] && !BLAME.DEFAULT);
  if (blameCovered.length) {
    problems.push(`polecon.js: BLAME 既无显式行也无 DEFAULT，实体无处落账：${blameCovered.join(', ')}`);
  }
  for (const k of Object.keys(ANCHOR)) {
    if (k !== 'DEFAULT' && ents.indexOf(k) < 0) {
      problems.push(`polecon.js: ANCHOR.${k} 不是实体键`);
      continue;
    }
    const row = ANCHOR[k];
    if (!Array.isArray(row) || row.length !== 2) {
      problems.push(`polecon.js: ANCHOR.${k} 必须是 [史实均值, 史实标准差]`);
      continue;
    }
    if (typeof row[0] !== 'number' || !isFinite(row[0])) {
      problems.push(`polecon.js: ANCHOR.${k}[0] 必须是有限数`);
    }
    if (typeof row[1] !== 'number' || !isFinite(row[1]) || !(row[1] > 0)) {
      problems.push(`polecon.js: ANCHOR.${k}[1] 必须是正数（标准差作 z 的分母）`);
    }
  }
  if (!ANCHOR.DEFAULT) problems.push('polecon.js: ANCHOR 缺少 DEFAULT 兜底行');
  let fields = 0;
  for (const k of Object.keys(BLAME)) {
    if (k !== 'DEFAULT' && ents.indexOf(k) < 0) {
      problems.push(`polecon.js: BLAME.${k} 不是实体键`);
      continue;
    }
    const row = BLAME[k];
    if (!row || typeof row !== 'object') {
      problems.push(`polecon.js: BLAME.${k} 必须是对象`);
      continue;
    }
    for (const side of ['down', 'up']) {
      if (!Array.isArray(row[side])) {
        problems.push(`polecon.js: BLAME.${k}.${side} 必须是数组`);
        continue;
      }
      for (const f of row[side]) {
        if (typeof f !== 'string' || !f) {
          problems.push(`polecon.js: BLAME.${k}.${side} 含非字符串项`);
          continue;
        }
        fields++;
      }
    }
    if (!Array.isArray(row.down) || !row.down.length) {
      problems.push(`polecon.js: BLAME.${k}.down 不能为空（坏账必须有落点）`);
    }
  }
  // 阈值必须自洽：坏阈值为负、好阈值为正、两者不能交叉
  if (!(typeof PC.Z_BAD === 'number' && PC.Z_BAD < 0)) problems.push('polecon.js: Z_BAD 必须是负数');
  if (!(typeof PC.Z_GOOD === 'number' && PC.Z_GOOD > 0)) problems.push('polecon.js: Z_GOOD 必须是正数');
  if (!(typeof PC.PERSIST === 'number' && PC.PERSIST >= 1)) problems.push('polecon.js: PERSIST 必须是 >=1 的整数');
  if (!(typeof PC.ANCHOR_ADAPT === 'number' && PC.ANCHOR_ADAPT > 0 && PC.ANCHOR_ADAPT <= 1)) {
    problems.push('polecon.js: ANCHOR_ADAPT 必须落在 (0, 1]');
  }
  // 回拉比例必须是正数：为 0 时锚会被任意幅度的崩塌拖走（一次性刺激能买永久红利）
  if (!(typeof PC.ANCHOR_REVERT === 'number' && PC.ANCHOR_REVERT > 0 && PC.ANCHOR_REVERT <= 1)) {
    problems.push('polecon.js: ANCHOR_REVERT 必须落在 (0, 1]（0 会让期望锚被任意崩塌拖走）');
  }
  // 拉向目标的两个速率必须落在 (0, 1]：0 → 动荡永不变化（机制变装饰），
  // > 1 → 过冲振荡（数值炸开）。
  for (const k of ['UNREST_PULL_UP', 'UNREST_PULL_DOWN']) {
    if (!(typeof PC[k] === 'number' && PC[k] > 0 && PC[k] <= 1)) {
      problems.push(`polecon.js: ${k} 必须落在 (0, 1]`);
    }
  }
  // 动荡目标必须有正的跨度，否则「严重程度」不改变任何东西
  for (const k of ['UNREST_TARGET_BAD_SPAN', 'UNREST_TARGET_BOP_SPAN']) {
    if (!(typeof PC[k] === 'number' && PC[k] > 0)) problems.push(`polecon.js: ${k} 必须是正数`);
  }
  if (!(typeof PC.RESERVE_GDP_SHARE === 'number' && PC.RESERVE_GDP_SHARE > 0)) {
    problems.push('polecon.js: RESERVE_GDP_SHARE 必须是正数（0 会让小额逆差也算危机）');
  }
  if (!(typeof PC.RESERVE_CRIT_MONTHS === 'number' && typeof PC.RESERVE_WARN_MONTHS === 'number' &&
    PC.RESERVE_CRIT_MONTHS < PC.RESERVE_WARN_MONTHS)) {
    problems.push('polecon.js: 必须 RESERVE_CRIT_MONTHS < RESERVE_WARN_MONTHS');
  }
  notes.push(`polecon: ${Object.keys(ANCHOR).length} anchors, ${Object.keys(BLAME).length} blame rows, `
    + `${fields} blame fields, ${problems.length} problem(s)`);
  return { problems, notes, stats: { anchors: Object.keys(ANCHOR).length, blameFields: fields } };
}

// ---- 2l. bundle hygiene: size budget + generated-record schema ---------------
// The shipped `out/` tree is the product. Two things rot silently there:
//   1. size — every phase adds bytes, and nothing notices until the Pages artifact
//      gets slow to download on a phone;
//   2. generated-record bloat — the province table is produced by the export
//      pipeline, so a field that NOTHING reads (historically `px` and the
//      redundant `id`) can ride along for years: 2998 copies each, ~58 kB of
//      pure dead weight that no test ever sees.
// Both are enforced here so the next export cannot quietly reintroduce them.
const BUNDLE_BUDGET_MIB = 3.2;
// The complete set of fields a province record may carry. Anything else is
// either dead weight or a new field that must be declared (and consumed) on
// purpose — both deserve a build-time decision rather than silent drift.
const PROVINCE_FIELDS = ['polity', 'area_km2', 'cx', 'cy', 'bbox', 'name'];
// A city row is a positional tuple: [name, x, y, pop]. The old 5th element was a
// capital flag nothing read (the capital star is drawn from countries.capital_px),
// i.e. 1856 dead bytes-pairs of the same failure mode as `px`.
const CITY_ARITY = 4;

function dirSizeBytes(dir) {
  const fs = require('fs');
  const path = require('path');
  let total = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    total += st.isDirectory() ? dirSizeBytes(p) : st.size;
  }
  return total;
}

function checkBundleHygiene(ctx) {
  const notes = [];
  const problems = [];
  const fs = require('fs');

  // (1) every shipped province record must stay inside the declared schema
  const PM = ctx.data.W1980_PROVINCES || {};
  const allowed = new Set(PROVINCE_FIELDS);
  const offenders = {};
  for (const pid of Object.keys(PM)) {
    for (const f of Object.keys(PM[pid] || {})) {
      if (!allowed.has(f)) offenders[f] = (offenders[f] || 0) + 1;
    }
  }
  for (const f of Object.keys(offenders)) {
    problems.push(`provinces.js: 字段 "${f}" 出现在 ${offenders[f]} 条记录里，`
      + `但没有任何运行时代码读取它（允许的字段：${PROVINCE_FIELDS.join(', ')}）`);
  }
  for (const f of PROVINCE_FIELDS) {
    let missing = 0;
    for (const pid of Object.keys(PM)) if (!(f in (PM[pid] || {}))) missing++;
    if (missing) problems.push(`provinces.js: ${missing} 条记录缺少字段 "${f}"`);
  }

  // (1b) city rows are positional tuples — an extra element is dead weight
  const CT = ctx.data.W1980_CITIES || [];
  const badW = [];
  for (let i = 0; i < CT.length; i++) {
    if (!Array.isArray(CT[i]) || CT[i].length !== CITY_ARITY) badW.push(i);
  }
  if (badW.length) {
    problems.push(`cities.js: ${badW.length}/${CT.length} 条记录不是 ${CITY_ARITY} 元组`
      + `（[name, x, y, pop]；多出来的元素没有任何代码读取）`);
  }

  // (2) shipped size budget
  if (ctx.outDir && fs.existsSync(ctx.outDir)) {
    const bytes = dirSizeBytes(ctx.outDir);
    const mib = bytes / (1024 * 1024);
    notes.push(`bundle: ${mib.toFixed(3)} MiB (${bytes} bytes), budget ${BUNDLE_BUDGET_MIB} MiB`);
    if (mib > BUNDLE_BUDGET_MIB) {
      problems.push(`out/: ${mib.toFixed(3)} MiB 超出 ${BUNDLE_BUDGET_MIB} MiB 预算`
        + `（多 ${(bytes - BUNDLE_BUDGET_MIB * 1024 * 1024).toFixed(0)} 字节）`);
    }
    return { problems, notes, stats: { bundleBytes: bytes, bundleMib: +mib.toFixed(3) } };
  }
  notes.push('bundle: 跳过体积检查（ctx.outDir 不存在）');
  return { problems, notes };
}

// ---- 2j. agenda condition vocabulary -----------------------------------------
// M3：每个议程的 `condition` 必须是 data/agenda-conditions.js 里登记过的名字，
// 并且带上该门控要求的同伴字段。引擎遇到未登记的名字会 fail-closed（判未通过），
// 这里则让它在构建期就失败 —— 两条路都不允许「门控静默放行」。
function checkAgendaConditions(ctx) {
  const notes = [];
  const problems = [];
  const REG = ctx.data.W1980_AGENDA_CONDITIONS;
  if (!REG || !REG.CONDITIONS) return { problems: ['agenda-conditions.js: 未定义 W1980_AGENDA_CONDITIONS.CONDITIONS'], notes };
  const known = REG.CONDITIONS;
  const AGD = (ctx.data.W1980_AGENDAS || {}).database || {};

  // 词表自身必须自洽：每条都要有 zh 与 fields 数组
  for (const name of Object.keys(known)) {
    const c = known[name] || {};
    if (typeof c.zh !== 'string' || !c.zh) problems.push(`agenda-conditions.js: ${name}.zh 必须是非空字符串`);
    if (!Array.isArray(c.fields)) problems.push(`agenda-conditions.js: ${name}.fields 必须是数组`);
  }

  let sites = 0;
  for (const ck of Object.keys(AGD)) {
    for (const ag of (AGD[ck] || [])) {
      if (ag.condition === undefined || ag.condition === null) continue;
      sites++;
      const def = known[ag.condition];
      if (!def) {
        problems.push(`agendas.js: ${ck}/${ag.id} 使用了未注册的门控 "${ag.condition}"（合法值：${Object.keys(known).join(', ')}）`);
        continue;
      }
      for (const field of (def.fields || [])) {
        if (ag[field] === undefined || ag[field] === null) {
          problems.push(`agendas.js: ${ck}/${ag.id} 的门控 "${ag.condition}" 缺少必需字段 ${field}`);
        }
      }
      if (def.faction) {
        const f = ag.faction;
        if (!f || typeof f !== 'object') {
          problems.push(`agendas.js: ${ck}/${ag.id} 的门控 "domestic_faction" 缺少 faction 声明`);
          continue;
        }
        if (typeof f.key !== 'string' || !f.key) problems.push(`agendas.js: ${ck}/${ag.id}.faction.key 必须是非空字符串`);
        const hasPair = typeof f.lead === 'string' && typeof f.over === 'string';
        const hasField = typeof f.field === 'string' && typeof f.min === 'number';
        if (!hasPair && !hasField) {
          problems.push(`agendas.js: ${ck}/${ag.id}.faction 必须给出 lead+over 或 field+min`);
        }
      }
    }
  }

  // N1：完成回馈 `onComplete` 的字段名同样必须是登记值 —— 拼错就是「回馈静默无效」。
  let onCompleteSites = 0;
  if (typeof REG.isOnCompleteField === 'function') {
    for (const ck of Object.keys(AGD)) {
      for (const ag of (AGD[ck] || [])) {
        if (!ag.onComplete || typeof ag.onComplete !== 'object') continue;
        onCompleteSites++;
        for (const field of Object.keys(ag.onComplete)) {
          if (!REG.isOnCompleteField(field)) {
            problems.push(`agendas.js: ${ck}/${ag.id}.onComplete 使用了未登记的内政字段 "${field}"`);
          }
          const v = ag.onComplete[field];
          if (typeof v !== 'number' || !isFinite(v)) {
            problems.push(`agendas.js: ${ck}/${ag.id}.onComplete.${field} 必须是有限数字`);
          }
        }
      }
    }
  }

  notes.push(`agenda conditions: ${Object.keys(known).length} registered, ${sites} agenda sites, ${onCompleteSites} onComplete sites, ${problems.length} problem(s)`);
  return { problems, notes, stats: { registered: Object.keys(known).length, sites, onCompleteSites } };
}

const CHECKS = [
  { id: 'addressSpaces', label: '双地址空间与联合体别名', run: checkAddressSpaces },
  { id: 'crises', label: '危机抉择卡外键', run: checkCrises },
  { id: 'trade', label: '初始储备覆盖与贸易航线端点', run: checkTrade },
  { id: 'events', label: '事件目标外键', run: checkEvents },
  { id: 'crossroads', label: '十字路口参与者外键', run: checkCrossroads },
  { id: 'keyedDatabases', label: '按国家键控的数据模块外键', run: checkKeyedDatabases },
  { id: 'embargo', label: '巴统管制与咽喉航道', run: checkEmbargo },
  { id: 'integrity', label: '栅格完整性摘要', run: checkIntegrityManifest },
  { id: 'borders', label: '边界折线结构与量程', run: checkBorders },
  { id: 'effectVocabulary', label: '效果词表', run: checkEffectVocabulary },
  { id: 'strategicObjectives', label: 'AI 主动战略目标外键', run: checkStrategicObjectives },
  { id: 'probeRegistry', label: '探针注册表自洽', run: checkProbeRegistry },
  { id: 'polEcon', label: '政治经济学表（经济→政治）', run: checkPolEcon },
  { id: 'bundleHygiene', label: '发布包体积与生成记录字段', run: checkBundleHygiene },
  { id: 'agendaConditions', label: '议程门控词表', run: checkAgendaConditions },
];

module.exports = {
  CHECKS,
  addressSpaceOf,
  // individual exports keep the checks unit-testable in isolation
  checkAddressSpaces,
  checkCrises,
  checkTrade,
  checkEvents,
  checkCrossroads,
  checkKeyedDatabases,
  checkEmbargo,
  checkIntegrityManifest,
  checkBorders,
  checkEffectVocabulary,
  checkStrategicObjectives,
  checkProbeRegistry,
  checkPolEcon,
  checkBundleHygiene,
  PROVINCE_FIELDS,
  CITY_ARITY,
  BUNDLE_BUDGET_MIB,
  probeParamToken,
  checkAgendaConditions,
  collectEffectSites,
};
