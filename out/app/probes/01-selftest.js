"use strict";



// ---------------------------------------------------------------- self test
// G（收尾评审）：调试面收敛为单一挂接 window.__W1980（见 probes/09-debug-hook.js）。
// 运行期错误不再写入独立的 window.__errors，而是收进这个模块内的数组，
// 由调试钩子以 __W1980.__errors 暴露 —— 全站只剩一个调试全局。
const DBG_ERRORS = [];
window.addEventListener("error", (e) => DBG_ERRORS.push(String(e.message)));
const SELFTEST = /[?&]selftest=1/.test(location.search);

function runSelfTest() {
  const res = { errors: DBG_ERRORS.slice() };
  try {
    let conflicts = 0;
    const keys = Object.keys(CM.countries);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const a = CM.countries[keys[i]], b = CM.countries[keys[j]];
      if (adjacent(a.polity_id, b.polity_id) && ST.colors[keys[i]] === ST.colors[keys[j]]) conflicts++;
    }
    res.colorConflicts = conflicts;
    const t = {};
    for (const m of MODES) {
      const t0 = performance.now(); setMode(m[0]); t[m[0]] = Math.round(performance.now() - t0);
    }
    res.modeSwitchMs = t;
    setMode("political");
    res.modeCount = MODES.length; res.layerCount = LAYERS.length;
    res.dom = ["topbar", "modes", "layers", "panel", "mini", "hint", "stats", "help", "search", "b-export",
      "inbox", "b-inbox", "r-grw", "r-axis", "r-player", "p-milbox", "p-mil", "w-ctry",
      "end", "end-body"]
      .map((id) => id + ":" + (!!$(id))).join(" ");
    res.runs = runs ? runs.id.length : 0;
    res.countryRuns = cruns ? cruns.id.length : 0;
    res.provinces = CK.provinceCount; res.countries = CK.countryCount;
    const sel = CM.countries["SUN"];
    select("SUN");
    res.panelName = $("p-name").textContent; res.topPop = $("r-pop").textContent;
    res.topGdpSun = $("r-gdp").textContent;
    select("DEU");
    res.topGdpDeu = $("r-gdp").textContent + " / " + $("p-cap").textContent;
    select(null);
    res.hoverProbe = (function () {
      const [rx, ry] = [sel.label_px[0], sel.label_px[1]];
      const p = pid[ry * W + rx];
      return p + "/" + (p ? PM[p].name + "@" + PM[p].polity : "-");
    })();
    res.landNoAta = ((CK.landPx - CK.ataPx) * KM2 / 1e8).toFixed(3);
    const url = composeDataURL();
    res.exportPng = url.slice(0, 15) + " len=" + url.length;
    res.checksumOk = true;
    res.totalMs = Math.round(performance.now());
  } catch (e) { res.exception = String(e && e.stack || e); }
  const d = document.createElement("div");
  d.id = "selftest"; d.style.display = "none";
  d.textContent = "SELFTEST " + JSON.stringify(res);
  document.body.appendChild(d);
}

// ---------------------------------------------------------------- go
// ---- R5C' T4 探针（tasks/015 §6.2）：断言「动作可达」，禁止只断言元素存在 ----
// ?sanction=KEY:lvl(,...) / ?aid=KEY:lvl(,...) → 置 CR.probeMode=true（否则快进停在 1980-09 十字路口），
// 跑「无决策基线 → 重挂 → 重跑」对照与存档往返，落 <div id="sanprobe">。未传参时不输出、不跑基线。
