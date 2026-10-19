'use strict';
/* world1980 —— 导出结构对账（pipeline ↔ 发布产物）· N2
 *
 * 问题：pipeline（备份仓的 pipeline/*.py）生成 out/data/provinces.js 等文件，
 * 两侧是「同一事实的两份拷贝」，靠人工同步。Phase K 删掉 has_capital 时就必须
 * 两边各改一次 —— 忘记一边就会漂移，而且没有任何检查会发现。
 *
 * 完整重跑 pipeline 需要十几 GB 的原始栅格（work/ 未入库），CI 里做不到。
 * 所以这里守的是**可验证的那一半**：
 *   · 结构契约 pipeline/export-schema.json（提交在备份仓里）记录字段集合；
 *   · 发布产物 out/data/*.js 的字段集合 == 契约；
 *   · pipeline 源码里导出的字段集合 == 契约（抓「改了 pipeline 没重新生成」）。
 * 三方都对齐才算过。任何一方单独改动都会失败，必须显式更新契约 —— 这正是
 * 我们想要的：改动是**有意识的**，不是静默漂移。
 *
 * 用法：
 *   node tools/check_export_schema.js            # 对账（默认 out/）
 *   node tools/check_export_schema.js out --update   # 用当前产物重写契约
 *   node tools/check_export_schema.js out --json
 *
 * 主仓没有 pipeline/，此时它会打印「skipped」并 exit 0（脚本随 tools/ 一起镜像到
 * 备份仓，在那边才真正生效）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const OUT = path.resolve(positional[0] || path.join(ROOT, 'out'));
const PIPELINE = path.join(ROOT, 'pipeline');
const SCHEMA_PATH = path.join(PIPELINE, 'export-schema.json');
const S5 = path.join(PIPELINE, 's5_meta.py');
const wantJson = flags.has('--json');
const wantUpdate = flags.has('--update');

/** 读 `window.X = {...};` 形式的单行数据文件 */
function readWindowJson(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const m = new RegExp('window\\.' + name + '\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;\\s*$').exec(src);
  if (!m) throw new Error(file + ': 找不到 window.' + name + ' = {...};');
  return JSON.parse(m[1]);
}

function shippedShapes(outDir) {
  const PM = readWindowJson(path.join(outDir, 'data', 'provinces.js'), 'W1980_PROVINCES');
  const ids = Object.keys(PM);
  if (!ids.length) throw new Error('provinces.js 为空');
  const province = Object.keys(PM[ids[0]]).sort();
  // 所有省份必须共用同一套字段：混用会让「字段存在与否」变得不可知
  const drifting = ids.filter((id) => Object.keys(PM[id]).sort().join(',') !== province.join(','));
  if (drifting.length) throw new Error('provinces.js 中 ' + drifting.length + ' 个省份字段集不一致（例如 id=' + drifting[0] + '）');

  const CM = readWindowJson(path.join(outDir, 'data', 'countries.js'), 'W1980_COUNTRIES');
  const ckeys = Object.keys(CM.countries || {});
  if (!ckeys.length) throw new Error('countries.js 没有 countries');
  // 国家字段**不是**统一的：可玩实体（集团）比成员多 members/parent 之类的聚合字段。
  // 所以这里比对「所有实体字段的并集」，并要求每个实体的字段都在并集内（并集即并集）。
  const union = new Set();
  for (const k of ckeys) for (const f of Object.keys(CM.countries[k] || {})) union.add(f);
  const country = [...union].sort();

  return { province, country, provinceCount: ids.length, countryCount: ckeys.length };
}

/** 从 s5_meta.py 里抓 pipeline 实际写出的字段名（两个已知的字典字面量）。 */
function pipelineShapes() {
  const src = fs.readFileSync(S5, 'utf8');

  // pj.append({ ... })  —— 省份
  const pj = /pj\.append\(\{([\s\S]*?)\}\)\n/.exec(src);
  if (!pj) throw new Error('s5_meta.py: 找不到 pj.append({...}) 字面量（pipeline 结构变了，请更新本检查）');
  const province = [...pj[1].matchAll(/"([a-z_0-9]+)":/g)].map((m) => m[1]);

  // t.update({ ... })    —— 国家（基础字段来自 C.table，这里只对账 update 出去的那部分）
  const up = /t\.update\(\{([\s\S]*?)\}\)/.exec(src);
  if (!up) throw new Error('s5_meta.py: 找不到 t.update({...}) 字面量（pipeline 结构变了，请更新本检查）');
  const countryUpdate = [...up[1].matchAll(/"([a-z_0-9]+)":/g)].map((m) => m[1]);

  if (!province.length) throw new Error('s5_meta.py: pj.append 里没解析出字段名');
  if (!countryUpdate.length) throw new Error('s5_meta.py: t.update 里没解析出字段名');
  return { province: province.sort(), countryUpdate: countryUpdate.sort() };
}

function main() {
  const hasPipeline = fs.existsSync(PIPELINE);
  if (!hasPipeline) {
    const payload = { ok: true, skipped: true, reason: 'no pipeline/ in this repo (main repo); the gate runs in the backup repo' };
    if (wantJson) console.log(JSON.stringify(payload, null, 2));
    else console.log('SKIP: 本仓库没有 pipeline/ —— 导出结构对账在备份仓执行');
    return 0;
  }

  let shipped;
  try { shipped = shippedShapes(OUT); }
  catch (e) { console.log('FAIL: ' + e.message); return 1; }

  if (wantUpdate) {
    const schema = {
      $comment: 'pipeline 与 out/ 的字段契约。前两行来自发布产物，第三行来自 s5_meta.py 的 t.update。改动任何一侧都必须显式更新本文件。',
      province: shipped.province,
      country: shipped.country,
      provinceCount: shipped.provinceCount,
      countryCount: shipped.countryCount
    };
    fs.writeFileSync(SCHEMA_PATH, JSON.stringify(schema, null, 2) + '\n', 'utf8');
    console.log('updated ' + path.relative(ROOT, SCHEMA_PATH) +
      ' (province=' + schema.province.length + ' fields, country=' + schema.country.length + ' fields)');
    return 0;
  }

  const problems = [];
  if (!fs.existsSync(SCHEMA_PATH)) {
    problems.push('缺少 pipeline/export-schema.json（用 --update 生成）');
  } else {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const eq = (a, b) => a.join(',') === b.join(',');
    if (!eq(shipped.province, (schema.province || []).slice().sort())) {
      problems.push('provinces.js 字段集与契约不符：产物 [' + shipped.province.join(',') +
        '] vs 契约 [' + (schema.province || []).join(',') + ']');
    }
    if (!eq(shipped.country, (schema.country || []).slice().sort())) {
      problems.push('countries.js 字段集与契约不符：产物 [' + shipped.country.join(',') +
        '] vs 契约 [' + (schema.country || []).join(',') + ']');
    }
    if (schema.provinceCount !== shipped.provinceCount) {
      problems.push('省份数量变化：产物 ' + shipped.provinceCount + ' vs 契约 ' + schema.provinceCount);
    }
    if (schema.countryCount !== shipped.countryCount) {
      problems.push('实体数量变化：产物 ' + shipped.countryCount + ' vs 契约 ' + schema.countryCount);
    }
    // pipeline 源码必须仍然写这些字段（抓住「改了 pipeline 但没重新生成 out/」）
    let pipe;
    try { pipe = pipelineShapes(); }
    catch (e) { problems.push(e.message); }
    if (pipe) {
      const missingInPipe = shipped.province.filter((f) => pipe.province.indexOf(f) < 0);
      const extraInPipe = pipe.province.filter((f) => shipped.province.indexOf(f) < 0);
      if (missingInPipe.length) problems.push('s5_meta.py 不再写这些省份字段：' + missingInPipe.join(','));
      if (extraInPipe.length) problems.push('s5_meta.py 新写了产物里没有的省份字段：' + extraInPipe.join(',') + '（需要重跑 pipeline 并更新契约）');
      const missingC = pipe.countryUpdate.filter((f) => shipped.country.indexOf(f) < 0);
      if (missingC.length) problems.push('s5_meta.py 的 t.update 字段不在产物里：' + missingC.join(','));
    }
  }

  const payload = {
    ok: problems.length === 0,
    provinceFields: shipped.province,
    countryFields: shipped.country,
    provinceCount: shipped.provinceCount,
    countryCount: shipped.countryCount,
    problems
  };
  if (wantJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('  · province: ' + shipped.provinceCount + ' entities × ' + shipped.province.length + ' fields');
    console.log('  · country : ' + shipped.countryCount + ' entities, union of ' + shipped.country.length + ' fields');
    if (problems.length) problems.forEach((p) => console.log('  x ' + p));
    console.log(problems.length ? '\nFAIL: ' + problems.length + ' problem(s)' : '\nOK: export schema matches the pipeline contract');
  }
  return problems.length ? 1 : 0;
}

process.exit(main());
