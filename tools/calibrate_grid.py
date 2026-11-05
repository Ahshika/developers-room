"""Calibrate the final grid frame of the story so it matches the portfolio background after Blender's
view transform (AgX changes emissive colours). Iterates: build story with DR_GRID_GAIN → render the
last frame → measure → correct the gain per channel in linear light.

Usage: python -I tools/calibrate_grid.py <aspect: landscape|portrait> [iterations]
Prints the final gain; pass it to build_story.py via DR_GRID_GAIN.
"""
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER = r"D:\Programs\Blender\blender.exe"
ASPECT = sys.argv[1] if len(sys.argv) > 1 else "landscape"
ITER = int(sys.argv[2]) if len(sys.argv) > 2 else 4
BG = (0x15, 0x1A, 0x20)
LINE = (140, 160, 180)


def to_lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def expected_mean():
    """Mean sRGB value of the CSS grid (bg + 20 px lines at 3.5 % + 100 px lines at 8.5 %), as the DOM shows it."""
    def px(major, minor):
        a = 0.085 if major else (0.035 if minor else 0.0)
        return tuple(b * (1 - a) + l * a for b, l in zip(BG, LINE))
    period = 100
    acc = [0.0, 0.0, 0.0]
    for y in range(period):
        for x in range(period):
            major = x % 100 == 0 or y % 100 == 0
            minor = x % 20 == 0 or y % 20 == 0
            for i, v in enumerate(px(major, minor)):
                acc[i] += v
    return tuple(v / period ** 2 for v in acc)


def run(args, env=None):
    r = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stdout[-2000:] + r.stderr[-2000:])
    return r.stdout


def measure(png):
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", png, "-vf", "crop=iw/2:ih/2,scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return tuple(out[:3])


target = expected_mean()
gain = [1.0, 1.0, 1.0]
tmp = tempfile.mkdtemp(prefix="dr_cal_")
for it in range(ITER):
    env = dict(os.environ, DR_ASPECT=ASPECT, DR_GRID_GAIN=",".join(f"{g:.5f}" for g in gain))
    run([BLENDER, "--background", "--factory-startup", "--python", "tools/blender/build_story.py", "--", "blender/work/room.blend",
         "blender/incoming/Pirate By P. Konstantinov@Sitting Idle.fbx", "blender/incoming/Pirate By P. Konstantinov@Pointing.fbx",
         "node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff", os.path.join(tmp, "cal.blend")], env)
    run([BLENDER, "--background", os.path.join(tmp, "cal.blend"), "--python", "tools/blender/render_frames.py", "--", tmp, "cycles", "32", "25", "655"])
    got = measure(os.path.join(tmp, "f_0655.png"))
    err = [g - t for g, t in zip(got, target)]
    print(f"iter {it}: gain={[round(g, 4) for g in gain]} measured={got} target={tuple(round(t, 1) for t in target)} error={[round(e, 1) for e in err]}", flush=True)
    if all(abs(e) <= 1.0 for e in err):
        break
    gain = [g * to_lin(t) / max(1e-6, to_lin(max(m, 0.5))) for g, t, m in zip(gain, target, got)]
print("GAIN", ",".join(f"{g:.5f}" for g in gain))
