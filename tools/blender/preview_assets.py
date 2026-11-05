"""Quick EEVEE preview of the character and the hoodie side by side (look-dev check, not final).

Usage:
  blender --background --factory-startup --python tools/blender/preview_assets.py -- <character.fbx> <hoodie.gltf> <out.png>
"""
import math
import sys

import bpy
from mathutils import Vector

char_path, hoodie_path, out_path = sys.argv[sys.argv.index("--") + 1:][:3]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.import_scene.fbx(filepath=char_path)
char_objs = list(bpy.context.selected_objects)
bpy.ops.import_scene.gltf(filepath=hoodie_path)
hoodie_objs = [o for o in bpy.context.selected_objects if o.type == "MESH"]

# hoodie: move to the right of the character, standing on the floor
roots = [o for o in bpy.context.selected_objects if o.parent is None]
for r in roots:
    r.location.x += 1.4
bpy.context.view_layer.update()
zmin = min((o.matrix_world @ Vector(c)).z for o in hoodie_objs for c in o.bound_box)
for r in roots:
    r.location.z -= zmin - 0.9

# simple studio light + camera
bpy.ops.object.light_add(type="AREA", location=(0.6, -3.0, 3.0))
key = bpy.context.object
key.data.energy = 900
key.data.size = 3
key.rotation_euler = (math.radians(50), 0, math.radians(10))
bpy.ops.object.light_add(type="AREA", location=(-2.5, 1.5, 2.0))
bpy.context.object.data.energy = 300
bpy.ops.object.camera_add(location=(0.7, -5.2, 1.2), rotation=(math.radians(88), 0, 0))
cam = bpy.context.object
cam.data.lens = 35
scene.camera = cam
world = bpy.data.worlds.new("w")
world.color = (0.05, 0.06, 0.08)
scene.world = world

scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
print("WROTE", out_path, [o.name for o in char_objs][:3])
