import { gsap } from 'gsap';
import {
  AgXToneMapping, Color, Mesh, PCFShadowMap, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace,
  WebGLRenderer, type Material, type Object3D, type Texture,
} from 'three';
import type { QualityPreset } from '../config/experience.config';

export type FrameCallback = (deltaSeconds: number, elapsedSeconds: number) => void;

export interface DisposeReport {
  geometries: number;
  textures: number;
}

/**
 * Renderer, scene, camera and the single frame clock (gsap.ticker, ARCHITECTURE.md §6).
 * Owns resize handling, DPR caps and full GPU resource disposal.
 */
export class Stage {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.05, 600);
  readonly renderer: WebGLRenderer;
  private readonly callbacks: FrameCallback[] = [];
  private running = false;
  private elapsed = 0;
  private dpr: number;
  private disposed = false;
  private readonly onResizeBound = () => this.resize();
  private readonly tick = (_time: number, deltaMs: number) => this.frame(deltaMs / 1000);
  private readonly resizeListeners: ((w: number, h: number) => void)[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly preset: QualityPreset,
    devicePixelRatio: number,
    onContextLost: () => void,
  ) {
    this.renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = preset.shadows !== 'none';
    this.renderer.shadowMap.type = preset.shadows === 'pcfsoft' ? PCFSoftShadowMap : PCFShadowMap;
    this.dpr = Math.min(devicePixelRatio, preset.dprCap);
    this.renderer.setPixelRatio(this.dpr);
    this.scene.background = new Color('#151a20');
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'dr-canvas';
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      // dispose() calls forceContextLoss() on purpose; only a real loss is an error
      if (this.disposed) return;
      this.stop();
      onContextLost();
    });
    container.appendChild(canvas);
    window.addEventListener('resize', this.onResizeBound);
    window.visualViewport?.addEventListener('resize', this.onResizeBound);
    this.resize();
  }

  get currentDpr(): number {
    return this.dpr;
  }

  get shadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  onFrame(cb: FrameCallback): void {
    this.callbacks.push(cb);
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.resizeListeners.push(cb);
  }

  setDpr(dpr: number): void {
    this.dpr = Math.min(dpr, this.preset.dprCap);
    this.renderer.setPixelRatio(this.dpr);
    this.resize();
  }

  disableShadows(): void {
    this.renderer.shadowMap.enabled = false;
    this.scene.traverse((o) => {
      if ((o as Mesh).isMesh) ((o as Mesh).material as Material).needsUpdate = true;
    });
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    gsap.ticker.add(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  /** Renders a single frame immediately (used for the first frame before the intro starts). */
  renderNow(): void {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.resizeListeners.forEach((l) => l(w, h));
  }

  /** Releases every GPU resource reachable from the scene and the renderer itself. */
  dispose(): DisposeReport {
    if (this.disposed) return { geometries: 0, textures: 0 };
    this.stop();
    this.disposed = true;
    window.removeEventListener('resize', this.onResizeBound);
    window.visualViewport?.removeEventListener('resize', this.onResizeBound);
    const textures = new Set<Texture>();
    this.scene.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        for (const value of Object.values(m)) if ((value as Texture | null)?.isTexture) textures.add(value as Texture);
        m.dispose();
      }
      const light = obj as Object3D & { shadow?: { map?: { dispose(): void } | null } };
      light.shadow?.map?.dispose();
    });
    textures.forEach((t) => t.dispose());
    this.scene.clear();
    this.renderer.renderLists.dispose();
    const report = { geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures };
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.callbacks.length = 0;
    this.resizeListeners.length = 0;
    return report;
  }

  private frame(dt: number): void {
    if (this.disposed) return;
    const delta = Math.min(dt, 0.1);
    this.elapsed += delta;
    for (const cb of this.callbacks) cb(delta, this.elapsed);
    this.renderer.render(this.scene, this.camera);
  }
}
