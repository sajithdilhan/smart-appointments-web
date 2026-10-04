import { refreshDelayMs } from './refresh-schedule';

describe('refreshDelayMs', () => {
  const now = 1_000_000;
  it.each([
    ['far in the future: exp - 60 s - now', now + 3_600_000, null, 3_540_000],
    ['near: inside the margin refreshes at once', now + 30_000, null, 0],
    ['past: refreshes at once', now - 5_000, null, 0],
    ['exactly at the margin', now + 60_000, null, 0],
    ['5 s floor after a refresh 1 s ago', now + 10_000, now - 1_000, 4_000],
    ['floor does not delay a later deadline', now + 3_600_000, now - 1_000, 3_540_000],
    ['floor expired', now + 10_000, now - 6_000, 0],
  ])('%s', (_name, exp, last, expected) => {
    expect(refreshDelayMs(exp, now, last)).toBe(expected);
  });

  it('honours custom margin and gap', () => {
    expect(refreshDelayMs(now + 100_000, now, null, 10_000)).toBe(90_000);
    expect(refreshDelayMs(now, now, now, 60_000, 2_000)).toBe(2_000);
  });
});
