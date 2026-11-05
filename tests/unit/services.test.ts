import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { StateMachine } from '../../src/app/stateMachine';
import { parsePauseAt, parseSpeed } from '../../src/app/ExperienceApp';
import { experienceConfig } from '../../src/config/experience.config';
import { MESSAGE_LAYOUT } from '../../src/config/layout';
import { solveTwoBone } from '../../src/experience/character/Mannequin';
import { layoutMessage } from '../../src/experience/screens/MonitorScreen';
import { PortfolioHandoff, VISITED_FLAG_KEY } from '../../src/portfolio/PortfolioHandoff';
import type { DeviceCapabilities } from '../../src/services/DeviceCapabilities';
import { AdaptiveQuality, parseQualityOverride, percentile, selectQuality } from '../../src/services/QualityManager';

const caps = (over: Partial<DeviceCapabilities> = {}): DeviceCapabilities => ({
  webgl2: true, maxTextureSize: 8192, devicePixelRatio: 2, reducedMotion: false, coarsePointer: false, saveData: false,
  deviceMemoryGb: 8, hardwareConcurrency: 8, viewportWidth: 1920, viewportHeight: 1080, ...over,
});

describe('selectQuality', () => {
  it('honours an explicit override first', () => {
    expect(selectQuality(caps({ webgl2: false }), 'auto', 'high')).toBe('high');
  });
  it('honours a configured fixed preset', () => {
    expect(selectQuality(caps(), 'low', null)).toBe('low');
  });
  it.each<[string, Partial<DeviceCapabilities>, string]>([
    ['no WebGL2', { webgl2: false }, 'low'],
    ['small max texture', { maxTextureSize: 2048 }, 'low'],
    ['save-data', { saveData: true }, 'low'],
    ['2 GB device', { deviceMemoryGb: 2 }, 'low'],
    ['low-core phone', { coarsePointer: true, hardwareConcurrency: 4, viewportWidth: 390, viewportHeight: 844 }, 'low'],
    ['modern phone', { coarsePointer: true, hardwareConcurrency: 8, viewportWidth: 390, viewportHeight: 844 }, 'medium'],
    ['big desktop', {}, 'high'],
    ['small laptop window', { viewportWidth: 1100, viewportHeight: 700 }, 'medium'],
    ['unknown cores', { hardwareConcurrency: null }, 'medium'],
  ])('%s → %s', (_n, over, expected) => {
    expect(selectQuality(caps(over), 'auto', null)).toBe(expected);
  });
  it('parses only known ?quality values', () => {
    expect(parseQualityOverride('?quality=low')).toBe('low');
    expect(parseQualityOverride('?quality=ultra')).toBeNull();
    expect(parseQualityOverride('')).toBeNull();
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.9)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([], 0.9)).toBeNaN();
  });
});

describe('AdaptiveQuality', () => {
  const settings = experienceConfig.quality.adaptive;
  const feed = (a: AdaptiveQuality, ms: number, seconds: number) => {
    const decisions = [];
    for (let t = 0; t < seconds; t += ms / 1000) decisions.push(a.sample(ms / 1000));
    return decisions.filter((d) => d.kind !== 'none');
  };
  it('does nothing while frames are within budget', () => {
    expect(feed(new AdaptiveQuality(settings, 2, true), 16, 6)).toEqual([]);
  });
  it('steps DPR down, never below the floor, then disables shadows once', () => {
    const a = new AdaptiveQuality(settings, 1.5, true);
    const d = feed(a, 40, 20);
    expect(d.slice(0, 3)).toEqual([{ kind: 'lowerDpr', dpr: 1.25 }, { kind: 'lowerDpr', dpr: 1 }, { kind: 'lowerDpr', dpr: 0.75 }]);
    expect(d[3]).toEqual({ kind: 'disableShadows' });
    expect(d.length).toBe(4);
    expect(a.currentDpr).toBe(0.75);
  });
  it('ignores huge gaps (tab switches)', () => {
    const a = new AdaptiveQuality(settings, 2, true);
    expect(a.sample(5)).toEqual({ kind: 'none' });
  });
});

describe('PortfolioHandoff', () => {
  const base = { portfolioUrl: 'https://ahshika.github.io/', allowedOrigins: ['https://ahshika.github.io'] };

  it('refuses a destination outside the allowlist', () => {
    expect(() => new PortfolioHandoff({ ...base, portfolioUrl: 'https://evil.example/', navigate: vi.fn(), storage: null })).toThrow();
  });

  it('navigates exactly once and records the visit', () => {
    const navigate = vi.fn();
    const storage = { setItem: vi.fn() };
    const h = new PortfolioHandoff({ ...base, navigate, storage });
    expect(h.navigate()).toBe(true);
    expect(h.navigate()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://ahshika.github.io/');
    expect(storage.setItem).toHaveBeenCalledWith(VISITED_FLAG_KEY, '1');
  });

  it('still navigates when storage throws', () => {
    const navigate = vi.fn();
    const h = new PortfolioHandoff({ ...base, navigate, storage: { setItem: () => { throw new Error('denied'); } } });
    expect(h.navigate()).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('reports reachability from a HEAD request', async () => {
    const h = new PortfolioHandoff({ ...base, navigate: vi.fn(), storage: null });
    expect(h.isReachable).toBeNull();
    await h.checkReachable(vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch);
    expect(h.isReachable).toBe(true);
    await h.checkReachable(vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch);
    expect(h.isReachable).toBe(false);
    await h.checkReachable(vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch);
    expect(h.isReachable).toBe(false);
  });

  it('times out a hanging reachability check', async () => {
    const h = new PortfolioHandoff({ ...base, navigate: vi.fn(), storage: null });
    const hanging = ((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    await expect(h.checkReachable(hanging, 20)).resolves.toBe(false);
  });

  it('adds the prefetch hint once', () => {
    const h = new PortfolioHandoff({ ...base, navigate: vi.fn(), storage: null });
    h.warmUp(document);
    h.warmUp(document);
    expect(document.querySelectorAll('link[rel="prefetch"][data-dr-prefetch]').length).toBe(1);
  });
});

describe('StateMachine', () => {
  it('allows the documented path and ignores illegal transitions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sm = new StateMachine();
    const seen: string[] = [];
    sm.onChange((to) => seen.push(to));
    expect(sm.go('CHECKING')).toBe(true);
    expect(sm.go('DONE')).toBe(false);
    expect(sm.go('LOADING')).toBe(true);
    expect(sm.go('INTRO')).toBe(true);
    expect(sm.go('HANDOFF')).toBe(true);
    expect(sm.go('DONE')).toBe(true);
    expect(sm.go('INTRO')).toBe(false);
    expect(seen).toEqual(['CHECKING', 'LOADING', 'INTRO', 'HANDOFF', 'DONE']);
    warn.mockRestore();
  });
  it('lets every active state reach the fallback or the hand-off', () => {
    for (const path of [['CHECKING', 'FALLBACK', 'HANDOFF'], ['CHECKING', 'LOADING', 'FALLBACK'], ['CHECKING', 'LOADING', 'INTRO', 'SKIPPING', 'HANDOFF']] as const) {
      const sm = new StateMachine();
      for (const s of path) expect(sm.go(s)).toBe(true);
    }
  });
});

describe('solveTwoBone', () => {
  const shoulder = new Vector3(0.19, 1.0, 0);
  const pole = new Vector3(0.5, 0.6, 0.2);
  it('preserves bone lengths for a reachable target', () => {
    const elbow = new Vector3();
    const hand = new Vector3();
    const target = new Vector3(0.1, 0.8, -0.4);
    solveTwoBone(shoulder, target, pole, 0.3, 0.28, elbow, hand);
    expect(elbow.distanceTo(shoulder)).toBeCloseTo(0.3, 6);
    expect(hand.distanceTo(elbow)).toBeCloseTo(0.28, 6);
    expect(hand.distanceTo(target)).toBeLessThan(1e-6);
  });
  it('clamps an unreachable target to full extension along the same direction', () => {
    const elbow = new Vector3();
    const hand = new Vector3();
    solveTwoBone(shoulder, new Vector3(0.19, 1.0, -2), pole, 0.3, 0.28, elbow, hand);
    expect(hand.distanceTo(shoulder)).toBeCloseTo(0.579, 3);
    expect(hand.x).toBeCloseTo(0.19, 6);
  });
});

describe('layoutMessage', () => {
  // fake metrics: every character 0.62 em wide, cap height 0.7 em
  const measure = (text: string, px: number) => ({ width: text.length * px * 0.62, cap: px * 0.7 });
  const lines = [experienceConfig.text.line1, experienceConfig.text.line2] as const;
  it('keeps one row per line on landscape screens, fitting the width', () => {
    const l = layoutMessage(lines, false, 2048, 1152, measure);
    expect(l.rows).toEqual([[lines[0]], [lines[1]]]);
    expect(lines[1].length * l.fontPx * 0.62).toBeLessThanOrEqual(MESSAGE_LAYOUT.maxRowWidth * 2048 + 1e-6);
  });
  it('wraps on portrait into rows that still spell the exact mandatory text, with a larger font', () => {
    const land = layoutMessage(lines, false, 1024, 576, measure);
    const port = layoutMessage(lines, true, 1024, 576, measure);
    expect(port.rows.map((r) => r.join(' '))).toEqual([lines[0], lines[1]]);
    expect(port.capPx).toBeGreaterThan(land.capPx);
  });
});

describe('debug flags', () => {
  it('parse safely', () => {
    expect(parseSpeed('?speed=4')).toBe(4);
    expect(parseSpeed('?speed=100')).toBe(1);
    expect(parseSpeed('?speed=abc')).toBe(1);
    expect(parsePauseAt('?pauseAt=12.5')).toBe(12.5);
    expect(parsePauseAt('?pauseAt=-1')).toBeNull();
    expect(parsePauseAt('')).toBeNull();
  });
});
