import { gsap } from 'gsap';
import { Color } from 'three';
import type { CalmTimelineConfig, ExperienceConfig, TimelineConfig } from '../../config/experience.config';
import type { ShotName } from '../../config/layout';
import type { Cue } from '../../services/AudioManager';
import type { CameraDirector } from '../camera/CameraDirector';
import type { CharacterController } from '../character/CharacterController';
import type { Lighting } from '../lighting/Lighting';
import type { MonitorScreen } from '../screens/MonitorScreen';
import type { BlueprintReveal } from '../transitions/BlueprintReveal';

export interface TimelineDeps {
  director: CameraDirector;
  character: CharacterController;
  screen: MonitorScreen;
  lighting: Lighting;
  blueprint: BlueprintReveal;
  background: Color;
  audio: { cue(c: Cue): void; setTyping(on: boolean): void; fadeOut(s: number): void };
  announce(text: string): void;
  /** Screen covers the viewport: show the DOM grid overlay and stop rendering. */
  onCover(fadeSeconds: number): void;
  /** Final beat: navigate to the portfolio. */
  onHandoff(): void;
}

const BLUEPRINT_BG = '#151a20';
/** three's Color converts hex (sRGB) to its linear working space, so tweening r/g/b is correct. */
const ROOM_BG = new Color('#04070c');

function move(tl: gsap.core.Timeline, d: CameraDirector, from: ShotName, to: ShotName, at: number, duration: number, ease = 'power2.inOut'): void {
  tl.fromTo(d.progress, { value: 0 }, { value: 1, duration, ease, immediateRender: false, onStart: () => d.beginMove(from, to) }, at);
}

/**
 * Builds the full cinematic as ONE GSAP timeline from config (STORYBOARD.md §4): camera, character,
 * monitor, lights, audio cues and accessibility announcements share a single clock, and Skip is a
 * single kill().
 */
export function buildMasterTimeline(t: TimelineConfig, text: ExperienceConfig['text'], deps: TimelineDeps): gsap.core.Timeline {
  const { director: d, character: c, screen, lighting, blueprint } = deps;
  const tl = gsap.timeline({ paused: true });
  const s = screen.state;
  const lights = { level: 0, practicals: 0 };
  const applyLights = () => {
    lighting.setLevel(lights.level);
    lighting.setPracticals(lights.practicals);
  };

  // S01a/b — blueprint draws in, the room extrudes and powers up
  d.hold('establishStart');
  d.blueprintTilt.value = 10;
  blueprint.reset();
  applyLights();
  deps.background.set(BLUEPRINT_BG);
  blueprint.schedule(tl, 0, t.blueprintDraw, t.extrudeStart, t.extrudeDuration);
  tl.to(d.blueprintTilt, { value: 0, duration: t.extrudeDuration + 0.5, ease: 'power2.inOut' }, t.extrudeStart);
  tl.to(lights, { level: 1, duration: t.extrudeDuration + 0.4, ease: 'sine.inOut', onUpdate: applyLights }, t.extrudeStart);
  tl.to(lights, { practicals: 1, duration: 0.8, ease: 'steps(5)', onUpdate: applyLights }, t.practicalsOn);
  tl.to(deps.background, { r: ROOM_BG.r, g: ROOM_BG.g, b: ROOM_BG.b, duration: t.extrudeDuration, ease: 'sine.inOut' }, t.extrudeStart);
  tl.call(() => deps.audio.cue('hum'), [], t.extrudeStart);
  tl.to(s, { code: 1, duration: 0.6, ease: 'sine.out' }, t.codeFadeIn);
  c.schedule(tl, 'typing', 0, 0.01);
  tl.call(() => deps.audio.setTyping(true), [], t.extrudeStart + 0.6);

  // S01c / S02 — establishing shot, then the developer working
  move(tl, d, 'establishStart', 'establishEnd', t.establishStart, t.establishDuration);
  move(tl, d, 'establishEnd', 'working', t.workingStart, t.workingDuration, 'power1.inOut');

  // S03 — NEW VISITOR DETECTED
  tl.to(s, { notify: 1, duration: 0.35, ease: 'power3.out' }, t.notification);
  tl.to(s, { notify: 1.3, duration: 0.18, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t.notification + 0.4);
  tl.call(() => {
    deps.audio.cue('chime');
    deps.announce(text.notification);
  }, [], t.notification);
  c.schedule(tl, 'stopTyping', t.stopTyping);
  tl.call(() => deps.audio.setTyping(false), [], t.stopTyping);
  c.schedule(tl, 'headReaction', t.headReaction);
  move(tl, d, 'working', 'reaction', t.headReaction, t.reactionCamDuration);
  c.schedule(tl, 'chairTurn', t.chairTurn, t.chairTurnDuration);
  tl.call(() => deps.audio.cue('creak'), [], t.chairTurn);

  // S04 — acknowledging the visitor, then turning to the monitor and pointing
  c.schedule(tl, 'lookTowardVisitor', t.lookAtVisitor, 1.0);
  move(tl, d, 'reaction', 'acknowledge', t.lookAtVisitor, t.acknowledgeCamDuration);
  c.schedule(tl, 'nod', t.nod);
  tl.to(s, { notify: 0.6, duration: 0.5 }, t.lookAtVisitor);
  c.schedule(tl, 'lookTowardMonitor', t.turnToMonitor, 1.2);
  move(tl, d, 'acknowledge', 'message', t.turnToMonitor, t.messageCamDuration);
  c.schedule(tl, 'pointTowardMonitor', t.point, t.pointDuration);
  tl.to(s, { notify: 0, duration: 0.4, ease: 'sine.in' }, t.point);

  // S05 — the message (exact mandatory text, drawn on the monitor)
  tl.to(s, { msg1: 1, duration: t.textFade, ease: 'sine.out' }, t.message1);
  tl.call(() => {
    deps.audio.cue('swell');
    deps.announce(text.line1);
  }, [], t.message1);
  tl.to(s, { msg2: 1, duration: t.textFade, ease: 'sine.out' }, t.message2);
  tl.call(() => deps.announce(text.line2), [], t.message2);

  // S06/S07 — one continuous approach into the screen, grid cross-fade, cover
  c.schedule(tl, 'returnToIdle', t.armDown);
  tl.call(() => deps.announce('Opening portfolio'), [], t.armDown);
  tl.fromTo(d.progress, { value: 0 }, {
    value: 1, duration: t.cover - t.armDown, ease: 'power2.in', immediateRender: false, onStart: () => d.beginApproach(),
  }, t.armDown);
  tl.to(s, { grid: 1, duration: t.gridCrossfadeDuration, ease: 'sine.inOut' }, t.gridCrossfadeStart);
  tl.call(() => deps.audio.cue('whoosh'), [], t.finalApproach);
  tl.call(() => {
    deps.audio.fadeOut(t.overlayFade + 0.3);
    deps.onCover(t.overlayFade);
  }, [], t.cover);

  // S08 — hand-off
  tl.call(() => deps.onHandoff(), [], t.handoff);
  return tl;
}

/** Reduced-motion variant (STORYBOARD.md §4.2): static camera, short and calm. */
export function buildCalmTimeline(t: CalmTimelineConfig, text: ExperienceConfig['text'], deps: TimelineDeps): gsap.core.Timeline {
  const { director: d, character: c, screen, lighting, blueprint } = deps;
  const tl = gsap.timeline({ paused: true });
  const s = screen.state;
  const lights = { level: 0 };
  d.hold('establishEnd');
  blueprint.showComplete();
  deps.background.set(BLUEPRINT_BG);
  lighting.setLevel(0);
  lighting.setPracticals(0);
  s.code = 1;
  c.schedule(tl, 'typing', 0, 0.01);
  tl.to(lights, {
    level: 1, duration: t.roomCrossfade, ease: 'sine.inOut',
    onUpdate: () => {
      lighting.setLevel(lights.level);
      lighting.setPracticals(lights.level);
    },
  }, 0);
  tl.to(deps.background, { r: ROOM_BG.r, g: ROOM_BG.g, b: ROOM_BG.b, duration: t.roomCrossfade }, 0);
  blueprint.scheduleFade(tl, 0, t.roomCrossfade);
  tl.to(s, { notify: 1, duration: 0.3 }, t.notification);
  tl.call(() => deps.announce(text.notification), [], t.notification);
  c.schedule(tl, 'faceVisitorCalm', t.faceVisitor, 0.8);
  tl.to(s, { notify: 0, duration: 0.3 }, t.message1 - 0.3);
  tl.to(s, { msg1: 1, duration: 0.5 }, t.message1);
  tl.call(() => deps.announce(text.line1), [], t.message1);
  tl.to(s, { msg2: 1, duration: 0.5 }, t.message2);
  tl.call(() => deps.announce(text.line2), [], t.message2);
  tl.call(() => {
    deps.announce('Opening portfolio');
    deps.onCover(t.gridFadeDuration);
  }, [], t.gridFade);
  tl.call(() => deps.onHandoff(), [], t.handoff);
  return tl;
}
