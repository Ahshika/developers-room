"""Print a structural summary of imported assets (meshes, armatures, actions, materials).

Usage:
  blender --background --factory-startup --python tools/blender/inspect_assets.py -- <file.fbx|file.gltf> [...]
"""
import sys

import bpy

files = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def summarize(path: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    print(f"\n===== {path}")
    for ob in bpy.data.objects:
        dims = tuple(round(d, 3) for d in ob.dimensions)
        line = f"  {ob.type:9} {ob.name[:40]:40} dims={dims}"
        if ob.type == "MESH":
            me = ob.data
            mats = [m.name[:24] for m in me.materials if m]
            line += f" verts={len(me.vertices)} faces={len(me.polygons)} mats={mats} vgroups={len(ob.vertex_groups)}"
            mod = [m.type for m in ob.modifiers]
            if mod:
                line += f" mods={mod}"
        if ob.type == "ARMATURE":
            bones = [b.name for b in ob.data.bones]
            line += f" bones={len(bones)} first={bones[:6]}"
        print(line)
    for act in bpy.data.actions:
        print(f"  ACTION {act.name[:50]:50} frames={tuple(round(f) for f in act.frame_range)}")
    for img in bpy.data.images:
        print(f"  IMAGE {img.name[:50]:50} size={tuple(img.size)}")


for f in files:
    try:
        summarize(f)
    except Exception as exc:  # report and continue with the next file
        print(f"FAILED {f}: {exc}")
