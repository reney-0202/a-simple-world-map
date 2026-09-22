# -*- coding: utf-8 -*-
"""S4: work/province.npy — province partition of every modelled 1980 polity.

Allocation uses all 133 countries as denominator (BUILD_NOTES §5) so M2 can reuse
these province ids unchanged.
"""
import os, sys, json, time, hashlib
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

PROV = os.path.join(C.WORK, "province.npy")
BLOCKS = os.path.join(C.WORK, "province_blocks.json")
KEYS_JSON = os.path.join(C.WORK, "polity_keys.json")

PROVINCE_TOTAL = 3000
MIN_PART_PX = 12
LLOYD_ROUNDS = 4
MAX_SAMPLE = 60000
DIRS = ((-1, 0), (1, 0), (0, -1), (0, 1))


def rng_for(key, tag=0):
    h = int.from_bytes(hashlib.md5(("%s|%d" % (key, tag)).encode()).digest()[:4], "big")
    return np.random.default_rng(h)


def grow(mask, lab0, cost, max_iter=3000):
    """Multi-source growth with a per-pixel cost field; ties -> larger label wins.
    Cost field makes the borders organic instead of straight Voronoi edges."""
    h, w = mask.shape
    INF = 1 << 20
    lab = lab0.astype(np.int32, copy=True)
    dist = np.where(lab > 0, 0, INF).astype(np.int32)
    dist[~mask] = INF
    lab[~mask] = 0
    dp = np.empty((h + 2, w + 2), np.int32)
    lp = np.empty((h + 2, w + 2), np.int32)
    it = 0
    for it in range(1, max_iter + 1):
        dp[:] = INF
        dp[1:-1, 1:-1] = dist
        lp[:] = 0
        lp[1:-1, 1:-1] = lab
        changed = False
        for dy, dx in DIRS:
            dn = dp[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx] + cost
            ln = lp[1 + dy:h + 1 + dy, 1 + dx:w + 1 + dx]
            ok = ln > 0
            b = ok & (dn < dist)
            if b.any():
                dist[b] = dn[b]
                lab[b] = ln[b]
                changed = True
            t = ok & (dn == dist) & (ln > lab)
            if t.any():
                lab[t] = ln[t]
                changed = True
        if not changed:
            break
    lab[~mask] = 0
    return lab


def kmeanspp(coords, k, rng):
    n = len(coords)
    k = min(k, n)
    d2 = np.full(n, np.inf)
    idx = [int(rng.integers(n))]
    d2 = ((coords - coords[idx[0]]) ** 2).sum(1)
    for _ in range(k - 1):
        s = d2.sum()
        if not np.isfinite(s) or s <= 0:
            j = int(rng.integers(n))
        else:
            j = int(np.searchsorted(np.cumsum(d2 / s), rng.random()))
            j = min(j, n - 1)
        idx.append(j)
        d2 = np.minimum(d2, ((coords - coords[j]) ** 2).sum(1))
    return np.array(idx, dtype=np.int64)


def reseed(mask, lab, k, rng):
    ys, xs = np.nonzero(lab > 0)
    if len(ys) == 0:
        return None
    l = lab[ys, xs]
    o = np.argsort(l, kind="stable")
    l, ys, xs = l[o], ys[o], xs[o]
    bnd = np.searchsorted(l, np.arange(1, k + 2))
    seeds = np.zeros((k, 2), dtype=np.int64)
    flat = np.nonzero(mask.ravel())[0]
    for i in range(k):
        a, b = bnd[i], bnd[i + 1]
        if b <= a:
            p = int(flat[rng.integers(len(flat))])
            seeds[i] = divmod(p, mask.shape[1])
            continue
        cy, cx = ys[a:b].mean(), xs[a:b].mean()
        d = (ys[a:b] - cy) ** 2 + (xs[a:b] - cx) ** 2
        j = a + int(np.argmin(d))
        seeds[i] = (ys[j], xs[j])
    return seeds


def partition(mask, k, key, tag=0):
    """Return int32 label field 1..k for the given bool mask."""
    k = int(k)
    if k <= 1:
        return mask.astype(np.int32)
    rng = rng_for(key, tag)
    pts = np.argwhere(mask)
    if len(pts) < k:
        k = len(pts)
    if k <= 1:
        return mask.astype(np.int32)
    if len(pts) > MAX_SAMPLE:
        sel = rng.choice(len(pts), MAX_SAMPLE, replace=False)
        sp = pts[sel]
    else:
        sp = pts
    cen = kmeanspp(sp.astype(np.float64), k, rng)
    lab0 = np.zeros(mask.shape, np.int32)
    lab0[sp[cen, 0], sp[cen, 1]] = np.arange(1, k + 1)
    cost = rng.integers(1, 4, size=mask.shape).astype(np.int32)
    lab = grow(mask, lab0, cost)
    for r in range(LLOYD_ROUNDS):
        sd = reseed(mask, lab, k, rng)
        lab0 = np.zeros(mask.shape, np.int32)
        lab0[sd[:, 0], sd[:, 1]] = np.arange(1, k + 1)
        lab = grow(mask, lab0, cost)
    return lab


def main():
    t0 = time.time()
    meta = json.load(open(KEYS_JSON, encoding="utf-8"))
    table = meta["table"]
    keys_all = meta["keys_all"]
    keys_m1 = meta["keys_m1"]
    PID = meta["polity_id"]
    px_all = meta["px_all"]

    tot_px = float(sum(px_all.values()))
    tot_pop = float(sum(v["pop_m"] for v in table.values()))
    k_all, blocks, nxt = {}, {}, 1
    for k in keys_all:
        w = 0.45 * px_all[k] / tot_px + 0.55 * table[k]["pop_m"] / tot_pop
        ki = int(min(500, max(1, round(PROVINCE_TOTAL * w))))
        k_all[k] = ki
        blocks[k] = [nxt, ki]
        nxt += ki
    print("S4 allocation: sum(k)=%d  max block end=%d  (M1 share=%d)"
          % (sum(k_all.values()), nxt - 1, sum(k_all[k] for k in keys_m1)))

    polity = np.load(os.path.join(C.WORK, "polity.npy"))
    province = np.zeros(polity.shape, dtype=np.uint16)
    meta_prov = {}
    stats = []
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)

    for key in keys_all:
        pid = PID[key]
        pm = polity == pid
        if not pm.any():
            print("  !! %s has no pixels" % key)
            continue
        ys, xs = np.nonzero(pm)
        sl = (slice(int(ys.min()), int(ys.max()) + 1), slice(int(xs.min()), int(xs.max()) + 1))
        sub = pm[sl]
        lab, n = ndimage.label(sub, structure=structure)
        cnt = np.bincount(lab.ravel(), minlength=n + 1)
        order = sorted([i for i in range(1, n + 1) if cnt[i] >= MIN_PART_PX], key=lambda i: -cnt[i])
        ktot = k_all[key]
        n_big = len(order)
        m = min(n_big, ktot)
        chosen = order[:m]
        if m == 0:
            chosen = [int(np.argmax(cnt[1:])) + 1] if n else []
            m = len(chosen)
        # k per part: floor 1, rest proportional to area
        ks = {i: 1 for i in chosen}
        rem = ktot - m
        if rem > 0 and chosen:
            s = float(sum(cnt[i] for i in chosen))
            raw = np.array([rem * cnt[i] / s for i in chosen], float)
            add = np.floor(raw).astype(int)
            left = rem - int(add.sum())
            o = np.argsort(-(raw - add))
            for j in range(left):
                add[o[j % len(add)]] += 1
            for i, a in zip(chosen, add):
                ks[i] += int(a)
        objs = ndimage.find_objects(lab, max_label=n)
        cur = blocks[key][0]
        for i in chosen:
            pb = objs[i - 1]
            if pb is None:
                continue
            msk = (lab[pb] == i)
            kk = ks[i]
            l = partition(msk, kk, key, tag=i * 7919)
            ids = (cur + l).astype(np.uint16)
            v = province[sl[0].start + pb[0].start:sl[0].start + pb[0].stop,
                         sl[1].start + pb[1].start:sl[1].start + pb[1].stop]
            v[msk] = ids[msk]
            cur += kk
        meta_prov[key] = {"parts": n_big, "used_parts": len(chosen), "k": ktot}
        stats.append((int(pm.sum()), key, n_big, len(chosen), ktot))

    # --- leftover modelled land (tiny islands, skipped parts) -> nearest same-country province
    filled = 0
    for key in keys_all:
        pid = PID[key]
        pm = polity == pid
        tgt = pm & (province == 0)
        if not tgt.any():
            continue
        ys, xs = np.nonzero(pm)
        sl = (slice(int(ys.min()), int(ys.max()) + 1), slice(int(xs.min()), int(xs.max()) + 1))
        src = (province[sl] > 0) & pm[sl]
        if not src.any():
            # whole country is smaller than MIN_PART_PX -> single province
            province[sl] = np.where(pm[sl], blocks[key][0], province[sl])
            filled += int(pm.sum())
            continue
        d, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
        lab = province[sl]
        near = lab[iy, ix]
        sel = pm[sl] & (lab == 0)
        lab[sel] = near[sel]
        filled += int(sel.sum())
    ok = int((province > 0).sum())
    modelled = int((polity > 0).sum())
    print("S4 left-overs filled=%d ; province>0=%d modelled_land=%d match=%s"
          % (filled, ok, modelled, ok == modelled))
    if ok != modelled:
        raise SystemExit("S4 FATAL: province coverage %d != modelled land %d" % (ok, modelled))
    mx = int(province.max())
    top = sorted(stats, reverse=True)[:6]
    print("S4 big: " + " | ".join("%s px=%d parts=%d/%d k=%d" % (s[1], s[0], s[3], s[2], s[4]) for s in top))
    thin = sorted(stats, key=lambda s: s[2] - s[3], reverse=True)[:3]
    print("S4 parts absorbed (parts-used): " + ", ".join("%s %d/%d" % (s[1], s[3], s[2]) for s in thin))
    print("S4 provinces=%d (ids 1..%d)  distinct=%d  %.1fs"
          % (int(len(np.unique(province)) - 1), mx, int(len(np.unique(province))) - 1, time.time() - t0))
    np.save(PROV, province)
    json.dump({"k_all": k_all, "blocks": blocks, "MIN_PART_PX": MIN_PART_PX,
               "PROVINCE_TOTAL": PROVINCE_TOTAL, "LLOYD": LLOYD_ROUNDS,
               "detail": meta_prov}, open(BLOCKS, "w", encoding="utf-8"), ensure_ascii=False)


main()
