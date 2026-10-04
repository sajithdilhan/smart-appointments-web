import type { Clock } from '../app/core/util/clock';

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/** A `Clock` driven by hand: `advance(ms)` moves time and fires due timers in order. */
export class ManualClock implements Clock {
  private current: number;
  private nextId = 1;
  private timers: Timer[] = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimer(fn: () => void, ms: number): () => void {
    const timer: Timer = { id: this.nextId++, at: this.current + Math.max(0, ms), fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((t) => t.id !== timer.id);
    };
  }

  get pending(): number {
    return this.timers.length;
  }

  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t.id !== due.id);
      this.current = Math.max(this.current, due.at);
      due.fn();
    }
    this.current = target;
  }
}
