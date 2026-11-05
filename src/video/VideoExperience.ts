import type { ExperienceConfig, QualityPreset, VideoSource } from '../config/experience.config';
import type { Experience, ExperienceHooks, ExperienceOptions } from '../experience/Experience';
import type { AudioManager } from '../services/AudioManager';

/**
 * Pre-rendered cinematic (Phase 3): plays the Blender/Cycles video of the story in place of the
 * real-time scene. Same contract as experience/Experience.ts, so ExperienceApp (Skip, fallback,
 * cover → hand-off, return ending) is unchanged.
 *
 * The video plays muted and inline (autoplay rules); its final frames are the portfolio grid, and
 * the DOM grid overlay fades in over them `coverLeadSeconds` before the end.
 */

const BASE = import.meta.env.BASE_URL;

export function pickSources(portrait: boolean, sources: ExperienceConfig['video']['sources']): readonly VideoSource[] {
  // the browser walks <source> elements in order and skips files that fail, so the other aspect is a fallback
  return portrait ? [...sources.portrait, ...sources.landscape] : [...sources.landscape, ...sources.portrait];
}

/** Latest story beat reached at time t (for the live region), or null before the first. */
export function beatAt(t: number, beats: ExperienceConfig['video']['beats'], text: ExperienceConfig['text']): string | null {
  const ordered: [number, string][] = [[beats.notification, text.notification], [beats.line1, text.line1], [beats.line2, text.line2], [beats.opening, 'Opening portfolio']];
  let current: string | null = null;
  for (const [at, label] of ordered) if (t >= at) current = label;
  return current;
}

export async function createExperience(
  container: HTMLElement,
  _presetName: string,
  _preset: QualityPreset,
  config: ExperienceConfig,
  _audio: AudioManager,
  hooks: ExperienceHooks,
  options: ExperienceOptions,
  onStep: (label: string) => void,
): Promise<Experience> {
  onStep('Loading the intro video');
  const v = config.video;
  const portrait = window.innerHeight > window.innerWidth;
  const video = document.createElement('video');
  video.className = 'dr-video';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('aria-hidden', 'true'); // the story is mirrored in the live region
  video.disablePictureInPicture = true;
  video.preload = 'auto';
  video.poster = BASE + (portrait ? v.poster.portrait : v.poster.landscape);
  // only formats this browser says it can decode; none at all → fail fast to the fallback
  const sources = pickSources(portrait, v.sources).filter((s) => video.canPlayType(s.type) !== '');
  if (sources.length === 0) throw new Error('this browser cannot play the intro video formats');
  for (const s of sources) {
    const el = document.createElement('source');
    el.src = BASE + s.src;
    el.type = s.type;
    video.appendChild(el);
  }
  container.appendChild(video);

  const listeners: [EventTarget, string, EventListener][] = [];
  const on = (t: EventTarget, ev: string, fn: EventListener) => {
    t.addEventListener(ev, fn);
    listeners.push([t, ev, fn]);
  };

  // ready when the first frames can play; fails only when every source failed
  onStep('Buffering');
  await new Promise<void>((resolve, reject) => {
    if (video.readyState >= 3) return resolve();
    // every <source> that fails fires its own error; when all have failed nothing can play
    let failed = 0;
    const timer = window.setTimeout(() => reject(new Error('the intro video did not start in time')), v.startTimeoutMs);
    const done = (fn: () => void) => () => {
      window.clearTimeout(timer);
      fn();
    };
    on(video, 'canplay', done(resolve));
    video.querySelectorAll('source').forEach((el) => on(el, 'error', () => {
      failed += 1;
      if (failed === sources.length) done(() => reject(new Error('no playable intro video')))();
    }));
    on(video, 'error', done(() => reject(new Error('intro video error'))));
  });

  let covered = false;
  let disposed = false;
  let lastBeat: string | null = null;
  let playButton: HTMLButtonElement | null = null;
  const pauseAt = options.pauseAt;

  const tick = () => {
    const t = video.currentTime;
    const beat = beatAt(t, v.beats, config.text);
    if (beat && beat !== lastBeat) {
      lastBeat = beat;
      hooks.announce(beat);
    }
    const d = video.duration;
    if (!covered && pauseAt === null && Number.isFinite(d) && t >= d - v.coverLeadSeconds) {
      covered = true;
      hooks.onCover(v.coverLeadSeconds);
    }
  };
  on(video, 'timeupdate', tick);
  on(video, 'seeked', tick);
  on(video, 'ended', () => {
    if (pauseAt !== null) return;
    if (!covered) {
      covered = true;
      hooks.onCover(0);
    }
    hooks.onHandoff();
  });

  /** Autoplay can still be refused (e.g. iOS Low Power Mode): offer one tap, never trap the visitor. */
  const offerTapToPlay = () => {
    if (playButton || disposed) return;
    playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'dr-btn dr-btn--primary dr-video__play';
    playButton.textContent = 'Play intro';
    playButton.setAttribute('aria-label', 'Play the intro video');
    playButton.addEventListener('click', () => {
      void video.play().then(() => {
        playButton?.remove();
        playButton = null;
      });
    });
    container.appendChild(playButton);
  };

  const play = () => {
    video.play().catch(offerTapToPlay);
  };

  return {
    start() {
      video.playbackRate = Math.min(8, Math.max(0.25, options.speed));
      if (pauseAt !== null) {
        // debug/test: freeze on one moment (never at the very end, which would trigger the hand-off)
        const d = Number.isFinite(video.duration) ? video.duration : pauseAt + 1;
        video.currentTime = Math.min(pauseAt, d - 0.05);
        video.pause();
        return;
      }
      if (options.reducedMotion) {
        // calm: one still frame with the message, then the same cover → hand-off
        video.currentTime = v.calm.frameSeconds;
        video.pause();
        hooks.announce(config.text.line1);
        window.setTimeout(() => {
          hooks.announce(config.text.line2);
        }, 1000);
        window.setTimeout(() => {
          if (disposed || covered) return;
          covered = true;
          hooks.onCover(0.6);
          window.setTimeout(() => !disposed && hooks.onHandoff(), 650);
        }, v.calm.holdSeconds * 1000);
        return;
      }
      play();
    },
    pause() {
      if (!video.paused) video.pause();
    },
    resume() {
      if (!disposed && pauseAt === null && !options.reducedMotion && !video.ended) play();
    },
    kill() {
      video.pause();
    },
    dispose() {
      if (disposed) return { geometries: 0, textures: 0 };
      disposed = true;
      video.pause();
      for (const [t, ev, fn] of listeners) t.removeEventListener(ev, fn);
      video.querySelectorAll('source').forEach((s) => s.remove());
      video.removeAttribute('src');
      video.load(); // releases the decoder and buffered media
      video.remove();
      playButton?.remove();
      return { geometries: 0, textures: 0 };
    },
    get stats() {
      return { triangles: 0, drawCalls: 0, dpr: window.devicePixelRatio || 1, preset: 'video' };
    },
  };
}
