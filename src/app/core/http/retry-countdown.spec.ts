import { TestBed } from '@angular/core/testing';
import { useFakeTimers } from '../../../testing/fake-timers';
import { AppError } from './app-error';
import { createRetryCountdown, type RetryCountdown } from './retry-countdown';

function create(): RetryCountdown {
  return TestBed.runInInjectionContext(() => createRetryCountdown());
}

describe('createRetryCountdown', () => {
  beforeEach(() => useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is idle until started', () => {
    const c = create();
    expect(c.active()).toBe(false);
    expect(c.remaining()).toBe(0);
  });

  it('starts at n and counts down once per second until it ends', async () => {
    const c = create();
    c.start(3);
    expect(c.active()).toBe(true);
    expect(c.remaining()).toBe(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.remaining()).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.remaining()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.remaining()).toBe(0);
    expect(c.active()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the deadline instead of stacking timers', async () => {
    const c = create();
    c.start(10);
    await vi.advanceTimersByTimeAsync(2000);
    c.start(5);
    expect(c.remaining()).toBe(5);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(c.active()).toBe(false);
  });

  it('cancel stops the timer and resets', async () => {
    const c = create();
    c.start(10);
    c.cancel();
    expect(c.active()).toBe(false);
    expect(c.remaining()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('catches up after one large jump (a throttled background tab)', async () => {
    const c = create();
    c.start(60);
    vi.setSystemTime(Date.now() + 45_000);
    await vi.advanceTimersByTimeAsync(250);
    expect(c.remaining()).toBe(15);
    vi.setSystemTime(Date.now() + 30_000);
    await vi.advanceTimersByTimeAsync(250);
    expect(c.remaining()).toBe(0);
    expect(c.active()).toBe(false);
  });

  it.each([0, -3, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('ignores start(%s)', (n) => {
    const c = create();
    c.start(n);
    expect(c.active()).toBe(false);
  });

  it('floors a fractional value of at least 1', () => {
    const c = create();
    c.start(2.9);
    expect(c.remaining()).toBe(2);
  });

  it('startFrom starts only for a rate-limited AppError', () => {
    const c = create();
    c.startFrom(new AppError(500, 'x', 'http'));
    c.startFrom('nope');
    c.startFrom(null);
    expect(c.active()).toBe(false);
    c.startFrom(new AppError(429, 'x', 'rate-limited', undefined, 42));
    expect(c.remaining()).toBe(42);
    c.cancel();
    c.startFrom({ kind: 'rate-limited' });
    expect(c.remaining()).toBe(60);
  });

  it('clears the timer when the owning injector is destroyed', () => {
    const c = create();
    c.start(30);
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
