'use strict';
/* Build-time data-layer foreign-key validator for world1980.
 *
 * Loads every data/*.js + engine/*.js + app/*.js script into one shared scope
 * (mimicking how the browser loads them as sequential classic scripts), then
 * asserts the cross-module key contracts:
 *
 *   1. entity keys    : every 3-letter key referenced by data modules must be a
 *                       playable entity, a sim member, or a documented federation
 *                       alias (MAP_FED_TARGET).
 *   2. reserves       : INIT_RESERVES must cover every playable entity.
 *   3. route endpoints: BASELINE_ROUTES from/to must resolve.
 *   4. crises/events/agendas/intel/afghan key fields must resolve.
 *   5. borders        : province border endpoints must exist in the province table.
 *
 * Usage: node validate_data.js <out_dir>
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const outDir = process.argv[2] || path.join(__dirname, '..', 'out');

// ---- browser-like shared scope ------------------------------------------------
const sandbox = {
  console, performance, Math, JSON, Date, Object, Array, String, Number, Boolean,
  Error, isFinite, parseInt, parseFloat, RegExp, Set, Map, Uint8Array, Uint16Array,
  Uint32Array, Int16Array, Float64Array, ArrayBuffer, Promise
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.location = { search: '', href: 'http://localhost/', protocol: 'http:' };
sandbox.navigator = { userAgent: 'node' };
const fakeEl = () => ({
  style: {}, dataset: {}, children: [],
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, removeChild() {}, remove() {}, addEventListener() {},
  set textContent(v) {}, get textContent() { return ''; }, innerHTML: '', value: '', onclick: null
});
sandbox.document = {
  createElement: fakeEl, querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, addEventListener() {}, body: fakeEl()
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.cancelAnimationFrame = () => {};
sandbox.URLSearchParams = class {
  constructor() {} has() { return false; } get() { return null; } getAll() { return []; }
};
sandbox.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  get length() { return Object.keys(this._d).length; },
  key(i) { return Object.keys(this._d)[i]; }
};

const ctx = vm.createContext(sandbox);
const idx = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const tags = [...idx.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);
const note = (m) => notes.push(m);

// data/engine/app scripts only (app/* boot dispatch needs a live page, so we
// stop after the data layer + engine, which is what we validate)
const want = tags.filter(t => t.startsWith('data/') || t.startsWith('engine/'));
for (const rel of want) {
  const src = fs.readFileSync(path.join(outDir, rel), 'utf8');
  try { vm.runInContext(src, ctx, { filename: rel }); }
  catch (e) { fail(`LOAD ${rel}: ${e.message}`); }
}
if (problems.length) {
  console.log('FAIL: script load errors');
  problems.forEach(p => console.log('  ' + p));
  process.exit(1);
}
note(`loaded ${want.length} data/engine scripts`);

// ---- 1. the two address spaces ------------------------------------------------
const CM = sandbox.W1980_COUNTRIES, PM = sandbox.W1980_PROVINCES, SD = sandbox.W1980_SIMDATA;
if (!CM || !CM.countries) { console.log('FAIL: no W1980_COUNTRIES'); process.exit(1); }
const entities = Object.keys(CM.countries);
const members = new Set(Object.keys(SD && SD.popStart || {}));
const MAP_FED_TARGET = { ARG: 'LAP', KWT: 'ARA' }; // mirrored from 03-decisions.js
const resolves = (k) => entities.includes(k) || members.has(k) || !!MAP_FED_TARGET[k];
note(`entities=${entities.length} members=${members.size}`);
note(`entities without own sim row: ${entities.filter(k => !members.has(k)).join(',') || '(none)'}`);

// ---- 2. hard checks -----------------------------------------------------------
// 2a. crises
const CRISES = sandbox.W1980_CRISES;
if (CRISES && CRISES.list) {
  let bad = 0;
  for (const c of CRISES.list) {
    for (const fld of ['target', 'initiator']) {
      if (c[fld] && !resolves(c[fld])) { fail(`crises.js: ${c.id}.${fld} = "${c[fld]}" 不可解析`); bad++; }
    }
    for (const k of (c.actors || [])) {
      if (!resolves(k)) { fail(`crises.js: ${c.id}.actors 含 "${k}"`); bad++; }
    }
  }
  note(`crises: ${CRISES.list.length} entries, ${bad} unresolvable keys`);
} else fail('crises.js: no W1980_CRISES.list');

// 2b. reserves coverage + routes
const TRADE = sandbox.W1980_TRADE;
if (TRADE && TRADE.INIT_RESERVES) {
  const IR = TRADE.INIT_RESERVES;
  const missing = entities.filter(k => IR[k] === undefined);
  note(`INIT_RESERVES covers ${Object.keys(IR).length}/${entities.length} entities`);
  if (missing.length) fail(`INIT_RESERVES 缺 ${missing.length}/${entities.length}: ${missing.join(',')}`);
  for (const k of Object.keys(IR)) if (!entities.includes(k)) fail(`INIT_RESERVES 含未知实体 "${k}"`);
  if (TRADE.BASELINE_ROUTES) {
    let bad = 0;
    for (const r of TRADE.BASELINE_ROUTES) {
      for (const f of ['from', 'to']) {
        if (r[f] && !resolves(r[f])) { fail(`trade.js: ${r.id}.${f} = "${r[f]}" 不可解析`); bad++; }
      }
    }
    note(`BASELINE_ROUTES: ${TRADE.BASELINE_ROUTES.length} routes, ${bad} unresolvable endpoints`);
  }
} else fail('trade.js: no W1980_TRADE.INIT_RESERVES');

// 2c. events / crossroads / agendas / intel / afghan / embargo
// note: events.js / cr.js / intel.js export top-level arrays; others export objects.
const EV = sandbox.W1980_EVENTS;
if (Array.isArray(EV)) {
  let bad = 0;
  for (const e of EV) {
    for (const k of (e.targets || [])) {
      if (!resolves(k)) { fail(`events.js: ${e.id}.targets 含 "${k}"`); bad++; }
    }
  }
  note(`events: ${EV.length} entries, ${bad} unresolvable targets`);
} else fail('events.js: W1980_EVENTS 不是数组');

const CRX = sandbox.W1980_CROSSROADS;
if (Array.isArray(CRX)) {
  let bad = 0;
  for (const c of CRX) {
    for (const k of (c.actors || [])) if (!resolves(k)) { fail(`cr.js: ${c.id}.actors 含 "${k}"`); bad++; }
  }
  note(`cr: ${CRX.length} entries, ${bad} unresolvable actors`);
} else fail('cr.js: W1980_CROSSROADS 不是数组');

function checkKeyList(label, arr, field) {
  let bad = 0;
  for (const it of (arr || [])) {
    if (it && it[field] && !resolves(it[field])) { fail(`${label}: ${it.id || '?'}.${field} = "${it[field]}"`); bad++; }
  }
  note(`${label}: ${(arr || []).length} entries, ${bad} unresolvable "${field}"`);
}
const AG = sandbox.W1980_AGENDAS, IN = sandbox.W1980_INTEL, AF = sandbox.W1980_AFGHAN,
  AI = sandbox.W1980_AI, RES = sandbox.W1980_RESOURCES, EMB = sandbox.W1980_EMBARGO;
if (AG && AG.database) {
  const keys = Object.keys(AG.database).filter(k => k !== 'DEFAULT');
  const bad = keys.filter(k => !resolves(k));
  note(`agendas.database: ${Object.keys(AG.database).length} countries, ${bad.length} unresolvable`);
  bad.forEach(k => fail(`agendas.js: database 含 "${k}"`));
}
if (IN && IN.AGENCIES) {
  const keys = Object.keys(IN.AGENCIES).filter(k => k !== 'DEFAULT');
  const bad = keys.filter(k => !resolves(k));
  note(`intel.AGENCIES: ${Object.keys(IN.AGENCIES).length} entries, ${bad.length} unresolvable`);
  bad.forEach(k => fail(`intel.js: AGENCIES 含 "${k}"`));
}
// afghan.POLICIES is keyed by strategy id, not by country - skip (vocabulary, not FK)
if (AF && AF.POLICIES) note(`afghan.POLICIES: ${Object.keys(AF.POLICIES).length} strategies (id-keyed, not a country FK)`);
if (AI && AI.AI_DOCTRINES) {
  const bad = Object.keys(AI.AI_DOCTRINES).filter(k => !resolves(k));
  note(`ai.AI_DOCTRINES: ${Object.keys(AI.AI_DOCTRINES).length} entries, ${bad.length} unresolvable`);
  bad.forEach(k => fail(`ai.js: AI_DOCTRINES 含 "${k}"`));
}
if (RES && RES.countries) {
  const keys = Object.keys(RES.countries);
  const bad = keys.filter(k => !resolves(k));
  note(`resources.countries: ${keys.length} entries, ${bad.length} unresolvable`);
  bad.forEach(k => fail(`resources.js: countries 含 "${k}"`));
}
if (EMB && EMB.COMCOM) {
  const bad = Object.keys(EMB.COMCOM).filter(k => !resolves(k));
  note(`embargo.COMCOM: ${Object.keys(EMB.COMCOM).length} entries, ${bad.length} unresolvable`);
  bad.forEach(k => fail(`embargo.js: COMCOM 含 "${k}"`));
}

// 2d. borders（D：两个巨型边界数据已改为 JSON 按需加载，校验改为直接读 JSON）
// 注意：数据是「delta-int16 折线数组」——每条折线是一串 int16 增量（decodeVB 解码为
// 浮点点列），端点并不是 province id，因此只做结构与量程校验，不做 FK 校验。
const pset = new Set(Object.keys(PM || {}).map(Number));
note(`provinces: ${pset.size} ids`);
for (const [json, label] of [["data/borders_province.json", "borders_province"],
  ["data/borders_country.json", "borders_country"]]) {
  const f = path.join(outDir, json);
  if (!fs.existsSync(f)) { fail(`${label}: 缺少 ${json}`); continue; }
  let arr = null;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { fail(`${label}: ${json} JSON 解析失败：${e.message}`); continue; }
  if (!Array.isArray(arr)) { fail(`${label}: ${json} 不是数组`); continue; }
  let bad = 0, pts = 0;
  for (const p of arr) {
    if (!Array.isArray(p) || p.length < 4 || p.length % 2 !== 0) { if (bad < 5) fail(`${label}: 折线长度非法（${p && p.length}）`); bad++; continue; }
    for (const v of p) {
      if (typeof v !== "number" || !isFinite(v) || Math.abs(v) > 32767) { if (bad < 5) fail(`${label}: 增量值越界 ${v}`); bad++; break; }
    }
    pts += p.length / 2;
  }
  note(`${label}: ${arr.length} polylines, ${pts} points, ${bad} malformed`);
}

// 2e. 事件效果统一词表（D：W1980_EFFECTS 为单一事实源）
const EFF = sandbox.W1980_EFFECTS;
if (EFF && EFF.EFFECTS) {
  note(`effect vocabulary: ${Object.keys(EFF.EFFECTS).length} keys (crisis=${EFF.keysOf('crisis').length}, agenda=${EFF.keysOf('agenda').length}, ai=${EFF.keysOf('ai').length})`);
  let bad = 0;
  const check = (label, effects) => {
    const unk = EFF.unknownKeys(effects);
    if (unk.length) { fail(`${label}: 未登记效果键 ${unk.join(', ')}`); bad += unk.length; }
  };
  // crises
  for (const c of ((sandbox.W1980_CRISES || {}).list || [])) {
    for (const o of (c.options || [])) check(`crises.js: ${c.id} tier${o.tier}`, o.effects);
  }
  // agendas
  const AGD = (sandbox.W1980_AGENDAS || {}).database || {};
  for (const ck of Object.keys(AGD)) {
    for (const a of (AGD[ck] || [])) check(`agendas.js: ${ck}/${a.id}`, a.effects);
  }
  // ai doctrine reactions
  const DOCS = (sandbox.W1980_AI || {}).AI_DOCTRINES || {};
  const walkAi = (o, label) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach((v, i) => walkAi(v, label + "[" + i + "]")); return; }
    if (o.effects && typeof o.effects === "object") check(label, o.effects);
    for (const k of Object.keys(o)) walkAi(o[k], label + "." + k);
  };
  walkAi(DOCS, "ai.AI_DOCTRINES");
  note(`effect vocabulary violations: ${bad}`);
} else fail('effects.js: no W1980_EFFECTS.EFFECTS');

// ---- report -------------------------------------------------------------------
notes.forEach(n => console.log('  · ' + n));
if (problems.length) {
  console.log(`\nFAIL: ${problems.length} problem(s)`);
  problems.forEach(p => console.log('  x ' + p));
  process.exit(1);
}
console.log('\nOK: data layer validated');
