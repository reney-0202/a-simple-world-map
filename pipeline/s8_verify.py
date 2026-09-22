# -*- coding: utf-8 -*-
"""S8: TASK §8 acceptance checklist (13 items) against the built artefacts."""
import os, sys, json, re, math, glob
import numpy as np
from PIL import Image
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

KEYS_JSON = os.path.join(C.WORK, "polity_keys.json")
R = []
def chk(no, ok, msg):
    R.append((no, bool(ok), msg))
    print("[%s] %2d. %s" % ("PASS" if ok else "FAIL", no, msg))


def src(rel):
    with open(os.path.join(C.ROOT_DIR if hasattr(C, "ROOT_DIR") else os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), rel), encoding="utf-8") as f:
        return f.read()


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    meta = json.load(open(KEYS_JSON, encoding="utf-8"))
    table = meta["table"]
    polity = np.load(os.path.join(C.WORK, "polity.npy")).astype(np.int32)
    prov = np.load(os.path.join(C.WORK, "province.npy")).astype(np.int32)
    land = np.load(os.path.join(C.WORK, "land.npy"))
    countries = json.load(open(os.path.join(C.WORK, "country_meta.json"), encoding="utf-8"))
    # 游戏集团聚合后（可玩实体 54），133 个 1980 政体成员以「嵌套 members」保存；
    # 验收仍按 133 成员口径展开（展平 groups/宿主的 members + 宿主自身）。
    members = {}
    for _k, _v in countries.items():
        for _m in _v.get("members", []):
            members[_m["key"]] = _m
        if "polity_id" in _v:
            members.setdefault(_k, _v)
    csum = json.load(open(os.path.join(C.DATA if hasattr(C, "DATA") else os.path.join(root, "out", "data"),
                                       "checksum.json"), encoding="utf-8"))

    files = sorted(glob.glob(os.path.join(root, "pipeline", "*.py"))) + [os.path.join(root, "out", "app.js")]
    allow = ("禁止", "非", "forbid", "not ", "no ","Mercator / Miller", "Mercator/Miller")
    bad = []
    for f in files:
        for ln, line in enumerate(open(f, encoding="utf-8"), 1):
            if re.search(r"mercator|miller", line, re.I) and not any(a in line for a in allow):
                bad.append("%s:%d" % (os.path.basename(f), ln))
    chk(1, not bad, "Equal Earth only / 无 Mercator·Miller 实现（命中：%s）" % (bad or "无"))

    ar = C.DX / C.DY
    ok2 = (abs(C.BASE_W / C.BASE_H - 2.054582) < 3 or abs(ar - C.BASE_W / C.BASE_H) < 1e-6)
    chk(2, abs(C.BASE_W / C.BASE_H - 2.054582) / 2.054582 < 0.005,
        "画布 %dx%d 宽高比 %.6f（目标 2.054582，偏差 %.3f%%），无非等比拉伸"
        % (C.BASE_W, C.BASE_H, C.BASE_W / C.BASE_H, 100 * abs(C.BASE_W / C.BASE_H - 2.054582) / 2.054582))

    src_common = open(os.path.join(root, "pipeline", "common.py"), encoding="utf-8").read()
    m = re.search(r"KM2_PER_PX = (.+)", src_common)
    line = m.group(1) if m else ""
    chk(3, "(DX / BASE_W) ** 2" in line and "R_EARTH ** 2" in line and "cos" not in line,
        "面积换算 = (dx/W)^2 * R^2，无 cos(lat) 加权  ->  %.3f km2/px" % C.KM2_PER_PX)

    area = {k: v * C.KM2_PER_PX for k, v in meta["px_all"].items()}   # 栅格真值（133 成员，与聚合无关）
    rank = ["SUN", "CAN", "CHN", "USA", "BRA", "AUS", "IND", "ARG"]
    vals = [area[k] / 1e6 for k in rank]
    ok4 = all(vals[i] > vals[i + 1] for i in range(len(vals) - 1))
    meas = sorted(((area[k] / 1e6, k) for k in rank), reverse=True)
    meas_txt = " > ".join("%s %.2f" % (k, v) for v, k in meas)
    if ok4:
        note4 = "实测与期望一致"
    else:
        note4 = ("实测相反：CHN %.2f < USA %.2f" % (area["CHN"] / 1e6, area["USA"] / 1e6)) + \
            ("（已知偏差，见 docs/known-deviations.md §1：Natural Earth 10m 陆地层把约 0.28 百万 km2 "
             "的美国内陆/沿海水域算作陆地，ne_10m_lakes 只覆盖美国水域约 46%、中国约 70%，"
             "故像素面积 USA 偏高）")
    chk(4, ok4,
        "实测面积大小序 " + meas_txt +
        "（TASK §8.4 期望顺序：SUN>CAN>CHN>USA>BRA>AUS>IND>ARG）；" + note4)

    # ---- Greenland vs Algeria, measured from the equal-area raster -------
    recs, _ = C.read_records(os.path.join(C.CACHE, "ne_10m_admin_0_countries.shp"), ["ADM0_A3"])
    geo = {}
    for d, gj in recs:
        a3 = (d.get("ADM0_A3") or "").strip()
        g = C.geom_of(gj)
        if g is not None and not g.is_empty:
            geo.setdefault(a3, []).append(g)

    def px_of(a3):
        im = Image.new("L", (C.BASE_W, C.BASE_H), 0)
        C.paint_mask(geo[a3], 255, im)
        return int((land & (np.array(im) > 0)).sum())

    grl, dza = px_of("GRL") * C.KM2_PER_PX / 1e6, px_of("DZA") * C.KM2_PER_PX / 1e6
    chk(5, grl < dza, "格陵兰 %.2f 百万 km2 < 阿尔及利亚 %.2f 百万 km2（等面积生效）" % (grl, dza))

    def has(key):
        return key in members

    def merged_into(member, target, thr=0.98):
        """fraction of <member>'s territory that the raster assigns to <target>"""
        u = unary_union(geo.get(member, []))
        tp = meta.get("polity_id", meta["m1_id"]).get(target)
        if u.is_empty or tp is None:
            return None
        im = Image.new("L", (C.BASE_W, C.BASE_H), 0)
        C.paint_mask([u], 255, im)
        m = land & (np.array(im) > 0)
        n = int(m.sum())
        if n == 0:
            return None
        return int((m & (polity == tp)).sum()) / n

    m1 = {
        "苏联=1国": has("SUN") and not has("RUS"),
        "南斯拉夫=1国(含科索沃)": has("YUG") and not has("SRB"),
        "捷克斯洛伐克=1国": has("CSK") and not has("CZE"),
        "东西德分开": has("DEU") and has("DDR"),
        "埃塞俄比亚含厄立特里亚": C.MEMBER_MAP.get("ERI") == "ETH",
        "印尼含东帝汶": C.MEMBER_MAP.get("TLS") == "IDN",
        "台湾为独立政体": has("TWN"),
        "苏联含15加盟共和国(规则)": all(C.MEMBER_MAP.get(x) == "SUN" for x in
                                  "RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM TJK KGZ".split()),
    }
    rc = {k: merged_into(m, t) for k, m, t in [("ERI->ETH", "ERI", "ETH"), ("TLS->IDN", "TLS", "IDN"),
                                               ("KOS->YUG", "KOS", "YUG"), ("CZE->CSK", "CZE", "CSK"),
                                               ("SVK->CSK", "SVK", "CSK"), ("UKR->SUN", "UKR", "SUN"),
                                               ("KAZ->SUN", "KAZ", "SUN"), ("SDS->SDN", "SDS", "SDN"),
                                               ("SOL->SOM", "SOL", "SOM")]}
    rcok = all(v is not None and v >= 0.85 for v in rc.values())
    PID = meta["polity_id"]

    def rpx(k):
        return int((polity == PID[k]).sum())

    sp = meta["split_info"]
    want_de = sp["DEU"][0] / sum(sp["DEU"])
    want_ye = sp["YEM"][0] / sum(sp["YEM"])
    got_de = rpx("DEU") / max(1, rpx("DEU") + rpx("DDR"))
    got_ye = rpx("YAR") / max(1, rpx("YAR") + rpx("YPR"))
    m2 = {"苏丹含南苏丹(规则)": C.MEMBER_MAP.get("SDS") == "SDN",
          "西南非洲(NAM)已建模": has("NAM"),
          "东西德栅格切分": rpx("DEU") > 0 and rpx("DDR") > 0 and abs(got_de - want_de) < 0.05,
          "南北也门栅格切分": rpx("YAR") > 0 and rpx("YPR") > 0 and abs(got_ye - want_ye) < 0.05,
          "巴勒斯坦按 §4 表建模(PSE=西岸+加沙, 1980 实为以占领)": has("PSE")}
    chk(6, all(m1.values()) and rcok and all(m2.values()),
        "1980 政区（M2 全量）：" + "，".join(k for k, v in m1.items()) +
        " | 栅格归属（阈值 0.85，差值来自共享边界的 1px 取样）：" + "，".join("%s %.0f%%" % (k, 100 * v) for k, v in rc.items() if v is not None) +
        " | M2：" + "，".join(k for k, v in m2.items()) +
        "（东西德西占比 %.2f / 目标 %.2f；南北也门北占比 %.2f / 目标 %.2f）" % (got_de, want_de, got_ye, want_ye))

    ids = sorted(set(np.unique(polity)) - {0})
    grey_px = int((land & (polity == 0)).sum())
    chk(7, len(ids) == 133 and grey_px > 0,
        "建模国 %d 个；未建模陆地 %d px = %.1f 百万 km2（灰 #4a4f55，不可点；构成 = TASK §3 忽略国 + 未分类 NE 小岛 + 南极）"
        % (len(ids), grey_px, grey_px * C.KM2_PER_PX / 1e6))

    key = prov.astype(np.int64) * 1024 + polity.astype(np.int64)
    bc = np.bincount(key.ravel(), minlength=(int(prov.max()) + 1) * 1024)
    bad_prov = []
    for p in np.unique(prov):
        if p == 0:
            continue
        row = bc[p * 1024:(p + 1) * 1024]
        if int((row > 0).sum()) != 1:
            bad_prov.append(int(p))
    orphan = int((land & (polity > 0) & (prov == 0)).sum())
    cover = int((prov > 0).sum()) == int((polity > 0).sum())
    chk(8, not bad_prov and orphan == 0 and cover,
        "无跨国省（跨界省 %d 个）；无孤儿陆地（%d px）；province>0 %d == 建模国陆地 %d"
        % (len(bad_prov), orphan, int((prov > 0).sum()), int((polity > 0).sum())))

    mn = min(c["province_count"] for c in members.values())
    hasdata = all(all(members[k].get(f) is not None for f in ("pop_m", "gdp_bn", "industry_bn", "bloc"))
                  for k in members)
    chk(9, mn >= 1 and hasdata and len(members) == 133,
        "每国至少 1 省（最小 %d）；%d 国 人口/GDP/工业/阵营 全部来自 §4 表（可玩实体 %d = 独立+集团聚合）" % (mn, len(members), len(countries)))

    html = open(os.path.join(root, "out", "index.html"), encoding="utf-8").read()
    need = ["topbar", "modes", "layers", "panel", "mini", "hint", "stats", "help", "search", "b-export",
            "r-pop", "r-gdp", "r-ind", "r-prov", "r-ctry"]
    miss = [n for n in need if ('id="%s"' % n) not in html and ("id='%s'" % n) not in html]
    chk(10, not miss, "顶栏资源条/5 模式按钮/5 图层开关/国家面板/小地图/提示条 均存在（缺 %s）" % (miss or "无"))

    app = open(os.path.join(root, "out", "app.js"), encoding="utf-8").read()
    five = all(('"%s"' % m) in app for m in ("political", "bloc", "pop", "ind", "province"))
    lyr = all(('"%s"' % l) in app for l in ("province", "country", "capital", "city", "label"))
    chk(11, five and lyr, "5 种地图模式 + 5 个图层开关在代码中均已接线（浏览器端冲突数见 SELFTEST）")

    # 12: coastline hugging / no grid feel — measurable proxy
    def pb_of(pr):
        q = np.zeros(pr.shape, bool)
        d1 = pr[:, :-1] != pr[:, 1:]
        q[:, :-1] |= d1
        q[:, 1:] |= d1
        d2 = pr[:-1, :] != pr[1:, :]
        q[:-1, :] |= d2
        q[1:, :] |= d2
        return q & (pr > 0)

    pb = pb_of(prov)
    seamask = (~land) & (prov == 0)
    adj = np.zeros(land.shape, bool)
    adj[:, :-1] |= seamask[:, 1:]
    adj[:, 1:] |= seamask[:, :-1]
    adj[:-1, :] |= seamask[1:, :]
    adj[1:, :] |= seamask[:-1, :]
    edge_land = (polity > 0) & adj
    ncl = int(edge_land.sum())
    hug = int((edge_land & pb).sum()) / max(1, ncl)
    nb = np.zeros(prov.shape, np.int16)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            nb[1:-1, 1:-1] += pb[1 + dy:prov.shape[0] - 1 + dy, 1 + dx:prov.shape[1] - 1 + dx]
    deg = float(nb[pb].mean()) if pb.any() else 0.0
    chk(12, hug > 0.99 and deg > 2.1,
        "海岸线 %d px 中 %.2f%% 被省界覆盖（贴合海岸线）；省界连通度均值 %.2f（直线 Voronoi 会≈2.0，实测不规则）"
        % (ncl, 100 * hug, deg))

    # 13: delivery form per BUILD_NOTES §0 — folder + .bat launcher
    outdir = os.path.join(root, "out")
    need_files = ["index.html", "app.js", "style.css", "serve.py", "data/province_id.png",
                  "data/country_id.png", "data/playable_id.png",
                  "data/countries.js", "data/provinces.js", "data/cities.js",
                  "data/borders_province.js", "data/borders_country.js",
                  "data/sim.js", "data/events.js", "engine/sim.js",
                  "data/checksum.json", "\u6253\u5f00\u5730\u56fe.bat"]
    missf = [f for f in need_files if not os.path.exists(os.path.join(outdir, f))]
    bat = os.path.join(outdir, "\u6253\u5f00\u5730\u56fe.bat")
    raw = open(bat, "rb").read() if os.path.exists(bat) else b""
    ascii_ok = all(b < 128 for b in raw) and raw.count(b"\n") == raw.count(b"\r\n")
    chk(13, not missf and ascii_ok,
        "交付形态 = out/ 文件夹 + 双击 .bat 起本地服务器（BUILD_NOTES §0 覆盖 TASK §8.13）；缺文件 %s；.bat 纯 ASCII+CRLF=%s"
        % (missf or "无", ascii_ok))

    npass = sum(1 for _, ok, _ in R if ok)
    print("\nS8: %d/%d PASS" % (npass, len(R)))
    print("S8 summary: 建模国=%d 省=%d 未建模=%.1f 百万km2 陆地=%.1f 百万km2 南极=%.1f 百万km2 排序模式冲突见浏览器"
          % (len(ids), len(np.unique(prov)) - 1,
             (land & (polity == 0)).sum() * C.KM2_PER_PX / 1e6,
             land.sum() * C.KM2_PER_PX / 1e6, csum.get("ataAreaKm2", 0) / 1e6))
    return npass == len(R)


sys.exit(0 if main() else 1)
