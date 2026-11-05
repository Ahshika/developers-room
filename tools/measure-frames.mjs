// Measures real frame times of the full intro (PERFORMANCE_PLAN.md §1) on THIS machine.
// Usage (preview server running): node tools/measure-frames.mjs [quality] [device]
//   quality: low | medium | high (default: auto)   device: desktop | phone (layout emulation only)
import { chromium, devices } from '@playwright/test';

const quality = process.argv[2];
const device = process.argv[3] ?? 'desktop';
const base = 'http://localhost:4173/developers-room/';
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext(device === 'phone' ? devices['iPhone 14'] : { viewport: { width: 1280, height: 720 } });
  await ctx.route('https://ahshika.github.io/**', (r) => r.fulfill({ status: 200, body: '<!doctype html><title>stub</title>', headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window;
    w.__frames = [];
    w.__longtasks = [];
    let last = 0;
    const tick = (t) => {
      if (document.documentElement.dataset.drState === 'INTRO') {
        if (last) w.__frames.push(t - last);
        last = t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__longtasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
    } catch { /* unsupported */ }
  });
  const t0 = Date.now();
  // freeze just before the hand-off so samples can be read while still on this page
  await page.goto(`${base}?pauseAt=21.8${quality ? `&quality=${quality}` : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.drState === 'INTRO', null, { timeout: 30_000 });
  const introStartMs = Date.now() - t0;
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const meta = await page.evaluate(() => ({ quality: document.documentElement.dataset.drQuality, dpr: document.documentElement.dataset.drDpr }));
  await page.waitForTimeout(22_500);
  const frames = await page.evaluate(() => window.__frames);
  const longtasks = await page.evaluate(() => window.__longtasks);
  const sorted = [...frames].sort((a, b) => a - b);
  const pct = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(1) : 'n/a';
  console.info(JSON.stringify({
    device, ...meta, gpu, introStartMs, frames: sorted.length, longTasksOver100ms: longtasks.filter((d) => d > 100).length,
    frameMs: { p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99), max: sorted.at(-1)?.toFixed(1) },
    fpsMedian: sorted.length ? (1000 / Number(pct(0.5))).toFixed(1) : 'n/a',
  }, null, 1));
} finally {
  await browser.close();
}
