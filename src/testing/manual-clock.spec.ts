import { ManualClock } from './manual-clock';

describe('ManualClock', () => {
  it('fires due timers in order as time advances', () => {
    const clock = new ManualClock(1000);
    const calls: string[] = [];
    clock.setTimer(() => calls.push('b'), 200);
    clock.setTimer(() => calls.push('a'), 100);
    clock.advance(150);
    expect(calls).toEqual(['a']);
    expect(clock.now()).toBe(1150);
    clock.advance(100);
    expect(calls).toEqual(['a', 'b']);
  });

  it('cancels a timer', () => {
    const clock = new ManualClock();
    const fn = vi.fn();
    const cancel = clock.setTimer(fn, 10);
    cancel();
    clock.advance(50);
    expect(fn).not.toHaveBeenCalled();
    expect(clock.pending).toBe(0);
  });
});
