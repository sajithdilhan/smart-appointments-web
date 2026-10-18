import { addDays } from './calendar-date';
import { monthGrid, windowMonths } from './month-grid';

const flat = (g: ReturnType<typeof monthGrid>) => g.weeks.flat();
const bookable = (g: ReturnType<typeof monthGrid>) =>
  flat(g)
    .filter((d) => d.bookable)
    .map((d) => d.date);
/** The 14-day window from `today`, as the wizard builds it. */
const lastOf = (today: string) => addDays(today, 13);

describe('monthGrid', () => {
  describe.each([
    // [year, month, expected weeks, first cell, last cell, days of the month]
    [2026, 10, 5, '2026-09-28', '2026-11-01', 31], // starts on a Thursday
    [2026, 6, 5, '2026-06-01', '2026-07-05', 30], // starts on a Monday
    [2026, 2, 5, '2026-01-26', '2026-03-01', 28], // starts on a Sunday: six leading days
    [2026, 3, 6, '2026-02-23', '2026-04-05', 31], // six weeks
    [2028, 2, 5, '2028-01-31', '2028-03-05', 29], // leap year
    [2026, 12, 5, '2026-11-30', '2027-01-03', 31], // across a year end
  ])('%i-%i', (year, month, weeks, firstCell, lastCell, days) => {
    it('has whole Monday-to-Sunday weeks covering exactly the month', () => {
      const g = monthGrid(year, month, '2000-01-01', '2000-01-14');
      expect(g.weeks).toHaveLength(weeks);
      for (const w of g.weeks) expect(w).toHaveLength(7);
      expect(flat(g)[0].date).toBe(firstCell);
      expect(flat(g).at(-1)!.date).toBe(lastCell);
      expect(flat(g).filter((d) => d.inMonth)).toHaveLength(days);
      expect(g.year).toBe(year);
      expect(g.month).toBe(month);
    });
  });

  it('starts a month that begins on Monday on its first row, with no leading days', () => {
    const g = monthGrid(2026, 6, '2026-06-01', '2026-06-14');
    expect(g.weeks[0][0]).toMatchObject({ date: '2026-06-01', inMonth: true, day: 1 });
  });

  it('puts a month that begins on Sunday at the end of its first row', () => {
    const g = monthGrid(2026, 2, '2026-02-01', '2026-02-14');
    expect(g.weeks[0].map((d) => d.inMonth)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(g.weeks[0][6].date).toBe('2026-02-01');
  });

  it('marks the leading and trailing days of the adjacent months as outside the month', () => {
    const g = monthGrid(2026, 10, '2026-10-04', '2026-10-17');
    expect(
      flat(g)
        .slice(0, 3)
        .map((d) => [d.date, d.inMonth]),
    ).toEqual([
      ['2026-09-28', false],
      ['2026-09-29', false],
      ['2026-09-30', false],
    ]);
    expect(flat(g).at(-1)).toMatchObject({ date: '2026-11-01', inMonth: false, day: 1 });
  });

  it('a window inside one month: only its 14 days are bookable and the first is today', () => {
    const g = monthGrid(2026, 10, '2026-10-04', lastOf('2026-10-04'));
    expect(bookable(g)).toHaveLength(14);
    expect(bookable(g)[0]).toBe('2026-10-04');
    expect(bookable(g)[13]).toBe('2026-10-17');
    expect(
      flat(g)
        .filter((d) => d.isToday)
        .map((d) => d.date),
    ).toEqual(['2026-10-04']);
  });

  it('a window across two months splits its days between them', () => {
    const first = '2026-10-25';
    const last = lastOf(first); // 2026-11-07
    const oct = monthGrid(2026, 10, first, last);
    const nov = monthGrid(2026, 11, first, last);
    expect(bookable(oct).filter((d) => d.startsWith('2026-10'))).toHaveLength(7);
    expect(bookable(nov).filter((d) => d.startsWith('2026-11'))).toHaveLength(7);
    // The adjacent days drawn in the grid carry the same bookability.
    expect(flat(oct).find((d) => d.date === '2026-11-01')).toMatchObject({
      inMonth: false,
      bookable: true,
    });
    expect(flat(oct).filter((d) => d.isToday)).toHaveLength(1);
    expect(flat(nov).filter((d) => d.isToday && d.inMonth)).toHaveLength(0);
  });

  it('a window across a year end', () => {
    const first = '2026-12-27';
    const last = lastOf(first); // 2027-01-09
    const dec = monthGrid(2026, 12, first, last);
    const jan = monthGrid(2027, 1, first, last);
    expect(bookable(dec).filter((d) => d.startsWith('2026-12'))).toHaveLength(5);
    expect(bookable(jan).filter((d) => d.startsWith('2027-01'))).toHaveLength(9);
    expect(jan.weeks[0][0].date).toBe('2026-12-28');
  });

  it('a month the window does not touch has no bookable day and no today', () => {
    const g = monthGrid(2026, 12, '2026-10-04', '2026-10-17');
    expect(bookable(g)).toEqual([]);
    expect(flat(g).some((d) => d.isToday)).toBe(false);
  });

  it('gives each day a full label with the weekday, day, month and year', () => {
    const g = monthGrid(2026, 10, '2026-10-04', '2026-10-17');
    const day = flat(g).find((d) => d.date === '2026-10-21')!;
    expect(day.fullLabel).toMatch(/^Wednesday,? (21 October|October 21),? 2026$/);
    expect(g.title).toMatch(/^October 2026$/);
  });

  describe('labels do not depend on the browser zone', () => {
    const original = process.env['TZ'];
    afterEach(() => {
      process.env['TZ'] = original;
    });

    it.each(['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'])('in %s', (zone) => {
      process.env['TZ'] = zone;
      const g = monthGrid(2026, 10, '2026-10-04', '2026-10-17');
      const labels = flat(g).map((d) => d.fullLabel);
      expect(labels[0]).toMatch(/Monday/); // 28 September
      expect(labels[0]).toMatch(/28/);
      expect(labels[24]).toMatch(/Thursday/); // 22 October
      expect(labels[24]).toMatch(/22/);
      expect(labels.at(-1)).toMatch(/Sunday/);
      expect(g.title).toBe(monthGrid(2026, 10, '2000-01-01', '2000-01-14').title);
    });

    it('is identical under a zone ahead of UTC and one behind it', () => {
      process.env['TZ'] = 'Pacific/Kiritimati';
      const ahead = monthGrid(2026, 11, '2026-10-25', '2026-11-07');
      process.env['TZ'] = 'Pacific/Pago_Pago';
      const behind = monthGrid(2026, 11, '2026-10-25', '2026-11-07');
      expect(behind).toEqual(ahead);
    });
  });
});

describe('windowMonths', () => {
  it.each([
    ['inside one month', '2026-10-04', '2026-10-17', ['2026-10']],
    ['across two months', '2026-10-25', '2026-11-07', ['2026-10', '2026-11']],
    ['across a year end', '2026-12-27', '2027-01-09', ['2026-12', '2027-01']],
    ['ending on the first of a month', '2026-10-19', '2026-11-01', ['2026-10', '2026-11']],
    ['starting on the last day of a month', '2026-10-31', '2026-11-13', ['2026-10', '2026-11']],
  ])('%s', (_name, first, last, expected) => {
    expect(windowMonths(first, last)).toEqual(expected);
  });
});
