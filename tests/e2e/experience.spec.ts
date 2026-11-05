import AxeBuilder from '@axe-core/playwright';
import { experienceConfig } from '../../src/config/experience.config';
import { drState, expect, guards, PORTFOLIO, test, waitForIntroOrFallback } from './fixtures';

const BEATS = experienceConfig.video.beats;

/** Opens the app without waiting for the 'load' event (it waits on media such as the poster). */
async function openApp(page: import('@playwright/test').Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

/** Skips the rest of a test when this browser legitimately fell back (e.g. no codec for the intro video). */
async function requireIntro(page: import('@playwright/test').Page, testInfo: import('@playwright/test').TestInfo): Promise<void> {
  const s = await waitForIntroOrFallback(page);
  if (s === 'FALLBACK') {
    const reason = await page.locator('#dr-fallback-reason').textContent();
    testInfo.annotations.push({ type: 'fallback', description: `browser fell back: ${reason}` });
    test.skip(true, `intro unavailable in this browser: ${reason}`);
  }
}

test('starts automatically after loading, with no user interaction', async ({ page, portfolioHits }, testInfo) => {
  await openApp(page, './');
  await requireIntro(page, testInfo);
  await expect(page.locator('#dr-loader')).toHaveClass(/is-hidden/);
  await expect(page.locator(experienceConfig.mode === 'video' ? 'video.dr-video' : 'canvas.dr-canvas')).toBeVisible();
  await expect(page.locator('#dr-skip')).toBeVisible();
  expect(portfolioHits).toEqual([]);
  const g = await guards(page);
  expect(g.csp, 'CSP violations').toEqual([]);
  expect(g.errors, 'page errors').toEqual([]);
  testInfo.annotations.push({ type: 'quality', description: String(await page.evaluate(() => document.documentElement.dataset.drQuality)) });
});

test('full intro ends inside the real portfolio URL, navigating exactly once', async ({ page, portfolioHits }, testInfo) => {
  await openApp(page, './?speed=8');
  await requireIntro(page, testInfo);
  await page.waitForURL(PORTFOLIO, { timeout: 20_000 });
  await expect(page.locator('body[data-portfolio-stub]')).toBeAttached();
  expect(portfolioHits).toEqual([PORTFOLIO]);
});

test('full intro at real speed (no time scaling) reaches the portfolio', async ({ page, portfolioHits }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'real-time run once, on one engine (about 25 s)');
  test.setTimeout(90_000);
  const start = Date.now();
  await openApp(page, './');
  await requireIntro(page, testInfo);
  await page.waitForURL(PORTFOLIO, { timeout: 45_000 });
  expect(portfolioHits).toEqual([PORTFOLIO]);
  testInfo.annotations.push({ type: 'real-time-total-ms', description: String(Date.now() - start) });
});

test('NEW VISITOR DETECTED and the exact welcome message are presented (live region mirror)', async ({ page }, testInfo) => {
  // beat times come from the config (they mirror the rendered video), each checked 0.4 s after it starts
  for (const [at, expected, label] of [[BEATS.notification + 0.4, 'NEW VISITOR DETECTED', 'notification'], [BEATS.line1 + 0.4, 'WELCOME TO MY WORLD.', 'message1'], [BEATS.line2 + 0.4, 'I BUILD THINGS THAT MATTER.', 'message2']] as const) {
    await openApp(page, `./?speed=4&pauseAt=${at}`);
    await requireIntro(page, testInfo);
    await expect(page.locator('#dr-live')).toHaveText(expected);
    await testInfo.attach(`${label}-${at}s`, { body: await page.screenshot(), contentType: 'image/png' });
  }
});

for (const at of [0.5, 2.0, 4.0, 9.2, 11.0, 14.4, 15.5, 19.0, 22.0]) {
  test(`Skip at ${at}s navigates exactly once`, async ({ page, portfolioHits }, testInfo) => {
    await openApp(page, `./?speed=4&pauseAt=${at}`);
    await requireIntro(page, testInfo);
    await page.waitForTimeout((at / 4) * 1000 + 200);
    await page.locator('#dr-skip').click();
    await page.waitForURL(PORTFOLIO);
    await page.waitForTimeout(400);
    expect(portfolioHits).toEqual([PORTFOLIO]);
  });
}

test('Skip during loading navigates immediately', async ({ page, portfolioHits }) => {
  // hold the intro (video files, or the 3D engine chunk) so the page is still loading when Skip is pressed
  await page.route(experienceConfig.mode === 'video' ? '**/media/story-*' : '**/assets/three-*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await openApp(page, './');
  await expect.poll(() => drState(page)).toBe('LOADING');
  await page.locator('#dr-skip').click();
  await page.waitForURL(PORTFOLIO);
  expect(portfolioHits).toEqual([PORTFOLIO]);
});

test('an intro that cannot load shows the fallback with a working portfolio link', async ({ page, portfolioHits }) => {
  if (experienceConfig.mode === 'video') {
    await page.route('**/media/story-*.{webm,mp4}', (route) => route.fulfill({ status: 404, body: '' }));
  } else {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
  }
  await openApp(page, './');
  await expect(page.locator('#dr-fallback')).toBeVisible();
  const link = page.locator('#dr-fallback a');
  await expect(link).toHaveAttribute('href', PORTFOLIO);
  await link.click();
  await page.waitForURL(PORTFOLIO);
  expect(portfolioHits).toEqual([PORTFOLIO]);
});

test('reduced motion plays the calm version and still reaches the portfolio', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const start = Date.now();
  await openApp(page, './');
  await requireIntro(page, testInfo);
  await page.waitForURL(PORTFOLIO, { timeout: 20_000 });
  testInfo.annotations.push({ type: 'calm-duration-ms', description: String(Date.now() - start) });
});

test('coming back shows the ending instead of replaying', async ({ page }, testInfo) => {
  await openApp(page, './?speed=8');
  await requireIntro(page, testInfo);
  await page.waitForURL(PORTFOLIO, { timeout: 20_000 });
  await page.goBack();
  await expect(page.locator('#dr-ending')).toBeVisible();
  await expect(page.locator('#dr-ending')).toContainText('THANK YOU FOR VISITING.');
  await expect(page.locator('#dr-ending')).toContainText("LET'S BUILD SOMETHING GREAT.");
  await expect(page.locator('#dr-ending a')).toHaveAttribute('href', PORTFOLIO);
});

test('hand-off frame matches the portfolio background', async ({ page }, testInfo) => {
  await openApp(page, './?speed=4&pauseAt=22.15');
  await requireIntro(page, testInfo);
  await page.waitForTimeout((22.15 / 4) * 1000 + 800);
  const vp = page.viewportSize() ?? { width: 800, height: 600 };
  // sample cell interiors (between grid lines): 10 px inside a 20 px minor cell
  const points = [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6]].map(([fx, fy]) => [Math.floor((vp.width * (fx as number)) / 20) * 20 + 10, Math.floor((vp.height * (fy as number)) / 20) * 20 + 10]);
  const shot = await page.screenshot();
  await testInfo.attach('handoff-frame', { body: shot, contentType: 'image/png' });
  const sample = async () => page.evaluate(async ({ pts, png }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(img, 0, 0);
    const scale = img.width / window.innerWidth;
    return pts.map(([x, y]) => Array.from(g.getImageData(Math.round((x as number) * scale), Math.round((y as number) * scale), 1, 1).data.slice(0, 3)));
  }, { pts: points, png: shot.toString('base64') });
  const intro = await sample();
  for (const [r, g, b] of intro) {
    // #151a20 = (21, 26, 32); allow small filtering differences
    expect(Math.abs((r as number) - 21)).toBeLessThanOrEqual(6);
    expect(Math.abs((g as number) - 26)).toBeLessThanOrEqual(6);
    expect(Math.abs((b as number) - 32)).toBeLessThanOrEqual(6);
  }
  testInfo.annotations.push({ type: 'handoff-pixels', description: JSON.stringify(intro) });
});

test('controls are accessible (axe, WCAG 2 A/AA)', async ({ page }, testInfo) => {
  await openApp(page, './?pauseAt=6');
  await waitForIntroOrFallback(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas').analyze();
  testInfo.annotations.push({ type: 'axe-passes', description: String(results.passes.length) });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  // keyboard: Skip is reachable and labelled while the intro runs (the fallback panel has its own link instead)
  if ((await drState(page)) === 'INTRO') await expect(page.getByRole('button', { name: 'Skip intro and open portfolio' })).toBeVisible();
  else await expect(page.locator('#dr-fallback a')).toBeVisible();
});

test('requests no camera, microphone or location permission and has no CSP violations', async ({ page }, testInfo) => {
  await openApp(page, './?speed=8');
  await requireIntro(page, testInfo);
  await page.waitForTimeout(1500);
  const g = await guards(page);
  expect(g.permissions).toEqual([]);
  expect(g.csp).toEqual([]);
});
