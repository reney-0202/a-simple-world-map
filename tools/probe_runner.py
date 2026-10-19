# -*- coding: utf-8 -*-
"""world1980 headless probe runner (CI gate).

Serves an out/ directory and runs the game's built-in headless probes via a
Chromium-family browser using --dump-dom, the same technique the game's own
_headless.py uses. Each probe renders a hidden <div id="<x>probe">MARKER {json}</div>
which this runner scrapes and judges.

Usage:
    python tools/probe_runner.py run <out_dir> <results.json> [probe ...]
    python tools/probe_runner.py cmp <baseline.json> <results.json> [--strict]
    python tools/probe_runner.py count <results.json> [--json]

Exit codes:
    run   : 0 all probes ok, 1 at least one failed/missing/errored
    cmp   : 0 identical (jitter fields ignored), 2 differences present or an
            assertion count decreased (see "ASSERTION COLLAPSE")
    count : 0 always (it only reports)

Browser discovery order: $W1980_BROWSER, then the usual Edge/Chrome/Chromium
locations on Windows, macOS and Linux. Set W1980_BROWSER to override.
"""
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading

# ---- browser discovery -------------------------------------------------------
WINDOWS_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]
POSIX_CANDIDATES = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_browser():
    env = os.environ.get("W1980_BROWSER")
    if env:
        if not os.path.exists(env):
            raise SystemExit("W1980_BROWSER is set but not found: %s" % env)
        return env
    for cand in (WINDOWS_CANDIDATES if os.name == "nt" else []) + POSIX_CANDIDATES:
        if os.path.exists(cand):
            return cand
    for name in ("google-chrome", "chromium", "chromium-browser", "msedge"):
        found = shutil.which(name)
        if found:
            return found
    raise SystemExit(
        "no Chromium-family browser found; set W1980_BROWSER to its path")


BR = find_browser()

# probe key -> (query string, marker, virtual-time-budget ms)
PROBES = {
    "selftest":    ("selftest=1", "SELFTEST", 30000),
    "simprobe":    ("simprobe=1", "SIMPROBE", 60000),
    "saveprobe":   ("saveprobe=1", "SAVEPROBE", 60000),
    "endprobe":    ("end=1&t=1991-12", "ENDPROBE", 60000),
    "sanprobe":    ("sanprobe=1&player=SUN&mil=3.5", "SANPROBE", 60000),
    "decprobe":    ("decprobe=1&player=USA", "DECPROBE", 60000),
    "blocprobe":   ("bloc=WP&player=DEU", "BLOCPROBE", 60000),
    "flprobe":     ("flprobe=1", "FLPROBE", 60000),
    "warprobe":    ("warprobe=1", "WARPROBE", 60000),
    "resprobe":    ("resprobe=1", "RESPROBE", 30000),
    "tradeprobe":  ("tradeprobe=1", "TRADEPROBE", 30000),
    "embargo":     ("embargoprobe=1", "EMBARGOPROBE", 60000),
    "aiprobe":     ("aiprobe=1", "AIPROBE", 60000),
    "summitprobe": ("summitprobe=1", "SUMMITPROBE", 60000),
    "unscprobe":   ("unscprobe=1", "UNSCPROBE", 60000),
    "panelprobe":  ("panelprobe=1", "PANELPROBE", 30000),
    "newsprobe":   ("newsprobe=1", "NEWSPROBE", 60000),
    "chronicle":   ("chronicleprobe=1", "CHRONICLEPROBE", 60000),
    "domestic":    ("domesticprobe=1", "DOMESTICPROBE", 60000),
    "agenda":      ("agendaprobe=1", "AGENDAPROBE", 60000),
    "crisis":      ("crisisprobe=1", "CRISISPROBE", 60000),
    "intel":       ("intelprobe=1", "INTELPROBE", 60000),
    "afghan":      ("afghanprobe=1", "AFGHANPROBE", 60000),
    "soundprobe":  ("soundprobe=1", "SOUNDPROBE", 30000),
    "assetsprobe": ("assetsprobe=1", "ASSETSPROBE", 30000),
}

MARKER_RE = re.compile(r'>([A-Z]+PROBE|SELFTEST) (\{.*?\})</div>')

# Fields whose values are wall-clock dependent and therefore jitter between runs.
# Only these are tolerated by cmp; every simulation value must match exactly.
JITTER_FIELDS = {
    "modeSwitchMs",   # selftest: per-mode switch timings
    "totalMs",        # selftest: total elapsed
    "saveBytes",      # saveprobe: serialized size varies with the savedAt timestamp
}

# Fields whose values depend on the browser/platform canvas implementation rather
# than on the game logic: readback hashes, sampled pixel RGB strings, and the
# exported-PNG byte length (each platform's PNG encoder compresses differently).
# They are still asserted inside each probe (the `run` gate is authoritative);
# they are excluded only from the cross-platform baseline diff, where a
# Windows/Edge baseline would otherwise differ from a Linux/Chrome CI run.
PLATFORM_FIELD_PREFIXES = ("sig", "c0Rgb", "cOccRgb")
PLATFORM_FIELD_SUFFIXES = ("Rgb",)
PLATFORM_FIELDS = {"exportPng"}

# Fields compared with a tolerance rather than exactly (none today; kept explicit
# so the intent is visible if a genuinely float-noisy field appears).
TOLERANT_FIELDS = {}


def _platform_dependent(name, value):
    if name in JITTER_FIELDS or name in PLATFORM_FIELDS:
        return True
    # keep booleans (e.g. sigChanged) - they are logic-derived, not canvas-derived
    if isinstance(value, bool):
        return False
    if name.startswith(PLATFORM_FIELD_PREFIXES):
        return True
    if name.endswith(PLATFORM_FIELD_SUFFIXES):
        return True
    return False


def serve(out_dir, port):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=out_dir, **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, fmt, *args):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def run_probe(url, budget):
    tmp = tempfile.mkdtemp(prefix="w1980probe-")
    try:
        cmd = [BR, "--headless=new", "--disable-gpu", "--no-first-run",
               "--no-default-browser-check", "--disable-extensions",
               "--hide-scrollbars", "--mute-audio", "--no-sandbox",
               "--user-data-dir=" + tmp, "--window-size=1600,900",
               "--virtual-time-budget=%d" % budget, "--dump-dom", url]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return p.stdout or ""
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def parse_markers(dom):
    out = {}
    for m in MARKER_RE.finditer(dom):
        try:
            out[m.group(1)] = json.loads(m.group(2))
        except Exception as e:
            out[m.group(1)] = {"__parse_error": str(e), "__raw": m.group(2)[:2000]}
    return out


def probe_failed(r):
    """A probe is a failure if it threw, failed to parse, reported pass:false,
    emitted an explicit FAIL string marker, or reported allOk:false."""
    if not isinstance(r, dict):
        return False
    if r.get("exception") or r.get("__parse_error"):
        return True
    if any(str(v).upper().startswith("FAIL") for v in r.values() if isinstance(v, str)):
        return True
    if "pass" in r and r.get("pass") is False:
        return True
    if r.get("allOk") is False:
        return True
    return False


# Keys that describe the probe run itself rather than an observed value. The
# flat probes (selftest / simprobe / saveprobe / endprobe / sanprobe / decprobe /
# blocprobe) have no `details` object: their observations are the result keys.
NON_ASSERTION_KEYS = {
    "errors", "pass", "allOk", "assertCount", "exception",
    "__parse_error", "__raw",
}
DIAGNOSTIC_PREFIX = "__"          # probe diagnostics are not assertions


def assertion_names(result):
    """The named assertions a probe result carries.

    Assertion-style probes put them in `details` (a few older ones use
    `checks`); the flat probes expose their observations directly on the
    result. Diagnostics (`__`-prefixed) are informational and excluded: they
    may legitimately change without losing coverage.
    """
    if not isinstance(result, dict):
        return []
    for holder in ("details", "checks"):
        d = result.get(holder)
        if isinstance(d, dict):
            return [n for n in d if not n.startswith(DIAGNOSTIC_PREFIX)]
    return [n for n in result
            if not n.startswith(DIAGNOSTIC_PREFIX) and n not in NON_ASSERTION_KEYS]


def count_assertions(results):
    """Per-probe assertion counts, plus a total under the key `total`."""
    counts = {}
    for key, entry in results.items():
        counts[key] = len(assertion_names((entry or {}).get("result")))
    counts["total"] = sum(v for k, v in counts.items() if k != "total")
    return counts


def do_count(results_path, as_json=False):
    """Report how many named assertions each probe carries.

    This exists because "the probes are green" is not the same as "the probes
    still assert everything they used to": a refactor that silently drops an
    assertion keeps the suite green. `cmp` uses the same counts to fail on a
    decrease.
    """
    results = json.load(open(results_path, encoding="utf-8"))
    counts = count_assertions(results)
    if as_json:
        print(json.dumps(counts, indent=1, sort_keys=True))
        return 0
    width = max([len(k) for k in counts] + [5])
    print("%-*s  %s" % (width, "probe", "assertions"))
    for key in sorted(counts):
        if key == "total":
            continue
        print("%-*s  %d" % (width, key, counts[key]))
    print("%-*s  %d" % (width, "TOTAL", counts["total"]))
    return 0


def do_run(out_dir, results_path, wanted):
    out_dir = os.path.abspath(out_dir)
    port = int(os.environ.get("W1980_PROBE_PORT", "8899"))
    httpd = serve(out_dir, port)
    results = {}
    try:
        for key in wanted:
            qs, marker, budget = PROBES[key]
            url = "http://127.0.0.1:%d/index.html?%s" % (port, qs)
            print("[%s] %s ..." % (key, qs), flush=True)
            try:
                markers = parse_markers(run_probe(url, budget))
                if marker in markers:
                    r = markers[marker]
                    failed = probe_failed(r)
                    print("  -> %s %s" % (marker, "FAIL" if failed else "ok"), flush=True)
                    results[key] = {"marker": marker, "result": r, "failed": bool(failed)}
                else:
                    found = list(markers.keys())
                    print("  -> MISSING %s (found: %s)" % (marker, found), flush=True)
                    results[key] = {"marker": marker, "missing": True, "found": found}
            except Exception as e:
                print("  -> ERROR %s" % e, flush=True)
                results[key] = {"marker": marker, "error": str(e)}
    finally:
        httpd.shutdown()
    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    bad = [k for k, v in results.items() if v.get("failed") or v.get("missing") or v.get("error")]
    print("SUMMARY: %d/%d probes ok%s" % (len(results) - len(bad), len(results),
          ("" if not bad else "  FAILING: " + ", ".join(bad))))
    return 1 if bad else 0


def comparable(r):
    """Strip platform/jitter fields so a regression gate compares only meaningful values."""
    if not isinstance(r, dict):
        return r
    return {k: v for k, v in r.items() if not _platform_dependent(k, v)}


def _lost_names(base, new):
    """Assertion names present in the baseline probe but gone from the new one."""
    lost = []
    for k in sorted(base):
        if k not in new:
            continue
        before = assertion_names(base[k].get("result"))
        after = set(assertion_names(new[k].get("result")))
        for n in before:
            if n not in after:
                lost.append("%s/%s" % (k, n))
    return lost


def do_cmp(base_path, new_path, strict=False):
    base = json.load(open(base_path, encoding="utf-8"))
    new = json.load(open(new_path, encoding="utf-8"))
    same, diff, only = 0, [], []
    for k in base:
        if k not in new:
            only.append((k, "removed"))
            continue
        a, b = comparable(base[k].get("result")), comparable(new[k].get("result"))
        if json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True):
            same += 1
        else:
            diff.append(k)
    for k in new:
        if k not in base:
            only.append((k, "added"))
    print("identical: %d ; different: %s ; only-in-one: %s" % (same, diff or "none", only or "none"))
    for k in diff:
        a = base[k].get("result") if isinstance(base[k].get("result"), dict) else {}
        b = new[k].get("result") if isinstance(new[k].get("result"), dict) else {}
        print("---- %s ----" % k)
        for f in sorted(set(list(a.keys()) + list(b.keys()))):
            if not strict and _platform_dependent(f, a.get(f)):
                continue
            va, vb = a.get(f), b.get(f)
            if json.dumps(va, sort_keys=True) != json.dumps(vb, sort_keys=True):
                print("  %s: %r -> %r" % (f, va, vb))
    # also surface any probe that regressed from ok to failed
    for k in new:
        if k in base and new[k].get("failed") and not base[k].get("failed"):
            print("REGRESSION: %s now failing" % k)

    # assertion-collapse gate: losing an assertion keeps the suite green while
    # quietly shrinking what it guarantees. Growth is fine (new coverage).
    base_counts = count_assertions(base)
    new_counts = count_assertions(new)
    collapsed = []
    for k in sorted(base_counts):
        if k == "total" or k not in new_counts:
            continue
        if new_counts[k] < base_counts[k]:
            collapsed.append((k, base_counts[k], new_counts[k]))
    if collapsed:
        print("ASSERTION COLLAPSE (%d probe(s)):" % len(collapsed))
        for k, before, after in collapsed:
            print("  %s: %d -> %d assertions" % (k, before, after))
        print("  total: %d -> %d" % (base_counts["total"], new_counts["total"]))
        if _lost_names(base, new):
            print("  lost: " + ", ".join(_lost_names(base, new)))
        return 2

    return 0 if not diff and not only else 2


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    mode = sys.argv[1]
    if mode == "run":
        if len(sys.argv) < 4:
            print(__doc__)
            return 2
        out_dir, results_path = sys.argv[2], sys.argv[3]
        wanted = sys.argv[4:] or list(PROBES)
        unknown = [w for w in wanted if w not in PROBES]
        if unknown:
            print("unknown probe(s): %s" % ", ".join(unknown))
            return 2
        return do_run(out_dir, results_path, wanted)
    if mode == "cmp":
        if len(sys.argv) < 4:
            print(__doc__)
            return 2
        strict = "--strict" in sys.argv
        return do_cmp(sys.argv[2], sys.argv[3], strict)
    if mode == "count":
        if len(sys.argv) < 3:
            print(__doc__)
            return 2
        return do_count(sys.argv[2], "--json" in sys.argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
