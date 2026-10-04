import { TestBed } from '@angular/core/testing';
import { ManualClock } from '../../../testing/manual-clock';
import { CLOCK } from '../util/clock';
import { RefreshScheduler } from './refresh-scheduler';

function setup(startMs = 1_000_000) {
  const clock = new ManualClock(startMs);
  TestBed.configureTestingModule({ providers: [{ provide: CLOCK, useValue: clock }] });
  return { clock, scheduler: TestBed.inject(RefreshScheduler) };
}

function visibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('RefreshScheduler', () => {
  afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

  it('fires at exp minus 60 seconds, once', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.schedule(clock.now() + 3_600_000, due);
    clock.advance(3_539_999);
    expect(due).not.toHaveBeenCalled();
    clock.advance(1);
    expect(due).toHaveBeenCalledTimes(1);
    clock.advance(10_000_000);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it('replaces the earlier timer', () => {
    const { clock, scheduler } = setup();
    const first = vi.fn();
    const second = vi.fn();
    scheduler.schedule(clock.now() + 600_000, first);
    scheduler.schedule(clock.now() + 1_200_000, second);
    expect(clock.pending).toBe(1);
    clock.advance(1_200_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('refreshes at once for an expiry already inside the margin', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.schedule(clock.now() + 10_000, due);
    clock.advance(0);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it('keeps 5 seconds between refreshes', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.markRefreshed();
    scheduler.schedule(clock.now() + 10_000, due);
    clock.advance(4_999);
    expect(due).not.toHaveBeenCalled();
    clock.advance(1);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it('cancel clears the timer', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.schedule(clock.now() + 600_000, due);
    scheduler.cancel();
    expect(clock.pending).toBe(0);
    clock.advance(10_000_000);
    expect(due).not.toHaveBeenCalled();
  });

  it('recomputes from the deadline when the tab becomes visible', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.schedule(clock.now() + 600_000, due);
    // The throttled timer never fired while hidden, but time moved past the margin.
    (clock as unknown as { current: number }).current += 580_000;
    visibility('hidden');
    expect(clock.pending).toBe(1);
    visibility('visible');
    clock.advance(0);
    expect(due).toHaveBeenCalledTimes(1);
  });

  it('ignores visibilitychange when nothing is scheduled', () => {
    const { clock } = setup();
    visibility('visible');
    expect(clock.pending).toBe(0);
  });

  it('scheduleAfter re-arms for a blocked refresh', () => {
    const { clock, scheduler } = setup();
    const due = vi.fn();
    scheduler.schedule(clock.now() + 600_000, due);
    scheduler.scheduleAfter(30_000);
    clock.advance(30_000);
    expect(due).toHaveBeenCalledTimes(1);
  });
});
