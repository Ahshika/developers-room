import type { AudioManager } from '../services/AudioManager';

/** Typed access to the server-rendered controls in index.html (no innerHTML anywhere). */
function el<T extends HTMLElement>(id: string, root: Document): T {
  const node = root.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in index.html`);
  return node as T;
}

export class Ui {
  readonly stage: HTMLElement;
  private readonly loader: HTMLElement;
  private readonly step: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly skip: HTMLButtonElement;
  private readonly sound: HTMLButtonElement;
  private readonly soundLabel: HTMLElement;
  private readonly fallback: HTMLElement;
  private readonly fallbackReason: HTMLElement;
  private readonly unreachable: HTMLElement;
  private readonly ending: HTMLElement;
  private readonly live: HTMLElement;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly doc: Document = document) {
    this.stage = el('dr-stage', doc);
    this.loader = el('dr-loader', doc);
    this.step = el('dr-loader-step', doc);
    this.overlay = el('dr-overlay', doc);
    this.controls = el('dr-controls', doc);
    this.skip = el('dr-skip', doc);
    this.sound = el('dr-sound', doc);
    this.soundLabel = this.sound.querySelector('.dr-btn__label') as HTMLElement;
    this.fallback = el('dr-fallback', doc);
    this.fallbackReason = el('dr-fallback-reason', doc);
    this.unreachable = el('dr-unreachable', doc);
    this.ending = el('dr-ending', doc);
    this.live = el('dr-live', doc);
  }

  setState(state: string): void {
    this.doc.documentElement.dataset.drState = state;
  }

  /** Honest step progress: "2 / 4 · Loading fonts" (no fake percentage). */
  setStep(index: number, total: number, label: string): void {
    this.step.textContent = `${index} / ${total} · ${label}`;
  }

  hideLoader(): void {
    this.loader.classList.add('is-hidden');
    this.loader.setAttribute('aria-hidden', 'true');
  }

  /** Fades in the portfolio-grid overlay; resolves when fully opaque. */
  showOverlay(seconds: number): Promise<void> {
    const ms = Math.max(0, seconds * 1000);
    this.overlay.style.transitionDuration = `${ms}ms`;
    // force style flush so the transition runs even when called right after a state change
    void this.overlay.offsetWidth;
    this.overlay.classList.add('is-visible');
    return new Promise((resolve) => setTimeout(resolve, ms + 30));
  }

  hideControls(): void {
    this.controls.hidden = true;
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  onSkip(handler: () => void): void {
    const h = () => handler();
    this.skip.addEventListener('click', h);
    this.cleanups.push(() => this.skip.removeEventListener('click', h));
  }

  /** Shows the sound toggle only when Web Audio exists; the toggle reflects the real state. */
  bindSound(audio: AudioManager): void {
    if (!audio.isSupported) return;
    this.sound.hidden = false;
    const render = (on: boolean) => {
      this.sound.setAttribute('aria-pressed', String(on));
      this.soundLabel.textContent = on ? 'Sound on' : 'Sound off';
    };
    render(audio.isEnabled);
    this.cleanups.push(audio.onChange(render));
    const click = () => void audio.setEnabled(!audio.isEnabled);
    this.sound.addEventListener('click', click);
    this.cleanups.push(() => this.sound.removeEventListener('click', click));
  }

  showFallback(reason: string): void {
    this.hideLoader();
    this.hideControls();
    this.fallbackReason.textContent = reason;
    this.fallback.hidden = false;
    this.focusFirst(this.fallback);
  }

  showUnreachable(onRetry: () => void): void {
    this.hideControls();
    this.unreachable.hidden = false;
    const retry = el<HTMLButtonElement>('dr-retry', this.doc);
    retry.onclick = () => {
      this.unreachable.hidden = true;
      onRetry();
    };
    this.focusFirst(this.unreachable);
  }

  showEnding(onReplay: () => void): void {
    this.hideLoader();
    this.hideControls();
    this.ending.hidden = false;
    el<HTMLButtonElement>('dr-replay', this.doc).onclick = onReplay;
    this.focusFirst(this.ending);
  }

  dispose(): void {
    this.cleanups.splice(0).forEach((c) => c());
  }

  private focusFirst(panel: HTMLElement): void {
    panel.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
  }
}
