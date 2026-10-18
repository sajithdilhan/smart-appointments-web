import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';

export const MAX_PARTICLES = 60;
export const CONFETTI_MS = 2_000;
const GRAVITY = 900; // px per second squared
const FALLBACK_COLOURS = ['#0f766e', '#14b8a6', '#f59e0b', '#ef4444', '#6366f1'];
const THEME_VARIABLES = ['--primary', '--brand-500', '--brand-300', '--destructive', '--ring'];

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  colour: string;
}

/** At most `MAX_PARTICLES`, spread across the top of the canvas with random velocities. */
export function createParticles(
  count: number,
  width: number,
  colours: readonly string[],
  random: () => number = Math.random,
): Particle[] {
  return Array.from({ length: Math.min(count, MAX_PARTICLES) }, (_, i) => ({
    x: width * (0.25 + random() * 0.5),
    y: 40 + random() * 40,
    vx: (random() - 0.5) * 500,
    vy: -150 - random() * 350,
    size: 5 + random() * 5,
    rotation: random() * Math.PI * 2,
    spin: (random() - 0.5) * 12,
    colour: colours[i % colours.length],
  }));
}

/** One physics step of `dt` seconds. */
export function stepParticle(p: Particle, dt: number): void {
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.rotation += p.spin * dt;
}

function themeColours(): string[] {
  const style = getComputedStyle(document.documentElement);
  const found = THEME_VARIABLES.map((name) => style.getPropertyValue(name).trim()).filter(Boolean);
  return found.length > 0 ? found : FALLBACK_COLOURS;
}

/**
 * A short canvas burst (60 particles, 2 s) on success. Decorative: `aria-hidden`, no pointer
 * events, no focus. It stops and removes itself at 2 s, when the tab is hidden and on destroy.
 * Only rendered (through `@defer`) when reduced motion is off, so it is its own lazy chunk.
 */
@Component({
  selector: 'app-confetti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (active()) {
      <canvas
        #canvas
        aria-hidden="true"
        class="pointer-events-none fixed inset-0 z-50 h-full w-full"
      ></canvas>
    }
  `,
})
export class ConfettiComponent {
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private frame: number | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
  };

  protected readonly active = signal(true);

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.stop());
    afterNextRender(() => this.start());
  }

  private start(): void {
    const el = this.canvas()?.nativeElement;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || document.hidden) {
      this.stop();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    el.width = Math.floor(width * dpr);
    el.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);
    const particles = createParticles(MAX_PARTICLES, width, themeColours());
    document.addEventListener('visibilitychange', this.onVisibility);

    let started: number | null = null;
    let last = 0;
    const tick = (now: number) => {
      started ??= now;
      const elapsed = now - started;
      if (elapsed >= CONFETTI_MS) {
        this.stop();
        return;
      }
      const dt = Math.min((now - (last || now)) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, (CONFETTI_MS - elapsed) / 500);
      for (const p of particles) {
        stepParticle(p, dt);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.active.set(false);
  }
}
