import type { ExperienceConfig, QualityLevel } from '../config/experience.config';
import type { DeviceCapabilities } from './DeviceCapabilities';

const LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export function parseQualityOverride(search: string): QualityLevel | null {
  const value = new URLSearchParams(search).get('quality');
  return LEVELS.includes(value as QualityLevel) ? (value as QualityLevel) : null;
}

/** Initial preset selection (PERFORMANCE_PLAN.md §2.1). Pure so it can be unit-tested. */
export function selectQuality(caps: DeviceCapabilities, configured: ExperienceConfig['quality']['default'], override: QualityLevel | null): QualityLevel {
  if (override) return override;
  if (configured !== 'auto') return configured;
  const lowCores = caps.hardwareConcurrency !== null && caps.hardwareConcurrency <= 4;
  if (
    !caps.webgl2 ||
    caps.maxTextureSize < 4096 ||
    caps.saveData ||
    (caps.deviceMemoryGb !== null && caps.deviceMemoryGb <= 2) ||
    (caps.coarsePointer && lowCores)
  ) {
    return 'low';
  }
  if (caps.coarsePointer || Math.min(caps.viewportWidth, caps.viewportHeight) < 600) return 'medium';
  if (caps.viewportWidth >= 1280 && caps.hardwareConcurrency !== null && caps.hardwareConcurrency >= 8) return 'high';
  return 'medium';
}

/** Nearest-rank percentile of a sample (0 < p <= 1). Returns NaN for an empty sample. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[rank] as number;
}

export type AdaptiveDecision = { kind: 'none' } | { kind: 'lowerDpr'; dpr: number } | { kind: 'disableShadows' };

/**
 * Runtime adaptation (PERFORMANCE_PLAN.md §2.2): samples frame times and steps quality down,
 * never up, so there is no visible popping mid-intro.
 */
export class AdaptiveQuality {
  private samples: number[] = [];
  private elapsed = 0;
  private steps = 0;
  private shadowsDisabled = false;
  private dpr: number;

  constructor(
    private readonly settings: ExperienceConfig['quality']['adaptive'],
    initialDpr: number,
    private readonly shadowsEnabled: boolean,
  ) {
    this.dpr = initialDpr;
  }

  get currentDpr(): number {
    return this.dpr;
  }

  /** Feed one frame delta (seconds). Returns a decision at the end of each sample window. */
  sample(deltaSeconds: number): AdaptiveDecision {
    if (!(deltaSeconds > 0) || deltaSeconds > 0.5) return { kind: 'none' }; // ignore tab-switch gaps
    this.samples.push(deltaSeconds * 1000);
    this.elapsed += deltaSeconds;
    if (this.elapsed < this.settings.sampleSeconds) return { kind: 'none' };
    const p90 = percentile(this.samples, 0.9);
    this.samples = [];
    this.elapsed = 0;
    if (p90 <= this.settings.p90BudgetMs) return { kind: 'none' };
    if (this.steps < this.settings.maxSteps && this.dpr - this.settings.dprStep >= this.settings.dprFloor - 1e-9) {
      this.steps++;
      this.dpr = Math.round((this.dpr - this.settings.dprStep) * 100) / 100;
      return { kind: 'lowerDpr', dpr: this.dpr };
    }
    if (this.shadowsEnabled && !this.shadowsDisabled) {
      this.shadowsDisabled = true;
      return { kind: 'disableShadows' };
    }
    return { kind: 'none' };
  }
}
