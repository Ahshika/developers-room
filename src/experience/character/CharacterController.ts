import type { gsap } from 'gsap';
import type { Camera, Object3D, Vector3 } from 'three';

/** Clip names from STORYBOARD.md §5. The Phase 3 Mixamo character implements the same contract. */
export type CharacterAction =
  | 'typing' | 'stopTyping' | 'headReaction' | 'chairTurn' | 'lookTowardVisitor' | 'nod'
  | 'lookTowardMonitor' | 'pointTowardMonitor' | 'returnToIdle' | 'faceVisitorCalm';

export interface CharacterController {
  readonly root: Object3D;
  /** Adds the action to the master timeline at `at` seconds, so Skip/kill stops it with everything else. */
  schedule(tl: gsap.core.Timeline, action: CharacterAction, at: number, duration?: number): void;
  /** Called once per frame from the single clock. */
  update(deltaSeconds: number, elapsedSeconds: number, camera: Camera, screenWorld: Vector3): void;
  /** True while the hands are on the keys (drives the keyboard sound). */
  readonly isTyping: boolean;
}
