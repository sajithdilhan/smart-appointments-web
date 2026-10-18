import vectors from '../../../../testing/fixtures/slot-planner-vectors.json';
import type { DayName } from '../../../core/time';
import { estimateSlots } from './slot-estimate';

describe('estimateSlots against the backend SlotPlanner vectors', () => {
  it('has the cases the design asks for', () => {
    const names = vectors.vectors.map((v) => v.name).join('\n');
    for (const needle of [
      'Europe/London spring forward 2026-03-29',
      'Europe/London fall back 2026-10-25',
      'America/New_York spring forward 2026-03-08',
      'America/New_York fall back 2026-11-01',
      'Pacific/Auckland spring forward 2026-09-27',
      'Asia/Kolkata',
      'does not divide',
      '31 dates',
      'mid-day today',
    ]) {
      expect(names, needle).toContain(needle);
    }
  });

  it.each(vectors.vectors.map((v) => [v.name, v] as const))('%s', (_name, v) => {
    const estimate = estimateSlots({
      timeZoneId: v.timeZoneId,
      hours: v.hours.map((h) => ({ ...h, dayOfWeek: h.dayOfWeek as DayName })),
      durationMinutes: v.durationMinutes,
      fromDate: v.fromDate,
      toDate: v.toDate,
      nowMs: Date.parse(v.nowUtc),
    });
    expect(estimate).toEqual(v.expected);
  });
});

describe('estimateSlots edge cases', () => {
  const base = {
    timeZoneId: 'UTC',
    hours: [{ dayOfWeek: 'Monday' as const, opensAt: '09:00', closesAt: '10:00' }],
    durationMinutes: 30,
    nowMs: Date.UTC(2026, 0, 1),
  };

  it('counts closed days and ordinary days by the closed form', () => {
    expect(estimateSlots({ ...base, fromDate: '2026-10-05', toDate: '2026-10-11' })).toEqual({
      days: 7,
      slots: 2,
      closedDays: 6,
      droppedPast: 0,
    });
  });

  it('accepts times with seconds, as the backend may serialise them', () => {
    const hours = [{ dayOfWeek: 'Monday' as const, opensAt: '09:00:00', closesAt: '10:00:00' }];
    expect(
      estimateSlots({ ...base, hours, fromDate: '2026-10-05', toDate: '2026-10-05' }).slots,
    ).toBe(2);
  });

  it('an inverted range has no days; no hours means every day is closed', () => {
    expect(estimateSlots({ ...base, fromDate: '2026-10-06', toDate: '2026-10-05' })).toEqual({
      days: 0,
      slots: 0,
      closedDays: 0,
      droppedPast: 0,
    });
    expect(
      estimateSlots({ ...base, hours: [], fromDate: '2026-10-05', toDate: '2026-10-06' }),
    ).toMatchObject({ days: 2, slots: 0, closedDays: 2 });
  });
});
