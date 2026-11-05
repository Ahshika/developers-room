"""Line up candidate assets and render comparison sheets (front + 3/4, neutral and moody light).

Usage:
  blender --background --factory-startup --python tools/blender/compare_assets.py -- <outDir> <label=path> [label=path ...]
Each asset is scaled to stand on the floor; garments without a body keep their real size.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
items = [a.split("=", 1) for a in args[1:]]
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
SPACING = 1.5


def import_any(path):
    before = set(bpy.data.objects)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def world_bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


for i, (label, path) in enumerate(items):
    objs = import_any(path)
    roots = [o for o in objs if o.parent is None]
    holder = bpy.data.objects.new(f"HOLD_{label}", None)
    scene.collection.objects.link(holder)
    for r in roots:
        r.parent = holder
    bpy.context.view_layer.update()
    lo, hi = world_bounds(objs)
    size = hi - lo
    # oversized imports (e.g. centimetre units) are normalised to a 0.8 m garment
    if max(size) > 3.0:
        holder.scale = (0.8 / max(size),) * 3
        bpy.context.view_layer.update()
        lo, hi = world_bounds(objs)
    centre = (lo + hi) / 2
    holder.location += Vector((i * SPACING - centre.x, -centre.y, -lo.z))
    # garments float at torso height so they read next to bodies
    if (hi - lo).z * holder.scale.z < 1.2:
        holder.location.z += 0.85
    bpy.context.view_layer.update()
    txt = bpy.data.curves.new(f"T_{label}", "FONT")
    txt.body = label
    txt.size = 0.12
    txt.align_x = "CENTER"
    t = bpy.data.objects.new(f"T_{label}", txt)
    t.location = (i * SPACING, -0.6, 0.02)
    scene.collection.objects.link(t)

floor = bpy.data.meshes.new("floor")
floor.from_pydata([(-5, -5, 0), (15, -5, 0), (15, 5, 0), (-5, 5, 0)], [], [(0, 1, 2, 3)])
fo = bpy.data.objects.new("floor", floor)
scene.collection.objects.link(fo)

world = bpy.data.worlds.new("w")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]

mid_x = (len(items) - 1) * SPACING / 2
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 40

engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 800
scene.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"


def light(name, kind, loc, energy, color, size=2.0):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if kind == "AREA":
        d.size = size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    c = o.constraints.new("TRACK_TO")
    c.target = cam if False else None
    o.rotation_euler = (Vector((mid_x, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


rigs = {
    "neutral": [("key", "AREA", (mid_x + 1.5, -4.0, 3.5), 2500, (1, 1, 1), 5), ("fill", "AREA", (mid_x - 4, -2, 2.0), 800, (1, 1, 1), 4)],
    "moody": [("key", "AREA", (mid_x + 2.5, -2.5, 2.8), 900, (1.0, 0.85, 0.7), 2), ("blue", "AREA", (mid_x - 4, -3, 2.0), 1400, (0.25, 0.45, 1.0), 4),
              ("rim", "AREA", (mid_x, 3.0, 2.5), 2200, (1.0, 0.5, 0.18), 2)],
}
views = {"front": (Vector((mid_x, -7.5, 1.1)), Vector((mid_x, 0, 0.95))), "threequarter": (Vector((mid_x + 4.5, -6.2, 1.5)), Vector((mid_x, 0, 0.95)))}

for rig_name, lights in rigs.items():
    made = [light(*l) for l in lights]
    bg.inputs[0].default_value = (0.03, 0.035, 0.05, 1) if rig_name == "neutral" else (0.004, 0.006, 0.012, 1)
    for view_name, (loc, target) in views.items():
        cam.location = loc
        cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, f"compare_{rig_name}_{view_name}.png")
        bpy.ops.render.render(write_still=True)
        print("WROTE", scene.render.filepath)
    for o in made:
        bpy.data.objects.remove(o)
