import type { ExperienceConfig } from '../config/experience.config';
import { validateConfig } from '../config/validateConfig';
import type { Experience, ExperienceHooks, ExperienceOptions } from '../experience/Experience';
import { PortfolioHandoff, VISITED_FLAG_KEY } from '../portfolio/PortfolioHandoff';
import { AudioManager, readSoundPreference } from '../services/AudioManager';
import type { DeviceCapabilities } from '../services/DeviceCapabilities';
import { parseQualityOverride, selectQuality } from '../services/QualityManager';
import type { Ui } from '../ui/Ui';
import { StateMachine, type AppState } from './stateMachine';

type CreateExperience = (
  container: HTMLElement, presetName: string, preset: ExperienceConfig['quality']['presets']['low'], config: ExperienceConfig,
  audio: AudioManager, hooks: ExperienceHooks, options: ExperienceOptions, onStep: (label: string) => void,
) => Promise<Experience>;

export interface AppDeps {
  detect(): DeviceCapabilities;
  /** Lazy import of the 3D chunk (three + gsap + scene). */
  loadExperience(): Promise<{ createExperience: CreateExperience }>;
  navigate(url: string): void;
  reload(): void;
  storage: Storage | null;
  search: string;
  fetch: typeof fetch;
}

const LOAD_STEPS = 4;
const ACTIVE: readonly AppState[] = ['LOADING', 'INTRO', 'SKIPPING'];

/**
 * Orchestrates the whole visit (ARCHITECTURE.md §3): checks, loading, intro, Skip, hand-off,
 * fallback and the return ending. Guarantees a path to the portfolio from every state.
 */
export class ExperienceApp {
  readonly sm = new StateMachine();
  private experience: Experience | null = null;
  private handoff: PortfolioHandoff | null = null;
  private audio: AudioManager;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private stepIndex = 0;

  constructor(private readonly config: ExperienceConfig, private readonly ui: Ui, private readonly deps: AppDeps) {
    this.audio = new AudioManager(config.audio.masterVolume);
    this.sm.onChange((to) => ui.setState(to));
    ui.setState(this.sm.state);
  }

  get state(): AppState {
    return this.sm.state;
  }

  async boot(): Promise<void> {
    this.sm.go('CHECKING');
    const errors = validateConfig(this.config);
    if (errors.length > 0) {
      console.error('[dr] invalid configuration:', errors);
      this.ui.hideControls();
      this.ui.hideLoader();
      this.sm.go('FALLBACK');
      this.ui.showFallback('The experience is misconfigured. You can go straight to the portfolio.');
      return;
    }
    this.handoff = new PortfolioHandoff({
      portfolioUrl: this.config.portfolioUrl,
      allowedOrigins: this.config.allowedNavigationOrigins,
      navigate: this.deps.navigate,
      storage: this.deps.storage,
    });
    this.ui.onSkip(() => void this.skip());

    if (this.readVisited()) {
      this.sm.go('RETURNING');
      this.ui.showEnding(() => this.replay());
      return;
    }

    const caps = this.deps.detect();
    const reduced = caps.reducedMotion;
    if (!this.config.intro.enabled || (reduced && this.config.intro.reducedMotionMode === 'skip')) {
      this.finish();
      return;
    }
    // only the real-time 3D mode needs WebGL 2; the pre-rendered video plays everywhere
    if (this.config.mode === '3d' && !caps.webgl2) {
      this.sm.go('FALLBACK');
      this.ui.showFallback('Your browser or device does not support WebGL 2, which the 3D intro needs.');
      return;
    }

    this.sm.go('LOADING');
    this.ui.bindSound(this.audio);
    this.armSoundPreference();
    this.watchdog = setTimeout(() => this.fail('Loading took too long on this connection.'), this.config.intro.loadTimeoutMs);

    const qualityName = selectQuality(caps, this.config.quality.default, parseQualityOverride(this.deps.search));
    const preset = this.config.quality.presets[qualityName];
    document.documentElement.dataset.drQuality = qualityName;

    try {
      this.nextStep('Loading 3D engine');
      const mod = await this.deps.loadExperience();
      if (this.state !== 'LOADING') return;
      const experience = await mod.createExperience(
        this.ui.stage, qualityName, preset, this.config, this.audio,
        {
          announce: (t) => this.ui.announce(t),
          onCover: (fade) => this.onCover(fade),
          onHandoff: () => this.finish(),
          onContextLost: () => this.fail('The graphics context was lost.'),
        },
        { reducedMotion: reduced, speed: parseSpeed(this.deps.search), pauseAt: parsePauseAt(this.deps.search), devicePixelRatio: caps.devicePixelRatio },
        (label) => this.nextStep(label),
      );
      if (this.state !== 'LOADING') {
        experience.dispose();
        return;
      }
      this.experience = experience;
    } catch (err) {
      console.error('[dr] failed to start the experience', err);
      this.fail('The intro could not be loaded on this device.');
      return;
    }

    this.clearWatchdog();
    this.sm.go('INTRO');
    this.ui.hideLoader();
    this.handoff.warmUp();
    void this.handoff.checkReachable(this.deps.fetch);
    this.experience.start();
    const stats = this.experience.stats;
    document.documentElement.dataset.drDpr = String(stats.dpr);
  }

  /** Skip Intro: available while loading and throughout the intro; never navigates twice. */
  async skip(): Promise<void> {
    if (this.state === 'LOADING') {
      this.clearWatchdog();
      this.sm.go('SKIPPING');
      this.finish();
      return;
    }
    if (this.state !== 'INTRO') return;
    this.sm.go('SKIPPING');
    this.experience?.kill();
    await this.ui.showOverlay(this.config.intro.skipFadeSeconds);
    this.disposeExperience();
    this.finish();
  }

  /** Called on unrecoverable problems: show the fallback, keep the portfolio one click away. */
  fail(reason: string): void {
    if (!ACTIVE.includes(this.state)) return;
    this.clearWatchdog();
    this.disposeExperience();
    this.sm.go('FALLBACK');
    this.ui.showFallback(reason);
  }

  onVisibilityChange(hidden: boolean): void {
    if (this.state !== 'INTRO' || !this.experience) return;
    if (hidden) this.experience.pause();
    else this.experience.resume();
  }

  /** bfcache restore after the visitor pressed Back from the portfolio. */
  onPageShow(persisted: boolean): void {
    if (persisted && this.state === 'DONE') {
      this.sm.go('RETURNING');
      this.ui.showEnding(() => this.replay());
    }
  }

  /**
   * The screen covers the viewport: fade the grid overlay in, release the GPU, then hand off.
   * The hand-off is chained here (not left to a later timeline beat), because disposing the
   * experience kills the timeline; a separate beat could be lost to that race.
   */
  private onCover(fadeSeconds: number): void {
    if (this.state !== 'INTRO') return;
    void this.ui.showOverlay(fadeSeconds).then(() => {
      this.disposeExperience();
      if (this.state === 'INTRO') this.finish();
    });
  }

  private finish(): void {
    const handoff = this.handoff;
    if (!handoff) return;
    if (handoff.isReachable === false) {
      if (this.sm.go('UNREACHABLE')) {
        this.ui.showUnreachable(() => {
          void handoff.checkReachable(this.deps.fetch).then(() => this.finish());
        });
      }
      return;
    }
    if (this.state !== 'HANDOFF' && !this.sm.go('HANDOFF')) return;
    this.ui.hideControls();
    if (handoff.navigate()) this.sm.go('DONE');
  }

  private replay(): void {
    try {
      this.deps.storage?.removeItem(VISITED_FLAG_KEY);
    } catch {
      // ignore: reload still replays when storage is unavailable
    }
    this.deps.reload();
  }

  private readVisited(): boolean {
    try {
      return this.deps.storage?.getItem(VISITED_FLAG_KEY) === '1';
    } catch {
      return false;
    }
  }

  private nextStep(label: string): void {
    this.stepIndex = Math.min(LOAD_STEPS, this.stepIndex + 1);
    this.ui.setStep(this.stepIndex, LOAD_STEPS, label);
  }

  /** A remembered "sound on" preference resumes audio on the first user gesture (autoplay rules). */
  private armSoundPreference(): void {
    if (readSoundPreference() !== true || !this.audio.isSupported) return;
    const once = () => {
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
      if (!this.audio.isEnabled) void this.audio.setEnabled(true);
    };
    window.addEventListener('pointerdown', once, { once: true });
    window.addEventListener('keydown', once, { once: true });
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private disposeExperience(): void {
    const exp = this.experience;
    this.experience = null;
    if (exp) {
      const report = exp.dispose();
      document.documentElement.dataset.drDisposed = `${report.geometries}/${report.textures}`;
    }
    this.audio.dispose();
  }
}

/** Debug/test time scale, e.g. ?speed=4. Clamped; can never affect navigation. */
export function parseSpeed(search: string): number {
  const v = Number(new URLSearchParams(search).get('speed'));
  return Number.isFinite(v) && v >= 0.25 && v <= 8 ? v : 1;
}

/** Debug/test: ?pauseAt=12.5 freezes the intro at that second. Never affects navigation. */
export function parsePauseAt(search: string): number | null {
  const raw = new URLSearchParams(search).get('pauseAt');
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 60 ? v : null;
}
