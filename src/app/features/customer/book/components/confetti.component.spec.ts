import { render } from '@testing-library/angular';
import {
  CONFETTI_MS,
  ConfettiComponent,
  MAX_PARTICLES,
  createParticles,
  stepParticle,
} from './confetti.component';
import { SuccessCheckComponent } from './success-check.component';

function fakeContext() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  };
}

describe('createParticles and stepParticle', () => {
  it('never creates more than 60 particles', () => {
    expect(createParticles(500, 800, ['red'])).toHaveLength(MAX_PARTICLES);
    expect(createParticles(10, 800, ['red', 'blue'])).toHaveLength(10);
  });

  it('cycles the colours and applies gravity', () => {
    const [a, b, c] = createParticles(3, 800, ['red', 'blue'], () => 0.5);
    expect([a.colour, b.colour, c.colour]).toEqual(['red', 'blue', 'red']);
    const vy = a.vy;
    stepParticle(a, 0.1);
    expect(a.vy).toBeGreaterThan(vy);
  });
});

describe('ConfettiComponent', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    callbacks = new Map();
    nextId = 1;
    cancel = vi.fn((id: number) => callbacks.delete(id));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      callbacks.set(nextId, cb);
      return nextId++;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      fakeContext() as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Runs the pending frame at `time`. */
  const frame = (time: number) => {
    const [id, cb] = [...callbacks][0];
    callbacks.delete(id);
    cb(time);
  };

  it('renders a decorative, non-interactive, unfocusable canvas', async () => {
    const view = await render(ConfettiComponent);
    const canvas = view.container.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass('pointer-events-none');
    expect(canvas).not.toHaveAttribute('tabindex');
    expect(callbacks.size).toBe(1);
  });

  it('animates, then removes the canvas at 2 s and stops requesting frames', async () => {
    const view = await render(ConfettiComponent);
    frame(1_000);
    expect(callbacks.size).toBe(1);
    frame(1_000 + CONFETTI_MS - 1);
    expect(view.container.querySelector('canvas')).not.toBeNull();
    frame(1_000 + CONFETTI_MS);
    view.detectChanges();
    expect(callbacks.size).toBe(0);
    expect(view.container.querySelector('canvas')).toBeNull();
  });

  it('stops on destroy', async () => {
    const view = await render(ConfettiComponent);
    expect(callbacks.size).toBe(1);
    view.fixture.destroy();
    expect(cancel).toHaveBeenCalled();
    expect(callbacks.size).toBe(0);
  });

  it('stops when the tab is hidden', async () => {
    const view = await render(ConfettiComponent);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      view.detectChanges();
      expect(callbacks.size).toBe(0);
      expect(view.container.querySelector('canvas')).toBeNull();
    } finally {
      Reflect.deleteProperty(document, 'hidden');
    }
  });

  it('draws nothing without a 2d context and does not throw', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const view = await render(ConfettiComponent);
    view.detectChanges();
    expect(callbacks.size).toBe(0);
  });
});

describe('SuccessCheckComponent', () => {
  it('is a decorative SVG', async () => {
    const view = await render(SuccessCheckComponent);
    const svg = view.container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('path.check')).not.toBeNull();
  });
});
