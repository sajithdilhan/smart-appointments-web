import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ManualClock } from '../../../testing/manual-clock';
import { createNowSignal } from './now-signal';

const T0 = 1_700_000_000_000;

function setup(deadlines: number[]) {
  const clock = new ManualClock(T0);
  const list = signal<readonly number[]>(deadlines);
  const now = runInInjectionContext(TestBed.inject(Injector), () => {
    const n = createNowSignal(clock);
    n.watch(list);
    return n.now;
  });
  TestBed.tick();
  return { clock, list, now };
}

describe('createNowSignal', () => {
  it('starts at the clock time', () => {
    const { now } = setup([T0 + 5_000]);
    expect(now()).toBe(T0);
  });

  it('flips exactly at the deadline, not before', () => {
    const { clock, now } = setup([T0 + 5_000]);
    clock.advance(4_999);
    expect(now()).toBe(T0);
    clock.advance(1);
    expect(now()).toBe(T0 + 5_000);
  });

  it('re-arms for the next deadline and keeps one timer at a time', () => {
    const { clock, now } = setup([T0 + 9_000, T0 + 3_000]);
    expect(clock.pending).toBe(1);
    clock.advance(3_000);
    expect(now()).toBe(T0 + 3_000);
    expect(clock.pending).toBe(1);
    clock.advance(5_999);
    expect(now()).toBe(T0 + 3_000);
    clock.advance(1);
    expect(now()).toBe(T0 + 9_000);
    expect(clock.pending).toBe(0);
  });

  it('sets no timer when there is no future deadline', () => {
    const { clock } = setup([T0 - 1_000, T0]);
    expect(clock.pending).toBe(0);
    const empty = setup([]);
    expect(empty.clock.pending).toBe(0);
  });

  it('re-arms and refreshes now when the deadlines change', () => {
    const { clock, list, now } = setup([T0 + 10_000]);
    clock.advance(2_000);
    expect(now()).toBe(T0);
    list.set([T0 + 4_000, T0 + 10_000]);
    TestBed.tick();
    expect(now()).toBe(T0 + 2_000);
    expect(clock.pending).toBe(1);
    clock.advance(2_000);
    expect(now()).toBe(T0 + 4_000);
    list.set([]);
    TestBed.tick();
    expect(clock.pending).toBe(0);
  });

  it('cancels its timer when destroyed', () => {
    const { clock } = setup([T0 + 5_000]);
    expect(clock.pending).toBe(1);
    TestBed.resetTestingModule();
    expect(clock.pending).toBe(0);
  });
});
