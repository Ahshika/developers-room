# Phase 3 — Final assets and pre-rendered cinematic (in progress)

**Date:** 2026-11-05
**Status:** the final videos are rendered, encoded and integrated, and all automated tests pass. They still need the owner's review and real-device testing. Nothing is committed, pushed or deployed.

## What changed and why

- **Pre-rendered video instead of real-time 3D** (approved by the owner). The real-time placeholders could not reach the requested look. See `docs/ARCHITECTURE.md` §0a.
- **Character:** Mixamo "Ch06", downloaded by the owner and **used as-is** at his request. Earlier attempts (Ch44 with a fitted CC-BY hoodie) were dropped. Only two import errors were corrected:
  - Metallic 0.5 → 0;
  - `*_Glossiness.png` was wired as roughness, so it is now inverted.
- **Room:** a programmer / server room, scripted in `tools/blender/build_room.py`:
  - 6 monitors at the main desk, a lab bench and an ops desk;
  - 8 fully populated 42U racks with switches, patch panels and cables;
  - a ceiling cable tray, a router, a NAS and a Pi cluster, 2 laptops, 5 PC / tower servers;
  - a neon "</>" sign and a wall display;
  - a night city through the window.
- **Story:** `tools/blender/build_story.py` covers the full storyboard in 22 s at 30 fps, in landscape and portrait.

## Problems found and fixed (by rendering and measuring, not by assumption)

| # | Problem | How it was found | Fix |
|---|---|---|---|
| 1 | Clothes looked like shiny plastic | look-dev render | Metallic 0; glossiness inverted |
| 2 | Monitors black | render | screen quads had no UVs (texture sampled one dark pixel) |
| 3 | Racks and monitors faced the wall | render | rotation sign |
| 4 | White rectangle in the window and all glass | HDRI analysis: a facade at luminance ≈ 29,000; a hard clamp made it flat white | soft compression c/(1+c/k) |
| 5 | Messages hidden | key-frame renders | the developer sat between camera and screen, so the camera now frames from his side |
| 6 | Camera inside the developer's head | key-frame renders | the push enters the gap between face and screen from the side |
| 7 | Words cut off at an angle | debug render facing the screen | coplanar transparent layers, so each overlay now has its own depth and is hidden when unused |
| 8 | Camera through the chair (≈13.5 s) | preview video | path goes up and over the chair |
| 9 | Final grid too dark (7, 12, 17 vs 21, 26, 32) | pixel measurement | `tools/calibrate_grid.py` (AgX-aware), measured within ±1.5 levels |
| 10 | Fallback button contrast 3.99:1 (< 4.5) | axe in WebKit | button #0f56d9 (5.4:1) |
| 11 | Undecodable video waited 15 s before the fallback | WebKit E2E | `canPlayType` filter, per-source error count, 8 s start timeout |
| 12 | Final frames written to `C:\blender\…` | log check | absolute output path. 35 frames were moved back into the project. **The empty folder `C:\blender` is left for the owner to delete** (a safety check blocked removing a drive-root folder). |

## Final videos (2026-11-05)

| File | Resolution | Size | Last-frame mean colour (portfolio #151a20 grid ≈ 21.5, 26.6, 32.7) |
|---|---|---|---|
| `story-landscape.webm` (VP9) | 1920×1080 | 9.6 MB | (21, 27, 32) |
| `story-landscape.mp4` (H.264) | 1920×1080 | 9.7 MB | (20, 26, 31) |
| `story-portrait.webm` (VP9) | 1080×1920 | 8.1 MB | (23, 27, 30) |
| `story-portrait.mp4` (H.264) | 1080×1920 | 8.9 MB | (23, 27, 30) |

- **In the browser:** the E2E hand-off frame sampled (21, 27, 32) in cell interiors, against (21, 26, 32) for the portfolio, so they differ by 1 level.
- **Source choice:** a Pixel 7 emulation loaded `story-portrait.webm` (1080×1920); desktop loaded `story-landscape.webm`.
- **Timing:** the real-speed run took 22.19 s from navigation to the portfolio; reduced motion took 4.3 s.

## Tests (final run, 2026-11-05, final videos)

| Suite | Result |
|---|---|
| Type check / lint | ✅ clean |
| Unit + integration (Vitest) | ✅ **121 / 121** |
| E2E desktop Chromium + Android Chromium | ✅ **42 passed, 0 failed**, including the hand-off colour test |
| E2E iPhone WebKit (Playwright on Windows) | ⚠️ no video codec in this WebKit build, so it shows the fallback (skipped, not failed). **Real iPhone not tested yet.** |
| Firefox | ⛔ not run (binary blocked by Windows) |

## Tests (earlier run, before the final encode)

| Suite | Result |
|---|---|
| Type check / lint | ✅ clean |
| Unit + integration (Vitest) | ✅ **121 / 121** (added: video config rules, source order, beat mirror, video mode without WebGL) |
| E2E desktop Chromium + Android Chromium | ✅ all but one each: **hand-off colour fails (15 levels too dark)**, because `public/media` still holds the uncalibrated preview video. Expected to pass once the final encode replaces it. |
| E2E iPhone WebKit (Playwright on Windows) | ⚠️ the Windows WebKit build reports it can play **neither** WebM nor MP4, so the app correctly shows the fallback straight away (18 tests skipped, 0 failed). **Real iPhones play MP4/H.264**, but that needs a real-device check. |
| Firefox | ⛔ not run (Windows blocks the Playwright binary, unchanged since Phase 2) |

## Render

- **Final:** Cycles 48 samples + OptiX denoise, 1920×1080 and 1080×1920, 661 frames each. 48 and 96 samples were visually indistinguishable in a side-by-side crop.
- **Measured speed:** ≈ 18–25 s per frame on the RTX 5060, so about 7 hours for both versions.
- **Preview** (already delivered): EEVEE, 960×540, about 20 minutes.

## Remaining

2. Owner review of the final video.
3. Phase 8: create the repo `Ahshika/developers-room`, enable GitHub Pages (needs the owner's confirmation before any push), test on real phones, then generate the final QR.
