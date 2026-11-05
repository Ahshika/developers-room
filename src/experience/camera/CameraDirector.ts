import { CatmullRomCurve3, MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { FRAMING, SCREEN, SHOTS, type ShotName } from '../../config/layout';
import { resolveCover, resolveShot, type ResolvedShot, type TextMetrics } from './framing';

type Segment = { kind: 'linear'; from: ShotName; to: ShotName } | { kind: 'approach' };

/**
 * The only system that moves the camera (STORYBOARD.md §3). The timeline animates `progress.value`
 * (0→1, with its own easing) for the active segment; positions are re-resolved every frame from the
 * current viewport, so a rotation/resize mid-move never produces a jump.
 */
export class CameraDirector {
  readonly progress = { value: 0 };
  private segment: Segment = { kind: 'linear', from: 'establishStart', to: 'establishStart' };
  private width = 1;
  private height = 1;
  private text: TextMetrics = { message: { cap: 0.06, width: 0.88 }, notification: { cap: 0.08, width: 0.94 } };
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly tmpTarget = new Vector3();
  private readonly curve = new CatmullRomCurve3([new Vector3(), new Vector3(), new Vector3()], false, 'centripetal');
  /** Extra downward pitch (degrees) used by the blueprint opening; eased back to 0. */
  readonly blueprintTilt = { value: 0 };

  constructor(private readonly camera: PerspectiveCamera) {
    camera.near = FRAMING.near;
    camera.far = 600;
  }

  setViewport(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  /** Measured monitor text metrics (see TextMetrics). */
  setTextMetrics(text: TextMetrics): void {
    const ok = Object.values(text).every((m) => m.cap > 0 && m.width > 0 && Number.isFinite(m.cap + m.width));
    if (ok) this.text = { message: { ...text.message }, notification: { ...text.notification } };
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Jump-free: holds a shot (used for the first frame and in reduced-motion mode). */
  hold(shot: ShotName): void {
    this.segment = { kind: 'linear', from: shot, to: shot };
    this.progress.value = 1;
  }

  /** Starts a move. The timeline calls this from the tween's onStart. */
  beginMove(from: ShotName, to: ShotName): void {
    this.segment = { kind: 'linear', from, to };
    this.progress.value = 0;
  }

  /**
   * The approach is ONE continuous centripetal spline message → approachMid → cover, driven by a
   * single eased tween, so the camera never stalls at the mid point.
   */
  beginApproach(): void {
    this.segment = { kind: 'approach' };
    this.progress.value = 0;
  }

  resolve(name: ShotName): ResolvedShot {
    if (name === 'cover') return resolveCover(this.aspect, SHOTS.cover.hfov);
    return resolveShot(SHOTS[name], this.aspect, this.height, this.text);
  }

  coverInfo(): ReturnType<typeof resolveCover> {
    return resolveCover(this.aspect, SHOTS.cover.hfov);
  }

  update(): void {
    const t = MathUtils.clamp(this.progress.value, 0, 1);
    let vfov: number;
    if (this.segment.kind === 'linear') {
      const a = this.resolve(this.segment.from);
      const b = this.segment.to === this.segment.from ? a : this.resolve(this.segment.to);
      this.camera.position.lerpVectors(this.tmpA.fromArray(a.position), this.tmpB.fromArray(b.position), t);
      this.tmpTarget.lerpVectors(this.tmpA.fromArray(a.target), this.tmpB.fromArray(b.target), t);
      vfov = MathUtils.lerp(a.vfov, b.vfov, t);
    } else {
      const msg = this.resolve('message');
      const mid = this.resolve('approachMid');
      const cover = this.resolve('cover');
      const pts = this.curve.points as [Vector3, Vector3, Vector3];
      pts[0].fromArray(msg.position);
      pts[1].fromArray(mid.position);
      pts[2].fromArray(cover.position);
      // for 3 control points getPoint(0.5) is exactly the middle control point
      this.curve.getPoint(t, this.camera.position);
      if (t < 0.5) {
        const k = MathUtils.smoothstep(t, 0, 0.5);
        this.tmpTarget.lerpVectors(this.tmpA.fromArray(msg.target), this.tmpB.fromArray(SCREEN.center), k);
        vfov = MathUtils.lerp(msg.vfov, mid.vfov, k);
      } else {
        this.tmpTarget.fromArray(SCREEN.center);
        vfov = MathUtils.lerp(mid.vfov, cover.vfov, (t - 0.5) * 2);
      }
    }
    if (this.blueprintTilt.value !== 0) {
      // look slightly more top-down during the blueprint opening
      const dist = this.camera.position.distanceTo(this.tmpTarget);
      this.tmpTarget.y -= Math.tan(MathUtils.degToRad(this.blueprintTilt.value)) * dist;
    }
    this.camera.lookAt(this.tmpTarget);
    if (Math.abs(this.camera.fov - vfov) > 1e-4 || Math.abs(this.camera.aspect - this.aspect) > 1e-6) {
      this.camera.fov = vfov;
      this.camera.aspect = this.aspect;
      this.camera.updateProjectionMatrix();
    }
  }
}
