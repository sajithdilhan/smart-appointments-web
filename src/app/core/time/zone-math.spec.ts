import { parseUtc } from './parse-utc';
import { localToUtc } from './zone-math';

const run = (zone: string, date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const r = localToUtc(zone, date, h * 60 + m);
  return { gap: r.gap, utc: new Date(r.utcMs).toISOString() };
};
const ok = (s: string) => ({ gap: false, utc: parseUtc(s).toISOString() });

describe('localToUtc', () => {
  it('Europe/London spring forward (2026-03-29): 01:30 does not exist', () => {
    expect(run('Europe/London', '2026-03-29', '00:30')).toEqual(ok('2026-03-29T00:30Z'));
    expect(run('Europe/London', '2026-03-29', '01:30').gap).toBe(true);
    expect(run('Europe/London', '2026-03-29', '02:30')).toEqual(ok('2026-03-29T01:30Z'));
  });

  it('Europe/London fall back (2026-10-25): 01:30 happens twice, standard time wins', () => {
    expect(run('Europe/London', '2026-10-25', '00:30')).toEqual(ok('2026-10-24T23:30Z'));
    expect(run('Europe/London', '2026-10-25', '01:30')).toEqual(ok('2026-10-25T01:30Z'));
    expect(run('Europe/London', '2026-10-25', '02:30')).toEqual(ok('2026-10-25T02:30Z'));
  });

  it('America/New_York transitions (2026-03-08 gap, 2026-11-01 fold)', () => {
    expect(run('America/New_York', '2026-03-08', '02:30').gap).toBe(true);
    expect(run('America/New_York', '2026-03-08', '03:30')).toEqual(ok('2026-03-08T07:30Z'));
    expect(run('America/New_York', '2026-03-08', '01:30')).toEqual(ok('2026-03-08T06:30Z'));
    expect(run('America/New_York', '2026-11-01', '01:30')).toEqual(ok('2026-11-01T06:30Z'));
    expect(run('America/New_York', '2026-11-01', '03:00')).toEqual(ok('2026-11-01T08:00Z'));
  });

  it('Pacific/Auckland spring forward (2026-09-27)', () => {
    expect(run('Pacific/Auckland', '2026-09-27', '01:30')).toEqual(ok('2026-09-26T13:30Z'));
    expect(run('Pacific/Auckland', '2026-09-27', '02:30').gap).toBe(true);
    expect(run('Pacific/Auckland', '2026-09-27', '03:30')).toEqual(ok('2026-09-26T14:30Z'));
  });

  it('Asia/Kolkata has no transitions and a half-hour offset', () => {
    expect(run('Asia/Kolkata', '2026-10-04', '09:00')).toEqual(ok('2026-10-04T03:30Z'));
    expect(run('Asia/Kolkata', '2026-10-04', '00:00')).toEqual(ok('2026-10-03T18:30Z'));
  });

  it('treats an invalid zone as UTC', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(run('Mars/Base', '2026-10-04', '09:00')).toEqual(ok('2026-10-04T09:00Z'));
    warn.mockRestore();
  });
});
