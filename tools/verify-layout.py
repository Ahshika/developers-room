"""Sanity-check the geometry in docs/STORYBOARD.md (Phase 1, pure math, no 3D engine).

Checks:
  1. chair yaw needed to face the visitor camera
  2. framing rules (hfov -> clamped vfov) per viewport
  3. message shot: monitor fraction + rendered text size, with the portrait dolly-in rule
  4. cover distance per viewport (camera never crosses the screen plane)
  5. approach path clearance vs the seated developer and the monitor bezel

Run: python tools/verify-layout.py   (exit code 1 if any check fails)
"""
import math
import sys

# ---- values copied from STORYBOARD.md (kept in one block so drift is obvious) ----
SCREEN_CENTER = (0.0, 1.12, -2.55)
SCREEN_W, SCREEN_H = 0.70, 0.39
CHAIR_PIVOT_XZ = (-0.30, -1.50)
VFOV_MIN, VFOV_MAX = 24.0, 72.0
ROOM_X, ROOM_ZMAX = 3.3, 2.8
COVER_MARGIN = 0.98
NEAR = 0.05
SHOTS = {
    "reaction": ((1.00, 1.40, 0.40), (-0.30, 1.15, -1.50), 50),
    "message": ((0.75, 1.35, -0.15), (-0.05, 1.12, -2.30), 44),
    "approachMid": ((0.36, 1.22, -1.30), SCREEN_CENTER, 42),
}
COVER_HFOV = 60
# seated developer facing the desk (chair yaw 0) as a capsule: hips -> head, radius covers shoulders
DEV_CAPSULE = ((-0.30, 0.60, -1.50), (-0.30, 1.22, -1.62), 0.28)
MIN_CLEARANCE = 0.10          # metres between camera and capsule surface
TEXT_CAP_FRAC = 0.13          # cap height as a fraction of screen height (storyboard §7)
MIN_TEXT_PX = 16              # hard floor
TARGET_TEXT_PX = 20           # message shot dollies in along its view axis until text reaches this
VIEWPORTS = {"phone portrait 390x844": (390, 844), "phone landscape 844x390": (844, 390),
             "desktop 1920x1080": (1920, 1080), "ultrawide 2560x1080": (2560, 1080)}

failures = []


def check(ok, msg):
    print(("  PASS " if ok else "  FAIL ") + msg)
    if not ok:
        failures.append(msg)


def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def add(a, b): return tuple(x + y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def norm(a): return math.sqrt(dot(a, a))
def unit(a): return mul(a, 1 / norm(a))


def vfov_for(hfov_deg, aspect):
    v = math.degrees(2 * math.atan(math.tan(math.radians(hfov_deg) / 2) / aspect))
    return min(max(v, VFOV_MIN), VFOV_MAX)


def hfov_from_v(vfov_deg, aspect):
    return math.degrees(2 * math.atan(math.tan(math.radians(vfov_deg) / 2) * aspect))


def seg_point_dist(p, a, b):
    ab, ap = sub(b, a), sub(p, a)
    t = max(0.0, min(1.0, dot(ap, ab) / dot(ab, ab)))
    return norm(sub(p, add(a, mul(ab, t))))


def capsule_clearance(p):
    a, b, r = DEV_CAPSULE
    return seg_point_dist(p, a, b) - r


def catmull_rom(p0, p1, p2, p3, t, alpha=0.5):
    """Centripetal Catmull-Rom between p1 and p2."""
    def tj(ti, pi, pj): return ti + max(norm(sub(pj, pi)), 1e-6) ** alpha
    t0 = 0.0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
    u = t1 + (t2 - t1) * t
    def lerp(pa, pb, ta, tb): return add(mul(pa, (tb - u) / (tb - ta)), mul(pb, (u - ta) / (tb - ta)))
    a1 = lerp(p0, p1, t0, t1); a2 = lerp(p1, p2, t1, t2); a3 = lerp(p2, p3, t2, t3)
    b1 = lerp(a1, a2, t0, t2); b2 = lerp(a2, a3, t1, t3)
    return lerp(b1, b2, t1, t2)


def cover_distance(aspect):
    vfov = vfov_for(COVER_HFOV, aspect)
    return min(SCREEN_H, SCREEN_W / aspect) / (2 * math.tan(math.radians(vfov) / 2)) * COVER_MARGIN, vfov


print("1. Chair yaw to face the visitor (reaction shot camera)")
cam = SHOTS["reaction"][0]
dx, dz = cam[0] - CHAIR_PIVOT_XZ[0], cam[2] - CHAIR_PIVOT_XZ[1]
# forward at yaw y (0 = -Z, CCW positive from above) is (-sin y, -cos y)
yaw = math.degrees(math.atan2(-dx, -dz))
print(f"  chair yaw = {yaw:.1f} deg")
check(abs(yaw - (-146)) < 2.0, "storyboard value -146 deg matches within 2 deg")

print("2/3. Message shot readability per viewport")
msg_pos, msg_tgt, msg_h = SHOTS["message"]
view_dir = unit(sub(msg_tgt, msg_pos))
for name, (w, h) in VIEWPORTS.items():
    aspect = w / h
    vfov = vfov_for(msg_h, aspect)
    hfov = hfov_from_v(vfov, aspect)
    dist = norm(sub(SCREEN_CENTER, msg_pos))
    pos = msg_pos

    def text_px_at(d):
        return TEXT_CAP_FRAC * SCREEN_H / (2 * d * math.tan(math.radians(vfov) / 2)) * h

    if text_px_at(dist) < TARGET_TEXT_PX:  # dolly in along the view direction until readable
        need = TEXT_CAP_FRAC * SCREEN_H * h / (TARGET_TEXT_PX * 2 * math.tan(math.radians(vfov) / 2))
        pos = add(msg_pos, mul(view_dir, dist - need))
        dist = need
    text_px = text_px_at(dist)
    frac = SCREEN_W / (2 * dist * math.tan(math.radians(hfov) / 2))
    clear = capsule_clearance(pos)
    print(f"  {name}: vfov {vfov:.1f}, monitor {frac*100:.0f}% of width, cam dist {dist:.2f} m, "
          f"text cap {text_px:.1f}px, clearance {clear:.2f} m")
    check(text_px >= MIN_TEXT_PX, f"{name}: message text >= {MIN_TEXT_PX}px")
    check(frac <= 1.0, f"{name}: whole monitor width in frame")
    check(clear >= MIN_CLEARANCE, f"{name}: message camera clear of the developer")

print("4. Cover distance (camera stops before the screen plane)")
for name, (w, h) in VIEWPORTS.items():
    d, vfov = cover_distance(w / h)
    vis_h = 2 * d * math.tan(math.radians(vfov) / 2)
    vis_w = vis_h * w / h
    print(f"  {name}: d = {d:.3f} m, vfov {vfov:.1f}, visible {vis_w:.3f} x {vis_h:.3f} m")
    check(vis_w <= SCREEN_W and vis_h <= SCREEN_H, f"{name}: screen covers the whole viewport")
    check(d > NEAR + 0.025, f"{name}: camera stays in front of the bezel/near plane")

print("5. Approach path clearance (message -> approachMid -> cover), worst-case viewport")
worst = min(cover_distance(w / h)[0] for w, h in VIEWPORTS.values())
cover = (SCREEN_CENTER[0], SCREEN_CENTER[1], SCREEN_CENTER[2] + worst)
pts = [SHOTS["reaction"][0], SHOTS["message"][0], SHOTS["approachMid"][0], cover]
ghost_end = add(cover, sub(cover, pts[2]))
ctrl = pts + [ghost_end]
min_clear, min_z = 9.0, 9.0
for seg in range(1, 3):
    for i in range(101):
        p = catmull_rom(ctrl[seg - 1], ctrl[seg], ctrl[seg + 1], ctrl[seg + 2], i / 100)
        min_clear = min(min_clear, capsule_clearance(p))
        min_z = min(min_z, p[2])
        if abs(p[0]) > ROOM_X or p[2] > ROOM_ZMAX:
            failures.append(f"path leaves room at {p}")
print(f"  min clearance to developer = {min_clear:.2f} m, closest z = {min_z:.3f} (screen z = {SCREEN_CENTER[2]})")
check(min_clear >= MIN_CLEARANCE, f"path keeps >= {MIN_CLEARANCE} m from the developer")
check(min_z > SCREEN_CENTER[2] + NEAR, "path never crosses the screen plane")

print("\nRESULT:", "ALL CHECKS PASSED" if not failures else f"{len(failures)} FAILED")
sys.exit(1 if failures else 0)
