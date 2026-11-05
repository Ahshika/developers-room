/**
 * Centralised audio (ARCHITECTURE.md §2, §9). All sounds are synthesised with the Web Audio API,
 * so there is nothing to download and nothing that can fail to load. Sound is muted by default;
 * the AudioContext is only created/resumed from a user gesture (browser autoplay rules).
 */

export type Cue = 'chime' | 'creak' | 'swell' | 'whoosh' | 'hum';

const PREF_KEY = 'dr.sound';

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = window as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function readSoundPreference(): boolean | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

function writeSoundPreference(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable: preference simply isn't remembered
  }
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private roomTone: AudioBufferSourceNode | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private typingWanted = false;
  private enabled = false;
  private disposed = false;
  private readonly listeners = new Set<(on: boolean) => void>();

  constructor(private readonly masterVolume: number) {}

  get isSupported(): boolean {
    return audioContextCtor() !== null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  onChange(listener: (on: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Must be called from a user gesture handler when turning sound on. */
  async setEnabled(on: boolean): Promise<void> {
    if (this.disposed) return;
    if (on) {
      if (!this.ensureContext()) return;
      try {
        await this.ctx?.resume();
      } catch {
        return;
      }
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.15);
      this.startRoomTone();
      if (this.typingWanted) this.scheduleTyping();
    } else if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.stopTypingLoop();
    }
    this.enabled = on;
    writeSoundPreference(on);
    this.listeners.forEach((l) => l(on));
  }

  /** Typing loop follows the character animation; harmless no-op while muted. */
  setTyping(on: boolean): void {
    this.typingWanted = on;
    if (on && this.enabled) this.scheduleTyping();
    else this.stopTypingLoop();
  }

  cue(name: Cue): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'chime':
        this.tone(880, t, 0.35, 0.18);
        this.tone(1318.5, t + 0.12, 0.5, 0.14);
        break;
      case 'creak':
        this.noiseBurst(t, 0.5, 'bandpass', 420, 180, 0.05);
        break;
      case 'swell':
        this.tone(220, t, 1.6, 0.06, 'triangle', 0.6);
        this.tone(330, t + 0.1, 1.6, 0.04, 'sine', 0.6);
        break;
      case 'whoosh':
        this.noiseBurst(t, 1.4, 'bandpass', 300, 2400, 0.12);
        break;
      case 'hum':
        this.tone(55, t, 1.5, 0.08, 'sawtooth', 0.4, 400);
        break;
    }
  }

  /** Fade everything out (used at the hand-off). */
  fadeOut(seconds: number): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, Math.max(0.01, seconds / 3));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopTypingLoop();
    try {
      this.roomTone?.stop();
    } catch {
      // already stopped
    }
    this.roomTone = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.listeners.clear();
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }

  private ensureContext(): boolean {
    if (this.ctx) return true;
    const Ctor = audioContextCtor();
    if (!Ctor) return false;
    try {
      this.ctx = new Ctor();
    } catch {
      return false;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    const length = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  private startRoomTone(): void {
    if (this.roomTone || !this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.roomTone = src;
  }

  private scheduleTyping(): void {
    if (this.typingTimer !== null || !this.enabled) return;
    const tick = () => {
      this.typingTimer = null;
      if (!this.enabled || !this.typingWanted || !this.ctx) return;
      this.noiseBurst(this.ctx.currentTime, 0.03, 'highpass', 2500, 2500, 0.05 + Math.random() * 0.03);
      this.typingTimer = setTimeout(tick, 70 + Math.random() * 120);
    };
    tick();
  }

  private stopTypingLoop(): void {
    if (this.typingTimer !== null) clearTimeout(this.typingTimer);
    this.typingTimer = null;
  }

  private tone(freq: number, at: number, dur: number, peak: number, type: OscillatorType = 'sine', attack = 0.01, lowpass?: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc.connect(gain);
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node = node.connect(f);
    }
    node.connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, type: BiquadFilterType, fromHz: number, toHz: number, peak: number): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(fromHz, at);
    filter.frequency.exponentialRampToValueAtTime(toHz, at + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + Math.min(0.01, dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
  }
}
