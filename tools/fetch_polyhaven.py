"""Download the approved CC0 Poly Haven assets (ASSET_INVENTORY.md), verifying each file's MD5
against the Poly Haven API, and write a licence manifest.

Only https://dl.polyhaven.org URLs returned by https://api.polyhaven.com are fetched.
Usage: python -I tools/fetch_polyhaven.py <outDir>
"""
import datetime
import hashlib
import json
import os
import sys
import urllib.request

OUT = sys.argv[1]
API = "https://api.polyhaven.com"
ALLOWED_HOST = "https://dl.polyhaven.org/"

HDRIS = {"modern_buildings_night": "4k"}
MODELS = {"potted_plant_01": "1k", "potted_plant_02": "1k", "potted_plant_04": "1k", "desk_lamp_arm_01": "1k"}
TEXTURES = {"hangar_concrete_floor": "2k", "dark_wood": "2k", "plaster_grey_04": "2k", "metal_plate_02": "2k", "fabric_pattern_07": "2k"}
TEXTURE_MAPS = ("Diffuse", "nor_gl", "Rough")


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "developers-room-asset-fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def download(url, md5, dest):
    if not url.startswith(ALLOWED_HOST):
        raise SystemExit(f"refusing non-Poly-Haven URL: {url}")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and hashlib.md5(open(dest, "rb").read()).hexdigest() == md5:
        return os.path.getsize(dest), "cached"
    req = urllib.request.Request(url, headers={"User-Agent": "developers-room-asset-fetch"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    digest = hashlib.md5(data).hexdigest()
    if digest != md5:
        raise SystemExit(f"MD5 mismatch for {url}: {digest} != {md5}")
    open(dest, "wb").write(data)
    return len(data), "ok"


manifest = {"source": "https://polyhaven.com", "license": "CC0 1.0", "downloaded": datetime.date.today().isoformat(), "assets": []}
total = 0
jobs = []
for name, res in HDRIS.items():
    f = get_json(f"{API}/files/{name}")["hdri"][res]
    entry = f.get("hdr") or f.get("exr")
    jobs.append((name, "hdri", entry, os.path.join(OUT, "hdri", os.path.basename(entry["url"]))))
for name, res in MODELS.items():
    g = get_json(f"{API}/files/{name}")["gltf"][res]["gltf"]
    jobs.append((name, "model", g, os.path.join(OUT, "models", name, os.path.basename(g["url"]))))
    for rel, inc in g.get("include", {}).items():
        jobs.append((name, "model", inc, os.path.join(OUT, "models", name, *rel.split("/"))))
for name, res in TEXTURES.items():
    d = get_json(f"{API}/files/{name}")
    for m in TEXTURE_MAPS:
        if m in d and res in d[m]:
            f = d[m][res].get("jpg") or d[m][res].get("png")
            jobs.append((name, "texture", f, os.path.join(OUT, "textures", name, os.path.basename(f["url"]))))

for name, kind, f, dest in jobs:
    size, status = download(f["url"], f["md5"], dest)
    total += size
    manifest["assets"].append({"name": name, "type": kind, "file": os.path.relpath(dest, OUT).replace("\\", "/"),
                               "url": f["url"], "md5": f["md5"], "bytes": size, "page": f"https://polyhaven.com/a/{name}"})
    print(f"{status:6} {size / 1e6:6.2f} MB  {os.path.relpath(dest, OUT)}")
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print(f"TOTAL {total / 1e6:.1f} MB in {len(jobs)} files, all MD5-verified")
