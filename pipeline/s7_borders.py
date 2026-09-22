# -*- coding: utf-8 -*-
"""next-tasks B: vector border polylines (province + country) via marching squares.

Run:  python work\\_gen_borders.py
Out:  out/data/borders_province.js   window.W1980_BORDERS_PROVINCE=<delta-int16 x2>
      out/data/borders_country.js    window.W1980_BORDERS_COUNTRY=<delta-int16 x2>

Purely additive: reads frozen work/province.npy & work/polity.npy, writes two new
files only. Coordinates are grid units (x:0..4096, y:0..1994); all points are
doubled (coord*2) integers so half-cell midpoints stay exact.
"""
import os, sys, json
from collections import defaultdict, deque
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pipeline"))
import common as C

DATA = os.path.join(C.OUT, "data")
EPS = 0.5            # Douglas-Peucker tolerance, grid units
EPS2 = (EPS * 2) ** 2  # = 1.0 in doubled coordinates


def borders_ref(ids, keep):
    """Exact copy of s6_export.borders (inline: importing s6 would re-run its main)."""
    b = np.zeros(ids.shape, bool)
    d = ids[:, :-1] != ids[:, 1:]
    b[:, :-1] |= d
    b[:, 1:] |= d
    d2 = ids[:-1, :] != ids[1:, :]
    b[:-1, :] |= d2
    b[1:, :] |= d2
    return b & keep


def extract_segments(ids):
    """Marching squares over 2x2 cells. Segment endpoints are (x2, y2) doubled ints."""
    a = ids[:-1, :-1]; b = ids[:-1, 1:]; c = ids[1:, 1:]; d = ids[1:, :-1]
    T = a != b; R = b != c; B = d != c; L = a != d
    cnt = T.astype(np.uint8) + R + B + L
    ys, xs = np.nonzero(cnt >= 2)
    segs = []
    for y, x in zip(ys.tolist(), xs.tolist()):
        t = T[y, x]; r = R[y, x]; u = B[y, x]; l = L[y, x]
        n = int(t) + int(r) + int(u) + int(l)
        Tm = (2 * x + 1, 2 * y); Rm = (2 * x + 2, 2 * y + 1)
        Bm = (2 * x + 1, 2 * y + 2); Lm = (2 * x, 2 * y + 1)
        if n == 2:
            p = []
            if t: p.append(Tm)
            if r: p.append(Rm)
            if u: p.append(Bm)
            if l: p.append(Lm)
            segs.append((p[0], p[1]))
        elif n == 4:  # saddle
            if a[y, x] == c[y, x]:
                segs.append((Tm, Rm)); segs.append((Bm, Lm))
            else:
                segs.append((Tm, Lm)); segs.append((Rm, Bm))
        elif n == 3:  # triple junction (3 distinct ids): star to cell centre
            ctr = (2 * x + 1, 2 * y + 1)
            if t: segs.append((Tm, ctr))
            if r: segs.append((Rm, ctr))
            if u: segs.append((Bm, ctr))
            if l: segs.append((Lm, ctr))
    return segs


def link_polylines(segs):
    """Chain segments sharing endpoints into polylines; closed rings end == start."""
    adj = defaultdict(list)
    for i, (p, q) in enumerate(segs):
        adj[p].append(i)
        adj[q].append(i)
    used = np.zeros(len(segs), bool)
    polys = []
    for i in range(len(segs)):
        if used[i]:
            continue
        used[i] = True
        p, q = segs[i]
        chain = deque([p, q])
        while chain[-1] != chain[0]:           # extend tail
            nxt = -1
            for j in adj[chain[-1]]:
                if not used[j]:
                    nxt = j
                    break
            if nxt < 0:
                break
            used[nxt] = True
            s0, s1 = segs[nxt]
            chain.append(s1 if s0 == chain[-1] else s0)
        while chain[0] != chain[-1]:           # extend head
            nxt = -1
            for j in adj[chain[0]]:
                if not used[j]:
                    nxt = j
                    break
            if nxt < 0:
                break
            used[nxt] = True
            s0, s1 = segs[nxt]
            chain.appendleft(s1 if s0 == chain[0] else s0)
        polys.append(list(chain))
    return polys


def simplify(pts):
    """Iterative Douglas-Peucker on doubled-int points, eps2 = 1.0 (= 0.5 grid)."""
    n = len(pts)
    if n <= 3:
        return list(pts)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]; bx, by = pts[j]
        dx = bx - ax; dy = by - ay
        L2 = dx * dx + dy * dy
        best = -1.0; bi = -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if L2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / L2
                if t < 0.0: t = 0.0
                elif t > 1.0: t = 1.0
                ex = ax + t * dx - px
                ey = ay + t * dy - py
                d2 = ex * ex + ey * ey
            if d2 > best:
                best = d2; bi = k
        if best > EPS2:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(pts, keep) if k]

    return [p for p, k in zip(pts, keep) if k]


def encode(polys):
    """Delta-int16 in doubled coords: first point absolute, then diffs; x,y alternate."""
    out = []
    maxabs = 0
    for pts in polys:
        enc = [pts[0][0], pts[0][1]]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            enc.append(x1 - x0)
            enc.append(y1 - y0)
        m = max(abs(v) for v in enc)
        if m > maxabs:
            maxabs = m
        out.append(enc)
    return out, maxabs


def rasterize(polys, shape):
    """Draw each segment as a 1px line (round-half-up) into a bool mask."""
    H, W = shape
    m = np.zeros(shape, bool)
    for pts in polys:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            c0 = min(W - 1, (x0 + 1) >> 1); r0 = min(H - 1, (y0 + 1) >> 1)
            c1 = min(W - 1, (x1 + 1) >> 1); r1 = min(H - 1, (y1 + 1) >> 1)
            n = max(abs(c1 - c0), abs(r1 - r0))
            if n == 0:
                m[r0, c0] = True
                continue
            for k in range(n + 1):
                m[r0 + (r1 - r0) * k // n, c0 + (c1 - c0) * k // n] = True
    return m


def dilate1(m):
    out = m.copy()
    out[:-1, :] |= m[1:, :]; out[1:, :] |= m[:-1, :]
    out[:, :-1] |= m[:, 1:]; out[:, 1:] |= m[:, :-1]
    return out


def run(npy_name, js_name, varname):
    ids = np.load(os.path.join(C.WORK, npy_name)).astype(np.int32)
    segs = extract_segments(ids)
    polys = link_polylines(segs)
    pre = sum(len(p) for p in polys)
    simp = [simplify(p) for p in polys]
    post = sum(len(p) for p in simp)
    enc, maxabs = encode(simp)
    path = os.path.join(DATA, js_name)
    with open(path, "w", encoding="ascii") as f:
        f.write("window.%s=%s;\n" % (varname, json.dumps(enc, separators=(",", ":"))))
    kb = os.path.getsize(path) / 1024.0
    xs = [p[0] for pts in simp for p in pts]
    ys = [p[1] for pts in simp for p in pts]
    vec = rasterize(simp, ids.shape)
    ref = borders_ref(ids, ids > 0)
    nref = int(ref.sum())
    strict = int((ref & vec).sum()) / nref
    cov1 = int((ref & dilate1(vec)).sum()) / nref
    prec = int((ref & vec).sum()) / max(1, int(vec.sum()))
    print("[%s] segs=%d polylines=%d pts(pre)=%d pts(post,eps=0.5)=%d file=%.1fKB"
          % (varname, len(segs), len(polys), pre, post, kb))
    print("  range x: %.1f..%.1f  y: %.1f..%.1f  (limits 0..4096 / 0..1994)  max|int16|=%d"
          % (min(xs) / 2, max(xs) / 2, min(ys) / 2, max(ys) / 2, maxabs))
    print("  regression vs s6 borders(): ref px=%d  recall strict=%.4f  recall dilated1px=%.4f (>=0.95 required)  precision=%.4f"
          % (nref, strict, cov1, prec))
    return dict(polylines=len(polys), pre=pre, post=post, kb=kb, strict=strict, cov1=cov1)


def main():
    os.makedirs(DATA, exist_ok=True)
    run("province.npy", "borders_province.js", "W1980_BORDERS_PROVINCE")
    run("polity.npy", "borders_country.js", "W1980_BORDERS_COUNTRY")


if __name__ == "__main__":
    main()

