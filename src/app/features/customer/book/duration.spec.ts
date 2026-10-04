import { formatDuration } from './duration';

describe('formatDuration', () => {
  it.each([
    [15, '15 min'],
    [30, '30 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [120, '2 h'],
    [135, '2 h 15 min'],
  ])('%i minutes is %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
