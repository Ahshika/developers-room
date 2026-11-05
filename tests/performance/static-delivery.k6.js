// k6 — static delivery of the LOCAL production build (docs/PERFORMANCE_PLAN.md §5).
// Never point this at GitHub Pages: it would load-test GitHub's CDN, not this project.
//   npm run build && npm run preview
//   k6 run -e SCENARIO=smoke tests/performance/static-delivery.k6.js
//   k6 run -e SCENARIO=load  tests/performance/static-delivery.k6.js
import http from 'k6/http';
import { check, fail } from 'k6';

const BASE = __ENV.BASE_URL || 'http://[::1]:4173/developers-room/';
// vite preview binds to localhost, which may resolve to IPv6 only (::1) on Windows
if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(BASE)) fail('static-delivery.k6.js only runs against a local server');

const SCENARIOS = {
  smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 5 },
  load: {
    executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '5s',
    stages: [{ duration: '30s', target: 50 }, { duration: '60s', target: 50 }, { duration: '15s', target: 0 }],
  },
  spike: {
    executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '5s',
    stages: [{ duration: '10s', target: 200 }, { duration: '20s', target: 200 }, { duration: '5s', target: 0 }],
  },
};
const name = __ENV.SCENARIO || 'smoke';

export const options = {
  scenarios: { [name]: SCENARIOS[name] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    http_req_failed: [name === 'spike' ? 'rate<0.02' : name === 'load' ? 'rate<0.01' : 'rate==0'],
    'http_req_duration{type:index}': ['p(95)<50'],
    'http_req_duration{type:asset}': ['p(95)<500'],
    checks: ['rate>0.99'],
  },
};

/** Discover the shipped files from the built HTML and the boot chunk (which references the lazy chunks). */
export function setup() {
  const index = http.get(BASE);
  if (index.status !== 200) fail(`index not reachable: ${index.status}`);
  const files = new Set((index.body.match(/assets\/[\w.-]+\.(?:js|css)/g) || []));
  for (const f of [...files]) {
    if (!f.endsWith('.js')) continue;
    const js = http.get(BASE + f).body || '';
    for (const m of js.match(/[\w.-]+\.(?:js|woff2)/g) || []) if (/-[\w-]{8}\.(js|woff2)$/.test(m)) files.add(`assets/${m}`);
  }
  const css = [...files].filter((f) => f.endsWith('.css'));
  for (const f of css) for (const m of http.get(BASE + f).body.match(/[\w.-]+-latin-[\w-]+\.woff2/g) || []) files.add(`assets/${m}`);
  return { assets: [...files] };
}

export default function (data) {
  const index = http.get(BASE, { tags: { type: 'index' } });
  check(index, { 'index 200': (r) => r.status === 200, 'index has CSP': (r) => r.body.includes('Content-Security-Policy') });
  const responses = http.batch(data.assets.map((a) => ['GET', BASE + a, null, { tags: { type: 'asset' } }]));
  responses.forEach((r, i) => check(r, { [`asset 200`]: (x) => x.status === 200, 'asset not empty': (x) => (x.body || '').length > 0 }, { file: data.assets[i] }));
}
