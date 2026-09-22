# -*- coding: utf-8 -*-
"""S9 (M2): hard regression assertion against the frozen M1 snapshot.

Checks, per TASK M2 step 4:
  * work/province.npy  == _m1_snapshot/work/province.npy  on every M1-modelled pixel
  * work/polity.npy    == _m1_snapshot/work/polity.npy    on every M1-modelled pixel
Both must be pixel-exact (same ids, same shapes). Diff must be 0.
"""
import os, sys, json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

SNAP = os.path.join(C.ROOT, "_m1_snapshot", "work")
NEW_P = os.path.join(C.WORK, "province.npy")
NEW_Q = os.path.join(C.WORK, "polity.npy")

OK = True


def line(ok, msg):
    global OK
    OK = OK and bool(ok)
    print("[%s] %s" % ("PASS" if ok else "FAIL", msg))


def main():
    sp = np.load(os.path.join(SNAP, "province.npy"))
    sq = np.load(os.path.join(SNAP, "polity.npy"))
    np_ = np.load(NEW_P)
    nq = np.load(NEW_Q)
    line(sp.shape == np_.shape == sq.shape == nq.shape,
         "raster shapes equal: province %s polity %s" % (tuple(np_.shape), tuple(nq.shape)))

    m1_land = sp > 0
    n_m1 = int(m1_land.sum())
    line(int((sq > 0).sum()) == n_m1, "M1 snapshot: province>0 %d == polity>0 %d" % (n_m1, int((sq > 0).sum())))

    # --- province ids identical over the whole M1 territory ---------------
    d_prov = int((np_[m1_land] != sp[m1_land]).sum())
    line(d_prov == 0, "province.npy on M1 land: differing pixels = %d (of %d)" % (d_prov, n_m1))

    # --- polity ids identical over the whole M1 territory -----------------
    pq = nq[m1_land].astype(np.int64)
    sqv = sq[m1_land].astype(np.int64)
    d_pol = int((pq != sqv).sum())
    line(d_pol == 0, "polity.npy on M1 land: differing pixels = %d (of %d)" % (d_pol, n_m1))

    # --- M1 polity ids unchanged (1..52) ----------------------------------
    ids_m1 = sorted(set(np.unique(sq).tolist()) - {0})
    line(ids_m1 == list(range(1, 53)), "M1 polity ids preserved 1..52 (found %d..%d)" % (ids_m1[0], ids_m1[-1]))

    # --- per-province pixel counts unchanged ------------------------------
    mx = int(sp.max())
    cs = np.bincount(sp.ravel(), minlength=mx + 1)
    cn = np.bincount(np_.ravel(), minlength=mx + 1)
    used = [i for i in range(1, mx + 1) if cs[i] > 0]   # ids actually used by M1
    bad = [i for i in used if cs[i] != cn[i]]
    line(not bad, "per-province px counts identical for all %d M1 provinces (mismatches=%d)"
         % (len(used), len(bad)))
    if bad[:5]:
        print("   first mismatches:", bad[:5])
    gap = [i for i in range(1, mx + 1) if cs[i] == 0 and cn[i] > 0]
    print("M2 also filled %d previously-unused ids inside 1..%d (TIER2 countries' reserved blocks)"
          % (len(gap), mx))

    # --- province ids must not leak into M1 land from elsewhere -----------
    line(int(np_[m1_land].max()) <= mx, "no new province id introduced inside M1 land (max id on M1 land=%d, M1 max=%d)"
         % (int(np_[m1_land].max()), mx))

    # --- overall growth report --------------------------------------------
    all_p = int((np_ > 0).sum())
    all_q = int((nq > 0).sum())
    print("M2 province>0 %d (+%d vs M1) ; M2 polity>0 %d (+%d)" % (all_p, all_p - n_m1, all_q, all_q - int((sq > 0).sum())))
    line(all_p == all_q, "province>0 %d == polity>0 %d (full coverage)" % (all_p, all_q))

    print("\nS9: %s" % ("PASS" if OK else "FAIL"))
    return OK


sys.exit(0 if main() else 1)
