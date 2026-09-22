# -*- coding: utf-8 -*-
"""S2: build work/land.npy  (land | minor_islands) - lakes, Equal Earth, 4096x1994."""
import os, sys, json
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

LAND = os.path.join(C.WORK, "land.npy")


def shapes_of(path, encoding="utf-8"):
    import shapefile
    r = shapefile.Reader(path, encoding=encoding, encodingErrors="replace")
    return [C.safe(C.shp_shape(s.__geo_interface__)) for s in r.iterShapes()]


def main():
    if os.path.exists(LAND):
        a = np.load(LAND)
        print("S2 cached: land=%d px (%d x %d)" % (int(a.sum()), a.shape[1], a.shape[0]))
        return

    img = Image.new("L", (C.BASE_W, C.BASE_H), 0)
    for name in ("ne_10m_land", "ne_10m_minor_islands"):
        gs = shapes_of(os.path.join(C.CACHE, name + ".shp"))
        C.paint_mask(gs, 255, img)
        print("  + %s : %d shapes" % (name, len(gs)))
    land = np.array(img) > 0

    lake_gs = shapes_of(os.path.join(C.CACHE, "ne_10m_lakes.shp"))
    limg = Image.new("L", (C.BASE_W, C.BASE_H), 0)
    C.paint_mask(lake_gs, 255, limg)
    lakes = np.array(limg) > 0
    land &= ~lakes

    np.save(LAND, land)
    print("S2 land=%d px  lakes=%d px   (km2/px=%.3f, land=%.2f Mkm2)"
          % (int(land.sum()), int(lakes.sum()), C.KM2_PER_PX, land.sum() * C.KM2_PER_PX / 1e6))
    assert land.sum() > 0


main()
