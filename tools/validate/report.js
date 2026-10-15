'use strict';
/* world1980 data-layer coverage matrix (Phase I).
 *
 * Reports, for each of the 54 playable entities, which data surfaces actually
 * carry a row for it. This is the "which entity is missing what" view that the
 * contract checks cannot give: a missing reserve or an entity with no province
 * is not a hard failure, but it is exactly the kind of gap that silently turns
 * into a dead branch at runtime.
 *
 * Surfaces are split into two tiers:
 *   required — every playable entity must have it (a gap is a real defect)
 *   optional — a deliberate per-entity feature (only major powers get an
 *              agenda/intel/doctrine/leader); reported as coverage, not as a gap
 *
 * Usage: node tools/validate_data.js <out_dir> --report [--json]
 */

/** Member key -> owning entity key. Provinces carry a *member* key in `polity`,
 *  so this is the map that turns a province into its playable entity. */
function memberOwners(ctx) {
  const CM = (ctx.data.W1980_COUNTRIES || {}).countries || {};
  const map = new Map();
  for (const k of ctx.entities) {
    map.set(k, k);
    for (const m of ((CM[k] || {}).members || [])) if (m && m.key) map.set(m.key, k);
  }
  return map;
}

/** Province count per entity. Returns { counts, unknownPolity } so a province
 *  pointing at a member key no entity owns shows up instead of vanishing. */
function provinceCounts(ctx) {
  const owners = memberOwners(ctx);
  const counts = {};
  const unknownPolity = new Set();
  const PM = ctx.data.W1980_PROVINCES || {};
  for (const p of Object.keys(PM)) {
    const owner = owners.get(PM[p].polity);
    if (owner) counts[owner] = (counts[owner] || 0) + 1;
    else unknownPolity.add(PM[p].polity);
  }
  return { counts, unknownPolity: [...unknownPolity] };
}

/** Route-endpoint count per entity. */
function routeCounts(ctx) {
  const routes = ((ctx.data.W1980_TRADE || {}).BASELINE_ROUTES) || [];
  const counts = {};
  for (const r of routes) {
    for (const f of ['from', 'to']) {
      if (r[f] && ctx.entities.indexOf(r[f]) >= 0) counts[r[f]] = (counts[r[f]] || 0) + 1;
    }
  }
  return counts;
}

/** The surfaces. `kind: "flag"` renders ✓/·, `kind: "count"` renders a number
 *  (0 renders as ·, so "has none" is visually obvious). */
function surfaces(ctx) {
  const d = ctx.data;
  const IR = (d.W1980_TRADE || {}).INIT_RESERVES || {};
  const RES = ((d.W1980_RESOURCES || {}).countries) || {};
  const AG = ((d.W1980_AGENDAS || {}).database) || {};
  const IN = ((d.W1980_INTEL || {}).AGENCIES) || {};
  const DOC = ((d.W1980_AI || {}).AI_DOCTRINES) || {};
  const OBJ = ((d.W1980_AI || {}).STRATEGIC_OBJECTIVES) || {};
  const LEAD = ((d.W1980_ASSETS || {}).LEADERS) || {};
  const prov = provinceCounts(ctx).counts;
  const rt = routeCounts(ctx);

  return [
    { id: 'resv', label: 'resv', hint: 'INIT_RESERVES 初始外汇', kind: 'flag', tier: 'required', value: (k) => IR[k] !== undefined },
    { id: 'res', label: 'res', hint: '资源产出表', kind: 'flag', tier: 'required', value: (k) => !!RES[k] },
    { id: 'prov', label: 'prov', hint: '省格归属数', kind: 'count', tier: 'required', value: (k) => prov[k] || 0 },
    { id: 'sim', label: 'sim', hint: '独立仿真行（联邦按成员聚合，本就没有）', kind: 'flag', tier: 'optional', value: (k) => ctx.members.has(k) },
    { id: 'routes', label: 'rt', hint: '贸易航线端点', kind: 'count', tier: 'optional', value: (k) => rt[k] || 0 },
    { id: 'agenda', label: 'agnd', hint: '专属议程', kind: 'count', tier: 'optional', value: (k) => (AG[k] || []).length },
    { id: 'intel', label: 'intl', hint: '情报机构', kind: 'flag', tier: 'optional', value: (k) => !!IN[k] },
    { id: 'doctrine', label: 'doct', hint: 'AI 教条', kind: 'flag', tier: 'optional', value: (k) => !!DOC[k] },
    { id: 'objectives', label: 'obj', hint: '主动战略目标', kind: 'count', tier: 'optional', value: (k) => (OBJ[k] || []).length },
    { id: 'leader', label: 'lead', hint: '领袖肖像库条目', kind: 'count', tier: 'optional', value: (k) => (LEAD[k] || []).length },
  ];
}

/**
 * Build the coverage matrix.
 * @returns {{ columns, rows, coverage, gaps, unknownPolity }}
 */
function buildCoverageMatrix(ctx) {
  const cols = surfaces(ctx);
  const CM = (ctx.data.W1980_COUNTRIES || {}).countries || {};
  const rows = ctx.entities.map((k) => {
    const cells = cols.map((c) => {
      const v = c.value(k);
      return { id: c.id, raw: v, display: c.kind === 'flag' ? (v ? '✓' : '·') : (v ? String(v) : '·') };
    });
    return { key: k, zh: (CM[k] || {}).zh || k, cells };
  });

  const coverage = cols.map((c) => {
    let hit = 0;
    for (const k of ctx.entities) {
      const v = c.value(k);
      if (c.kind === 'flag' ? v : v > 0) hit++;
    }
    return { id: c.id, label: c.label, hint: c.hint, tier: c.tier, covered: hit, total: ctx.entities.length };
  });

  // Only `required` surfaces can produce a gap; the rest are deliberate features.
  const requiredIds = cols.filter((c) => c.tier === 'required').map((c) => c.id);
  const gaps = [];
  for (const r of rows) {
    const missing = r.cells.filter((c) => requiredIds.indexOf(c.id) >= 0 && c.display === '·').map((c) => c.id);
    if (missing.length) gaps.push({ key: r.key, zh: r.zh, missing });
  }
  return {
    columns: cols.map((c) => ({ id: c.id, label: c.label, hint: c.hint, kind: c.kind, tier: c.tier })),
    rows, coverage, gaps,
    unknownPolity: provinceCounts(ctx).unknownPolity,
  };
}

/** Render the matrix as an aligned plain-text table. */
function renderCoverage(matrix) {
  const cols = matrix.columns;
  const keyW = Math.max(3, ...matrix.rows.map((r) => r.key.length));
  const zhW = Math.max(4, ...matrix.rows.map((r) => displayWidth(r.zh)));
  const cellW = cols.map((c) => Math.max(
    displayWidth(c.label),
    ...matrix.rows.map((r) => displayWidth(r.cells.find((x) => x.id === c.id).display)),
  ));

  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - displayWidth(s)));
  const lines = [];
  lines.push(`  实体覆盖矩阵（${matrix.rows.length} 个可玩实体）`);
  lines.push('');
  lines.push('  ' + pad('key', keyW) + '  ' + pad('中文', zhW) + '  ' + cols.map((c, i) => pad(c.label, cellW[i])).join(' '));
  lines.push('  ' + '-'.repeat(keyW) + '  ' + '-'.repeat(zhW) + '  ' + cellW.map((w) => '-'.repeat(w)).join(' '));
  for (const r of matrix.rows) {
    lines.push('  ' + pad(r.key, keyW) + '  ' + pad(r.zh, zhW) + '  ' +
      cols.map((c, i) => pad(r.cells.find((x) => x.id === c.id).display, cellW[i])).join(' '));
  }
  lines.push('');
  lines.push('  列覆盖率（必须 = 每个可玩实体都应有；可选 = 刻意只给重点国）：');
  for (const c of matrix.coverage) {
    const pct = ((c.covered / c.total) * 100).toFixed(0);
    lines.push(`    [${c.tier === 'required' ? '必须' : '可选'}] ${c.label.padEnd(6)} ${String(c.covered).padStart(3)}/${c.total} (${pct.padStart(3)}%)  ${c.hint}`);
  }
  lines.push('');
  if (matrix.unknownPolity.length) {
    lines.push(`  ⚠ 省份 polity 值无法归属到任何实体：${matrix.unknownPolity.join(', ')}`);
  } else {
    lines.push('  ✓ 每个省份的 polity 值都能归属到一个可玩实体');
  }
  if (matrix.gaps.length) {
    lines.push('');
    lines.push(`  必需面存在缺口的实体：${matrix.gaps.length}/${matrix.rows.length}`);
    for (const g of matrix.gaps) lines.push(`    ${g.key} ${g.zh}：缺 ${g.missing.join(', ')}`);
  } else {
    lines.push('  ✓ 全部实体的必需数据面均已覆盖');
  }
  return lines.join('\n');
}

/** East-Asian wide characters count as 2 columns so the table stays aligned. */
function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    w += (cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6))) ? 2 : 1;
  }
  return w;
}

module.exports = { buildCoverageMatrix, renderCoverage, surfaces, provinceCounts, routeCounts, memberOwners, displayWidth };
