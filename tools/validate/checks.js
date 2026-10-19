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
  let objBad = 0, objN = 0;
  for (const k of Object.keys(OBJ)) {
    if (!ctx.resolves(k)) { problems.push(`ai.js: STRATEGIC_OBJECTIVES 属主 "${k}" 不可解析`); objBad++; }
    for (const o of OBJ[k]) {
      objN++;
      if (o.target && !ctx.resolves(o.target)) { problems.push(`ai.js: ${k}/${o.id}.target = "${o.target}" 不可解析`); objBad++; }
      if (o.kind === 'mil' && typeof o.delta !== 'number') { problems.push(`ai.js: ${k}/${o.id} kind=mil 缺 delta`); objBad++; }
    }
  }
  notes.push(`ai strategic objectives: ${objN} entries across ${Object.keys(OBJ).length} countries, ${objBad} bad`);
  return { problems, notes, stats: { objectives: objN, countries: Object.keys(OBJ).length, bad: objBad } };
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
  for (const key of Object.keys(entries)) {
    const e = entries[key] || {};
    if (typeof e.qs !== 'string' || !e.qs) { problems.push(`probes.js: entries.${key}.qs 必须是非空字符串`); continue; }
    if (typeof e.marker !== 'string' || e.marker !== e.marker.toUpperCase()) {
      problems.push(`probes.js: entries.${key}.marker 必须是大写字符串`);
    }
    if (typeof e.budget !== 'number' || !(e.budget > 0)) {
      problems.push(`probes.js: entries.${key}.budget 必须是正数`);
    }
    if (markers[e.marker]) problems.push(`probes.js: marker ${e.marker} 被 ${markers[e.marker]} 与 ${key} 同时使用`);
    markers[e.marker] = key;
    const tok = probeParamToken(e.qs);
    if (claimed[tok]) problems.push(`probes.js: 参数 ${tok} 被 ${claimed[tok]} 与 ${key} 同时占用`);
    claimed[tok] = key;
  }

  const onlyParams = params.filter((p) => !claimed[p]);
  const onlyEntries = Object.keys(claimed).filter((t) => params.indexOf(t) < 0);
  if (onlyParams.length) problems.push(`probes.js: params 里登记但没有对应 entries：${onlyParams.join(', ')}`);
  if (onlyEntries.length) problems.push(`probes.js: entries 用了未登记的参数：${onlyEntries.join(', ')}`);

  notes.push(`probe registry: ${Object.keys(entries).length} probes, ${params.length} url params, ${problems.length} problem(s)`);
  return { problems, notes, stats: { probes: Object.keys(entries).length, params: params.length } };
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
  notes.push(`agenda conditions: ${Object.keys(known).length} registered, ${sites} agenda sites, ${problems.length} problem(s)`);
  return { problems, notes, stats: { registered: Object.keys(known).length, sites } };
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
  probeParamToken,
  checkAgendaConditions,
  collectEffectSites,
};
