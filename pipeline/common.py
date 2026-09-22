# -*- coding: utf-8 -*-
"""Shared constants / helpers for the world1980 M1 pipeline (Equal Earth, no GDAL)."""
import os, math, json
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import box, shape as shp_shape
from shapely.affinity import translate
import shapely

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "assets_cache")
WORK = os.path.join(ROOT, "work")
OUT = os.path.join(ROOT, "out")
for d in (WORK, OUT, os.path.join(OUT, "data")):
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------- projection
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M_EE = math.sqrt(3.0) / 2.0
R_EARTH = 6371.0088

X_MIN, X_MAX = -2.706630, 2.706630
Y_MIN, Y_MAX = -1.317363, 1.317363
DX = X_MAX - X_MIN
DY = Y_MAX - Y_MIN

BASE_W = 4096
BASE_H = int(round(BASE_W * DY / DX))          # 1994
KM2_PER_PX = (DX / BASE_W) ** 2 * R_EARTH ** 2  # 70.895
ASPECT = DX / DY                                # 2.054582


def ee_xy(lon, lat):
    """Equal Earth forward projection. lon/lat in degrees -> projection units."""
    lon = np.asarray(lon, dtype=np.float64)
    lat = np.asarray(lat, dtype=np.float64)
    lam = np.radians(lon)
    phi = np.radians(np.clip(lat, -90.0, 90.0))
    t = np.arcsin(M_EE * np.sin(phi))
    t2 = t * t
    t6 = t2 * t2 * t2
    x = lam * np.cos(t) / (M_EE * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


def lonlat_to_px(lon, lat):
    x, y = ee_xy(lon, lat)
    return (x - X_MIN) / DX * BASE_W, (Y_MAX - y) / DY * BASE_H


# ------------------------------------------------------------- geom helpers
BOX_W = box(-180.0, -90.0, 0.0, 90.0)
BOX_E = box(0.0, -90.0, 180.0, 90.0)
BOX_NE = box(180.0, -90.0, 360.0, 90.0)


def explore(geom):
    """Explode any geometry into a flat list of Polygons."""
    out = []
    if geom is None:
        return out
    try:
        if geom.is_empty:
            return out
    except Exception:
        return out
    gt = geom.geom_type
    if gt == "Polygon":
        out.append(geom)
    elif gt in ("MultiPolygon", "GeometryCollection"):
        for g in geom.geoms:
            out.extend(explore(g))
    return out


def safe(geom):
    if geom is None:
        return None
    try:
        if geom.is_valid:
            return geom
    except Exception:
        pass
    try:
        return shapely.make_valid(geom)
    except Exception:
        try:
            return geom.buffer(0)
        except Exception:
            return geom


def split_antimeridian(p):
    """Split one Polygon so that no piece crosses lon=+-180."""
    try:
        b = p.bounds
    except Exception:
        return []
    if b[2] - b[0] <= 180.0:
        return [p]
    pieces = []
    try:
        right = p.intersection(BOX_E)
        left = p.intersection(BOX_W)
    except Exception:
        return [p]
    if not right.is_empty:
        pieces.extend(explore(right))
    if not left.is_empty:
        sh = translate(left, xoff=360.0)
        for g in explore(sh):
            gb = g.bounds
            if gb[2] <= 180.0:
                pieces.append(g)
            elif gb[0] >= 180.0:
                pieces.append(translate(g, xoff=-360.0))
            else:
                try:
                    pieces.append(g.intersection(BOX_E))
                    pieces.append(translate(g.intersection(BOX_NE), xoff=-360.0))
                except Exception:
                    pass
    out = []
    for g in pieces:
        for q in explore(g):
            if not q.is_empty:
                out.append(q)
    return out


def ring_to_px(coords):
    a = np.asarray(coords, dtype=np.float64)
    if a.ndim != 2 or a.shape[0] < 3:
        return None
    lon, lat = a[:, 0], a[:, 1]
    if not (np.isfinite(lon).all() and np.isfinite(lat).all()):
        return None
    x, y = lonlat_to_px(lon, lat)
    return list(zip(x.tolist(), y.tolist()))


def paint_mask(geoms, fill=255, img=None):
    """Rasterise shapely geoms (lon/lat) into an 8-bit PIL image. Holes -> 0."""
    if img is None:
        img = Image.new("L", (BASE_W, BASE_H), 0)
    d = ImageDraw.Draw(img)
    parts = []
    for g in geoms:
        for p in explore(g):
            parts.extend(split_antimeridian(p))
    for p in parts:
        if p.is_empty:
            continue
        ext = ring_to_px(p.exterior.coords)
        try:
            if ext is None:
                continue
            d.polygon(ext, fill=fill)
            for r in p.interiors:
                h = ring_to_px(r.coords)
                if h is not None:
                    d.polygon(h, fill=0)
        except Exception:
            continue
    return img


# --------------------------------------------------------------- data table
TABLE = """
AFG|阿富汗|13.5|3.5|0.63|SOV
ARG|阿根廷|28.1|77|25.4|W
AUS|澳大利亚|14.7|163|58.7|W
AUT|奥地利|7.5|82|27.9|NE
BEL|比利时|9.9|124|44.6|NATO
BGR|保加利亚|8.9|25|11.2|WP
BRA|巴西|122|235|82.2|W
CAN|加拿大|24.5|275|99|NATO
CHE|瑞士|6.3|122|41.5|NE
CHL|智利|11.1|29|9.57|W
CHN|中国|981|305|116|CHN
CSK|捷克斯洛伐克|15.3|90|46.8|WP
DDR|东德|16.7|120|60|WP
DEU|西德|61.6|850|340|NATO
EGY|埃及|43.3|23|6.44|W
ESP|西班牙|37.5|230|73.6|NATO
ETH|埃塞俄比亚|35.2|8|1.28|SOV
FIN|芬兰|4.8|53|18|NE
FRA|法国|53.7|690|235|NATO
GBR|英国|56.3|565|203|NATO
GRC|希腊|9.6|57|16|NATO
HUN|匈牙利|10.7|23|9.66|WP
IDN|印度尼西亚|148|86|30.1|NA
IND|印度|687|186|44.6|NA
IRN|伊朗|38.5|90|27|NE
IRQ|伊拉克|13.7|53|23.9|NA
ISR|以色列|3.9|24|7.68|W
ITA|意大利|56.4|480|173|NATO
JPN|日本|118|1105|442|W
KOR|韩国|38.1|65|22.8|W
MEX|墨西哥|68|205|69.7|NA
NGA|尼日利亚|73.4|65|22.8|NA
NLD|荷兰|14.1|190|68.4|NATO
NOR|挪威|4.1|63|23.9|NATO
PAK|巴基斯坦|80.6|24|5.28|NA
PER|秘鲁|17.3|20|6.4|NA
PHL|菲律宾|47.4|36|10.8|W
POL|波兰|35.6|56|26.9|WP
PRK|朝鲜|17.5|15|7.5|SOV
PRT|葡萄牙|9.8|32|10.2|NATO
ROU|罗马尼亚|22.2|45|22.5|WP
SAU|沙特阿拉伯|9.8|164|90.2|W
SUN|苏联|265|1200|540|WP
SWE|瑞典|8.3|131|41.9|NE
THA|泰国|46.7|33|9.9|W
TUR|土耳其|44.1|68|19|NATO
TWN|台湾|17.8|42|17.6|W
USA|美国|227|2862|973|W
VEN|委内瑞拉|15.2|70|28|W
VNM|越南|53|10|3|SOV
YUG|南斯拉夫|22.3|65|27.3|NA
ZAF|南非|29.1|80|30.4|W
ALB|阿尔巴尼亚|2.7|2.5|1|NE
AGO|安哥拉|7.6|5|2|SOV
ARE|阿联酋|1|30|18|W
BEN|贝宁|3.5|1.3|0.26|SOV
BDI|布隆迪|4.2|1.2|0.22|NA
BFA|上沃尔特|6.8|3|0.6|NA
BGD|孟加拉国|80.6|20|4.4|NA
BOL|玻利维亚|5.3|3.6|1.08|NA
BTN|不丹|0.43|0.2|0.03|NA
BWA|博茨瓦纳|0.9|2|0.7|NA
CAF|中非|2.3|0.9|0.16|NA
CIV|科特迪瓦|8.2|10|2.5|W
CMR|喀麦隆|8.7|6.5|1.62|NA
COD|扎伊尔|27|14|4.48|W
COG|刚果(布)|1.6|2.5|0.88|SOV
COL|哥伦比亚|26.5|40|11.2|W
CRI|哥斯达黎加|2.3|4.8|1.34|W
CUB|古巴|9.7|20|7|SOV
DNK|丹麦|5.1|71|21.3|NATO
DOM|多米尼加|5.8|6.7|1.88|W
DZA|阿尔及利亚|19.3|42|18.9|NA
ECU|厄瓜多尔|8|11.8|4.13|W
ESH|西撒哈拉|1|0.5|0.15|NA
GAB|加蓬|0.7|4.5|2.02|W
GHA|加纳|11|5.5|1.38|NA
GIN|几内亚|4.5|2.5|0.88|NA
GTM|危地马拉|7|7.9|1.98|NA
GUY|圭亚那|0.8|0.6|0.18|NA
HND|洪都拉斯|3.7|3.5|0.88|W
HTI|海地|5.7|2.5|0.55|NA
IRL|爱尔兰|3.4|21|6.3|NE
ISL|冰岛|0.23|3.4|1.02|NATO
JAM|牙买加|2.1|2.7|0.86|NA
JOR|约旦|2.3|3.9|1.17|W
KEN|肯尼亚|16|7|1.4|W
KHM|柬埔寨|6.5|0.5|0.09|SOV
KWT|科威特|1.4|28|16.8|W
LAO|老挝|3.2|0.6|0.11|SOV
LBN|黎巴嫩|2.7|2.7|0.81|NA
LBR|利比里亚|1.9|1.5|0.52|W
LBY|利比亚|3.1|38|19|NA
LKA|斯里兰卡|15|5|1.4|NA
LSO|莱索托|1.3|0.6|0.09|NA
MAR|摩洛哥|19.5|21|6.3|NA
MDG|马达加斯加|8.9|3.5|0.7|NA
MLI|马里|6.8|2.2|0.4|NA
MMR|缅甸|33|6.5|1.3|NA
MNG|蒙古|1.7|2|0.8|SOV
MOZ|莫桑比克|12|3.5|0.77|SOV
MRT|毛里塔尼亚|1.6|1.5|0.52|NA
MWI|马拉维|6.2|2.4|0.48|NA
MYS|马来西亚|13.8|24|7.68|NA
NAM|西南非洲|1|2.5|0.8|W
NER|尼日尔|5.6|2.5|0.5|NA
NIC|尼加拉瓜|2.7|2|0.56|SOV
NZL|新西兰|3.1|22|6.6|W
NPL|尼泊尔|15|2.3|0.37|NA
OMN|阿曼|1.2|5|2.5|NA
PAN|巴拿马|2|4.6|1.15|W
PNG|巴布亚新几内亚|3|2.7|0.81|W
PRY|巴拉圭|3.2|4.1|1.07|W
PSE|巴勒斯坦|2|0.5|0.1|NA
RWA|卢旺达|5.2|1.5|0.27|NA
SDN|苏丹|18.7|8|1.6|NA
SEN|塞内加尔|5.6|3.5|0.77|NA
SLE|塞拉利昂|3.2|2.5|0.62|NA
SLV|萨尔瓦多|4.7|3.5|0.98|W
SOM|索马里|5.3|1|0.15|NA
SUR|苏里南|0.4|1.1|0.33|NA
SYR|叙利亚|8.9|13|3.9|SOV
TCD|乍得|4.5|1.5|0.27|NA
TGO|多哥|2.7|1.4|0.31|NA
TTO|特立尼达|1.1|6.2|2.79|W
TUN|突尼斯|6.4|8.6|2.41|NA
TZA|坦桑尼亚|18.6|5.4|1.08|NA
UGA|乌干达|12.6|4|0.8|NA
URY|乌拉圭|2.9|9.7|2.91|W
YAR|北也门|5.9|3|0.6|NA
YPR|南也门|2|1.5|0.45|SOV
ZMB|赞比亚|5.7|3.8|1.33|NA
ZWE|津巴布韦|7.2|5.5|1.65|NA
"""

TIER1 = """AFG ARG AUS AUT BEL BGR BRA CAN CHE CHL CHN CSK DDR DEU EGY ESP ETH FIN FRA
GBR GRC HUN IDN IND IRN IRQ ISR ITA JPN KOR MEX NGA NLD NOR PAK PER PHL POL PRK PRT ROU
SAU SUN SWE THA TUR TWN USA VEN VNM YUG ZAF""".split()


def load_table():
    t = {}
    for line in TABLE.strip().splitlines():
        k, zh, pop, gdp, ind, bloc = line.split("|")
        t[k] = {"key": k, "zh": zh, "pop_m": float(pop), "gdp_bn": float(gdp),
                "industry_bn": float(ind), "bloc": bloc}
    return t


# 1980 merge rules (TASK §3). member NE key -> 1980 polity key.
MERGE = {
    "SUN": "RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM TJK KGZ".split(),
    "YUG": "SRB MNE KOS BIH HRV SVN MKD".split(),
    "CSK": "CZE SVK".split(),
    "ETH": ["ETH", "ERI"],
    "SDN": ["SDN", "SDS"],
    "SOM": ["SOM", "SOL"],
    "IDN": ["IDN", "TLS"],
    "CYP": ["CYP", "CYN"],
    "USA": "USA PRI GUM VIR ASM MNP".split(),
    "FRA": "FRA GUF GLP MTQ REU MYT BLM MAF SPM NCL PYF WLF ATF".split(),
    "GBR": "GBR FLK SGS IOT SHN CYM TCA VGB AIA MSR BMU GIB IMN JEY GGY PCN".split(),
    "DNK": ["DNK", "GRL", "FRO"],
    "AUS": "AUS NFK CXR CCK HMD".split(),
    "NZL": "NZL COK NIU TKL".split(),
    "PCI": "PLW FSM MHL".split(),
    "ANT": "CUW ABW SXM".split(),
}
# BUILD_NOTES §3: CYP appears in both tables and TASK §3 itself says CYP is ignored
# -> the CYP merge never fires; CYP and CYN are both unmodelled grey.
DISABLED_MERGES = {"CYP", "PCI", "ANT"}

IGNORE = set("""AND ANT ATG BHR BLZ BRB BRN COM CPV CYP DJI DMA FJI GMB GNB GNQ GRD HKG KIR KNA
LCA LIE LUX MAC MCO MDV MLT MUS NRU PCI QAT SGP SLB SMR STP SWZ SYC TON TUV VAT VCT VUT WSM""".split())
IGNORE.add("CYN")        # Northern Cyprus: merge rule disabled -> grey
IGNORE.add("ATA")        # Antarctica (NE name for "ANT")
IGNORE.discard("ANT")
# members of the two disabled merges (PCI / ANT) are plain grey units
for _k in ("PLW", "FSM", "MHL", "CUW", "ABW", "SXM"):
    IGNORE.add(_k)
# NE ADM0_A3 spellings that differ from the TASK §4 keys (verified against the data)
ALIAS = {"PSX": "PSE", "SAH": "ESH"}

MEMBER_MAP = {}
for _tgt, _members in MERGE.items():
    if _tgt in DISABLED_MERGES:
        continue
    for _m in _members:
        MEMBER_MAP[_m] = _tgt

# =====================================================================
# 游戏集团（2026-09-19 主人令：低存在感国家合并成联邦/殖民集团，
# 可玩实体 133 -> 54；宗主国挂附属关系但经济分开算）。
# 只作「显示/经济聚合」层，不改地理与冻结栅格：分类器仍把成员解析到原 key，
# S5 再把同一集团的成员聚合成一个可玩实体（parent=宗主国，经济=成员求和）。
# grp -> (显示名 zh, en, [成员], parent宗主国 or None, bloc)
GROUPS = {
    "CAM":  ("中美洲联邦",   "Central American Federation", "GTM HND SLV NIC CRI PAN".split(), None, "NA"),
    "CAR":  ("加勒比联邦",   "Caribbean Federation",        "CUB DOM HTI JAM TTO GUY SUR VEN".split(), None, "NA"),
    "AFRF": ("法属非洲",     "French Africa",               "MRT SEN MLI GIN CIV BFA NER BEN TGO COG GAB CAF TCD MDG".split(), "FRA", "NATO"),
    "FNA":  ("法属北非",     "French North Africa",         "DZA MAR TUN ESH".split(), "FRA", "NATO"),
    "GBWA": ("英属西非",     "British West Africa",         "NGA GHA SLE LBR".split(), "GBR", "NATO"),
    "BEA":  ("英属东非",     "British East Africa",         "KEN UGA TZA BDI RWA".split(), "GBR", "NATO"),
    "BSA":  ("英属南非",     "British Southern Africa",     "ZMB ZWE MWI BWA".split(), "GBR", "NATO"),
    "SAF":  ("南部非洲联盟", "Southern African Union",      "ZAF NAM LSO MOZ AGO".split(), None, "W"),
    "HORN": ("东非之角",     "Horn of Africa",              "ETH SOM SDN".split(), None, "SOV"),
    "CONG": ("刚果联邦",     "Congo Federation",            "COD CMR".split(), None, "NA"),
    "ARA":  ("阿拉伯半岛联邦","Arabian Peninsula Federation","ARE KWT OMN".split(), None, "W"),
    "SAS":  ("喜马拉雅联邦", "Himalayan Federation",        "NPL BTN".split(), None, "NA"),
    "SEA":  ("东南亚联邦",   "Southeast Asian Federation",  "MMR LAO KHM VNM THA MYS".split(), None, "NA"),
    "INS":  ("南洋联邦",     "Nanyang Federation",          "IDN PHL".split(), None, "NA"),
    "OCE":  ("大洋洲联邦",   "Oceania Federation",          "PNG NZL".split(), None, "W"),
    "AND":  ("安第斯联邦",   "Andean Federation",           "COL ECU PER BOL CHL".split(), None, "NA"),
    "LAP":  ("拉普拉塔联邦", "La Plata Federation",         "ARG PRY URY".split(), None, "W"),
    "IBE":  ("伊比利亚联邦", "Iberian Federation",          "ESP PRT".split(), None, "NATO"),
    "SCA":  ("斯堪的纳维亚", "Scandinavia",                 "SWE NOR DNK FIN ISL".split(), None, "NE"),
    "LOW":  ("低地联邦",     "Low Countries",               "NLD BEL".split(), None, "NATO"),
    "ALP":  ("阿尔卑斯联邦", "Alpine Federation",           "CHE AUT".split(), None, "NE"),
    "LEV":  ("黎凡特联邦",   "Levant Federation",           "SYR LBN JOR ISR PSE".split(), None, "NA"),
    "BALK": ("巴尔干联邦",   "Balkan Federation",           "YUG ALB GRC".split(), None, "WP"),
}
# 低存在感独立国并入另一独立国（不新增实体）
INTO_INDEPENDENT = {"MNG": "SUN", "YPR": "YAR", "LKA": "IND", "BGD": "PAK", "IRL": "GBR"}

# member -> grp / 并入国；grp -> [members] / parent
GROUP_OF = {}          # member key -> grp key
GROUP_PARENT = {}      # grp key -> parent key or None
GROUP_MEMBERS = {}     # grp key -> [member keys]
PARENT_OF_MEMBER = {}  # member key -> 可玩实体 key（grp 或并入的独立国）
for _g, (_zh, _en, _mem, _par, _bl) in GROUPS.items():
    GROUP_MEMBERS[_g] = list(_mem)
    GROUP_PARENT[_g] = _par
    for _m in _mem:
        GROUP_OF[_m] = _g
        PARENT_OF_MEMBER[_m] = _g
for _m, _t in INTO_INDEPENDENT.items():
    PARENT_OF_MEMBER[_m] = _t


def playable_key(key):
    """table key -> 可玩实体 key（被吸收则返回所属集团/并入国，否则返回自身）。"""
    return PARENT_OF_MEMBER.get(key, key)


def playable_keys(table):
    """返回 (可玩实体 key 列表, 集团 key 列表)。实体数 ~54。"""
    ind = sorted(k for k in table if k not in PARENT_OF_MEMBER)
    return ind + sorted(GROUPS.keys()), sorted(GROUPS.keys())


# =====================================================================
# M4 仿真参数（1980-1991 史实校准，见 docs/SIM.md 与 work/_sim_proto.py）。
# 唯一事实源；s6_export 导出 out/data/sim.js 供 JS 引擎使用。
SIM_SEED = 19800101
# >>> REFIT:POP:BEGIN
    # 生成：work/refit_params.js（R4 后半·二阶段 参数重拟合）。参照 SP.POP.TOTL / NY.GDP.MKTP.KD，API lastupdated 2026-07-13，refHash 2c870470。勿手改。
SIM_POP_R = {
    "AFG": 1.210, "AGO": 3.553, "ALB": 1.828, "ARE": 5.000, "ARG": 1.553, "AUS": 1.477,
    "AUT": 0.245, "BDI": 2.393, "BEL": 0.133, "BEN": 2.979, "BFA": 2.743, "BGD": 2.335,
    "BGR": -0.239, "BOL": 2.131, "BRA": 2.041, "BTN": 2.965, "BWA": 3.266, "CAF": 1.725,
    "CAN": 1.220, "CHE": 0.667, "CHL": 1.559, "CHN": 1.449, "CIV": 3.942, "CMR": 2.866,
    "COD": 3.187, "COG": 2.654, "COL": 2.158, "CRI": 2.655, "CUB": 0.809, "DEU": 0.198,
    "DNK": 0.055, "DOM": 2.203, "DZA": 3.037, "ECU": 2.459, "EGY": 2.834, "ESP": 0.351,
    "ETH": 3.340, "FIN": 0.434, "FRA": 0.524, "GAB": 2.739, "GBR": 0.178, "GHA": 2.538,
    "GIN": 2.572, "GRC": 0.617, "GTM": 2.687, "GUY": -0.311, "HND": 2.894, "HTI": 1.999,
    "HUN": -0.291, "IDN": 2.057, "IND": 2.287, "IRL": 0.317, "IRN": 3.720, "IRQ": 2.435,
    "ISL": 1.124, "ISR": 2.217, "ITA": 0.052, "JAM": 1.021, "JOR": 5.000, "JPN": 0.541,
    "KEN": 3.541, "KHM": 3.553, "KOR": 1.157, "KWT": 4.399, "LAO": 2.707, "LBN": 1.998,
    "LBR": 0.131, "LBY": 2.573, "LKA": 0.945, "LSO": 2.449, "MAR": 2.204, "MDG": 2.923,
    "MEX": 2.062, "MLI": 1.979, "MMR": 1.776, "MNG": 2.193, "MOZ": 1.488, "MRT": 2.820,
    "MWI": 4.107, "MYS": 3.141, "NAM": 3.337, "NER": 3.013, "NGA": 2.741, "NIC": 2.455,
    "NLD": 0.573, "NOR": 0.383, "NPL": 2.303, "NZL": 1.052, "OMN": 5.000, "PAK": 3.434,
    "PAN": 2.251, "PER": 2.351, "PHL": 2.661, "PNG": 2.274, "POL": 0.658, "PRK": 1.466,
    "PRT": 0.179, "PRY": 2.778, "ROU": 0.319, "RWA": 3.099, "SAU": 5.000, "SDN": 2.505,
    "SEN": 2.787, "SLE": 2.369, "SLV": 1.736, "SOM": 1.254, "SUN": 0.880, "SUR": 0.921,
    "SWE": 0.329, "SYR": 3.372, "TCD": 2.892, "TGO": 2.860, "THA": 1.799, "TTO": 1.069,
    "TUN": 2.294, "TUR": 2.068, "TWN": 1.200, "TZA": 3.030, "UGA": 2.846, "URY": 0.509,
    "USA": 0.976, "VEN": 2.598, "VNM": 2.204, "ZAF": 3.138, "ZMB": 2.898, "ZWE": 3.550,
}
# >>> REFIT:POP:END
SIM_AFRICA = set("AGO BDI BEN BFA BWA CAF CIV CMR COD COG ESH GAB GHA GIN KEN LBR LSO MDG MLI MOZ MRT MWI NAM NER RWA SDN SEN SLE SOM TCD TGO TUN TZA UGA ZMB ZWE".split())
SIM_MIDEAST = set("ARE KWT OMN SAU YAR JOR LBN SYR IRQ ISR PSE".split())
SIM_LATIN = set("ARG BOL BRA CHL COL ECU GTM HND JAM MEX NIC PAN PER PRY SLV SUR TTO URY VEN".split())
SIM_ASIA_DEV = set("BGD BTN KHM LAO LKA MMR MYS NPL PHL THA VNM IDN PNG".split())
SIM_COMM = set("BGR CSK DDR HUN POL ROU PRK MNG CUB".split())
SIM_DEV = set("AUT BEL CHE DNK FIN IRL ISL NLD NOR SWE GRC".split())
# >>> REFIT:GDP:BEGIN
# 生成：work/refit_params.js（R4C）+ work/oil_refit.js（机制批次①：油键/进口国 27 键随双端机制重拟合）。SUN/卫星国/CHN 由引擎特例分支接管，**不在本表**。勿手改。
SIM_GDP_R = {
    "AGO": 1.974, "ALB": -1.607, "ARE": 1.639, "ARG": 0.298, "AUS": 3.216, "AUT": 2.556,
    "BDI": 4.635, "BEL": 2.202, "BEN": 3.497, "BFA": 4.162, "BGD": 4.114, "BOL": 0.802,
    "BRA": 1.741, "BTN": 8.710, "BWA": 10.270, "CAF": 1.108, "CAN": 2.394, "CHE": 2.096,
    "CHL": 3.533, "CHN": 0.000, "CIV": 0.878, "CMR": 2.849, "COD": 0.226, "COG": 4.720,
    "COL": 3.456, "CRI": 2.597, "DEU": 2.773, "DNK": 2.333, "DOM": 2.443, "DZA": 4.459,
    "ECU": 2.943, "EGY": 5.826, "ESP": 3.085, "ETH": 1.685, "FIN": 2.494, "FRA": 2.583,
    "GAB": 1.753, "GBR": 2.546, "GHA": 2.633, "GIN": 3.238, "GRC": 1.127, "GTM": 1.345,
    "GUY": -2.366, "HND": 8.283, "HTI": -0.306, "IDN": 5.694, "IND": 5.238, "IRL": 3.636,
    "IRN": 6.451, "IRQ": -5.429, "ISL": 2.665, "ISR": 4.264, "ITA": 2.523, "JAM": 3.054,
    "JOR": 2.130, "JPN": 4.563, "KEN": 3.981, "KHM": 5.700, "KOR": 9.947, "KWT": -3.147,
    "LAO": 4.459, "LBR": -8.000, "LBY": -3.640, "LKA": 4.368, "LSO": 4.480, "MAR": 5.059,
    "MDG": 0.098, "MEX": 2.362, "MLI": 1.990, "MMR": 1.327, "MOZ": 0.800, "MRT": 1.878,
    "MWI": 2.968, "MYS": 6.335, "NAM": 2.012, "NER": -7.997, "NGA": -2.728, "NIC": -1.032,
    "NLD": 2.451, "NOR": 2.794, "NPL": 4.992, "NZL": 1.838, "OMN": 12.000, "PAK": 6.216,
    "PAN": 2.280, "PER": -0.491, "PHL": 1.798, "PNG": 2.194, "PRT": 3.525, "PRY": 4.187,
    "RWA": 1.824, "SAU": -5.978, "SDN": 3.117, "SEN": 2.801, "SLE": 1.241, "SLV": 0.478,
    "SOM": 2.824, "SUR": 0.476, "SWE": 2.096, "SYR": 1.783, "TCD": 5.596, "TGO": 1.116,
    "THA": 7.844, "TTO": -3.223, "TUN": 3.759, "TUR": 4.932, "TWN": 8.000, "TZA": 3.287,
    "UGA": 3.660, "URY": 0.520, "USA": 3.182, "VEN": 1.102, "VNM": 4.841, "ZAF": 1.497,
    "ZMB": 1.165, "ZWE": 4.634,
}
# >>> REFIT:GDP:END
SIM_OIL_EXPORTERS = set("SAU IRQ IRN VEN MEX NGA DZA LBY ARE KWT OMN GAB NER SYR TTO".split())
SIM_OIL_IMPORTERS = set("JPN DEU ITA FRA GBR ESP IND PAK BRA TUR KOR TWN ISR".split())

# ---- 机制批次①（tasks/009）：油价双端通道 ----
# 油价序列（$/bbl，BP 统计年鉴年均量级；口径 ±10%，见 docs/data-refs.md —— 判定用同比/水平比率，
# 水平误差被消掉）。1979 = 通道基准年（伊朗革命后高位）。
SIM_OIL_PX = {1979: 31.6, 1980: 36.8, 1981: 35.7, 1982: 32.5, 1983: 29.6,
              1984: 28.7, 1985: 27.6, 1986: 14.4, 1987: 18.4, 1988: 14.9,
              1989: 18.2, 1990: 23.7, 1991: 20.0}

# >>> OILFIT:ELAST:BEGIN
    # 生成：work/oil_refit.js（机制批次① 油价双端拟合）。参照 NY.GDP.MKTP.KD，API lastupdated 2026-07-13，refHash 2c870470。每键 [同比弹性, 水平弹性]，至多一条非零。勿手改。
SIM_OIL_ELAST = {
    "ARE": (0.284, 0.000), "DZA": (0.000, 0.058), "GAB": (-0.238, 0.000), "IRN": (0.000, 0.098),
    "IRQ": (0.000, -0.178), "KWT": (0.000, -0.120), "LBY": (0.000, -0.082), "MEX": (0.064, 0.000),
    "NER": (0.000, -0.256), "NGA": (0.000, -0.080), "OMN": (0.000, 0.160), "SAU": (0.000, -0.148),
    "SYR": (-0.092, 0.000), "TTO": (0.000, -0.048), "VEN": (-0.160, 0.000),
}
# >>> OILFIT:ELAST:END


def sim_oil_channels():
    """预计算两条油价通道（1980..1991）：oilChg=同比% · oilLvl=水平% = log(P/P1979)*100。"""
    import math
    yrs = range(1980, 1992)
    chg = [round((SIM_OIL_PX[y] / SIM_OIL_PX[y - 1] - 1) * 100, 4) for y in yrs]
    lvl = [round(math.log(SIM_OIL_PX[y] / SIM_OIL_PX[1979]) * 100, 4) for y in yrs]
    return chg, lvl


def sim_pop_rate(key):
    if key in SIM_POP_R:
        return SIM_POP_R[key]
    for s, r in ((SIM_AFRICA, 2.7), (SIM_MIDEAST, 3.0), (SIM_LATIN, 2.0),
                 (SIM_ASIA_DEV, 2.1), (SIM_COMM, 0.6), (SIM_DEV, 0.5)):
        if key in s:
            return r
    return 1.8


def sim_gdp_base(key):
    if key == "CHN":
        return 0      # 引擎内特殊曲线（改革 + 治理整顿）
    if key in SIM_GDP_R:
        return SIM_GDP_R[key]
    if key in SIM_DEV:
        return 2.5
    if key in SIM_LATIN or key in SIM_ASIA_DEV:
        return 3.0
    if key in SIM_AFRICA:
        return 2.0
    return 3.0


def sim_params(table):
    """全部 133 成员的仿真参数（s6 导出 sim.js 用）。"""
    oil_chg, oil_lvl = sim_oil_channels()
    return {
        "seed": SIM_SEED,
        "popStart": {k: table[k]["pop_m"] for k in table},       # 1980-01 起点人口（百万）
        "popRate": {k: sim_pop_rate(k) for k in table},
        "gdpBase": {k: sim_gdp_base(k) for k in table},
        # 1980 名义基准（**未合并**的成员原值；实体聚合时用 Σ 基准×指数，避免用 S5 已合并值重复计数）
        "gdp1980": {k: table[k]["gdp_bn"] for k in table},
        "ind1980": {k: table[k]["industry_bn"] for k in table},
        # 机制批次①：油价双端通道（1980..1991）+ 逐键弹性 [同比, 水平]（仅油键；进口国无条目=零响应，
        # 参照实测支持移除旧 -0.25 镜像，见 work/oil_probe.js 与 tasks/009）
        "oilChg": oil_chg,
        "oilLvl": oil_lvl,
        "oilElast": {k: list(SIM_OIL_ELAST[k]) for k in sorted(SIM_OIL_ELAST) if k in table},
        "sunSats": sorted(SIM_COMM & set(table)),
    }


UNCLASSIFIED_ALLOWED = set()


def classifier(table):
    """NE ADM0_A3 -> ('polity', key) | ('ignore', None) | ('unknown', None)."""
    def cls(a3):
        a3 = ALIAS.get(a3, a3)
        if a3 in ("DEU", "YEM"):
            return ("split", a3)
        if a3 in MEMBER_MAP:
            return ("polity", MEMBER_MAP[a3])
        if a3 in table:
            return ("polity", a3)
        if a3 in IGNORE:
            return ("ignore", None)
        return ("unknown", None)
    return cls


# ----------------------------------------------------------- shapefile I/O
def read_shapefile(path, encoding="utf-8"):
    import shapefile
    r = shapefile.Reader(path, encoding=encoding, encodingErrors="replace")
    fields = [f[0] for f in r.fields[1:]]
    return r, fields


def read_records(path, names, encoding="utf-8"):
    """Return list of (dict_of_requested_fields, geo_interface_shape)."""
    import shapefile
    r = shapefile.Reader(path, encoding=encoding, encodingErrors="replace")
    fields = [f[0] for f in r.fields[1:]]
    want = {n: fields.index(n) for n in names if n in fields}
    out = []
    for sr in r.iterShapeRecords():
        rec = sr.record
        d = {n: rec[i] for n, i in want.items()}
        if len(want) < len(names):
            for n in names:
                d.setdefault(n, None)
        out.append((d, sr.shape.__geo_interface__))
    return out, fields


def geom_of(d):
    return safe(shp_shape(d))
