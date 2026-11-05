// Captures the storyboard beats (via the debug ?pauseAt= flag) for visual QA.
// Usage: npm run build && npm run preview  (in another terminal), then
//        node tools/capture-beats.mjs <outDir> [baseUrl]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

const outDir = process.argv[2];
const base = process.argv[3] ?? 'http://localhost:4173/developers-room/';
if (!outDir) {
  console.error('usage: node tools/capture-beats.mjs <outDir> [baseUrl]');
  process.exit(1);
}
const BEATS = [
  ['01-blueprint', 0.9], ['02-extrude', 2.4], ['03-establish', 4.6], ['04-working', 8.2], ['05-notification', 9.6],
  ['06-chair-turn', 11.2], ['07-look-at-visitor', 12.8], ['08-point', 14.9], ['09-message', 16.9], ['10-approach', 19.6],
  ['11-grid', 21.6],
];
const TARGETS = [['phone', devices['iPhone 14']], ['desktop', { viewport: { width: 1280, height: 720 } }]];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [label, device] of TARGETS) {
    const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
    // never touch the live portfolio from a capture run
    await context.route('https://ahshika.github.io/**', (r) => r.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } }));
    const page = await context.newPage();
    for (const [name, at] of BEATS) {
      await page.goto(`${base}?speed=4&pauseAt=${at}`);
      await page.waitForFunction(() => document.documentElement.dataset.drState === 'INTRO', null, { timeout: 30_000 });
      await page.waitForTimeout((at / 4) * 1000 + 700);
      const file = join(outDir, `${label}-${name}.png`);
      await page.screenshot({ path: file });
      console.info(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
