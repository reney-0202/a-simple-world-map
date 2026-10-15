// CDP check for the Phase J asset optimisation: prove the optimised ID rasters
// decode to byte-identical pixel data in a real browser canvas.
//
// The runtime derives its tables from getImageData() on a canvas draw, so any
// re-encoding (palette, quantisation) is only safe if the *decoded* RGBA is
// unchanged. This harness decodes the pre-optimisation PNG (kept in a backup
// dir) and the shipped one through exactly the same path the game uses
// (10-events-save.js loadPixels) and compares the derived arrays.
//
// Usage: node cdp_id_raster_check.js <out_dir> <orig_dir>
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const OUT = path.resolve(process.argv[2]);
const ORIG = path.resolve(process.argv[3]);
const PORT = 8903;
const CDP_PORT = 9228;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const W = 4096, H = 1994;

const RASTERS = [
  { req: "data/country_id.png", derive: "country" },
  { req: "data/playable_id.png", derive: "playable" },
  { req: "data/province_id.png", derive: "province" },
];

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split("?")[0]);
    if (u === "/" || u === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      return res.end(PAGE);
    }
    // /o/<name> -> original backup, /n/<name> -> shipped
    let fp = null;
    if (u.startsWith("/o/")) fp = path.join(ORIG, u.slice(3).replace(/\//g, path.sep));
    else if (u.startsWith("/n/")) fp = path.join(OUT, u.slice(3).replace(/\//g, path.sep));
    if (!fp) { res.writeHead(404); return res.end("404"); }
    fs.readFile(fp, (e, buf) => {
      if (e) { res.writeHead(404); return res.end("404"); }
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((r) => srv.listen(PORT, "127.0.0.1", () => r(srv)));
}

// Mirrors 10-events-save.js loadPixels() exactly, then the two derivations used
// by 11-shell.js load(): pid/pol/landm/play.
const PAGE = `<!doctype html><meta charset="utf-8"><title>id raster check</title>
<script>
const W = ${W}, H = ${H};
function loadPixels(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(im, 0, 0);
      res(x.getImageData(0, 0, W, H).data);
    };
    im.onerror = () => rej(new Error("load failed: " + url));
    im.src = url;
  });
}
window.__check = async function (file, derive) {
  const a = await loadPixels("/o/" + file);
  const b = await loadPixels("/n/" + file);
  let diff = 0, first = null, maxDelta = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) { diff++; if (d > maxDelta) maxDelta = d; if (!first) first = i; }
  }
  // derived arrays exactly as the game computes them
  const N = W * H;
  let derivedDiff = 0;
  if (derive === "province") {
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const pa = a[j] | (a[j+1] << 8) | (a[j+2] << 16);
      const pb = b[j] | (b[j+1] << 8) | (b[j+2] << 16);
      if (pa !== pb) derivedDiff++;
    }
  } else {
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const pa = a[j] | (a[j+1] << 8) | (a[j+2] << 16);
      const pb = b[j] | (b[j+1] << 8) | (b[j+2] << 16);
      if (pa !== pb) derivedDiff++;
      if (derive === "country") {
        if ((a[j+3] > 0 ? 1 : 0) !== (b[j+3] > 0 ? 1 : 0)) derivedDiff++;
      }
    }
  }
  let nz = 0, sum = 0;
  for (let i = 0, j = 0; i < N; i++, j += 4) { const v = b[j] | (b[j+1] << 8) | (b[j+2] << 16); if (v) { nz++; sum += v; } }
  return { file, derive, bytes: a.length, diffBytes: diff, maxDelta, firstDiffAt: first, derivedDiff, nz, sum };
};
</script>`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const t = list.find((x) => x.type === "page" && x.url.includes("127.0.0.1"));
      if (t) return t;
    } catch {}
    await sleep(200);
  }
  throw new Error("CDP target not found");
}

async function main() {
  const srv = await serve();
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "cdpid-"));
  const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--mute-audio",
    `--user-data-dir=${udd}`, "--window-size=1200,800",
    `--remote-debugging-port=${CDP_PORT}`, `http://127.0.0.1:${PORT}/index.html`], { stdio: "ignore" });

  let ok = true;
  const fail = (m) => { ok = false; console.log("   FAIL: " + m); };
  try {
    const t = await findTarget();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pend = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evalJs = async (expr) => {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r.result.value;
    };

    for (let i = 0; i < 50; i++) { if (await evalJs("typeof window.__check === 'function'")) break; await sleep(200); }

    for (const r of RASTERS) {
      const res = await evalJs(`window.__check(${JSON.stringify(r.req)}, ${JSON.stringify(r.derive)})`);
      console.log(`${res.file} (${res.derive})`);
      console.log(`   decoded bytes=${res.bytes}  differing bytes=${res.diffBytes}  maxDelta=${res.maxDelta}  derived diff=${res.derivedDiff}`);
      if (res.diffBytes !== 0 || res.derivedDiff !== 0) {
        fail(`${res.file}: decoded pixels differ (first at byte ${res.firstDiffAt})`);
      }
    }
    ws.close();
  } finally {
    edge.kill();
    srv.close();
  }
  console.log("RESULT:", ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
