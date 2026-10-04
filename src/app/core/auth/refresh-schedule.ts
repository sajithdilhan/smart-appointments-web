/**
 * Milliseconds until the next proactive refresh: `max(0, exp - margin - now)`, floored at the
 * last refresh plus `minGapMs` so a clock-skew loop cannot refresh more than once per 5 s.
 */
export function refreshDelayMs(
  expMs: number,
  nowMs: number,
  lastRefreshAtMs: number | null,
  marginMs = 60_000,
  minGapMs = 5_000,
): number {
  const due = Math.max(0, expMs - marginMs - nowMs);
  const notBefore = lastRefreshAtMs === null ? 0 : Math.max(0, lastRefreshAtMs + minGapMs - nowMs);
  return Math.max(due, notBefore);
}
