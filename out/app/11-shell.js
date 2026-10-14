"use strict";


// ---------------------------------------------------------------- loading
async function load() {
  const step = (s) => { const e = $("boot-s"); if (e) e.textContent = s; };
  step("解码省份栅格…");
  const pd = await loadPixels("data/province_id.png");
  pid = new Uint16Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) pid[i] = pd[j] | (pd[j + 1] << 8) | (pd[j + 2] << 16);

  let nz = 0, sum = 0;
  for (let i = 0; i < N; i++) { const v = pid[i]; if (v) { nz++; sum += v; } }
  if (nz !== CK.nonzero || sum !== CK.idSum) {
    $("err").style.display = "flex";
    $("err").textContent = "省份栅格校验失败：nonzero " + nz + "/" + CK.nonzero + "，idSum " + sum + "/" + CK.idSum;
    throw new Error("checksum mismatch");
  }

  step("解码国家栅格…");
  const cd = await loadPixels("data/country_id.png");
  pol = new Uint8Array(N); landm = new Uint8Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    pol[i] = cd[j] | (cd[j + 1] << 8) | (cd[j + 2] << 16);
    landm[i] = cd[j + 3] > 0 ? 1 : 0;
  }

  // 可玩实体栅格（低存在感国家并入集团后按「实体」上色/选中）
  step("解码实体栅格…");
  const gd = await loadPixels("data/playable_id.png");
  play = new Uint16Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) play[i] = gd[j] | (gd[j + 1] << 8) | (gd[j + 2] << 16);
  playKeys = CM.byPlayableId || {};
  playIdOfKey = {}; for (const id in playKeys) playIdOfKey[playKeys[id]] = +id;
  playPids = {};
  for (const k in CM.countries) {
    const c = CM.countries[k];
    const s = new Set();
    if (c.polity_ids) c.polity_ids.forEach((p) => s.add(p));
    if (c.polity_id) s.add(c.polity_id);
    (c.members || []).forEach((m) => { if (m.polity_id) s.add(m.polity_id); });
    playPids[k] = s;
  }

  step("构建边界行程…");
  buildRLE();
  buildAdjacency();
  buildColors();
  rebuildFrontlinesMap();

  mapCan = $("map"); ovCan = $("overlay");
  mctx2 = mapCan.getContext("2d");
  octx = ovCan.getContext("2d");
  modeCan = document.createElement("canvas"); modeCan.width = W; modeCan.height = H;
  mctx = modeCan.getContext("2d", { willReadFrequently: true });

  step("烘焙政治地图…");
  await new Promise((r) => setTimeout(r, 0));
  bakeNow("political");
  resize(true);
  $("boot").classList.add("gone");
  $("k-perf").textContent = "首屏耗时 " + Math.round(performance.now()) + " ms（栅格解码 + 行程 + 首帧）";
  $("k-sum").textContent = "校验：nonzero=" + CK.nonzero + "（与 checksum.json 一致）· maxId=" + CK.maxId +
    " · 省份 " + CK.provinceCount + " · 国家 " + CK.countryCount;
  fillHelp();
  render(); drawOverlay();
}

function buildRLE() {
  const mx = CK.maxId;
  provPol = new Int16Array(mx + 1);
  playPol = new Int16Array(mx + 1);
  const seen = new Uint8Array(mx + 1);
  let nr = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W; let x = 0;
    while (x < W) {
      const v = pid[row + x];
      if (v === 0) { x++; continue; }
      let x2 = x + 1;
      while (x2 < W && pid[row + x2] === v) x2++;
      nr++; if (!seen[v]) { seen[v] = 1; provPol[v] = pol[row + x]; playPol[v] = play[row + x]; }
      x = x2;
    }
  }
  const R = { n: nr, id: new Uint16Array(nr), y: new Uint16Array(nr), x0: new Uint16Array(nr), x1: new Uint16Array(nr), start: new Int32Array(mx + 2), cnt: new Int32Array(mx + 2) };
  let k = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W; let x = 0;
    while (x < W) {
      const v = pid[row + x];
      if (v === 0) { x++; continue; }
      let x2 = x + 1;
      while (x2 < W && pid[row + x2] === v) x2++;
      R.id[k] = v; R.y[k] = y; R.x0[k] = x; R.x1[k] = x2; k++;
      R.cnt[v]++; x = x2;
    }
  }
  let acc = 0;
  for (let i = 0; i <= mx; i++) { R.start[i] = acc; acc += R.cnt[i]; }
  R.start[mx + 1] = acc;
  const fill = new Int32Array(mx + 2);
  const oid = new Uint16Array(nr), oy = new Uint16Array(nr), ox0 = new Uint16Array(nr), ox1 = new Uint16Array(nr);
  for (let i = 0; i < nr; i++) {
    const v = R.id[i], p = R.start[v] + fill[v]++;
    oid[p] = v; oy[p] = R.y[i]; ox0[p] = R.x0[i]; ox1[p] = R.x1[i];
  }
  R.id = oid; R.y = oy; R.x0 = ox0; R.x1 = ox1;
  runs = R;

  // country-level runs (from polity raster)
  const cmx = 255, cpx = 800000;   // 255 = polity id 上限（M2: 133 国）
  let cr = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W; let x = 0;
    while (x < W) {
      const v = pol[row + x];
      if (v === 0) { x++; continue; }
      let x2 = x + 1;
      while (x2 < W && pol[row + x2] === v) x2++;
      cr++; x = x2;
    }
  }
  const C = { id: new Uint16Array(cr), y: new Uint16Array(cr), x0: new Uint16Array(cr), x1: new Uint16Array(cr), start: new Int32Array(cmx + 2), cnt: new Int32Array(cmx + 2) };
  let k2 = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W; let x = 0;
    while (x < W) {
      const v = pol[row + x];
      if (v === 0) { x++; continue; }
      let x2 = x + 1;
      while (x2 < W && pol[row + x2] === v) x2++;
      C.id[k2] = v; C.y[k2] = y; C.x0[k2] = x; C.x1[k2] = x2; C.cnt[v]++; k2++; x = x2;
    }
  }
  let acc2 = 0;
  for (let i = 0; i <= cmx; i++) { C.start[i] = acc2; acc2 += C.cnt[i]; }
  const fill2 = new Int32Array(cmx + 2);
  const cid = new Uint16Array(cr), cy = new Uint16Array(cr), cx0 = new Uint16Array(cr), cx1 = new Uint16Array(cr);
  for (let i = 0; i < cr; i++) {
    const v = C.id[i], p = C.start[v] + fill2[v]++;
    cid[p] = v; cy[p] = C.y[i]; cx0[p] = C.x0[i]; cx1[p] = C.x1[i];
  }
  C.id = cid; C.y = cy; C.x0 = cx0; C.x1 = cx1;
  cruns = C;
}

// ---------------------------------------------------------------- colours
function buildColors() {
  // 宗主 -> 殖民地同色系（宗主实色，殖民地同色相略浅/略灰，体现「附属但分开」）
  const shade = (hex, dl, ds) => {
    const c = hx(hex); const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
    return "#" + hsl(h, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)).map((v) => v.toString(16).padStart(2, "0")).join("");
  };
  const mx = CK.maxId;
  const rand = new Uint32Array(mx + 1);
  let s = 12345;
  for (let i = 1; i <= mx; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const h = (s % 360) / 360, l = 0.42 + ((s >> 8) % 26) / 100, sat = 0.38 + ((s >> 16) % 25) / 100;
    const c = hsl(h, sat, l);
    rand[i] = u32(c[0], c[1], c[2]);
  }
  tables.province = rand;

  const keys = Object.keys(CM.countries);
  const order = keys.slice().sort((a, b) => CM.countries[b].area_km2 - CM.countries[a].area_km2);
  const col = {};
  for (const k in MAJOR) col[k] = MAJOR[k];
  // 实体级邻接（集团 = 成员政体并集；低倍也成立）
  const pol2ent = new Int16Array(256);
  for (const k of keys) { const id = playIdOfKey[k] || 0;
    (playPids[k] || []).forEach((p) => { if (id) pol2ent[p] = id; }); }
  const EADJ = new Uint8Array(256 * 256);
  for (let a2 = 1; a2 < 256; a2++) for (let b2 = a2 + 1; b2 < 256; b2++) {
    if (!ADJ[a2 * 256 + b2]) continue;
    const ea = pol2ent[a2], eb = pol2ent[b2];
    if (ea && eb && ea !== eb) { EADJ[ea * 256 + eb] = 1; EADJ[eb * 256 + ea] = 1; }
  }
  const entId = (k) => playIdOfKey[k] || CM.countries[k].polity_id || 0;
  const parentShades = {};
  for (const k of order) {
    const c = CM.countries[k];
    if (col[k]) continue;
    // 附属集团：宗主色同系变体（同一宗主的多个集团逐个错开明度，避免相邻撞色）
    if (c.parent && col[c.parent]) {
      const i = parentShades[c.parent] = (parentShades[c.parent] || 0) + 1;
      col[k] = shade(col[c.parent], 0.12 + 0.09 * (i - 1), -0.08);
      continue;
    }
    const id = entId(k);
    for (const p of PALETTE) {
      let ok = true;
      for (const nk in col) {
        if (EADJ[id * 256 + entId(nk)] && col[nk] === p) { ok = false; break; }
      }
      if (ok) { col[k] = p; break; }
    }
    if (!col[k]) {
      const bad = new Set();
      for (const nk in col) if (EADJ[id * 256 + entId(nk)]) bad.add(u32c(col[nk]));
      let pick = null;
      for (let t = 0; t < 720 && pick === null; t++) {
        const rgb = hsl(((id * 137.508 + t * 3.1) % 360) / 360, 0.5, 0.5);
        const u = u32(rgb[0], rgb[1], rgb[2]);
        if (!bad.has(u)) pick = u;
      }
      if (pick === null) pick = u32c(PALETTE[(id * 7) % PALETTE.length]);
      col[k] = "#" + [pick & 255, (pick >>> 8) & 255, (pick >>> 16) & 255]
        .map((v) => v.toString(16).padStart(2, "0")).join("");
    }
  }
  const tp = new Uint32Array(256), tb = new Uint32Array(256),
    tpop = new Uint32Array(256), tind = new Uint32Array(256);
  const pops = keys.map((k) => CM.countries[k].pop_m), inds = keys.map((k) => CM.countries[k].industry_bn);
  const lp = pops.map(Math.log), li = inds.map(Math.log);
  const p0 = Math.min.apply(null, lp), p1 = Math.max.apply(null, lp);
  const i0 = Math.min.apply(null, li), i1 = Math.max.apply(null, li);
  keys.forEach((k, i) => {
    const c = CM.countries[k], id = playIdOfKey[k] || c.polity_id;
    if (!col[k]) col[k] = PALETTE[(id * 7) % PALETTE.length];   // 兜底
    tp[id] = u32c(col[k]);
    tb[id] = u32c(BLOC[blocOf(k)] || "#9B9B9B");   // R5E：阵营模式读 override（初始为空 → 与原逻辑逐位同）
    const a = (lp[i] - p0) / (p1 - p0), b = (li[i] - i0) / (i1 - i0);
    tpop[id] = ramp(a); tind[id] = ramp(b);
  });
  tables.political = tp; tables.bloc = tb; tables.pop = tpop; tables.ind = tind;
  // R2 T4：delta 表（1980-01 时全部落在中性色 —— 全图「无变化」是正确初始态）
  const tdl = new Uint32Array(256);
  keys.forEach((k) => { const id = playIdOfKey[k] || CM.countries[k].polity_id; tdl[id] = divRamp(deltaOf(k) / DELTA_SPAN); });
  tables.delta = tdl;
  // 经济系统阶段 1：战略资源模式（resource，1980 战略自给/出超色阶）
  const tres = new Uint32Array(256);
  keys.forEach((k) => {
    const id = playIdOfKey[k] || CM.countries[k].polity_id;
    const r = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(k)) || null;
    const score = r ? r.summary.securityScore : 0;
    tres[id] = resRamp(score);
  });
  tables.resource = tres;
  ST.colors = col;
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hsl2hex(h, s, l) { return "#" + hsl(h, s, l).map((v) => v.toString(16).padStart(2, "0")).join(""); }

function hsl(h, s, l) {
  const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
function ramp(t) { // R2 T6 / P2-4：7 档、亮度单调递减（浅→深），兼顾色盲可辨
  t = clamp(t, 0, 1);
  const stops = [[0xF2, 0xEA, 0xD3], [0xE4, 0xCE, 0x96], [0xD6, 0xB2, 0x6B], [0xC0, 0x8A, 0x4A],
    [0xA5, 0x67, 0x3F], [0x7E, 0x44, 0x36], [0x4A, 0x22, 0x2A]];
  const u = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(u)), f = u - i;
  const a = stops[i], b = stops[i + 1];
  return u32(Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f));
}

let ADJ = null;
function buildAdjacency() {
  ADJ = new Uint8Array(256 * 256);
  for (let y = 0; y < H - 1; y++) {
    const row = y * W;
    for (let x = 0; x < W - 1; x++) {
      const a = pol[row + x]; if (!a) continue;
      const b = pol[row + x + 1], c = pol[row + W + x];
      if (b && b !== a) { ADJ[a * 256 + b] = 1; ADJ[b * 256 + a] = 1; }
      if (c && c !== a) { ADJ[a * 256 + c] = 1; ADJ[c * 256 + a] = 1; }
    }
  }
}
function adjacent(a, b) { return ADJ[a * 256 + b] === 1; }

// ---------------------------------------------------------------- bake mode
function bakeNow(mode) {
  const img = mctx.createImageData(W, H);
  const d = new Uint32Array(img.data.buffer);
  const oc = u32c(OCEAN), gc = u32c(GREY);
  if (mode === "province") {
    const t = tables.province;
    for (let i = 0; i < N; i++) { const p = pid[i]; d[i] = p ? t[p] : (landm[i] ? gc : oc); }
  } else if (hasFrontlines && (mode === "political" || mode === "bloc")) {
    const t = tables[mode];
    for (let i = 0; i < N; i++) {
      const pr = pid[i];
      const occ = pr ? flMap[pr] : 0;
      const p = occ || play[i];
      d[i] = p ? t[p] : (landm[i] ? gc : oc);
    }
  } else {
    const t = tables[mode];
    for (let i = 0; i < N; i++) { const p = play[i]; d[i] = p ? t[p] : (landm[i] ? gc : oc); }
  }
  mctx.putImageData(img, 0, 0);
  baked[mode] = true;
  bakedNow = mode;            // 记录画布上真正是哪一种模式（五模式共用一块画布，靠它判断能否复用）
}
function setMode(mode) {
  if (ST.mode === mode) return;
  ST.mode = mode;
  // 关键：模式画布只有一块，只要画布上不是目标模式就必须重新烘焙。
  // 旧写法 `if (!baked[mode])` 会让「切回之前看过的模式」变成一个空操作 → 切几次后地图就不变了。
  if (bakedNow !== mode) bakeNow(mode);
  document.querySelectorAll("#modes .btn").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
  fillLegend();
  drawMini(); render(); drawOverlay();
}

function fillLegend() {
  const el = $("legend"), m = ST.mode;
  if (m === "political" || m === "province") { el.style.display = "none"; return; }
  el.style.display = "block";
  if (m === "bloc") {
    const order = ["NATO", "WP", "SOV", "CHN", "W", "NA", "NE"];
    el.innerHTML = '<div class="t">阵营</div>' + order.map((b) =>
      '<div class="r"><i style="background:' + BLOC[b] + '"></i>' + BLOC_ZH[b] + "</div>").join("");
  } else if (m === "delta") {
    el.innerHTML = '<div class="t">变化（实际产出 · 较 1980）</div>' +
      '<div class="r"><i style="background:linear-gradient(90deg,#2a6493,#39424c,#c8a95a)"></i>跌 ← 0 → 涨</div>' +
      '<div class="r2">固定尺度 ±' + Math.round(DELTA_SPAN * 100) + '%　·　' + ST.mode + '</div>';
  } else if (m === "resource") {
    el.innerHTML = '<div class="t">战略资源综合自给度</div>' +
      '<div class="r"><i style="background:linear-gradient(90deg,#264366,#3e474f,#d4af37)"></i>短缺依赖 ← 自给 → 丰饶出超</div>' +
      '<div class="r2">产销净盈余加权 · 1980 战略底座</div>';
  } else {
    const key = m === "pop" ? "pop_m" : "industry_bn";
    const vals = Object.keys(CM.countries).map((k) => CM.countries[k][key]);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    el.innerHTML = '<div class="t">' + (m === "pop" ? "人口（百万·对数色阶）" : "工业产值（十亿美元·对数色阶）") +
      '</div><div class="r"><i class="grad"></i></div><div class="r2">低 ' + lo + "  →  高 " + hi +
      '</div><div class="r2" id="lg-hov">悬停国家后显示其取值</div>';
  }
}

// ---------------------------------------------------------------- view
function resize(initial) {
  const cw = Math.max(320, window.innerWidth), ch = Math.max(240, window.innerHeight);
  [mapCan, ovCan].forEach((c) => { c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR); });
  bimg = mctx2.createImageData(mapCan.width, mapCan.height);
  oimg = octx.createImageData(mapCan.width, mapCan.height);
  if (initial) {
    view.s = Math.min(mapCan.width / W, mapCan.height / H);
    view.fit = view.s;
    view.x = (W - mapCan.width / view.s) / 2;
    view.y = (H - mapCan.height / view.s) / 2;
  }
  clampView();
  drawMini();
}
function cssW() { return mapCan.width / DPR; }
function clampView() {
  const mw = mapCan.width / view.s, mh = mapCan.height / view.s;
  view.s = clamp(view.s, view.fit * 0.5, view.fit * 40);
  // 外圈缓冲：允许把地图推到「只剩 40% 屏幕可见」，这样最外圈的国家（阿拉斯加、新西兰、
  // 西伯利亚东端…）都能被拖到屏幕中间，不会被顶栏/侧栏遮住或卡在边界上看不到。
  const kx = mw * 0.4, ky = mh * 0.4;
  view.x = clamp(view.x, -(mw - kx), W - kx);
  view.y = clamp(view.y, -(mh - ky), H - ky);
}
function screenToRaster(sx, sy) {
  const P = view.s * DPR;
  return [view.x + sx * DPR / P, view.y + sy * DPR / P];
}
function flyTo(x0, y0, x1, y1, ms) {
  const tw = Math.max(24, x1 - x0), th = Math.max(24, y1 - y0);
  const s2 = clamp(Math.min(mapCan.width / (tw * 1.6), mapCan.height / (th * 1.6)), view.fit * 0.5, view.fit * 40);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tx = cx - (mapCan.width / s2) / 2, ty = cy - (mapCan.height / s2) / 2;
  const s0 = view.s, ax = view.x, ay = view.y, t0 = performance.now();
  ms = ms || 420;
  (function step() {
    const t = clamp((performance.now() - t0) / ms, 0, 1), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    view.s = s0 + (s2 - s0) * e; view.x = ax + (tx - ax) * e; view.y = ay + (ty - ay) * e;
    clampView(); render(); drawOverlay();
    if (t < 1) requestAnimationFrame(step);
  })();
}

// ---------------------------------------------------------------- render
function maps(cw, ch, P) {
  if (xmapP !== P || xmapX !== view.x || !xmapA || xmapA.length !== cw) {
    xmapA = new Int32Array(cw); xmapP = P; xmapX = view.x;
    for (let i = 0; i < cw; i++) xmapA[i] = Math.floor(view.x + (i + 0.5) / P);
  }
  if (ymapP !== P || ymapY !== view.y || !ymapA || ymapA.length !== ch) {
    ymapA = new Int32Array(ch); ymapP = P; ymapY = view.y;
    for (let i = 0; i < ch; i++) ymapA[i] = Math.floor(view.y + (i + 0.5) / P);
  }
  return [xmapA, ymapA];
}
function render() {
  const cw = mapCan.width, ch = mapCan.height, P = view.s * DPR;
  mctx2.setTransform(1, 0, 0, 1, 0, 0);
  mctx2.fillStyle = GUTTER; mctx2.fillRect(0, 0, cw, ch);   // 地图外圈的缓冲底色（比海洋略深，像装裱）
  let sx0 = view.x, sy0 = view.y, sw = cw / P, sh = ch / P, dx = 0, dy = 0, dw = cw, dh = ch;
  if (sx0 < 0) { const c = -sx0; sx0 = 0; sw -= c; dx += c * P; dw -= c * P; }
  if (sy0 < 0) { const c = -sy0; sy0 = 0; sh -= c; dy += c * P; dh -= c * P; }
  if (sx0 + sw > W) { const c = (sx0 + sw) - W; sw -= c; dw -= c * P; }
  if (sy0 + sh > H) { const c = (sy0 + sh) - H; sh -= c; dh -= c * P; }
  mctx2.imageSmoothingEnabled = false;
  if (sw > 0 && sh > 0 && dw > 0 && dh > 0) mctx2.drawImage(modeCan, sx0, sy0, sw, sh, dx, dy, dw, dh);
  drawFrame(P, cw, ch);
}

// 地图外框：一圈细亮线 + 外侧一点渐隐发光，让地图“浮”在缓冲底色上（大幅平移时不会糊成一片黑）
function drawFrame(P, cw, ch) {
  const x0 = (0 - view.x) * P, y0 = (0 - view.y) * P;
  const x1 = (W - view.x) * P, y1 = (H - view.y) * P;
  if (x1 < -8 || y1 < -8 || x0 > cw + 8 || y0 > ch + 8) return;
  mctx2.setTransform(1, 0, 0, 1, 0, 0);
  mctx2.lineWidth = 1;
  for (let k = 3; k >= 1; k--) {
    mctx2.strokeStyle = "rgba(140,175,205," + (0.05 / k) + ")";
    mctx2.strokeRect(x0 - k + 0.5, y0 - k + 0.5, (x1 - x0) + 2 * k - 1, (y1 - y0) + 2 * k - 1);
  }
  mctx2.strokeStyle = "rgba(160,195,225,0.30)";
  mctx2.strokeRect(x0 + 0.5, y0 + 0.5, (x1 - x0) - 1, (y1 - y0) - 1);
}
// ---- 矢量边界：delta-int16(×2) 解码为浮点折线，zoom 大时替代像素边界（平滑） ----
function decodeVB(arr) {
  return arr.map(function (p) {
    const pts = new Float32Array(p.length / 2);
    pts[0] = p[0] / 2; pts[1] = p[1] / 2;
    let px = pts[0], py = pts[1];
    for (let i = 2, j = 2; i < p.length; i += 2, j += 2) {
      px += p[i] / 2; py += p[i + 1] / 2; pts[j] = px; pts[j + 1] = py;
    }
    return pts;
  });
}
function borders(cw, ch, P) {
  if (!ST.layers.province && !ST.layers.country) return;
  // 高倍缩放（>3×）走矢量平滑描边；低倍仍走 O(屏幕像素) 的查表像素边界
  if (P >= 3 && (window.W1980_BORDERS_PROVINCE || window.W1980_BORDERS_COUNTRY)) {
    bordersVector(cw, ch, P); return;
  }
  const [xm, ym] = maps(cw, ch, P);
  const d = new Uint32Array(bimg.data.buffer);
  d.fill(0);
  const PB = rgba(0, 0, 0, 0.45), CB = rgba(0, 0, 0, 0.9);
  const sp = ST.layers.province, sc = ST.layers.country;
  for (let sy = 0; sy < ch; sy++) {
    const ry = ym[sy]; if (ry < 0 || ry >= H - 1) continue;
    const row = ry * W; let di = sy * cw;
    for (let sx = 0; sx < cw; sx++, di++) {
      const rx = xm[sx]; if (rx < 0 || rx >= W - 1) continue;
      const i = row + rx, v = pid[i];
      if (v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) {
        const p = pol[i];
        if (sc && p > 0 && (p !== pol[i + 1] || p !== pol[i + W])) d[di] = CB;
        else if (sp) d[di] = PB;
      } else if (sc) {
        const p = pol[i];
        if (p > 0 && (p !== pol[i + 1] || p !== pol[i + W])) d[di] = CB;
      }
    }
  }
  mctx2.putImageData(bimg, 0, 0);
}

// 高倍缩放下的平滑矢量描边（省界细淡、国界粗深，与像素边界层级一致）
function bordersVector(cw, ch, P) {
  if (!VB_P && window.W1980_BORDERS_PROVINCE) VB_P = decodeVB(window.W1980_BORDERS_PROVINCE);
  if (!VB_C && window.W1980_BORDERS_COUNTRY) VB_C = decodeVB(window.W1980_BORDERS_COUNTRY);
  const vx0 = view.x - 2, vy0 = view.y - 2, vx1 = view.x + cw / P + 2, vy1 = view.y + ch / P + 2;
  mctx2.setTransform(1, 0, 0, 1, 0, 0);
  mctx2.lineWidth = 1; mctx2.lineJoin = "round"; mctx2.lineCap = "round";
  function drawSet(lines, stroke) {
    if (!lines) return;
    mctx2.strokeStyle = stroke; mctx2.beginPath();
    for (let li = 0; li < lines.length; li++) {
      const p = lines[li], n = p.length;
      if (n < 4) continue;
      let x0 = p[0], y0 = p[1], x1 = p[0], y1 = p[1];
      for (let k = 2; k < n; k += 2) {
        const X = p[k], Y = p[k + 1];
        if (X < x0) x0 = X; if (X > x1) x1 = X;
        if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      if (x1 < vx0 || y1 < vy0 || x0 > vx1 || y0 > vy1) continue;   // 视口外剔除
      mctx2.moveTo((p[0] - view.x) * P, (p[1] - view.y) * P);
      for (let k = 2; k < n; k += 2) mctx2.lineTo((p[k] - view.x) * P, (p[k + 1] - view.y) * P);
    }
    mctx2.stroke();
  }
  if (ST.layers.province) drawSet(VB_P, "rgba(0,0,0,0.24)");
  if (ST.layers.country) drawSet(VB_C, "rgba(0,0,0,0.54)");
}

// ---------------------------------------------------------------- overlay
function drawOverlay() {
  const cw = ovCan.width, ch = ovCan.height, P = view.s * DPR;
  const d = new Uint32Array(oimg.data.buffer);
  d.fill(0);
  const [xm, ym] = maps(cw, ch, P);
  const selKey = ST.sel, selPlay = selKey ? (playIdOfKey[selKey] || 0) : 0;
  const hov = ST.hover | 0, hovPlay = hov ? playPol[hov] : 0;
  const DIM = rgba(6, 8, 10, 0.62), HT = rgba(255, 233, 168, 0.46),
    CT = rgba(255, 255, 255, 0.12), OUT = rgba(255, 214, 107, 1);
  // 边界线：接近隐形，并且只在放大后才逐渐显影（世界视图几乎看不见）
  const zf = clamp(P / view.fit, 0, 3);
  const kb = clamp((zf - 0.9) / 1.5, 0, 1);
  const PB = rgba(12, 16, 22, 0.09 + 0.15 * kb), CB = rgba(5, 8, 12, 0.30 + 0.24 * kb);
  const sp = ST.layers.province, sc = ST.layers.country;
  for (let sy = 0; sy < ch; sy++) {
    const ry = ym[sy]; if (ry < 0 || ry >= H - 1) continue;
    const row = ry * W; let di = sy * cw;
    for (let sx = 0; sx < cw; sx++, di++) {
      const rx = xm[sx]; if (rx < 0 || rx >= W - 1) continue;
      const i = row + rx, p = pol[i], v = pid[i], pe = play[i];
      if (p > 0) {
        const bd = (p !== pol[i + 1] || p !== pol[i + W]);
        if (bd) { if (sc) d[di] = CB; else if (sp && v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) d[di] = PB; }
        else if (sp && v > 0 && (v !== pid[i + 1] || v !== pid[i + W])) d[di] = PB;
      }
      if (selPlay && ST.only !== false && pe !== selPlay) d[di] = DIM;
      if (hov) {
        if (v === hov) {
          d[di] = HT;
          if (v !== pid[i + 1] || v !== pid[i + W]) {
            d[di] = OUT;
            if (sx + 1 < cw) d[di + 1] = OUT;
            if (sy + 1 < ch) d[di + cw] = OUT;
          }
        } else if (hovPlay && pe === hovPlay) d[di] = CT;
      }
    }
  }
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, cw, ch);
  octx.putImageData(oimg, 0, 0);
  drawFeatures(cw, ch, P);
}

function drawFeatures(cw, ch, P) {
  const toX = (x) => (x - view.x) * P, toY = (y) => (y - view.y) * P;
  octx.save();
  octx.setTransform(1, 0, 0, 1, 0, 0);
  if (ST.layers.city) {
    // 城市点：随缩放分级，只留大城市；圆点、低对比，不再是一片白方块
    const zc = P / view.fit;
    const minPop = zc < 1.2 ? 5e6 : zc < 2.2 ? 1.5e6 : 0;
    const r = zc < 1.2 ? 0.9 : zc < 2.2 ? 1.2 : 1.6;
    if (minPop === 0 || zc >= 0.6) {
      octx.fillStyle = "rgba(233,227,209,0.42)";
      for (let i = 0; i < CITY.length; i++) {
        const c = CITY[i];
        if (c[3] < minPop) continue;
        const x = toX(c[1]), y = toY(c[2]);
        if (x < -6 || y < -6 || x > cw + 6 || y > ch + 6) continue;
        octx.beginPath(); octx.arc(x, y, r, 0, 6.2832); octx.fill();
      }
    }
  }
  if (ST.layers.capital) {
    const zs = P / view.fit;
    const fs = zs < 1.2 ? 10 : zs < 2.5 ? 13 : 15;
    octx.font = "600 " + fs + "px 'Segoe UI Symbol',sans-serif";
    octx.textAlign = "center"; octx.textBaseline = "middle";
    octx.lineWidth = Math.max(1.5, fs / 7); octx.strokeStyle = "rgba(0,0,0,0.7)";
    octx.fillStyle = "rgba(255,214,107,0.88)";
    for (const k in CM.countries) {
      const c = CM.countries[k]; if (!c.capital_px) continue;
      const x = toX(c.capital_px[0]), y = toY(c.capital_px[1]);
      if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
      octx.strokeText("★", x, y); octx.fillText("★", x, y);
    }
  }
  if (ST.layers.label) {
    octx.textAlign = "center"; octx.textBaseline = "middle";
    octx.font = "700 12px 'Microsoft YaHei',sans-serif";
    const placed = [];
    const keys = Object.keys(CM.countries).sort((a, b) => CM.countries[b].area_km2 - CM.countries[a].area_km2);
    for (const k of keys) {
      const c = CM.countries[k]; if (!c.label_px) continue;
      const x = toX(c.label_px[0]), y = toY(c.label_px[1]);
      if (x < 20 || y < 20 || x > cw - 20 || y > ch - 20) continue;
      let ok = true;
      for (const p of placed) if (Math.abs(p[0] - x) < 58 && Math.abs(p[1] - y) < 18) { ok = false; break; }
      if (!ok) continue;
      placed.push([x, y]);
      octx.lineWidth = 3; octx.strokeStyle = "rgba(0,0,0,0.8)";
      octx.fillStyle = "#efe9dc";
      octx.strokeText(c.zh, x, y); octx.fillText(c.zh, x, y);
    }
  }
  octx.restore();
}

// ---------------------------------------------------------------- ui
function buildUI() {
  const md = $("modes");
  MODES.forEach(([m, zh, key]) => {
    const b = document.createElement("button");
    b.className = "btn" + (m === ST.mode ? " on" : ""); b.dataset.m = m;
    b.innerHTML = zh + '<span class="mk">' + key + "</span>";
    b.title = "地图模式：" + zh;
    b.onclick = () => setMode(m);
    md.appendChild(b);
  });
  const ly = $("layers");
  LAYERS.forEach(([k, zh]) => {
    const b = document.createElement("button");
    b.className = "btn" + (ST.layers[k] ? " on" : ""); b.dataset.l = k;
    b.innerHTML = zh + '<span class="dot"></span>';
    b.onclick = () => {
      ST.layers[k] = !ST.layers[k];
      b.classList.toggle("on", ST.layers[k]);
      render(); drawOverlay();
    };
    ly.appendChild(b);
  });
  const statsBody = $("stats-t");
  $("b-stats").onclick = () => togglePanel("stats");
  $("b-help").onclick = () => togglePanel("help");
  const bSumm = $("b-summit");
  if (bSumm) bSumm.onclick = () => openSummitModal();
  const sClose = $("summit-close");
  if (sClose) sClose.onclick = closeSummitModal;
  const sShelve = $("summit-shelve-btn");
  if (sShelve) sShelve.onclick = closeSummitModal;
  const sWalkout = $("summit-walkout-btn");
  if (sWalkout) sWalkout.onclick = walkoutSummit;
  const bUnsc = $("b-unsc");
  if (bUnsc) bUnsc.onclick = () => openUNSCModal();
  const uClose = $("unsc-close");
  if (uClose) uClose.onclick = closeUNSCModal;
  const uCloseBtn = $("unsc-close-btn");
  if (uCloseBtn) uCloseBtn.onclick = closeUNSCModal;
  const uFavor = $("unsc-vote-favor");
  if (uFavor) uFavor.onclick = () => voteUNSC("in_favor");
  const uAbstain = $("unsc-vote-abstain");
  if (uAbstain) uAbstain.onclick = () => voteUNSC("abstain");
  const uVeto = $("unsc-vote-veto");
  if (uVeto) uVeto.onclick = () => voteUNSC("veto");
  const uSelect = $("unsc-res-select");
  if (uSelect) uSelect.onchange = () => openUNSCModal(uSelect.value);
  const binb = $("b-inbox");
  if (binb) binb.onclick = () => {
    togglePanel("inbox");
    if ($("inbox").classList.contains("open")) { EV.unread = 0; renderInbox(); }   // 打开即视为已读
  };
  renderInbox();
  const bsound = $("b-sound");
  if (bsound) bsound.onclick = toggleSoundMute;
  refreshSoundBtn();
  // R3：玩家决策控件（军费滑杆 / 设为本国 / 取消本国）
  const mr = $("p-mil"); if (mr) mr.oninput = () => setMil(mr.value);
  const mk = $("p-mkplayer"); if (mk) mk.onclick = () => { if (ST.sel) setPlayer(ST.sel); };
  const moff = $("p-mil-off"); if (moff) moff.onclick = () => setPlayer(null);
  wireDecUI();                       // R5C'：制裁/军援下拉与档位按钮
  const bsel = $("p-bloc-sel"); if (bsel) bsel.onchange = () => setBloc(bsel.value || null);   // R5E：迁入/退出阵营
  updPlayerTag(); refreshMilBox();
  wirePanelTabs();                   // R11A：绑定右侧面板 Tabs 点击事件
  const btut = $("b-tut"); if (btut) btut.onclick = () => tutStart(0);
  // R4：终局结算页脚按钮（在 HTML 里固定，不随正文滚动）
  const eagain = $("e-again"); if (eagain) eagain.onclick = () => { $("end").classList.remove("open"); simReset(); };
  const eclose = $("e-close"); if (eclose) eclose.onclick = () => simEndClose();
  const ecopy = $("e-copy"); if (ecopy) ecopy.onclick = () => copyMemoirs(endStats());
  wireEndTabs();
  $("b-export").onclick = exportPNG;
  $("b-save").onclick = () => { saveFromUi(0); };
  $("b-load").onclick = () => { loadFromUi(0); };
  wireSavesPanel();
  document.querySelectorAll(".fl .hd .x").forEach((x) => x.onclick = () => $(x.dataset.close).classList.remove("open"));
  document.querySelectorAll("#stats .tabs .btn").forEach((b) => b.onclick = () => {
    ST.sortKey = b.dataset.sort;
    document.querySelectorAll("#stats .tabs .btn").forEach((o) => o.classList.toggle("on", o === b));
    fillStats();
  });
  $("p-loc").onclick = () => { const c = CM.countries[ST.sel]; if (c && c.capital_px) flyTo(c.capital_px[0] - 400, c.capital_px[1] - 250, c.capital_px[0] + 400, c.capital_px[1] + 250, 500); };
  $("p-only").onclick = () => {
    ST.only = !ST.only;
    $("p-only").classList.toggle("on", ST.only);
    drawOverlay();
  };
  $("p-reset").onclick = () => { select(null); };
  const sh = $("search");
  sh.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    const q = sh.value.trim().toLowerCase(); if (!q) return;
    const hit = Object.keys(CM.countries).find((k) => k.toLowerCase() === q) ||
      Object.keys(CM.countries).find((k) => CM.countries[k].zh.indexOf(q) >= 0 || k.toLowerCase().indexOf(q) >= 0);
    if (hit) { const bb = countryBBox(hit); if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 500); select(hit); }
    else { const p = CITY.find((c) => c[0].toLowerCase() === q); if (p) flyTo(p[1] - 300, p[2] - 200, p[1] + 300, p[2] + 200, 500); }
  };
  window.addEventListener("resize", onWindowResize);
  wireMouse();
  wireKeys();
  tutWire();
  fillLegend();
  fillStats(); fillTop(); select(null);
}

function refreshLayerBtns() {
  document.querySelectorAll("#layers .btn").forEach((b) => {
    const k = b.dataset.l; if (k) b.classList.toggle("on", !!ST.layers[k]);
  });
}
function togglePanel(id) {
  const el = $(id);
  ["stats", "help", "inbox"].forEach((o) => {
    if (o === id) return;
    const e2 = $(o); if (e2) e2.classList.remove("open");
  });
  el.classList.toggle("open");
}

function countryBBox(k) {
  const pids = playPids[k];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const pidS in PM) { const p = PM[pidS];
    if (pids ? !pids.has(p.polity) : p.polity !== k) continue;
    if (p.bbox[0] < x0) x0 = p.bbox[0]; if (p.bbox[1] < y0) y0 = p.bbox[1];
    if (p.bbox[2] > x1) x1 = p.bbox[2]; if (p.bbox[3] > y1) y1 = p.bbox[3]; }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

function fillTop() {
  let pop = 0, gdp = 0, ind = 0, prov = 0;
  for (const k in CM.countries) { const v = simVal(k); pop += v.pop_m; gdp += v.gdp_bn; ind += v.industry_bn; prov += CM.countries[k].province_count; }
  ST.world = { pop: pop, gdp: gdp, ind: ind, prov: prov, ct: Object.keys(CM.countries).length };
  setTop(ST.sel);
}
function setTop(k) {
  const w = ST.world;
  const c = k ? CM.countries[k] : null;
  const v = k ? simVal(k) : null;
  $("r-pop").textContent = fmtPop(v ? v.pop_m : w.pop);
  $("r-gdp").textContent = fmtMoney(v ? v.gdp_bn : w.gdp);
  $("r-ind").textContent = fmtMoney(v ? v.industry_bn : w.ind);
  $("r-prov").textContent = (c ? c.province_count : w.prov) + " 省";
  $("r-ctry").textContent = (c ? 1 : w.ct) + " 国";
  // R2 T2：产出同比增速（世界合计 / 选中实体），1981-02 之前历史不足 → 「—」
  const gv = k ? growthOf(entKeys(k)) : growthWorld();
  const ge = $("r-grw");
  if (ge) {
    ge.textContent = growthText(gv);
    ge.style.color = gv === null ? "" : (gv >= 0 ? "#8fd18f" : "#e0a35a");
  }
  $("topbar").classList.toggle("sel", !!k);
}

function fillStats() {
  const keys = Object.keys(CM.countries);
  const key = ST.sortKey;
  const valOf = (k) => key === "area_km2" ? CM.countries[k].area_km2 : simVal(k)[key];
  // R2 T6 / P2-3：1980 基准名次（countries.js 的 pop_m/gdp_bn/industry_bn/area_km2 即 1980 值）
  const baseOf = (k) => { const c = CM.countries[k]; return key === "area_km2" ? c.area_km2 : c[key]; };
  const baseRank = {};
  keys.slice().sort((a, b) => baseOf(b) - baseOf(a)).forEach((k, i) => { baseRank[k] = i + 1; });
  keys.sort((a, b) => valOf(b) - valOf(a));
  const rows = keys.slice(0, 15).map((k, i) => {
    const c = CM.countries[k];
    const vv = valOf(k);
    const val = key === "pop_m" ? fmtPop(vv) : key === "area_km2" ? (vv / 1e6).toFixed(2) + " 百万 km²" : fmtMoney(vv);
    const dr = (baseRank[k] || i + 1) - (i + 1);
    const dt = dr === 0 ? '<span class="eq">—</span>'
      : dr > 0 ? '<span class="up">▲' + dr + "</span>" : '<span class="dn">▼' + (-dr) + "</span>";
    return '<tr data-k="' + k + '"><td class="n">' + (i + 1) + '</td><td><span class="sw" style="background:' +
      ST.colors[k] + '"></span>' + c.zh + (SIM.S && W1980_SIM.isDissolved(SIM.S, k) ? "（已解体）" : "") +
      '</td><td class="r" title="较 1980 名次变化">' + dt + '</td><td class="v">' + val + "</td></tr>";
  }).join("");
  $("stats-t").innerHTML = rows;
  $("stats-t").querySelectorAll("tr").forEach((tr) => tr.onclick = () => {
    const k = tr.dataset.k, bb = countryBBox(k);
    if (bb) flyTo(bb[0], bb[1], bb[2], bb[3], 500);
    select(k);
  });
}

function select(k) {
  ST.sel = k;
  const p = $("panel");
  if (!k) { p.classList.remove("open"); setTop(null); fillSpark(null); refreshMilBox(); drawOverlay(); return; }
  const c = CM.countries[k];
  $("p-sw").style.background = ST.colors[k];
  $("p-name").textContent = c.zh + " " + k + (SIM.S && W1980_SIM.isDissolved(SIM.S, k) ? "（已解体）" : "");
  $("p-en").textContent = (c.en || k) + " · " + k;
  const bl = blocOf(k);                 // R5E：badge 读 override
  $("p-bloc").textContent = BLOC_ZH[bl] || bl;
  $("p-bloc").style.borderColor = BLOC[bl] || "#9B9B9B";
  $("p-bloc").style.color = BLOC[bl] || "#9B9B9B";
  const v = simVal(k);
  $("p-pop").textContent = v.pop_m.toFixed(1) + " 百万" + deltaTag(c.pop_m, v.pop_m);
  $("p-gdp").textContent = v.gdp_bn.toFixed(0) + " 十亿美元" + deltaTag(c.gdp_bn, v.gdp_bn);
  $("p-ind").textContent = v.industry_bn.toFixed(0) + " 十亿美元" + deltaTag(c.industry_bn, v.industry_bn);
  const pc = v.pop_m > 0 ? v.gdp_bn * 1e9 / (v.pop_m * 1e6) : 0;
  $("p-pc").textContent = Math.round(pc).toLocaleString() + " 美元";
  const ip = v.gdp_bn > 0 ? v.industry_bn / v.gdp_bn * 100 : 0;
  $("p-ip").textContent = ip.toFixed(1) + " %";
  $("p-area").textContent = fmtArea2(c.area_km2);
  $("p-pv").textContent = c.province_count + " 省";
  $("p-cap").textContent = c.capital || "—";
  // M6：解体实体显示成员独立结算明细（栅格不变）
  const pd = $("p-diss");
  if (pd) {
    const diss = SIM.S && W1980_SIM.isDissolved(SIM.S, k);
    if (diss && c.members && c.members.length) {
      const D = window.W1980_SIMDATA;
      let html = '<div class="dt">已解体（1991-12）· 仅显示标记</div>' +
        '<div style="margin-bottom:4px">共和国级经济未单独建模（§4 表 SUN 为原子实体）；以下为并入成员：</div><table>';
      for (const mm of c.members) {
        if (D.popStart[mm.key] === undefined) continue;
        const pop = SIM.S.pop[mm.key], gdp = D.gdp1980[mm.key] * SIM.S.gdp[mm.key];
        html += "<tr><td>" + (mm.zh || mm.key) + '</td><td class="v">' + pop.toFixed(1) + " 百万 / " + gdp.toFixed(0) + " 十亿</td></tr>";
      }
      pd.innerHTML = html + "</table>"; pd.style.display = "block";
    } else { pd.style.display = "none"; pd.innerHTML = ""; }
  }
  p.classList.add("open");
  ST.only = true;
  $("p-only").classList.add("on");
  fillSpark(k);                     // R2 T5
  refreshMilBox();                  // R3：决策区随选中实体切换
  refreshLeaderCard(k);             // R14：更新领袖肖像卡片
  setTop(k);
  drawOverlay();
}

// ---------------------------------------------------------------- mouse
function hitTest(sx, sy) {
  const [rx, ry] = screenToRaster(sx, sy);
  const x = Math.floor(rx), y = Math.floor(ry);
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return pid[y * W + x];
}
function wireMouse() {
  const el = $("stage");
  let down = false, lx = 0, ly = 0, moved = 0;
  el.addEventListener("mousedown", (e) => { down = true; moved = 0; lx = e.clientX; ly = e.clientY; });
  window.addEventListener("mouseup", () => { down = false; });
  el.addEventListener("mousemove", (e) => {
    if (down) {
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      view.x -= dx / view.s; view.y -= dy / view.s; lx = e.clientX; ly = e.clientY;
      clampView(); render(); drawOverlay(); return;
    }
    const r = el.getBoundingClientRect();
    hover(e.clientX - r.left, e.clientY - r.top);
  });
  el.addEventListener("mouseleave", () => { ST.hover = 0; ST.hoverC = null; drawOverlay(); setHint(0); });
  el.addEventListener("click", (e) => {
    if (moved > 4) return;
    const r = el.getBoundingClientRect();
    const p = hitTest(e.clientX - r.left, e.clientY - r.top);
    select(p ? provKey(p) : null);
  });
  el.addEventListener("dblclick", (e) => {
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [rx, ry] = screenToRaster(sx, sy);
    zoomAt(sx, sy, 2);
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18);
  }, { passive: false });
  $("minic").addEventListener("mousedown", (e) => {
    const r = e.target.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    view.x = fx * W - (mapCan.width / view.s) / 2;
    view.y = fy * H - (mapCan.height / view.s) / 2;
    clampView(); render(); drawOverlay();
  });
}
function zoomAt(sx, sy, f) {
  const [rx, ry] = screenToRaster(sx, sy);
  view.s = clamp(view.s * f, view.fit * 0.5, view.fit * 40);
  const P = view.s * DPR;
  view.x = rx - sx * DPR / P; view.y = ry - sy * DPR / P;
  clampView(); render(); drawOverlay(); drawMini();
}
function provKey(p) { const pe = playPol[p]; return (pe && playKeys[pe]) || CM.byId[provPol[p]] || null; }

let hoverT = 0;
function hover(sx, sy) {
  const p = hitTest(sx, sy);
  if (p === ST.hover) return;
  ST.hover = p;
  ST.hoverC = p ? provKey(p) : null;
  setHint(p);
  drawOverlay();
}
function setHint(p) {
  if (!p) {
    $("h-prov").textContent = "未建模区域 / 海洋"; $("h-ctry").textContent = "—";
    $("h-pop").textContent = "—"; $("h-area").textContent = "—"; return;
  }
  const pr = PM[p];
  const ek = provKey(p) || CM.byId[pr.polity];
  const c = ek ? CM.countries[ek] : null;
  if (!c) { $("h-prov").textContent = pr.name + "  #" + p; $("h-ctry").textContent = "—";
    $("h-pop").textContent = "—"; $("h-area").textContent = Math.round(pr.area_km2).toLocaleString() + " km²"; return; }
  $("h-prov").textContent = pr.name + "  #" + p;
  let ctryTxt = c.zh + (c.parent ? "（附属·宗主 " + (CM.countries[c.parent] || {}).zh + "）" : "（" + (BLOC_ZH[c.bloc] || c.bloc) + "）");
  const fl = ST.frontlines ? ST.frontlines[p] : null;
  if (fl && fl.occupier) {
    const occC = CM.countries[fl.occupier];
    const occName = occC ? occC.zh : fl.occupier;
    ctryTxt += " · 【交战控制：" + occName + "】";
  }
  if (ST.mode === "resource" && ek) {
    const rd = (window.W1980_RESOURCES && window.W1980_RESOURCES.get(ek)) || null;
    if (rd) {
      ctryTxt += " · 资源安全: " + (rd.summary.securityScore >= 0 ? "+" : "") + rd.summary.securityScore + " [" + rd.summary.tag + "]";
    }
  }
  $("h-ctry").textContent = ctryTxt;
  const pop = c.pop_m * (pr.area_km2 / c.area_km2);
  $("h-pop").textContent = "约 " + (pop >= 1 ? pop.toFixed(1) + " 百万" : (pop * 100).toFixed(0) + " 万");
  $("h-area").textContent = Math.round(pr.area_km2).toLocaleString() + " km²";
}

function wireKeys() {
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const c = { 0: () => { view.s = view.fit; view.x = (W - mapCan.width / view.s) / 2; view.y = (H - mapCan.height / view.s) / 2; clampView(); render(); drawOverlay(); drawMini(); },
      "+": () => zoomAt(cssW() / 2, cssH() / 2, 1.3), "=": () => zoomAt(cssW() / 2, cssH() / 2, 1.3),
      "-": () => zoomAt(cssW() / 2, cssH() / 2, 1 / 1.3),
      Escape: () => select(null) }[e.key];
    if (c) { c(); return; }
    if (e.key === " ") { e.preventDefault(); simTogglePlay(); return; }
    if (e.key === "r" || e.key === "R") { simReset(); return; }
    if (e.key === "m" || e.key === "M") {
      const i = MODES.findIndex((m) => m[0] === ST.mode);
      setMode(MODES[(i + 1) % MODES.length][0]);
    }
    // R2 T4：模式数由 5 → 6（原来写死 1..5）
    const mi = +e.key;
    if (mi >= 1 && mi <= MODES.length) setMode(MODES[mi - 1][0]);
  });
}
function cssH() { return ovCan.height / DPR; }

// ---------------------------------------------------------------- minimap
function mapSig() {
  try {
    const im = mctx2.getImageData(0, 0, mapCan.width, mapCan.height).data;
    let s = 2166136261;
    for (let i = 0; i < im.length; i += 4021) { s = ((s ^ im[i]) * 16777619) & 0x7fffffff; }
    return s.toString(16);
  } catch (e) { return "ERR"; }
}

function drawMini() {
  const mc = $("minic"), x = mc.getContext("2d");
  x.imageSmoothingEnabled = true;
  x.clearRect(0, 0, mc.width, mc.height);
  x.drawImage(modeCan, 0, 0, W, H, 0, 0, mc.width, mc.height);
  const mw = mapCan.width / view.s, mh = mapCan.height / view.s;
  const v = $("miniview"), wrap = $("mini");
  const cw = mc.clientWidth, chh = mc.clientHeight;
  const l = clamp((view.x / W) * cw, -2, cw), t = clamp((view.y / H) * chh, -2, chh);
  const w0 = Math.min(Math.max(6, (mw / W) * cw), cw - Math.max(0, l));
  const h0 = Math.min(Math.max(6, (mh / H) * chh), chh - Math.max(0, t));
  v.style.left = (mc.offsetLeft + l) + "px";
  v.style.top = (mc.offsetTop + t) + "px";
  v.style.width = Math.max(6, w0) + "px";
  v.style.height = Math.max(6, h0) + "px";
}

// ---------------------------------------------------------------- export
function composeDataURL() {
  const c = document.createElement("canvas");
  c.width = mapCan.width; c.height = mapCan.height;
  const x = c.getContext("2d");
  x.drawImage(mapCan, 0, 0); x.drawImage(ovCan, 0, 0);
  return c.toDataURL("image/png");
}
function exportPNG() {
  const a = document.createElement("a");
  a.download = "world1980_" + ST.mode + ".png";
  a.href = composeDataURL();
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------------------------------------------------------------- help text
function fillHelp() {
  $("k-base").textContent = W + " × " + H;
  $("k-aspect").textContent = CK.aspect.toFixed(6) + "（W/H）";
  $("k-km2").textContent = KM2.toFixed(3) + " km²/px";
  const ata = CK.ataPx || 0;
  const landNoAta = (CK.landPx - ata) * KM2;
  $("k-lintest").textContent = "等面积自检：Equal Earth 雅可比 max|J/cosφ-1| = 1.6e-8（管线实测），无 Mercator/Miller，无非等比拉伸。";
  $("k-land").textContent = "全球非南极陆地总面积 ≈ " + (landNoAta / 1e8).toFixed(3) +
    " 亿 km²（真实约 1.35 亿）· 全陆地（含南极）" + (CK.landAreaKm2 / 1e8).toFixed(3) + " 亿 km²";
  const A = (k) => CM.countries[k].area_km2 / 1e6;
  $("k-rank").textContent = "实测：苏联 " + A("SUN").toFixed(2) + " > 加拿大 " + A("CAN").toFixed(2) +
    " > 中国 " + A("CHN").toFixed(2) + " / 美国 " + A("USA").toFixed(2) + " > 巴西 " + A("BRA").toFixed(2) +
    " > 澳大利亚 " + A("AUS").toFixed(2) + " 百万 km²";
}
