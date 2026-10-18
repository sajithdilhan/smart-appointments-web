/**
 * A client-side sliding window over the slot searches actually sent: 25 in 60 s, a margin
 * under the gateway's 30 per user (Req 5.5). Time is passed in so tests use a fake clock.
 */
export class SlidingWindowBudget {
  private sent: number[] = [];

  constructor(
    private readonly limit = 25,
    private readonly windowMs = 60_000,
  ) {}

  /** Records the request when there is room; otherwise says how long until there is. */
  tryAcquire(now: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
    this.sent = this.sent.filter((t) => now - t < this.windowMs);
    if (this.sent.length >= this.limit) {
      const waitMs = this.sent[0] + this.windowMs - now;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }
    this.sent.push(now);
    return { ok: true };
  }
}
