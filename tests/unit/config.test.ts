import { describe, expect, it } from 'vitest';
import { experienceConfig, MANDATORY_TEXT, type ExperienceConfig } from '../../src/config/experience.config';
import { isAllowedNavigationUrl, validateConfig } from '../../src/config/validateConfig';

const clone = (): ExperienceConfig => structuredClone(experienceConfig) as ExperienceConfig;

describe('validateConfig', () => {
  it('accepts the shipped configuration', () => {
    expect(validateConfig(experienceConfig)).toEqual([]);
  });

  it('rejects a portfolio URL on another origin (open-redirect guard)', () => {
    const c = clone();
    c.portfolioUrl = 'https://evil.example/';
    expect(validateConfig(c).join()).toMatch(/portfolioUrl/);
  });

  it('rejects non-https URLs', () => {
    const c = clone();
    c.fallbackUrl = 'http://ahshika.github.io/';
    c.experienceEntryUrl = 'http://ahshika.github.io/developers-room/';
    const errors = validateConfig(c).join('\n');
    expect(errors).toMatch(/fallbackUrl/);
    expect(errors).toMatch(/experienceEntryUrl must be https/);
  });

  it('rejects allowed origins that carry a path', () => {
    const c = clone();
    c.allowedNavigationOrigins = ['https://ahshika.github.io/path'];
    expect(validateConfig(c).join()).toMatch(/must be https:\/\/host/);
  });

  it('rejects out-of-order beats', () => {
    const c = clone();
    c.timeline.message2 = c.timeline.message1 - 1;
    expect(validateConfig(c).join()).toMatch(/timeline.message2/);
  });

  it('rejects negative or non-finite timings', () => {
    const c = clone();
    c.timeline.textFade = -1;
    c.timeline.nod = Number.NaN;
    const errors = validateConfig(c).join('\n');
    expect(errors).toMatch(/timeline.textFade/);
    expect(errors).toMatch(/timeline.nod/);
  });

  it('rejects a total duration outside 15..35 s', () => {
    const c = clone();
    c.timeline.handoff = 50;
    expect(validateConfig(c).join()).toMatch(/handoff/);
  });

  it('requires the final approach to end by the cover beat', () => {
    const c = clone();
    c.timeline.finalApproachDuration = 10;
    expect(validateConfig(c).join()).toMatch(/final approach/);
  });

  it('rejects an out-of-range DPR cap and a non-16:9 screen canvas', () => {
    const c = clone();
    c.quality.presets.high.dprCap = 3;
    c.quality.presets.low.screenCanvasHeight = 600;
    const errors = validateConfig(c).join('\n');
    expect(errors).toMatch(/high.dprCap/);
    expect(errors).toMatch(/16:9/);
  });

  it('guards every mandatory text against accidental edits', () => {
    for (const key of Object.keys(MANDATORY_TEXT) as (keyof typeof MANDATORY_TEXT)[]) {
      const c = clone();
      (c.text as Record<string, string>)[key] = `${MANDATORY_TEXT[key]} `;
      expect(validateConfig(c).join()).toMatch(new RegExp(`text.${key}`));
    }
  });

  it.each(['https://evil.example/x.mp4', '/media/x.mp4', '../x.mp4', 'media/../../x.webm', 'media/x.exe', 'javascript:alert(1)'])(
    'rejects unsafe video path %s', (bad) => {
      const c = clone();
      (c.video.sources.landscape as { src: string; type: 'video/mp4' }[])[0] = { src: bad, type: 'video/mp4' };
      expect(validateConfig(c).join()).toMatch(/relative media path/);
    });

  it('rejects an unknown mode and out-of-order video beats', () => {
    const c = clone();
    (c as { mode: string }).mode = 'vr';
    c.video.beats.line2 = c.video.beats.line1 - 1;
    const errors = validateConfig(c).join(' | ');
    expect(errors).toMatch(/mode must be/);
    expect(errors).toMatch(/video.beats/);
  });

  it('keeps the exact mandatory wording', () => {
    expect(experienceConfig.text.notification).toBe('NEW VISITOR DETECTED');
    expect(experienceConfig.text.line1).toBe('WELCOME TO MY WORLD.');
    expect(experienceConfig.text.line2).toBe('I BUILD THINGS THAT MATTER.');
  });
});

describe('isAllowedNavigationUrl', () => {
  const allowed = ['https://ahshika.github.io'];
  it.each([
    ['https://ahshika.github.io/', true],
    ['https://ahshika.github.io/#projects', true],
    ['http://ahshika.github.io/', false],
    ['https://ahshika.github.io.evil.com/', false],
    ['https://user:pass@ahshika.github.io/', false],
    ['javascript:alert(1)', false],
    ['//ahshika.github.io/', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isAllowedNavigationUrl(url, allowed)).toBe(expected);
  });
});
