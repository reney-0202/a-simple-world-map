# -*- coding: utf-8 -*-
"""S3: build work/polity.npy (1980 polities, M1 = 52) from NE admin_0 + CShapes splits."""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C
from shapely.ops import unary_union

POLITY = os.path.join(C.WORK, "polity.npy")
KEYS_JSON = os.path.join(C.WORK, "polity_keys.json")
CSHAPES = os.path.join(C.WORK, "_cshapes", "CShapes-2.0.shp")


def cshapes_alive(name):
    import shapefile
    r = shapefile.Reader(CSHAPES, encoding="latin-1", encodingErrors="replace")
    fields = [f[0] for f in r.fields[1:]]
    ix = {f.lower(): i for i, f in enumerate(fields)}

    def g(rec, k):
        return rec[ix[k]]

    def tri(rec, pre):
        try:
            return (int(g(rec, pre + "year") or 1), int(g(rec, pre + "month") or 1), int(g(rec, pre + "day") or 1))
        except Exception:
            return (1, 1, 1)

    geoms = []
    for sr in r.iterShapeRecords():
        rec = sr.record
        if (g(rec, "cntry_name") or "").strip().lower() != name.strip().lower():
            continue
        s = tri(rec, "gws")
        e = tri(rec, "gwe")
        if s[0] <= 0:
            s = (1, 1, 1)
        if e[0] <= 0 or e[0] > 9000:
            e = (9999, 12, 31)
        if s <= (1980, 6, 30) <= e:
            geoms.append(C.safe(C.shp_shape(sr.shape.__geo_interface__)))
    if not geoms:
        return None
    return unary_union(geoms)


def main():
    table = C.load_table()
    keys_all = sorted(table.keys())
    keys_m1 = sorted(k for k in table if k in set(C.TIER1))
    assert len(keys_m1) == 52, len(keys_m1)
    idx_all = {k: i for i, k in enumerate(keys_all)}
    m1_id = {k: i + 1 for i, k in enumerate(keys_m1)}
    # M2: polity ids 1..52 stay exactly as M1 (so polity.npy is unchanged on M1 land),
    # the remaining 81 keys get 53..133 in sorted order.
    POLITY_ID = dict(m1_id)
    nxt = len(keys_m1) + 1
    for k in keys_all:
        if k not in POLITY_ID:
            POLITY_ID[k] = nxt
            nxt += 1
    assert len(set(POLITY_ID.values())) == len(keys_all) == 133

    recs, fields = C.read_records(os.path.join(C.CACHE, "ne_10m_admin_0_countries.shp"),
                                  ["ADM0_A3", "NAME", "NAME_ZH", "SOVEREIGNT"])
    cls = C.classifier(table)

    by_key = {}
    unknown = []
    n_ne = 0
    for d, gj in recs:
        a3 = (d.get("ADM0_A3") or "").strip()
        if not a3:
            continue
        n_ne += 1
        kind, key = cls(a3)
        if kind == "unknown":
            unknown.append(a3)
            kind, key = ("ignore", None)
        g = C.geom_of(gj)
        if g is None or g.is_empty:
            continue
        by_key.setdefault(a3, []).append(g)

    print("S3 NE units=%d  unknown=%s" % (n_ne, sorted(set(unknown)) or "none"))

    # --- 1980 polity geometries -----------------------------------------
    polys = {}      # polity key -> list of geoms
    grey = []       # unmodelled geoms
    area_of = {}

    def add(key, g):
        if g is None or g.is_empty:
            return
        for p in C.explore(g):
            if p.area > 0:
                polys.setdefault(key, []).append(p)

    for a3, gs in by_key.items():
        u = unary_union(gs)
        kind, key = cls(a3)
        if kind == "polity":
            add(key, u)
        elif kind in ("ignore", "unknown"):
            grey.extend(C.explore(u))

    # Germany / Yemen splits (CShapes 2.0, alive on 1980-06-30)
    wname = {"DEU": "German Federal Republic", "YEM": "Yemen (Arab Republic of Yemen)"}
    split_info = {}
    for a3, cname in wname.items():
        src = unary_union(by_key.get(a3, []))
        cs = cshapes_alive(cname)
        if cs is None:
            raise SystemExit("S3 FATAL: CShapes entity not found: %s" % cname)
        west = C.safe(src.intersection(cs))
        east = C.safe(src.difference(cs))
        a_w, a_e = west.area, east.area
        if a_w <= 0 or a_e <= 0:
            raise SystemExit("S3 FATAL: split empty for %s (%.2f/%.2f)" % (a3, a_w, a_e))
        if a3 == "DEU":
            add("DEU", west); add("DDR", east); split_info["DEU"] = (a_w, a_e)
        else:
            add("YAR", west); add("YPR", east); split_info["YEM"] = (a_w, a_e)
    print("S3 split DEU west/east deg2 = %.2f/%.2f ; YEM north/south = %.2f/%.2f"
          % (split_info["DEU"] + split_info["YEM"]))

    # hard assertion: every modelled M1 key resolved
    miss_m1 = [k for k in keys_m1 if k not in polys]
    miss_m2 = [k for k in keys_all if k not in polys]
    if miss_m1 or miss_m2:
        raise SystemExit("S3 FATAL: unresolved modelled keys M1=%s all=%s" % (miss_m1, miss_m2))
    print("S3 modelled keys with geometry: M1 %d/52, all %d/133"
          % (len([k for k in keys_m1 if k in polys]), len([k for k in keys_all if k in polys])))

    # --- rasterise -------------------------------------------------------
    land = np.load(os.path.join(C.WORK, "land.npy"))
    img = Image.new("L", (C.BASE_W, C.BASE_H), 0)
    d = ImageDraw.Draw(img)
    owner = np.zeros((C.BASE_H, C.BASE_W), dtype=np.int32)

    units = []  # (area, value, geoms)
    for i, k in enumerate(keys_all):
        if k in polys:
            units.append((sum(p.area for p in polys[k]), 2 + i, polys[k]))
    for g in grey:
        units.append((g.area, 1, [g]))
    units.sort(key=lambda u: -u[0])

    for area, val, gs in units:
        d.rectangle([0, 0, C.BASE_W - 1, C.BASE_H - 1], fill=0)
        C.paint_mask(gs, 255, img)
        m = np.array(img) > 0
        owner[m] = val

    # clip to land, then gap-fill unassigned land from neighbours
    owner[~land] = 0
    DIRS = ((0, 1), (0, -1), (1, 0), (-1, 0))
    rounds = 0
    for it in range(200):
        gap = land & (owner == 0)
        if not gap.any():
            break
        m = owner.copy()
        for sh in DIRS:
            m = np.maximum(m, np.roll(owner, sh, axis=(0, 1)))
        v = m[gap]
        if not (v > 0).any():
            break
        owner[gap] = v
        rounds = it + 1
    leftover = int((land & (owner == 0)).sum())
    print("S3 raster: rounds=%d leftover_land=%d px" % (rounds, leftover))

    polity = np.zeros((C.BASE_H, C.BASE_W), dtype=np.int32)
    for i, k in enumerate(keys_all):
        m = owner == (2 + i)
        if m.any():
            polity[m] = POLITY_ID[k]
    grey_mask = land & (owner == 1)
    print("S3 grey_land=%d px (%.2f Mkm2)" % (int(grey_mask.sum()), grey_mask.sum() * C.KM2_PER_PX / 1e6))

    np.save(POLITY, polity)
    np.save(os.path.join(C.WORK, "owner.npy"), owner)
    px_all = {}
    for i, k in enumerate(keys_all):
        px_all[k] = int((owner == (2 + i)).sum())
    meta = {"table": table, "keys_all": keys_all, "keys_m1": keys_m1,
            "m1_id": m1_id, "idx_all": idx_all, "polity_id": POLITY_ID,
            "unclassified": sorted(set(unknown)),
            "px_all": px_all,
            "split_info": {k: list(v) for k, v in split_info.items()}}
    with open(KEYS_JSON, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)

    # sanity: modelled land count
    px = {}
    for k in keys_all:
        px[k] = int((polity == POLITY_ID[k]).sum())
    top = sorted(px.items(), key=lambda kv: -kv[1])[:5]
    print("S3 modelled px total=%d ; top: %s" % (int((polity > 0).sum()),
                                                 ", ".join("%s=%d" % t for t in top)))
    print("S3 modelled polities=%d (ids 1..%d)" % (len([1 for k in keys_all if px[k] > 0]),
                                                    max(POLITY_ID.values())))
    print("S3 area rank check (km2): " + " > ".join(
        "%s %.1f" % (k, px.get(k, 0) * C.KM2_PER_PX / 1e6) for k in
        ["SUN", "CAN", "CHN", "USA", "BRA", "AUS", "IND", "ARG"]))


main()
