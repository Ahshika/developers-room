"""Render one camera of the room scene at a frame.

Usage:
  blender --background <room.blend> --python tools/blender/render_shot.py -- <camera> <frame> <samples> <res%> <out.png>
"""
import sys

import bpy

cam_name, frame, samples, res, out = sys.argv[sys.argv.index("--") + 1:][:5]
scene = bpy.context.scene
scene.camera = bpy.data.objects[cam_name]
scene.frame_set(int(frame))
scene.cycles.samples = int(samples)
scene.render.resolution_percentage = int(res)
scene.render.filepath = out
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
bpy.ops.render.render(write_still=True)
print("WROTE", out)
