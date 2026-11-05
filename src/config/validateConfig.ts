import { MANDATORY_TEXT, type ExperienceConfig, type QualityPreset, type TimelineConfig } from './experience.config';

/** Beats that must occur in this order (STORYBOARD.md §4). */
export const ORDERED_BEATS: readonly (keyof TimelineConfig)[] = [
  'extrudeStart', 'establishStart', 'workingStart', 'notification', 'stopTyping', 'headReaction',
  'chairTurn', 'lookAtVisitor', 'nod', 'turnToMonitor', 'point', 'message1', 'message2', 'armDown',
  'gridCrossfadeStart', 'finalApproach', 'cover', 'handoff',
];

export const TOTAL_DURATION_RANGE = { min: 15, max: 35 } as const;

/** Returns true only for an absolute https URL whose origin is allow-listed. */
export function isAllowedNavigationUrl(url: string, allowedOrigins: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && allowedOrigins.includes(parsed.origin) && parsed.username === '' && parsed.password === '';
}

function checkPreset(name: string, p: QualityPreset, errors: string[]): void {
  if (!(p.dprCap >= 0.5 && p.dprCap <= 2)) errors.push(`quality.presets.${name}.dprCap must be within 0.5..2`);
  if (!Number.isInteger(p.shadowMapSize) || p.shadowMapSize < 256 || p.shadowMapSize > 4096) {
    errors.push(`quality.presets.${name}.shadowMapSize must be an integer within 256..4096`);
  }
  if (!Number.isInteger(p.cityLayers) || p.cityLayers < 1 || p.cityLayers > 6) errors.push(`quality.presets.${name}.cityLayers must be 1..6`);
  if (p.screenCanvasWidth * 9 !== p.screenCanvasHeight * 16) errors.push(`quality.presets.${name} screen canvas must be 16:9`);
}

/** Validates the configuration. Returns a list of human-readable errors (empty when valid). */
export function validateConfig(config: ExperienceConfig): string[] {
  const errors: string[] = [];

  if (config.allowedNavigationOrigins.length === 0) errors.push('allowedNavigationOrigins must not be empty');
  for (const origin of config.allowedNavigationOrigins) {
    if (!/^https:\/\/[^/]+$/.test(origin)) errors.push(`allowed origin "${origin}" must be https://host with no path`);
  }
  for (const key of ['portfolioUrl', 'fallbackUrl'] as const) {
    if (!isAllowedNavigationUrl(config[key], config.allowedNavigationOrigins)) {
      errors.push(`${key} must be an https URL on an allowed origin`);
    }
  }
  try {
    if (new URL(config.experienceEntryUrl).protocol !== 'https:') errors.push('experienceEntryUrl must be https');
  } catch {
    errors.push('experienceEntryUrl is not a valid URL');
  }

  const t = config.timeline;
  for (const [k, v] of Object.entries(t)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`timeline.${k} must be a finite number >= 0`);
  }
  for (let i = 1; i < ORDERED_BEATS.length; i++) {
    const prev = ORDERED_BEATS[i - 1] as keyof TimelineConfig;
    const cur = ORDERED_BEATS[i] as keyof TimelineConfig;
    if (!(t[cur] >= t[prev])) errors.push(`timeline.${cur} (${t[cur]}) must not be earlier than timeline.${prev} (${t[prev]})`);
  }
  if (t.handoff < TOTAL_DURATION_RANGE.min || t.handoff > TOTAL_DURATION_RANGE.max) {
    errors.push(`timeline.handoff (${t.handoff}s) must be within ${TOTAL_DURATION_RANGE.min}..${TOTAL_DURATION_RANGE.max}s`);
  }
  if (t.finalApproach + t.finalApproachDuration > t.cover + 1e-9) errors.push('final approach must end at or before timeline.cover');
  if (t.cover + t.overlayFade > t.handoff + 1e-9) errors.push('overlay fade must finish at or before timeline.handoff');

  const c = config.calmTimeline;
  const calmOrder = [c.notification, c.faceVisitor, c.message1, c.message2, c.gridFade, c.handoff];
  if (calmOrder.some((v, i) => !Number.isFinite(v) || v < 0 || (i > 0 && v < (calmOrder[i - 1] as number)))) {
    errors.push('calmTimeline beats must be finite, >= 0 and in order');
  }
  if (c.gridFade + c.gridFadeDuration > c.handoff + 1e-9) errors.push('calmTimeline grid fade must finish before handoff');

  for (const [name, preset] of Object.entries(config.quality.presets)) checkPreset(name, preset, errors);
  const a = config.quality.adaptive;
  if (!(a.dprFloor > 0 && a.dprStep > 0 && a.maxSteps >= 0 && a.p90BudgetMs > 0 && a.sampleSeconds > 0)) {
    errors.push('quality.adaptive values must be positive');
  }

  if (!(config.audio.masterVolume >= 0 && config.audio.masterVolume <= 1)) errors.push('audio.masterVolume must be within 0..1');
  if (!(config.intro.loadTimeoutMs >= 3000)) errors.push('intro.loadTimeoutMs must be >= 3000');
  if (!(config.intro.skipFadeSeconds >= 0 && config.intro.skipFadeSeconds <= 1)) errors.push('intro.skipFadeSeconds must be within 0..1');

  if (config.mode !== 'video' && config.mode !== '3d') errors.push('mode must be "video" or "3d"');
  // media paths are site-relative files only: no scheme, no absolute path, no traversal
  const SAFE_MEDIA = /^(?!\/)(?!.*\.\.)[\w\-./]+\.(webm|mp4|jpg|png|webp)$/;
  const v = config.video;
  const files = [...v.sources.landscape, ...v.sources.portrait].map((x) => x.src).concat([v.poster.landscape, v.poster.portrait]);
  for (const f of files) if (!SAFE_MEDIA.test(f)) errors.push(`video file "${f}" must be a relative media path`);
  if (v.sources.landscape.length === 0) errors.push('video.sources.landscape must not be empty');
  if (!(v.coverLeadSeconds >= 0 && v.coverLeadSeconds <= 1)) errors.push('video.coverLeadSeconds must be within 0..1');
  if (!(v.startTimeoutMs >= 2000 && v.startTimeoutMs < config.intro.loadTimeoutMs)) errors.push('video.startTimeoutMs must be ≥ 2000 and below intro.loadTimeoutMs');
  const b = v.beats;
  if (![b.notification, b.line1, b.line2, b.opening].every((x, i, a) => Number.isFinite(x) && x >= 0 && (i === 0 || x >= (a[i - 1] as number)))) {
    errors.push('video.beats must be finite and in order');
  }
  if (!(v.calm.frameSeconds >= 0 && v.calm.holdSeconds > 0)) errors.push('video.calm values must be positive');

  for (const [k, v] of Object.entries(MANDATORY_TEXT)) {
    if (config.text[k as keyof typeof MANDATORY_TEXT] !== v) errors.push(`text.${k} must be exactly "${v}"`);
  }
  return errors;
}
