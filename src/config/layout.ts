/**
 * Room layout and camera shots in metres (docs/STORYBOARD.md §1–3).
 * +Y up, origin on the floor at the room centre, -Z into the room, yaw 0 = facing -Z.
 * tools/verify-layout.py checks the same numbers; keep both in sync.
 */

export type Vec3 = readonly [number, number, number];

export const ROOM = { width: 7.0, depth: 6.0, height: 3.0 } as const;

/** Camera must stay inside these bounds (|x| <= maxAbsX, z <= maxZ). */
export const CAMERA_BOUNDS = { maxAbsX: 3.3, maxZ: 2.8, minY: 0.3, maxY: 2.8 } as const;

export const SCREEN = {
  center: [0, 1.12, -2.55] as Vec3,
  width: 0.7,
  height: 0.39,
  bezel: 0.008,
} as const;

export const DESK = { center: [0, 0.75, -2.4] as Vec3, width: 2.2, thickness: 0.04, depth: 0.8 } as const;
export const KEYBOARD = { center: [-0.25, 0.77, -2.12] as Vec3, width: 0.44, depth: 0.13 } as const;
export const MOUSE = { center: [0.12, 0.77, -2.12] as Vec3 } as const;
export const SECONDARY_MONITORS = [
  { center: [-0.8, 1.1, -2.45] as Vec3, yawDeg: -25 },
  { center: [0.8, 1.1, -2.45] as Vec3, yawDeg: 25 },
] as const;
export const SECONDARY_SCREEN = { width: 0.6, height: 0.34 } as const;
export const TOWER = { position: [0.95, 0, -2.55] as Vec3, size: [0.22, 0.48, 0.45] as Vec3 } as const;
export const CHAIR = { pivot: [-0.3, 0, -1.5] as Vec3, seatHeight: 0.48 } as const;
export const RACKS = [
  { position: [3.1, 0, -2.3] as Vec3, yawDeg: 90 },
  { position: [3.1, 0, -1.2] as Vec3, yawDeg: 90 },
] as const;
export const RACK_SIZE = { width: 0.6, height: 2.0, depth: 1.0 } as const;
export const WINDOW = { x: -3.5, zMin: -2.9, zMax: 1.2, yMin: 0.3, yMax: 2.8, mullionSpacing: 1.4 } as const;

/** Chair yaw (degrees) in the key poses (STORYBOARD.md §4). */
export const CHAIR_YAW = { typing: 0, faceVisitor: -146, pointAtMonitor: -40 } as const;

export type ShotName =
  | 'establishStart' | 'establishEnd' | 'working' | 'reaction' | 'acknowledge' | 'message' | 'approachMid' | 'cover';

export type ScreenText = 'message' | 'notification';

export interface ShotDefinition {
  position: Vec3;
  target: Vec3;
  /** Horizontal field of view in degrees; vertical FOV derives from the viewport aspect. */
  hfov: number;
  /** World points that must stay inside the frame safe area. */
  focus: readonly Vec3[];
  /**
   * When set, the camera dollies in along its view axis until that monitor text renders with at
   * least `minCapPx` CSS px of cap height (14 px cap ≈ 20 px font). Takes precedence over `focus`.
   */
  readability?: { text: ScreenText; minCapPx: number };
}

const MONITOR_CORNERS: readonly Vec3[] = [
  [-0.35, 1.315, -2.55], [0.35, 1.315, -2.55], [-0.35, 0.925, -2.55], [0.35, 0.925, -2.55],
];

export const SHOTS: Record<ShotName, ShotDefinition> = {
  establishStart: { position: [2.9, 2.15, 2.7], target: [-0.3, 1.0, -2.0], hfov: 64, focus: [[-1.1, 0.75, -2.4], [1.1, 0.75, -2.4]] },
  establishEnd: { position: [2.2, 1.75, 1.9], target: [-0.2, 1.05, -2.0], hfov: 60, focus: [[-1.1, 0.75, -2.4], [0.35, 1.315, -2.55]] },
  // over the developer's right shoulder, aimed at the monitor so the notification can be read
  working: { position: [0.85, 1.5, -0.35], target: [-0.12, 1.12, -2.35], hfov: 54, focus: [], readability: { text: 'notification', minCapPx: 12 } },
  reaction: { position: [1.0, 1.4, 0.4], target: [-0.3, 1.15, -1.5], hfov: 50, focus: [[-0.3, 1.36, -1.6], [-0.3, 0.45, -1.5]] },
  acknowledge: { position: [0.85, 1.38, 0.15], target: [-0.3, 1.2, -1.5], hfov: 46, focus: [[-0.3, 1.36, -1.6]] },
  message: { position: [0.75, 1.35, -0.15], target: [-0.05, 1.12, -2.3], hfov: 44, focus: MONITOR_CORNERS, readability: { text: 'message', minCapPx: 14 } },
  approachMid: { position: [0.36, 1.22, -1.3], target: SCREEN.center, hfov: 42, focus: [] },
  // wider final FOV: ends closer to the screen (well past the developer) with a slight rush-in
  cover: { position: [0, 1.12, -2.0], target: SCREEN.center, hfov: 60, focus: [] },
};

export const FRAMING = {
  vfovMin: 24,
  vfovMax: 72,
  safeMargin: 0.08,
  coverMargin: 0.98,
  near: 0.05,
} as const;

/**
 * Monitor message layout (STORYBOARD.md §7, revised in Phase 2): the longest row must fit
 * `maxRowWidth` of the screen. Portrait viewports wrap each line onto two rows so the text can be
 * larger. Cap height is measured at runtime; the readability rule uses that measured value.
 */
export const MESSAGE_LAYOUT = {
  maxRowWidth: 0.88,
  portraitRows: [['WELCOME TO', 'MY WORLD.'], ['I BUILD THINGS', 'THAT MATTER.']],
} as const;

/** Portfolio page background (verified in PROJECT_AUDIT.md) reproduced on the monitor and the DOM overlay. */
export const PORTFOLIO_GRID = {
  background: '#151a20',
  majorColor: 'rgba(140,160,180,0.085)',
  minorColor: 'rgba(140,160,180,0.035)',
  majorCssPx: 100,
  minorCssPx: 20,
} as const;
