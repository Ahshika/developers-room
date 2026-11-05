"""Animate the story on top of room.blend (STORYBOARD.md §4, pre-rendered version), 30 fps:

  0–4 s   camera enters from the room toward the desk        developer typing
  4–8 s   camera settles over his shoulder                   typing
  8 s     NEW VISITOR DETECTED on the main monitor           typing slows → idle
  9–11 s  he turns the chair around toward the camera        head follows the camera
  11–13 s looks at the visitor (the camera)
  13–15 s turns back toward the monitor and points           WELCOME TO MY WORLD. / I BUILD THINGS THAT MATTER.
  16–21 s camera pushes into the main monitor                screen cross-fades to the portfolio grid (#151a20)
  21–22 s hold on the grid (the web page then hands off to the real portfolio)

Usage:
  blender --background --factory-startup --python tools/blender/build_story.py -- \
      <room.blend> <idle.fbx> <pointing.fbx> <font.woff> <out.blend>
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

room_blend, idle_fbx, point_fbx, font_path, out_blend = (os.path.abspath(p) for p in sys.argv[sys.argv.index("--") + 1:][:5])
bpy.ops.wm.open_mainfile(filepath=room_blend)
scene = bpy.context.scene
FPS = 30
scene.render.fps = FPS
ASPECT = os.environ.get("DR_ASPECT", "landscape")
if ASPECT == "portrait":
    scene.render.resolution_x, scene.render.resolution_y = 1080, 1920
else:
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
# linear multiplier for the final grid emission so the frame matches #151a20 after the view transform
# (measured by tools/blender/calibrate_grid.py); "r,g,b"
GRID_GAIN = tuple(float(v) for v in os.environ.get("DR_GRID_GAIN", "1,1,1").split(","))


def F(seconds):
    return int(round(seconds * FPS)) + 1


# every beat in seconds (single source of timing for the video)
T = {"end": 22.0, "notify": 8.0, "stop_typing": 8.4, "turn": 9.2, "turn_end": 10.8, "look": 10.4, "look_end": 13.0,
     "turn_back": 13.0, "turn_back_end": 14.0, "point": 13.4, "point_end": 16.4, "msg1": 14.2, "msg2": 15.4,
     "push": 16.6, "grid": 19.3, "grid_end": 20.3}
scene.frame_start, scene.frame_end = 1, F(T["end"])

rig = bpy.data.objects["RIG_Mixamo"]
PREFIX = rig.data.bones[0].name.split(":")[0] + ":"


# ---------------------------------------------------------------- actions (Mixamo, renamed to this rig)
def action_fcurves(act):
    if hasattr(act, "layers") and len(act.layers):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    yield from bag.fcurves
    elif hasattr(act, "fcurves"):
        yield from act.fcurves


def import_action(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    act = None
    for o in [o for o in bpy.data.objects if o not in before]:
        if o.animation_data and o.animation_data.action:
            act = o.animation_data.action
        bpy.data.objects.remove(o)
    act.name = name
    act.use_fake_user = True
    for fc in action_fcurves(act):
        if '"mixamorig:' in fc.data_path:
            fc.data_path = fc.data_path.replace('"mixamorig:', f'"{PREFIX}')
    return act


typing = bpy.data.actions["ACT_Typing"]
idle = import_action(idle_fbx, "ACT_SittingIdle")
pointing = import_action(point_fbx, "ACT_PointingStanding")

# seated pointing = the sitting idle for the whole body, with the right arm from the pointing take
RIGHT_ARM = ("RightShoulder", "RightArm", "RightForeArm", "RightHand")
seated_point = idle.copy()
seated_point.name = "ACT_SeatedPoint"
seated_point.use_fake_user = True


def bone_of(fc):
    return fc.data_path.split('"')[1].replace(PREFIX, "") if '"' in fc.data_path else ""


src = {(fc.data_path, fc.array_index): fc for fc in action_fcurves(pointing) if bone_of(fc).startswith(RIGHT_ARM)}
replaced = 0
for fc in action_fcurves(seated_point):
    key = (fc.data_path, fc.array_index)
    if key in src:
        s = src[key]
        fc.keyframe_points.clear()
        fc.keyframe_points.add(len(s.keyframe_points))
        for kd, ks in zip(fc.keyframe_points, s.keyframe_points):
            kd.co, kd.handle_left, kd.handle_right, kd.interpolation = ks.co, ks.handle_left, ks.handle_right, ks.interpolation
        replaced += 1
print("ACTIONS", {"seated_point_curves_from_pointing": replaced})

# NLA: typing → idle → seated point → idle, with cross-fades (no snapping between clips)
rig.animation_data.action = None
tracks = rig.animation_data.nla_tracks


def strip(track_name, act, start, end, blend_in=0, blend_out=0, repeat_to_fill=True):
    tr = tracks.new()
    tr.name = track_name
    st = tr.strips.new(act.name, int(start), act)
    length = act.frame_range[1] - act.frame_range[0]
    if repeat_to_fill:
        st.repeat = max(1.0, (end - start) / max(1.0, length))
    st.frame_end = int(end)
    st.blend_in, st.blend_out = blend_in, blend_out
    st.extrapolation = "NOTHING"
    st.blend_type = "REPLACE"
    return st


strip("Typing", typing, 1, F(T["stop_typing"]) + 18)
strip("Idle", idle, F(T["stop_typing"]), F(T["end"]), blend_in=18)
strip("Point", seated_point, F(T["point"]), F(T["point_end"]), blend_in=14, blend_out=18)

# ---------------------------------------------------------------- chair pivot: the chair turns, the body turns with it
chair = bpy.data.objects["Chair"]
pivot = bpy.data.objects.new("Chair_Pivot", None)
scene.collection.objects.link(pivot)
pivot.location = (0, 0.06, 0)  # gas-lift axis under the seat
for o in (chair, rig):
    mw = o.matrix_world.copy()
    o.parent = pivot
    o.matrix_world = mw

cam = bpy.data.objects.new("Cam_Story", bpy.data.cameras.new("Cam_Story"))
scene.collection.objects.link(cam)
cam.data.lens = 26
cam.data.dof.use_dof, cam.data.dof.aperture_fstop = True, 2.8
target = bpy.data.objects.new("Cam_Story_Target", None)
scene.collection.objects.link(target)
tt = cam.constraints.new("TRACK_TO")
tt.target, tt.track_axis, tt.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
cam.data.dof.focus_object = target
scene.camera = cam

# face the visitor: angle that turns his forward (-Y) toward the over-shoulder camera position
VISITOR = Vector((-1.15, 1.05, 1.5))
to_cam = VISITOR - pivot.location
TURN = math.atan2(-to_cam.x, to_cam.y) + math.pi  # rotation that maps (0,-1) onto the camera direction
TURN = (TURN + math.pi) % (2 * math.pi) - math.pi
BACK = math.radians(-28)


def key_rot(obj, frame, angle):
    obj.rotation_euler.z = angle
    obj.keyframe_insert("rotation_euler", index=2, frame=frame)


key_rot(pivot, 1, 0)
key_rot(pivot, F(T["turn"]), 0)
key_rot(pivot, F(T["turn_end"]), TURN)
key_rot(pivot, F(T["turn_back"]), TURN)
key_rot(pivot, F(T["turn_back_end"]), BACK)
key_rot(pivot, F(T["end"]), BACK)

# gaze: the head follows the camera while he faces the visitor
head = rig.pose.bones[f"{PREFIX}Head"]
look = head.constraints.new("DAMPED_TRACK")
look.target, look.track_axis = cam, "TRACK_Z"
for frame, infl in ((1, 0), (F(T["look"]), 0), (F(T["look"]) + 12, 0.75), (F(T["look_end"]), 0.75), (F(T["look_end"]) + 15, 0)):
    look.influence = infl
    look.keyframe_insert("influence", frame=frame)

# ---------------------------------------------------------------- camera path (location + aim keyframes, smooth bezier)
main = bpy.data.objects["Monitor_Main"]
screen_c = main.matrix_world.translation.copy()
SCREEN_W, SCREEN_H = 0.71, 0.40
half_long = math.atan(cam.data.sensor_width / (2 * cam.data.lens))  # half FOV across the longer side
rx, ry = scene.render.resolution_x, scene.render.resolution_y
if rx >= ry:  # landscape: height must fit inside the 0.40 m screen
    half_v = math.atan(math.tan(half_long) * ry / rx)
    cover_d = (SCREEN_H / 2) / math.tan(half_v) * 0.96
else:  # portrait: the vertical is the long side
    cover_d = (SCREEN_H / 2) / math.tan(half_long) * 0.96
# He sits ~0.8 m in front of the main screen, so the camera must never pass *through* him:
# the message beat is framed from his right side (monitor visible beside him), and the push enters
# the gap between his face and the screen from that side. (First cut went through his head.)
sx, sy, sz = screen_c.x, screen_c.y, screen_c.z
CAM_KEYS = [  # (seconds, camera location, aim point)
    (0.0, (1.05, 3.15, 1.85), (-0.1, -0.6, 1.0)),
    (4.0, (0.15, 1.85, 1.6), (0.05, -0.7, 1.05)),
    (7.6, (-1.05, 1.0, 1.55), (0.1, -0.9, 1.0)),
    (9.2, (-0.72, 0.62, 1.45), (sx, sy, sz)),            # lean in to read NEW VISITOR DETECTED
    (10.8, (-0.95, 0.95, 1.4), (-0.05, -0.05, 1.05)),    # pull back as he turns to face the visitor
    (12.9, (-0.85, 0.8, 1.38), (-0.05, -0.1, 1.08)),
    (13.45, (0.05, 1.2, 1.9), (0.0, -0.45, 1.08)),        # up and over the chair back (it went through it)
    (14.0, (0.95, 0.35, 1.36), (0.0, -0.5, 1.08)),       # his right side: him + the monitor he points at
    (16.6, (0.85, 0.15, 1.3), (0.02, -0.62, 1.1)),
    (18.8, (0.5, sy + 0.52, sz + 0.05), (sx, sy, sz)),  # into the gap between his face and the screen
    (20.0, (sx, sy + cover_d, sz), (sx, sy, sz)),
    (22.0, (sx, sy + cover_d, sz), (sx, sy, sz)),
]
for sec, loc, aim in CAM_KEYS:
    cam.location = loc
    cam.keyframe_insert("location", frame=F(sec))
    target.location = aim
    target.keyframe_insert("location", frame=F(sec))
for o in (cam, target):
    act = o.animation_data.action
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation, kp.easing = "BEZIER", "AUTO"
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"

# ---------------------------------------------------------------- monitor overlays: notification + message, grid at the end
font = bpy.data.fonts.load(font_path)


def fade_material(name, color, strength):
    """Emission mixed with transparency; 'Fade' value (0..1) is keyframed."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    mix.inputs["Fac"].default_value = 0
    return m, mix.inputs["Fac"]


def key_fade(socket, frames_values):
    for frame, v in frames_values:
        socket.default_value = v
        socket.keyframe_insert("default_value", frame=frame)


def text_obj(name, body, size, local, mat, align="CENTER"):
    cv = bpy.data.curves.new(name, "FONT")
    cv.body, cv.font, cv.size = body, font, size
    cv.align_x, cv.align_y = align, "CENTER"
    cv.space_character = 1.08
    cv.materials.append(mat)
    o = bpy.data.objects.new(name, cv)
    scene.collection.objects.link(o)
    o.parent = main
    o.location = local
    o.rotation_euler = (math.pi / 2, 0, math.pi)  # faces +Y (the developer), reads left-to-right from the front
    return o


def plane_obj(name, w, h, local, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)], [], [(0, 3, 2, 1)])
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    o.parent = main
    o.location = local
    return o


# Every overlay layer gets its own depth in front of the screen (mm apart). Coplanar layers made Cycles
# skip the message text behind the (transparent) notification frame, cutting words off at an angle.
Y = 0.0045
DEPTH = {"backdrop": 0.0035, "edge": 0.0045, "card": 0.0052, "ntext": 0.0060, "dot": 0.0060, "msg": 0.0075, "grid": 0.0095}
f_notify = F(T["notify"])
card_m, card_f = fade_material("M_NotifyCard", (0.02, 0.05, 0.11), 1.0)
edge_m, edge_f = fade_material("M_NotifyEdge", (0.26, 0.85, 1.0), 4.0)
ntext_m, ntext_f = fade_material("M_NotifyText", (0.91, 0.93, 0.96), 3.0)
dot_m, dot_f = fade_material("M_NotifyDot", (1.0, 0.54, 0.21), 5.0)
n_edge = plane_obj("Notify_Edge", 0.62, 0.115, (0, DEPTH["edge"], 0.0), edge_m)
n_card = plane_obj("Notify_Card", 0.61, 0.105, (0, DEPTH["card"], 0.0), card_m)
n_text = text_obj("Notify_Text", "NEW VISITOR DETECTED", 0.036, (0.025, DEPTH["ntext"], 0.0), ntext_m)
bpy.ops.mesh.primitive_circle_add(vertices=24, radius=0.009, fill_type="NGON", location=(0, 0, 0))
dot = bpy.context.object
dot.name = "Notify_Dot"
dot.data.materials.append(dot_m)
dot.parent, dot.location, dot.rotation_euler = main, (0.25, DEPTH["dot"], 0.0), (math.pi / 2, 0, math.pi)
notify_keys = [(1, 0), (f_notify, 0), (f_notify + 8, 1), (F(T["point"]), 1), (F(T["point"]) + 10, 0)]
for sock in (card_f, edge_f, ntext_f, dot_f):
    key_fade(sock, notify_keys)
key_fade(edge_f, [(f_notify + 12, 1.0), (f_notify + 16, 0.6), (f_notify + 20, 1.0)])  # one restrained pulse

m1_m, m1_f = fade_material("M_Msg1", (0.91, 0.93, 0.96), 3.2)
m2_m, m2_f = fade_material("M_Msg2", (0.26, 0.85, 1.0), 3.6)
back_m, back_f = fade_material("M_MsgBack", (0.004, 0.006, 0.012), 1.0)
m_back = plane_obj("Msg_Backdrop", 0.70, 0.39, (0, DEPTH["backdrop"], 0), back_m)
m_l1 = text_obj("Msg_Line1", "WELCOME TO MY WORLD.", 0.05, (0, DEPTH["msg"], 0.045), m1_m)
m_l2 = text_obj("Msg_Line2", "I BUILD THINGS THAT MATTER.", 0.04, (0, DEPTH["msg"], -0.04), m2_m)
key_fade(back_f, [(1, 0), (F(T["msg1"]) - 6, 0), (F(T["msg1"]) + 6, 0.92), (F(T["grid"]), 0.92), (F(T["grid_end"]), 0)])
key_fade(m1_f, [(1, 0), (F(T["msg1"]), 0), (F(T["msg1"]) + 18, 1), (F(T["grid"]), 1), (F(T["grid_end"]) - 10, 0)])
key_fade(m2_f, [(1, 0), (F(T["msg2"]), 0), (F(T["msg2"]) + 18, 1), (F(T["grid"]), 1), (F(T["grid_end"]) - 10, 0)])

# portfolio grid (#151a20 + 100 px / 20 px lines, as on https://ahshika.github.io/) covers the screen at the end
GW, GH = 1920, 1080
g = np.zeros((GH, GW, 4), dtype=np.float32)
bgc = np.array([0x15, 0x1a, 0x20]) / 255.0
g[..., :3], g[..., 3] = bgc, 1
for step, alpha in ((20, 0.035), (100, 0.085)):
    line_c = bgc * (1 - alpha) + np.array([140, 160, 180]) / 255.0 * alpha
    g[::step, :, :3] = line_c
    g[:, ::step, :3] = line_c
lin = np.where(g[..., :3] <= 0.04045, g[..., :3] / 12.92, ((g[..., :3] + 0.055) / 1.055) ** 2.4)  # sRGB → linear for emission
g[..., :3] = lin
grid_img = bpy.data.images.new("IMG_PortfolioGrid", GW, GH, alpha=False, float_buffer=True)
grid_img.pixels.foreach_set(np.flipud(g).ravel())
grid_img.pack()
gm = bpy.data.materials.new("M_GridScreen")
gm.use_nodes = True
nt = gm.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
mix = nt.nodes.new("ShaderNodeMixShader")
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
em = nt.nodes.new("ShaderNodeEmission")
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = grid_img
em.inputs["Strength"].default_value = 1.0
gain = nt.nodes.new("ShaderNodeMix")
gain.data_type, gain.blend_type = "RGBA", "MULTIPLY"
gain.inputs["Factor"].default_value = 1.0
gain.inputs[7].default_value = (*GRID_GAIN, 1)
nt.links.new(tex.outputs["Color"], gain.inputs[6])
nt.links.new(gain.outputs[2], em.inputs["Color"])
nt.links.new(tr.outputs[0], mix.inputs[1])
nt.links.new(em.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out.inputs["Surface"])
gplane = plane_obj("Grid_Screen", 0.71, 0.40, (0, DEPTH["grid"], 0), gm)
uv = gplane.data.uv_layers.new(name="UVMap")
for loop, (u, v) in zip(gplane.data.loops, ((1, 0), (1, 1), (0, 1), (0, 0))):
    uv.data[loop.index].uv = (u, v)
key_fade(mix.inputs["Fac"], [(1, 0), (F(T["grid"]), 0), (F(T["grid_end"]), 1)])

# overlays exist only while they are on screen (no invisible layers in the way the rest of the time)
def key_visible(objs, on_frame, off_frame):
    for o in objs:
        for frame, hidden in ((1, True), (on_frame, False), (off_frame, True)):
            o.hide_render = hidden
            o.keyframe_insert("hide_render", frame=frame)


key_visible((n_edge, n_card, n_text, dot), f_notify - 1, F(T["point"]) + 12)
key_visible((m_back, m_l1, m_l2), F(T["msg1"]) - 8, F(T["grid_end"]) + 2)
key_visible((gplane,), F(T["grid"]) - 1, F(T["end"]) + 1)

# keyboard sound sync marker for the web side (not rendered)
scene["dr_beats_seconds"] = {k: v for k, v in T.items()}

bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("STORY", {"aspect": ASPECT, "grid_gain": GRID_GAIN, "frames": scene.frame_end, "turn_deg": round(math.degrees(TURN), 1), "cover_distance_m": round(cover_d, 3), "saved": out_blend})
