"""Measure the Mixamo body (bone joints) and the hoodie (shoulders, cuffs, hood) for fitting.

Usage:
  blender --background --factory-startup --python tools/blender/measure_fit.py -- <character.fbx> <hoodie.gltf>
"""
import sys

import bpy
from mathutils import Vector

char_path, hoodie_path = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)

bpy.ops.import_scene.fbx(filepath=char_path)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = next(o for o in bpy.context.scene.objects if o.type == "MESH")
bpy.context.view_layer.update()
print("ARMATURE world matrix scale", tuple(round(s, 4) for s in arm.matrix_world.to_scale()), "rot", tuple(round(r, 3) for r in arm.rotation_euler))
for name in ["Hips", "Spine", "Spine2", "Neck", "Head", "HeadTop_End", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightHand", "LeftUpLeg", "LeftFoot"]:
    b = arm.data.bones.get(f"mixamorig:{name}")
    if b:
        h = arm.matrix_world @ b.head_local
        t = arm.matrix_world @ b.tail_local
        print(f"BONE {name:14} head=({h.x:.3f},{h.y:.3f},{h.z:.3f}) tail=({t.x:.3f},{t.y:.3f},{t.z:.3f})")
pts = [body.matrix_world @ v.co for v in body.data.vertices]
print("BODY bbox z", round(min(p.z for p in pts), 3), round(max(p.z for p in pts), 3), "x", round(min(p.x for p in pts), 3), round(max(p.x for p in pts), 3), "y", round(min(p.y for p in pts), 3), round(max(p.y for p in pts), 3))
spine2 = arm.matrix_world @ arm.data.bones["mixamorig:Spine2"].head_local
band = [p for p in pts if abs(p.z - spine2.z) < 0.03 and abs(p.x) < 0.25]
print("BODY chest band width", round(max(p.x for p in band) - min(p.x for p in band), 3), "depth", round(max(p.y for p in band) - min(p.y for p in band), 3), "y range", round(min(p.y for p in band), 3), round(max(p.y for p in band), 3))

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=hoodie_path)
meshes = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
bpy.context.view_layer.update()
hp = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
zmin, zmax = min(p.z for p in hp), max(p.z for p in hp)
print("HOODIE bbox z", round(zmin, 3), round(zmax, 3), "x", round(min(p.x for p in hp), 3), round(max(p.x for p in hp), 3), "y", round(min(p.y for p in hp), 3), round(max(p.y for p in hp), 3))
H = zmax - zmin
for frac in [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.05]:
    z = zmin + frac * H
    band = [p for p in hp if abs(p.z - z) < H * 0.015]
    if band:
        print(f"HOODIE band {frac:.2f} z={z:.3f} x=[{min(p.x for p in band):.3f},{max(p.x for p in band):.3f}] y=[{min(p.y for p in band):.3f},{max(p.y for p in band):.3f}] n={len(band)}")
for side, sel in (("left(+x)", lambda p: p.x > 0.12), ("right(-x)", lambda p: p.x < -0.12)):
    s = [p for p in hp if sel(p)]
    low = sorted(s, key=lambda p: p.z)[:40]
    c = sum(low, Vector()) / len(low)
    print(f"HOODIE cuff {side} centre=({c.x:.3f},{c.y:.3f},{c.z:.3f})")
for o in meshes:
    print("HOODIE part", o.name, [m.name for m in o.data.materials])
