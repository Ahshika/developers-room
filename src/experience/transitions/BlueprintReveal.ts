import type { gsap } from 'gsap';
import {
  Box3, BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, Vector3,
} from 'three';
import { DESK, ROOM } from '../../config/layout';

/**
 * Opening (STORYBOARD.md §4, S01a/S01b; approved 2026-11-03): the room's floor plan traces itself
 * in CAD lines, then every riser extrudes up from the plan.
 * Plan lines are generated from the real geometry footprints, so there is no extra asset to download.
 * Extrusion scales each riser group in Y from its floor origin (equivalent to the uRise shader
 * uniform described in the docs, but with no per-material shader patching).
 */

const PLAN_Y = 0.004;
const MIN_FOOTPRINT = 0.0015; // m², ignore tiny parts (keys, LEDs)

export class BlueprintReveal {
  readonly root = new Group();
  readonly draw = { value: 0 };
  readonly fade = { value: 1 };
  private readonly plan: LineSegments;
  private readonly grid: LineSegments;
  private readonly planMat: LineBasicMaterial;
  private readonly gridMat: LineBasicMaterial;
  private readonly vertexCount: number;
  private readonly delays: number[];

  constructor(private readonly risers: Group[]) {
    this.root.name = 'BlueprintReveal';
    const deskCenter = new Vector3(DESK.center[0], 0, DESK.center[2]);
    const rects: { box: Box3; order: number }[] = [];
    const box = new Box3();
    const distances: number[] = [];
    risers.forEach((riser, index) => {
      riser.updateWorldMatrix(true, true);
      const riserBox = new Box3().setFromObject(riser);
      const isShell = /Walls|Window|Ceiling/.test(riser.name);
      distances[index] = isShell ? 0 : riserBox.getCenter(new Vector3()).setY(0).distanceTo(deskCenter);
      riser.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || /Glass|Ceiling|Fixture|Led|KeyCaps|City/.test(mesh.name)) return;
        box.setFromObject(mesh);
        const size = box.getSize(new Vector3());
        if (size.x * size.z < MIN_FOOTPRINT) return;
        // shell first (walls), then outward from the desk
        rects.push({ box: box.clone(), order: isShell ? -1 : (distances[index] as number) });
      });
    });
    rects.sort((a, b) => a.order - b.order);

    const positions: number[] = [];
    for (const { box: b } of rects) {
      const { min, max } = b;
      const c = [[min.x, min.z], [max.x, min.z], [max.x, max.z], [min.x, max.z]] as const;
      for (let i = 0; i < 4; i++) {
        const p = c[i] as readonly [number, number];
        const q = c[(i + 1) % 4] as readonly [number, number];
        positions.push(p[0], PLAN_Y, p[1], q[0], PLAN_Y, q[1]);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.vertexCount = positions.length / 3;
    geo.setDrawRange(0, 0);
    this.planMat = new LineBasicMaterial({ color: '#62c9ff', transparent: true, opacity: 0.9, toneMapped: false });
    this.plan = new LineSegments(geo, this.planMat);
    this.plan.name = 'Blueprint_PlanLines';
    this.plan.frustumCulled = false;

    // CAD floor grid in the portfolio's language: 1 m major, 0.2 m minor
    const gridPos: number[] = [];
    const halfW = ROOM.width / 2;
    const halfD = ROOM.depth / 2;
    for (let x = -halfW; x <= halfW + 1e-6; x += 0.2) gridPos.push(x, 0.002, -halfD, x, 0.002, halfD);
    for (let z = -halfD; z <= halfD + 1e-6; z += 0.2) gridPos.push(-halfW, 0.002, z, halfW, 0.002, z);
    const gridGeo = new BufferGeometry();
    gridGeo.setAttribute('position', new Float32BufferAttribute(gridPos, 3));
    this.gridMat = new LineBasicMaterial({ color: '#8ca0b4', transparent: true, opacity: 0.12, toneMapped: false, depthWrite: false });
    this.grid = new LineSegments(gridGeo, this.gridMat);
    this.grid.name = 'Blueprint_FloorGrid';
    this.root.add(this.grid, this.plan);

    const maxDist = Math.max(0.001, ...distances);
    this.delays = distances.map((d) => d / maxDist);
  }

  /** Initial state: only the plan is visible; risers are hidden and flat. */
  reset(): void {
    for (const r of this.risers) {
      r.scale.y = 0.001;
      r.visible = false;
    }
    this.draw.value = 0;
    this.fade.value = 1;
    this.apply();
  }

  /** Reduced motion: complete room, complete plan, plan fades only. */
  showComplete(): void {
    for (const r of this.risers) {
      r.scale.y = 1;
      r.visible = true;
    }
    this.draw.value = 1;
    this.apply();
  }

  schedule(tl: gsap.core.Timeline, drawAt: number, drawDuration: number, riseAt: number, riseDuration: number): void {
    tl.to(this.draw, { value: 1, duration: drawDuration, ease: 'power1.inOut', onUpdate: () => this.apply() }, drawAt);
    const stagger = Math.min(0.5, riseDuration * 0.35);
    this.risers.forEach((r, i) => {
      const start = riseAt + (this.delays[i] ?? 0) * stagger;
      tl.set(r, { visible: true }, start);
      tl.to(r.scale, { y: 1, duration: riseDuration - stagger, ease: 'back.out(1.04)' }, start);
    });
    this.scheduleFade(tl, riseAt + riseDuration * 0.4, riseDuration);
  }

  scheduleFade(tl: gsap.core.Timeline, at: number, duration: number): void {
    tl.to(this.fade, { value: 0, duration, ease: 'sine.inOut', onUpdate: () => this.apply() }, at);
    tl.set(this.root, { visible: false }, at + duration);
  }

  private apply(): void {
    const count = Math.floor((this.vertexCount * Math.min(1, this.draw.value)) / 2) * 2;
    this.plan.geometry.setDrawRange(0, count);
    this.planMat.opacity = 0.9 * this.fade.value;
    this.gridMat.opacity = 0.12 * this.fade.value;
  }
}
