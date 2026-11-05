"""Deformation check: render the dressed character at several frames from two views (EEVEE, fast).

Usage:
  blender --background <character.blend> --python tools/blender/render_anim_strip.py -- <outDir> <f1,f2,...>
"""
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, frames = args[0], [int(f) for f in args[1].split(",")]
os.makedirs(out_dir, exist_ok=True)
scene = bpy.context.scene
rig = bpy.data.objects["RIG_Mixamo"]
PREFIX = rig.data.bones[0].name.split(":")[0] + ":"  # mixamorig: / mixamorig9: ...

world = bpy.data.worlds.new("strip")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.014, 0.02, 1)
scene.world = world
for name, loc, energy, color in (("key", (1.5, -2.5, 2.8), 260, (1, 0.95, 0.9)), ("rim", (-1.2, 2.0, 2.4), 260, (1, 0.6, 0.3)), ("fill", (-2.5, -1.5, 1.5), 120, (0.5, 0.65, 1))):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.color, d.size = energy, color, 2.0
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(o)

cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 35
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
engines = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 480, 480
scene.view_settings.view_transform = "AgX"

for f in frames:
    scene.frame_set(f)
    bpy.context.view_layer.update()
    hips = rig.matrix_world @ rig.pose.bones[f"{PREFIX}Hips"].head
    target = hips + Vector((0, -0.1, 0.35))
    for view, offset in (("front", Vector((0.9, -2.2, 0.5))), ("back", Vector((-0.8, 2.2, 0.6))), ("side", Vector((2.3, -0.2, 0.4)))):
        cam.location = hips + offset
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, f"strip_{f:04d}_{view}.png")
        bpy.ops.render.render(write_still=True)
    print("FRAME", f, "hips", tuple(round(c, 3) for c in hips))
