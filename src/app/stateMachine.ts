/** Runtime states (ARCHITECTURE.md §3). Every state has a path to the portfolio. */
export type AppState =
  | 'BOOT' | 'CHECKING' | 'LOADING' | 'INTRO' | 'SKIPPING' | 'HANDOFF' | 'DONE' | 'FALLBACK' | 'RETURNING' | 'UNREACHABLE';

const TRANSITIONS: Record<AppState, readonly AppState[]> = {
  BOOT: ['CHECKING', 'FALLBACK'],
  CHECKING: ['LOADING', 'FALLBACK', 'RETURNING', 'HANDOFF'],
  LOADING: ['INTRO', 'FALLBACK', 'SKIPPING', 'HANDOFF'],
  INTRO: ['HANDOFF', 'SKIPPING', 'FALLBACK', 'UNREACHABLE'],
  SKIPPING: ['HANDOFF', 'UNREACHABLE', 'FALLBACK'],
  HANDOFF: ['DONE', 'UNREACHABLE'],
  UNREACHABLE: ['HANDOFF'],
  DONE: ['RETURNING'],
  FALLBACK: ['HANDOFF'],
  RETURNING: ['HANDOFF', 'LOADING'],
};

export class StateMachine {
  private current: AppState = 'BOOT';
  private readonly listeners = new Set<(to: AppState, from: AppState) => void>();

  get state(): AppState {
    return this.current;
  }

  can(to: AppState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  /** Performs the transition if legal; illegal transitions are ignored and reported (never thrown). */
  go(to: AppState): boolean {
    if (!this.can(to)) {
      console.warn(`[dr] ignored illegal transition ${this.current} → ${to}`);
      return false;
    }
    const from = this.current;
    this.current = to;
    this.listeners.forEach((l) => l(to, from));
    return true;
  }

  onChange(listener: (to: AppState, from: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
