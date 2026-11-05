"""Dress the Mixamo character (Ch44) in the CC-BY hoodie (Ahmad Riazi), drive it with Mixamo
animations, and save a reusable .blend (ASSET_INVENTORY C01/C02, Phase 3).

Pipeline:
  1. import body + armature A (Mixamo T-pose rest) and the Typing action
  2. import the hoodie, join its parts, scale/place it on the body (it was made arms-down)
  3. pose A's arms down to match the sleeves, then copy A -> armature B with that pose as rest
  4. transfer skin weights body(posed) -> hoodie, keep only upper-body bones, bind hoodie to B
  5. B follows A in world space (Copy Transforms), so every Mixamo action on A drives the hoodie
  6. mask the body parts hidden under the hoodie (no poke-through), recolour the hoodie black

Usage:
  blender --background --factory-startup --python tools/blender/build_character.py -- \
      <character.fbx> <hoodie.gltf> <typing.fbx> <out.blend>
"""
import math
import sys

import bpy
from mathutils import Matrix, Vector

char_path, hoodie_path, typing_path, out_blend = sys.argv[sys.argv.index("--") + 1:][:4]

# hoodie fit (from tools/blender/measure_fit.py on 2026-11-03): body 1.90 m, armour chest 0.50 x 0.34 m
FIT = {"scale": (1.14, 1.25, 1.10), "hem_z": 0.98}
UPPER_BODY = ("Hips", "Spine", "Neck", "Head", "Shoulder", "Arm", "ForeArm", "Hand")
HIDDEN_UNDER_HOODIE = ("Spine", "Spine1", "Spine2", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm")
HOODIE_LINEAR = (0.010, 0.010, 0.011)  # sRGB ≈ 26/255, the colour of the "Black Hoodie" reference


def ctx_for(obj):
    """Context override so object/pose operators work in background mode."""
    return bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj], selected_editable_objects=[obj])


def world_pts(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- 1. body, armature A, typing action ----------
bpy.ops.import_scene.fbx(filepath=char_path)
arm_a = next(o for o in scene.objects if o.type == "ARMATURE")
body = next(o for o in scene.objects if o.type == "MESH")
arm_a.name, body.name = "RIG_Mixamo", "Char_Body"

before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=typing_path)
typing = next(a for a in bpy.data.actions if a.users and a not in ())
for o in [o for o in bpy.data.objects if o not in before]:
    if o.animation_data and o.animation_data.action:
        typing = o.animation_data.action
    bpy.data.objects.remove(o)
typing.name = "ACT_Typing"
typing.use_fake_user = True

# ---------- 2. hoodie ----------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=hoodie_path)
new = [o for o in bpy.data.objects if o not in before]
parts = [o for o in new if o.type == "MESH"]
bpy.context.view_layer.update()
for o in parts:  # bake parent transforms into each mesh, then join
    o.data.transform(o.matrix_world)
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
for o in [o for o in new if o.type != "MESH"]:
    bpy.data.objects.remove(o)
hoodie = parts[0]
with bpy.context.temp_override(active_object=hoodie, selected_editable_objects=parts):
    bpy.ops.object.join()
hoodie.name = "Char_Hoodie"

hp = world_pts(hoodie)
zmin = min(p.z for p in hp)
sx, sy, sz = FIT["scale"]
mid_band = [p for p in hp if abs(p.z - (zmin + 0.5 * (max(q.z for q in hp) - zmin))) < 0.02]
hy = (min(p.y for p in mid_band) + max(p.y for p in mid_band)) / 2
spine2_z = (arm_a.matrix_world @ arm_a.data.bones["mixamorig:Spine2"].head_local).z
chest = [p for p in world_pts(body) if abs(p.z - spine2_z) < 0.03 and abs(p.x) < 0.25]
by = (min(p.y for p in chest) + max(p.y for p in chest)) / 2
hoodie.data.transform(Matrix.Translation((0, -hy, -zmin)))
hoodie.data.transform(Matrix.Diagonal((sx, sy, sz, 1)))
hoodie.data.transform(Matrix.Translation((0, by, FIT["hem_z"])))
cuffs = {s: sorted([p for p in world_pts(hoodie) if (p.x > 0.12 if s > 0 else p.x < -0.12)], key=lambda p: p.z)[:60] for s in (1, -1)}
cuff_centre = {s: sum(v, Vector()) / len(v) for s, v in cuffs.items()}
print("FIT hoodie hem", FIT["hem_z"], "cuffs", {s: tuple(round(c, 3) for c in v) for s, v in cuff_centre.items()})

# ---------- 3. pose A's arms down to the sleeves; B = A with that pose as rest ----------
bpy.context.view_layer.update()
for side, s in (("Left", 1), ("Right", -1)):
    pb = arm_a.pose.bones[f"mixamorig:{side}Arm"]
    shoulder = arm_a.matrix_world @ pb.head
    wrist = arm_a.matrix_world @ arm_a.pose.bones[f"mixamorig:{side}Hand"].head
    target = cuff_centre[s] + Vector((0, 0, 0.06))  # wrist sits just above the cuff hem
    rot = (wrist - shoulder).rotation_difference(target - shoulder)
    # apply the world-space rotation to the bone in pose space
    mw = arm_a.matrix_world @ pb.matrix
    loc = mw.to_translation()
    new_mw = Matrix.Translation(loc) @ rot.to_matrix().to_4x4() @ Matrix.Translation(-loc) @ mw
    pb.matrix = arm_a.matrix_world.inverted() @ new_mw
    bpy.context.view_layer.update()
    w2 = arm_a.matrix_world @ arm_a.pose.bones[f"mixamorig:{side}Hand"].head
    print(f"FIT {side} wrist -> {tuple(round(c, 3) for c in w2)} target {tuple(round(c, 3) for c in target)}")

arm_b = arm_a.copy()
arm_b.data = arm_a.data.copy()
arm_b.name = "RIG_Cloth"
arm_b.animation_data_clear()
scene.collection.objects.link(arm_b)
for pb in arm_a.pose.bones:
    arm_b.pose.bones[pb.name].matrix_basis = pb.matrix_basis.copy()
bpy.context.view_layer.update()
bpy.context.view_layer.objects.active = arm_b
with ctx_for(arm_b):
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

# body copy deformed into the arms-down pose, used only as the weight source
proxy = body.copy()
proxy.data = body.data.copy()
proxy.name = "TMP_BodyPosed"
scene.collection.objects.link(proxy)
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
posed = bpy.data.meshes.new_from_object(proxy.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
proxy.modifiers.clear()
proxy.data = posed

# Ch44's helmet is larger than an average head: widen the hood around it before skinning
head_rest = arm_a.matrix_world @ arm_a.data.bones["mixamorig:Head"].head_local
HOOD = {"z0": 1.55, "z1": 1.68, "grow": 0.22}
for v in hoodie.data.vertices:
    if v.co.z <= HOOD["z0"]:
        continue
    t = min(1.0, (v.co.z - HOOD["z0"]) / (HOOD["z1"] - HOOD["z0"]))
    t = t * t * (3 - 2 * t)
    f = 1 + HOOD["grow"] * t
    v.co.x = v.co.x * f
    v.co.y = head_rest.y + (v.co.y - head_rest.y) * f
    v.co.z += 0.04 * t

# ---------- 3b. make the cloth one garment: sleeve tags, single layer, stitched seams ----------
# CLO3D exports every panel separately (seam gap median 0.1 mm, tools/blender/analyze_hoodie_seams.py)
# and some panels twice (inner + outer layer). Unstitched seams tore open at the shoulder and the
# doubled layers crossed into strips under the arm (side view, 2026-11-03).
import bmesh  # noqa: E402  (Blender module)
from mathutils.bvhtree import BVHTree  # noqa: E402

WELD = {"dist": 0.002}
SLEEVE = {"min_abs_x": 0.12, "max_z": 1.56}


def islands_of(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v in seen:
            continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o not in seen:
                    seen.add(o)
                    stack.append(o)
        out.append(comp)
    return out


body_world = [proxy.matrix_world @ v.co for v in proxy.data.vertices]
body_bvh = BVHTree.FromPolygons(body_world, [tuple(p.vertices) for p in proxy.data.polygons])
bm = bmesh.new()
bm.from_mesh(hoodie.data)
sleeve_layer = bm.verts.layers.int.new("sleeve")
panels = islands_of(bm)
for comp in panels:
    if min(abs(v.co.x) for v in comp) >= SLEEVE["min_abs_x"] and max(v.co.z for v in comp) <= SLEEVE["max_z"]:
        for v in comp:
            v[sleeve_layer] = 1
# duplicated layers: same vertex count and bounds within 3 mm → drop the one nearer the body
def signature(comp):
    xs, ys, zs = [v.co.x for v in comp], [v.co.y for v in comp], [v.co.z for v in comp]
    return len(comp), (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))


def mean_body_distance(comp):
    step = max(1, len(comp) // 200)
    return sum(body_bvh.find_nearest(v.co)[3] for v in comp[::step]) / len(comp[::step])


inner, used = [], set()
for i, a in enumerate(panels):
    if i in used:
        continue
    na, ba = signature(a)
    for j in range(i + 1, len(panels)):
        if j in used:
            continue
        nb, bb = signature(panels[j])
        if na == nb and all(abs(p - q) < 0.003 for p, q in zip(ba, bb)):
            used.update((i, j))
            inner.append(a if mean_body_distance(a) < mean_body_distance(panels[j]) else panels[j])
            break
bmesh.ops.delete(bm, geom=[v for comp in inner for v in comp], context="VERTS")
boundary = [v for v in bm.verts if v.is_boundary]
before_weld = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=boundary, dist=WELD["dist"])
# stitched panels can have opposite winding and zero-area slivers at the seams: both made the
# thickness (Solidify) explode into spikes. Clean them, then point every face outward.
bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges[:])
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
after_weld = len(bm.verts)
bm.to_mesh(hoodie.data)
bm.free()
hoodie.data.update()
print("CLOTH", {"panels": len(panels), "inner_layers_removed": len(inner), "welded_verts": before_weld - after_weld,
                "faces": len(hoodie.data.polygons), "open_boundary_verts_before_weld": len(boundary)})

# ---------- 4. weights body -> hoodie, bind to B ----------
for vg in proxy.vertex_groups:
    hoodie.vertex_groups.new(name=vg.name)
dt = hoodie.modifiers.new("WeightsFromBody", "DATA_TRANSFER")
dt.object = proxy
dt.use_object_transform = True
dt.use_vert_data = True
dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "POLYINTERP_NEAREST"
dt.layers_vgroup_select_src = "ALL"
dt.layers_vgroup_select_dst = "NAME"
bpy.context.view_layer.objects.active = hoodie
with ctx_for(hoodie):
    bpy.ops.object.modifier_apply(modifier=dt.name)
# cloth follows the upper body only (legs would tear the hem when seated)
for vg in list(hoodie.vertex_groups):
    if not any(k in vg.name for k in UPPER_BODY) or "UpLeg" in vg.name:
        hoodie.vertex_groups.remove(vg)
with ctx_for(hoodie):
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
# the hood must follow the head (nearest-surface weights tie it to neck/spine, so the head would
# slide out of it when leaning forward): Neck → Head blend over the hood's height
neck_g, head_g = hoodie.vertex_groups["mixamorig:Neck"], hoodie.vertex_groups["mixamorig:Head"]
HOOD_W = {"z0": 1.50, "z1": 1.62, "max_abs_x": 0.24}
for v in hoodie.data.vertices:
    if v.co.z <= HOOD_W["z0"] or abs(v.co.x) > HOOD_W["max_abs_x"]:
        continue
    t = min(1.0, (v.co.z - HOOD_W["z0"]) / (HOOD_W["z1"] - HOOD_W["z0"]))
    for g in list(v.groups):
        hoodie.vertex_groups[g.group].remove([v.index])
    head_g.add([v.index], t, "REPLACE")
    if t < 1:
        neck_g.add([v.index], 1 - t, "REPLACE")
# Only the sleeves may follow the arms. Nearest-surface transfer gave the torso and the front hem
# arm weights (the hands hang beside the hips in the fitting pose), which stretched a "cape" of
# cloth between torso and hands while typing. Sleeve membership was tagged per panel in step 3b,
# before the seams were stitched.
sleeve_attr = hoodie.data.attributes["sleeve"].data
arm_like = [vg for vg in hoodie.vertex_groups if any(k in vg.name for k in ("Arm", "Hand"))]
torso_fallback = [hoodie.vertex_groups[n] for n in ("mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2")]
spine_z = [(arm_a.matrix_world @ arm_a.data.bones[f"mixamorig:{n}"].head_local).z for n in ("Spine", "Spine1", "Spine2")]
fixed = 0
sleeve_count = 0
for vi in range(len(hoodie.data.vertices)):
    if sleeve_attr[vi].value:
        sleeve_count += 1
        continue
    v = hoodie.data.vertices[vi]
    had_arm = False
    for vg in arm_like:
        try:
            if vg.weight(vi) > 0:
                had_arm = True
                vg.remove([vi])
        except RuntimeError:
            pass
    if had_arm:
        fixed += 1
        if not v.groups:  # nothing left: nearest spine segment by height
            k = min(range(3), key=lambda i: abs(spine_z[i] - v.co.z))
            torso_fallback[k].add([vi], 1.0, "REPLACE")
# now that the seams are stitched, blend weights across them (sleeve ↔ shoulder over a few cm).
# Laplacian smoothing on the mesh graph (the weight-smooth operator has no background-mode context).
import numpy as np  # noqa: E402  (bundled with Blender)

SMOOTH = {"factor": 0.5, "repeat": 12, "max_influences": 4}
me = hoodie.data
nv, groups_all = len(me.vertices), list(hoodie.vertex_groups)
W = np.zeros((nv, len(groups_all)), dtype=np.float32)
for v in me.vertices:
    for g in v.groups:
        W[v.index, g.group] = g.weight
edges = np.array([e.vertices[:] for e in me.edges], dtype=np.int64)
deg = np.bincount(edges.ravel(), minlength=nv).astype(np.float32)[:, None]
deg[deg == 0] = 1
for _ in range(SMOOTH["repeat"]):
    acc = np.zeros_like(W)
    np.add.at(acc, edges[:, 0], W[edges[:, 1]])
    np.add.at(acc, edges[:, 1], W[edges[:, 0]])
    W += SMOOTH["factor"] * (acc / deg - W)
# keep the 4 strongest influences per vertex and normalise
if W.shape[1] > SMOOTH["max_influences"]:
    cut = np.partition(W, -SMOOTH["max_influences"], axis=1)[:, -SMOOTH["max_influences"]][:, None]
    W[W < cut] = 0
W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-8)
for gi, vg in enumerate(groups_all):
    vg.remove(list(range(nv)))
    col = W[:, gi]
    for vi in np.nonzero(col > 1e-4)[0]:
        vg.add([int(vi)], float(col[vi]), "REPLACE")
print("SLEEVES", {"sleeve_verts": sleeve_count, "torso_verts_unhooked_from_arms": fixed})

mod = hoodie.modifiers.new("Armature", "ARMATURE")
mod.object = arm_b
cs = hoodie.modifiers.new("RelaxStretch", "CORRECTIVE_SMOOTH")
cs.iterations = 8
cs.smooth_type = "LENGTH_WEIGHTED"
cs.rest_source = "ORCO"
cs.use_pin_boundary = True
# one cloth layer remains (the inner duplicate was removed): give it real fleece thickness
so = hoodie.modifiers.new("Thickness", "SOLIDIFY")
so.thickness = 0.003
so.offset = -1.0
so.use_even_offset = False
so.use_quality_normals = True
so.thickness_clamp = 0.5  # never thicker than half the local edge length: no spikes
hoodie.parent = arm_b
hoodie.matrix_parent_inverse = arm_b.matrix_world.inverted()
bpy.data.objects.remove(proxy)

# ---------- 5. B follows A ----------
for pb in arm_b.pose.bones:
    c = pb.constraints.new("COPY_TRANSFORMS")
    c.target = arm_a
    c.subtarget = pb.name
    c.target_space = c.owner_space = "WORLD"
for pb in arm_a.pose.bones:  # A back to rest: actions now drive it
    pb.matrix_basis = Matrix.Identity(4)
arm_a.animation_data_create()
arm_a.animation_data.action = typing
if hasattr(arm_a.animation_data, "action_slot") and len(typing.slots):
    arm_a.animation_data.action_slot = typing.slots[0]
scene.frame_start, scene.frame_end = (int(f) for f in typing.frame_range)

# ---------- 6. mask body under the hoodie, materials ----------
hide = body.vertex_groups.new(name="HIDE_UnderHoodie")
groups = {body.vertex_groups[f"mixamorig:{n}"].index for n in HIDDEN_UNDER_HOODIE if f"mixamorig:{n}" in body.vertex_groups}
head_idx = body.vertex_groups["mixamorig:Head"].index
for v in body.data.vertices:
    co = body.matrix_world @ v.co
    under_cloth = sum(g.weight for g in v.groups if g.group in groups) > 0.45
    # the back of Ch44's helmet has fins that poke through the hood; only its front (visor) stays
    helmet_back = any(g.group == head_idx and g.weight > 0.5 for g in v.groups) and co.y > head_rest.y - 0.01
    if under_cloth or helmet_back:
        hide.add([v.index], 1.0, "REPLACE")
m = body.modifiers.new("HideUnderHoodie", "MASK")
m.vertex_group = hide.name
m.invert_vertex_group = True
body.modifiers.move(len(body.modifiers) - 1, 0)

for mat in hoodie.data.materials:
    if not mat or not mat.use_nodes:
        continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        continue
    for link in list(bsdf.inputs["Base Color"].links):
        mat.node_tree.links.remove(link)
    bsdf.inputs["Base Color"].default_value = (*HOODIE_LINEAR, 1)
    bsdf.inputs["Roughness"].default_value = 0.92
    for link in list(bsdf.inputs["Roughness"].links):
        mat.node_tree.links.remove(link)
    if "Sheen Weight" in bsdf.inputs:
        # a little dark fleece sheen; the default white tint turned the hoodie grey-white
        bsdf.inputs["Sheen Weight"].default_value = 0.15
        bsdf.inputs["Sheen Roughness"].default_value = 0.6
        bsdf.inputs["Sheen Tint"].default_value = (0.06, 0.065, 0.075, 1)
    print("MAT", mat.name, "base", tuple(round(c, 3) for c in bsdf.inputs["Base Color"].default_value[:3]))

# ---------- 7. visible armour → developer clothing (matte gloves, dark trousers, boots) ----------
def fabric(name, color, rough, sheen=0.0, bump=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if sheen and "Sheen Weight" in b.inputs:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Tint"].default_value = (0.07, 0.075, 0.085, 1)
    if bump:  # fine woven texture instead of the armour's plate normals
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 900.0
        noise.inputs["Detail"].default_value = 4.0
        bmp = nt.nodes.new("ShaderNodeBump")
        bmp.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], bmp.inputs["Height"])
        nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


CLOTHING = {
    "glove": (fabric("Char_Gloves", (0.012, 0.012, 0.013), 0.62, sheen=0.1, bump=0.08), ("Hand",)),
    "trousers": (fabric("Char_Trousers", (0.016, 0.017, 0.02), 0.86, sheen=0.2, bump=0.12), ("UpLeg", "Leg", "Hips")),
    "boots": (fabric("Char_Boots", (0.008, 0.008, 0.009), 0.42), ("Foot", "ToeBase", "Toe_End")),
}
slot = {}
for key, (mat, _) in CLOTHING.items():
    body.data.materials.append(mat)
    slot[key] = len(body.data.materials) - 1
group_kind = {}
for vg in body.vertex_groups:
    short = vg.name.replace("mixamorig:", "")
    for key, (_, parts) in CLOTHING.items():
        if any(short.startswith(side + p) or short == p for side in ("Left", "Right") for p in parts):
            group_kind[vg.index] = key
assigned = {k: 0 for k in CLOTHING}
for poly in body.data.polygons:
    score = {k: 0.0 for k in CLOTHING}
    for vi in poly.vertices:
        for g in body.data.vertices[vi].groups:
            k = group_kind.get(g.group)
            if k:
                score[k] += g.weight
    best = max(score, key=score.get)
    if score[best] / len(poly.vertices) > 0.5:
        poly.material_index = slot[best]
        assigned[best] += 1
print("CLOTHING polygons", assigned)

# ---------- 8. real-world height: 1.90 m Mixamo body → 1.80 m, under one root ----------
root = bpy.data.objects.new("Char_Root", None)
scene.collection.objects.link(root)
for rig in (arm_a, arm_b):
    mw = rig.matrix_world.copy()
    rig.parent = root
    rig.matrix_world = mw
root.scale = (0.947,) * 3  # 1.90 × 0.947 ≈ 1.80 m

bpy.context.view_layer.update()
print("BUILT", {"hoodie_faces": len(hoodie.data.polygons), "hoodie_groups": len(hoodie.vertex_groups),
               "hidden_body_verts": sum(1 for v in body.data.vertices if any(g.group == hide.index for g in v.groups)),
               "frames": (scene.frame_start, scene.frame_end)})
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("SAVED", out_blend)
