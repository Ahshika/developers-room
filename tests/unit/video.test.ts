import { describe, expect, it } from 'vitest';
import { experienceConfig } from '../../src/config/experience.config';
import { beatAt, pickSources } from '../../src/video/VideoExperience';

const v = experienceConfig.video;
const text = experienceConfig.text;

describe('pickSources', () => {
  it('tries the portrait files first on tall screens, landscape as the fallback', () => {
    const p = pickSources(true, v.sources).map((s) => s.src);
    expect(p.slice(0, 2)).toEqual(v.sources.portrait.map((s) => s.src));
    expect(p.slice(2)).toEqual(v.sources.landscape.map((s) => s.src));
  });
  it('tries landscape first on wide screens', () => {
    expect(pickSources(false, v.sources)[0]?.src).toBe(v.sources.landscape[0]?.src);
  });
  it('lists WebM before MP4 in each aspect (open codec first, Safari falls through to MP4)', () => {
    expect(v.sources.landscape.map((s) => s.type)).toEqual(['video/webm', 'video/mp4']);
    expect(v.sources.portrait.map((s) => s.type)).toEqual(['video/webm', 'video/mp4']);
  });
});

describe('beatAt (live-region mirror of the video)', () => {
  it.each([
    [0, null],
    [v.beats.notification - 0.01, null],
    [v.beats.notification, text.notification],
    [v.beats.line1 + 0.1, text.line1],
    [v.beats.line2 + 0.1, text.line2],
    [v.beats.opening + 1, 'Opening portfolio'],
  ])('t=%s → %s', (t, expected) => {
    expect(beatAt(t, v.beats, text)).toBe(expected);
  });
});
