import { test as base, expect, type Page } from '@playwright/test';

export const PORTFOLIO = 'https://ahshika.github.io/';

/**
 * Stand-in for the live portfolio: same background as the real page (PROJECT_AUDIT.md §2.2), so
 * the hand-off frame can be compared pixel-for-pixel, without sending traffic to the real site.
 */
const PORTFOLIO_STUB = `<!doctype html><html><head><meta charset="utf-8"><title>portfolio stub</title><style>
html,body{margin:0;height:100%}
body{background-color:#151a20;background-image:linear-gradient(rgba(140,160,180,.085) 1px,transparent 1px),linear-gradient(90deg,rgba(140,160,180,.085) 1px,transparent 1px),linear-gradient(rgba(140,160,180,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(140,160,180,.035) 1px,transparent 1px);background-size:100px 100px,100px 100px,20px 20px,20px 20px;background-attachment:fixed}
</style></head><body data-portfolio-stub></body></html>`;

/** Records things the page must never do, and CSP violations, before any app script runs. */
const INIT = () => {
  const w = window as unknown as { __dr: { csp: string[]; permissions: string[]; errors: string[] } };
  w.__dr = { csp: [], permissions: [], errors: [] };
  document.addEventListener('securitypolicyviolation', (e) => w.__dr.csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  window.addEventListener('error', (e) => w.__dr.errors.push(String(e.message)));
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) md.getUserMedia = async () => { w.__dr.permissions.push('getUserMedia'); throw new Error('blocked by test'); };
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = () => { w.__dr.permissions.push('geolocation'); };
    navigator.geolocation.watchPosition = () => { w.__dr.permissions.push('geolocation'); return 0; };
  }
};

export interface DrFixtures {
  portfolioHits: string[];
}

export const test = base.extend<DrFixtures>({
  // auto: every test gets the portfolio stub and the guards, even if it doesn't read the hits
  portfolioHits: [async ({ page }, use) => {
    const hits: string[] = [];
    await page.route(`${PORTFOLIO}**`, async (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) hits.push(req.url());
      // GitHub Pages sends Access-Control-Allow-Origin: * (verified in the audit); the stub does too
      await route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: req.method() === 'HEAD' ? '' : PORTFOLIO_STUB });
    });
    await page.addInitScript(INIT);
    await use(hits);
  }, { auto: true }],
});

export { expect };

export async function drState(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.documentElement.dataset.drState);
}

/** Waits for the intro (or reports that this browser fell back, e.g. no WebGL 2). */
export async function waitForIntroOrFallback(page: Page): Promise<'INTRO' | 'FALLBACK'> {
  await page.waitForFunction(() => ['INTRO', 'FALLBACK'].includes(document.documentElement.dataset.drState ?? ''), null, { timeout: 30_000 });
  return (await drState(page)) as 'INTRO' | 'FALLBACK';
}

export async function guards(page: Page): Promise<{ csp: string[]; permissions: string[]; errors: string[] }> {
  return page.evaluate(() => (window as unknown as { __dr: { csp: string[]; permissions: string[]; errors: string[] } }).__dr);
}
