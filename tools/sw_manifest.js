'use strict';
/* world1980 —— Service Worker 预缓存清单生成/校验 · O2
 *
 * 问题：out/sw.js 的 PRECACHE 是 95 行手写清单，与 out/ 的实际文件集靠人工核对。
 * 新增/删除一个发布文件却忘了改清单，离线时就会 404 —— 而且没有任何检查会发现。
 *
 * 本脚本把清单变成**生成物**：
 *   node tools/sw_manifest.js out            # 校验（默认）：与磁盘不一致 → 退出 1
 *   node tools/sw_manifest.js out --update   # 按磁盘重写 sw.js 的 PRECACHE
 *   node tools/sw_manifest.js out --json     # 机器可读结果
 *
 * 排除项只有三个，且都写明了理由（见 EXCLUDED）：
 *   sw.js（自身）、serve.py（本地开发服务器）、打开地图.bat（Windows 启动器）。
 * 其余**每一个**文件都必须进清单 —— 包括本仓库将来新增的任何资产。
 *
 * 注意：CACHE_VERSION 不在本脚本的职责内。清单变化时它一定该变，但**内容**变化
 * （改了某个 js 但文件数没变）时清单不会变，仍然必须手动 bump —— 否则用户会一直
 * 吃到旧缓存。这是刻意的：版本号是人的判断，不是文件列表的副产品。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const OUT = path.resolve(positional[0] || path.join(ROOT, 'out'));
const SW = path.join(OUT, 'sw.js');
const wantUpdate = flags.has('--update');
const wantJson = flags.has('--json');

/** 不进预缓存的文件 → 理由。加一条必须同时说明为什么它不需要离线可用。 */
const EXCLUDED = {
  'sw.js': 'the service worker itself',
  'serve.py': 'local dev server (never fetched by the page)',
  '打开地图.bat': 'Windows launcher (never fetched by the page)'
};

function walk(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** 磁盘上的发布文件（已排除 EXCLUDED），POSIX 相对路径，稳定排序 */
function diskEntries() {
  if (!fs.existsSync(OUT)) throw new Error('out dir not found: ' + OUT);
  return walk(OUT, '')
    .filter((rel) => EXCLUDED[rel] === undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function readSw() {
  if (!fs.existsSync(SW)) throw new Error('sw.js not found: ' + SW);
  const src = fs.readFileSync(SW, 'utf8');
  const m = /const PRECACHE = \[([\s\S]*?)\n\];/.exec(src);
  if (!m) throw new Error('sw.js: 找不到 `const PRECACHE = [ ... ];` 块（结构变了，请更新本脚本）');
  const entries = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const version = (/\bCACHE_VERSION = '([^']+)'/.exec(src) || [])[1] || null;
  return { src, entries, version, blockStart: m.index, blockEnd: m.index + m[0].length };
}

function diff(expected, actual) {
  const setA = new Set(actual);
  const setE = new Set(expected);
  return {
    missing: expected.filter((e) => !setA.has(e)),   // on disk, not in the manifest
    stale: actual.filter((a) => !setE.has(a))        // in the manifest, not on disk
  };
}

function main() {
  let disk, sw;
  try {
    disk = diskEntries();
    sw = readSw();
  } catch (e) {
    console.log('FAIL: ' + e.message);
    return 1;
  }

  const d = diff(disk, sw.entries);

  if (wantUpdate) {
    if (!d.missing.length && !d.stale.length) {
      console.log('up to date: ' + disk.length + ' entries, CACHE_VERSION ' + sw.version);
      return 0;
    }
    const body = disk.map((rel) => '  "' + rel + '"').join(',\n');
    const block = 'const PRECACHE = [\n' + body + '\n];';
    const next = sw.src.slice(0, sw.blockStart) + block + sw.src.slice(sw.blockEnd);
    fs.writeFileSync(SW, next, 'utf8');
    console.log('updated sw.js: ' + sw.entries.length + ' -> ' + disk.length + ' entries' +
      ' (+' + d.missing.length + ' / -' + d.stale.length + ')' +
      '\n  REMINDER: bump CACHE_VERSION (currently ' + sw.version + ') before shipping.');
    return 0;
  }

  const ok = d.missing.length === 0 && d.stale.length === 0;
  if (wantJson) {
    console.log(JSON.stringify({
      ok,
      entries: disk.length,
      manifestEntries: sw.entries.length,
      cacheVersion: sw.version,
      missing: d.missing,
      stale: d.stale
    }, null, 2));
  } else {
    console.log('  · out/: ' + disk.length + ' files, PRECACHE: ' + sw.entries.length +
      ' entries, CACHE_VERSION ' + sw.version);
    if (d.missing.length) {
      console.log('  x 磁盘上有但清单里没有（离线会 404）：');
      d.missing.forEach((f) => console.log('      + ' + f));
    }
    if (d.stale.length) {
      console.log('  x 清单里有但磁盘上已不存在（装不上的缓存项）：');
      d.stale.forEach((f) => console.log('      - ' + f));
    }
    console.log(ok
      ? '\nOK: sw.js precache list matches the shipped files'
      : '\nFAIL: run `node tools/sw_manifest.js out --update` and bump CACHE_VERSION');
  }
  return ok ? 0 : 1;
}

process.exit(main());
