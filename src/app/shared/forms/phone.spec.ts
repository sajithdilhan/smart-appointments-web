import { isE164, normalizePhone } from './phone';

describe('phone', () => {
  it.each([
    ['+14155550123', '+14155550123'],
    ['(415) 555-0123', '4155550123'],
    ['+1 (415) 555-0123', '+14155550123'],
    ['415-555-0123', '4155550123'],
  ])('normalizePhone(%s) = %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([
    ['+14155550123', true],
    ['4155550123', true],
    ['(415) 555-0123', false],
    ['0123', false],
    ['+0123', false],
    ['+1234567890123456', false], // 16 digits
    ['+123456789012345', true], // 15 digits
    ['1', false],
    ['', false],
    ['+1abc', false],
  ])('isE164(%s) = %s', (value, expected) => {
    expect(isE164(value)).toBe(expected);
  });
});
