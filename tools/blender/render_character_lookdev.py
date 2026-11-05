"""Look-dev render of the dressed character typing (Cycles, GPU), with temporary desk/chair blocks.

Usage:
  blender --background <character.blend> --python tools/blender/render_character_lookdev.py -- <outDir> [frame] [samples]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = args[0]
frame = int(args[1]) if len(args) > 1 else 120
samples = int(args[2]) if len(args) > 2 else 96
os.makedirs(out_dir, exist_ok=True)
scene = bpy.context.scene
scene.frame_set(frame)
bpy.context.view_layer.update()
rig = bpy.data.objects["RIG_Mixamo"]
PREFIX = rig.data.bones[0].name.split(":")[0] + ":"  # mixamorig: / mixamorig9: ...


def bone(name):
    return rig.matrix_world @ rig.pose.bones[f"{PREFIX}{name}"].head


hips, head = bone("Hips"), bone("Head")
hand_l, hand_r = bone("LeftHand"), bone("RightHand")
forward = Vector((0, -1, 0))
print("POSE hips", tuple(round(c, 3) for c in hips), "head", tuple(round(c, 3) for c in head),
      "hands", tuple(round(c, 3) for c in hand_l), tuple(round(c, 3) for c in hand_r))


def mat(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def block(name, size, loc, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = size
    o.data.materials.append(material)
    return o


# temporary set: floor, desk under the hands, monitor ahead, chair under the hips (look-dev only)
desk_top = min(hand_l.z, hand_r.z) - 0.035
hands_mid = (hand_l + hand_r) / 2
block("LD_Floor", (8, 8, 0.02), (0, 0, -0.01), mat("floor", (0.02, 0.022, 0.026), 0.35))
block("LD_Desk", (1.8, 0.75, 0.04), (hands_mid.x, hands_mid.y - 0.22, desk_top - 0.02), mat("desk", (0.03, 0.025, 0.022), 0.4))
block("LD_Keyboard", (0.44, 0.14, 0.02), (hands_mid.x, hands_mid.y - 0.02, desk_top + 0.01), mat("kb", (0.01, 0.01, 0.012), 0.5))
mon_y = hands_mid.y - 0.55
block("LD_MonitorBezel", (0.74, 0.03, 0.43), (hands_mid.x, mon_y - 0.016, desk_top + 0.4), mat("bezel", (0.005, 0.005, 0.006), 0.3, 0.3))
screen = block("LD_Screen", (0.70, 0.005, 0.39), (hands_mid.x, mon_y, desk_top + 0.4), mat("screen", (0, 0, 0), 0.2, emit=(0.16, 0.55, 1.0), strength=2.0))
block("LD_ChairSeat", (0.5, 0.48, 0.07), (hips.x, hips.y + 0.05, hips.z - 0.14), mat("chair", (0.015, 0.015, 0.017), 0.8))
block("LD_ChairBack", (0.46, 0.07, 0.7), (hips.x, hips.y + 0.33, hips.z + 0.28), mat("chair2", (0.015, 0.015, 0.017), 0.8))

world = bpy.data.worlds.new("lookdev")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.002, 0.004, 0.01, 1)
scene.world = world


def area(name, loc, target, energy, color, size):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.color, d.size = energy, color, size
    o = bpy.data.objects.new(name, d)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(o)


area("L_MonitorGlow", (hands_mid.x, mon_y + 0.05, desk_top + 0.4), head, 25, (0.3, 0.6, 1.0), 0.6)
area("L_BlueFill", (hips.x - 2.5, hips.y - 1.0, 2.4), head, 60, (0.15, 0.3, 1.0), 2.5)
area("L_OrangeRim", (hips.x + 1.1, hips.y + 1.6, 2.2), head, 140, (1.0, 0.45, 0.15), 0.8)
area("L_Key", (hips.x + 1.8, hips.y - 1.6, 2.6), hips, 22, (1.0, 0.88, 0.75), 1.5)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            print("DEVICE", kind, [d.name for d in gpus])
            break
    except TypeError:
        continue
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Punchy" if "AgX - Punchy" in [i.identifier for i in scene.view_settings.bl_rna.properties["look"].enum_items] else "None"

views = {
    "over_shoulder": (hips + Vector((0.75, 1.15, 0.75)), (hands_mid + Vector((0, -0.5, 0.35))), 32),
    "front_three_quarter": (hips + Vector((1.25, -1.55, 0.55)), head + Vector((0, 0, -0.3)), 40),
    "side": (hips + Vector((1.9, 0.0, 0.45)), hips + Vector((0, -0.15, 0.35)), 40),
}
for name, (loc, target, lens) in views.items():
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = lens
    scene.render.filepath = os.path.join(out_dir, f"char_{name}_f{frame}.png")
    bpy.ops.render.render(write_still=True)
    print("WROTE", scene.render.filepath)
