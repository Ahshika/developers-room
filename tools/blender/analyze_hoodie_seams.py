"""Measure seam gaps between the hoodie's separate CLO3D panels, to choose a safe weld distance.

Usage: blender --background --factory-startup --python tools/blender/analyze_hoodie_seams.py -- <hoodie.gltf>
"""
import statistics
import sys

import bmesh
import bpy
from mathutils import Matrix
from mathutils.kdtree import KDTree

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
bpy.context.view_layer.update()
bm = bmesh.new()
for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    me = o.data.copy()
    me.transform(o.matrix_world)
    bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()

island = [-1] * len(bm.verts)
n = 0
for v in bm.verts:
    if island[v.index] >= 0:
        continue
    stack = [v]
    island[v.index] = n
    while stack:
        cur = stack.pop()
        for e in cur.link_edges:
            o = e.other_vert(cur)
            if island[o.index] < 0:
                island[o.index] = n
                stack.append(o)
    n += 1

boundary = [v for v in bm.verts if v.is_boundary]
edge_len = [e.calc_length() for e in bm.edges if e.is_boundary]
kd = KDTree(len(boundary))
for i, v in enumerate(boundary):
    kd.insert(v.co, i)
kd.balance()
gaps = []
for v in boundary:
    for co, i, d in kd.find_n(v.co, 12):
        if island[boundary[i].index] != island[v.index]:
            gaps.append(d)
            break
gaps.sort()
q = lambda p: gaps[int(p * (len(gaps) - 1))]
print("ISLANDS", n, "BOUNDARY_VERTS", len(boundary), "with_other_panel_within_12nn", len(gaps))
print("BOUNDARY_EDGE_LEN median %.4f min %.4f" % (statistics.median(edge_len), min(edge_len)))
print("SEAM_GAP p10 %.4f p50 %.4f p75 %.4f p90 %.4f" % (q(0.1), q(0.5), q(0.75), q(0.9)))
for t in (0.0005, 0.001, 0.002, 0.003, 0.004):
    print("WITHIN %.4f m: %d of %d boundary verts" % (t, sum(1 for g in gaps if g <= t), len(boundary)))
