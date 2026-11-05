import { CatmullRomCurve3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CAMERA_BOUNDS, CHAIR, FRAMING, SCREEN, SHOTS, type ShotName, type Vec3 } from '../../src/config/layout';
import { LEAN, seatedTorso } from '../../src/experience/character/Mannequin';
import {
  coverDistance, gridOnScreenCanvas, insideCameraBounds, messageTextPx, projectNdc, resolveCover, resolveShot,
  vfovForAspect, visibleSize, type TextMetrics,
} from '../../src/experience/camera/framing';

const VIEWPORTS: Record<string, [number, number]> = {
  'phone portrait 390x844': [390, 844],
  'small phone 320x568': [320, 568],
  'phone landscape 844x390': [844, 390],
  'tablet 768x1024': [768, 1024],
  'desktop 1920x1080': [1920, 1080],
  'ultrawide 2560x1080': [2560, 1080],
};
/** Representative measured metrics (portrait wraps the message onto two rows). */
const caps = (portrait: boolean): TextMetrics => ({
  message: portrait ? { cap: 0.105, width: 0.88 } : { cap: 0.055, width: 0.88 },
  notification: { cap: 0.075, width: 0.94 },
});

/** The text's full width (centred on the screen) must be inside the viewport. */
function expectTextFits(shot: ReturnType<typeof resolveShot>, aspect: number, widthFraction: number): void {
  const half = (widthFraction * SCREEN.width) / 2;
  for (const x of [SCREEN.center[0] - half, SCREEN.center[0] + half]) {
    const n = projectNdc([x, SCREEN.center[1], SCREEN.center[2]], shot.position, shot.target, shot.vfov, aspect);
    expect(Math.abs(n.x)).toBeLessThanOrEqual(1 + 1e-6);
  }
}

/**
 * Seated developer = torso capsule (hips → chest, r 0.26 m: shoulders + arms) + head sphere
 * (r 0.13 m), from the mannequin's own pose function. Chair yaw is 0 in both poses checked here.
 */
interface Body { hips: Vector3; chest: Vector3; head: Vector3 }
const PIVOT = new Vector3(...CHAIR.pivot);
function body(lean: number): Body {
  const t = seatedTorso(lean);
  return { hips: new Vector3(0, 0.56, 0).add(PIVOT), chest: t.chest.clone().add(PIVOT), head: t.head.clone().add(PIVOT) };
}
const TYPING = body(LEAN.typing);
/** During the approach he has returned to the relaxed idle posture (Mannequin returnToIdle). */
const APPROACH = body(LEAN.idle);
function clearance(p: Vector3, b: Body = TYPING): number {
  const ab = new Vector3().subVectors(b.chest, b.hips);
  const t = Math.max(0, Math.min(1, new Vector3().subVectors(p, b.hips).dot(ab) / ab.lengthSq()));
  const torso = p.distanceTo(b.hips.clone().addScaledVector(ab, t)) - 0.26;
  const head = p.distanceTo(b.head) - 0.13;
  return Math.min(torso, head);
}

describe('vfovForAspect', () => {
  it('derives vertical FOV from horizontal and clamps it', () => {
    expect(vfovForAspect(60, 1)).toBeCloseTo(60, 6);
    expect(vfovForAspect(60, 0.2)).toBe(FRAMING.vfovMax);
    expect(vfovForAspect(30, 4)).toBe(FRAMING.vfovMin);
  });
});

describe('coverDistance', () => {
  // values recorded by tools/verify-layout.py (STORYBOARD.md §8)
  it.each([
    [390 / 844, 0.263],
    [844 / 390, 0.594],
    [1920 / 1080, 0.588],
    [2560 / 1080, 0.594],
  ])('aspect %f → %f m', (aspect, expected) => {
    expect(coverDistance(aspect, vfovForAspect(SHOTS.cover.hfov, aspect))).toBeCloseTo(expected, 3);
  });

  it.each(Object.entries(VIEWPORTS))('%s: the screen covers the whole viewport and the camera stays in front of it', (_n, [w, h]) => {
    const aspect = w / h;
    const cover = resolveCover(aspect, SHOTS.cover.hfov);
    const vis = visibleSize(cover.distance, cover.vfov, aspect);
    expect(vis.width).toBeLessThanOrEqual(SCREEN.width);
    expect(vis.height).toBeLessThanOrEqual(SCREEN.height);
    expect(cover.distance).toBeGreaterThan(FRAMING.near + 0.02);
    expect(cover.position[2]).toBeGreaterThan(SCREEN.center[2]);
  });
});

describe('projectNdc', () => {
  it('maps the look-at target to the centre', () => {
    const n = projectNdc([0, 1, -2], [0, 1, 0], [0, 1, -2], 50, 1.5);
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(0, 9);
    expect(n.z).toBeCloseTo(2, 9);
  });
});

describe('resolveShot', () => {
  for (const [name, [w, h]] of Object.entries(VIEWPORTS)) {
    const aspect = w / h;
    const c = caps(h > w);

    it(`${name}: monitor message is readable (≥ 14 px cap) in the message shot`, () => {
      const shot = resolveShot(SHOTS.message, aspect, h, c);
      const dist = new Vector3(...shot.position).distanceTo(new Vector3(...SCREEN.center));
      expect(messageTextPx(dist, shot.vfov, h, c.message.cap)).toBeGreaterThanOrEqual(14 - 1e-6);
      expectTextFits(shot, aspect, c.message.width);
    });

    it(`${name}: notification card fits the viewport and stays readable in the working shot`, () => {
      const shot = resolveShot(SHOTS.working, aspect, h, c);
      const dist = new Vector3(...shot.position).distanceTo(new Vector3(...SCREEN.center));
      // ≥ 12 px cap unless fitting the whole card forces it smaller; never below 9 px
      expect(messageTextPx(dist, shot.vfov, h, c.notification.cap)).toBeGreaterThanOrEqual(9);
      expectTextFits(shot, aspect, c.notification.width);
    });

    it(`${name}: every shot stays inside the room and clear of the developer`, () => {
      for (const shotName of Object.keys(SHOTS) as ShotName[]) {
        if (shotName === 'cover') continue;
        const shot = resolveShot(SHOTS[shotName], aspect, h, c);
        const p = new Vector3(...shot.position);
        expect(insideCameraBounds(shot.position), `${shotName} outside room`).toBe(true);
        expect(clearance(p), `${shotName} too close to developer`).toBeGreaterThanOrEqual(0.1);
      }
    });

    it(`${name}: approach spline keeps ≥ 0.1 m from the developer and never crosses the screen`, () => {
      const msg = resolveShot(SHOTS.message, aspect, h, c);
      const mid = resolveShot(SHOTS.approachMid, aspect, h, c);
      const cover = resolveCover(aspect, SHOTS.cover.hfov);
      const curve = new CatmullRomCurve3([msg.position, mid.position, cover.position].map((p) => new Vector3(...(p as Vec3))), false, 'centripetal');
      for (let i = 0; i <= 200; i++) {
        const p = curve.getPoint(i / 200);
        expect(clearance(p, APPROACH)).toBeGreaterThanOrEqual(0.1);
        expect(p.z).toBeGreaterThan(SCREEN.center[2] + FRAMING.near);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(CAMERA_BOUNDS.maxAbsX);
      }
    });
  }

  it('keeps focus points inside the safe area when the room allows it', () => {
    const [w, h] = [1920, 1080];
    const shot = resolveShot(SHOTS.establishEnd, w / h, h, caps(false));
    for (const p of SHOTS.establishEnd.focus) {
      const n = projectNdc(p, shot.position, shot.target, shot.vfov, w / h);
      expect(Math.abs(n.x)).toBeLessThanOrEqual(1 - FRAMING.safeMargin + 1e-9);
      expect(Math.abs(n.y)).toBeLessThanOrEqual(1 - FRAMING.safeMargin + 1e-9);
    }
  });
});

describe('gridOnScreenCanvas', () => {
  it('maps one 100 CSS px portfolio cell to the same size on the monitor at cover distance', () => {
    const [w, h] = [1920, 1080];
    const cover = resolveCover(w / h, SHOTS.cover.hfov);
    const g = gridOnScreenCanvas(w / h, cover.vfov, cover.distance, h, 2048, 1152, 100);
    // the visible part of the canvas, in canvas px, spans exactly the viewport height in CSS px
    const vis = visibleSize(cover.distance, cover.vfov, w / h);
    const visibleCanvasPx = (vis.height / SCREEN.height) * 1152;
    expect(g.cellPx * (h / 100)).toBeCloseTo(visibleCanvasPx, 6);
    expect(g.linePx * 100).toBeCloseTo(g.cellPx, 9);
    expect(g.offsetX).toBeGreaterThanOrEqual(0);
    expect(g.offsetY).toBeGreaterThanOrEqual(0);
  });
});
