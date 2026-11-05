/**
 * THE single source of truth for URLs, timings, texts and quality presets.
 * Changing the portfolio destination or any beat of the intro happens here and nowhere else.
 * Values mirror docs/STORYBOARD.md §4; validateConfig() enforces the rules in docs/ARCHITECTURE.md §5.
 */

export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Upper bound for renderer pixel ratio. */
  dprCap: number;
  antialias: boolean;
  shadows: 'none' | 'pcf' | 'pcfsoft';
  shadowMapSize: number;
  monitorGlow: 'point' | 'rect';
  cityLayers: number;
  /**
   * Main monitor CanvasTexture resolution (16:9). Measured 2026-11-03: a 2048×1152 canvas redrawn
   * and re-uploaded at 30 Hz during the code scroll halved the frame rate (p50 33 ms vs 16.7 ms on
   * an RTX 5060), so every preset uses 1024×576.
   */
  screenCanvasWidth: number;
  screenCanvasHeight: number;
}

/** Seconds from the moment critical assets are ready. */
export interface TimelineConfig {
  loaderFadeOut: number;
  blueprintDraw: number;
  extrudeStart: number;
  extrudeDuration: number;
  practicalsOn: number;
  codeFadeIn: number;
  establishStart: number;
  establishDuration: number;
  workingStart: number;
  workingDuration: number;
  notification: number;
  stopTyping: number;
  headReaction: number;
  reactionCamDuration: number;
  chairTurn: number;
  chairTurnDuration: number;
  lookAtVisitor: number;
  acknowledgeCamDuration: number;
  nod: number;
  turnToMonitor: number;
  messageCamDuration: number;
  point: number;
  pointDuration: number;
  message1: number;
  message2: number;
  textFade: number;
  armDown: number;
  approachMidDuration: number;
  gridCrossfadeStart: number;
  gridCrossfadeDuration: number;
  finalApproach: number;
  finalApproachDuration: number;
  cover: number;
  overlayFade: number;
  handoff: number;
}

/** Reduced-motion ("calm") variant, STORYBOARD.md §4.2. */
export interface CalmTimelineConfig {
  roomCrossfade: number;
  notification: number;
  faceVisitor: number;
  message1: number;
  message2: number;
  gridFade: number;
  gridFadeDuration: number;
  handoff: number;
}

/** One encoded file of the pre-rendered intro (path relative to the site base, e.g. "media/x.webm"). */
export interface VideoSource {
  src: string;
  type: 'video/webm' | 'video/mp4';
}

/**
 * Pre-rendered cinematic (Phase 3): Blender/Cycles video of the full story. Every beat below is in
 * seconds of the video and must match tools/blender/build_story.py (T = {...}).
 */
export interface VideoConfig {
  /** Tried in order; the browser picks the first it can play. Portrait files are tried first on tall screens. */
  sources: { landscape: readonly VideoSource[]; portrait: readonly VideoSource[] };
  poster: { landscape: string; portrait: string };
  /** Give up on the video (→ fallback) if it cannot start playing within this time. */
  startTimeoutMs: number;
  /** The DOM grid overlay starts this long before the end, over the video's final grid frames. */
  coverLeadSeconds: number;
  /** Screen-reader announcements, mirrored from the video (sound-independent story). */
  beats: { notification: number; line1: number; line2: number; opening: number };
  /** Reduced motion: hold one still frame (message visible) instead of playing the camera moves. */
  calm: { frameSeconds: number; holdSeconds: number };
}

export interface ExperienceConfig {
  experienceEntryUrl: string;
  portfolioUrl: string;
  fallbackUrl: string;
  allowedNavigationOrigins: readonly string[];
  /** "video": pre-rendered Blender cinematic (default). "3d": the real-time Three.js prototype (Phase 2). */
  mode: 'video' | '3d';
  video: VideoConfig;
  intro: {
    enabled: boolean;
    skipEnabled: boolean;
    loadTimeoutMs: number;
    reducedMotionMode: 'calm' | 'skip';
    /** Skip duration of the cover fade when Skip is pressed mid-intro. */
    skipFadeSeconds: number;
  };
  audio: { defaultMuted: boolean; masterVolume: number };
  quality: {
    default: 'auto' | QualityLevel;
    presets: Record<QualityLevel, QualityPreset>;
    /** Runtime adaptation (PERFORMANCE_PLAN.md §2.2). */
    adaptive: { sampleSeconds: number; p90BudgetMs: number; dprStep: number; dprFloor: number; maxSteps: number };
  };
  timeline: TimelineConfig;
  calmTimeline: CalmTimelineConfig;
  text: {
    loading: string;
    notification: string;
    line1: string;
    line2: string;
    endingLine1: string;
    endingLine2: string;
  };
}

export const MANDATORY_TEXT = {
  notification: 'NEW VISITOR DETECTED',
  line1: 'WELCOME TO MY WORLD.',
  line2: 'I BUILD THINGS THAT MATTER.',
  endingLine1: 'THANK YOU FOR VISITING.',
  endingLine2: "LET'S BUILD SOMETHING GREAT.",
} as const;

export const experienceConfig: ExperienceConfig = {
  experienceEntryUrl: 'https://ahshika.github.io/developers-room/',
  portfolioUrl: 'https://ahshika.github.io/',
  fallbackUrl: 'https://ahshika.github.io/',
  allowedNavigationOrigins: ['https://ahshika.github.io'],
  mode: 'video',
  video: {
    sources: {
      landscape: [
        { src: 'media/story-landscape.webm', type: 'video/webm' },
        { src: 'media/story-landscape.mp4', type: 'video/mp4' },
      ],
      portrait: [
        { src: 'media/story-portrait.webm', type: 'video/webm' },
        { src: 'media/story-portrait.mp4', type: 'video/mp4' },
      ],
    },
    poster: { landscape: 'media/story-poster.jpg', portrait: 'media/story-poster-portrait.jpg' },
    startTimeoutMs: 8000,
    coverLeadSeconds: 0.35,
    beats: { notification: 8.0, line1: 14.2, line2: 15.4, opening: 16.6 },
    calm: { frameSeconds: 15.9, holdSeconds: 3.5 },
  },
  intro: {
    enabled: true,
    skipEnabled: true,
    loadTimeoutMs: 15000,
    reducedMotionMode: 'calm',
    skipFadeSeconds: 0.3,
  },
  audio: { defaultMuted: true, masterVolume: 0.6 },
  quality: {
    default: 'auto',
    presets: {
      low: {
        dprCap: 1.25, antialias: false, shadows: 'none', shadowMapSize: 512,
        monitorGlow: 'point', cityLayers: 2, screenCanvasWidth: 1024, screenCanvasHeight: 576,
      },
      medium: {
        dprCap: 1.5, antialias: true, shadows: 'pcf', shadowMapSize: 1024,
        monitorGlow: 'rect', cityLayers: 3, screenCanvasWidth: 1024, screenCanvasHeight: 576,
      },
      high: {
        dprCap: 2, antialias: true, shadows: 'pcfsoft', shadowMapSize: 2048,
        monitorGlow: 'rect', cityLayers: 4, screenCanvasWidth: 1024, screenCanvasHeight: 576,
      },
    },
    adaptive: { sampleSeconds: 2, p90BudgetMs: 25, dprStep: 0.25, dprFloor: 0.75, maxSteps: 3 },
  },
  timeline: {
    loaderFadeOut: 0.4,
    blueprintDraw: 1.5,
    extrudeStart: 1.5,
    extrudeDuration: 1.5,
    practicalsOn: 2.2,
    codeFadeIn: 2.6,
    establishStart: 3.0,
    establishDuration: 2.0,
    workingStart: 5.0,
    workingDuration: 4.0,
    notification: 9.0,
    stopTyping: 9.4,
    headReaction: 10.1,
    reactionCamDuration: 2.0,
    chairTurn: 10.6,
    chairTurnDuration: 1.3,
    lookAtVisitor: 12.0,
    acknowledgeCamDuration: 1.2,
    nod: 12.5,
    turnToMonitor: 13.4,
    messageCamDuration: 1.6,
    point: 14.2,
    pointDuration: 0.8,
    message1: 14.6,
    message2: 16.0,
    textFade: 0.8,
    armDown: 17.2,
    approachMidDuration: 3.4,
    gridCrossfadeStart: 20.4,
    gridCrossfadeDuration: 1.0,
    finalApproach: 20.6,
    finalApproachDuration: 1.6,
    cover: 22.2,
    overlayFade: 0.25,
    handoff: 22.5,
  },
  calmTimeline: {
    roomCrossfade: 0.8,
    notification: 1.4,
    faceVisitor: 2.0,
    message1: 2.8,
    message2: 4.0,
    gridFade: 5.8,
    gridFadeDuration: 0.6,
    handoff: 6.4,
  },
  text: {
    loading: 'INITIALIZING YOUR EXPERIENCE...',
    ...MANDATORY_TEXT,
  },
};
