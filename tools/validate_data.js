'use strict';
/* Build-time data-layer validator for world1980 — CLI.
 *
 * Loads every data/*.js + engine/*.js script into one shared scope (mimicking
 * how the browser loads them as sequential classic scripts), then asserts the
 * cross-module key contracts. The checks themselves live in tools/validate/
 * (one function per check class, unit-tested by tools/validate.test.js).
 *
 *   tools/validate/checks.js   the contract checks
 *   tools/validate/report.js   the 54-entity coverage matrix
 *
 * Usage:
 *   node tools/validate_data.js [out_dir] [--json] [--report] [--quiet]
 *
 *   (default)   human-readable notes + problems, exit 1 on any problem
 *   --json      machine-readable result (CI artifacts, diffing)
 *   --report    per-entity coverage matrix across every data surface
 *   --quiet     suppress the notes, print only problems / the OK line
 *
 * Exit codes: 0 = clean, 1 = at least one contract violation.
 */
const path = require('path');
const { validate } = require('./validate');
const { buildCoverageMatrix, renderCoverage } = require('./validate/report');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const outDir = positional[0] || path.join(__dirname, '..', 'out');

const wantJson = flags.has('--json');
const wantReport = flags.has('--report');
const quiet = flags.has('--quiet');

const result = validate(outDir);

let matrix = null;
if (wantReport && result.ok && result.ctx) {
  matrix = buildCoverageMatrix(result.ctx);
}
// the raw sandbox is huge and not usefully serialisable
delete result.ctx;

if (wantJson) {
  const payload = {
    ok: result.ok,
    outDir: path.resolve(outDir),
    summary: result.summary,
    loaded: result.loaded,
    checks: result.checks,
    problems: result.problems,
    notes: result.notes,
  };
  if (matrix) payload.coverage = { columns: matrix.columns, rows: matrix.rows, coverage: matrix.coverage, gaps: matrix.gaps };
  console.log(JSON.stringify(payload, null, 2));
} else {
  if (!quiet) result.notes.forEach((n) => console.log('  · ' + n));
  if (matrix) {
    console.log('');
    console.log(renderCoverage(matrix));
  }
  if (result.problems.length) {
    console.log(`\nFAIL: ${result.problems.length} problem(s)`);
    result.problems.forEach((p) => console.log('  x ' + p));
  } else {
    console.log('\nOK: data layer validated');
  }
}

process.exit(result.ok ? 0 : 1);
