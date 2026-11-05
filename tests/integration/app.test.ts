import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperienceApp, type AppDeps } from '../../src/app/ExperienceApp';
import { experienceConfig, type ExperienceConfig } from '../../src/config/experience.config';
import type { Experience, ExperienceHooks } from '../../src/experience/Experience';
import { VISITED_FLAG_KEY } from '../../src/portfolio/PortfolioHandoff';
import type { DeviceCapabilities } from '../../src/services/DeviceCapabilities';
import { Ui } from '../../src/ui/Ui';

const BODY = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  .replace(/^[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const CAPS: DeviceCapabilities = {
  webgl2: true, maxTextureSize: 8192, devicePixelRatio: 1, reducedMotion: false, coarsePointer: false, saveData: false,
  deviceMemoryGb: 8, hardwareConcurrency: 8, viewportWidth: 1280, viewportHeight: 720,
};

interface Harness {
  app: ExperienceApp;
  deps: AppDeps;
  navigate: ReturnType<typeof vi.fn>;
  experience: { start: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } & Experience;
  hooks: () => ExperienceHooks;
  resolveLoad: () => void;
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

function harness(opts: { caps?: Partial<DeviceCapabilities>; config?: ExperienceConfig; deferLoad?: boolean; failLoad?: boolean; fetchOk?: boolean; storage?: Storage } = {}): Harness {
  let capturedHooks: ExperienceHooks | null = null;
  const experience = {
    start: vi.fn(), pause: vi.fn(), resume: vi.fn(), kill: vi.fn(),
    dispose: vi.fn(() => ({ geometries: 0, textures: 0 })),
    stats: { triangles: 0, drawCalls: 0, dpr: 1, preset: 'medium' },
  };
  let release: () => void = () => undefined;
  const gate = opts.deferLoad ? new Promise<void>((r) => { release = r; }) : Promise.resolve();
  const navigate = vi.fn();
  const deps: AppDeps = {
    detect: () => ({ ...CAPS, ...opts.caps }),
    loadExperience: async () => {
      await gate;
      if (opts.failLoad) throw new Error('chunk failed');
      return {
        createExperience: async (_c, _n, _p, _cfg, _a, hooks) => {
          capturedHooks = hooks;
          return experience as unknown as Experience;
        },
      };
    },
    navigate,
    reload: vi.fn(),
    storage: opts.storage ?? memoryStorage(),
    search: '',
    fetch: vi.fn().mockResolvedValue({ ok: opts.fetchOk ?? true }) as unknown as typeof fetch,
  };
  const app = new ExperienceApp(opts.config ?? experienceConfig, new Ui(document), deps);
  return {
    app, deps, navigate, experience: experience as Harness['experience'],
    hooks: () => {
      if (!capturedHooks) throw new Error('experience not created');
      return capturedHooks;
    },
    resolveLoad: () => release(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const state = () => document.documentElement.dataset.drState;

beforeEach(() => {
  document.body.innerHTML = BODY;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ExperienceApp', () => {
  it('starts the intro automatically, with no user interaction', async () => {
    const h = harness();
    await h.app.boot();
    expect(state()).toBe('INTRO');
    expect(h.experience.start).toHaveBeenCalledTimes(1);
    expect(document.getElementById('dr-loader')?.classList.contains('is-hidden')).toBe(true);
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('hands off to the real portfolio exactly once at the end of the timeline', async () => {
    const h = harness();
    await h.app.boot();
    await flush(); // reachability check resolves
    h.hooks().onHandoff();
    h.hooks().onHandoff();
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith('https://ahshika.github.io/');
    expect(state()).toBe('DONE');
    expect(h.deps.storage?.getItem(VISITED_FLAG_KEY)).toBe('1');
  });

  it('Skip during the intro stops the timeline, cleans up, and navigates once (even if the timeline later ends)', async () => {
    const h = harness();
    await h.app.boot();
    await Promise.all([h.app.skip(), h.app.skip()]);
    h.hooks().onHandoff();
    expect(h.experience.kill).toHaveBeenCalledTimes(1);
    expect(h.experience.dispose).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(state()).toBe('DONE');
  });

  it('Skip during loading navigates immediately and never starts the scene', async () => {
    const h = harness({ deferLoad: true });
    const booting = h.app.boot();
    await flush();
    expect(state()).toBe('LOADING');
    await h.app.skip();
    expect(h.navigate).toHaveBeenCalledTimes(1);
    h.resolveLoad();
    await booting;
    // the scene is never even created after a skip during loading
    expect(() => h.hooks()).toThrow('experience not created');
    expect(h.experience.start).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });

  it('the Skip button is wired to the same path', async () => {
    const h = harness();
    await h.app.boot();
    (document.getElementById('dr-skip') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, experienceConfig.intro.skipFadeSeconds * 1000 + 80));
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });

  it('video mode does not need WebGL: the intro still starts without it', async () => {
    const h = harness({ caps: { webgl2: false } });
    await h.app.boot();
    expect(experienceConfig.mode).toBe('video');
    expect(state()).toBe('INTRO');
  });

  it('3D mode shows the fallback with a working portfolio link when WebGL 2 is missing', async () => {
    const config = structuredClone(experienceConfig) as ExperienceConfig;
    config.mode = '3d';
    const h = harness({ caps: { webgl2: false }, config });
    await h.app.boot();
    expect(state()).toBe('FALLBACK');
    const panel = document.getElementById('dr-fallback') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('%DR_PORTFOLIO_URL%'); // filled by the Vite plugin at build time
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('falls back when the 3D chunk fails to load', async () => {
    const h = harness({ failLoad: true });
    await h.app.boot();
    expect(state()).toBe('FALLBACK');
  });

  it('falls back when loading exceeds the timeout', async () => {
    vi.useFakeTimers();
    const h = harness({ deferLoad: true });
    void h.app.boot();
    await vi.advanceTimersByTimeAsync(experienceConfig.intro.loadTimeoutMs + 10);
    expect(state()).toBe('FALLBACK');
    h.resolveLoad();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.experience.start).not.toHaveBeenCalled();
  });

  it('falls back (never traps the visitor) when the graphics context is lost', async () => {
    const h = harness();
    await h.app.boot();
    h.hooks().onContextLost();
    expect(state()).toBe('FALLBACK');
    expect(h.experience.dispose).toHaveBeenCalled();
  });

  it('offers retry instead of navigating into an unreachable portfolio', async () => {
    const h = harness({ fetchOk: false });
    await h.app.boot();
    await flush();
    h.hooks().onHandoff();
    expect(state()).toBe('UNREACHABLE');
    expect(h.navigate).not.toHaveBeenCalled();
    (h.deps.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (document.getElementById('dr-retry') as HTMLButtonElement).click();
    await flush();
    await flush();
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });

  it('shows the ending instead of replaying when the visitor comes back', async () => {
    const storage = memoryStorage();
    storage.setItem(VISITED_FLAG_KEY, '1');
    const h = harness({ storage });
    await h.app.boot();
    expect(state()).toBe('RETURNING');
    expect((document.getElementById('dr-ending') as HTMLElement).hidden).toBe(false);
    (document.getElementById('dr-replay') as HTMLButtonElement).click();
    expect(storage.getItem(VISITED_FLAG_KEY)).toBeNull();
    expect(h.deps.reload).toHaveBeenCalledTimes(1);
  });

  it('shows the ending after a back/forward cache restore', async () => {
    const h = harness();
    await h.app.boot();
    await flush();
    h.hooks().onHandoff();
    h.app.onPageShow(true);
    expect(state()).toBe('RETURNING');
  });

  it('pauses while hidden and resumes when visible', async () => {
    const h = harness();
    await h.app.boot();
    h.app.onVisibilityChange(true);
    h.app.onVisibilityChange(false);
    expect(h.experience.pause).toHaveBeenCalledTimes(1);
    expect(h.experience.resume).toHaveBeenCalledTimes(1);
  });

  it('goes straight to the portfolio when the intro is disabled', async () => {
    const config = structuredClone(experienceConfig) as ExperienceConfig;
    config.intro.enabled = false;
    const h = harness({ config });
    await h.app.boot();
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });

  it('goes straight to the portfolio for reduced motion when configured to skip', async () => {
    const config = structuredClone(experienceConfig) as ExperienceConfig;
    config.intro.reducedMotionMode = 'skip';
    const h = harness({ config, caps: { reducedMotion: true } });
    await h.app.boot();
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });

  it('refuses an invalid configuration and shows the fallback', async () => {
    const config = structuredClone(experienceConfig) as ExperienceConfig;
    config.portfolioUrl = 'https://evil.example/';
    const h = harness({ config });
    await h.app.boot();
    expect(state()).toBe('FALLBACK');
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('never requests camera, microphone or location', async () => {
    const getUserMedia = vi.fn();
    const geo = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: geo, watchPosition: geo }, configurable: true });
    const h = harness();
    await h.app.boot();
    h.hooks().onHandoff();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(geo).not.toHaveBeenCalled();
  });
});

describe('ExperienceApp cover → hand-off', () => {
  it('hands off as soon as the cover fade completes, even if the timeline never reaches its hand-off beat', async () => {
    const h = harness();
    await h.app.boot();
    await flush();
    h.hooks().onCover(0.05);
    await new Promise((r) => setTimeout(r, 150));
    expect(h.experience.dispose).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledTimes(1);
    h.hooks().onHandoff(); // late timeline beat: no second navigation
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });
});
