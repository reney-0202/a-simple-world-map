# -*- coding: utf-8 -*-
"""S5: province / country metadata + city point layer."""
import os, sys, json, math
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

PROV = os.path.join(C.WORK, "province.npy")
POLITY = os.path.join(C.WORK, "polity.npy")
KEYS_JSON = os.path.join(C.WORK, "polity_keys.json")
OUT_P = os.path.join(C.WORK, "provinces.json")
OUT_C = os.path.join(C.WORK, "country_meta.json")
OUT_CT = os.path.join(C.WORK, "cities.json")

# 1980 capitals that differ from today's (TASK §6 S5 allows manual correction)
CAP_FIX = {
    "DEU": ("Bonn", 7.0982, 50.7374),
    "DDR": ("Berlin (East)", 13.4050, 52.5200),
    "YAR": ("Sanaa", 44.2066, 15.3694),
    "YPR": ("Aden", 45.0367, 12.7797),
    "ZAF": ("Pretoria", 28.1881, -25.7461),
    "NAM": ("Windhoek", 17.0832, -22.5597),
    "BFA": ("Ouagadougou", -1.5247, 12.3714),
    "COD": ("Kinshasa", 15.3222, -4.3250),
    "SDN": ("Khartoum", 32.5324, 15.5007),
}


def main():
    meta = json.load(open(KEYS_JSON, encoding="utf-8"))
    table = meta["table"]
    keys_m1 = meta["keys_m1"]
    keys_all = meta["keys_all"]
    PID = meta["polity_id"]
    prov = np.load(PROV)
    polity = np.load(POLITY)
    H, W = prov.shape
    mx = int(prov.max())

    flat = prov.ravel()
    yy, xx = np.nonzero(prov)
    idv = flat[yy * W + xx].astype(np.int64)
    cnt = np.bincount(idv, minlength=mx + 1).astype(np.int64)
    sy = np.bincount(idv, weights=yy.astype(np.float64), minlength=mx + 1)
    sx = np.bincount(idv, weights=xx.astype(np.float64), minlength=mx + 1)

    objs = ndimage.find_objects(prov, max_label=mx)

    # ---- places -------------------------------------------------------
    recs0, _ = C.read_records(os.path.join(C.CACHE, "ne_10m_admin_0_countries.shp"),
                              ["ADM0_A3", "NAME"])
    ne_name = {}
    for d, _g in recs0:
        ne_name[(d.get("ADM0_A3") or "").strip()] = d.get("NAME")
    EN_FIX = {"SUN": "Soviet Union", "YUG": "Yugoslavia", "CSK": "Czechoslovakia",
              "DEU": "West Germany", "DDR": "East Germany",
              "YAR": "Yemen Arab Republic", "YPR": "People's Republic of Yemen",
              "NAM": "South West Africa", "COD": "Zaire", "BFA": "Upper Volta",
              "SDN": "Sudan (incl. South Sudan)", "SOM": "Somali Democratic Republic",
              "ETH": "Ethiopia (incl. Eritrea)", "IDN": "Indonesia (incl. East Timor)"}
    recs, _ = C.read_records(os.path.join(C.CACHE, "ne_10m_populated_places.shp"),
                             ["NAME", "NAMEASCII", "POP_MAX", "FEATURECLA", "SCALERANK",
                              "LATITUDE", "LONGITUDE", "ADM0_A3"])
    cls = C.classifier(table)

    def snap(xi, yi, a3):
        """(x, y, province_id, polity_id) at xi/yi; coastal capitals often land on a
        water/uncountry pixel, so snap up to 4 px to the nearest pixel of that country."""
        if int(prov[yi, xi]) > 0:
            return xi, yi, int(prov[yi, xi]), int(polity[yi, xi])
        kind, key = cls((a3 or "").strip()) if a3 else ("unknown", None)
        want = PID.get(key) if kind == "polity" else None
        for r in range(1, 5):
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    if max(abs(dy), abs(dx)) != r:
                        continue
                    y2, x2 = yi + dy, xi + dx
                    if not (0 <= y2 < H and 0 <= x2 < W):
                        continue
                    q = int(polity[y2, x2])
                    if want is not None and q != want:
                        continue
                    if q == 0:
                        continue
                    if int(prov[y2, x2]) > 0:
                        return x2, y2, int(prov[y2, x2]), q
        return xi, yi, 0, 0

    places = []
    for d, gj in recs:
        try:
            lat = float(d.get("LATITUDE"))
            lon = float(d.get("LONGITUDE"))
        except Exception:
            coords = gj.get("coordinates")
            if not coords:
                continue
            lon, lat = coords[0], coords[1]
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue
        px, py = C.lonlat_to_px(lon, lat)
        xi, yi = int(round(px)), int(round(py))
        if not (0 <= xi < W and 0 <= yi < H):
            continue
        qx, qy, pid, pk = snap(xi, yi, d.get("ADM0_A3"))
        places.append({"name": (d.get("NAME") or "").strip(), "x": qx, "y": qy,
                       "pop": int(d.get("POP_MAX") or 0),
                       "cap": (d.get("FEATURECLA") or "") == "Admin-0 capital",
                       "rank": int(d.get("SCALERANK") or 9),
                       "pid": pid, "polity": pk})
    print("S5 places=%d (capitals=%d)" % (len(places), sum(1 for p in places if p["cap"])))

    # ---- per-province -------------------------------------------------
    best_city = {}
    for p in places:
        if p["pid"] > 0:
            cur = best_city.get(p["pid"])
            if cur is None or p["pop"] > cur[1]:
                best_city[p["pid"]] = (p["name"], p["pop"], p["x"], p["y"])

    by_polity = {}
    for key in keys_all:
        by_polity[PID[key]] = key
    order_in_country = {}
    provinces = []
    for pid in range(1, mx + 1):
        n = int(cnt[pid])
        if n == 0:
            continue
        provinces.append(pid)

    # polity id of each province: sample one pixel (cheap via first occurrence)
    firstpix = np.full(mx + 1, -1, dtype=np.int64)
    firstpix[idv] = np.arange(len(idv))
    prov_polity = {}
    for pid in provinces:
        j = firstpix[pid]
        y0, x0 = yy[j], xx[j]
        prov_polity[pid] = int(polity[y0, x0])

    srt = {}
    for pid in provinces:
        srt.setdefault(prov_polity[pid], []).append(pid)
    for pk, lst in srt.items():
        lst.sort(key=lambda p: -int(cnt[p]))
        for i, p in enumerate(lst):
            order_in_country[p] = i + 1

    pj = []
    for pid in provinces:
        sl = objs[pid - 1] if pid - 1 < len(objs) else None
        bbox = [int(sl[1].start), int(sl[0].start), int(sl[1].stop), int(sl[0].stop)] if sl else [0, 0, 0, 0]
        pk = prov_polity[pid]
        key = by_polity[pk]
        bc = best_city.get(pid)
        nm = bc[0] if bc else "%s·第%d省" % (table[key]["zh"], order_in_country[pid])
        pj.append({"id": pid, "polity": key, "px": int(cnt[pid]),
                   "area_km2": round(float(cnt[pid]) * C.KM2_PER_PX, 1),
                   "cx": round(float(sx[pid] / cnt[pid]), 1),
                   "cy": round(float(sy[pid] / cnt[pid]), 1),
                   "bbox": bbox, "has_capital": False, "name": nm})
    print("S5 provinces=%d  named_by_city=%d" % (len(pj), sum(1 for p in pj if best_city.get(p["id"]))))

    # ---- capitals -----------------------------------------------------
    cap_px = {}
    for key in keys_all:
        pk = PID[key]
        if key in CAP_FIX:
            nm, lon, lat = CAP_FIX[key]
            px, py = C.lonlat_to_px(lon, lat)
            cap_px[key] = (nm, int(round(px)), int(round(py)), int(round(px)), int(round(py)))
            continue
        cands = [p for p in places if p["cap"] and p["polity"] == pk]
        if not cands:
            cands = [p for p in places if p["polity"] == pk]
        if not cands:
            # fall back to largest city
            cands = sorted([p for p in places if p["polity"] == pk], key=lambda p: -p["pop"])
        if not cands:
            cap_px[key] = None
            continue
        c = max(cands, key=lambda p: p["pop"])
        cap_px[key] = (c["name"], c["x"], c["y"], c["x"], c["y"])

    for p in pj:
        cc = cap_px.get(p["polity"])
        if cc and cc[1] is not None:
            sl = p["bbox"]
            if sl[0] <= cc[1] < sl[2] and sl[1] <= cc[2] < sl[3] and 0 <= cc[2] < H and 0 <= cc[1] < W:
                if int(prov[cc[2], cc[1]]) == p["id"]:
                    p["has_capital"] = True
    named = sum(1 for p in pj if p["has_capital"])
    print("S5 capitals located=%d/%d  provinces flagged=%d" % (
        sum(1 for k in keys_all if cap_px.get(k)), len(keys_all), named))

    # ---- country metadata + label anchor -------------------------------
    lab = {}
    for key in keys_all:
        pk = PID[key]
        pm = polity == pk
        ys, xs = np.nonzero(pm)
        sl = (slice(int(ys.min()), int(ys.max()) + 1), slice(int(xs.min()), int(xs.max()) + 1))
        sub = pm[sl]
        l, n = ndimage.label(sub)
        if n == 0:
            continue
        c = np.bincount(l.ravel(), minlength=n + 1)
        big = int(np.argmax(c[1:])) + 1
        m2 = (l == big)
        ys2, xs2 = np.nonzero(m2)
        lab[key] = (int(xs2.mean()) + sl[1].start, int(ys2.mean()) + sl[0].start)

    cj = {}
    for key in keys_all:
        pk = PID[key]
        npx = int((polity == pk).sum())
        pids = srt.get(pk, [])
        cap = cap_px.get(key)
        t = dict(table[key])
        t.update({"polity_id": pk, "en": EN_FIX.get(key) or ne_name.get(key) or key,
                  "px": npx, "area_km2": round(npx * C.KM2_PER_PX, 1),
                  "province_count": len(pids),
                  "capital": cap[0] if cap else None,
                  "capital_px": [cap[1], cap[2]] if cap else None,
                  "label_px": list(lab.get(key, [0, 0])),
                  "gdp_per_capita": round(t["gdp_bn"] * 1e9 / (t["pop_m"] * 1e6), 1),
                  "industry_pct": round(t["industry_bn"] / t["gdp_bn"] * 100.0, 1)})
        cj[key] = t
    print("S5 country_meta=%d ; area(Mkm2) %s" % (
        len(cj), ", ".join("%s=%.2f" % (k, cj[k]["area_km2"] / 1e6) for k in
                           ["SUN", "CAN", "CHN", "USA", "BRA", "AUS", "IND", "ARG"])))

    # ---- 游戏集团聚合（低存在感国家合并；parent=宗主，经济=成员求和，成员明细保留在 members）----
    # 栅格不改：成员仍各有 polity_id；集团是「可玩实体」的显示/经济聚合层。
    member_meta = dict(cj)          # 133 个成员的完整明细（游戏引擎「经济分开算」用）
    playable, group_keys = C.playable_keys(table)

    def centroid_of(keys):
        best, bestpx = None, -1
        for k in keys:
            m = member_meta.get(k)
            if m and m.get("px", 0) > bestpx and m.get("label_px"):
                best, bestpx = m["label_px"], m["px"]
        return list(best) if best else [0, 0]

    def capital_of(keys):
        for k in keys:
            m = member_meta.get(k)
            if m and m.get("capital"):
                return m["capital"], m["capital_px"]
        return None, None

    # 「并入既有独立国」：宿主 pop/gdp/ind/px/面积/省数 并入成员（经济合并），宿主实体不新增
    for host in set(C.INTO_INDEPENDENT.values()):
        if host in cj:
            cj[host].setdefault("members", [])
    for mem, host in C.INTO_INDEPENDENT.items():
        if mem in member_meta and host in cj:
            mm = member_meta[mem]
            cj[host]["members"].append(mm)
            cj[host]["pop_m"] = round(cj[host]["pop_m"] + mm["pop_m"], 2)
            cj[host]["gdp_bn"] = round(cj[host]["gdp_bn"] + mm["gdp_bn"], 2)
            cj[host]["industry_bn"] = round(cj[host]["industry_bn"] + mm["industry_bn"], 2)
            cj[host]["px"] = int(cj[host]["px"] + mm["px"])
            cj[host]["area_km2"] = round(cj[host]["area_km2"] + mm["area_km2"], 1)
            cj[host]["province_count"] = int(cj[host]["province_count"] + mm["province_count"])

    for g in group_keys:
        zh, en, mem, parent, bloc = C.GROUPS[g]
        mem = [m for m in mem if m in member_meta]
        pids = sorted({member_meta[m]["polity_id"] for m in mem})
        mask = np.isin(polity, pids)
        npx = int(mask.sum())
        cap, cap_px_v = capital_of(mem)
        pop = sum(member_meta[m]["pop_m"] for m in mem)
        gdp = sum(member_meta[m]["gdp_bn"] for m in mem)
        ind = sum(member_meta[m]["industry_bn"] for m in mem)
        prov_n = sum(member_meta[m]["province_count"] for m in mem)
        cj[g] = {"key": g, "zh": zh, "en": en, "bloc": bloc,
                 "pop_m": round(pop, 2), "gdp_bn": round(gdp, 2), "industry_bn": round(ind, 2),
                 "polity_ids": pids, "px": npx, "area_km2": round(npx * C.KM2_PER_PX, 1),
                 "province_count": prov_n, "capital": cap, "capital_px": cap_px_v,
                 "label_px": centroid_of(mem),
                 "parent": parent, "members": [member_meta[m] for m in mem],
                 "gdp_per_capita": round(gdp * 1e9 / (pop * 1e6), 1) if pop else 0,
                 "industry_pct": round(ind / gdp * 100.0, 1) if gdp else 0}

    # 被集团/宿主吸收的成员不再作为独立可玩实体出现在顶层（明细保留在其 members 里）
    absorbed = set(C.PARENT_OF_MEMBER.keys())
    for m in absorbed:
        cj.pop(m, None)

    print("S5 playable entities=%d (独立 %d + 集团 %d)；被吸收成员 %d；含 parent 附属 %d" % (
        len(cj), len([k for k in cj if k not in group_keys]), len(group_keys),
        len(absorbed), sum(1 for g in group_keys if C.GROUP_PARENT[g])))

    # ---- city layer -----------------------------------------------------
    seen = set()
    cities = []
    for p in places:
        if p["cap"] or p["pop"] >= 250000 or p["rank"] <= 3:
            k = (p["name"], p["x"], p["y"])
            if k in seen:
                continue
            seen.add(k)
            cities.append([p["name"], p["x"], p["y"], p["pop"], 1 if p["cap"] else 0])
    cities.sort(key=lambda c: -c[3])
    print("S5 city layer points=%d" % len(cities))

    json.dump(pj, open(OUT_P, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(cj, open(OUT_C, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(cities, open(OUT_CT, "w", encoding="utf-8"), ensure_ascii=False)


main()
