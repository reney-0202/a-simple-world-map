# -*- coding: utf-8 -*-
"""world1980 headless probe runner (CI gate).

Serves an out/ directory and runs the game's built-in headless probes via a
Chromium-family browser using --dump-dom, the same technique the game's own
_headless.py uses. Each probe renders a hidden <div id="<x>probe">MARKER {json}</div>
which this runner scrapes and judges.

The probe list is NOT hardcoded here: it is read from out/data/probes.js, the
same file the page uses to decide `CR.probeMode`. One registry, two consumers,
so the runner and the browser cannot silently disagree about which URL
parameter selects which probe.

Usage:
    python tools/probe_runner.py run <out_dir> <results.json> [probe ...]
    python tools/probe_runner.py cmp <baseline.json> <results.json>
                                    [--strict] [--class=history|mechanics]
                                    [--registry=<out>/data/probes.js]
    python tools/probe_runner.py count <results.json> [--json]

Exit codes:
    run   : 0 all probes ok, 1 at least one failed/missing/errored
    cmp   : 0 identical (jitter fields ignored), 2 differences present or an
            assertion count decreased (see "ASSERTION COLLAPSE")
    count : 0 always (it only reports)

PROBE CLASSES (see "class" in out/data/probes.js)
    Not every probe means the same thing, and treating them alike is what kept
    the game from improving: `cmp` demanded bit-identical output from all 25, so
    any real mechanics change had to ship behind a default-off switch -- i.e.
    the default experience could never get better.

      history   - runs 1980->1991 with no player, watching the scripted timeline
                  (selftest / simprobe / endprobe). These must NEVER drift:
                  `cmp --class=history` is the CI hard gate.
      mechanics - actively sets a player, seeds state and mutates it to exercise
                  one subsystem (domestic / agenda / sanprobe / ...). These are
                  ALLOWED to change when the mechanic is deliberately changed --
                  the difference must be explained in the commit message, and
                  the assertion-collapse gate still covers every probe.

    Bare `cmp` (no --class) still compares all probes and is the review gate:
    it prints what moved so the change can be justified, without pretending that
    every movement is a regression.

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


# ---- probe registry (single source of truth: out/data/probes.js) -------------
# The browser reads the same file to decide `CR.probeMode`, so the runner and the
# page can never drift apart. Adding or renaming a probe means editing ONE data
# file (plus the dispatch line in 13-boot.js), not a Python dict plus two regexes.
REGISTRY_REL = os.path.join("data", "probes.js")
REGISTRY_RE = re.compile(r"window\.W1980_PROBES\s*=\s*(\{.*\})\s*;\s*$", re.S)

# The two probe classes. `history` is the non-negotiable one: those probes watch
# the scripted 1980->1991 timeline with no player and must stay bit-identical.
PROBE_CLASSES = ("history", "mechanics")


def load_registry(out_dir):
    """Parse out/data/probes.js -> ({key: {qs, marker, budget, class}}, problems)."""
    return _parse_registry(os.path.join(out_dir, REGISTRY_REL))


def _parse_registry(path):
    """Parse one probes.js file -> ({key: {qs, marker, budget, class}}, problems)."""
    if not os.path.exists(path):
        return None, ["probe registry not found: %s" % path]
    raw = open(path, encoding="utf-8").read()
    m = REGISTRY_RE.search(raw)
    if not m:
        return None, ["%s does not define window.W1980_PROBES= {...};" % path]
    try:
        payload = json.loads(m.group(1))
    except Exception as e:
        return None, ["%s is not valid JSON: %s" % (path, e)]
    problems = registry_problems(payload)
    if problems:
        return None, problems
    entries = {k: {"qs": v["qs"], "marker": v["marker"],
                   "budget": int(v["budget"]), "class": v["class"]}
               for k, v in payload["entries"].items()}
    return entries, []


def probe_token(qs):
    """The URL parameter a probe is selected by: `end=1&t=...` -> `end`."""
    return qs.split("&")[0].split("=")[0]


def registry_problems(payload):
    """Self-check: params and entries must describe the same set of probes.

    `params` is what the page uses to set CR.probeMode; `entries` is what the
    runner launches. A probe present in one but not the other is exactly the
    silent-failure mode this registry exists to prevent.
    """
    if not isinstance(payload, dict):
        return ["registry payload must be an object"]
    params = payload.get("params")
    entries = payload.get("entries")
    if not isinstance(params, list) or not params:
        return ["registry.params must be a non-empty list"]
    if not isinstance(entries, dict) or not entries:
        return ["registry.entries must be a non-empty object"]

    problems = []
    if len(set(params)) != len(params):
        dupes = sorted({p for p in params if params.count(p) > 1})
        problems.append("registry.params has duplicates: %s" % ", ".join(dupes))

    derived = {}
    history = []
    for key, entry in entries.items():
        if not isinstance(entry, dict):
            problems.append("registry.entries[%s] is not an object" % key)
            continue
        qs = entry.get("qs")
        marker = entry.get("marker")
        budget = entry.get("budget")
        cls = entry.get("class")
        if not isinstance(qs, str) or not qs:
            problems.append("registry.entries[%s].qs must be a non-empty string" % key)
            continue
        if not isinstance(marker, str) or not marker.isupper():
            problems.append("registry.entries[%s].marker must be an uppercase string" % key)
        if not isinstance(budget, int) or budget <= 0:
            problems.append("registry.entries[%s].budget must be a positive integer" % key)
        if cls not in PROBE_CLASSES:
            problems.append("registry.entries[%s].class must be one of %s, got %r"
                            % (key, " / ".join(PROBE_CLASSES), cls))
        elif cls == "history":
            history.append(key)
        derived.setdefault(probe_token(qs), []).append(key)

    if not history:
        problems.append("no probe is class 'history': the CI hard gate "
                        "(`cmp --class=history`) would compare nothing")

    for token, keys in derived.items():
        if len(keys) > 1:
            problems.append("param %r is claimed by several probes: %s"
                            % (token, ", ".join(sorted(keys))))
    if set(derived) != set(params):
        only_params = sorted(set(params) - set(derived))
        only_entries = sorted(set(derived) - set(params))
        if only_params:
            problems.append("registry.params lists probes with no entry: %s"
                            % ", ".join(only_params))
        if only_entries:
            problems.append("registry.entries has probes missing from params: %s"
                            % ", ".join(only_entries))

    markers = [v.get("marker") for v in entries.values() if isinstance(v, dict)]
    if len(set(markers)) != len(markers):
        dupes = sorted({m for m in markers if markers.count(m) > 1})
        problems.append("registry markers must be unique: %s" % ", ".join(dupes))
    return problems


BR = find_browser()

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
    entries, problems = load_registry(out_dir)
    if problems:
        print("PROBE REGISTRY INVALID (%s):" % REGISTRY_REL)
        for p in problems:
            print("  x " + p)
        return 2
    probes = entries
    wanted = wanted or list(probes)
    unknown = [w for w in wanted if w not in probes]
    if unknown:
        print("unknown probe(s): %s" % ", ".join(unknown))
        print("registered: %s" % ", ".join(sorted(probes)))
        return 2
    print("registry: %d probes, %d url params (%d history / %d mechanics)" % (
        len(probes), len({probe_token(v["qs"]) for v in probes.values()}),
        sum(1 for v in probes.values() if v["class"] == "history"),
        sum(1 for v in probes.values() if v["class"] == "mechanics")))
    port = int(os.environ.get("W1980_PROBE_PORT", "8899"))
    httpd = serve(out_dir, port)
    results = {}
    try:
        for key in wanted:
            entry = probes[key]
            qs, marker, budget = entry["qs"], entry["marker"], entry["budget"]
            url = "http://127.0.0.1:%d/index.html?%s" % (port, qs)
            print("[%s/%s] %s ..." % (key, entry["class"], qs), flush=True)
            try:
                markers = parse_markers(run_probe(url, budget))
                if marker in markers:
                    r = markers[marker]
                    failed = probe_failed(r)
                    print("  -> %s %s" % (marker, "FAIL" if failed else "ok"), flush=True)
                    results[key] = {"marker": marker, "class": entry["class"],
                                    "result": r, "failed": bool(failed)}
                else:
                    found = list(markers.keys())
                    print("  -> MISSING %s (found: %s)" % (marker, found), flush=True)
                    results[key] = {"marker": marker, "class": entry["class"],
                                    "missing": True, "found": found}
            except Exception as e:
                print("  -> ERROR %s" % e, flush=True)
                results[key] = {"marker": marker, "class": entry["class"],
                                "error": str(e)}
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


# The shipped registry is the single source of truth for a probe's class, so
# `cmp --class=...` cannot disagree with what `run` actually launched.
DEFAULT_REGISTRY = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "out", REGISTRY_REL)


def probe_classes(registry_path):
    """key -> class, read from out/data/probes.js."""
    entries, problems = _parse_registry(registry_path)
    if problems:
        return None, problems
    return {k: v["class"] for k, v in entries.items()}, []


def do_cmp(base_path, new_path, strict=False, class_filter=None, registry_path=None):
    base = json.load(open(base_path, encoding="utf-8"))
    new = json.load(open(new_path, encoding="utf-8"))

    if class_filter:
        classes, problems = probe_classes(registry_path or DEFAULT_REGISTRY)
        if problems:
            print("PROBE REGISTRY INVALID (%s):" % (registry_path or DEFAULT_REGISTRY))
            for p in problems:
                print("  x " + p)
            return 2
        scope = sorted(k for k, c in classes.items() if c == class_filter)
        if not scope:
            print("no probe is class %r; the gate would compare nothing" % class_filter)
            return 2
        skipped = sorted((set(base) | set(new)) - set(scope))
        print("scope: --class=%s -> %d probe(s): %s"
              % (class_filter, len(scope), ", ".join(scope)))
        if skipped:
            print("       not in scope (see the full `cmp`): %s" % ", ".join(skipped))
        keys = scope
    else:
        keys = list(base) + [k for k in new if k not in base]

    same, diff, only = 0, [], []
    for k in keys:
        if k not in base:
            only.append((k, "added"))
            continue
        if k not in new:
            only.append((k, "removed"))
            continue
        a, b = comparable(base[k].get("result")), comparable(new[k].get("result"))
        if json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True):
            same += 1
        else:
            diff.append(k)
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
    for k in keys:
        if k in base and k in new and new[k].get("failed") and not base[k].get("failed"):
            print("REGRESSION: %s now failing" % k)

    # assertion-collapse gate: losing an assertion keeps the suite green while
    # quietly shrinking what it guarantees. Growth is fine (new coverage).
    # This runs on whatever scope was selected, so the `history` gate also
    # refuses to let a history probe quietly shed assertions.
    base_counts = count_assertions(base)
    new_counts = count_assertions(new)
    collapsed = []
    for k in sorted(base_counts):
        if k == "total" or k not in new_counts:
            continue
        if k not in keys:
            continue
        if new_counts[k] < base_counts[k]:
            collapsed.append((k, base_counts[k], new_counts[k]))
    if collapsed:
        print("ASSERTION COLLAPSE (%d probe(s)):" % len(collapsed))
        for k, before, after in collapsed:
            print("  %s: %d -> %d assertions" % (k, before, after))
        print("  total (all probes): %d -> %d" % (base_counts["total"], new_counts["total"]))
        if _lost_names(base, new):
            print("  lost: " + ", ".join(_lost_names(base, new)))
        return 2

    return 0 if not diff and not only else 2


def _opt_value(argv, name):
    """`--name=value` -> value, else None."""
    prefix = "--%s=" % name
    for a in argv:
        if a.startswith(prefix):
            return a[len(prefix):]
    return None


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
        # the registry lives in the out/ tree, so it is resolved inside do_run
        rest = [a for a in sys.argv[4:] if not a.startswith("--")]
        return do_run(out_dir, results_path, rest)
    if mode == "cmp":
        if len(sys.argv) < 4:
            print(__doc__)
            return 2
        strict = "--strict" in sys.argv
        class_filter = _opt_value(sys.argv, "class")
        if class_filter is not None and class_filter not in PROBE_CLASSES:
            print("--class must be one of %s, got %r"
                  % (" / ".join(PROBE_CLASSES), class_filter))
            return 2
        return do_cmp(sys.argv[2], sys.argv[3], strict,
                      class_filter, _opt_value(sys.argv, "registry"))
    if mode == "count":
        if len(sys.argv) < 3:
            print(__doc__)
            return 2
        return do_count(sys.argv[2], "--json" in sys.argv)
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
