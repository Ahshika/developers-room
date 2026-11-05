import { CanvasTexture, Color, LinearFilter, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { MESSAGE_LAYOUT, PORTFOLIO_GRID } from '../../config/layout';
import { createRandom } from '../../utils/random';

/**
 * Main-monitor UI drawn into a CanvasTexture (STORYBOARD.md §7): scrolling code, the
 * NEW VISITOR DETECTED notification, the two message lines, and the portfolio grid used by the
 * screen-entry hand-off. The material is unlit and not tone-mapped, so the grid colour on the
 * monitor is exactly the portfolio's #151a20 at the moment of hand-off.
 */

export interface ScreenState {
  code: number;
  notify: number;
  msg1: number;
  msg2: number;
  grid: number;
}

export interface GridLayout {
  cellPx: number;
  offsetX: number;
  offsetY: number;
  linePx: number;
}

export interface MessageLayout {
  rows: string[][];
  fontPx: number;
  capPx: number;
  /** Width of the widest row at fontPx. */
  widestPx: number;
}

const DISPLAY_FONT = '"Space Grotesk", "Segoe UI", system-ui, sans-serif';
const MONO_FONT = '"JetBrains Mono", ui-monospace, Consolas, monospace';
const CODE_ROWS = 160;
const GLOW_IDLE = new Color('#1d6fd6');
const GLOW_NOTIFY = new Color('#42d9ff');
const GLOW_MESSAGE = new Color('#cfe8ff');
const GLOW_GRID = new Color(PORTFOLIO_GRID.background);

type Measure = (text: string, fontPx: number) => { width: number; cap: number };

/**
 * Pure layout: picks rows (wrapped on portrait viewports) and the largest font size whose widest
 * row fits `maxRowWidth` of the canvas and whose rows fit 80% of its height.
 */
export function layoutMessage(lines: readonly [string, string], portrait: boolean, canvasWidth: number, canvasHeight: number, measure: Measure): MessageLayout {
  const rows: string[][] = portrait
    ? MESSAGE_LAYOUT.portraitRows.map((r) => [...r])
    : [[lines[0]], [lines[1]]];
  const ref = 100;
  const widest = Math.max(...rows.flat().map((r) => measure(r, ref).width));
  const rowCount = rows.flat().length;
  const byWidth = (MESSAGE_LAYOUT.maxRowWidth * canvasWidth * ref) / widest;
  const byHeight = (0.8 * canvasHeight) / (rowCount * 1.25 + 0.5);
  const fontPx = Math.floor(Math.min(byWidth, byHeight));
  return { rows, fontPx, capPx: measure('H', fontPx).cap, widestPx: (widest * fontPx) / ref };
}

/** Notification card geometry as fractions of the canvas (text must fit `textWidth`). */
const NOTIFY = { cardX: 0.03, cardWidth: 0.94, textX: 0.1, textWidth: 0.8, maxFontOfHeight: 0.16, cardHeightOfFont: 2.2 } as const;

export class MonitorScreen {
  readonly state: ScreenState = { code: 0, notify: 0, msg1: 0, msg2: 0, grid: 0 };
  readonly material: MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private readonly codeRows: { indent: number; tokens: { w: number; color: string }[] }[] = [];
  private grid: GridLayout | null = null;
  private message: MessageLayout;
  private notifyFontPx = 0;
  private notifyCapPx = 0;
  private last = '';
  private sinceDraw = 1;
  private scroll = 0;
  private readonly glowColor = new Color();

  constructor(width: number, height: number, private readonly lines: readonly [string, string], private readonly notification: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.texture.anisotropy = 4;
    this.material = new MeshBasicMaterial({ map: this.texture, toneMapped: false });
    const rnd = createRandom(42);
    const palette = ['#42d9ff', '#1769ff', '#ff8a36', '#8aa0b8', '#e8eef5', '#5d6b7c'];
    for (let i = 0; i < CODE_ROWS; i++) {
      const tokens = Array.from({ length: rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 6) }, () => ({
        w: 0.02 + rnd() * 0.09,
        color: palette[Math.floor(rnd() * palette.length)] as string,
      }));
      this.codeRows.push({ indent: Math.floor(rnd() * 4), tokens });
    }
    this.message = this.computeMessageLayout(false);
    this.computeNotificationLayout();
  }

  /** Cap height (fraction of screen height) and widest row (fraction of screen width) per text, for the camera. */
  get textMetrics(): { message: { cap: number; width: number }; notification: { cap: number; width: number } } {
    const W = this.canvas.width;
    const H = this.canvas.height;
    return {
      message: { cap: this.message.capPx / H, width: this.message.widestPx / W },
      // the notification card spans the screen, so the camera frames the whole card
      notification: { cap: this.notifyCapPx / H, width: NOTIFY.cardWidth },
    };
  }

  get canvasWidth(): number {
    return this.canvas.width;
  }

  get canvasHeight(): number {
    return this.canvas.height;
  }

  setPortrait(portrait: boolean): void {
    this.message = this.computeMessageLayout(portrait);
    this.last = '';
  }

  setGridLayout(grid: GridLayout): void {
    this.grid = grid;
    this.last = '';
  }

  /** Colour/strength of the light the screen casts into the room. */
  glow(): { color: Color; strength: number } {
    const s = this.state;
    const grid = Math.min(1, s.grid);
    this.glowColor.copy(GLOW_IDLE).lerp(GLOW_NOTIFY, Math.min(1, s.notify)).lerp(GLOW_MESSAGE, Math.max(s.msg1, s.msg2) * 0.6);
    this.glowColor.lerp(GLOW_GRID, grid);
    const strength = (0.35 + s.code * 0.25 + s.notify * 0.5 + Math.max(s.msg1, s.msg2) * 0.5) * (1 - grid * 0.8);
    return { color: this.glowColor, strength };
  }

  /** Redraws when something changed; code scrolling is throttled to 30 Hz. */
  update(dt: number): void {
    this.sinceDraw += dt;
    const s = this.state;
    if (s.code > 0.001) this.scroll += dt * 26;
    const key = `${s.code.toFixed(3)}|${s.notify.toFixed(3)}|${s.msg1.toFixed(3)}|${s.msg2.toFixed(3)}|${s.grid.toFixed(3)}`;
    const scrolling = s.code > 0.001 && s.grid < 0.999;
    if (key === this.last && !(scrolling && this.sinceDraw >= 1 / 30)) return;
    this.last = key;
    this.sinceDraw = 0;
    this.draw();
    this.texture.needsUpdate = true;
  }

  /** Forces a synchronous redraw (first frame, hand-off frame). */
  drawNow(): void {
    this.last = '';
    this.update(0);
  }

  dispose(): void {
    this.texture.dispose();
    this.material.dispose();
  }

  private computeMessageLayout(portrait: boolean): MessageLayout {
    const ctx = this.ctx;
    return layoutMessage(this.lines, portrait, this.canvas.width, this.canvas.height, (text, px) => {
      ctx.font = `600 ${px}px ${DISPLAY_FONT}`;
      this.applyLetterSpacing(px);
      const m = ctx.measureText(text);
      return { width: m.width, cap: m.actualBoundingBoxAscent || px * 0.7 };
    });
  }

  /** Largest notification font whose text fits the card's text area. */
  private computeNotificationLayout(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const ref = 100;
    ctx.font = `600 ${ref}px ${DISPLAY_FONT}`;
    this.applyLetterSpacing(ref);
    const width = ctx.measureText(this.notification).width || ref * this.notification.length * 0.7;
    this.notifyFontPx = Math.floor(Math.min((NOTIFY.textWidth * W * ref) / width, NOTIFY.maxFontOfHeight * this.canvas.height));
    ctx.font = `600 ${this.notifyFontPx}px ${DISPLAY_FONT}`;
    this.applyLetterSpacing(this.notifyFontPx);
    this.notifyCapPx = ctx.measureText('H').actualBoundingBoxAscent || this.notifyFontPx * 0.7;
  }

  private applyLetterSpacing(px: number): void {
    const ctx = this.ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(px * 0.08).toFixed(1)}px`;
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const s = this.state;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, W, H);

    const codeAlpha = s.code * (1 - Math.max(s.msg1, s.msg2) * 0.75) * (1 - s.notify * 0.35);
    if (codeAlpha > 0.001) this.drawCode(codeAlpha);
    if (s.notify > 0.001) this.drawNotification(s.notify);
    if (s.msg1 > 0.001 || s.msg2 > 0.001) this.drawMessage(s.msg1, s.msg2);
    if (s.grid > 0.001) this.drawGrid(Math.min(1, s.grid));
  }

  private drawCode(alpha: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const rowH = H / 24;
    const first = Math.floor(this.scroll / rowH);
    const offset = (this.scroll % rowH);
    ctx.font = `500 ${Math.round(rowH * 0.42)}px ${MONO_FONT}`;
    for (let r = 0; r < 26; r++) {
      const row = this.codeRows[(first + r) % CODE_ROWS];
      if (!row) continue;
      const y = r * rowH - offset + rowH * 0.35;
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = '#5d6b7c';
      ctx.fillText(String((first + r) % 999 + 1).padStart(3, ' '), W * 0.02, y + rowH * 0.32);
      let x = W * 0.08 + row.indent * W * 0.03;
      for (const t of row.tokens) {
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = t.color;
        ctx.fillRect(x, y, t.w * W, rowH * 0.32);
        x += t.w * W + W * 0.012;
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawNotification(t: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const px = this.notifyFontPx;
    const slide = (1 - Math.min(1, t)) * H * 0.04;
    const w = W * NOTIFY.cardWidth;
    const h = px * NOTIFY.cardHeightOfFont;
    const x = W * NOTIFY.cardX;
    const y = (H - h) / 2 + slide;
    ctx.globalAlpha = Math.min(1, t);
    ctx.fillStyle = 'rgba(7,17,31,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#42d9ff';
    ctx.lineWidth = Math.max(2, H * 0.005);
    ctx.shadowColor = 'rgba(66,217,255,0.6)';
    ctx.shadowBlur = H * 0.03;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff8a36';
    ctx.beginPath();
    ctx.arc(x + W * 0.035, y + h / 2, px * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 ${px}px ${DISPLAY_FONT}`;
    this.applyLetterSpacing(px);
    ctx.fillStyle = '#e8eef5';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(this.notification, W * NOTIFY.textX, y + h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }

  private drawMessage(a1: number, a2: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const { rows, fontPx } = this.message;
    const rowH = fontPx * 1.25;
    const gap = fontPx * 0.5;
    const total = rows.flat().length * rowH + gap;
    let y = (H - total) / 2 + fontPx;
    ctx.font = `600 ${fontPx}px ${DISPLAY_FONT}`;
    this.applyLetterSpacing(fontPx);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(66,217,255,0.45)';
    ctx.shadowBlur = fontPx * 0.35;
    rows.forEach((group, gi) => {
      const alpha = Math.min(1, gi === 0 ? a1 : a2);
      const rise = (1 - alpha) * fontPx * 0.25;
      for (const row of group) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gi === 0 ? '#e8eef5' : '#42d9ff';
        ctx.fillText(row, W / 2, y + rise);
        y += rowH;
      }
      y += gap;
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  /** The portfolio's fixed background, scaled to the cover distance (ARCHITECTURE.md §7). */
  private drawGrid(alpha: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PORTFOLIO_GRID.background;
    ctx.fillRect(0, 0, W, H);
    const g = this.grid;
    if (g && g.cellPx > 2) {
      const line = Math.max(0.75, g.linePx);
      const minor = (g.cellPx * PORTFOLIO_GRID.minorCssPx) / PORTFOLIO_GRID.majorCssPx;
      this.gridLines(minor, g.offsetX, g.offsetY, line, PORTFOLIO_GRID.minorColor, W, H);
      this.gridLines(g.cellPx, g.offsetX, g.offsetY, line, PORTFOLIO_GRID.majorColor, W, H);
    }
    ctx.globalAlpha = 1;
  }

  private gridLines(step: number, ox: number, oy: number, line: number, color: string, W: number, H: number): void {
    if (step < 1.5) return;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (let x = ox - Math.ceil(ox / step) * step; x < W; x += step) ctx.fillRect(x, 0, line, H);
    for (let y = oy - Math.ceil(oy / step) * step; y < H; y += step) ctx.fillRect(0, y, W, line);
  }
}
