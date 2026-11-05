# Phase 2 — Technical Prototype Report

**Date:** 2026-11-03
**Status:** the prototype works end to end in local testing. Nothing is committed, pushed or deployed.
**Placeholders:** the room and the character are **code-built placeholders** (every object is named `PLACEHOLDER_*`). They prove layout, pivots, choreography and the transition. They are not final assets.

## 1. Phase 2 goals (from the specification)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Direct opening through the destination URL | ✅ local only | E2E "starts automatically…" (3 engines). The production URL does not exist yet. |
| 2 | Automatic scene initialization (no Start button) | ✅ | E2E: state reaches `INTRO` with no interaction |
| 3 | Basic 3D room | ✅ placeholder | Room, desk, 3 monitors, keyboard, mouse, tower, chair, 2 racks, window wall, night city, practicals |
| 4 | Basic / placeholder character | ✅ placeholder | Seated mannequin in a black hoodie; two-bone IK arms; head aims at the real camera; chair-pivot turn |
| 5 | Working camera timeline | ✅ | One GSAP master timeline; 8 named shots; aspect-aware framing |
| 6 | Monitor positioned correctly | ✅ | Exact 0.70 × 0.39 m screen at (0, 1.12, −2.55); unit-tested framing |
| 7 | Camera approaches the monitor | ✅ | One continuous spline; never crosses the screen plane (unit test, 6 viewports) |
| 8 | Convincing screen-entry transition | ✅ measured | Final frame = portfolio background **exactly** (21, 26, 32) on 3 engines |
| 9 | Hand-off to the real portfolio | ✅ stubbed | Navigates exactly once to `https://ahshika.github.io/`. In E2E the origin is stubbed, so no traffic reaches the live site. |
| 10 | Working Skip Intro | ✅ | Skip during loading + 9 timeline points → exactly one navigation (3 engines) |
| 11 | Mobile browser compatibility | ⚠️ emulated only | iPhone 14 (WebKit engine) and Pixel 7 (Chromium) emulation pass. **Real devices are not tested.** |
| 12 | Fallback access | ✅ | WebGL missing, chunk failure, timeout, context loss and invalid config all show the fallback with a working link |

Also delivered:
- the approved **CAD blueprint → extrusion** opening;
- the reduced-motion "calm" version;
- the return ending ("THANK YOU FOR VISITING." / "LET'S BUILD SOMETHING GREAT.");
- an "unreachable portfolio" retry panel;
- a sound toggle (muted by default, synthesised sounds, unlocks on gesture);
- a screen-reader live region;
- a build-time CSP;
- a CSS-only escape link if scripts never run.

## 2. Tools and versions

| Tool | Version | Use |
|---|---|---|
| Node.js / npm | 26.2.0 / 11.13.0 | runtime / packages |
| TypeScript | 6.0.3 (pinned: typescript-eslint 8.72 requires < 6.1) | strict type check |
| Vite | 8.3.5 | build, preview |
| three | 0.187.0 | rendering |
| gsap | 3.15.0 | master timeline |
| Vitest | 5.1.0 (+ happy-dom 21.0.4) | unit + integration |
| Playwright | 1.64.1 (Chromium, WebKit; Firefox installed but blocked, see §5) | E2E |
| @axe-core/playwright | 4.14.0 | accessibility |
| ESLint | 10.14.0 + typescript-eslint 8.72.1 | lint |
| Grafana k6 | v2.3.0 (existing install, unchanged) | local delivery load test |
| Python | 3.13.15 | `tools/verify-layout.py` |

`npm audit`: **0 vulnerabilities**. 11 moderate advisories came from one dev-only `minimatch` < 11.0.1 DoS (GHSA-g3hv-75wg-m249) via ESLint. They were resolved with an `overrides` pin to `minimatch@^11.0.4`, and ESLint was verified working after it.

## 3. Test results (final run, final build)

| Suite | Command | Result |
|---|---|---|
| Type check | `npx tsc --noEmit` | ✅ 0 errors |
| Lint | `npx eslint .` | ✅ 0 problems |
| Unit + integration | `npx vitest run` | ✅ **104 / 104 passed** (4 files) |
| Layout math | `python -I tools/verify-layout.py` | ✅ all checks passed |
| E2E desktop Chromium | `npx playwright test --project=desktop-chromium` | ✅ 20 / 20 |
| E2E iPhone 14 (WebKit) | `--project=iphone-webkit` | ✅ 19 passed, 1 deliberately skipped (real-time run is single-engine) |
| E2E Pixel 7 (Chromium) | `--project=android-chromium` | ✅ 19 passed, 1 deliberately skipped |
| E2E desktop Firefox | `--project=desktop-firefox` | ⛔ **not executed**: Windows refused to start the Playwright Firefox binary (§5) |
| Accessibility (axe WCAG 2 A/AA) | in E2E | ✅ 0 violations on 3 engines |
| CSP violations / permission requests | in E2E | ✅ none (camera, microphone and location never requested) |
| k6 smoke / load / spike | see `PERFORMANCE_REPORT.md` | smoke ✅; load ❌ index p95 threshold; spike ❌ latency thresholds. **0 failed requests in all three.** |

What the E2E tests cover:
- auto-start;
- the full intro at 8× speed and at **real speed** (25.3 s);
- the notification and both message lines, via the live region plus screenshots;
- Skip during loading and at 0.5 / 2 / 4 / 9.2 / 11 / 14.4 / 15.5 / 19 / 22 s;
- WebGL missing → fallback → link works;
- reduced motion → calm version → portfolio;
- Back → ending;
- the hand-off pixel match;
- axe;
- CSP and permissions.

## 4. Bugs found and fixed during Phase 2

| # | Bug (how found) | Fix | Regression test |
|---|---|---|---|
| 1 | Disposing the renderer (`forceContextLoss`) fired `webglcontextlost`, so the visitor saw "graphics context lost" instead of the portfolio (first manual run) | Ignore context loss caused by our own disposal | E2E full run (3 engines) |
| 2 | **Race:** disposal killed the timeline before its hand-off beat, leaving the visitor on the grid. Hidden at 8× speed, exposed by slower WebKit. | Hand-off chained to the end of the cover fade | Integration "hands off as soon as the cover fade completes…" + E2E real-speed run |
| 3 | `compileAsync` can stall in a backgrounded tab, so loading hung until the 15 s watchdog | Capped at 2.5 s | — (environment-dependent; documented) |
| 4 | Storyboard's 13% cap height could not fit the 27-character line on the screen | Measured layout; portrait wraps onto two rows | Unit `layoutMessage` |
| 5 | Notification ~8 px on phones (unreadable) | Notification readability rule + full-width card | Unit framing, 6 viewports |
| 6 | Portrait readability dolly cut off "NEW VISITOR DE…" and filled the frame with hands (visual QA) | Move toward the screen and aim at its centre; text must fit the width | Unit `expectTextFits`, 6 viewports |
| 7 | Readability dolly landed a few hundredths of a px short (moved along the view axis, not toward the screen) | Exact distance solution | Unit readability ≥ 14 px |
| 8 | Desktop cover point only 0.08–0.10 m from the developer | Cover hfov 42° → 60°; approachMid moved; clearance modelled with the real pose function | Unit approach-clearance, 6 viewports |
| 9 | High preset ran at 30 fps: the 2048 canvas re-upload at 30 Hz (measured) | 1024×576 canvas on all presets | Measured 59.9 fps |
| 10 | The city was visible before the window existed (visual QA) | City moved into the window riser | Visual |
| 11 | Loader said "/ 5" with 4 steps | Corrected | Visual |

## 5. Not executed / not verified (and why)

| Item | Why | What is needed |
|---|---|---|
| **Desktop Firefox** | `firefox.exe` → "Permission denied" (Windows blocked the downloaded binary, likely Smart App Control or antivirus). Security settings were not changed. | Owner allows the binary, or tests in an installed Firefox |
| **Real iPhone / Android** | No device access from this machine | Owner runs the device checklist once a preview URL exists |
| Desktop Safari, Edge | Not available here (Edge is Chromium-based; not separately tested) | Manual check |
| QR scanning (printed / screen) | No production URL yet; QR is generated only after deploy | Phase 8 |
| Throttled "Fast 4G" load time | Not measured yet | Phase 6 |
| Real phone frame rate | Desktop GPU only (see PERFORMANCE_REPORT scope warning) | Owner's phones |
| Grafana / Prometheus | Not applicable: static site, no server, no analytics (privacy rule) | — |
| Audio output | Synthesised cues exist; muted-by-default behaviour is tested, but sound quality was not listened to | Manual check with sound on |

## 6. Known limitations (to address in later phases)

1. **Placeholder visuals.** The mannequin and boxes are not the cinematic final look (Phase 3: Blender + Mixamo).
2. **Framing polish.** On desktop, the developer's head occupies a large part of the left side of the message shot. The room is darker than ideal. Both will be tuned with the real assets (Phase 4).
3. **Bundle budget.** The 3D chunks total 282.7 KB gzip against a 220 KB target (Phase 6 decision).
4. **k6 latency thresholds** fail on the local `vite preview` server under load/spike. There were 0 errors (see report).
5. **Lighting** is real-time only. Baked lightmaps arrive with the Blender assets.
6. The **ending** is a DOM panel, not yet the 3D "calm frame" described in the storyboard.

## 7. Files

**Created:**
- Config and docs: `package.json` (+ lock), `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `playwright.config.ts`, `.gitignore`, `.claude/launch.json`, `index.html`, `README.md`, `LICENSES.md`, `docs/testing/PHASE2_REPORT.md`, `docs/testing/PERFORMANCE_REPORT.md`.
- `src/`: `main.ts`, `app/{ExperienceApp,stateMachine}.ts`, `config/{experience.config,validateConfig,layout}.ts`, `experience/{Experience,Stage}.ts`, `experience/camera/{framing,CameraDirector}.ts`, `experience/character/{CharacterController,Mannequin}.ts`, `experience/environment/Room.ts`, `experience/lighting/Lighting.ts`, `experience/screens/MonitorScreen.ts`, `experience/timeline/MasterTimeline.ts`, `experience/transitions/BlueprintReveal.ts`, `portfolio/PortfolioHandoff.ts`, `services/{AudioManager,DeviceCapabilities,QualityManager}.ts`, `ui/Ui.ts`, `utils/random.ts`, `styles/{tokens,ui}.css`.
- Tests: `tests/unit/{config,framing,services}.test.ts`, `tests/integration/app.test.ts`, `tests/e2e/{fixtures.ts,experience.spec.ts}`, `tests/performance/static-delivery.k6.js`.
- Tools: `tools/capture-beats.mjs`, `tools/measure-frames.mjs`.

**Modified:** `docs/ARCHITECTURE.md` (§0 Phase 2 changes), `docs/STORYBOARD.md` (§3, §7, §8 revisions), `tools/verify-layout.py` (approachMid, cover hfov).

**Git:** no repository initialised, nothing committed or pushed. **Deploy:** none.
