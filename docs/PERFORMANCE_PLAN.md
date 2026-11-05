# THE DEVELOPER'S ROOM — Performance Plan

**Principle:** measure from the first prototype, record actual numbers, never claim an FPS or load time that was not measured. Every result is written to `docs/testing/PERFORMANCE_REPORT.md` with the date, device or emulation, build hash and preset.

---

## 1. Targets

These are *targets*, not claims.

| Metric | Target | How it is measured |
|---|---|---|
| Loader visible (FCP of `index.html`) | ≤ 1.0 s on Lighthouse "mobile" (simulated slow 4G, 4× CPU) | Lighthouse CI on `vite preview` |
| Boot JS (gzip) | ≤ 15 KB | build output (`vite build` report), CI budget check |
| Experience chunk (three + gsap + app, gzip) | ≤ 220 KB | build output, CI budget check |
| Critical download (groups 0–2) | ≤ 6 MB low / 8 MB medium / 12 MB high | generated `manifest.json` totals, CI budget check |
| Time to intro start (critical ready) | p50 ≤ 4 s on "Fast 4G" (CDP throttling: 9 Mbps down, 150 ms RTT) at medium | Playwright, 10 runs, fresh profile |
| Frame time, desktop high | p95 ≤ 20 ms (≈ 50 fps), p50 ≤ 16.7 ms | in-app probe `?perf=1`, Playwright on this machine |
| Frame time, real phone (mid-range) | p95 ≤ 33 ms (30 fps floor), target p50 ≤ 16.7 ms | in-app probe on the owner's phones (manual) |
| Long tasks during intro | none > 100 ms after the intro starts | `PerformanceObserver('longtask')` in the probe |
| Handoff latency (navigation issued → portfolio first paint) | p50 ≤ 300 ms with prerender (Chromium), ≤ 800 ms with prefetch (WebKit/Firefox) | Playwright: `performance.now()` mark before `assign` + portfolio `paint` entry |
| Resource cleanup | after handoff/skip: `renderer.info.memory.geometries === 0`, `textures === 0`, no running rAF, AudioContext closed | Playwright assertion via test hook |
| Leak check | "Watch again" ×3: JS heap growth < 10% after GC | CDP `Performance.getMetrics` + `HeapProfiler.collectGarbage` |

Emulated mobile (Playwright device profiles) checks **layout and behaviour only**. It does not measure a phone's GPU. Phone FPS comes only from real devices, and untested devices are reported as untested.

## 2. Quality presets

| Setting | low | medium | high |
|---|---|---|---|
| DPR cap | 1.25 | 1.5 | 2.0 |
| Antialias | none (FXAA off) | MSAA (native) | MSAA |
| Shadows | none; baked contact shadow | key light 1024, PCF | key light 2048, PCFSoft |
| Lightmap | 1k | 2k | 4k atlas |
| Textures | 1k max | 2k | 2k |
| Monitor glow light | PointLight | RectAreaLight | RectAreaLight |
| Post-processing | none | none | selective bloom + DoF |
| City layers | 2 | 3 | 4 |
| Secondary props | essential only | all | all |
| Canvas texture | 1024 × 576 | 1024 × 576 | 2048 × 1152 |

### 2.1 Initial selection (`QualityManager`, `auto`)

1. Pick **low** when any of these hold:
   - no WebGL2;
   - `MAX_TEXTURE_SIZE` < 4096;
   - `navigator.connection.saveData`;
   - `deviceMemory` ≤ 2;
   - a coarse pointer together with `hardwareConcurrency` ≤ 4.
2. Pick **medium** for other coarse-pointer (touch) devices and small screens.
3. Pick **high** for fine-pointer devices with a viewport ≥ 1280 px and `hardwareConcurrency` ≥ 8.
4. Pick **medium** in all other cases.

`?quality=` overrides the choice, for testing.

### 2.2 Runtime adaptation

- During the first 2 s of the intro, frame times are sampled.
- If p90 > 25 ms, DPR steps down by 0.25 (never below 0.75), re-sampled every 2 s, up to 3 steps.
- If still slow at minimum DPR, shadows are disabled.
- Quality is **never raised mid-intro**, so there is no visible popping.
- All changes are logged by the probe.

## 3. Rendering rules

- One shadow-casting light. `castShadow` only on the character and chair; `receiveShadow` only on the floor and desk.
- Static lighting is baked. Real-time lights: ≤ 4 (key, rim, monitor glow, hemisphere).
- Transparency is limited to the window glass and the screen glow quad, with no stacked transparent layers.
- Instancing for keycaps, rack panels and city towers.
- Merge static meshes by material at export.
- Frustum culling stays on.
- No per-frame allocations in the render loop (reused vectors), checked in a code review pass.
- `renderer.setAnimationLoop` is never used. Rendering runs only from the gsap ticker callback and stops at handoff.
- On `visibilitychange: hidden`, the ticker callback is removed and the timeline paused.

## 4. Loading rules

- Boot bundle is separate from the experience chunk (`import()`).
- `modulepreload` for the experience chunk and a `preload` for the room GLB, both started by `main.ts` right after the capability check.
- KTX2 transcoder and Meshopt decoder are self-hosted under `public/`, fetched in parallel with the GLBs.
- Hashed filenames (Vite) make assets cacheable. GitHub Pages serves `max-age=600`, and repeat visits revalidate with ETag/304.
- A service worker for offline caching is **not planned** (not required). It would only be considered in Phase 6 with evidence of benefit, and it would never be claimed without an offline test.

## 5. k6 (installed: v2.3.0)

**Scope (honest):**
- The project is a static site with no API. A k6 run against GitHub Pages would load-test GitHub's CDN, so it is **not done**: it isn't our code, and it isn't appropriate.
- k6 is used **only against the local production build** (`vite preview`). It checks that the built output (index, chunks, GLBs, manifest) is served correctly and completely under concurrent fetches, and it gives a delivery-latency baseline.

**Script:** `tests/performance/static-delivery.k6.js`

- Each VU fetches `index.html`, then every group 0–2 file from `manifest.json`, and checks status 200 and byte length = manifest size.

| Scenario | Shape | Thresholds |
|---|---|---|
| smoke | 1 VU × 5 iterations | `http_req_failed` == 0; all checks pass |
| load | ramp 0 → 50 VUs over 30 s, hold 60 s, ramp down 15 s | `http_req_failed` < 1%; `http_req_duration{type:index}` p95 < 50 ms; `{type:asset}` p95 < 500 ms; checks > 99% |
| spike | 0 → 200 VUs in 10 s, hold 20 s | `http_req_failed` < 2%; no connection errors |

Reported for every run: p50 / p90 / p95 / p99 latency, error rate, requests per second, data received (throughput), timeouts, and failed connections. These numbers describe **local static delivery on this PC only** and will be labelled that way.

## 6. Profiling procedure per phase

1. `npm run build`, then the budget check (fails CI if bundle or asset budgets are exceeded).
2. Lighthouse CI on the loader page (mobile and desktop).
3. Playwright performance spec: time to intro start (throttled), frame-time probe for the full intro at each preset, cleanup assertions, handoff latency.
4. k6 smoke + load against `vite preview`.
5. Manual on real phones (owner): open the URL with `?perf=1`. The probe shows p50/p95 frame time, preset, DPR, draw calls and triangles, and a "copy results" button. Results are pasted into the report.
6. Chrome DevTools Performance trace on any regression; the root cause is written in the report.

## 7. Monitoring

Grafana/Prometheus are **not applicable** to a static site with no server and no analytics, and adding analytics would conflict with the privacy requirements. The performance probe plus recorded reports replace runtime monitoring. If the owner later wants field metrics, it needs explicit approval and a privacy review.
