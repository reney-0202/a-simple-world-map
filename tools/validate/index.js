'use strict';
/* world1980 data-layer validator — browser-like data loading + orchestration.
 *
 * Loads every data/*.js + engine/*.js script listed in out/index.html into one
 * shared VM context (mimicking how the browser loads them as sequential classic
 * scripts), builds the `ctx` bag the checks operate on, and runs the registry.
 *
 * The result is a plain object so the same run can be rendered as a CI log,
 * as `--json`, or fed to the coverage-matrix report.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { CHECKS } = require('./checks');

// Mirrored from 03-decisions.js: federation aliases that are documented, not dangling.
const MAP_FED_TARGET = { ARG: 'LAP', KWT: 'ARA' };

// ---- browser-like shared scope ------------------------------------------------
function createSandbox() {
  const sandbox = {
    console, performance, Math, JSON, Date, Object, Array, String, Number, Boolean,
    Error, isFinite, parseInt, parseFloat, RegExp, Set, Map, Uint8Array, Uint16Array,
    Uint32Array, Int16Array, Float64Array, ArrayBuffer, Promise,
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
    set textContent(v) {}, get textContent() { return ''; }, innerHTML: '', value: '', onclick: null,
  });
  sandbox.document = {
    createElement: fakeEl, querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, addEventListener() {}, body: fakeEl(),
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
    key(i) { return Object.keys(this._d)[i]; },
  };
  return sandbox;
}

/** Script tags from index.html that belong to the data layer (data/ + engine/).
 *  app/* boot dispatch needs a live page, so we stop after the data layer +
 *  engine, which is what we validate. */
function dataLayerScripts(outDir) {
  const idx = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  const tags = [...idx.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  return tags.filter((t) => t.startsWith('data/') || t.startsWith('engine/'));
}

/**
 * Load the data layer into a fresh sandbox.
 * @returns {{ sandbox, loaded: string[], loadErrors: string[] }}
 */
function loadDataLayer(outDir) {
  const sandbox = createSandbox();
  const ctx = vm.createContext(sandbox);
  const scripts = dataLayerScripts(outDir);
  const loadErrors = [];
  for (const rel of scripts) {
    const src = fs.readFileSync(path.join(outDir, rel), 'utf8');
    try { vm.runInContext(src, ctx, { filename: rel }); }
    catch (e) { loadErrors.push(`LOAD ${rel}: ${e.message}`); }
  }
  return { sandbox, loaded: scripts, loadErrors };
}

/** Build the check context from a loaded sandbox. */
function buildContext(sandbox, outDir) {
  const CM = sandbox.W1980_COUNTRIES;
  const SD = sandbox.W1980_SIMDATA;
  const entities = Object.keys((CM && CM.countries) || {});
  const members = new Set(Object.keys((SD && SD.popStart) || {}));
  const resolves = (k) => entities.indexOf(k) >= 0 || members.has(k) || !!MAP_FED_TARGET[k];
  return { data: sandbox, entities, members, MAP_FED_TARGET, resolves, outDir };
}

/**
 * Run the full contract suite.
 * @param {string} outDir
 * @returns {{
 *   ok: boolean, outDir: string, loaded: string[], loadErrors: string[],
 *   checks: Array<{id,label,problems,notes,stats}>,
 *   problems: string[], notes: string[],
 *   summary: { scripts, entities, members, problems }
 * }}
 */
function validate(outDir) {
  const { sandbox, loaded, loadErrors } = loadDataLayer(outDir);

  if (loadErrors.length) {
    return {
      ok: false, outDir, loaded, loadErrors,
      checks: [{ id: 'load', label: '数据层脚本加载', problems: loadErrors, notes: [] }],
      problems: loadErrors,
      notes: [],
      summary: { scripts: loaded.length, entities: 0, members: 0, problems: loadErrors.length },
    };
  }

  const ctx = buildContext(sandbox, outDir);
  const notes = [`loaded ${loaded.length} data/engine scripts`];
  const problems = [];
  const checkResults = [];

  if (!ctx.entities.length) {
    return {
      ok: false, outDir, loaded, loadErrors,
      checks: [{ id: 'load', label: '数据层脚本加载', problems: ['FAIL: no W1980_COUNTRIES'], notes }],
      problems: ['no W1980_COUNTRIES'], notes,
      summary: { scripts: loaded.length, entities: 0, members: 0, problems: 1 },
    };
  }

  for (const c of CHECKS) {
    const r = c.run(ctx) || { problems: [], notes: [] };
    checkResults.push({ id: c.id, label: c.label, problems: r.problems || [], notes: r.notes || [], stats: r.stats || null });
    notes.push(...(r.notes || []));
    problems.push(...(r.problems || []));
  }

  return {
    ok: problems.length === 0,
    outDir, loaded, loadErrors,
    checks: checkResults,
    problems, notes,
    summary: { scripts: loaded.length, entities: ctx.entities.length, members: ctx.members.size, problems: problems.length },
    ctx,
  };
}

module.exports = { validate, loadDataLayer, buildContext, dataLayerScripts, MAP_FED_TARGET };
