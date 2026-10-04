import { SlidingWindowBudget } from './request-budget';

describe('SlidingWindowBudget', () => {
  it('allows 25 in the window and refuses the 26th', () => {
    const budget = new SlidingWindowBudget();
    for (let i = 0; i < 25; i++) expect(budget.tryAcquire(i * 100)).toEqual({ ok: true });
    expect(budget.tryAcquire(2_600)).toEqual({ ok: false, retryAfterSeconds: 58 });
  });

  it('refusals are not recorded, so they never extend the wait', () => {
    const budget = new SlidingWindowBudget(2, 10_000);
    budget.tryAcquire(0);
    budget.tryAcquire(1_000);
    expect(budget.tryAcquire(2_000).ok).toBe(false);
    expect(budget.tryAcquire(5_000).ok).toBe(false);
    // The first request leaves the window at 10 s.
    expect(budget.tryAcquire(10_000)).toEqual({ ok: true });
  });

  it('slides: old requests expire one by one', () => {
    const budget = new SlidingWindowBudget(2, 10_000);
    budget.tryAcquire(0);
    budget.tryAcquire(6_000);
    expect(budget.tryAcquire(9_999)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(budget.tryAcquire(10_000)).toEqual({ ok: true });
    expect(budget.tryAcquire(10_001)).toEqual({ ok: false, retryAfterSeconds: 6 });
    expect(budget.tryAcquire(16_000)).toEqual({ ok: true });
  });

  it('rounds the wait up to whole seconds and never reports zero', () => {
    const budget = new SlidingWindowBudget(1, 60_000);
    budget.tryAcquire(0);
    expect(budget.tryAcquire(59_500)).toEqual({ ok: false, retryAfterSeconds: 1 });
    expect(budget.tryAcquire(1)).toEqual({ ok: false, retryAfterSeconds: 60 });
  });
});
