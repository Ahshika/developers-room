import { Color, Group, HemisphereLight, Object3D, PointLight, RectAreaLight, SpotLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { QualityPreset } from '../../config/experience.config';
import { CHAIR, SCREEN } from '../../config/layout';
import type { Practical } from '../environment/Room';

/**
 * Cinematic rig (STORYBOARD.md §6): warm key (the only shadow caster), blue hemisphere fill,
 * orange rim, and a monitor glow whose colour follows the screen content.
 * `setLevel` scales everything, for the blueprint opening's power-up.
 */
export class Lighting {
  readonly root = new Group();
  private readonly key: SpotLight;
  private readonly rim: SpotLight;
  private readonly fill: HemisphereLight;
  private readonly glow: RectAreaLight | PointLight;
  private readonly base: Map<Object3D & { intensity: number }, number> = new Map();
  private level = 1;
  private glowStrength = 1;

  constructor(preset: QualityPreset, private readonly practicals: Practical[]) {
    this.root.name = 'Lighting';
    const [cx, , cz] = CHAIR.pivot;

    this.key = new SpotLight('#ffe2c4', 42, 9, 0.55, 0.6, 2);
    this.key.position.set(1.6, 2.7, -0.6);
    this.key.target.position.set(cx, 1.0, cz - 0.2);
    this.key.castShadow = preset.shadows !== 'none';
    this.key.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.camera.far = 6;

    this.rim = new SpotLight('#ff8a36', 22, 8, 0.6, 0.7, 2);
    this.rim.position.set(-1.4, 2.2, -3.0);
    this.rim.target.position.set(cx, 1.1, cz);

    this.fill = new HemisphereLight('#2a4f8a', '#0b1930', 3.2);

    if (preset.monitorGlow === 'rect') {
      RectAreaLightUniformsLib.init();
      const rect = new RectAreaLight('#42d9ff', 6, SCREEN.width, SCREEN.height);
      rect.position.set(SCREEN.center[0], SCREEN.center[1], SCREEN.center[2] + 0.01);
      rect.lookAt(SCREEN.center[0], SCREEN.center[1], SCREEN.center[2] + 1);
      this.glow = rect;
    } else {
      const point = new PointLight('#42d9ff', 1.6, 3, 2);
      point.position.set(SCREEN.center[0], SCREEN.center[1], SCREEN.center[2] + 0.35);
      this.glow = point;
    }

    for (const l of [this.key, this.rim, this.fill, this.glow]) {
      this.base.set(l, l.intensity);
      this.root.add(l);
    }
    this.root.add(this.key.target, this.rim.target);
  }

  /** 0 = blueprint (dark), 1 = fully lit. Practicals follow the same level. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    this.apply();
  }

  /** Practicals switch on separately (staggered) during the opening. */
  setPracticals(level: number): void {
    const l = Math.max(0, Math.min(1, level));
    for (const p of this.practicals) p.material.emissiveIntensity = p.base * l;
  }

  /** Monitor light follows the screen: colour and strength from its current content. */
  setScreenGlow(color: Color, strength: number): void {
    this.glow.color.copy(color);
    this.glowStrength = Math.max(0, strength);
    this.apply();
  }

  disableShadows(): void {
    this.key.castShadow = false;
  }

  private apply(): void {
    for (const [light, base] of this.base) {
      light.intensity = base * this.level * (light === this.glow ? this.glowStrength : 1);
    }
  }
}
