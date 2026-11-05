"""List the hoodie's cloth panels (connected mesh islands) with bounds and arm-weight share.

Usage: blender --background <character.blend> --python tools/blender/analyze_hoodie_islands.py
"""
import bmesh
import bpy

ob = bpy.data.objects["Char_Hoodie"]
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.verts.ensure_lookup_table()
seen = set()
islands = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, comp = [v], []
    seen.add(v.index)
    while stack:
        cur = stack.pop()
        comp.append(cur.index)
        for e in cur.link_edges:
            o = e.other_vert(cur)
            if o.index not in seen:
                seen.add(o.index)
                stack.append(o)
    islands.append(comp)
arm_groups = {vg.index for vg in ob.vertex_groups if any(k in vg.name for k in ("Arm", "ForeArm", "Hand"))}
me = ob.data
for i, comp in enumerate(sorted(islands, key=len, reverse=True)):
    cos = [me.vertices[j].co for j in comp]
    armw = sum(sum(g.weight for g in me.vertices[j].groups if g.group in arm_groups) for j in comp) / len(comp)
    xs, ys, zs = [c.x for c in cos], [c.y for c in cos], [c.z for c in cos]
    print(f"ISLAND {i:2} verts={len(comp):6} x=[{min(xs):.3f},{max(xs):.3f}] y=[{min(ys):.3f},{max(ys):.3f}] z=[{min(zs):.3f},{max(zs):.3f}] armW={armw:.2f}")
