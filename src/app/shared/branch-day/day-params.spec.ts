import {
  emptyDayText,
  isCalendarDate,
  parseDayParams,
  STATUS_FILTERS,
  toQuery,
} from './day-params';

const TODAY = '2026-10-24';

describe('parseDayParams', () => {
  it('keeps a valid date and a known status', () => {
    expect(parseDayParams({ date: '2026-11-02', status: 'Completed' }, TODAY)).toEqual({
      date: '2026-11-02',
      status: 'Completed',
      dateWasInvalid: false,
    });
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['empty', ''],
    ['malformed', '24/10/2026'],
    ['impossible', '2026-02-30'],
    ['month 13', '2026-13-01'],
    ['with a time', '2026-10-24T10:00'],
  ])('uses today for a %s date and says it was invalid', (_, date) => {
    expect(parseDayParams({ date }, TODAY)).toEqual({
      date: TODAY,
      status: 'all',
      dateWasInvalid: true,
    });
  });

  it('accepts a leap day and rejects a non-leap one', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
  });

  it.each(['Booked', 'Completed', 'NoShow', 'Cancelled'])('accepts the status %s', (status) => {
    expect(parseDayParams({ date: TODAY, status }, TODAY).status).toBe(status);
  });

  it.each([undefined, null, '', 'all', 'booked', 'No-show', 'Pending'])(
    'treats the status %s as All',
    (status) => {
      expect(parseDayParams({ date: TODAY, status }, TODAY).status).toBe('all');
    },
  );

  it('offers All, Booked, Completed, No-show, Cancelled in that order', () => {
    expect(STATUS_FILTERS.map((f) => f.label)).toEqual([
      'All',
      'Booked',
      'Completed',
      'No-show',
      'Cancelled',
    ]);
  });
});

describe('toQuery and emptyDayText', () => {
  it('leaves status out for All', () => {
    expect(toQuery(TODAY, 'all')).toEqual({ date: TODAY });
    expect(toQuery(TODAY, 'NoShow')).toEqual({ date: TODAY, status: 'NoShow' });
  });

  it('words the empty day with the filter', () => {
    expect(emptyDayText('all')).toBe('No appointments on this day.');
    expect(emptyDayText('Booked')).toBe('No Booked appointments on this day.');
    expect(emptyDayText('NoShow')).toBe('No No-show appointments on this day.');
  });
});
