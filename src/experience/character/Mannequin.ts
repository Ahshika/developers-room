import { gsap } from 'gsap';
import {
  BoxGeometry, CapsuleGeometry, Group, MathUtils, Mesh, MeshStandardMaterial, SphereGeometry, Vector3,
  type BufferGeometry, type Camera, type Object3D,
} from 'three';
import { CHAIR_YAW, KEYBOARD } from '../../config/layout';
import type { CharacterAction, CharacterController } from './CharacterController';

/**
 * PHASE 2 PLACEHOLDER CHARACTER (ASSET_INVENTORY.md C01/C02): a procedural seated mannequin in a
 * black hoodie with correct seated proportions and pivots. Arms use two-bone IK and the head aims
 * at the real camera, so the choreography, gaze and chair pivot can be validated before the
 * Mixamo character replaces it in Phase 3 (same CharacterController contract).
 */

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const TORSO = 0.5;
const HIPS = new Vector3(0, 0.56, 0.0);
const NECK_OFFSET = new Vector3(0, 0.075, -0.012);
const HEAD_OFFSET = new Vector3(0, 0.125, -0.01);

/** Torso lean (0 = upright, 1 = typing over the keyboard) in each part of the choreography. */
export const LEAN = { typing: 1, stopTyping: 0.55, chairTurn: 0.15, visitor: 0.05, idle: 0.25 } as const;

/** Chest and head centre in chair-local space for a given lean (shared with the clearance tests). */
export function seatedTorso(lean: number, breathe = 0, outChest = new Vector3(), outHead = new Vector3()): { chest: Vector3; head: Vector3 } {
  const angle = MathUtils.lerp(-4, 16, MathUtils.clamp(lean, 0, 1)) * DEG;
  outChest.set(0, Math.cos(angle) * TORSO + breathe, -Math.sin(angle) * TORSO).add(HIPS);
  outHead.copy(outChest).add(NECK_OFFSET).add(HEAD_OFFSET);
  return { chest: outChest, head: outHead };
}

const ikU = new Vector3();
const ikV = new Vector3();
const segDir = new Vector3();

/** Two-bone IK in 3D. Returns elbow and (reach-clamped) hand positions. No allocations. */
export function solveTwoBone(shoulder: Vector3, target: Vector3, pole: Vector3, l1: number, l2: number, outElbow: Vector3, outHand: Vector3): void {
  ikU.subVectors(target, shoulder);
  const dist = MathUtils.clamp(ikU.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  if (ikU.lengthSq() > 1e-12) ikU.normalize();
  else ikU.set(0, -1, 0);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  // pole direction projected onto the plane perpendicular to the shoulder→target axis
  ikV.subVectors(pole, shoulder);
  ikV.addScaledVector(ikU, -ikV.dot(ikU));
  if (ikV.lengthSq() < 1e-10) ikV.set(0, -1, 0).addScaledVector(ikU, ikU.y);
  ikV.normalize();
  outElbow.copy(shoulder).addScaledVector(ikU, a).addScaledVector(ikV, h);
  outHand.copy(shoulder).addScaledVector(ikU, dist);
}

/** Places a Y-aligned mesh between two points (its geometry length must match the segment). */
function placeBetween(mesh: Object3D, a: Vector3, b: Vector3): void {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  segDir.subVectors(b, a);
  if (segDir.lengthSq() > 1e-12) mesh.quaternion.setFromUnitVectors(UP, segDir.normalize());
}

interface Pose {
  typing: number;
  handsOnKeys: number;
  lean: number;
  aim: number;
  /** 0 = look at camera (visitor), 1 = look at the screen. */
  aimMix: number;
  point: number;
  nod: number;
  reaction: number;
}

export class Mannequin implements CharacterController {
  readonly root = new Group();
  private readonly pose: Pose = { typing: 1, handsOnKeys: 1, lean: LEAN.typing, aim: 0, aimMix: 0, point: 0, nod: 0, reaction: 0 };
  private readonly parts: Record<string, Mesh> = {};
  private readonly headGroup = new Group();
  private yaw = 0;
  private pitch = -0.12;
  // scratch vectors (no allocations in the frame loop)
  private readonly chest = new Vector3();
  private readonly neck = new Vector3();
  private readonly head = new Vector3();
  private readonly sL = new Vector3();
  private readonly sR = new Vector3();
  private readonly eL = new Vector3();
  private readonly eR = new Vector3();
  private readonly hL = new Vector3();
  private readonly hR = new Vector3();
  private readonly tL = new Vector3();
  private readonly tR = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly keyL: Vector3;
  private readonly keyR: Vector3;

  constructor(private readonly chairPivot: Object3D) {
    this.root.name = 'PLACEHOLDER_Char_Developer';
    chairPivot.add(this.root);
    const hoodie = new MeshStandardMaterial({ color: '#0f1013', roughness: 0.95, metalness: 0 });
    const skin = new MeshStandardMaterial({ color: '#b98a6e', roughness: 0.7 });
    const trousers = new MeshStandardMaterial({ color: '#1a1d22', roughness: 0.85 });
    const shoes = new MeshStandardMaterial({ color: '#08090b', roughness: 0.6 });
    const hair = new MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.9 });

    const add = (name: string, geo: BufferGeometry, mat: MeshStandardMaterial, parent: Object3D = this.root): Mesh => {
      const m = new Mesh(geo, mat);
      m.name = `PLACEHOLDER_${name}`;
      m.castShadow = true;
      parent.add(m);
      this.parts[name] = m;
      return m;
    };
    const torso = add('Torso', new CapsuleGeometry(0.15, TORSO - 0.24, 6, 14), hoodie);
    torso.scale.set(1.22, 1, 0.78);
    add('Hood', new CapsuleGeometry(0.055, 0.16, 4, 10), hoodie).rotation.z = 90 * DEG;
    add('Neck', new CapsuleGeometry(0.045, 0.05, 4, 8), skin);
    this.root.add(this.headGroup);
    const headMesh = add('Head', new SphereGeometry(0.1, 20, 14), skin, this.headGroup);
    headMesh.scale.set(0.95, 1.15, 1.02);
    const hairMesh = add('Hair', new SphereGeometry(0.104, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.headGroup);
    hairMesh.position.set(0, 0.012, 0.006);
    hairMesh.scale.set(0.97, 1.15, 1.04);
    add('Nose', new BoxGeometry(0.02, 0.035, 0.03), skin, this.headGroup).position.set(0, -0.01, -0.105);
    for (const side of ['L', 'R']) {
      add(`UpperArm${side}`, new CapsuleGeometry(0.052, UPPER_ARM - 0.104, 4, 10), hoodie);
      add(`Forearm${side}`, new CapsuleGeometry(0.046, FOREARM - 0.092, 4, 10), hoodie);
      add(`Hand${side}`, new BoxGeometry(0.075, 0.1, 0.028), skin);
      add(`Thigh${side}`, new CapsuleGeometry(0.075, 0.3, 4, 10), trousers);
      add(`Shin${side}`, new CapsuleGeometry(0.058, 0.34, 4, 10), trousers);
      add(`Shoe${side}`, new BoxGeometry(0.1, 0.07, 0.25), shoes);
    }
    this.keyL = new Vector3(KEYBOARD.center[0] - 0.11, KEYBOARD.center[1] + 0.025, KEYBOARD.center[2] + 0.02);
    this.keyR = new Vector3(KEYBOARD.center[0] + 0.11, KEYBOARD.center[1] + 0.025, KEYBOARD.center[2] + 0.02);
    this.placeLegs();
  }

  get isTyping(): boolean {
    return this.pose.typing > 0.5;
  }

  schedule(tl: gsap.core.Timeline, action: CharacterAction, at: number, duration = 1): void {
    const p = this.pose;
    const rot = this.chairPivot.rotation;
    switch (action) {
      case 'typing':
        tl.to(p, { typing: 1, handsOnKeys: 1, lean: LEAN.typing, aim: 0, point: 0, duration: 0.5, ease: 'sine.inOut' }, at);
        break;
      case 'stopTyping':
        tl.to(p, { typing: 0, duration: 0.5, ease: 'sine.out' }, at);
        tl.to(p, { handsOnKeys: 0.55, lean: LEAN.stopTyping, duration: 0.8, ease: 'power2.inOut' }, at + 0.1);
        break;
      case 'headReaction':
        tl.to(p, { reaction: 1, duration: 0.3, ease: 'power2.out' }, at);
        tl.to(p, { reaction: 0, duration: 0.6, ease: 'sine.inOut' }, at + 0.35);
        tl.to(p, { aim: 1, aimMix: 0, duration: 0.6, ease: 'sine.inOut' }, at + 0.15);
        break;
      case 'chairTurn':
        // the torso leads: posture opens slightly before the chair finishes turning
        tl.to(p, { handsOnKeys: 0, lean: LEAN.chairTurn, duration: duration * 0.7, ease: 'power2.inOut' }, at);
        tl.to(rot, { y: CHAIR_YAW.faceVisitor * DEG, duration, ease: 'power2.inOut' }, at + 0.1);
        break;
      case 'lookTowardVisitor':
        tl.to(p, { aim: 1, aimMix: 0, lean: LEAN.visitor, duration, ease: 'sine.inOut' }, at);
        break;
      case 'nod':
        tl.fromTo(p, { nod: 0 }, { nod: 1, duration: 0.7, ease: 'sine.inOut', immediateRender: false }, at);
        tl.set(p, { nod: 0 }, at + 0.7);
        break;
      case 'lookTowardMonitor':
        tl.to(rot, { y: CHAIR_YAW.pointAtMonitor * DEG, duration, ease: 'power2.inOut' }, at);
        tl.to(p, { aimMix: 1, duration: duration * 0.8, ease: 'sine.inOut' }, at);
        break;
      case 'pointTowardMonitor':
        // short anticipation dip, then the arm extends
        tl.to(p, { point: -0.08, duration: 0.15, ease: 'sine.in' }, at);
        tl.to(p, { point: 1, duration: Math.max(0.3, duration - 0.15), ease: 'back.out(1.3)' }, at + 0.15);
        break;
      case 'returnToIdle':
        tl.to(p, { point: 0, duration: 0.8, ease: 'power2.inOut' }, at);
        tl.to(rot, { y: CHAIR_YAW.typing * DEG, duration: 1.6, ease: 'power2.inOut' }, at + 0.2);
        tl.to(p, { aim: 0, handsOnKeys: 0.5, lean: LEAN.idle, duration: 1.4, ease: 'sine.inOut' }, at + 0.4);
        break;
      case 'faceVisitorCalm':
        tl.to(p, { typing: 0, handsOnKeys: 0, lean: LEAN.visitor, aim: 1, aimMix: 0, duration, ease: 'sine.inOut' }, at);
        tl.to(rot, { y: CHAIR_YAW.faceVisitor * DEG, duration, ease: 'sine.inOut' }, at);
        break;
    }
  }

  update(dt: number, elapsed: number, camera: Camera, screenWorld: Vector3): void {
    const p = this.pose;
    this.root.updateWorldMatrix(true, false);

    // torso with lean and breathing
    seatedTorso(p.lean, Math.sin(elapsed * 1.6) * 0.006, this.chest, this.head);
    placeBetween(this.parts.Torso as Mesh, HIPS, this.chest);
    this.neck.copy(this.chest).add(NECK_OFFSET);
    placeBetween(this.parts.Neck as Mesh, this.chest, this.head);
    (this.parts.Hood as Mesh).position.set(0, this.neck.y - 0.03, this.neck.z + 0.085);
    this.sL.set(-0.19, -0.03, 0.01).add(this.chest);
    this.sR.set(0.19, -0.03, 0.01).add(this.chest);

    // hands: rest ↔ keys (with typing motion) ↔ point at the screen (right hand)
    const keys = MathUtils.clamp(p.handsOnKeys, 0, 1);
    this.root.worldToLocal(this.tmp.copy(this.keyL));
    this.tL.set(-0.15, 0.64, -0.24).lerp(this.tmp, keys);
    this.root.worldToLocal(this.tmp.copy(this.keyR));
    this.tR.set(0.15, 0.64, -0.24).lerp(this.tmp, keys);
    if (p.typing > 0.001) {
      const w = p.typing * keys;
      this.tL.y += Math.max(0, Math.sin(elapsed * 11.3)) * 0.014 * w;
      this.tL.x += Math.sin(elapsed * 2.7) * 0.02 * w;
      this.tR.y += Math.max(0, Math.sin(elapsed * 12.1 + 1.7)) * 0.014 * w;
      this.tR.x += Math.sin(elapsed * 3.1 + 0.6) * 0.025 * w;
    }
    if (Math.abs(p.point) > 0.001) {
      this.root.worldToLocal(this.tmp.copy(screenWorld));
      this.tmp2.subVectors(this.tmp, this.sR).normalize().multiplyScalar(UPPER_ARM + FOREARM - 0.02).add(this.sR);
      this.tR.lerp(this.tmp2, p.point);
    }
    this.tmp.set(-0.32, -0.35, 0.22).add(this.sL);
    solveTwoBone(this.sL, this.tL, this.tmp, UPPER_ARM, FOREARM, this.eL, this.hL);
    this.tmp.set(0.32, -0.35, 0.22 - 0.2 * Math.max(0, p.point)).add(this.sR);
    solveTwoBone(this.sR, this.tR, this.tmp, UPPER_ARM, FOREARM, this.eR, this.hR);
    placeBetween(this.parts.UpperArmL as Mesh, this.sL, this.eL);
    placeBetween(this.parts.ForearmL as Mesh, this.eL, this.hL);
    placeBetween(this.parts.UpperArmR as Mesh, this.sR, this.eR);
    placeBetween(this.parts.ForearmR as Mesh, this.eR, this.hR);
    this.placeHand(this.parts.HandL as Mesh, this.eL, this.hL);
    this.placeHand(this.parts.HandR as Mesh, this.eR, this.hR);

    // head aim: blend neutral ↔ camera ↔ screen, clamped, critically damped
    let yaw = 0;
    let pitch = -0.12;
    if (p.aim > 0.001) {
      const camAngles = this.anglesTo(camera.getWorldPosition(this.tmp2));
      const scrAngles = this.anglesTo(this.tmp2.copy(screenWorld));
      const ay = MathUtils.lerp(camAngles.yaw, scrAngles.yaw, p.aimMix);
      const ap = MathUtils.lerp(camAngles.pitch, scrAngles.pitch, p.aimMix);
      yaw = MathUtils.lerp(yaw, ay, p.aim);
      pitch = MathUtils.lerp(pitch, ap, p.aim);
    }
    pitch += p.reaction * 0.12 - Math.sin(Math.PI * MathUtils.clamp(p.nod, 0, 1)) * 0.2;
    yaw = MathUtils.clamp(yaw, -70 * DEG, 70 * DEG);
    pitch = MathUtils.clamp(pitch, -35 * DEG, 35 * DEG);
    const k = 1 - Math.exp(-dt * 9);
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;
    this.headGroup.position.copy(this.head);
    this.headGroup.rotation.set(this.pitch, this.yaw, p.reaction * 0.08, 'YXZ');
  }

  private anglesTo(world: Vector3): { yaw: number; pitch: number } {
    const local = this.root.worldToLocal(world).sub(this.head);
    return {
      yaw: Math.atan2(-local.x, -local.z),
      pitch: Math.atan2(local.y, Math.hypot(local.x, local.z)),
    };
  }

  private placeHand(hand: Mesh, elbow: Vector3, wrist: Vector3): void {
    const dir = this.tmp.subVectors(wrist, elbow).normalize();
    hand.position.copy(wrist).addScaledVector(dir, 0.05);
    hand.quaternion.setFromUnitVectors(UP, dir);
  }

  /** Legs are static in the placeholder (seated pose); called once. */
  private placeLegs(): void {
    for (const [side, s] of [['L', -1], ['R', 1]] as const) {
      const hip = new Vector3(s * 0.1, 0.52, -0.02);
      const knee = new Vector3(s * 0.12, 0.53, -0.44);
      const ankle = new Vector3(s * 0.13, 0.1, -0.48);
      placeBetween(this.parts[`Thigh${side}`] as Mesh, hip, knee);
      placeBetween(this.parts[`Shin${side}`] as Mesh, knee, ankle);
      (this.parts[`Shoe${side}`] as Mesh).position.set(s * 0.13, 0.035, -0.53);
    }
  }
}
