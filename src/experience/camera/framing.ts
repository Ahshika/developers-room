import { CAMERA_BOUNDS, FRAMING, SCREEN, type ScreenText, type ShotDefinition, type Vec3 } from '../../config/layout';

/**
 * Measured monitor text metrics: `cap` = cap height as a fraction of the screen height,
 * `width` = widest row as a fraction of the screen width.
 */
export type TextMetrics = Record<ScreenText, { cap: number; width: number }>;

/** Keep the widest text row inside this fraction of the viewport width. */
const TEXT_FIT = 0.92;

/** Pure framing math (STORYBOARD.md §3). No Three.js dependency so it can be unit-tested directly. */

const DEG = Math.PI / 180;

export type MutableVec3 = [number, number, number];

export interface ResolvedShot {
  position: MutableVec3;
  target: MutableVec3;
  /** Vertical FOV in degrees for the current aspect. */
  vfov: number;
}

const sub = (a: Vec3, b: Vec3): MutableVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.sqrt(dot(a, a));
const scale = (a: Vec3, s: number): MutableVec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): MutableVec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): MutableVec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): MutableVec3 => scale(a, 1 / (len(a) || 1));

/** vfov derived from a horizontal FOV, clamped so very tall/wide screens stay cinematic. */
export function vfovForAspect(hfovDeg: number, aspect: number): number {
  const v = (2 * Math.atan(Math.tan((hfovDeg * DEG) / 2) / aspect)) / DEG;
  return Math.min(Math.max(v, FRAMING.vfovMin), FRAMING.vfovMax);
}

export function hfovFromVfov(vfovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vfovDeg * DEG) / 2) * aspect)) / DEG;
}

/**
 * Distance from the screen plane at which the 0.70 × 0.39 m screen fully covers the viewport:
 * d = min(h, w / A) / (2·tan(vfov/2)) × margin. The camera never goes closer than this.
 */
export function coverDistance(aspect: number, vfovDeg: number): number {
  return (Math.min(SCREEN.height, SCREEN.width / aspect) / (2 * Math.tan((vfovDeg * DEG) / 2))) * FRAMING.coverMargin;
}

/** Visible size (metres) of the view frustum at distance d. */
export function visibleSize(distance: number, vfovDeg: number, aspect: number): { width: number; height: number } {
  const height = 2 * distance * Math.tan((vfovDeg * DEG) / 2);
  return { width: height * aspect, height };
}

/**
 * Rendered message cap height in CSS px when the camera is `distance` metres from the screen.
 * `capFraction` is the cap height as a fraction of the screen height, reported by MonitorScreen's
 * measured text layout.
 */
export function messageTextPx(distance: number, vfovDeg: number, viewportHeightPx: number, capFraction: number): number {
  return ((capFraction * SCREEN.height) / visibleSize(distance, vfovDeg, 1).height) * viewportHeightPx;
}

/** Largest distance at which the message still renders at minPx. */
export function maxDistanceForText(minPx: number, vfovDeg: number, viewportHeightPx: number, capFraction: number): number {
  return (capFraction * SCREEN.height * viewportHeightPx) / (minPx * 2 * Math.tan((vfovDeg * DEG) / 2));
}

/** Projects a world point into normalised device coordinates for a camera at position→target. */
export function projectNdc(point: Vec3, position: Vec3, target: Vec3, vfovDeg: number, aspect: number): { x: number; y: number; z: number } {
  const forward = normalize(sub(target, position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const rel = sub(point, position);
  const z = dot(rel, forward);
  const tanV = Math.tan((vfovDeg * DEG) / 2);
  return { x: dot(rel, right) / (z * tanV * aspect), y: dot(rel, up) / (z * tanV), z };
}

export function insideCameraBounds(p: Vec3): boolean {
  return Math.abs(p[0]) <= CAMERA_BOUNDS.maxAbsX && p[2] <= CAMERA_BOUNDS.maxZ && p[1] >= CAMERA_BOUNDS.minY && p[1] <= CAMERA_BOUNDS.maxY;
}

function focusFits(focus: readonly Vec3[], position: Vec3, target: Vec3, vfov: number, aspect: number): boolean {
  const limit = 1 - FRAMING.safeMargin;
  return focus.every((p) => {
    const n = projectNdc(p, position, target, vfov, aspect);
    return n.z > 0 && Math.abs(n.x) <= limit && Math.abs(n.y) <= limit;
  });
}

/**
 * Resolves a shot for the current viewport:
 * 1. vfov from the shot's horizontal FOV (clamped),
 * 2. readability: if the named monitor text would render below `readability.minCapPx`, move
 *    straight toward the screen and aim at its centre, stopping at the readable distance but never
 *    closer than the distance at which the widest row still fits the viewport width,
 * 3. focus: dolly back (within the room) until every focus point is inside the safe area.
 */
export function resolveShot(shot: ShotDefinition, aspect: number, viewportHeightPx: number, text: TextMetrics): ResolvedShot {
  const vfov = vfovForAspect(shot.hfov, aspect);
  let target: MutableVec3 = [...shot.target];
  let position: MutableVec3 = [...shot.position];
  const forward = normalize(sub(shot.target, shot.position));

  if (shot.readability) {
    const metrics = text[shot.readability.text];
    const readable = maxDistanceForText(shot.readability.minCapPx, vfov, viewportHeightPx, metrics.cap);
    const current = len(sub(SCREEN.center, position));
    if (current > readable) {
      const hfov = hfovFromVfov(vfov, aspect);
      const fit = (metrics.width * SCREEN.width) / TEXT_FIT / (2 * Math.tan((hfov * DEG) / 2));
      const distance = Math.min(current, Math.max(readable, fit));
      const toScreen = normalize(sub(SCREEN.center, position));
      position = add(SCREEN.center, scale(toScreen, -distance));
      target = [...SCREEN.center];
    }
  } else if (shot.focus.length > 0) {
    for (let i = 0; i < 30 && !focusFits(shot.focus, position, target, vfov, aspect); i++) {
      const next = add(position, scale(forward, -0.1));
      if (!insideCameraBounds(next)) break;
      position = next;
    }
  }
  return { position, target, vfov };
}

/** The cover shot: centred on the screen, looking straight at it, at the cover distance. */
export function resolveCover(aspect: number, hfovDeg: number): ResolvedShot & { distance: number } {
  const vfov = vfovForAspect(hfovDeg, aspect);
  const distance = coverDistance(aspect, vfov);
  const [cx, cy, cz] = SCREEN.center;
  return { position: [cx, cy, cz + distance], target: [cx, cy, cz], vfov, distance };
}

/**
 * Where the portfolio's fixed CSS grid lines fall on the screen canvas at the cover distance, so the
 * monitor shows the exact grid the visitor will see after navigation (ARCHITECTURE.md §7).
 */
export function gridOnScreenCanvas(aspect: number, vfovDeg: number, distance: number, viewportHeightPx: number, canvasWidth: number, canvasHeight: number, cssCellPx: number): { cellPx: number; offsetX: number; offsetY: number; linePx: number } {
  const vis = visibleSize(distance, vfovDeg, aspect);
  const metresPerCssPx = vis.height / viewportHeightPx;
  const texPxPerMetre = canvasHeight / SCREEN.height;
  const cellPx = cssCellPx * metresPerCssPx * texPxPerMetre;
  // the fixed background starts at the viewport's top-left corner
  const offsetX = ((SCREEN.width - vis.width) / 2) * (canvasWidth / SCREEN.width);
  const offsetY = ((SCREEN.height - vis.height) / 2) * texPxPerMetre;
  return { cellPx, offsetX, offsetY, linePx: metresPerCssPx * texPxPerMetre };
}
