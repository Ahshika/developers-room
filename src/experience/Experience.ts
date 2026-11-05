import { gsap } from 'gsap';
import { Vector3, type Color, type Mesh } from 'three';
import type { ExperienceConfig, QualityPreset } from '../config/experience.config';
import { SCREEN, PORTFOLIO_GRID } from '../config/layout';
import type { AudioManager } from '../services/AudioManager';
import { AdaptiveQuality } from '../services/QualityManager';
import { CameraDirector } from './camera/CameraDirector';
import { gridOnScreenCanvas } from './camera/framing';
import { Mannequin } from './character/Mannequin';
import { buildRoom } from './environment/Room';
import { Lighting } from './lighting/Lighting';
import { MonitorScreen } from './screens/MonitorScreen';
import { Stage, type DisposeReport } from './Stage';
import { buildCalmTimeline, buildMasterTimeline } from './timeline/MasterTimeline';
import { BlueprintReveal } from './transitions/BlueprintReveal';

export interface ExperienceHooks {
  announce(text: string): void;
  onCover(fadeSeconds: number): void;
  onHandoff(): void;
  onContextLost(): void;
}

export interface ExperienceOptions {
  reducedMotion: boolean;
  /** Debug/test time scale (1 = real time). */
  speed: number;
  /** Debug/test: freeze the timeline at this second (visual QA of a single beat). */
  pauseAt: number | null;
  devicePixelRatio: number;
}

export interface Experience {
  start(): void;
  pause(): void;
  resume(): void;
  /** Stops the timeline (Skip). Rendering continues until dispose(). */
  kill(): void;
  dispose(): DisposeReport;
  readonly stats: { triangles: number; drawCalls: number; dpr: number; preset: string };
}

/** Loads fonts used on the monitor canvas; never blocks longer than `timeoutMs`. */
async function loadFonts(timeoutMs: number): Promise<void> {
  if (!('fonts' in document)) return;
  const fonts = Promise.all([
    document.fonts.load('600 100px "Space Grotesk"'),
    document.fonts.load('500 40px "JetBrains Mono"'),
  ]);
  await Promise.race([fonts, new Promise((r) => setTimeout(r, timeoutMs))]).catch(() => undefined);
}

export async function createExperience(
  container: HTMLElement,
  presetName: string,
  preset: QualityPreset,
  config: ExperienceConfig,
  audio: AudioManager,
  hooks: ExperienceHooks,
  options: ExperienceOptions,
  onStep: (label: string) => void,
): Promise<Experience> {
  onStep('Loading fonts');
  await loadFonts(3000);

  onStep('Building the room');
  const stage = new Stage(container, preset, options.devicePixelRatio, hooks.onContextLost);
  const screen = new MonitorScreen(preset.screenCanvasWidth, preset.screenCanvasHeight, [config.text.line1, config.text.line2], config.text.notification);
  const room = buildRoom(screen.material, preset.cityLayers);
  const lighting = new Lighting(preset, room.practicals);
  const character = new Mannequin(room.chairPivot);
  if (preset.shadows !== 'none') room.chairPivot.traverse((o) => { if ((o as Mesh).isMesh) o.castShadow = true; });
  stage.scene.add(room.root, lighting.root);
  const blueprint = new BlueprintReveal(room.risers);
  stage.scene.add(blueprint.root);
  const director = new CameraDirector(stage.camera);
  const screenWorld = new Vector3(...SCREEN.center);

  const applyViewport = (w: number, h: number) => {
    director.setViewport(w, h);
    screen.setPortrait(h > w);
    director.setTextMetrics(screen.textMetrics);
    const cover = director.coverInfo();
    screen.setGridLayout(gridOnScreenCanvas(w / h, cover.vfov, cover.distance, h, screen.canvasWidth, screen.canvasHeight, PORTFOLIO_GRID.majorCssPx));
  };
  stage.onResize(applyViewport);
  stage.resize();

  const deps = {
    director, character, screen, lighting, blueprint,
    background: stage.scene.background as Color,
    audio,
    announce: hooks.announce,
    onCover: (fade: number) => hooks.onCover(fade),
    onHandoff: () => hooks.onHandoff(),
  };
  const tl = options.reducedMotion
    ? buildCalmTimeline(config.calmTimeline, config.text, deps)
    : buildMasterTimeline(config.timeline, config.text, deps);
  tl.timeScale(Math.min(8, Math.max(0.25, options.speed)));
  if (options.pauseAt !== null) tl.addPause(options.pauseAt);

  const adaptive = new AdaptiveQuality(config.quality.adaptive, stage.currentDpr, stage.shadowsEnabled);
  stage.onFrame((dt, elapsed) => {
    character.update(dt, elapsed, stage.camera, screenWorld);
    screen.update(dt);
    const glow = screen.glow();
    lighting.setScreenGlow(glow.color, glow.strength);
    director.update();
    const decision = adaptive.sample(dt);
    if (decision.kind === 'lowerDpr') stage.setDpr(decision.dpr);
    else if (decision.kind === 'disableShadows') {
      lighting.disableShadows();
      stage.disableShadows();
    }
  });

  // first frame + shader compilation before the loader disappears
  onStep('Compiling shaders');
  director.update();
  character.update(0, 0, stage.camera, screenWorld);
  screen.drawNow();
  // compileAsync is only an optimisation (the first render compiles anyway). It can stall in a
  // backgrounded tab, so it is capped and never blocks the intro.
  await Promise.race([
    stage.renderer.compileAsync(stage.scene, stage.camera).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
  stage.renderNow();

  let disposed = false;
  return {
    start() {
      stage.start();
      tl.play(0);
    },
    pause() {
      tl.pause();
      stage.stop();
    },
    resume() {
      if (disposed) return;
      stage.start();
      if (tl.progress() < 1) tl.resume();
    },
    kill() {
      tl.kill();
      gsap.killTweensOf([director.progress, screen.state]);
    },
    dispose() {
      if (disposed) return { geometries: 0, textures: 0 };
      disposed = true;
      tl.kill();
      screen.dispose();
      return stage.dispose();
    },
    get stats() {
      const info = stage.renderer.info.render;
      return { triangles: info.triangles, drawCalls: info.calls, dpr: stage.currentDpr, preset: presetName };
    },
  };
}
