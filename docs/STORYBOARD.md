# THE DEVELOPER'S ROOM — Storyboard, Layout, Camera, Animation, Lighting

All numbers are the **starting design**. They will live in `experience.config.ts` and be tuned in Phases 2–4. Geometry numbers are checked by `tools/verify-layout.py` (see §8).

---

## 1. Coordinate system and units

- Three.js convention: **right-handed, +Y up, 1 unit = 1 metre**.
- Origin is the floor at the centre of the room.
- **−Z is "into the room"** (toward the workstation); the visitor and camera begin near **+Z**.
- **+X is the visitor's right** when looking down −Z.
- Rotations are yaw about +Y, in degrees, and **0° = facing −Z**. Positive is counter-clockwise seen from above.
- Blender exports use glTF's +Y up, so a Blender metre maps to a scene metre and no scaling is needed at runtime.

## 2. Room layout

Room interior: **7.0 m wide (X −3.5…3.5) × 6.0 m deep (Z −3.0…3.0) × 3.0 m high**.

```
                         BACK WALL  z = -3.0   (acoustic panels, LED strip at 2.6 m)
   ┌───────────────────────────────────────────────────────────────┐
   │ W                 ┌─sec─┐┌────MAIN────┐┌─sec─┐            ┌──┐ │
   │ I                 └─────┘└────────────┘└─────┘            │R1│ │  server racks
   │ N                 ════════ DESK (z −2.8…−2.0) ═══         │  │ │  on right wall
   │ D                        [kbd]  [mouse]                   ├──┤ │
   │ O                         (CHAIR)  ← developer            │R2│ │
   │ W                                                         └──┘ │
   │                                                                │
   │ glass                                                          │
   │ x=-3.5                                                         │
   │                                                    ◎ camera    │
   └───────────────────────────────────────────────────────────────┘
                         FRONT  z = +3.0 (never seen)
```

| Element | Position (x, y, z) | Size / notes |
|---|---|---|
| Desk top | centre (0, 0.75, −2.40) | 2.2 × 0.04 × 0.80 m; front edge z = −2.00 |
| **Main monitor** screen | centre **(0, 1.12, −2.55)**, yaw 0° (faces +Z) | 32″ 16:9, visible screen **0.70 × 0.39 m**; bezel 8 mm; depth 25 mm |
| Secondary monitors | (±0.80, 1.10, −2.45), yaw ∓25° (toed in) | 27″, screen 0.60 × 0.34 m |
| Keyboard | (−0.25, 0.77, −2.15) | 0.44 × 0.13 m, black |
| Mouse | (0.12, 0.77, −2.12) | — |
| Workstation tower | (0.95, 0, −2.55), under the desk (right) | 0.22 × 0.48 × 0.45 m, glass side panel, faint orange internal light |
| **Chair pivot** (gas lift axis) | **(−0.30, 0, −1.50)** | seat top y = 0.48; seat yaw 0° when typing |
| Developer (seated) | parented to the chair seat | head ≈ (−0.30, 1.22, −1.62) when typing |
| Server rack R1 | (3.10, 0, −2.30), yaw 90° (front faces −X) | 0.60 × 2.00 × 1.00 m |
| Server rack R2 | (3.10, 0, −1.20), yaw 90° | same |
| Window wall | x = −3.5, z −2.9…1.2, y 0.3…2.8 | floor-to-ceiling glass, slim mullions every 1.4 m |
| City | layered planes / instanced blocks at x = −40…−400 | night skyline seen through the glass |
| Ceiling practicals | linear fixtures at y = 2.95 | dimmed; one cove strip above the desk |

**Visual hierarchy:** the workstation and developer are the brightest, highest-contrast zone. The racks (right) and city (left) frame them at lower luminance.

## 3. Camera plan

`CameraDirector` owns all shots, and nothing else moves the camera.

Each shot is defined as `{position, target, hfov, focus[]}`. `hfov` is the **horizontal** field of view; the vertical FOV is derived per aspect (`vfov = 2·atan(tan(hfov/2)/A)`) and clamped to 24°–72°.

`focus[]` lists the world points that must stay inside an 8% safe margin. If clamping would push one out (very tall portrait), the camera dollies back along its view direction, but never beyond the room bounds (|x| ≤ 3.3, z ≤ 2.8).

**Readability rule (revised in Phase 2):** this applies to the `working` shot (the notification) and the `message` shot. If the monitor text would render below its minimum cap height (**12 px** for the notification, **14 px** for the message, which is about a 20 px font), the camera moves **straight toward the screen and aims at its centre**. It stops at the readable distance, but never closer than the distance at which the text's widest row still fits 92% of the viewport width. The text sizes come from the monitor's *measured* layout, not a fixed fraction. On desktop no move is needed.

*Why it was revised:* the first version dollied along the shot's own axis. On a 375 × 812 phone that cut the notification off ("NEW VISITOR DE…") and filled the frame with the developer's hands. It was found in visual QA and fixed. `tests/unit/framing.test.ts` now checks that the text fits on six viewports.

| Shot | Position | Target | hfov | Must keep in frame |
|---|---|---|---|---|
| `establishStart` | (2.90, 2.15, 2.70) | (−0.30, 1.00, −2.00) | 64° | desk, racks, window edge |
| `establishEnd` | (2.20, 1.75, 1.90) | (−0.20, 1.05, −2.00) | 60° | desk, character, main monitor |
| `working` | (0.85, 1.50, −0.35) | (−0.12, 1.12, −2.35) | 54° | over the right shoulder; notification readable (rule above) |
| `reaction` | (1.00, 1.40, 0.40) | (−0.30, 1.15, −1.50) | 50° | character full upper body + chair |
| `acknowledge` | (0.85, 1.38, 0.15) | (−0.30, 1.20, −1.50) | 46° | character head/torso |
| `message` | (0.75, 1.35, −0.15) | (−0.05, 1.12, −2.30) | 44° | main monitor (all 4 corners) + pointing hand |
| `approachMid` | (0.36, 1.22, −1.30) | (0, 1.12, −2.55) | 42° | — (moving) |
| `cover` | (0, 1.12, −2.55 + d) | (0, 1.12, −2.55) | **60°** (was 42°) | screen covers viewport |

**Path:** shots are joined by a centripetal Catmull–Rom spline for position and a separately eased target. This avoids the "orbit wobble" of interpolating rotations directly.

The approach passes **over the developer's right shoulder**. The arm is lowered (clip `returnToIdle`) before the camera reaches the chair's z.

**Cover distance:**

```
d = min(h, w / A) / (2 · tan(vfov / 2)) × 0.98
```

with `h = 0.39`, `w = 0.70`, `A` the viewport aspect and `vfov` the final vertical FOV. The camera stops there and never crosses the screen plane. Near plane = 0.05 m.

The cover hfov was widened from 42° to 60° in Phase 2. With 42°, the desktop cover point was 0.885 m from the screen, right beside the developer's shoulder (under 0.1 m clearance). With 60° it is 0.588 m, well past him, and the widening FOV adds a slight "rush in". The approach is **one continuous spline** driven by a single `power2.in` tween from `armDown` to `cover`, so the camera never stalls at the mid point.

**Rules:**
- No camera shake.
- No hard cuts.
- Every move uses `power2.inOut` or `power3.inOut`, except the last 1.5 s of the approach, which uses `expo.in` for the "pull into the screen" feel.
- Depth of field is used on the high preset only, focus distance tracking the shot target.

## 4. Master timeline

t = 0 is the moment the critical assets are ready (end of the loader). Every value is one config key under `timeline`.

| t (s) | Beat | Camera | Character | Main monitor | Audio (if on) | Live region |
|---|---|---|---|---|---|---|
| 0.0 | **S01a Blueprint draws in.** The loader fades out (0.4 s) into the portfolio's own CAD look: `#151a20` background and grid. The room's **floor plan** traces itself in thin lines: walls first, then desk, chair, racks and window, with dimension ticks. | `establishStart`, looking slightly more top-down (pitch −10° extra), slow drift | hidden | hidden | room tone fade-in | — |
| 1.5 | **S01b Extrusion.** Walls, desk, racks and window rise from the plan (1.5 s, `back.out(1.04)`, staggered by distance from the desk). The plan lines fade into the floor. Practicals switch on, staggered across 2.2–3.0 s. The character and monitor fade/rise in with the desk. | pitch eases back to the designed `establishStart` | appears with the desk, already in `typing` | scrolling code fades in at 2.6 | low "power-up" hum | — |
| 3.0 | **S01c Establish** | `establishStart` → `establishEnd` (2.0 s, power2.inOut) | `typing` loop | scrolling code (dim) | — | — |
| 5.0 | **S02 Working** | → `working` (4.0 s, slow push) | `typing` with breathing layer | code scrolls in sync with keystrokes | keyboard loop | — |
| 9.0 | **S03 Visitor detected** | hold | — | notification card **"NEW VISITOR DETECTED"** slides in (0.35 s) with one restrained glow pulse | notify chime | "New visitor detected" |
| 9.4 | typing slows | — | `stopTyping` (crossfade 0.5 s) | — | keyboard loop fades out | — |
| 10.1 | head reacts | → `reaction` (2.0 s) | `headReaction`, then head-aim starts toward camera (weight 0→1 over 0.6 s) | — | — | — |
| 10.6 | body + chair turn | — | `chairTurn` (chair yaw 0° → −146°, 1.3 s, power2.inOut) with torso lead; feet push | — | chair creak (subtle) | — |
| 12.0 | **S04 Look at visitor** | → `acknowledge` (1.2 s) | `lookTowardVisitor`, a small nod at 12.5 | notification stays, dimmed | — | — |
| 13.4 | turn toward monitor | → `message` (1.6 s) | chair yaw −146° → −40°; `lookTowardMonitor` (head aim retargets to the screen) | — | — | — |
| 14.2 | point | — | `pointTowardMonitor` (right arm, 0.8 s, with anticipation) | notification clears | — | — |
| 14.6 | **S05 Message 1** | hold | point hold | **"WELCOME TO MY WORLD."** fades/tracks in (0.8 s) | soft swell | "Welcome to my world." |
| 16.0 | **Message 2** | hold | — | **"I BUILD THINGS THAT MATTER."** (0.8 s) | — | "I build things that matter." |
| 17.2 | arm down | starts → `approachMid` (3.4 s, power2.inOut) | `returnToIdle` (0.8 s), chair yaw → 0°, settles facing the desk | message holds | — | "Opening portfolio" |
| 20.6 | **S06 Final approach** | `approachMid` → `cover` (1.6 s, expo.in) | idle | message cross-fades to the **portfolio grid** (20.4–21.4) | transition whoosh | — |
| 22.2 | **S07 Cover** | stopped at cover distance | — | grid = viewport | — | — |
| 22.2 | DOM grid overlay fades in (0.25 s); renderer disposed | — | — | — | audio fades out | — |
| 22.5 | **S08 Handoff** | — | — | — | — | — |

`location.assign(portfolioUrl)`. **Total ≈ 22.5 s** (target 20–30 s).

**Story bookend:** the experience opens on the portfolio's CAD grid and blueprint, becomes the lit 3D room, then returns into the same CAD grid at the handoff. The concept comes from the reference video's "flat image becomes 3D" moment (`REFERENCE_ANALYSIS.md`), and was approved by the owner on 2026-11-03.

**How the blueprint works:**
- **Plan lines** are generated at runtime from each static mesh's footprint: the outline of its floor-level section, projected to y = 0.002. They are drawn as `LineSegments` with a dash-offset "trace" animation. No extra asset download.
- **Extrusion** is one shared shader uniform `uRise` (0→1), injected into the room materials via `onBeforeCompile`. It scales world-space height above the floor per object group, so there is no per-frame geometry rebuild.
- **Grid match:** the blueprint background uses exactly the portfolio grid colours and cell sizes, so the visitor starts and ends in the same visual language.

### 4.1 Skip

Skip is available from the first loader frame. It does the following:

1. Calls `timeline.kill()` and stops the mixer.
2. Fades the DOM grid overlay in over 0.3 s. During LOADING this is skipped and navigation is immediate.
3. Navigates once (latched).

There is no partial camera move after Skip. The overlay covers whatever frame was showing.

### 4.2 Reduced motion (`prefers-reduced-motion: reduce`, mode `calm`)

- The blueprint appears complete (no line tracing) and cross-fades to the lit room over 0.8 s, with no extrusion.
- The camera is static at `establishEnd`, with no dolly.
- The character does a short typing loop, then the notification, then one cross-fade to the "facing visitor" pose.
- The two message lines appear at 2.8 s and 4.0 s.
- At 5.8 s, a 0.6 s cross-fade to the grid, then navigation.
- Total ≈ 6.5 s. Mode `skip` navigates immediately.

### 4.3 Ending (Scene 09, on return only)

Shown only when the visitor comes back (`pageshow`, session flag). It's a calm static frame of the room with the developer facing the camera and the monitor reading **"THANK YOU FOR VISITING."** / **"LET'S BUILD SOMETHING GREAT."**, plus the buttons "Back to portfolio" and "Watch again". It is never shown after entering the portfolio by itself.

## 5. Character animation plan

**Rig:** a humanoid skeleton (Mixamo-compatible naming if a Mixamo source is approved), 65 bones or fewer including fingers. The character root is parented to the chair seat bone/empty, so **chair yaw carries the body**. The pivot is the gas-lift axis, not the character's hips.

| Clip | Length | Loop | Notes |
|---|---|---|---|
| `idle` (seated) | 4 s | yes | breathing and micro weight shifts |
| `typing` | 6 s | yes | non-repeating variant: two takes blended with offset phase to avoid visible cycling |
| `stopTyping` | 0.8 s | no | hands lift slightly, wrists relax |
| `headReaction` | 0.6 s | no | small upward/side tilt |
| `chairTurn` | 1.3 s | no | feet push, torso leads chair by about 0.1 s, arms settle on the armrests |
| `lookTowardVisitor` | 1.0 s | hold | posture opens and relaxes, small nod |
| `lookTowardMonitor` | 0.8 s | no | turn back toward the desk |
| `pointTowardMonitor` | 0.8 s + hold | hold | right arm, anticipation dip, index finger extended |
| `returnToIdle` | 0.8 s | no | arm down, back to the desk posture |

**Blending:**
- Every switch uses `AnimationAction.crossFadeTo` (0.3–0.6 s, warp off), so there is no snapping.
- Clip triggers are timeline callbacks, so they share the same clock as the camera.

**Procedural head aim**, layered after the mixer each frame:
- The neck and head bones rotate toward the aim target: the camera for "look at visitor", the screen for "look at monitor".
- Yaw is clamped to ±70° and pitch to ±35°, split 40% neck and 60% head, with a smoothed critically-damped spring.
- This keeps the gaze directed at the *actual* camera position on every aspect ratio.

**Fallback if fingers are not animatable** in the chosen asset: animate wrists and hands with key-press accents synchronised to keyboard key-cap dips (emissive flicker on the keycaps).

## 6. Lighting plan

| Light | Type | Position / target | Colour | Shadows |
|---|---|---|---|---|
| Key | SpotLight | (1.6, 2.7, −0.6) → character head | warm neutral `#FFE2C4`, soft | **only shadow caster** (high: 2048 PCFSoft; medium: 1024; low: none, baked contact shadow) |
| Blue fill | HemisphereLight + baked bounce | — | sky `#1A3A6B` / ground `#07111F` | — |
| Orange rim | SpotLight | (−1.4, 2.2, −3.0) behind the character, left | `#FF8A36` | none |
| Monitor glow | RectAreaLight (high/medium) / PointLight (low) | screen plane, facing +Z | from the screen content average, `#42D9FF`-ish | none |
| Practicals | baked emissive + lightmap | desk cove, back-wall LED, rack status LEDs | electric blue `#1769FF`, cyan, small orange | baked |
| City | emissive textures | outside | warm windows plus blue haze | — |

- **Static room lighting is baked** in Blender (Cycles) into lightmaps, one atlas per preset resolution. Only the character and the monitor contribution are lit in real time.
- **Tone mapping:** AgX (or ACES if AgX tests poorly on mobile), sRGB output, exposure in config.
- **Bloom:** high preset only, with a threshold so only screens, LEDs and practicals bloom. Never on the character.
- **Readability check:** the character silhouette must separate from the background in every shot (rim plus key). This is verified by a luminance-contrast probe in E2E screenshots.

## 7. Monitor UI design

- Drawn into a `CanvasTexture`: 2048 × 1152 on high, 1024 × 576 on medium/low. The font is loaded with `document.fonts.load` before the first draw.
- **States:** `code` (synthetic syntax-coloured lines, never real secrets), `notification`, `message`, `grid`.
- The message lines use Space Grotesk 600, letter-spacing 0.08 em, colour `#E8EEF5`, and a restrained glow with a cyan-tinted shadow.
- **Revised in Phase 2.** The original "13% cap height" could not fit "I BUILD THINGS THAT MATTER." (27 characters) on one row; it would be about twice the screen width. The layout is now **measured**: the largest font whose widest row fits 88% of the screen width. Portrait viewports wrap each line onto two rows ("WELCOME TO / MY WORLD." and "I BUILD THINGS / THAT MATTER."), so the exact text is unchanged and the font is about twice as large. The camera's readability rule (§3) uses these measured sizes.
- The notification card spans 94% of the screen width, and its text is fitted to 80%.
- The grid state reproduces the portfolio background exactly: `#151a20`, plus line colours `rgba(140,160,180,.085)` every 100 px and `rgba(140,160,180,.035)` every 20 px, scaled to the cover distance.

## 8. Verified geometry (Phase 1 sanity check)

`tools/verify-layout.py` re-computes the key numbers from this document (`python -I tools/verify-layout.py`, exit code 1 on any failure). Run on 2026-11-03:

**First run: 1 failure.** The original `approachMid` (0.15, 1.18, −1.30) passed **0.09 m** from the developer's shoulder capsule, below the 0.10 m minimum. An earlier "monitor ≥ 70% of width" rule also pulled desktop cameras to 0.9 m, which was wrong.

**Fixes:**
- `approachMid` moved to (0.30, 1.20, −1.30).
- The dolly-in is now driven by text size.
- The vFOV floor was lowered from 34° to 24°, so desktop keeps the designed framing.

**Second run: all checks passed.**

| Check | Phone 390×844 | Phone 844×390 | Desktop 1920×1080 | Ultrawide 2560×1080 |
|---|---|---|---|---|
| Message text cap height | 20.0 px | 20.0 px | 47.7 px | 51.0 px |
| Message camera → screen | 1.47 m | 2.33 m | 2.52 m | 2.52 m |
| Cover distance `d` | 0.263 m | 0.746 m | 0.885 m | 0.681 m |
| Screen covers viewport | yes | yes | yes | yes |

Other results:
- Chair yaw to face the visitor: **−145.6°** (design value −146°).
- Approach path: minimum clearance to the developer **0.20 m**, and the closest point is z = −2.287, so it **never crosses the screen plane** (z = −2.55).

**Phase 2 update.** `approachMid` is now (0.36, 1.22, −1.30) and the cover hfov is 60°. Re-run: **all checks passed**, with cover distance 0.263 m (390×844), 0.594 m (844×390), 0.588 m (1920×1080) and 0.594 m (2560×1080). The TypeScript framing tests reproduce these exact distances independently, and add text-fit and clearance checks against the mannequin's real pose function (torso capsule + head sphere).

This math uses simplified proxies: a capsule for the developer and the screen rectangle. It does **not** replace the in-engine clearance test against the real meshes planned for Phase 2/3.
