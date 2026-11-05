"""Build the developer room around the Ch06 character (Phase 3 look-dev, Cycles).

Blender coordinates (Z up). The character faces -Y; the room is laid out around his measured
typing pose (tools/blender: feet float 0.30 m in the Mixamo action, so the character is lowered
0.30 m; hands then rest at z ≈ 0.76, a normal desk height).

  -Y  window wall + night city, desk with 3 monitors, lamp, plant, RGB PC on the right
  -X  server racks with blue status LEDs
  +X  shelves with plants and warm light
  +Y  room behind the camera

Usage:
  blender --background --factory-startup --python tools/blender/build_room.py -- \
      <character.blend> <polyhavenDir> <out.blend>
"""
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import screen_content  # noqa: E402  (tools/blender/screen_content.py)

char_blend, ph_dir, out_blend = (os.path.abspath(p) for p in sys.argv[sys.argv.index("--") + 1:][:3])
rng = random.Random(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col_room = bpy.data.collections.new("Room")
scene.collection.children.link(col_room)

ROOM = {"x0": -2.3, "x1": 2.3, "y0": -1.75, "y1": 3.4, "h": 2.9}
CHAR_DROP = 0.30
DESK = {"top": 0.72, "front_y": -0.27, "depth": 0.82, "width": 2.7, "cx": 0.05}
MONITOR = {"w": 0.71, "h": 0.40, "bottom": 0.90, "y": -0.92}


# ---------------------------------------------------------------- helpers
def link(obj, coll=col_room):
    coll.objects.link(obj)
    return obj


def box(name, size, loc, mat, bevel=0.004, rot_z=0.0):
    me = bpy.data.meshes.new(name)
    sx, sy, sz = (s / 2 for s in size)
    v = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(v, [], f)
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    o.rotation_euler.z = rot_z
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.limit_method = bevel, 2, "ANGLE"
    return o


def screen_plane(name, w, h, loc, mat):
    """Screen quad facing +Y with UVs (a raw box has none, so the image sampled one dark pixel).
    Seen from +Y the viewer's right is -X, so u runs from +X (u=0) to -X (u=1)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], [], [(0, 3, 2, 1)])
    uv = me.uv_layers.new(name="UVMap")
    for loop, (u, v) in zip(me.loops, ((1, 0), (1, 1), (0, 1), (0, 0))):
        uv.data[loop.index].uv = (u, v)
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me))
    o.location = loc
    return o


def cylinder(name, r, depth, loc, mat, verts=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    for c in o.users_collection:
        c.objects.unlink(o)
    link(o)
    o.data.materials.append(mat)
    return o


def principled(name, color=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, emit=None, emit_strength=0.0, transmission=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
    return m


def textured(name, folder, scale=1.0, tint=1.0, rough_mul=1.0, metal=0.0):
    """PBR material from a Poly Haven texture set, box-projected in object space."""
    tdir = os.path.join(ph_dir, "textures", folder)
    files = {k: next((os.path.join(tdir, f) for f in os.listdir(tdir) if k in f), None) for k in ("diff", "nor_gl", "rough")}
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Metallic"].default_value = metal
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def tex(path, non_color):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(path, check_existing=True)
        t.projection = "BOX"
        t.projection_blend = 0.2
        if non_color:
            t.image.colorspace_settings.name = "Non-Color"
        nt.links.new(mapping.outputs["Vector"], t.inputs["Vector"])
        return t

    if files["diff"]:
        d = tex(files["diff"], False)
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        mul.inputs[7].default_value = (tint, tint, tint, 1)
        nt.links.new(d.outputs["Color"], mul.inputs[6])
        nt.links.new(mul.outputs[2], b.inputs["Base Color"])
    if files["rough"]:
        r = tex(files["rough"], True)
        mm = nt.nodes.new("ShaderNodeMath")
        mm.operation = "MULTIPLY"
        mm.inputs[1].default_value = rough_mul
        nt.links.new(r.outputs["Color"], mm.inputs[0])
        nt.links.new(mm.outputs[0], b.inputs["Roughness"])
    if files["nor_gl"]:
        n = tex(files["nor_gl"], True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.6
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def screen_material(name, image, strength=2.2):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    b.inputs["Roughness"].default_value = 0.08
    b.inputs["Coat Weight"].default_value = 0.3
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image
    nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = strength
    return m


def area_light(name, loc, target, energy, color, size=1.0, size_y=None, spread=180):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.color = energy, color
    if size_y:
        d.shape = "RECTANGLE"
        d.size, d.size_y = size, size_y
    else:
        d.size = size
    d.spread = math.radians(spread)
    o = link(bpy.data.objects.new(name, d))
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


def point_light(name, loc, energy, color, radius=0.05):
    d = bpy.data.lights.new(name, "POINT")
    d.energy, d.color, d.shadow_soft_size = energy, color, radius
    o = link(bpy.data.objects.new(name, d))
    o.location = loc
    return o


def import_gltf(path, loc, rot_z=0.0, scale=1.0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        link(o)
    root = bpy.data.objects.new(os.path.basename(path).split("_1k")[0], None)
    link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    root.location, root.rotation_euler.z, root.scale = loc, rot_z, (scale,) * 3
    return root


# ---------------------------------------------------------------- materials
M = {
    "floor": textured("M_Floor", "hangar_concrete_floor", scale=0.45, tint=0.35, rough_mul=0.8),
    "wall": textured("M_Wall", "plaster_grey_04", scale=0.5, tint=0.16),
    "wood": textured("M_DeskWood", "dark_wood", scale=0.9, tint=0.55, rough_mul=0.9),
    "rackmetal": textured("M_RackMetal", "metal_plate_02", scale=1.2, tint=0.12, metal=0.85, rough_mul=0.8),
    "black_metal": principled("M_BlackMetal", (0.012, 0.012, 0.014), 0.35, 0.9),
    "black_plastic": principled("M_BlackPlastic", (0.01, 0.01, 0.011), 0.45),
    "chair_fabric": principled("M_ChairFabric", (0.012, 0.012, 0.014), 0.8),
    "chair_accent": principled("M_ChairAccent", (0.6, 0.12, 0.02), 0.5),
    "glass": principled("M_Glass", (0.9, 0.95, 1.0), 0.02, transmission=1.0),
    "tinted_glass": principled("M_TintedGlass", (0.2, 0.22, 0.25), 0.05, transmission=1.0),
    "smoked_glass": principled("M_SmokedGlass", (0.03, 0.035, 0.045), 0.2, transmission=0.85),
    "led_blue": principled("M_LedBlue", (0, 0, 0), 0.4, emit=(0.15, 0.45, 1.0), emit_strength=18),
    "led_cyan": principled("M_LedCyan", (0, 0, 0), 0.4, emit=(0.26, 0.85, 1.0), emit_strength=12),
    "led_orange": principled("M_LedOrange", (0, 0, 0), 0.4, emit=(1.0, 0.45, 0.12), emit_strength=10),
    "led_purple": principled("M_LedPurple", (0, 0, 0), 0.4, emit=(0.38, 0.08, 1.0), emit_strength=1.3),  # saturated + low: AgX washed bright ones to white
    "fan_blue": principled("M_FanBlue", (0, 0, 0), 0.4, emit=(0.03, 0.3, 1.0), emit_strength=1.3),
    "led_green": principled("M_LedGreen", (0, 0, 0), 0.4, emit=(0.24, 0.9, 0.5), emit_strength=14),
    "warm_bulb": principled("M_WarmBulb", (0, 0, 0), 0.4, emit=(1.0, 0.62, 0.32), emit_strength=25),
}

# ---------------------------------------------------------------- architecture
x0, x1, y0, y1, H = ROOM["x0"], ROOM["x1"], ROOM["y0"], ROOM["y1"], ROOM["h"]
W, D = x1 - x0, y1 - y0
box("Floor", (W, D, 0.04), ((x0 + x1) / 2, (y0 + y1) / 2, -0.02), M["floor"], bevel=0)
box("Ceiling", (W, D, 0.06), ((x0 + x1) / 2, (y0 + y1) / 2, H + 0.03), M["wall"], bevel=0)
box("Wall_Left", (0.12, D, H), (x0 - 0.06, (y0 + y1) / 2, H / 2), M["wall"], bevel=0)
box("Wall_Right", (0.12, D, H), (x1 + 0.06, (y0 + y1) / 2, H / 2), M["wall"], bevel=0)
box("Wall_Back", (W, 0.12, H), ((x0 + x1) / 2, y1 + 0.06, H / 2), M["wall"], bevel=0)
# window wall in front of the developer: low sill, slim mullions, large glass to the city
WIN = {"sill": 0.55, "head": 2.6}
box("Window_Sill", (W, 0.14, WIN["sill"]), (0, y0 - 0.07, WIN["sill"] / 2), M["wall"], bevel=0)
box("Window_Header", (W, 0.14, H - WIN["head"]), (0, y0 - 0.07, (H + WIN["head"]) / 2), M["wall"], bevel=0)
for i in range(6):
    x = x0 + i * (W / 5)
    box(f"Window_Mullion_{i}", (0.05, 0.08, WIN["head"] - WIN["sill"]), (x, y0 - 0.04, (WIN["sill"] + WIN["head"]) / 2), M["black_metal"])
glass = box("Window_Glass", (W, 0.012, WIN["head"] - WIN["sill"]), (0, y0 - 0.03, (WIN["sill"] + WIN["head"]) / 2), M["tinted_glass"], bevel=0)
glass.visible_shadow = False
# ceiling LED strips (cool) and a warm cove on the right wall
for i, y in enumerate((-0.6, 0.9)):
    box(f"Ceiling_LED_{i}", (3.4, 0.03, 0.02), (0, y, H - 0.02), M["led_cyan"], bevel=0)
box("Cove_Right", (0.02, 3.2, 0.02), (x1 - 0.03, 0.4, 2.35), M["led_orange"], bevel=0)

# ---------------------------------------------------------------- workstation (programmer setup)
# Spliced into build_room.py: 6 monitors (3 main, 2 on an arm above, 1 portrait), laptop, two RGB
# towers, desk network gear. Every screen shows procedural content from screen_content.py.
dt, fy, dd, dw, dcx = DESK["top"], DESK["front_y"], DESK["depth"], DESK["width"], DESK["cx"]
desk_y = fy - dd / 2
box("Desk_Top", (dw, dd, 0.04), (dcx, desk_y, dt - 0.02), M["wood"], bevel=0.006)
for sx in (-1, 1):
    box(f"Desk_Leg_{sx}", (0.07, dd - 0.12, 0.05), (dcx + sx * (dw / 2 - 0.12), desk_y, 0.025), M["black_metal"])
    box(f"Desk_Column_{sx}", (0.07, 0.07, dt - 0.09), (dcx + sx * (dw / 2 - 0.12), desk_y, (dt - 0.04) / 2 + 0.025), M["black_metal"])
box("Desk_LED_Strip", (dw - 0.1, 0.01, 0.008), (dcx, fy - 0.02, dt - 0.045), M["led_cyan"], bevel=0)


def screen_image(name, kind, seed, w=1600, h=900):
    arr = screen_content.make(kind, w, h, seed)
    rgba = np.concatenate([arr, np.ones(arr.shape[:2] + (1,), dtype=np.float32)], axis=2)
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.pixels.foreach_set(np.flipud(rgba).ravel())
    im.pack()
    return im


def monitor(name, w, h, centre, yaw=0.0, pitch=0.0, kind="code", seed=1, strength=1.9, stand="foot", portrait=False):
    """Bezel + UV screen facing +Y (toward the developer), rotated by yaw/pitch about its centre."""
    g = link(bpy.data.objects.new(name, None))
    g.location = centre
    g.rotation_euler = (pitch, 0, yaw)
    iw, ih = (900, 1600) if portrait else (1600, 900)
    box(f"{name}_Bezel", (w + 0.016, 0.022, h + 0.016), (0, -0.012, 0), M["black_plastic"], bevel=0.003).parent = g
    screen_plane(f"{name}_Screen", w, h, (0, 0.0015, 0), screen_material(f"M_{name}", screen_image(f"IMG_{name}", kind, seed, iw, ih), strength)).parent = g
    if stand == "foot":
        z_bottom = centre[2] - h / 2
        s = link(bpy.data.objects.new(f"{name}_Stand", None))
        s.location, s.rotation_euler.z = (centre[0], centre[1], 0), yaw
        box(f"{name}_Neck", (0.05, 0.03, z_bottom - dt), (0, -0.06, (z_bottom + dt) / 2), M["black_metal"]).parent = s
        box(f"{name}_Foot", (0.24, 0.18, 0.012), (0, -0.05, dt + 0.006), M["black_metal"]).parent = s
    return g


H_MAIN, W_MAIN = MONITOR["h"], MONITOR["w"]
monitor("Monitor_Main", W_MAIN, H_MAIN, (dcx, MONITOR["y"], MONITOR["bottom"] + H_MAIN / 2), kind="code", seed=11, strength=2.4)
monitor("Monitor_Left", 0.6, 0.34, (dcx - 0.74, MONITOR["y"] + 0.12, MONITOR["bottom"] + 0.17), yaw=math.radians(-22), kind="terminal", seed=21)
monitor("Monitor_Right", 0.6, 0.34, (dcx + 0.74, MONITOR["y"] + 0.12, MONITOR["bottom"] + 0.17), yaw=math.radians(22), kind="htop", seed=31)
# upper row on a dual monitor arm, tilted down toward the developer
TOP_Z = MONITOR["bottom"] + H_MAIN + 0.05 + 0.17
monitor("Monitor_TopL", 0.6, 0.34, (dcx - 0.33, MONITOR["y"] - 0.02, TOP_Z), yaw=math.radians(-8), pitch=math.radians(-10), kind="dashboard", seed=41, stand="arm")
monitor("Monitor_TopR", 0.6, 0.34, (dcx + 0.33, MONITOR["y"] - 0.02, TOP_Z), yaw=math.radians(8), pitch=math.radians(-10), kind="topology", seed=51, stand="arm")
box("MonitorArm_Pole", (0.04, 0.04, TOP_Z + 0.1 - dt), (dcx, MONITOR["y"] - 0.1, (TOP_Z + 0.1 + dt) / 2), M["black_metal"])
box("MonitorArm_Bar", (0.9, 0.03, 0.03), (dcx, MONITOR["y"] - 0.06, TOP_Z), M["black_metal"])
box("MonitorArm_Clamp", (0.1, 0.1, 0.04), (dcx, MONITOR["y"] - 0.1, dt + 0.02), M["black_metal"])
# portrait monitor for long code files, far left
monitor("Monitor_Portrait", 0.34, 0.6, (dcx - 1.16, MONITOR["y"] + 0.22, MONITOR["bottom"] + 0.24), yaw=math.radians(-38), kind="code", seed=61, portrait=True)

# laptop, open, on the right of the keyboard
lap = link(bpy.data.objects.new("Laptop", None))
lap.location, lap.rotation_euler.z = (dcx + 0.98, -0.6, dt), math.radians(18)
box("Laptop_Base", (0.33, 0.23, 0.016), (0, 0, 0.008), principled("M_Alu", (0.05, 0.05, 0.055), 0.3, 0.8), bevel=0.004).parent = lap
lid = link(bpy.data.objects.new("Laptop_Lid", None))
lid.parent, lid.location, lid.rotation_euler.x = lap, (0, -0.115, 0.016), math.radians(-12)
box("Laptop_LidShell", (0.33, 0.008, 0.22), (0, -0.006, 0.11), principled("M_Alu2", (0.05, 0.05, 0.055), 0.3, 0.8), bevel=0.003).parent = lid
screen_plane("Laptop_Screen", 0.31, 0.2, (0, 0.0005, 0.112), screen_material("M_LaptopScreen", screen_image("IMG_Laptop", "terminal", 71, 1200, 780), 1.6)).parent = lid

# keyboard (mechanical, RGB underglow) and mouse under the measured hand positions
kb_x, kb_y = 0.09, -0.42
box("Keyboard_Base", (0.44, 0.14, 0.022), (kb_x, kb_y, dt + 0.011), M["black_plastic"], bevel=0.004)
box("Keyboard_Glow", (0.43, 0.13, 0.004), (kb_x, kb_y, dt + 0.002), M["led_purple"], bevel=0)
keys = box("Keyboard_Keys", (0.017, 0.016, 0.009), (kb_x - 0.2, kb_y - 0.055, dt + 0.027), M["black_plastic"], bevel=0.002)
a1 = keys.modifiers.new("cols", "ARRAY")
a1.count, a1.relative_offset_displace = 18, (1.32, 0, 0)
a2 = keys.modifiers.new("rows", "ARRAY")
a2.count, a2.relative_offset_displace = 6, (0, 1.34, 0)
box("Deskmat", (0.9, 0.36, 0.003), (0.25, -0.44, dt + 0.0015), principled("M_Deskmat", (0.008, 0.008, 0.01), 0.9), bevel=0)
box("Mouse", (0.065, 0.11, 0.03), (0.55, -0.43, dt + 0.018), M["black_plastic"], bevel=0.012)

# desk network gear: Wi-Fi router with antennas + 8-port switch, back-right corner
rt = link(bpy.data.objects.new("Router", None))
rt.location = (dcx + 1.12, desk_y - 0.25, dt)
box("Router_Body", (0.26, 0.16, 0.04), (0, 0, 0.02), M["black_plastic"], bevel=0.008).parent = rt
for k in range(4):
    ant = box(f"Router_Antenna_{k}", (0.012, 0.012, 0.17), (-0.1 + k * 0.066, 0.07, 0.12), M["black_plastic"], bevel=0.005)
    ant.rotation_euler.x = math.radians(-12)
    ant.parent = rt
    box(f"Router_LED_{k}", (0.012, 0.003, 0.004), (-0.08 + k * 0.05, -0.081, 0.025), M["led_green"], bevel=0).parent = rt
box("Switch8_Body", (0.24, 0.1, 0.03), (dcx + 1.12, desk_y - 0.02, dt + 0.015), M["black_metal"], bevel=0.003)
for k in range(8):
    box(f"Switch8_Port_{k}", (0.016, 0.003, 0.012), (dcx + 1.12 - 0.09 + k * 0.026, desk_y + 0.031, dt + 0.016), M["black_plastic"], bevel=0)
    if rng.random() < 0.75:
        box(f"Switch8_LED_{k}", (0.004, 0.003, 0.003), (dcx + 1.12 - 0.09 + k * 0.026, desk_y + 0.032, dt + 0.026), M["led_green"] if rng.random() < 0.8 else M["led_orange"], bevel=0)

# desk lamp (warm accent) and a succulent
import_gltf(os.path.join(ph_dir, "models", "desk_lamp_arm_01", "desk_lamp_arm_01_1k.gltf"), (dcx + 1.2, desk_y - 0.32, dt), rot_z=math.radians(200), scale=0.55)
point_light("L_DeskLamp", (dcx + 1.08, desk_y - 0.22, dt + 0.24), 12, (1.0, 0.6, 0.3), 0.03)
import_gltf(os.path.join(ph_dir, "models", "potted_plant_04", "potted_plant_04_1k.gltf"), (dcx - 0.95, desk_y - 0.28, dt), scale=0.9)


def tower(name, loc, yaw, glass_side=-1):
    """RGB PC tower: glass side panel (local ±X), front fan stack (+Y) and GPU glow."""
    g = link(bpy.data.objects.new(name, None))
    g.location, g.rotation_euler.z = loc, yaw
    box(f"{name}_Case", (0.23, 0.47, 0.5), (0, 0, 0.25), M["black_metal"], bevel=0.006).parent = g
    box(f"{name}_Glass", (0.004, 0.43, 0.46), (glass_side * 0.117, 0, 0.25), M["tinted_glass"], bevel=0).parent = g
    box(f"{name}_FrontMesh", (0.2, 0.004, 0.46), (0, 0.237, 0.25), principled(f"M_{name}_Mesh", (0.02, 0.02, 0.022), 0.6), bevel=0).parent = g
    for k, z in enumerate((0.11, 0.25, 0.39)):
        ring = cylinder(f"{name}_FrontFan_{k}", 0.06, 0.008, (0, 0.243, z), M["led_purple"] if k % 2 else M["fan_blue"], rot=(math.radians(90), 0, 0))
        ring.parent = g
        hub = cylinder(f"{name}_FrontFanHub_{k}", 0.02, 0.01, (0, 0.244, z), M["black_plastic"], rot=(math.radians(90), 0, 0))
        hub.parent = g
    box(f"{name}_GPU", (0.03, 0.3, 0.08), (glass_side * 0.06, -0.02, 0.22), M["black_plastic"], bevel=0.003).parent = g
    box(f"{name}_GPU_LED", (0.002, 0.28, 0.006), (glass_side * 0.077, -0.02, 0.255), M["led_cyan"], bevel=0).parent = g
    box(f"{name}_RAM_LED", (0.03, 0.002, 0.07), (glass_side * 0.05, 0.08, 0.36), M["led_purple"], bevel=0).parent = g
    lt = point_light(f"L_{name}", (0, 0, 0), 5, (0.5, 0.3, 1.0), 0.06)
    lt.parent, lt.location = g, (glass_side * 0.02, 0, 0.27)
    return g


# two towers on the floor beside the desk (fronts and glass face the room)
tower("PC_Main", (x1 - 0.25, -0.3, 0), math.radians(0), glass_side=-1)  # under the ops desk on the right wall
tower("PC_Lab", (dcx - 1.12, -0.82, 0), math.radians(0), glass_side=1)

# ---------------------------------------------------------------- gaming chair (seat under the measured hips)
hips_y, seat_z = 0.0, 0.42
chair = link(bpy.data.objects.new("Chair", None))


def soft(o, level=2):
    sub = o.modifiers.new("smooth", "SUBSURF")
    sub.levels = sub.render_levels = level
    for p in o.data.polygons:
        p.use_smooth = True
    return o


soft(box("Chair_Seat", (0.52, 0.5, 0.09), (0, hips_y + 0.06, seat_z), M["chair_fabric"], bevel=0.03)).parent = chair
soft(box("Chair_Back", (0.5, 0.1, 0.78), (0, hips_y + 0.33, seat_z + 0.48), M["chair_fabric"], bevel=0.035)).parent = chair
for sx in (-1, 1):
    soft(box(f"Chair_Bolster_{sx}", (0.07, 0.13, 0.72), (sx * 0.22, hips_y + 0.31, seat_z + 0.46), M["chair_fabric"], bevel=0.03)).parent = chair
    box(f"Chair_Stripe_{sx}", (0.035, 0.104, 0.62), (sx * 0.15, hips_y + 0.33, seat_z + 0.5), M["chair_accent"], bevel=0.008).parent = chair
    box(f"Chair_Arm_{sx}", (0.06, 0.28, 0.03), (sx * 0.3, hips_y + 0.02, seat_z + 0.22), M["black_plastic"], bevel=0.01).parent = chair
    box(f"Chair_ArmPost_{sx}", (0.03, 0.03, 0.2), (sx * 0.3, hips_y + 0.1, seat_z + 0.11), M["black_metal"]).parent = chair
soft(box("Chair_Headrest", (0.28, 0.09, 0.11), (0, hips_y + 0.3, seat_z + 0.93), M["chair_fabric"], bevel=0.035)).parent = chair
cylinder("Chair_Lift", 0.028, seat_z - 0.1, (0, hips_y + 0.06, (seat_z - 0.1) / 2 + 0.07), M["black_metal"]).parent = chair
for i in range(5):
    leg = box(f"Chair_BaseLeg_{i}", (0.04, 0.33, 0.035), (0, 0, 0.07), M["black_metal"], bevel=0.008)
    leg.parent = chair
    a = i * 2 * math.pi / 5
    leg.rotation_euler.z = a
    leg.location = (math.sin(a) * -0.16, hips_y + 0.06 + math.cos(a) * 0.16, 0.07)

# ---------------------------------------------------------------- server racks (left wall), with real-looking contents
RACK_U = 0.0445  # 1U


def rack_unit_server(rack, name, z, units, led_mat):
    """2U/1U server front: drive bays + status LEDs."""
    hgt = units * RACK_U - 0.003
    box(f"{name}", (0.48, 0.02, hgt), (0, -0.355, z + hgt / 2), M["black_metal"], bevel=0.002).parent = rack
    bays = 8 if units >= 2 else 4
    for b in range(bays):
        box(f"{name}_Bay{b}", (0.042, 0.004, hgt * 0.7), (-0.19 + b * 0.05, -0.366, z + hgt / 2), principled(f"M_{name}_Bay", (0.03, 0.03, 0.035), 0.5) if b == 0 else bpy.data.materials[f"M_{name}_Bay"], bevel=0).parent = rack
        if rng.random() < 0.8:
            box(f"{name}_BayLED{b}", (0.004, 0.003, 0.004), (-0.17 + b * 0.05, -0.369, z + hgt * 0.8), led_mat if rng.random() < 0.85 else M["led_orange"], bevel=0).parent = rack


def rack_switch(rack, name, z, cable_mats):
    """1U 24-port switch with link LEDs and short patch cables looping out."""
    hgt = RACK_U - 0.003
    box(name, (0.48, 0.02, hgt), (0, -0.355, z + hgt / 2), principled(f"M_{name}", (0.08, 0.09, 0.1), 0.4, 0.6), bevel=0.002).parent = rack
    for p in range(24):
        px = -0.2 + (p % 12) * 0.03
        pz = z + (0.03 if p < 12 else 0.012)
        box(f"{name}_P{p}", (0.012, 0.003, 0.009), (px, -0.366, pz), M["black_plastic"], bevel=0).parent = rack
        if rng.random() < 0.7:
            box(f"{name}_L{p}", (0.003, 0.003, 0.003), (px + 0.008, -0.367, pz + 0.007), M["led_green"] if rng.random() < 0.85 else M["led_orange"], bevel=0).parent = rack
            # patch cable: small loop leaving the port, falling to the side cable manager
            cv = bpy.data.curves.new(f"{name}_C{p}", "CURVE")
            cv.dimensions, cv.bevel_depth, cv.bevel_resolution = "3D", 0.0028, 2
            sp = cv.splines.new("BEZIER")
            sp.bezier_points.add(1)
            a, b = sp.bezier_points
            a.co, b.co = (px, -0.368, pz), (0.235 if px > 0 else -0.235, -0.37, pz - 0.05 - rng.random() * 0.05)
            a.handle_left = a.handle_right = (px, -0.42, pz - 0.01)
            b.handle_left = b.handle_right = (b.co[0], -0.41, b.co[2] + 0.02)
            cv.materials.append(cable_mats[p % len(cable_mats)])
            co = link(bpy.data.objects.new(f"{name}_Cable{p}", cv))
            co.parent = rack


CABLE_MATS = [principled("M_Cable_Blue", (0.05, 0.2, 0.8), 0.45), principled("M_Cable_Yellow", (0.85, 0.65, 0.05), 0.45),
              principled("M_Cable_Grey", (0.25, 0.27, 0.3), 0.5), principled("M_Cable_Red", (0.7, 0.06, 0.05), 0.45)]
RACK_LAYOUT = [("srv", 2), ("srv", 2), ("srv", 1), ("srv", 2), ("gap", 1), ("srv", 1), ("srv", 2), ("srv", 2), ("gap", 1), ("switch", 1), ("patch", 1), ("switch", 1), ("gap", 1), ("srv", 1), ("srv", 2),
               ("srv", 2), ("srv", 1), ("srv", 1), ("gap", 1), ("switch", 1), ("patch", 1), ("srv", 2), ("srv", 2), ("srv", 1), ("srv", 2), ("srv", 1)]  # ≈40U, full


def server_rack(name, rx, ry, yaw_deg, open_front=False):
    """42U rack whose local -Y front is turned by yaw (90° → faces +X, -90° → faces -X)."""
    rack = link(bpy.data.objects.new(name, None))
    rack.location = (rx, ry, 0)
    rack.rotation_euler.z = math.radians(yaw_deg)
    for sx in (-1, 1):
        box(f"{name}_Side{sx}", (0.02, 0.72, 2.05), (sx * 0.3, 0, 1.025), M["rackmetal"], bevel=0.004).parent = rack
        box(f"{name}_Post{sx}", (0.03, 0.03, 2.0), (sx * 0.255, -0.345, 1.02), M["black_metal"], bevel=0.003).parent = rack
        box(f"{name}_CableMgr{sx}", (0.04, 0.05, 1.9), (sx * 0.275, -0.36, 1.02), M["black_plastic"], bevel=0.004).parent = rack
    box(f"{name}_Top", (0.62, 0.72, 0.04), (0, 0, 2.03), M["rackmetal"], bevel=0.004).parent = rack
    box(f"{name}_Bottom", (0.62, 0.72, 0.08), (0, 0, 0.04), M["rackmetal"], bevel=0.004).parent = rack
    box(f"{name}_Back", (0.58, 0.02, 1.95), (0, 0.34, 1.02), M["black_metal"], bevel=0).parent = rack
    z = 0.1
    box(f"{name}_UPS", (0.48, 0.02, 3 * RACK_U), (0, -0.355, z + 1.5 * RACK_U), M["black_plastic"], bevel=0.003).parent = rack
    box(f"{name}_UPS_LCD", (0.07, 0.003, 0.03), (0.12, -0.367, z + 1.6 * RACK_U), M["led_cyan"], bevel=0).parent = rack
    z += 3 * RACK_U + 0.01
    for k, (kind, u) in enumerate(RACK_LAYOUT):
        if kind == "srv":
            rack_unit_server(rack, f"{name}_Srv{k}", z, u, M["led_blue"])
        elif kind == "switch":
            rack_switch(rack, f"{name}_Sw{k}", z, CABLE_MATS)
        elif kind == "patch":
            box(f"{name}_Patch{k}", (0.48, 0.02, RACK_U - 0.003), (0, -0.355, z + RACK_U / 2), M["black_metal"], bevel=0.002).parent = rack
            for p in range(24):
                box(f"{name}_Patch{k}_{p}", (0.011, 0.003, 0.011), (-0.2 + p * 0.0175, -0.366, z + RACK_U / 2), CABLE_MATS[p % 4], bevel=0).parent = rack
        z += u * RACK_U + 0.004
    if not open_front:
        box(f"{name}_Door", (0.6, 0.01, 1.96), (0, -0.405, 1.02), M["smoked_glass"], bevel=0).parent = rack
    front = 1 if yaw_deg > 0 else -1  # +X or -X
    area_light(f"L_{name}", (rx + front * 0.5, ry, 2.2), (rx + front * 0.5, ry, 0), 6, (0.2, 0.45, 1.0), size=0.5, size_y=0.6)
    return rack


RACK_Y = (-1.05, -0.35, 0.35, 1.05, 1.75)  # five racks along the left wall (image right in the wide shot)
for i, ry in enumerate(RACK_Y):
    server_rack(f"Rack_{i}", x0 + 0.38, ry, 90, open_front=(i == 2))
RACK_Y_RIGHT = (0.55, 1.25, 1.95)  # three more facing them on the right wall
for i, ry in enumerate(RACK_Y_RIGHT):
    server_rack(f"RackR_{i}", x1 - 0.38, ry, -90, open_front=(i == 1))

# ---------------------------------------------------------------- cabling: ceiling tray from the racks to the desk
TRAY_Z, TRAY_Y = 2.35, -1.38
box("CableTray_Main", (W, 0.2, 0.02), (0, TRAY_Y, TRAY_Z), M["black_metal"], bevel=0.003)
for sx in (-1, 1):
    box(f"CableTray_Lip{sx}", (W, 0.01, 0.06), (0, TRAY_Y + sx * 0.1, TRAY_Z + 0.03), M["black_metal"], bevel=0)
box("CableTray_ToRacks", (0.2, 3.5, 0.02), (x0 + 0.38, 0.35, TRAY_Z), M["black_metal"], bevel=0.003)
box("CableTray_ToRacksR", (0.2, 3.5, 0.02), (x1 - 0.38, 0.35, TRAY_Z), M["black_metal"], bevel=0.003)
for k in range(9):
    box(f"CableTray_Hanger{k}", (0.01, 0.01, H - TRAY_Z), (x0 + 0.3 + k * 0.5, TRAY_Y, (H + TRAY_Z) / 2), M["black_metal"], bevel=0)


def cable(name, pts, mat, r=0.006):
    cv = bpy.data.curves.new(name, "CURVE")
    cv.dimensions, cv.bevel_depth, cv.bevel_resolution = "3D", r, 3
    sp = cv.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (*c, 1)
    sp.use_endpoint_u, sp.order_u = True, min(4, len(pts))
    cv.materials.append(mat)
    return link(bpy.data.objects.new(name, cv))


for k in range(7):  # bundle: rack tops → tray → down behind the monitors to the desk
    m = CABLE_MATS[k % 4] if k < 4 else M["black_plastic"]
    dx, dz = (k % 4) * 0.012, (k // 4) * 0.012
    cable(f"Cable_Run{k}", [(x0 + 0.38 + dx, 0.3 - k * 0.25, 2.05), (x0 + 0.38 + dx, -0.4, TRAY_Z + 0.02 + dz), (x0 + 0.5, TRAY_Y + dx, TRAY_Z + 0.02 + dz),
                            (dcx - 0.1 + dx, TRAY_Y + dx, TRAY_Z + 0.02 + dz), (dcx + dx, TRAY_Y + 0.2, 1.7), (dcx + dx, desk_y - 0.32, dt + 0.1), (dcx + 0.3 + dx * 3, desk_y - 0.3, dt + 0.01)], m)
for k, (sx, sy, ex, ey) in enumerate(((dcx + 1.62, -0.98, dcx + 1.12, desk_y - 0.25), (dcx - 1.12, -1.05, dcx - 0.6, desk_y - 0.3))):
    cable(f"Cable_PC{k}", [(sx, sy, 0.3), (sx, sy - 0.1, 0.02), ((sx + ex) / 2, sy - 0.15, 0.02), (ex, desk_y - 0.38, 0.5), (ex, ey, dt + 0.01)], M["black_plastic"], r=0.005)
for k in range(5):  # right rack row → tray
    dx = (k % 4) * 0.012
    cable(f"Cable_RunR{k}", [(x1 - 0.38 - dx, RACK_Y_RIGHT[k % 3], 2.05), (x1 - 0.38 - dx, 0.2, TRAY_Z + 0.02), (x1 - 0.5, TRAY_Y + dx, TRAY_Z + 0.02),
                             (0.6, TRAY_Y + dx, TRAY_Z + 0.02 + (k // 4) * 0.012)], CABLE_MATS[k % 4] if k < 4 else M["black_plastic"])

# ---------------------------------------------------------------- right wall: network cabinet, NOC display, shelves
cab = link(bpy.data.objects.new("NetCabinet", None))
# left wall, beside the racks (on the right wall it sat in front of the wide camera)
cab.location, cab.rotation_euler.z = (x0 + 0.22, 2.62, 1.75), math.radians(90)  # above the lab bench
box("NetCabinet_Body", (0.55, 0.4, 0.5), (0, 0, 0), M["black_metal"], bevel=0.006).parent = cab
box("NetCabinet_Glass", (0.5, 0.005, 0.44), (0, -0.203, 0), M["smoked_glass"], bevel=0).parent = cab
rack_switch(cab, "NetCabinet_Switch", -0.08, CABLE_MATS)
for k in range(3):
    box(f"NetCabinet_LED{k}", (0.004, 0.003, 0.004), (-0.18 + k * 0.02, -0.21, 0.18), M["led_green"], bevel=0).parent = cab

noc = link(bpy.data.objects.new("WallDisplay", None))
noc.location, noc.rotation_euler.z = (x1 - 0.04, -0.75, 1.75), math.radians(90)  # faces -X, into the room
box("WallDisplay_Bezel", (1.24, 0.03, 0.71), (0, -0.016, 0), M["black_plastic"], bevel=0.004).parent = noc
screen_plane("WallDisplay_Screen", 1.2, 0.675, (0, 0.002, 0), screen_material("M_WallDisplay", screen_image("IMG_WallDisplay", "topology", 81, 1920, 1080), 1.6)).parent = noc

# ops desk under the wall display (right wall): 2 monitors facing -X, Pi cluster, NAS, PC underneath
OPS = {"cx": x1 - 0.33, "cy": -0.85, "width": 1.3, "depth": 0.66}
ox, oy = OPS["cx"], OPS["cy"]
box("Ops_Top", (OPS["depth"], OPS["width"], 0.04), (ox, oy, dt - 0.02), M["wood"], bevel=0.006)
for sy in (-1, 1):
    box(f"Ops_Leg_{sy}", (OPS["depth"] - 0.1, 0.06, dt - 0.04), (ox, oy + sy * (OPS["width"] / 2 - 0.08), (dt - 0.04) / 2), M["black_metal"])
box("Ops_LED", (0.01, OPS["width"] - 0.1, 0.008), (ox - OPS["depth"] / 2 + 0.02, oy, dt - 0.045), M["led_orange"], bevel=0)
# yaw +90° turns the default +Y facing to -X (into the room)
monitor("Ops_MonitorA", 0.6, 0.34, (ox + 0.15, oy - 0.3, MONITOR["bottom"] + 0.17), yaw=math.radians(90 - 12), kind="htop", seed=95)
monitor("Ops_MonitorB", 0.6, 0.34, (ox + 0.15, oy + 0.32, MONITOR["bottom"] + 0.17), yaw=math.radians(90 + 12), kind="code", seed=96)
for k in range(4):  # Raspberry-Pi-style cluster
    box(f"PiCluster_Board{k}", (0.06, 0.09, 0.006), (ox - 0.12, oy + 0.02, dt + 0.01 + k * 0.03), principled(f"M_PiBoard{k}", (0.02, 0.18, 0.08), 0.5), bevel=0)
    box(f"PiCluster_LED{k}", (0.004, 0.004, 0.004), (ox - 0.152, oy + 0.04, dt + 0.015 + k * 0.03), M["led_green"] if k % 2 else M["led_orange"], bevel=0)
box("NAS_Body", (0.22, 0.2, 0.2), (ox + 0.1, oy + 0.02, dt + 0.1), M["black_plastic"], bevel=0.008)
for k in range(4):
    box(f"NAS_Bay{k}", (0.003, 0.04, 0.16), (ox - 0.012, oy - 0.05 + k * 0.045, dt + 0.1), principled("M_NASBay", (0.04, 0.04, 0.045), 0.5) if k == 0 else bpy.data.materials["M_NASBay"], bevel=0)
    box(f"NAS_LED{k}", (0.003, 0.006, 0.006), (ox - 0.013, oy - 0.05 + k * 0.045, dt + 0.185), M["led_blue"], bevel=0)
import_gltf(os.path.join(ph_dir, "models", "potted_plant_01", "potted_plant_01_1k.gltf"), (1.3, -1.5, 0), rot_z=1.3, scale=1.0)
point_light("L_OpsWarm", (ox - 0.2, oy, 1.3), 18, (1.0, 0.55, 0.25), 0.2)

# ---------------------------------------------------------------- neon "</>" sign above the racks
neon_curve = bpy.data.curves.new("Neon_Text", "FONT")
neon_curve.body = "</>"
neon_curve.size = 0.42
neon_curve.extrude = 0.006
neon_curve.align_x, neon_curve.align_y = "CENTER", "CENTER"
neon_curve.materials.append(principled("M_Neon", (0, 0, 0), 0.4, emit=(0.26, 0.85, 1.0), emit_strength=22))
neon = link(bpy.data.objects.new("Neon_Sign", neon_curve))
neon.location, neon.rotation_euler = (x0 + 0.02, 0.35, 2.42), (math.radians(90), 0, math.radians(-90))
point_light("L_Neon", (x0 + 0.25, 0.35, 2.42), 10, (0.26, 0.85, 1.0), 0.3)

# ---------------------------------------------------------------- lab bench at the end of the server row (left wall)
# more machines on the racks side: 2 monitors, a tower on the bench, a laptop, a PC under it, 2 tower servers
BENCH = {"cx": x0 + 0.38, "cy": 2.62, "width": 1.3, "depth": 0.66}
bx, by = BENCH["cx"], BENCH["cy"]
box("Bench_Top", (BENCH["depth"], BENCH["width"], 0.04), (bx, by, dt - 0.02), M["wood"], bevel=0.006)
for sy in (-1, 1):
    box(f"Bench_Leg_{sy}", (BENCH["depth"] - 0.1, 0.06, dt - 0.04), (bx, by + sy * (BENCH["width"] / 2 - 0.08), (dt - 0.04) / 2), M["black_metal"])
box("Bench_LED", (0.01, BENCH["width"] - 0.1, 0.008), (bx + BENCH["depth"] / 2 - 0.02, by, dt - 0.045), M["led_cyan"], bevel=0)
# screens face +X (into the room, toward the wide camera): yaw -90° turns the default +Y facing to +X
monitor("Bench_MonitorA", 0.6, 0.34, (bx - 0.15, by - 0.42, MONITOR["bottom"] + 0.17), yaw=math.radians(-90 + 12), kind="dashboard", seed=91)
monitor("Bench_MonitorB", 0.6, 0.34, (bx - 0.15, by + 0.18, MONITOR["bottom"] + 0.17), yaw=math.radians(-90 - 12), kind="terminal", seed=92)
# at the far end of the bench so it doesn't hide the two monitors
tower("Bench_PC", (bx - 0.08, by + 0.5, dt), math.radians(-90), glass_side=1)
lap2 = link(bpy.data.objects.new("Laptop2", None))
lap2.location, lap2.rotation_euler.z = (bx + 0.14, by - 0.12, dt), math.radians(-90 - 15)
box("Laptop2_Base", (0.33, 0.23, 0.016), (0, 0, 0.008), bpy.data.materials["M_Alu"], bevel=0.004).parent = lap2
lid2 = link(bpy.data.objects.new("Laptop2_Lid", None))
lid2.parent, lid2.location, lid2.rotation_euler.x = lap2, (0, -0.115, 0.016), math.radians(-12)
box("Laptop2_LidShell", (0.33, 0.008, 0.22), (0, -0.006, 0.11), bpy.data.materials["M_Alu2"], bevel=0.003).parent = lid2
screen_plane("Laptop2_Screen", 0.31, 0.2, (0, 0.0005, 0.112), screen_material("M_Laptop2Screen", screen_image("IMG_Laptop2", "code", 93, 1200, 780), 1.6)).parent = lid2
tower("Bench_UnderPC", (bx - 0.05, by + 0.42, 0), math.radians(-90), glass_side=1)


def tower_server(name, loc, yaw):
    """Pedestal (tower) server: hot-swap drive bays and status LEDs on the front (+Y)."""
    g = link(bpy.data.objects.new(name, None))
    g.location, g.rotation_euler.z = loc, yaw
    box(f"{name}_Body", (0.22, 0.62, 0.48), (0, 0, 0.24), M["black_metal"], bevel=0.006).parent = g
    box(f"{name}_Bezel", (0.2, 0.006, 0.44), (0, 0.313, 0.24), principled(f"M_{name}_Bezel", (0.035, 0.038, 0.045), 0.4, 0.5), bevel=0).parent = g
    for b in range(8):
        box(f"{name}_Bay{b}", (0.16, 0.004, 0.035), (0, 0.317, 0.08 + b * 0.044), M["black_plastic"], bevel=0).parent = g
        box(f"{name}_BayLED{b}", (0.006, 0.003, 0.006), (0.065, 0.319, 0.08 + b * 0.044), M["led_blue"] if rng.random() < 0.85 else M["led_green"], bevel=0).parent = g
    box(f"{name}_Power", (0.012, 0.003, 0.012), (-0.07, 0.319, 0.44), M["led_cyan"], bevel=0).parent = g
    return g


tower_server("TowerServer_A", (bx + 0.62, by + 0.55, 0), math.radians(-90))
tower_server("TowerServer_B", (bx + 0.62, by + 0.25, 0), math.radians(-90))
area_light("L_Bench", (bx + 0.6, by, 2.2), (bx, by, dt), 18, (0.35, 0.6, 1.0), size=0.8, size_y=1.2)


# ---------------------------------------------------------------- world: night city through the window
hdri = next(os.path.join(ph_dir, "hdri", f) for f in os.listdir(os.path.join(ph_dir, "hdri")))
world = bpy.data.worlds.new("NightCity")
scene.world = world
world.use_nodes = True
wn = world.node_tree
env = wn.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdri)
wmap = wn.nodes.new("ShaderNodeMapping")
wcoord = wn.nodes.new("ShaderNodeTexCoord")
# 290°: skyline across the water, no glaring street light (chosen from a 4-rotation test render)
HDRI_ROT = float(os.environ.get("DR_HDRI_ROT", "290"))
wmap.inputs["Rotation"].default_value = (0, 0, math.radians(HDRI_ROT))
wn.links.new(wcoord.outputs["Generated"], wmap.inputs["Vector"])
wn.links.new(wmap.outputs["Vector"], env.inputs["Vector"])
bg = wn.nodes["Background"]
bg.inputs["Strength"].default_value = 0.9
# Soft-compress the HDRI: out = c / (1 + c/k), max → k. A lit facade in it reaches luminance ~29,000;
# a hard clamp turned that whole area into a flat white rectangle in the window and in every glass
# reflection, while this keeps the dim city lights almost unchanged.
HDRI_KNEE = 1.0
sc = wn.nodes.new("ShaderNodeVectorMath")
sc.operation = "SCALE"
sc.inputs["Scale"].default_value = 1.0 / HDRI_KNEE
add1 = wn.nodes.new("ShaderNodeVectorMath")
add1.operation = "ADD"
add1.inputs[1].default_value = (1.0, 1.0, 1.0)
div = wn.nodes.new("ShaderNodeVectorMath")
div.operation = "DIVIDE"
wn.links.new(env.outputs["Color"], sc.inputs[0])
wn.links.new(sc.outputs["Vector"], add1.inputs[0])
wn.links.new(env.outputs["Color"], div.inputs[0])
wn.links.new(add1.outputs["Vector"], div.inputs[1])
wn.links.new(div.outputs["Vector"], bg.inputs["Color"])

# ---------------------------------------------------------------- key lighting (blue / orange)
area_light("L_Monitor_Fill", (dcx, MONITOR["y"] + 0.25, 1.1), (0, 0, 1.1), 35, (0.35, 0.65, 1.0), size=0.9, size_y=0.45)
area_light("L_OrangeRim", (1.4, 1.2, 2.2), (0, -0.05, 1.05), 160, (1.0, 0.45, 0.15), size=0.6)
area_light("L_BlueAmbient", (-1.2, 1.8, 2.7), (0, -0.6, 0.6), 70, (0.25, 0.4, 1.0), size=2.5)

# ---------------------------------------------------------------- character
with bpy.data.libraries.load(char_blend, link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n in ("RIG_Mixamo", "Char_Body")]
    dst.actions = list(src.actions)
col_char = bpy.data.collections.new("Character")
scene.collection.children.link(col_char)
for o in dst.objects:
    col_char.objects.link(o)
rig = bpy.data.objects["RIG_Mixamo"]
rig.location.z -= CHAR_DROP
act = bpy.data.actions.get("ACT_Typing")
if act:
    rig.animation_data_create()
    rig.animation_data.action = act
    if hasattr(rig.animation_data, "action_slot") and len(act.slots):
        rig.animation_data.action_slot = act.slots[0]
scene.frame_start, scene.frame_end = 1, 495

# ---------------------------------------------------------------- render setup (Cycles GPU)
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            break
    except TypeError:
        continue
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.0

cam_data = bpy.data.cameras.new("Cam_Shot3")
cam_data.lens = 28
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 2.8
cam = link(bpy.data.objects.new("Cam_Shot3", cam_data))
cam.location = (-1.15, 1.05, 1.62)
focus = link(bpy.data.objects.new("Cam_Shot3_Focus", None))
focus.location = (0.05, -0.15, 1.05)
cam_data.dof.focus_object = focus
cam.rotation_euler = (Vector((0.15, -0.95, 0.98)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

cam2_data = bpy.data.cameras.new("Cam_Establish")
cam2_data.lens = 14
cam2 = link(bpy.data.objects.new("Cam_Establish", cam2_data))
cam2.location = (0.95, 3.3, 2.0)
cam2.rotation_euler = (Vector((-0.15, -0.55, 0.95)) - cam2.location).to_track_quat("-Z", "Y").to_euler()

cam3_data = bpy.data.cameras.new("Cam_Racks")
cam3_data.lens = 32
cam3_data.dof.use_dof, cam3_data.dof.aperture_fstop = True, 2.2
cam3 = link(bpy.data.objects.new("Cam_Racks", cam3_data))
cam3.location = (-0.55, 0.95, 1.45)
rack_focus = link(bpy.data.objects.new("Cam_Racks_Focus", None))
rack_focus.location = (x0 + 0.05, -0.35, 1.15)
cam3_data.dof.focus_object = rack_focus
cam3.rotation_euler = (Vector((x0 + 0.1, -0.45, 1.05)) - cam3.location).to_track_quat("-Z", "Y").to_euler()

print("ROOM", {"objects": len(bpy.data.objects), "lights": sum(1 for o in bpy.data.objects if o.type == "LIGHT")})
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("SAVED", out_blend)
