# Performance Report

Every number below was measured. Nothing here is an estimate.

**Machine:** this Windows 11 PC; GPU reported by WebGL: *ANGLE (NVIDIA GeForce RTX 5060 Laptop GPU, Direct3D11)*.
**Browser:** Playwright Chromium 1.64 (headless).
**Build:** the Phase 2 prototype with code-built placeholder geometry, served by `vite preview`.

> **Scope warning.** These numbers come from a high-end desktop GPU. They say nothing about real phone performance. Phone-size runs emulate the *layout and DPR* only; the GPU is still the RTX 5060. Real-device numbers must come from the owner's phones (`?perf=1` probe is planned for Phase 6; until then, `tools/measure-frames.mjs` on a desktop only).

## 2026-11-03 — Phase 2

### Bundle sizes (`vite build`)

| Chunk | Minified | Gzip | Budget (gzip) | Result |
|---|---|---|---|---|
| Boot (`index-*.js`) | 23.1 KB | 8.4 KB | ≤ 15 KB | ✅ within |
| Experience (scene code) | 39.0 KB | 14.3 KB | — | — |
| gsap | 69.5 KB | 27.3 KB | — | — |
| three | 797.9 KB | 241.1 KB | — | — |
| **Experience + gsap + three** | — | **282.7 KB** | ≤ 220 KB | ❌ **over by 62.7 KB** |
| CSS | 12.4 KB | 2.9 KB | — | — |

Tree-shaking works: unused parts such as `AnimationMixer` are absent from the bundle. The excess is three.js's WebGLRenderer plus its shader library. Phase 6 options: drop the RectAreaLight path, trim unused shader chunks, or accept and re-budget. That decision is recorded for Phase 6 and has not been taken.

### Frame time during the full intro (`node tools/measure-frames.mjs <quality> <device>`)

| Run | Preset | DPR | Frames | p50 | p90 | p95 | p99 | max | Median FPS | Long tasks > 100 ms |
|---|---|---|---|---|---|---|---|---|---|---|
| Desktop 1280×720, **2048 monitor canvas** (original) | high | 1 | 728 | 33.3 ms | 50.0 | 50.0 | 50.1 | 783.3 | **30.0** | 5 |
| Desktop 1280×720, medium | medium | 1 | — | 16.7 ms | — | 16.8 | — | — | 59.9 | 2 |
| Desktop 1280×720, **1024 monitor canvas** (fix) | high | 1 | — | 16.7 ms | 16.7 | 16.7 | 16.8 | — | **59.9** | 4 |
| iPhone 14 layout (390×664 @1.5) | medium | 1.5 | 1350 | 16.7 ms | 16.7 | 16.7 | 16.8 | 50.0 | 59.9 | 2 |
| iPhone 14 layout | low | 1.25 | 1350 | 16.7 ms | 16.7 | 16.7 | 16.8 | 33.3 | 59.9 | 2 |

**Finding and fix:** redrawing and re-uploading a 2048×1152 canvas at 30 Hz during the code scroll halved the frame rate on the high preset. All presets now use 1024×576 (`experience.config.ts`), and the high preset holds 60 fps (vsync-capped).

**Long tasks:** the observer is buffered from page start, so these 2–5 tasks include module evaluation and shader compilation before the intro. They are not yet attributed individually (Phase 6).

### Time to intro start (local, uncached, no throttling)

| Run | Time from navigation to `INTRO` |
|---|---|
| Desktop, high | 630–898 ms |
| iPhone layout, medium / low | 683 / 597 ms |

The throttled "Fast 4G" target (p50 ≤ 4 s) is **not measured yet**; that is planned for Phase 6.

### Hand-off

| Check | Result |
|---|---|
| Last frame vs portfolio background, 3 sampled cell interiors | **(21, 26, 32) = #151a20 exactly**, on desktop Chromium, iPhone WebKit and Android Chromium |
| Full intro at real speed, navigation → portfolio | 25.3 s total, including loading (desktop Chromium) |
| Reduced-motion (calm) total, including loading | 7.4–8.2 s |
| Prerender latency | Not measurable locally: prerender only works same-origin, which is true only in production |

### k6 v2.3.0 — local static delivery (`tests/performance/static-delivery.k6.js`)

These numbers describe **`vite preview` on this PC only**, not GitHub Pages. Each iteration fetches `index.html` plus the 14 shipped files.

| Scenario | VUs | Requests | Failed | RPS | p50 | p90 | p95 | p99 | Max | Thresholds |
|---|---|---|---|---|---|---|---|---|---|---|
| smoke | 1 × 5 iterations | 73 | **0** | 231 | 3.06 ms | 4.32 | 8.73 | 10.23 | 10.48 | ✅ all passed |
| load | 0→50 (105 s) | 216,667 | **0** | 2,059 | 48.4 ms | 83.0 | 169.4 | 266.8 | 412.2 | ❌ index p95 103.2 ms > 50 ms; ✅ assets p95 193 ms < 500; ✅ failures 0% |
| spike | 0→200 (35 s) | 76,807 | **0** | 2,177 | 180.0 ms | 295.7 | 775.8 | 952.2 | 1,120 | ❌ index p95 364.8 ms > 50; ❌ assets p95 800.7 ms > 500; ✅ failures 0% |

There were no timeouts and no failed connections in any run. Data received under load was 16 GB at 156 MB/s.

**Interpretation:** the thresholds were left as written and two scenarios **failed** them. `vite preview` is a single-process Node static server; under load, small `index.html` requests queue behind the 800 KB three.js chunk. This says nothing about GitHub Pages' CDN, which serves production. The failures are recorded, not hidden. A production-like local server test (static file server with compression) could be added in Phase 6 if useful.
