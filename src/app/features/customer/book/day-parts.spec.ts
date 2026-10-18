import type { SlotResponse } from '../../../core/api/models';
import { capacityHint, groupSlots, partOfDay } from './day-parts';

function slot(local: string, utc: string, available = 2): SlotResponse {
  return {
    id: `id-${local}`,
    branchId: 'b',
    serviceTypeId: 's',
    date: '2026-10-05',
    startAtUtc: utc,
    endAtUtc: utc,
    localStartTime: local,
    localEndTime: local,
    capacity: 5,
    availableCapacity: available,
  };
}

describe('partOfDay', () => {
  it.each([
    ['00:00:00', 'morning'],
    ['09:30:00', 'morning'],
    ['11:59:00', 'morning'],
    ['12:00:00', 'afternoon'],
    ['16:59:00', 'afternoon'],
    ['17:00:00', 'evening'],
    ['23:59:00', 'evening'],
  ])('%s is %s', (time, part) => {
    expect(partOfDay(time)).toBe(part);
  });
});

describe('groupSlots', () => {
  it('groups by part of day, sorted by start, omitting empty groups', () => {
    const groups = groupSlots([
      slot('17:00:00', '2026-10-05T17:00:00Z'),
      slot('10:00:00', '2026-10-05T10:00:00Z'),
      slot('09:00:00', '2026-10-05T09:00:00Z'),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(['Morning', 'Evening']);
    expect(groups[0].slots.map((s) => s.localStartTime)).toEqual(['09:00:00', '10:00:00']);
  });

  it('is empty for no slots', () => {
    expect(groupSlots([])).toEqual([]);
  });
});

describe('capacityHint', () => {
  it.each([
    [1, '1 left'],
    [2, '2 left'],
    [3, '3 left'],
    [4, null],
    [10, null],
    [0, null],
  ])('%i free gives %s', (n, hint) => {
    expect(capacityHint(n)).toBe(hint);
  });
});
