"""Build the developer character from the owner's Mixamo download (Ch06) *as is* — no added clothing —
and drive it with the Mixamo Typing action. Saves a reusable .blend (ASSET_INVENTORY C01/C02).

Only import corrections are made:
  * Metallic 0.5 → 0: the FBX importer sets it on every material; skin and fabric are not metal
    (it made the clothes look like shiny plastic)
  * the action's bone names "mixamorig:" are mapped to this character's "mixamorig9:"

Usage:
  blender --background --factory-startup --python tools/blender/build_character_ch06.py -- \
      <character.fbx> <typing.fbx> <out.blend>
"""
import sys

import bpy

char_path, typing_path, out_blend = sys.argv[sys.argv.index("--") + 1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

bpy.ops.import_scene.fbx(filepath=char_path)
rig = next(o for o in scene.objects if o.type == "ARMATURE")
body = next(o for o in scene.objects if o.type == "MESH")
rig.name, body.name = "RIG_Mixamo", "Char_Body"
prefix = rig.data.bones[0].name.split(":")[0] + ":"

for mat in body.data.materials:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat and mat.use_nodes else None
    if bsdf:
        for link in list(bsdf.inputs["Metallic"].links):
            mat.node_tree.links.remove(link)
        bsdf.inputs["Metallic"].default_value = 0.0
        # Mixamo "nonPBR" ships *_Glossiness.png maps; the importer wires them straight into
        # Roughness (median 0.09 → mirror-like clothes). Roughness = 1 − glossiness.
        rl = bsdf.inputs["Roughness"].links
        inverted = False
        if rl and "gloss" in (getattr(rl[0].from_node, "image", None) or bpy.types.Image).name.lower() + \
                (rl[0].from_node.image.filepath.lower() if getattr(rl[0].from_node, "image", None) else ""):
            src = rl[0].from_socket
            inv = mat.node_tree.nodes.new("ShaderNodeMath")
            inv.operation = "SUBTRACT"
            inv.inputs[0].default_value = 1.0
            mat.node_tree.links.new(src, inv.inputs[1])
            mat.node_tree.links.new(inv.outputs[0], bsdf.inputs["Roughness"])
            inverted = True
        print("MAT", mat.name, "metallic -> 0", "| glossiness inverted to roughness" if inverted else "")

# Typing action from the Mixamo download, renamed to this rig's bone prefix
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=typing_path)
typing = None
for o in [o for o in bpy.data.objects if o not in before]:
    if o.animation_data and o.animation_data.action:
        typing = o.animation_data.action
    bpy.data.objects.remove(o)
if typing is None:
    raise SystemExit("no action found in " + typing_path)
typing.name = "ACT_Typing"
typing.use_fake_user = True


def action_fcurves(act):
    """F-curves of an action in both the legacy and the slotted (Blender 4.4+) layout."""
    if hasattr(act, "layers") and len(act.layers):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    yield from bag.fcurves
    elif hasattr(act, "fcurves"):
        yield from act.fcurves


renamed = missing = 0
for fc in action_fcurves(typing):
    if '"mixamorig:' in fc.data_path and prefix != "mixamorig:":
        fc.data_path = fc.data_path.replace('"mixamorig:', f'"{prefix}')
        renamed += 1
    bone = fc.data_path.split('"')[1] if '"' in fc.data_path else ""
    if bone and bone not in rig.pose.bones:
        missing += 1
rig.animation_data_create()
rig.animation_data.action = typing
if hasattr(rig.animation_data, "action_slot") and len(typing.slots):
    rig.animation_data.action_slot = typing.slots[0]
scene.frame_start, scene.frame_end = (int(f) for f in typing.frame_range)

bpy.context.view_layer.update()
pts = [body.matrix_world @ v.co for v in body.data.vertices]
print("BUILT", {"prefix": prefix, "renamed_fcurves": renamed, "fcurves_for_missing_bones": missing,
               "frames": (scene.frame_start, scene.frame_end), "height_m": round(max(p.z for p in pts) - min(p.z for p in pts), 3)})
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("SAVED", out_blend)
