"""Render selected frames (or a frame range) of the story with the scene camera.

Usage:
  blender --background <story.blend> --python tools/blender/render_frames.py -- <outDir> <engine: eevee|cycles> <samples> <res%> <frames: 1,50,90 | 1-661> [resX resY]
"""
import os
import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, engine, samples, res, frames = args[:5]
# absolute: Blender resolves a relative render path against the drive root, not the working directory
out_dir = os.path.abspath(out_dir)
os.makedirs(out_dir, exist_ok=True)
scene = bpy.context.scene
if len(args) >= 7:
    scene.render.resolution_x, scene.render.resolution_y = int(args[5]), int(args[6])
scene.render.resolution_percentage = int(res)
if engine == "eevee":
    ids = {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in ids else "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = int(samples)
else:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(samples)
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

if "-" in frames:
    a, b = (int(x) for x in frames.split("-"))
    scene.frame_start, scene.frame_end = a, b
    scene.render.filepath = os.path.join(out_dir, "f_")
    scene.render.image_settings.file_format = "PNG"
    # resumable: frames already on disk are skipped, so an interrupted multi-hour render can restart
    scene.render.use_overwrite = False
    scene.render.use_placeholder = True
    bpy.ops.render.render(animation=True)
    print("RENDERED_RANGE", a, b)
else:
    for f in (int(x) for x in frames.split(",")):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(out_dir, f"f_{f:04d}.png")
        bpy.ops.render.render(write_still=True)
        print("WROTE", scene.render.filepath)
