import {
  buildIcs,
  escapeText,
  foldLine,
  formatIcsUtc,
  icsFileName,
  type IcsInput,
} from './build-ics';

const base: IcsInput = {
  appointmentId: '00000005-0000-4000-8000-000000000001',
  startUtc: new Date(Date.UTC(2026, 9, 4, 14, 30)),
  endUtc: new Date(Date.UTC(2026, 9, 4, 15, 15)),
  serviceName: 'Check-up',
  branchName: 'London',
  branchAddress: '10 Baker Street, London',
  branchPhone: '+44 20 7946 0000',
  localStart: '15:30',
  zoneId: 'Europe/London',
};
const NOW = new Date(Date.UTC(2026, 9, 1, 8, 0, 5));

/** Unfolds and parses the output into a property map (first occurrence wins). */
function parse(text: string): Map<string, string> {
  const unfolded = text.replace(/\r\n /g, '');
  const map = new Map<string, string>();
  for (const line of unfolded.split('\r\n')) {
    const i = line.indexOf(':');
    if (i > 0 && !map.has(line.slice(0, i))) map.set(line.slice(0, i), line.slice(i + 1));
  }
  return map;
}

describe('buildIcs', () => {
  it('writes the calendar frame and the event properties', () => {
    const text = buildIcs(base, NOW);
    const lines = text.split('\r\n');
    expect(lines.slice(0, 6)).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Smart Appointments//Web//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
    ]);
    expect(lines.slice(-4)).toEqual(['STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR', '']);
  });

  it('has exact UTC DTSTART, DTEND and DTSTAMP', () => {
    const p = parse(buildIcs(base, NOW));
    expect(p.get('DTSTART')).toBe('20261004T143000Z');
    expect(p.get('DTEND')).toBe('20261004T151500Z');
    expect(p.get('DTSTAMP')).toBe('20261001T080005Z');
  });

  it('builds UID, SUMMARY, LOCATION and DESCRIPTION', () => {
    const p = parse(buildIcs(base, NOW));
    expect(p.get('UID')).toBe('00000005-0000-4000-8000-000000000001@smartappointments');
    expect(p.get('SUMMARY')).toBe('Check-up at London');
    expect(p.get('LOCATION')).toBe('10 Baker Street\\, London');
    expect(p.get('DESCRIPTION')).toBe(
      'Booking reference: 00000005-0000-4000-8000-000000000001\\nBranch phone: +44 20 7946 0000\\nLocal start: 15:30 Europe/London',
    );
  });

  it('ends every line with CRLF and has no bare LF', () => {
    const text = buildIcs(base, NOW);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('escapes commas, semicolons, backslashes and a newline in a name', () => {
    const p = parse(
      buildIcs({ ...base, branchName: 'A;B,C\\D\nE', branchAddress: '1 Road; Town, Land' }, NOW),
    );
    expect(p.get('SUMMARY')).toBe('Check-up at A\\;B\\,C\\\\D\\nE');
    expect(p.get('LOCATION')).toBe('1 Road\\; Town\\, Land');
  });

  it('cannot inject a property through a name', () => {
    const text = buildIcs({ ...base, branchName: 'X\r\nATTENDEE:mailto:evil@example.com' }, NOW);
    expect(text).not.toMatch(/\r\nATTENDEE:/);
  });

  it('strips control characters', () => {
    const p = parse(buildIcs({ ...base, serviceName: 'Che\u0000ck\u0007-up\u007f' }, NOW));
    expect(p.get('SUMMARY')).toBe('Check-up at London');
  });

  it('folds a long ASCII address at 75 octets and unfolds back to the original', () => {
    const address = 'A very long street name '.repeat(8).trim();
    const text = buildIcs({ ...base, branchAddress: address }, NOW);
    for (const line of text.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(parse(text).get('LOCATION')).toBe(address);
  });

  it('folds multi-byte text without splitting a code point', () => {
    const address = 'Bahnhofstraße Zürich '.repeat(6).trim() + ' Zürich';
    const text = buildIcs({ ...base, branchAddress: address, branchName: 'Zürich 🙂' }, NOW);
    for (const line of text.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(text).not.toContain('�');
    expect(parse(text).get('LOCATION')).toBe(address);
    expect(parse(text).get('SUMMARY')).toBe('Check-up at Zürich 🙂');
  });
});

describe('foldLine', () => {
  it('leaves a short line alone and folds at exactly 75 octets', () => {
    expect(foldLine('abc')).toBe('abc');
    const line = 'x'.repeat(80);
    expect(foldLine(line)).toBe(`${'x'.repeat(75)}\r\n ${'x'.repeat(5)}`);
  });
});

describe('escapeText and formatIcsUtc', () => {
  it('escapes in the right order', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
  it('pads every field', () => {
    expect(formatIcsUtc(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('20260102T030405Z');
  });
});

describe('icsFileName', () => {
  it.each([
    ['LON', Date.UTC(2026, 9, 4, 14, 30), 'appointment-20261004-lon.ics'],
    ['North Branch/1', Date.UTC(2026, 0, 2), 'appointment-20260102-north-branch-1.ics'],
    ['a-b', Date.UTC(2026, 11, 31, 23, 59), 'appointment-20261231-a-b.ics'],
  ])('%s', (code, ms, expected) => {
    expect(icsFileName(code, new Date(ms))).toBe(expected);
  });

  it('with no names: summary "Appointment", no LOCATION, no phone or start lines (F4)', () => {
    const text = buildIcs(
      { appointmentId: base.appointmentId, startUtc: base.startUtc, endUtc: base.endUtc },
      NOW,
    );
    const props = parse(text);
    expect(props.get('SUMMARY')).toBe('Appointment');
    expect(props.has('LOCATION')).toBe(false);
    expect(props.get('DESCRIPTION')).toBe(`Booking reference: ${base.appointmentId}`);
    expect(text).not.toContain('Unavailable');
  });

  it('with a service but no branch: the summary is the service name alone', () => {
    const props = parse(
      buildIcs({ ...base, branchName: undefined, branchAddress: undefined }, NOW),
    );
    expect(props.get('SUMMARY')).toBe('Check-up');
    expect(props.has('LOCATION')).toBe(false);
  });
});
