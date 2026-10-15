'use strict';
/* Unit tests for the world1980 data-layer validator (Phase I).
 *
 * The point of splitting tools/validate_data.js into tools/validate/* is that
 * each check class can be exercised against a synthetic fixture, without a
 * browser, an out/ directory or a DOM. A check that cannot be made to fail is
 * not a check — that is exactly how the embargo contract sat dead for months
 * behind a `COMCOM`/`COCOM` typo. Every check below is therefore asserted both
 * ways: clean fixture -> no problems, deliberately broken fixture -> a problem.
 *
 * Usage: node tools/validate.test.js
 * Exit codes: 0 = all tests passed, 1 = at least one failure.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const checks = require('./validate/checks');
const { validate } = require('./validate');
const report = require('./validate/report');

// ---- tiny test runner ---------------------------------------------------------
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failures.push({ name, error: e }); console.log('  FAIL ' + name + '\n         ' + e.message); }
}
function section(t) { console.log('\n' + t); }

// ---- fixture helpers ----------------------------------------------------------
function makeCtx(data, opts) {
  const o = opts || {};
  const entities = o.entities || ['AAA', 'BBB', 'CCC'];
  const members = new Set(o.members || ['AAA', 'BBB', 'CCC', 'MMM']);
  const MAP_FED_TARGET = o.MAP_FED_TARGET || { ALI: 'CCC' };
  const resolves = (k) => entities.indexOf(k) >= 0 || members.has(k) || !!MAP_FED_TARGET[k];
  return { data, entities, members, MAP_FED_TARGET, resolves, outDir: o.outDir || __dirname };
}

/** A minimal, fully-clean data bag. Individual tests break one thing at a time. */
function cleanData() {
  return {
    W1980_COUNTRIES: {
      countries: {
        AAA: { key: 'AAA' },
        BBB: { key: 'BBB', members: [{ key: 'MMM', polity_id: 9 }] },
        CCC: { key: 'CCC' },
      },
      byPlayableId: { 1: 'AAA', 2: 'BBB', 3: 'CCC' },
    },
    W1980_PROVINCES: { 1: { id: 1, polity: 'AAA' }, 2: { id: 2, polity: 'BBB' }, 3: { id: 3, polity: 'MMM' } },
    W1980_CRISES: { list: [{ id: 'c1', target: 'AAA', initiator: 'BBB', actors: ['CCC', 'MMM'], options: [{ tier: 1, effects: { tensionDelta: 5 } }] }] },
    W1980_TRADE: {
      INIT_RESERVES: { AAA: 1, BBB: 2, CCC: 3 },
      BASELINE_ROUTES: [{ id: 'r1', from: 'AAA', to: 'BBB' }, { id: 'r2', from: 'CCC', to: 'ALI' }],
    },
    W1980_EVENTS: [{ id: 'e1', targets: ['AAA', 'MMM'] }],
    W1980_CROSSROADS: [{ id: 'x1', actors: ['BBB', 'CCC'] }],
    W1980_AGENDAS: { database: { AAA: [{ id: 'a1', effects: { gdpBonus: 0.3, desc: 'x' } }], DEFAULT: [] } },
    W1980_INTEL: { AGENCIES: { BBB: { name: 'b' }, DEFAULT: null } },
    W1980_AFGHAN: { POLICIES: { p1: {} } },
    W1980_AI: {
      AI_DOCTRINES: { AAA: { baseMil: 2, reactions: [{ effects: { ceasefire: true } }] } },
      STRATEGIC_OBJECTIVES: { CCC: [{ id: 'o1', kind: 'mil', delta: 0.5, target: 'BBB' }] },
    },
    W1980_RESOURCES: { meta: { oil: {}, tech: {} }, countries: { AAA: {}, BBB: {} } },
    W1980_EMBARGO: {
      COCOM: { defaultActive: true, restrictedRes: ['tech'], sourceBlocs: ['NATO'], targetBlocs: ['WP'], smuggleMultiplier: 1.5 },
      CHOKEPOINTS: { cp: { id: 'cp', defaultState: 'open', states: { open: { factor: 1, costFactor: 1 } }, affectedRoutes: ['r1'] } },
    },
    W1980_EFFECTS: {
      EFFECTS: {
        tensionDelta: { group: 'crisis' }, gdpBonus: { group: 'agenda' }, desc: { group: 'agenda' }, ceasefire: { group: 'ai' },
      },
      keysOf: (g) => Object.keys(cleanData().W1980_EFFECTS.EFFECTS)
        .filter((k) => !g || cleanData().W1980_EFFECTS.EFFECTS[k].group === g),
      unknownKeys: (eff) => (eff && typeof eff === 'object')
        ? Object.keys(eff).filter((k) => !(k in cleanData().W1980_EFFECTS.EFFECTS)) : [],
    },
    W1980_ASSETS: { LEADERS: { AAA: [{ name: 'a' }] } },
  };
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- 1. address spaces --------------------------------------------------------
section('checkAddressSpaces');
test('clean fixture reports no problems', () => {
  const r = checks.checkAddressSpaces(makeCtx(cleanData()));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.notes.some((n) => n.startsWith('entities=')));
});
test('a federation alias pointing at a non-entity is a problem', () => {
  const ctx = makeCtx(cleanData(), { MAP_FED_TARGET: { ALI: 'NOPE' } });
  const r = checks.checkAddressSpaces(ctx);
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /MAP_FED_TARGET/);
});

// ---- 2. crises ---------------------------------------------------------------
section('checkCrises');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkCrises(makeCtx(cleanData())).problems, []);
});
test('an unresolvable crisis target is caught', () => {
  const d = cleanData(); d.W1980_CRISES.list[0].target = 'ZZZ';
  const r = checks.checkCrises(makeCtx(d));
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /c1\.target = "ZZZ"/);
});
test('an unresolvable actor is caught', () => {
  const d = cleanData(); d.W1980_CRISES.list[0].actors = ['AAA', 'ZZZ'];
  assert.match(checks.checkCrises(makeCtx(d)).problems[0], /actors 含 "ZZZ"/);
});
test('a missing W1980_CRISES.list is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_CRISES;
  assert.match(checks.checkCrises(makeCtx(d)).problems[0], /no W1980_CRISES\.list/);
});

// ---- 3. trade / reserves ------------------------------------------------------
section('checkTrade');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkTrade(makeCtx(cleanData())).problems, []);
});
test('an entity missing from INIT_RESERVES is caught', () => {
  const d = cleanData(); delete d.W1980_TRADE.INIT_RESERVES.CCC;
  const r = checks.checkTrade(makeCtx(d));
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /INIT_RESERVES 缺 1\/3: CCC/);
});
test('an INIT_RESERVES key that is not an entity is caught', () => {
  const d = cleanData(); d.W1980_TRADE.INIT_RESERVES.ZZZ = 9;
  assert.match(checks.checkTrade(makeCtx(d)).problems[0], /含未知实体 "ZZZ"/);
});
test('an unresolvable route endpoint is caught', () => {
  const d = cleanData(); d.W1980_TRADE.BASELINE_ROUTES[0].to = 'ZZZ';
  assert.match(checks.checkTrade(makeCtx(d)).problems[0], /r1\.to = "ZZZ"/);
});

// ---- 4. events / crossroads ---------------------------------------------------
section('checkEvents / checkCrossroads');
test('clean fixtures report no problems', () => {
  const ctx = makeCtx(cleanData());
  assert.deepStrictEqual(checks.checkEvents(ctx).problems, []);
  assert.deepStrictEqual(checks.checkCrossroads(ctx).problems, []);
});
test('an unresolvable event target is caught', () => {
  const d = cleanData(); d.W1980_EVENTS[0].targets = ['ZZZ'];
  assert.match(checks.checkEvents(makeCtx(d)).problems[0], /e1\.targets 含 "ZZZ"/);
});
test('an unresolvable crossroads actor is caught', () => {
  const d = cleanData(); d.W1980_CROSSROADS[0].actors = ['ZZZ'];
  assert.match(checks.checkCrossroads(makeCtx(d)).problems[0], /x1\.actors 含 "ZZZ"/);
});
test('a non-array W1980_EVENTS is reported', () => {
  const d = cleanData(); d.W1980_EVENTS = { nope: 1 };
  assert.match(checks.checkEvents(makeCtx(d)).problems[0], /不是数组/);
});

// ---- 5. keyed databases -------------------------------------------------------
section('checkKeyedDatabases');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkKeyedDatabases(makeCtx(cleanData())).problems, []);
});
test('the DEFAULT entry is exempt from the foreign-key check', () => {
  const d = cleanData();
  d.W1980_AGENDAS.database.DEFAULT = [{ id: 'd' }];
  d.W1980_INTEL.AGENCIES.DEFAULT = { name: 'd' };
  assert.deepStrictEqual(checks.checkKeyedDatabases(makeCtx(d)).problems, []);
});
test('a bogus agendas.database key is caught', () => {
  const d = cleanData(); d.W1980_AGENDAS.database.ZZZ = [];
  assert.match(checks.checkKeyedDatabases(makeCtx(d)).problems[0], /agendas\.database 含 "ZZZ"/);
});
test('a bogus intel.AGENCIES key is caught', () => {
  const d = cleanData(); d.W1980_INTEL.AGENCIES.ZZZ = {};
  assert.match(checks.checkKeyedDatabases(makeCtx(d)).problems[0], /intel\.AGENCIES 含 "ZZZ"/);
});
test('a bogus ai.AI_DOCTRINES key is caught', () => {
  const d = cleanData(); d.W1980_AI.AI_DOCTRINES.ZZZ = {};
  assert.match(checks.checkKeyedDatabases(makeCtx(d)).problems[0], /ai\.AI_DOCTRINES 含 "ZZZ"/);
});
test('a bogus resources.countries key is caught', () => {
  const d = cleanData(); d.W1980_RESOURCES.countries.ZZZ = {};
  assert.match(checks.checkKeyedDatabases(makeCtx(d)).problems[0], /resources\.countries 含 "ZZZ"/);
});

// ---- 6. embargo / chokepoints -------------------------------------------------
// This check used to read `EMB.COMCOM` while the data key is `COCOM`, so it never
// ran. These tests are what keeps it alive.
section('checkEmbargo (regression: was dead code behind a COMCOM/COCOM typo)');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkEmbargo(makeCtx(cleanData())).problems, []);
});
test('an unknown CoCom source bloc is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.COCOM.sourceBlocs = ['NATO', 'NOPE'];
  const r = checks.checkEmbargo(makeCtx(d));
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /COCOM\.sourceBlocs 含未知阵营 "NOPE"/);
});
test('an unknown CoCom target bloc is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.COCOM.targetBlocs = ['WP', 'NOPE'];
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /COCOM\.targetBlocs 含未知阵营 "NOPE"/);
});
test('a restricted resource outside the resource vocabulary is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.COCOM.restrictedRes = ['plutonium'];
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /restrictedRes 含未知资源 "plutonium"/);
});
test('a chokepoint affectedRoute that is not a real route id is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.CHOKEPOINTS.cp.affectedRoutes = ['r1', 'tr_ghost'];
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /含未知航线 "tr_ghost"/);
});
test('a chokepoint defaultState outside its own states is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.CHOKEPOINTS.cp.defaultState = 'sunk';
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /defaultState = "sunk"/);
});
test('a chokepoint state missing numeric factors is caught', () => {
  const d = cleanData(); d.W1980_EMBARGO.CHOKEPOINTS.cp.states.open = { name: 'x' };
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /缺数值 factor\/costFactor/);
});
test('a missing W1980_EMBARGO.COCOM is reported, not thrown', () => {
  const d = cleanData(); d.W1980_EMBARGO = {};
  assert.match(checks.checkEmbargo(makeCtx(d)).problems[0], /no W1980_EMBARGO\.COCOM/);
});

// ---- 7. effect vocabulary -----------------------------------------------------
section('checkEffectVocabulary (regression: a typo must fail the build)');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkEffectVocabulary(makeCtx(cleanData())).problems, []);
});
test('a misspelled effect key in a crisis option fails the build', () => {
  const d = cleanData(); d.W1980_CRISES.list[0].options[0].effects = { tensionDelata: 5 };
  const r = checks.checkEffectVocabulary(makeCtx(d));
  assert.strictEqual(r.problems.length, 1);
  assert.match(r.problems[0], /crises\.js: c1 tier1: 未登记效果键 tensionDelata/);
  assert.strictEqual(r.stats.violations, 1);
});
test('a misspelled effect key in an agenda fails the build', () => {
  const d = cleanData(); d.W1980_AGENDAS.database.AAA[0].effects = { gdpBonux: 0.3 };
  assert.match(checks.checkEffectVocabulary(makeCtx(d)).problems[0], /agendas\.js: AAA\/a1/);
});
test('a misspelled effect key nested in an AI doctrine reaction fails the build', () => {
  const d = cleanData(); d.W1980_AI.AI_DOCTRINES.AAA.reactions[0].effects = { ceasefier: true };
  assert.match(checks.checkEffectVocabulary(makeCtx(d)).problems[0], /ai\.AI_DOCTRINES\.AAA\.reactions\[0\]/);
});
test('collectEffectSites finds every declared effects object', () => {
  const sites = checks.collectEffectSites(makeCtx(cleanData()));
  assert.strictEqual(sites.length, 3); // 1 crisis option + 1 agenda + 1 doctrine reaction
});
test('collectEffectSites also scans UNSC_RESOLUTIONS (the real ai-side source)', () => {
  const d = cleanData();
  d.W1980_AI.UNSC_RESOLUTIONS = { res_x: { effects: { ceasefire: true } } };
  const sites = checks.collectEffectSites(makeCtx(d));
  assert.ok(sites.some((s) => s.label === 'ai.js: UNSC_RESOLUTIONS.res_x'));
});
test('a misspelled key inside a UNSC resolution fails the build', () => {
  const d = cleanData();
  d.W1980_AI.UNSC_RESOLUTIONS = { res_x: { effects: { ceasefier: true } } };
  const r = checks.checkEffectVocabulary(makeCtx(d));
  assert.match(r.problems[0], /UNSC_RESOLUTIONS\.res_x: 未登记效果键 ceasefier/);
});
test('a missing W1980_EFFECTS is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_EFFECTS;
  assert.match(checks.checkEffectVocabulary(makeCtx(d)).problems[0], /no W1980_EFFECTS\.EFFECTS/);
});

// ---- 7b. the runtime side of the double safety --------------------------------
// The same vocabulary must also police itself inside the browser, because the
// build-time scan only runs when someone runs CI. `auditData()` covers every
// declared site — including branches a given playthrough never reaches.
section('runtime effect-vocabulary double safety (data/effects.js)');

const OUT = path.join(__dirname, '..', 'out');

/** Load data/effects.js (+ optionally other data modules) in a fresh VM realm. */
function loadVocabRuntime(extraScripts, consoleImpl) {
  const sandbox = {
    console: consoleImpl || { error() {}, warn() {}, log() {} },
    Math, JSON, Object, Array, String, Number, Boolean, Error, Set, Map, RegExp, isFinite,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const files = ['effects.js'].concat(extraScripts || []);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(OUT, 'data', f), 'utf8'), ctx, { filename: f });
  return sandbox;
}

test('the runtime vocabulary module exposes the double-safety API', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const sb = loadVocabRuntime();
  const E = sb.W1980_EFFECTS;
  for (const fn of ['report', 'auditData', 'setStrict', 'isStrict', 'isClean', 'resetViolations', 'unknownKeys']) {
    assert.strictEqual(typeof E[fn], 'function', 'missing W1980_EFFECTS.' + fn);
  }
  assert.ok(Array.isArray(E.violations));
});
test('report() records a misspelled key and returns it', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const E = loadVocabRuntime().W1980_EFFECTS;
  const unk = E.report('unit-test site', { tensionDelata: 5 });
  assert.deepStrictEqual(unk, ['tensionDelata']);
  assert.strictEqual(E.violations.length, 1);
  assert.strictEqual(E.violations[0].label, 'unit-test site');
  assert.strictEqual(E.isClean(), false);
});
test('report() is idempotent per site so monthly consumers cannot spam the registry', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const E = loadVocabRuntime().W1980_EFFECTS;
  E.report('agenda AAA/a1', { gdpBonux: 1 });
  E.report('agenda AAA/a1', { gdpBonux: 1 });
  E.report('agenda AAA/a1', { gdpBonux: 1 });
  assert.strictEqual(E.violations.length, 1);
  // a different site with the same typo is still recorded separately
  E.report('agenda BBB/b1', { gdpBonux: 1 });
  assert.strictEqual(E.violations.length, 2);
});
test('a clean effects object records nothing', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const E = loadVocabRuntime().W1980_EFFECTS;
  assert.deepStrictEqual(E.report('clean', { ceasefire: true, economicRelief: 0.2 }), []);
  assert.strictEqual(E.isClean(), true);
});
test('setStrict(true) surfaces the typo on the console, setStrict(false) stays quiet', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const logged = [];
  const sb = loadVocabRuntime(null, { error: (m) => logged.push(m), warn() {}, log() {} });
  const E = sb.W1980_EFFECTS;
  E.report('quiet site', { bogus: 1 });
  assert.strictEqual(logged.length, 0, 'must stay quiet outside dev/probe mode');
  E.setStrict(true);
  assert.strictEqual(E.isStrict(), true);
  E.report('loud site', { bogus: 2 });
  assert.strictEqual(logged.length, 1);
  assert.match(logged[0], /未登记效果键 @ loud site：bogus/);
});
test('resetViolations() clears the registry', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const E = loadVocabRuntime().W1980_EFFECTS;
  E.report('x', { bogus: 1 });
  assert.strictEqual(E.isClean(), false);
  E.resetViolations();
  assert.strictEqual(E.isClean(), true);
  // and the dedupe memory is cleared too, so the same site is reported again
  E.report('x', { bogus: 1 });
  assert.strictEqual(E.violations.length, 1);
});
test('auditData() finds every real site and reports zero violations', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const sb = loadVocabRuntime(['crises.js', 'agendas.js', 'ai.js']);
  const E = sb.W1980_EFFECTS;
  const res = E.auditData();
  assert.ok(res.sites > 20, 'expected the real data to declare many effect sites, got ' + res.sites);
  assert.strictEqual(res.keys, 0, 'real data has unregistered effect keys: ' + JSON.stringify(E.violations));
  assert.strictEqual(res.violations, 0);
});
test('INJECTION: a misspelled key in real data makes auditData() fail', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const sb = loadVocabRuntime(['crises.js', 'agendas.js', 'ai.js']);
  // inject the exact defect the vocabulary exists to catch
  sb.W1980_AGENDAS.database.CHN[0].effects.gdpBonux = 0.35;
  delete sb.W1980_AGENDAS.database.CHN[0].effects.gdpBonus;
  const res = sb.W1980_EFFECTS.auditData();
  assert.ok(res.violations >= 1, 'auditData must catch the injected typo');
  assert.ok(res.keys >= 1);
  assert.ok(sb.W1980_EFFECTS.violations.some((v) => v.keys.indexOf('gdpBonux') >= 0));
});
test('INJECTION: a misspelled key in a UNSC resolution makes auditData() fail', () => {
  if (!fs.existsSync(path.join(OUT, 'data', 'effects.js'))) return;
  const sb = loadVocabRuntime(['crises.js', 'agendas.js', 'ai.js']);
  sb.W1980_AI.UNSC_RESOLUTIONS.res_598.effects.ceasefier = true;
  const res = sb.W1980_EFFECTS.auditData();
  assert.ok(res.violations >= 1);
  assert.ok(sb.W1980_EFFECTS.violations.some((v) => v.label.indexOf('res_598') >= 0));
});

// ---- 8. strategic objectives --------------------------------------------------
section('checkStrategicObjectives');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkStrategicObjectives(makeCtx(cleanData())).problems, []);
});
test('an unresolvable objective owner is caught', () => {
  const d = cleanData(); d.W1980_AI.STRATEGIC_OBJECTIVES.ZZZ = [{ id: 'o', kind: 'mil', delta: 1 }];
  assert.match(checks.checkStrategicObjectives(makeCtx(d)).problems[0], /属主 "ZZZ"/);
});
test('an unresolvable objective target is caught', () => {
  const d = cleanData(); d.W1980_AI.STRATEGIC_OBJECTIVES.CCC[0].target = 'ZZZ';
  assert.match(checks.checkStrategicObjectives(makeCtx(d)).problems[0], /o1\.target = "ZZZ"/);
});
test('a mil objective without a numeric delta is caught', () => {
  const d = cleanData(); delete d.W1980_AI.STRATEGIC_OBJECTIVES.CCC[0].delta;
  assert.match(checks.checkStrategicObjectives(makeCtx(d)).problems[0], /kind=mil 缺 delta/);
});

// ---- 8b. raster integrity manifest --------------------------------------------
// checksum.json carries a sha256 of the province raster that nothing verified,
// which is how it silently went stale. These tests keep it honest.
section('checkIntegrityManifest');
function tmpIntegrityDir(pngBytes, manifestHash, memoryHash) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w1980int-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'province_id.png'), pngBytes);
  fs.writeFileSync(path.join(dir, 'data', 'checksum.json'), JSON.stringify({ sha256_province_id_png: manifestHash }));
  return dir;
}
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
test('a matching manifest passes', () => {
  const png = Buffer.from('not-a-real-png-but-hashable');
  const h = sha(png);
  const d = cleanData(); d.W1980_COUNTRIES.checksum = { sha256_province_id_png: h };
  const r = checks.checkIntegrityManifest(makeCtx(d, { outDir: tmpIntegrityDir(png, h, h) }));
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.stats.matched, true);
});
test('a stale manifest hash is caught', () => {
  const png = Buffer.from('shipped-bytes');
  const stale = 'a'.repeat(64);
  // both copies agree with each other, but neither matches the shipped bytes
  const d = cleanData(); d.W1980_COUNTRIES.checksum = { sha256_province_id_png: stale };
  const r = checks.checkIntegrityManifest(makeCtx(d, { outDir: tmpIntegrityDir(png, stale, '') }));
  assert.ok(r.problems.some((p) => /sha256 与清单不符/.test(p)), JSON.stringify(r.problems));
});
test('a disagreement between checksum.json and the in-memory copy is caught', () => {
  const png = Buffer.from('x');
  const d = cleanData(); d.W1980_COUNTRIES.checksum = { sha256_province_id_png: sha(png) };
  const r = checks.checkIntegrityManifest(makeCtx(d, { outDir: tmpIntegrityDir(png, 'b'.repeat(64), '') }));
  assert.ok(r.problems.some((p) => /摘要不一致/.test(p)), JSON.stringify(r.problems));
});
test('a missing raster or manifest is reported, not thrown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w1980int-'));
  const r = checks.checkIntegrityManifest(makeCtx(cleanData(), { outDir: dir }));
  assert.strictEqual(r.problems.length, 2);
});

// ---- 9. borders (file-based) --------------------------------------------------
section('checkBorders');
function tmpBorderDir(province, country) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w1980val-'));
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'borders_province.json'), JSON.stringify(province));
  fs.writeFileSync(path.join(dir, 'data', 'borders_country.json'), JSON.stringify(country));
  return dir;
}
test('a well-formed delta-int16 polyline passes', () => {
  const dir = tmpBorderDir([[0, 0, 10, 10], [5, -5, 3, 3]], [[1, 1, 2, 2]]);
  const r = checks.checkBorders(makeCtx(cleanData(), { outDir: dir }));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.notes.some((n) => /borders_province: 2 polylines, 4 points, 0 malformed/.test(n)));
});
test('an odd-length polyline is caught', () => {
  const dir = tmpBorderDir([[0, 0, 10]], [[1, 1, 2, 2]]);
  assert.match(checks.checkBorders(makeCtx(cleanData(), { outDir: dir })).problems[0], /折线长度非法/);
});
test('an out-of-int16-range delta is caught', () => {
  const dir = tmpBorderDir([[0, 0, 40000, 1]], [[1, 1, 2, 2]]);
  assert.match(checks.checkBorders(makeCtx(cleanData(), { outDir: dir })).problems[0], /增量值越界/);
});
test('a missing border file is caught', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w1980val-'));
  const r = checks.checkBorders(makeCtx(cleanData(), { outDir: dir }));
  assert.strictEqual(r.problems.length, 2);
  assert.match(r.problems[0], /缺少 data\/borders_province\.json/);
});
test('malformed JSON is caught', () => {
  const dir = tmpBorderDir([], []);
  fs.writeFileSync(path.join(dir, 'data', 'borders_province.json'), '{not json');
  assert.match(checks.checkBorders(makeCtx(cleanData(), { outDir: dir })).problems[0], /JSON 解析失败/);
});

// ---- 10. coverage matrix ------------------------------------------------------
section('coverage matrix');
test('every entity gets a row and every province resolves to one', () => {
  const m = report.buildCoverageMatrix(makeCtx(cleanData()));
  assert.strictEqual(m.rows.length, 3);
  assert.deepStrictEqual(m.unknownPolity, []);
  const aaa = m.rows.find((r) => r.key === 'AAA');
  assert.strictEqual(aaa.cells.find((c) => c.id === 'prov').display, '1');
  // MMM is a member of BBB, so its province counts towards BBB
  const bbb = m.rows.find((r) => r.key === 'BBB');
  assert.strictEqual(bbb.cells.find((c) => c.id === 'prov').display, '2');
});
test('a province whose polity belongs to nobody is surfaced, not dropped', () => {
  const d = cleanData(); d.W1980_PROVINCES[4] = { id: 4, polity: 'ORPHAN' };
  const m = report.buildCoverageMatrix(makeCtx(d));
  assert.deepStrictEqual(m.unknownPolity, ['ORPHAN']);
});
test('a required surface gap is reported as a gap', () => {
  const d = cleanData(); delete d.W1980_TRADE.INIT_RESERVES.CCC;
  const m = report.buildCoverageMatrix(makeCtx(d));
  assert.ok(m.gaps.some((g) => g.key === 'CCC' && g.missing.indexOf('resv') >= 0));
});
test('an optional surface gap is coverage, not a gap', () => {
  const m = report.buildCoverageMatrix(makeCtx(cleanData()));
  assert.ok(m.coverage.find((c) => c.id === 'agenda').tier === 'optional');
  assert.ok(!m.gaps.some((g) => g.missing.indexOf('agenda') >= 0));
});
test('the rendered table keeps its column alignment', () => {
  const text = report.renderCoverage(report.buildCoverageMatrix(makeCtx(cleanData())));
  const lines = text.split('\n').filter((l) => l.indexOf('AAA') === 2 || l.indexOf('BBB') === 2);
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(report.displayWidth(lines[0]), report.displayWidth(lines[1]));
});

// ---- 11. end-to-end smoke test against the real out/ --------------------------
section('end-to-end');
test('the real out/ tree validates clean', () => {
  const outDir = path.join(__dirname, '..', 'out');
  if (!fs.existsSync(path.join(outDir, 'index.html'))) { console.log('         (skipped: no out/ next to tools/)'); return; }
  const r = validate(outDir);
  assert.deepStrictEqual(r.problems, [], 'validator problems: ' + r.problems.join(' | '));
  assert.strictEqual(r.summary.entities, 54);
});
test('the registry runs every check and none throws on the real tree', () => {
  const outDir = path.join(__dirname, '..', 'out');
  if (!fs.existsSync(path.join(outDir, 'index.html'))) return;
  const r = validate(outDir);
  assert.strictEqual(r.checks.length, checks.CHECKS.length);
  for (const c of r.checks) assert.ok(c.problems.length === 0, c.id + ' reported ' + c.problems.length);
});

// ---- summary ------------------------------------------------------------------
console.log('');
if (failures.length) {
  console.log(`FAILED: ${failures.length} of ${passed + failures.length} tests`);
  for (const f of failures) console.log('  x ' + f.name + '\n    ' + (f.error.stack || f.error.message).split('\n').slice(0, 4).join('\n    '));
  process.exit(1);
}
console.log(`OK: ${passed} tests passed`);
