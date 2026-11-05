# THE DEVELOPER'S ROOM — Architecture

Status: Phase 1 design. Nothing here is implemented yet; each section states how it will be verified.
Inputs: `docs/PROJECT_AUDIT.md`. Hosting is confirmed as `https://ahshika.github.io/developers-room/` (same origin as the portfolio).

---

## 0a. Phase 3 decision: pre-rendered cinematic video (owner-approved, 2026-11-03)

The real-time Three.js scene could not reach the art direction (realistic character, dense programmer
room, cinematic light) on phones. The intro is now a **video rendered in Blender/Cycles**, in two
versions: landscape 1920×1080 and portrait 1080×1920. Both are encoded as WebM (VP9) and MP4 (H.264).

- **Same app shell, different stage.** `config.mode = "video"` loads `src/video/VideoExperience.ts`,
  which implements the same `Experience` contract as the 3D stage. Skip, fallback, load watchdog,
  cover → hand-off, return ending, reduced motion and live-region announcements are all unchanged.
  `mode = "3d"` still runs the Phase 2 prototype.
- **Autoplay.** The video plays muted and inline. If the browser still refuses (e.g. iOS Low Power
  Mode), a single "Play intro" button appears, and Skip always works.
- **Fast failure.** Formats the browser cannot decode are filtered out with `canPlayType`. If every
  source fails, or nothing plays within `video.startTimeoutMs` (8 s), the fallback appears.
- **Hand-off.** The video's last ~1.7 s is the portfolio grid. The DOM grid fades in over it
  `coverLeadSeconds` (0.35 s) before the end, then navigation follows. The grid emission in Blender is
  calibrated through AgX by `tools/calibrate_grid.py` so the frame matches `#151a20`.
- **WebGL is not required** in video mode.
- **Pipeline (all scripted):**
  1. `tools/fetch_polyhaven.py`, `build_character_ch06.py`, `build_room.py`, `build_story.py`
     (`DR_ASPECT`, `DR_GRID_GAIN`) produce the scene.
  2. `render_frames.py` renders the frames (resumable).
  3. FFmpeg encodes the files.

## 0. Phase 2 changes to this design (verified)

| Area | Original design | As built | Why |
|---|---|---|---|
| Extrusion | `uRise` shader uniform via `onBeforeCompile` | Each riser group is scaled in Y from its floor origin | Same visual result, no shader patching, works with every material |
| Hand-off trigger | Separate `handoff` timeline beat after `cover` | Hand-off is chained to the end of the cover fade; the timeline beat is only a latched safety net | Disposal kills the timeline. A later beat could be lost (race found in WebKit E2E: the visitor stayed on the grid) |
| Shader warm-up | `compileAsync` awaited | `compileAsync` capped at 2.5 s | It can stall in a backgrounded tab; the first render compiles anyway |
| Context loss | Any `webglcontextlost` → fallback | Ignored when caused by our own `dispose()` | `forceContextLoss()` during disposal was showing the fallback instead of navigating (found in the first run) |
| Prerender | Speculation Rules always | Only when the portfolio is same-origin | Chromium rejects cross-site prerender (true in local tests only; production is same-origin) |
| Monitor canvas | 2048×1152 on high | 1024×576 on all presets | Measured: 2048 halved the frame rate (see PERFORMANCE_PLAN results) |
| Readability | Message only, fixed cap fraction | Message + notification, measured text metrics, text must fit width | See STORYBOARD §3, §7 |
| Debug flags | `?quality`, `?perf` | `?quality`, `?speed` (0.25–8), `?pauseAt` (0–60 s) | Deterministic visual QA and E2E. None can change a navigation target |

## 1. System overview

```
 QR code ──► https://ahshika.github.io/developers-room/   (static, GitHub Pages)
                         │
              index.html (tiny, renders instantly)
              ├─ static fallback markup (works with JS disabled)
              ├─ loader UI (CSS only)
              └─ boot.ts (small bundle)
                     │ capability check
          ┌──────────┴───────────┐
     unsupported              supported
          │                      │ dynamic import()
   Fallback view          experience chunk (three, gsap, scene code)
   + portfolio link              │ assets (priority groups)
                                 ▼
                         Master timeline (intro, about 22.5 s:
                          CAD blueprint → extrudes into the room → story)
                                 │  Skip at any point
                                 ▼
                       Screen-entry transition
                                 ▼
               location.assign("https://ahshika.github.io/")
                       real portfolio (unchanged)
```

The portfolio stays fully independent. The experience only ever navigates to it and never copies its content.

## 2. Technology decisions

| Concern | Choice | Why | Rejected |
|---|---|---|---|
| Build | **Vite + TypeScript (strict)** | Static output for Pages, code-splitting (the boot bundle stays tiny and 3D loads after the loader is visible), type safety, fast HMR | Webpack (slower, more config); no build step (cannot code-split or compress assets) |
| 3D | **Three.js, used directly** | One directed scene with no React UI inside it; direct control of the render loop, disposal, DPR and quality scaling; first-class GLTF, Meshopt and KTX2 loaders | React Three Fiber: adds React and a reconciler for no benefit, since the portfolio is a separate vanilla site. Babylon.js: heavier |
| Timeline | **GSAP core** (standard licence, free incl. commercial use since 2024) | One master timeline with labels; Skip is `kill()`; precise easing; the ticker can drive rendering | Hand-rolled tweens (duplication); multiple clocks |
| Skeletal animation | `THREE.AnimationMixer`, advanced from the GSAP ticker | One clock for everything | A separate rAF loop (clock drift) |
| Audio | **Web Audio API**, no library | 5 short sounds; precise scheduling from timeline callbacks; muted by default | Howler.js: about 10 KB of features not needed |
| Fonts | Self-hosted OFL fonts (Space Grotesk for display, JetBrains Mono for screen UI) | No third-party request; the font is ready before canvas text is drawn | Google Fonts CDN: an extra origin, and it blocks canvas text timing |
| Tests | Vitest (unit), Playwright (E2E and mobile emulation), Lighthouse CI (load), k6 (local static delivery only, see the performance plan) | Matches TS/Vite; Playwright covers Chromium, WebKit and Firefox engines | Jest (slower with ESM/Vite) |
| Hosting | GitHub Pages via GitHub Actions (`actions/deploy-pages`) | Free, HTTPS, same origin as the portfolio | Netlify/Vercel: a different origin, which loses the same-origin benefits |
| QR | `qrcode` npm package (MIT), run locally at build time | Offline, deterministic SVG/PNG | Online generators (privacy, tracking redirects) |

Backend: **none**. No requirement needs one.

## 3. Runtime state machine

A single `ExperienceApp` owns the state. Every transition is explicit; illegal transitions are ignored and logged.

```
BOOT ──► CHECKING ──► LOADING ──► INTRO ──► HANDOFF ──► DONE
            │            │          │          ▲
            ▼            ▼          ▼          │
        FALLBACK      FALLBACK    SKIPPING ────┘
                    (timeout/error)
RETURNING (back/forward from the portfolio) ──► ENDING screen
```

| State | Entered when | Leaves when |
|---|---|---|
| CHECKING | boot | capability result |
| LOADING | capable device | critical assets ready → INTRO; `loadTimeoutMs` exceeded or a critical asset failed → FALLBACK |
| INTRO | critical assets ready | timeline complete → HANDOFF; Skip → SKIPPING; runtime error or WebGL context lost → FALLBACK |
| SKIPPING | Skip activated (also from LOADING) | short cover fade done → HANDOFF |
| HANDOFF | screen covers the viewport | navigation issued → DONE |
| RETURNING | `pageshow` with `persisted`, or a session flag set before navigation | user chooses "Enter again" (replays) or "Back to portfolio" |

**Guarantee:** every state has a path to the portfolio. A global `error` / `unhandledrejection` handler moves INTRO/LOADING to FALLBACK, so the visitor is never trapped.

## 4. Module layout

Only directories that the implementation actually uses will be created.

```
src/
  main.ts                    boot: capability check, mount UI, lazy-import experience
  config/
    experience.config.ts     THE single source of URLs, timings, quality presets
    validateConfig.ts        runtime validation (fails fast in dev, falls back in prod)
  app/
    ExperienceApp.ts         state machine + orchestration + cleanup
  services/
    DeviceCapabilities.ts    WebGL2/1, max texture size, DPR, memory hint, saveData, reduced motion
    QualityManager.ts        preset selection + adaptive DPR from measured frame time
    AssetManager.ts          GLTF/Meshopt/KTX2 loading, priority groups, real progress, dispose
    AudioManager.ts          Web Audio context, unlock on gesture, mute persistence
  experience/
    Stage.ts                 renderer, scene, resize, render loop on gsap.ticker, dispose
    environment/Room.ts      room + workstation + racks + window + city
    lighting/Lighting.ts     rig per preset
    character/Character.ts   model, AnimationMixer, clip crossfades, procedural head aim
    screens/MonitorScreen.ts canvas-texture UI for main monitor (code, notification, message, grid)
    camera/CameraDirector.ts named shots, aspect-aware framing, spline path, cover distance
    timeline/MasterTimeline.ts builds the GSAP timeline from config.timeline
    transitions/BlueprintReveal.ts  opening: plan lines from mesh footprints + uRise extrusion uniform
    transitions/ScreenEntry.ts  final approach + grid-matched cover + DOM overlay
  portfolio/
    PortfolioHandoff.ts      URL allowlist, prefetch/prerender, reachability check, single navigation
  ui/
    Loader.ts  SkipButton.ts  SoundToggle.ts  Fallback.ts  Ending.ts  LiveRegion.ts
  styles/
    tokens.css               colour, type, spacing, z-index tokens
    ui.css
public/
  assets/{models,textures,audio,fonts}/
tests/{unit,e2e,performance}/
tools/generate-qr.mjs
```

## 5. Central configuration

`src/config/experience.config.ts` is the **only** place where URLs and timings live. Its shape:

```ts
export interface ExperienceConfig {
  experienceEntryUrl: string;          // "https://ahshika.github.io/developers-room/"
  portfolioUrl: string;                // "https://ahshika.github.io/"
  fallbackUrl: string;                 // same as portfolioUrl by default
  allowedNavigationOrigins: string[];  // ["https://ahshika.github.io"]
  intro: {
    enabled: boolean;                  // false → go straight to portfolio
    skipEnabled: boolean;              // Skip is always rendered when intro runs; this exists for testing only
    loadTimeoutMs: number;             // 15000 → fallback panel
    reducedMotionMode: "calm" | "skip";
  };
  audio: { defaultMuted: true; masterVolume: number };
  quality: { default: "auto" | "low" | "medium" | "high"; presets: Record<"low"|"medium"|"high", QualityPreset> };
  assets: { basePath: string; groups: Record<AssetGroup, AssetEntry[]> };
  timeline: TimelineConfig;            // every beat in seconds, see STORYBOARD.md §4
  text: { notification: "NEW VISITOR DETECTED"; line1: "WELCOME TO MY WORLD."; line2: "I BUILD THINGS THAT MATTER."; endingLine1: "THANK YOU FOR VISITING."; endingLine2: "LET'S BUILD SOMETHING GREAT." };
}
```

`validateConfig` checks the following. Unit tests cover each rule.

- All URLs parse, use `https:` and have an origin in `allowedNavigationOrigins`. This prevents an open redirect.
- Timeline beats are finite, non-negative and monotonically ordered where the storyboard requires order. The total stays within 15–35 s.
- Every preset has all fields, and `dpr` caps are within 0.5–2.
- The mandatory texts match exactly (guards against accidental edits).

**No configuration is read from the query string** except harmless debug flags (`?quality=low|medium|high`, `?perf=1`). These can never change a navigation target.

## 6. Render loop and the single clock

- `gsap.ticker` is the only frame clock. `Stage` registers one callback: `mixer.update(dt)`, then camera director update, head-aim update and `renderer.render()`.
- The master timeline is a GSAP timeline, so camera, text, screen, audio cues and clip triggers share the same time base.
- **Visibility:** on `visibilitychange → hidden`, the timeline and ticker callback pause. On visible they resume, so a visitor who switches apps does not miss the intro.
- **Context loss:** `webglcontextlost` → preventDefault, pause, then move to FALLBACK. Recovery would need a full reload of GPU resources and isn't worth the risk mid-intro.
- **Cleanup on HANDOFF/FALLBACK:** kill the timeline, remove the ticker callback, stop the mixer, dispose geometries, materials, textures and render targets, call `renderer.dispose()`, close the AudioContext, and remove listeners (each module returns a `dispose()` that the app calls in reverse order).

## 7. Portfolio handoff (Scenes 06–08)

**Primary approach: grid-matched screen entry, then real navigation.** It will be validated in Phase 2.

1. The portfolio page background is `#151a20` with a fixed CAD grid of 100 px and 20 px cells (verified in the audit).
2. In the final beats, `MonitorScreen` cross-fades from the message to a **pixel-faithful reproduction of that grid**. The grid scale is computed so that at the camera's final *cover distance* one grid cell equals 100 CSS px on the visitor's screen, with the same alignment as the portfolio's fixed background.
3. `CameraDirector` stops at the cover distance `d = min(h, w/A) / (2·tan(fov/2))` (screen height `h`, width `w`, viewport aspect `A`), shrunk by 2%. The screen then fully covers the viewport, and the camera **never crosses the screen plane** (no near-plane clipping through the bezel).
4. A DOM overlay with the identical CSS grid fades in over 250 ms. It is visually a no-op, and it hides the canvas so the renderer can be disposed.
5. `location.assign(portfolioUrl)`. The browser keeps the last frame until the portfolio's first paint, which has the same background. The content then appears with the portfolio's own load.
6. Making that navigation fast:
   - When the intro starts, a `<script type="speculationrules">` **prerenders** the portfolio. Chromium supports this, so the navigation is instant there.
   - Elsewhere, `<link rel="prefetch">` is used.
   - A `fetch(portfolioUrl, {method:'HEAD'})` reachability check runs during the intro. If it fails, the end state shows "The portfolio could not be reached — Retry / Open anyway" instead of navigating into an error page.
7. `PortfolioHandoff.navigate()` is idempotent through a `navigated` latch, so it is guarded against double navigation from Skip plus timeline end.

Why this design:
- The real site is reached at its real URL, so refresh, back/forward, deep links and the portfolio's own automation all keep working.
- It needs no screenshot that could go stale, since the portfolio content changes automatically.
- It is resolution-independent, which covers portrait phones where only a slice of the 16:9 monitor is visible at cover distance.

The alternative being tested is a live same-origin iframe on the monitor (CSS3D) during the approach. It is kept only if it is reliable on WebKit; the decision gets recorded here after Phase 2.

**Back button:** before navigating, `sessionStorage['dr.visited']=1` is set. On return (`pageshow`), the app enters RETURNING and shows the Ending ("THANK YOU FOR VISITING." / "LET'S BUILD SOMETHING GREAT.") with "Back to portfolio" and "Watch again". The intro is never forced again.

## 8. Loading strategy

| Group | Contents | Blocks intro? |
|---|---|---|
| 0 boot | `index.html`, CSS, `main.ts` chunk, display font subset | Yes (tiny) |
| 1 critical | experience chunk (three, gsap), room GLB, main monitor, baked lightmap (preset size) | **Yes** |
| 2 character | character GLB + clips used in the first 11 s | **Yes** (the character is on screen at about 4 s) |
| 3 secondary | secondary detail props, city far layers, rack detail | No (swap in when ready; placeholders are simplified geometry) |
| 4 audio | 5 short clips (Opus/AAC) | No (loaded after the first user gesture, or idle) |
| 5 portfolio | prefetch/prerender of portfolio | No (starts at INTRO) |

**Progress honesty:** progress is computed from bytes received (`Content-Length` known for every file, since GitHub Pages sends it), weighted by group 1–2 sizes declared in a build-generated manifest. If any size is unknown, the loader shows an indeterminate indicator plus the item count ("3 / 7") instead of a percentage.

**Failure:** a failed *critical* asset → one retry, then FALLBACK. A failed *secondary* asset → logged and skipped. A failed audio clip → that sound is disabled.

## 9. UI layering

z-index tokens, defined once in `tokens.css`:

| Token | Layer |
|---|---|
| `--z-canvas: 0` | WebGL canvas |
| `--z-overlay: 10` | screen-entry DOM overlay |
| `--z-loader: 20` | loader |
| `--z-controls: 30` | Skip, Sound |
| `--z-fallback: 40` | fallback / ending / error panels |
| `--z-live: 50` | visually-hidden live region |

**Controls:**
- **SKIP INTRO** is a real `<button>`: bottom-right, safe-area aware, a 44×44 minimum hit area, visible focus ring, `aria-label="Skip intro and open portfolio"`.
- **Sound** is a `<button aria-pressed>` with the label "Sound off" / "Sound on". It is muted by default, the first press unlocks the AudioContext, and the choice persists in `localStorage` (in try/catch).
- `LiveRegion` (`aria-live="polite"`) announces "New visitor detected", the two message lines and "Opening portfolio", so the story is available without sight or sound.

## 10. Security and privacy

- **CSP meta** on the experience page: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; frame-src 'self'; base-uri 'self'; form-action 'none'`. It is tested against the built output, and the KTX2 transcoder worker is verified under it.
- No camera, microphone or location API is called. A test asserts that `navigator.mediaDevices.getUserMedia` and `geolocation` are never invoked.
- No analytics or third-party scripts. Fonts are self-hosted.
- Navigation targets come only from validated config and the origin allowlist (§5).
- The monitor text is drawn on a canvas from constants, so no `innerHTML` with dynamic data exists anywhere.
- Dependencies: `npm audit` and Trivy (if available) on the lockfile in CI. Exact versions are pinned through the lockfile.

## 11. Testing plan

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | config validation (every rule), cover-distance math, framing fit per aspect, camera path clearance (sampled spline vs character capsule and monitor bezel), quality preset selection, progress computation (known and unknown sizes), handoff latch (double call → one navigation), state machine transitions |
| Integration | Vitest + jsdom / happy-dom | ExperienceApp with a mocked Stage: Skip in every state, timeout → fallback, critical asset failure → fallback, visibility pause/resume, dispose order |
| E2E | Playwright: Chromium, WebKit, Firefox; Pixel 7 and iPhone 14 emulation | auto-start without interaction, notification and message visible on the monitor (canvas pixel probe + live region text), full run reaches the portfolio URL, Skip at 8 timeline points → exactly one navigation, WebGL disabled → fallback with a working link, reduced motion → calm mode, back button → Ending, no permission prompts, final-frame vs portfolio first-paint background pixel comparison |
| Accessibility | Playwright + axe-core | controls labelled and focusable, contrast, no keyboard trap |
| Performance | in-app perf probe (`?perf=1`) driven by Playwright; Lighthouse CI; k6 against the local `vite preview` server | see `PERFORMANCE_PLAN.md` |
| Security | `npm audit`, CSP violation listener in E2E, Semgrep (if available) | — |
| Manual (owner) | real iPhone Safari, Android Chrome, printed QR at 3 distances | checklist in `docs/testing/` (written in Phase 7) |

Untested browsers or devices will be listed as untested, never as supported.

## 12. Deployment

- Repo `Ahshika/developers-room`; Vite `base: '/developers-room/'`.
- GitHub Actions: on push to `main`, run install, lint, typecheck, unit tests, build, then `actions/deploy-pages`. Actions are pinned by SHA (matching the portfolio repo's practice).
- Every push needs the owner's confirmation. Phase 2 work stays local until approved.
- The QR is generated only after the production URL serves the build (§2, `tools/generate-qr.mjs`, error correction level Q, quiet zone 4).
