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
    W1980_AGENDAS: { database: { AAA: [{ id: 'a1', onComplete: { sezMomentum: 10 }, effects: { gdpBonus: 0.3, desc: 'x' } }], DEFAULT: [] } },
    W1980_AGENDA_CONDITIONS: {
      CONDITIONS: {
        mil_le_3: { zh: '军费 ≤ 3%', fields: [], faction: false },
        domestic_faction: { zh: '内政天平', fields: [], faction: true },
      },
      isRegistered(name) { return Object.prototype.hasOwnProperty.call(this.CONDITIONS, name); },
      // N1：完成回馈字段词表
      ONCOMPLETE_FIELDS: { sezMomentum: { zh: '特区动能' }, unrest: { zh: '动荡' } },
      isOnCompleteField(name) { return Object.prototype.hasOwnProperty.call(this.ONCOMPLETE_FIELDS, name); },
    },
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
    W1980_ESTIMATES: {
      FIELDS: {
        prestige: { base: 6, lo: 0, hi: 100, zh: '威望', consumer: 'board' },
        control: { base: 18, lo: -100, hi: 100, zh: '战线', consumer: 'war panel' },
        mil: { base: 1.2, lo: 0, hi: 12, zh: '军费', consumer: 'credibility' },
      },
      PARAMS: {
        BUDGET_Q0: 15, BUDGET_Q_SPAN: 45, BUDGET_Q_MAX: 0.45,
        FOCUS_Q: 0.35, FOCUS_MONTHS: 12, FOCUS_MAX: 2, FOCUS_COST_PC: 10,
        QUARTER: 3, QUALITY_CAP: 0.85,
        OPTIMISM_BAND: 12, OP_STRENGTH_CUT: 0.30, OP_ATTR_PENALTY: 0.35,
      },
    },
    W1980_NUKE: {
      DEFCON: [
        { level: 1, from: 80, zh: '一号', note: '' },
        { level: 2, from: 60, zh: '二号', note: '' },
        { level: 3, from: 40, zh: '三号', note: '' },
        { level: 4, from: 20, zh: '四号', note: '' },
        { level: 5, from: 0, zh: '五号', note: '' },
      ],
      INCIDENTS: [
        { id: 'inc1', zh: '虚警', icon: '📡', note: 'x', options: [
          { id: 'dove', zh: '降温', esc: -6, cred: -3, note: '' },
          { id: 'hawk', zh: '强硬', esc: +14, cred: +6, note: '' },
        ] },
      ],
      PARAMS: {
        ESC_MIN: 0, ESC_MAX: 100, CRED_MIN: 5, CRED_MAX: 95, CRED_START: 50,
        TIER_ESC: [0, 3, 8, 18], TENSION_ESC: 4, WAR_ESC: 3, TREATY_ESC: -2, DECAY: 1.2,
        CRED_MIL: 6, CRED_PRESTIGE: 0.4, CRED_COHESION: 0.35,
        RISK_BASE: 0.004, RISK_CAP: 0.02, DOOMSDAY_MONTHS: 3, LOG_MAX: 24,
      },
    },
    W1980_WARS: {
      WARS: {
        w1: {
          zh: '测试战争', sideA: 'AAA', sideB: 'BBB',
          start: [1980, 9], historicEnd: [1988, 8],
          phases: [[1980, 9, 28], [1982, 5, -32]], stake: 6, decisive: 60,
          provinces: [1, 2], ceaseRes: 'res_598',
        },
      },
      OPS: {
        attack: { zh: '攻势', pc: 18, strength: 6, enemyAttr: 0.5, selfAttr: 0.4, wear: 0.4 },
        truce: { zh: '停火', pc: 10, strength: 0, enemyAttr: 0, selfAttr: 0, wear: -0.3, endEarly: true },
      },
      PARAMS: {
        CONTROL_MIN: -100, CONTROL_MAX: 100, DEVIATION_PER_SUPPORT: 7, DEVIATION_CLAMP: 45,
        DECISIVE_DEV: 28, ATTR_PER_DEV: 0.012, ATTR_DRAG: 0.45, ATTR_DRAG_DIV: 6,
        WEAR_MAX: 100, WEAR_UNREST: 0.22, WEAR_DECAY: 0.35, STALEMATE_BAND: 22,
        SETTLE_PRESTIGE: 0.45, LOG_MAX: 24,
      },
      AI_POLICY: {
        ADVANTAGE: 25, WEAR_SETTLE: 70, WEAR_HALF: 45,
        STRAIN_SETTLE: 0.6, STRAIN_PRESS: 0.6,
      },
    },
    W1980_PRESTIGE: {
      MILESTONES: [
        { id: 'm1', y: 1981, m: 4, owner: 'AAA', gain: 8, rival: 'BBB', rivalLoss: 2, zh: 'x' },
        { id: 'm2', y: 1986, m: 4, owner: 'BBB', gain: -9, zh: 'y' },
      ],
      PROGRAMS: {
        p1: { zh: 'p', cost: 10, drag: 0.1, gain: 0.5, risk: 0.01, failLoss: 2 },
        p2: { zh: 'q', cost: 20, drag: 0.3, gain: 1.1, risk: 0.02, failLoss: 6 },
      },
      PARAMS: {
        SCORE_MIN: 0, SCORE_MAX: 100, SCORE_START: 50, DECAY: 0.025, MAX_ACTIVE: 1,
        RIVAL: { AAA: 'BBB' }, BLOC_LEADER: { NATO: 'AAA' },
        DRIFT_GAP: 12, DRIFT_MONTHS: 6, DRIFT_TOTAL: 6, DRIFT_ELIGIBLE: ['NA'],
      },
    },
    W1980_POLECON: {
      ANCHOR: { AAA: [2.0, 1.0], BBB: [3.0, 1.2], CCC: [1.5, 0.8], DEFAULT: [2.0, 1.0] },
      BLAME: {
        AAA: { down: ['congressApproval'], up: [] },
        BBB: { down: ['conservative'], up: ['reformist'] },
        CCC: { down: ['legitimacy'], up: [] },
        DEFAULT: { down: ['legitimacy'], up: [] },
      },
      Z_BAD: -1.5, Z_GOOD: 1.5, PERSIST: 2, ANCHOR_ADAPT: 0.06, ANCHOR_REVERT: 0.02,
      UNREST_PULL_UP: 0.22, UNREST_PULL_DOWN: 0.14,
      UNREST_TARGET_BAD_BASE: 16, UNREST_TARGET_BAD_SPAN: 34,
      UNREST_TARGET_BOP_BASE: 12, UNREST_TARGET_BOP_SPAN: 26,
      RESERVE_GDP_SHARE: 0.002,
      RESERVE_WARN_MONTHS: 2.0, RESERVE_CRIT_MONTHS: 1.0,
    },
    W1980_PROBES: {
      params: ['demo', 'end'],
      entries: {
        demo: { qs: 'demo=1', marker: 'DEMOPROBE', budget: 30000, class: 'mechanics' },
        endprobe: { qs: 'end=1&t=1991-12', marker: 'ENDPROBE', budget: 60000, class: 'history' },
      },
    },
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

// ---- 8c. probe registry -------------------------------------------------------
// data/probes.js is the single source of truth for probe URL params: the page
// uses `params` for CR.probeMode and the runner uses `entries` to launch them.
// If the two halves disagree, a probe stops running and nothing notices.
section('checkProbeRegistry');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkProbeRegistry(makeCtx(cleanData())).problems, []);
});
test('a param with no entry is caught', () => {
  const d = cleanData(); d.W1980_PROBES.params.push('ghost');
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /params 里登记但没有对应 entries：ghost/);
});
test('an entry missing from params is caught', () => {
  const d = cleanData();
  d.W1980_PROBES.entries.extra = { qs: 'extra=1', marker: 'EXTRAPROBE', budget: 1000, class: 'mechanics' };
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /entries 用了未登记的参数：extra/);
});
test('duplicate params are caught', () => {
  const d = cleanData(); d.W1980_PROBES.params.push('demo');
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /params 有重复项 demo/);
});
test('two probes claiming the same url param is caught', () => {
  const d = cleanData();
  d.W1980_PROBES.entries.clone = { qs: 'demo=2', marker: 'CLONEPROBE', budget: 1000, class: 'mechanics' };
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /参数 demo 被 demo 与 clone 同时占用/);
});
test('duplicate DOM markers are caught', () => {
  const d = cleanData();
  d.W1980_PROBES.params.push('other');
  d.W1980_PROBES.entries.other = { qs: 'other=1', marker: 'DEMOPROBE', budget: 1000, class: 'mechanics' };
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /marker DEMOPROBE 被 demo 与 other 同时使用/);
});
test('a non-positive budget is caught', () => {
  const d = cleanData(); d.W1980_PROBES.entries.demo.budget = 0;
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /budget 必须是正数/);
});
test('a lowercase marker is caught', () => {
  const d = cleanData(); d.W1980_PROBES.entries.demo.marker = 'demoprobe';
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /marker 必须是大写字符串/);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_PROBES;
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /未定义 W1980_PROBES/);
});
// P0：探针分类决定 `cmp --class=history` 硬门覆盖谁。class 写错（或漏写）
// 会让那个探针悄悄退出硬门，所以构建期就要失败。
test('an unknown probe class is caught', () => {
  const d = cleanData(); d.W1980_PROBES.entries.demo.class = 'mecanics';
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /class 必须是 history 或 mechanics/);
});
test('a missing probe class is caught', () => {
  const d = cleanData(); delete d.W1980_PROBES.entries.demo.class;
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /class 必须是 history 或 mechanics/);
});
test('a registry with no history probe is caught', () => {
  // The hard gate would compare nothing and stay green forever.
  const d = cleanData(); d.W1980_PROBES.entries.endprobe.class = 'mechanics';
  assert.match(checks.checkProbeRegistry(makeCtx(d)).problems[0], /cmp --class=history 硬门会空转/);
});
test('probeParamToken reads the token, not the probe key', () => {
  // `end=1&t=1991-12` is the endprobe query: its parameter token is `end`.
  assert.strictEqual(checks.probeParamToken('end=1&t=1991-12'), 'end');
  assert.strictEqual(checks.probeParamToken('sanprobe=1&player=SUN&mil=3.5'), 'sanprobe');
  assert.strictEqual(checks.probeParamToken(''), '');
});

// ---- 8d. political-economy table (P1) ----------------------------------------
// The economy -> politics channel is only as good as this table. A missing
// anchor means a country can never compute a shortfall (so it is politically
// immune); a misspelled blame field means the bill is written into nothing.
section('checkPolEcon');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkPolEcon(makeCtx(cleanData())).problems, []);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_POLECON;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /未定义 W1980_POLECON/);
});
test('an entity without an anchor is caught', () => {
  const d = cleanData(); delete d.W1980_POLECON.ANCHOR.CCC;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR 缺少实体 CCC/);
});
test('an entity with neither an explicit blame row nor DEFAULT is caught', () => {
  // 47 个通用国家共享同一套字段，所以 DEFAULT 兜底是设计意图；但兜底本身丢了
  // 就是「账单无处落账」，必须构建期失败。
  const d = cleanData();
  delete d.W1980_POLECON.BLAME.BBB;
  assert.deepStrictEqual(checks.checkPolEcon(makeCtx(d)).problems, [], 'DEFAULT 兜底时缺显式行不算问题');
  delete d.W1980_POLECON.BLAME.DEFAULT;
  const p = checks.checkPolEcon(makeCtx(d)).problems;
  assert.ok(p.some((x) => /BLAME 缺少 DEFAULT/.test(x)), '应报出缺 DEFAULT：' + p.join(' | '));
  assert.ok(p.some((x) => /无处落账/.test(x)), '应报出无处落账的实体：' + p.join(' | '));
});
test('a non-positive standard deviation is caught', () => {
  const d = cleanData(); d.W1980_POLECON.ANCHOR.AAA = [2.0, 0];
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR\.AAA\[1\] 必须是正数/);
});
test('a malformed anchor row is caught', () => {
  const d = cleanData(); d.W1980_POLECON.ANCHOR.AAA = [2.0];
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR\.AAA 必须是 \[史实均值, 史实标准差\]/);
});
test('an anchor keyed to a non-entity is caught', () => {
  const d = cleanData(); d.W1980_POLECON.ANCHOR.ZZZ = [1, 1];
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR\.ZZZ 不是实体键/);
});
test('a blame row with no down field is caught', () => {
  // A bill with nowhere to land is exactly the "panel says it, code never wires it" bug.
  const d = cleanData(); d.W1980_POLECON.BLAME.AAA.down = [];
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /BLAME\.AAA\.down 不能为空/);
});
test('a cross-sign threshold pair is caught', () => {
  const d = cleanData(); d.W1980_POLECON.Z_BAD = 1.0;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /Z_BAD 必须是负数/);
});
test('a reserve pair in the wrong order is caught', () => {
  const d = cleanData();
  d.W1980_POLECON.RESERVE_CRIT_MONTHS = 5; d.W1980_POLECON.RESERVE_WARN_MONTHS = 1;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /RESERVE_CRIT_MONTHS < RESERVE_WARN_MONTHS/);
});
test('an out-of-range adaptation rate is caught', () => {
  const d = cleanData(); d.W1980_POLECON.ANCHOR_ADAPT = 0;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR_ADAPT 必须落在 \(0, 1\]/);
});
test('a zero revert rate is caught', () => {
  // Without a pull back to history, any one-off collapse drags the expectation
  // anchor to wherever it likes and the shortfall stops meaning anything.
  const d = cleanData(); d.W1980_POLECON.ANCHOR_REVERT = 0;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /ANCHOR_REVERT 必须落在 \(0, 1\]/);
});
test('an out-of-range unrest pull rate is caught', () => {
  const d = cleanData(); d.W1980_POLECON.UNREST_PULL_UP = 1.5;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /UNREST_PULL_UP 必须落在 \(0, 1\]/);
});
test('a zero unrest target span is caught', () => {
  const d = cleanData(); d.W1980_POLECON.UNREST_TARGET_BAD_SPAN = 0;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /UNREST_TARGET_BAD_SPAN 必须是正数/);
});
test('a zero reserve materiality share is caught', () => {
  const d = cleanData(); d.W1980_POLECON.RESERVE_GDP_SHARE = 0;
  assert.match(checks.checkPolEcon(makeCtx(d)).problems[0], /RESERVE_GDP_SHARE 必须是正数/);
});

// ---- 8f. bundle hygiene ------------------------------------------------------
// The shipped tree is the product, and two things rot there silently: total size
// (every phase adds bytes) and generated records (the province table is produced
// by the export pipeline, so a field nothing reads can ride along forever --
// `px` and a redundant `id` were 58 kB of pure dead weight across 2998 records).
section('checkBundleHygiene');
function withProvinces(fields) {
  const d = cleanData();
  d.W1980_PROVINCES = { 1: fields, 2: fields };
  return d;
}
const GOOD_PROVINCE = { polity: 'AAA', area_km2: 100, cx: 1, cy: 2, bbox: [0, 0, 1, 1], name: 'x' };
test('clean fixture reports no problems', () => {
  // outDir points at a real but tiny tree: __dirname has no budget issue
  assert.deepStrictEqual(checks.checkBundleHygiene(makeCtx(withProvinces(GOOD_PROVINCE), { outDir: __dirname })).problems, []);
});
test('a province field nothing reads fails the build', () => {
  // This is the exact regression: a regenerated export re-adds `px`.
  const p = checks.checkBundleHygiene(makeCtx(withProvinces(Object.assign({ px: 7 }, GOOD_PROVINCE)), { outDir: __dirname })).problems;
  assert.ok(p.some((x) => /字段 "px"/.test(x)), '应报出 px 字段：' + p.join(' | '));
  assert.ok(p.some((x) => /没有任何运行时代码读取它/.test(x)), '应说明无人读取：' + p.join(' | '));
});
test('a redundant id field is rejected too', () => {
  const p = checks.checkBundleHygiene(makeCtx(withProvinces(Object.assign({ id: 1 }, GOOD_PROVINCE)), { outDir: __dirname })).problems;
  assert.ok(p.some((x) => /字段 "id"/.test(x)), '应报出 id 字段：' + p.join(' | '));
});
test('a missing required province field is caught', () => {
  const bad = Object.assign({}, GOOD_PROVINCE); delete bad.name;
  const p = checks.checkBundleHygiene(makeCtx(withProvinces(bad), { outDir: __dirname })).problems;
  assert.ok(p.some((x) => /缺少字段 "name"/.test(x)), '应报出缺字段：' + p.join(' | '));
});
test('the declared field list is exactly the six live fields', () => {
  // Pinning the list is the point: adding a field must be a deliberate act.
  assert.deepStrictEqual(checks.PROVINCE_FIELDS.slice().sort(),
    ['area_km2', 'bbox', 'cx', 'cy', 'name', 'polity']);
});
test('a city row with an extra element is caught', () => {
  // The 5th element used to be a capital flag nothing read.
  const d = withProvinces(GOOD_PROVINCE);
  d.W1980_CITIES = [['Tokyo', 1, 2, 3000000]];
  assert.deepStrictEqual(checks.checkBundleHygiene(makeCtx(d, { outDir: __dirname })).problems, []);
  d.W1980_CITIES.push(['Osaka', 1, 2, 2000000, 1]);
  const p = checks.checkBundleHygiene(makeCtx(d, { outDir: __dirname })).problems;
  assert.ok(p.some((x) => /cities\.js: 1\/2 条记录不是 4 元组/.test(x)), '应报出多余元素：' + p.join(' | '));
});
test('the size budget is enforced, not just reported', () => {
  // Build a tree just over the budget in a temp dir and confirm it fails.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w1980-bundle-'));
  try {
    const chunk = Buffer.alloc(1024 * 1024);
    const n = Math.ceil(checks.BUNDLE_BUDGET_MIB) + 1;
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(tmp, 'chunk' + i + '.bin'), chunk);
    const p = checks.checkBundleHygiene(makeCtx(withProvinces(GOOD_PROVINCE), { outDir: tmp })).problems;
    // 断言用的是导出的常量本身 —— 否则每次调预算都要改测试，测试就会变成
    // 「跟着实现走」的空转检查，而不是在验证预算真的被执行。
    const want = new RegExp('超出 ' + checks.BUNDLE_BUDGET_MIB + ' MiB 预算');
    assert.ok(p.some((x) => want.test(x)), '应报出超预算（' + want + '）：' + p.join(' | '));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('a missing outDir skips the size check instead of throwing', () => {
  const r = checks.checkBundleHygiene(makeCtx(withProvinces(GOOD_PROVINCE), { outDir: path.join(__dirname, 'no-such-dir') }));
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.notes.some((n) => /跳过体积检查/.test(n)));
});

// ---- 8g. prestige race table (F) ---------------------------------------------
// The prestige ladder is only a competition if it has both winning and losing
// movements, both superpowers, and programmes that actually cost something.
// Every one of those is a way for the mechanic to quietly become decoration.
section('checkPrestige');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkPrestige(makeCtx(cleanData())).problems, []);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_PRESTIGE;
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /未定义 W1980_PRESTIGE/);
});
test('a ladder with only gains is not a competition', () => {
  const d = cleanData();
  d.W1980_PRESTIGE.MILESTONES = [{ id: 'm1', y: 1981, m: 4, owner: 'AAA', gain: 8, zh: 'x' }];
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /没有任何丢分事件/);
});
test('a ladder with only losses is rejected too', () => {
  const d = cleanData();
  d.W1980_PRESTIGE.MILESTONES = [{ id: 'm1', y: 1981, m: 4, owner: 'AAA', gain: -8, zh: 'x' }];
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /没有任何得分事件/);
});
test('a milestone outside 1980..1991 is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.MILESTONES[0].y = 1999;
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /年份必须在 1980\.\.1991/);
});
test('a duplicate milestone id is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.MILESTONES[1].id = 'm1';
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /id 重复/);
});
test('an unresolvable milestone owner is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.MILESTONES[0].owner = 'ZZZ';
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /owner "ZZZ" 不可解析/);
});
test('a rival equal to the owner is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.MILESTONES[0].rival = 'AAA';
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /rival 不能等于 owner/);
});
test('a programme with no cost is caught', () => {
  // Free prestige would make the whole axis a no-brainer.
  const d = cleanData(); d.W1980_PRESTIGE.PROGRAMS.p1.cost = 0;
  const p = checks.checkPrestige(makeCtx(d)).problems;
  assert.ok(p.some((x) => /工程 p1 的 cost 必须是正数/.test(x)), '应报出 cost：' + p.join(' | '));
});
test('a programme with no drag is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.PROGRAMS.p2.drag = 0;
  const p = checks.checkPrestige(makeCtx(d)).problems;
  assert.ok(p.some((x) => /工程 p2 的 drag 必须是正数/.test(x)), '应报出 drag：' + p.join(' | '));
});
test('a risk outside [0,1] is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.PROGRAMS.p1.risk = 2;
  const p = checks.checkPrestige(makeCtx(d)).problems;
  assert.ok(p.some((x) => /risk 必须落在 \[0,1\]/.test(x)), '应报出 risk：' + p.join(' | '));
});
test('MAX_ACTIVE covering every programme is caught', () => {
  // If you can run everything at once there is no trade-off to make.
  const d = cleanData(); d.W1980_PRESTIGE.PARAMS.MAX_ACTIVE = 2;
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /MAX_ACTIVE 必须 >=1 且严格小于工程总数/);
});
test('a zero decay is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.PARAMS.DECAY = 0;
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /DECAY 必须落在 \(0,1\]/);
});
test('a rival mapping pointing at itself is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.PARAMS.RIVAL = { AAA: 'AAA' };
  const p = checks.checkPrestige(makeCtx(d)).problems;
  assert.ok(p.some((x) => /RIVAL\["AAA"\] 不能指向自己/.test(x)), '应报出自指：' + p.join(' | '));
});
test('an empty drift eligibility list is caught', () => {
  const d = cleanData(); d.W1980_PRESTIGE.PARAMS.DRIFT_ELIGIBLE = [];
  assert.match(checks.checkPrestige(makeCtx(d)).problems[0], /DRIFT_ELIGIBLE 必须是非空数组/);
});

// ---- 8h. ground-war table (D) ------------------------------------------------
// Three date machines became contestable campaigns here. The silent failure modes
// are: a belligerent that is not an entity (the war then costs nobody), a phase
// step outside the war's own window (control jumps with no war on), and a
// decisive threshold the ladder can never reach (early victory is then dead).
section('checkWars');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkWars(makeCtx(cleanData())).problems, []);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_WARS;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /未定义 W1980_WARS/);
});
test('an unresolvable belligerent is caught', () => {
  const d = cleanData(); d.W1980_WARS.WARS.w1.sideA = 'ZZZ';
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /sideA "ZZZ" 不可解析/);
});
test('identical sides are caught', () => {
  const d = cleanData(); d.W1980_WARS.WARS.w1.sideB = 'AAA';
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /sideA 与 sideB 不能相同/);
});
test('a historicEnd before start is caught', () => {
  const d = cleanData(); d.W1980_WARS.WARS.w1.historicEnd = [1979, 1];
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /historicEnd 必须晚于 start/);
});
test('a phase before the war starts is caught', () => {
  const d = cleanData(); d.W1980_WARS.WARS.w1.phases = [[1979, 1, 20], [1982, 5, -30]];
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /阶段早于 start/);
});
test('phases out of order are caught', () => {
  const d = cleanData();
  d.W1980_WARS.WARS.w1.phases = [[1982, 5, -32], [1980, 9, 28]];
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /必须按时间升序/);
});
test('a flat ladder is caught', () => {
  // A ladder that never moves renders as a line that never moves.
  const d = cleanData();
  d.W1980_WARS.WARS.w1.phases = [[1980, 9, 10], [1982, 5, 10]];
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /全程同一档/);
});
test('an unreachable decisive threshold is caught', () => {
  const d = cleanData(); d.W1980_WARS.WARS.w1.decisive = 99;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /提前决胜永远不可能触发/);
});
test('an operation with no political cost is caught', () => {
  const d = cleanData(); d.W1980_WARS.OPS.attack.pc = 0;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /方针 attack\.pc 必须是正数/);
});
test('a negative self attrition is caught', () => {
  const d = cleanData(); d.W1980_WARS.OPS.attack.selfAttr = -1;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /selfAttr 不能为负/);
});
test('a war table with no exit operation is caught', () => {
  // Without a "seek ceasefire" option the player cannot cut their losses.
  const d = cleanData(); delete d.W1980_WARS.OPS.truce;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /没有任何「主动停火」方针/);
});
test('DECISIVE_DEV above DEVIATION_CLAMP is caught', () => {
  const d = cleanData(); d.W1980_WARS.PARAMS.DECISIVE_DEV = 60;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /DECISIVE_DEV\(60\) 高于 DEVIATION_CLAMP\(45\)/);
});
test('a missing AI policy is caught', () => {
  // D2: without a policy the AI has no moves and the war is a one-sided range again.
  const d = cleanData(); delete d.W1980_WARS.AI_POLICY;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /缺 AI_POLICY/);
});
test('AI wear thresholds out of order are caught', () => {
  const d = cleanData();
  d.W1980_WARS.AI_POLICY.WEAR_HALF = 80;   // 80 > WEAR_SETTLE(70)
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /WEAR_HALF 不得高于 WEAR_SETTLE/);
});
test('an AI strain threshold outside (0,1] is caught', () => {
  const d = cleanData(); d.W1980_WARS.AI_POLICY.STRAIN_SETTLE = 1.5;
  assert.match(checks.checkWars(makeCtx(d)).problems[0], /AI_POLICY\.STRAIN_SETTLE 必须落在 \(0,1\]/);
});

// ---- 8i. nuclear risk table (N1) ---------------------------------------------
// Six display-only effect keys became a real axis here. The silent failures: a
// DEFCON ladder with an unreachable level, an incident with no options (a modal
// the player cannot dismiss), and an option set with only one rational answer
// (the dilemma is then fake).
section('checkNuke');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkNuke(makeCtx(cleanData())).problems, []);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_NUKE;
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /未定义 W1980_NUKE/);
});
test('a DEFCON ladder missing a level is caught', () => {
  const d = cleanData(); d.W1980_NUKE.DEFCON = d.W1980_NUKE.DEFCON.filter((x) => x.level !== 3);
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /DEFCON 缺少第 3 级/);
});
test('non-monotonic DEFCON thresholds are caught', () => {
  const d = cleanData(); d.W1980_NUKE.DEFCON.find((x) => x.level === 2).from = 90;
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /DEFCON 阈值必须随危险降低而升高/);
});
test('level 5 not starting at zero is caught', () => {
  const d = cleanData(); d.W1980_NUKE.DEFCON.find((x) => x.level === 5).from = 5;
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /第 5 级必须从 0 起/);
});
test('an incident with no options is caught', () => {
  const d = cleanData(); d.W1980_NUKE.INCIDENTS[0].options = [];
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /必须有至少一个处置选项/);
});
test('an incident with no de-escalation option is caught', () => {
  // Only hawks available => there is no dilemma, just a button.
  const d = cleanData();
  d.W1980_NUKE.INCIDENTS[0].options = [{ id: 'hawk', zh: '强硬', esc: 14, cred: 6 }];
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /没有「降温但丢面子」的选项/);
});
test('an incident with no hawk option is caught', () => {
  const d = cleanData();
  d.W1980_NUKE.INCIDENTS[0].options = [{ id: 'dove', zh: '降温', esc: -6, cred: -3 }];
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /没有「强硬且有收益」的选项/);
});
test('a risk cap above 0.5 is caught', () => {
  const d = cleanData(); d.W1980_NUKE.PARAMS.RISK_CAP = 0.8;
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /RISK_CAP 必须落在 \(0, 0\.5\]/);
});
test('a flat tier ladder is caught', () => {
  const d = cleanData(); d.W1980_NUKE.PARAMS.TIER_ESC = [5, 5];
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /TIER_ESC 最后一档必须大于第一档/);
});
test('ESC_MAX below the level-1 threshold is caught', () => {
  const d = cleanData();
  d.W1980_NUKE.DEFCON.find((x) => x.level === 1).from = 120;
  const p = checks.checkNuke(makeCtx(d)).problems;
  assert.ok(p.some((x) => /第 1 级的阈值必须落在 \(0, ESC_MAX\]/.test(x)), '应报出越界阈值：' + p.join(' | '));
});
test('a zero doomsday window is caught', () => {
  const d = cleanData(); d.W1980_NUKE.PARAMS.DOOMSDAY_MONTHS = 0;
  assert.match(checks.checkNuke(makeCtx(d)).problems[0], /DOOMSDAY_MONTHS 必须 >= 1/);
});

// ---- 8j. intelligence estimation table (C) -----------------------------------
// Exact enemy readings meant information had no quality and therefore no
// uncertainty. The silent failures: a field nobody consumes (S-16 again), a
// quality cap of 1.0 (the fog fully lifts), a free focus action (everyone ends
// up omniscient), and an optimism band of 0 (every offensive is punished, so
// intel stops mattering).
section('checkEstimates');
test('clean fixture reports no problems', () => {
  assert.deepStrictEqual(checks.checkEstimates(makeCtx(cleanData())).problems, []);
});
test('a missing registry is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_ESTIMATES;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /未定义 W1980_ESTIMATES/);
});
test('a field with no consumer is caught', () => {
  // Display-only is exactly what S-16 taught us to reject.
  const d = cleanData(); delete d.W1980_ESTIMATES.FIELDS.prestige.consumer;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /缺 consumer/);
});
test('a non-positive base error is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.FIELDS.mil.base = 0;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /字段 mil 的 base 必须是正数/);
});
test('a reversed interval is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.FIELDS.control.lo = 100;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /\[lo, hi\] 必须是有序区间/);
});
test('a quality cap of 1.0 is caught', () => {
  // Fog that fully lifts means no uncertainty exists at all.
  const d = cleanData(); d.W1980_ESTIMATES.PARAMS.QUALITY_CAP = 1;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /QUALITY_CAP 必须落在 \(0,1\)/);
});
test('a free focus action is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.PARAMS.FOCUS_COST_PC = 0;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /免费评估 = 全员全知/);
});
test('a zero optimism band is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.PARAMS.OPTIMISM_BAND = 0;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /OPTIMISM_BAND 必须是正数/);
});
test('a full strength cut is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.PARAMS.OP_STRENGTH_CUT = 1;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /OP_STRENGTH_CUT 必须落在 \[0,1\)/);
});
test('a negative attrition penalty is caught', () => {
  const d = cleanData(); d.W1980_ESTIMATES.PARAMS.OP_ATTR_PENALTY = -1;
  assert.match(checks.checkEstimates(makeCtx(d)).problems[0], /OP_ATTR_PENALTY 不能为负/);
});

// ---- 8e. agenda condition vocabulary -----------------------------------------
// An unregistered `condition` used to mean "the gate never blocks" -- a typo or a
// deleted engine branch silently disabled a gate. Now the build fails, and the
// engine fails closed if one ever slips through.
section('checkAgendaConditions');
function withAgenda(cond, extra) {
  const d = cleanData();
  const ag = { id: 'a1', effects: { gdpBonus: 0.3, desc: 'x' } };
  if (cond !== undefined) ag.condition = cond;
  Object.assign(ag, extra || {});
  d.W1980_AGENDAS.database.AAA = [ag];
  return d;
}
test('clean fixture (no condition) reports no problems', () => {
  assert.deepStrictEqual(checks.checkAgendaConditions(makeCtx(cleanData())).problems, []);
});
test('a registered condition passes', () => {
  assert.deepStrictEqual(checks.checkAgendaConditions(makeCtx(withAgenda('mil_le_3'))).problems, []);
});
test('an unregistered condition fails the build', () => {
  const p = checks.checkAgendaConditions(makeCtx(withAgenda('mil_le_9'))).problems;
  assert.match(p[0], /未注册的门控 "mil_le_9"/);
  assert.match(p[0], /合法值：mil_le_3, domestic_faction/);
});
test('the two deleted handlers are no longer registered', () => {
  const p = checks.checkAgendaConditions(makeCtx(withAgenda('domestic_reform_lead'))).problems;
  assert.match(p[0], /未注册的门控 "domestic_reform_lead"/);
});
test('a faction gate without its faction declaration is caught', () => {
  const p = checks.checkAgendaConditions(makeCtx(withAgenda('domestic_faction'))).problems;
  assert.match(p[0], /缺少 faction 声明/);
});
test('a faction gate with neither lead/over nor field/min is caught', () => {
  const p = checks.checkAgendaConditions(makeCtx(withAgenda('domestic_faction', { faction: { key: 'chn' } }))).problems;
  assert.match(p[0], /必须给出 lead\+over 或 field\+min/);
});
test('a faction gate with lead+over passes', () => {
  const d = withAgenda('domestic_faction', { faction: { key: 'chn', lead: 'reformist', over: 'planned' } });
  assert.deepStrictEqual(checks.checkAgendaConditions(makeCtx(d)).problems, []);
});
test('a faction gate with field+min passes', () => {
  const d = withAgenda('domestic_faction', { faction: { key: 'deu', field: 'detenteDepth', min: 55 } });
  assert.deepStrictEqual(checks.checkAgendaConditions(makeCtx(d)).problems, []);
});
test('a missing condition vocabulary is reported, not thrown', () => {
  const d = cleanData(); delete d.W1980_AGENDA_CONDITIONS;
  assert.match(checks.checkAgendaConditions(makeCtx(d)).problems[0], /未定义 W1980_AGENDA_CONDITIONS/);
});
test('a vocabulary entry without a zh label is caught', () => {
  const d = cleanData(); d.W1980_AGENDA_CONDITIONS.CONDITIONS.mil_le_3.zh = '';
  assert.match(checks.checkAgendaConditions(makeCtx(d)).problems[0], /mil_le_3\.zh/);
});
// N1：完成回馈的字段名同样有契约 —— 拼错 = 静默无效，所以构建期就要失败。
test('an unregistered onComplete field fails the build', () => {
  const d = cleanData();
  d.W1980_AGENDAS.database.AAA[0].onComplete = { sezMomentumm: 10 };
  assert.match(checks.checkAgendaConditions(makeCtx(d)).problems[0], /未登记的内政字段 "sezMomentumm"/);
});
test('a non-numeric onComplete delta fails the build', () => {
  const d = cleanData();
  d.W1980_AGENDAS.database.AAA[0].onComplete = { sezMomentum: '10' };
  assert.match(checks.checkAgendaConditions(makeCtx(d)).problems[0], /onComplete\.sezMomentum 必须是有限数字/);
});
test('registered onComplete fields pass', () => {
  const d = cleanData();
  d.W1980_AGENDAS.database.AAA[0].onComplete = { sezMomentum: 10, unrest: -2 };
  assert.deepStrictEqual(checks.checkAgendaConditions(makeCtx(d)).problems, []);
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
