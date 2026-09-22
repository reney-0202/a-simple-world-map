# -*- coding: utf-8 -*-
"""S6: export out/data/* (id rasters, borders, JS metadata, checksum) + read-back check."""
import os, sys, json
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

PROV = os.path.join(C.WORK, "province.npy")
POLITY = os.path.join(C.WORK, "polity.npy")
KEYS_JSON = os.path.join(C.WORK, "polity_keys.json")
DATA = os.path.join(C.OUT, "data")
OCEAN = "#16202b"


def pack(ids):
    return (ids & 255).astype(np.uint8), ((ids >> 8) & 255).astype(np.uint8), ((ids >> 16) & 255).astype(np.uint8)


def borders(ids, keep):
    b = np.zeros(ids.shape, bool)
    d = ids[:, :-1] != ids[:, 1:]
    b[:, :-1] |= d
    b[:, 1:] |= d
    d2 = ids[:-1, :] != ids[1:, :]
    b[:-1, :] |= d2
    b[1:, :] |= d2
    return b & keep


def main():
    os.makedirs(DATA, exist_ok=True)
    meta = json.load(open(KEYS_JSON, encoding="utf-8"))
    prov = np.load(PROV).astype(np.int32)
    polity = np.load(POLITY).astype(np.int32)
    land = np.load(os.path.join(C.WORK, "land.npy"))
    provinces = json.load(open(os.path.join(C.WORK, "provinces.json"), encoding="utf-8"))
    countries = json.load(open(os.path.join(C.WORK, "country_meta.json"), encoding="utf-8"))
    cities = json.load(open(os.path.join(C.WORK, "cities.json"), encoding="utf-8"))

    r, g, b = pack(prov)
    Image.fromarray(np.dstack([r, g, b]), "RGB").save(os.path.join(DATA, "province_id.png"))

    a = np.where(land, 255, 0).astype(np.uint8)
    cr, cg, cb = pack(polity)
    Image.fromarray(np.dstack([cr, cg, cb, a]), "RGBA").save(os.path.join(DATA, "country_id.png"))

    # ---- 可玩实体栅格（低存在感国家合并成集团后，政治/阵营等模式按「实体」整体上色）----
    # playable id = 实体在排序键表中的序号(1..N, 0=海洋/未建模)；由成员 polity_id 重映射得到。
    # 纯派生：不改 province/polity/land，M1 冻结不破。
    playable_keys = sorted(countries.keys())          # countries 已含集团聚合（见 S5）
    play_id_of_key = {k: i + 1 for i, k in enumerate(playable_keys)}
    pid2play = np.zeros(256, np.int32)
    for k, v in countries.items():
        tgt = play_id_of_key[k]
        if "polity_ids" in v:                          # 集团：多个成员政体
            for mpid in v["polity_ids"]:
                pid2play[int(mpid)] = tgt
        else:                                          # 独立国（可能含 INTO_INDEPENDENT 并入成员）
            pid2play[int(v["polity_id"])] = tgt
            for mm in v.get("members", []):
                pid2play[int(mm["polity_id"])] = tgt
    playable = pid2play[np.clip(polity, 0, 255)]
    playable = np.where(land, playable, 0).astype(np.int32)
    pr, pg, pb = pack(playable)
    Image.fromarray(np.dstack([pr, pg, pb]), "RGB").save(os.path.join(DATA, "playable_id.png"))
    print("S6 playable_id: entities=%d  nonzero=%d" % (len(playable_keys), int((playable > 0).sum())))

    bp = borders(prov, prov > 0)
    bimg = np.zeros((prov.shape[0], prov.shape[1], 4), np.uint8)
    bimg[..., :3] = 255
    bimg[..., 3] = np.where(bp, 255, 0).astype(np.uint8)
    Image.fromarray(bimg, "RGBA").save(os.path.join(DATA, "border_province.png"))

    bc = borders(polity, polity > 0)
    cimg = np.zeros((prov.shape[0], prov.shape[1], 4), np.uint8)
    cimg[..., :3] = 255
    cimg[..., 3] = np.where(bc, 255, 0).astype(np.uint8)
    Image.fromarray(cimg, "RGBA").save(os.path.join(DATA, "border_country.png"))

    # ---------------- read-back verification ----------------
    back = np.array(Image.open(os.path.join(DATA, "province_id.png")).convert("RGB")).astype(np.int64)
    rid = back[..., 0] + back[..., 1] * 256 + back[..., 2] * 65536
    nz0, nz1 = int((prov > 0).sum()), int((rid > 0).sum())
    s0, s1 = int(prov.sum()), int(rid.sum())
    same = bool((rid == prov).all())
    print("S6 readback: nonzero %d==%d:%s  idSum %d==%d:%s  exact=%s"
          % (nz0, nz1, nz0 == nz1, s0, s1, s0 == s1, same))
    if not (nz0 == nz1 and s0 == s1 and same):
        raise SystemExit("S6 FATAL: province_id.png read-back mismatch")

    # Antarctica pixel count (needed for the equal-area self-check line in the UI)
    recs0, _ = C.read_records(os.path.join(C.CACHE, "ne_10m_admin_0_countries.shp"), ["ADM0_A3"])
    ata = [C.geom_of(gj) for d, gj in recs0 if (d.get("ADM0_A3") or "").strip() == "ATA"]
    aimg = Image.new("L", (C.BASE_W, C.BASE_H), 0)
    C.paint_mask(ata, 255, aimg)
    ata_px = int((land & (np.array(aimg) > 0)).sum())

    csum = {
        "nonzero": nz0,
        "idSum": s0,
        "maxId": int(prov.max()),
        "countryCount": len(countries),
        "provinceCount": len(provinces),
        "base": [C.BASE_W, C.BASE_H],
        "km2PerPx": round(C.KM2_PER_PX, 6),
        "oceanColor": OCEAN,
        "aspect": round(C.ASPECT, 6),
        "landPx": int(land.sum()),
        "landAreaKm2": round(float(land.sum()) * C.KM2_PER_PX, 1),
        "modelledPx": int((polity > 0).sum()),
        "modelledAreaKm2": round(float((polity > 0).sum()) * C.KM2_PER_PX, 1),
        "unmodelledPx": int((land & (polity == 0)).sum()),
        "unmodelledAreaKm2": round(float((land & (polity == 0)).sum()) * C.KM2_PER_PX, 1),
        "ataPx": ata_px,
        "ataAreaKm2": round(ata_px * C.KM2_PER_PX, 1),
        "sha256_province_id_png": __import__("hashlib").sha256(
            open(os.path.join(DATA, "province_id.png"), "rb").read()).hexdigest(),
    }
    json.dump(csum, open(os.path.join(DATA, "checksum.json"), "w", encoding="utf-8"), ensure_ascii=False)

    by_id = {str(v["polity_id"]): k for k, v in countries.items() if "polity_id" in v}
    by_playable_id = {str(play_id_of_key[k]): k for k in playable_keys}
    blob = {"countries": countries, "byId": by_id, "byPlayableId": by_playable_id, "checksum": csum}
    with open(os.path.join(DATA, "countries.js"), "w", encoding="utf-8") as f:
        f.write("window.W1980_COUNTRIES=" + json.dumps(blob, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA, "provinces.js"), "w", encoding="utf-8") as f:
        f.write("window.W1980_PROVINCES=" + json.dumps(
            {str(p["id"]): p for p in provinces}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(os.path.join(DATA, "cities.js"), "w", encoding="utf-8") as f:
        f.write("window.W1980_CITIES=" + json.dumps(cities, ensure_ascii=False, separators=(",", ":")) + ";\n")

    # ---- M4 仿真参数 + 引擎分发（engine/sim.js → out/engine/sim.js）----
    sim = C.sim_params(meta["table"])
    with open(os.path.join(DATA, "sim.js"), "w", encoding="utf-8") as f:
        f.write("window.W1980_SIMDATA=" + json.dumps(sim, ensure_ascii=False, separators=(",", ":")) + ";\n")
    eng_src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine", "sim.js")
    eng_dst = os.path.join(C.OUT, "engine")
    os.makedirs(eng_dst, exist_ok=True)
    with open(os.path.join(eng_dst, "sim.js"), "w", encoding="utf-8") as f:
        f.write(open(eng_src, encoding="utf-8").read())
    print("S6 sim.js: members=%d seed=%d ; engine copied -> out/engine/sim.js" % (len(sim["popRate"]), sim["seed"]))

    # ---- M6 事件剧本导出 ----
    import events_data as EV_D
    with open(os.path.join(DATA, "events.js"), "w", encoding="utf-8") as f:
        f.write("window.W1980_EVENTS=" + json.dumps(EV_D.EVENTS, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("S6 events.js: %d events" % len(EV_D.EVENTS))

    for fn in sorted(os.listdir(DATA)):
        print("  %-24s %8.1f KB" % (fn, os.path.getsize(os.path.join(DATA, fn)) / 1024.0))
    print("S6 checksum:", json.dumps({k: csum[k] for k in
                                      ("nonzero", "idSum", "maxId", "countryCount", "provinceCount",
                                       "km2PerPx", "landAreaKm2", "unmodelledAreaKm2")}))


main()
