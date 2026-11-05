# THE DEVELOPER'S ROOM

**FROM ONE SCAN TO A WORLD OF POSSIBILITIES.**

A cinematic 3D entry into the portfolio of Ahmed Hassan Mostafa:

1. A QR code opens the URL.
2. A CAD blueprint extrudes into a night-time developer room.
3. The developer notices **NEW VISITOR DETECTED**, turns to the visitor, and points at the monitor: **WELCOME TO MY WORLD. / I BUILD THINGS THAT MATTER.**
4. The camera enters the screen and lands, seamlessly, on the real portfolio at https://ahshika.github.io/.

> **Status: Phase 3.** The intro is a pre-rendered Blender/Cycles video (landscape and portrait). See [`docs/testing/PHASE3_REPORT.md`](docs/testing/PHASE3_REPORT.md). The real-time 3D prototype from Phase 2 is still available with `mode: '3d'`.

## Rebuilding the video (Blender 5.2, scripted)

```bash
python -I tools/fetch_polyhaven.py blender/sources/polyhaven
```

```bash
"D:/Programs/Blender/blender.exe" --background --factory-startup --python tools/blender/build_character_ch06.py -- blender/character.fbx "blender/incoming/Pirate By P. Konstantinov@Typing.fbx" blender/work/character_ch06.blend
```

```bash
"D:/Programs/Blender/blender.exe" --background --factory-startup --python tools/blender/build_room.py -- blender/work/character_ch06.blend blender/sources/polyhaven blender/work/room.blend
```

```bash
python -I tools/calibrate_grid.py landscape
```

Then build the story once per aspect:

```bash
DR_ASPECT=landscape DR_GRID_GAIN=2.41,2.187,1.977 "D:/Programs/Blender/blender.exe" --background --factory-startup --python tools/blender/build_story.py -- blender/work/room.blend "blender/incoming/Pirate By P. Konstantinov@Sitting Idle.fbx" "blender/incoming/Pirate By P. Konstantinov@Pointing.fbx" node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff blender/work/story_landscape.blend
```

Render the frames (resumable: finished frames are skipped), then encode them with FFmpeg into `public/media/story-{landscape,portrait}.{webm,mp4}`:

```bash
"D:/Programs/Blender/blender.exe" --background blender/work/story_landscape.blend --python tools/blender/render_frames.py -- blender/renders/final_landscape cycles 48 100 1-661
```

The Mixamo files (`blender/incoming`, `blender/*.fbx`) stay local and are git-ignored.

Planned stable URL (QR destination): `https://ahshika.github.io/developers-room/` (not deployed yet).

## Requirements

- Node.js ≥ 22.12 (developed on 26.2)
- Python 3 (only for `tools/verify-layout.py`)
- Optional: Grafana k6 for `tests/performance`

## Install, run, build

```bash
npm install
```

```bash
npm run dev
```

The dev server runs at http://localhost:5173/developers-room/. The CSP is applied to builds only.

```bash
npm run build
```

```bash
npm run preview
```

The preview of the production build runs at http://localhost:4173/developers-room/.

## Test

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npx playwright install chromium webkit firefox
```

```bash
npm run test:e2e
```

E2E runs against the preview server, so run `npm run build` first. The portfolio origin is stubbed in tests, so no traffic reaches the live site.

```bash
npm run verify:layout
```

```bash
k6 run -e SCENARIO=smoke tests/performance/static-delivery.k6.js
```

k6 only ever runs against the local preview server; the script refuses other hosts.

## Configuration: one file

Everything lives in [`src/config/experience.config.ts`](src/config/experience.config.ts):

- **`portfolioUrl`, `fallbackUrl`, `experienceEntryUrl`.** Change the destination here. It must be https and on `allowedNavigationOrigins` (an open-redirect guard). The QR code never needs to change.
- **`intro.enabled`** (false = go straight to the portfolio), **`skipEnabled`**, **`loadTimeoutMs`** and **`reducedMotionMode`** (`calm` or `skip`).
- **`timeline`**: every beat in seconds. `calmTimeline` holds the reduced-motion version.
- **`quality.presets`** (low / medium / high) and the `adaptive` DPR rules.
- **`text`**: the mandatory lines are validated to stay exact.

Room layout and camera shots are in [`src/config/layout.ts`](src/config/layout.ts), in metres. `validateConfig()` checks the configuration at start-up; an invalid configuration shows the fallback.

The texts and URLs in `index.html` are filled from this config at build time.

**Debug flags** (they cannot change where the visitor is sent):

| Flag | Values | Effect |
|---|---|---|
| `?quality=` | `low`, `medium`, `high` | forces a quality preset |
| `?speed=` | 0.25–8 | timeline speed |
| `?pauseAt=` | seconds | freezes the intro at that second |

## Replacing assets

Placeholders are built in `src/experience/environment/Room.ts` and `src/experience/character/Mannequin.ts`. The final character must implement `CharacterController` (`src/experience/character/CharacterController.ts`), the same contract the timeline already drives. Asset rules (origins on the floor, exact screen size, budgets) are in [`docs/ASSET_INVENTORY.md`](docs/ASSET_INVENTORY.md).

## Docs

| Document | Contents |
|---|---|
| [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md) | the existing portfolio and the toolchain |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | system design and Phase 2 changes (§0) |
| [`docs/STORYBOARD.md`](docs/STORYBOARD.md) | layout, shots, timeline, animation, lighting |
| [`docs/ASSET_INVENTORY.md`](docs/ASSET_INVENTORY.md) | assets, budgets, sources |
| [`docs/PERFORMANCE_PLAN.md`](docs/PERFORMANCE_PLAN.md) | performance targets |
| [`docs/testing/PERFORMANCE_REPORT.md`](docs/testing/PERFORMANCE_REPORT.md) | measured performance results |
| [`docs/REFERENCE_ANALYSIS.md`](docs/REFERENCE_ANALYSIS.md) | what was taken from the reference video |
| [`LICENSES.md`](LICENSES.md) | licences |

## Deployment and QR

These are not done yet (Phase 8). The plan:

1. Create a new repo `Ahshika/developers-room`.
2. Deploy it to GitHub Pages via Actions, with Vite `base: '/developers-room/'`.
3. Generate the QR code **only after** the production URL serves the build.

Every push requires the owner's confirmation.
