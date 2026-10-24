import { makeAppointment } from '../../../../testing/make-appointment';
import { groupByDate, toViewModel, type ViewContext } from './appointment-view';

// The process zone is Pacific/Kiritimati (UTC+14, no DST), none of the branch zones below.
const NOW = new Date('2026-10-04T12:00:00Z');
const ctx = (over: Partial<ViewContext> = {}): ViewContext => ({
  tab: 'upcoming',
  now: NOW,
  locale: 'en-GB',
  branch: { name: 'Branch', timeZoneId: 'Europe/London' },
  service: { name: 'Service' },
  ...over,
});
const at = (startUtc: string, endUtc?: string, status = 'Booked') =>
  makeAppointment({ startUtc, endUtc, status });

describe('toViewModel', () => {
  it.each([
    // zone, start, expected branch-zone date, expected time range
    ['Pacific/Auckland', '2026-10-05T15:00:00Z', '2026-10-06', '04:00 to 04:30'],
    ['America/New_York', '2026-10-05T03:30:00Z', '2026-10-04', '23:30 to 00:00'],
    ['Asia/Kolkata', '2026-10-05T19:00:00Z', '2026-10-06', '00:30 to 01:00'],
    ['Europe/London', '2026-10-05T15:00:00Z', '2026-10-05', '16:00 to 16:30'],
  ])('%s: branch-zone date and time range', (zone, start, dateKey, range) => {
    const v = toViewModel(at(start), ctx({ branch: { name: 'B', timeZoneId: zone } }));
    expect(v.dateKey).toBe(dateKey);
    expect(v.timeRange).toBe(range);
    expect(v.zone).toBe(zone);
    expect(v.zoneKnown).toBe(true);
  });

  it('a date boundary: 23:59 and 00:00 in New York land on different days', () => {
    const branch = { name: 'B', timeZoneId: 'America/New_York' };
    expect(toViewModel(at('2026-10-05T03:59:00Z'), ctx({ branch })).dateKey).toBe('2026-10-04');
    expect(toViewModel(at('2026-10-05T04:00:00Z'), ctx({ branch })).dateKey).toBe('2026-10-05');
  });

  it('a DST-change day (US fall back, 2026-11-01): the repeated 01:30 stays on one date', () => {
    const branch = { name: 'B', timeZoneId: 'America/New_York' };
    const first = toViewModel(at('2026-11-01T05:30:00Z'), ctx({ branch }));
    const second = toViewModel(at('2026-11-01T06:30:00Z'), ctx({ branch }));
    expect(first.timeRange.startsWith('01:30')).toBe(true);
    expect(second.timeRange.startsWith('01:30')).toBe(true);
    expect(first.dateKey).toBe('2026-11-01');
    expect(second.dateKey).toBe('2026-11-01');
  });

  it('shows a zone label and the browser line only when the zone differs from the browser', () => {
    const v = toViewModel(at('2026-10-05T15:00:00Z'), ctx());
    expect(v.zoneLabel).not.toBeNull();
    expect(v.zoneLabel).not.toBe('your time');
    expect(v.browserLine).toBe('05:00 your time');

    const same = toViewModel(
      at('2026-10-05T15:00:00Z'),
      ctx({ branch: { name: 'B', timeZoneId: 'Pacific/Kiritimati' } }),
    );
    expect(same.zoneLabel).toBeNull();
    expect(same.browserLine).toBeNull();
    expect(same.timeRange).toBe('05:00 to 05:30');
  });

  it.each([
    ['an absent timeZoneId', { name: 'B', timeZoneId: null }],
    ['a blank timeZoneId', { name: 'B', timeZoneId: ' ' }],
    ['an invalid timeZoneId', { name: 'B', timeZoneId: 'Mars/Phobos' }],
  ])('%s: browser zone labelled "your time"', (_n, branch) => {
    const v = toViewModel(at('2026-10-05T15:00:00Z'), ctx({ branch }));
    expect(v.zone).toBeNull();
    expect(v.zoneKnown).toBe(false);
    expect(v.zoneLabel).toBe('your time');
    expect(v.browserLine).toBeNull();
    expect(v.branchName).toBe('B');
    expect(v.timeRange).toBe('05:00 to 05:30');
    expect(v.dateKey).toBe('2026-10-06');
  });

  it('a missing branch gives "Unavailable branch" in the browser zone', () => {
    const v = toViewModel(at('2026-10-05T15:00:00Z'), ctx({ branch: undefined }));
    expect(v.branchName).toBe('Unavailable branch');
    expect(v.zoneLabel).toBe('your time');
    expect(v.zone).toBeNull();
  });

  it('a missing service gives "Unavailable service"', () => {
    const v = toViewModel(at('2026-10-05T15:00:00Z'), ctx({ service: undefined }));
    expect(v.serviceName).toBe('Unavailable service');
    expect(v.a11yName).toContain('Unavailable service');
  });

  it('never shows a raw id as a name', () => {
    const a = at('2026-10-05T15:00:00Z');
    const v = toViewModel(a, ctx({ branch: undefined, service: undefined }));
    expect(v.a11yName).not.toContain(a.branchId);
    expect(v.a11yName).not.toContain(a.serviceTypeId);
  });

  describe('past and actions', () => {
    it('isPast follows the tab, not the clock', () => {
      const future = at('2027-01-01T10:00:00Z');
      expect(toViewModel(future, ctx({ tab: 'past' })).isPast).toBe(true);
      const old = at('2020-01-01T10:00:00Z');
      expect(toViewModel(old, ctx({ tab: 'upcoming' })).isPast).toBe(false);
    });

    it.each([
      ['Booked', '2026-10-05T15:00:00Z', true],
      ['Booked', '2026-10-04T12:00:00Z', false],
      ['Booked', '2026-10-04T11:59:59Z', false],
      ['Cancelled', '2026-10-05T15:00:00Z', false],
      ['Mystery', '2026-10-05T15:00:00Z', false],
    ])(
      'status %s starting %s: canCancel and canAddToCalendar are %s',
      (status, start, expected) => {
        const v = toViewModel(at(start, undefined, status), ctx());
        expect(v.canCancel).toBe(expected);
        expect(v.canAddToCalendar).toBe(expected);
      },
    );

    it('uses the supplied now', () => {
      const a = at('2026-10-05T15:00:00Z');
      expect(toViewModel(a, ctx({ now: new Date('2026-10-05T14:59:00Z') })).canCancel).toBe(true);
      expect(toViewModel(a, ctx({ now: new Date('2026-10-05T15:01:00Z') })).canCancel).toBe(false);
    });
  });

  describe('status and accessible name', () => {
    it('names service, branch, date and time, status', () => {
      const v = toViewModel(at('2026-10-05T15:00:00Z'), ctx());
      expect(v.statusLabel).toBe('Booked');
      expect(v.a11yName).toBe(`Service, Branch, ${v.dateLabel} 16:00 to 16:30, Booked`);
      expect(v.dateLabel).toContain('5 Oct 2026');
    });

    it('marks a past Booked appointment, never "Completed"', () => {
      const v = toViewModel(at('2026-09-01T15:00:00Z'), ctx({ tab: 'past' }));
      expect(v.statusLabel).toBe('Booked');
      expect(v.a11yName).toMatch(/Booked \(past\)$/);
      expect(v.a11yName).not.toMatch(/completed/i);
    });

    it('Cancelled stays Cancelled; an unknown status shows its own text', () => {
      const cancelled = toViewModel(at('2026-10-05T15:00:00Z', undefined, 'Cancelled'), ctx());
      expect(cancelled.statusLabel).toBe('Cancelled');
      const v = toViewModel(at('2026-10-05T15:00:00Z', undefined, 'Archived'), ctx());
      expect(v.statusLabel).toBe('Archived');
      expect(v.a11yName.endsWith(', Archived')).toBe(true);
      expect(v.canCancel).toBe(false);
    });

    it('Completed and NoShow read "Completed" and "No-show" and cannot be cancelled', () => {
      const completed = toViewModel(at('2026-10-05T15:00:00Z', undefined, 'Completed'), ctx());
      expect(completed.statusLabel).toBe('Completed');
      expect(completed.canCancel).toBe(false);
      expect(completed.canAddToCalendar).toBe(false);
      expect(completed.a11yName.endsWith(', Completed')).toBe(true);
      const noShow = toViewModel(at('2026-10-05T15:00:00Z', undefined, 'NoShow'), ctx());
      expect(noShow.statusLabel).toBe('No-show');
      expect(noShow.canCancel).toBe(false);
      expect(noShow.a11yName.endsWith(', No-show')).toBe(true);
    });
  });
});

describe('groupByDate', () => {
  const view = (start: string) => toViewModel(at(start), ctx());

  it('groups adjacent items of one branch-zone date', () => {
    const views = [
      view('2026-10-05T09:00:00Z'),
      view('2026-10-05T11:00:00Z'),
      view('2026-10-06T09:00:00Z'),
    ];
    const groups = groupByDate(views);
    expect(groups.map((g) => [g.dateKey, g.items.length])).toEqual([
      ['2026-10-05', 2],
      ['2026-10-06', 1],
    ]);
    expect(groups[0].dateLabel).toBe(views[0].dateLabel);
  });

  it('never reorders: a repeated date far apart is a second group', () => {
    const views = [
      view('2026-10-05T09:00:00Z'),
      view('2026-10-07T09:00:00Z'),
      view('2026-10-05T10:00:00Z'),
    ];
    const groups = groupByDate(views);
    expect(groups.map((g) => g.dateKey)).toEqual(['2026-10-05', '2026-10-07', '2026-10-05']);
    expect(groups.flatMap((g) => g.items)).toEqual(views);
  });

  it('is empty for no items', () => {
    expect(groupByDate([])).toEqual([]);
  });
});
