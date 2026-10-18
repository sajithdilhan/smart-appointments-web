/**
 * A pure RFC 5545 generator: plain data in, text out, no Angular and no date parsing (the
 * caller passes `Date`s made with `parseUtc`). Shared by the booking success screen and, later,
 * the appointment detail, so both reuse one lazy chunk.
 */
export interface IcsInput {
  appointmentId: string;
  startUtc: Date;
  endUtc: Date;
  serviceName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  /** Branch-local start, "09:30". */
  localStart: string;
  zoneId: string;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** `yyyyMMddTHHmmssZ` from the UTC fields. */
export function formatIcsUtc(d: Date): string {
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * TEXT escaping (RFC 5545 section 3.3.11): control characters other than newline are removed
 * (so a name cannot inject a property), then backslash, semicolon, comma and newline.
 */
export function escapeText(value: string): string {
  const printable = [...value.replace(/\r\n?/g, '\n')]
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return ch === '\n' || (code > 0x1f && code !== 0x7f);
    })
    .join('');
  return printable
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets, never splitting a code point; continuations start with a space. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  let limit = 75;
  for (const cp of line) {
    const size = encoder.encode(cp).length;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = 74; // the leading space of a continuation counts
    }
    current += cp;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(input: IcsInput, now: Date): string {
  const summary = `${input.serviceName} at ${input.branchName}`;
  const description =
    `Booking reference: ${input.appointmentId}\n` +
    `Branch phone: ${input.branchPhone}\n` +
    `Local start: ${input.localStart} ${input.zoneId}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smart Appointments//Web//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.appointmentId.replace(/[^A-Za-z0-9-]/g, '')}@smartappointments`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(input.startUtc)}`,
    `DTEND:${formatIcsUtc(input.endUtc)}`,
    `SUMMARY:${escapeText(summary)}`,
    `LOCATION:${escapeText(input.branchAddress)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** `appointment-<yyyyMMdd>-<branch code lowercase>.ics`; other characters become `-`. */
export function icsFileName(branchCode: string, startUtc: Date): string {
  const date = `${pad(startUtc.getUTCFullYear(), 4)}${pad(startUtc.getUTCMonth() + 1)}${pad(startUtc.getUTCDate())}`;
  const code = branchCode.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `appointment-${date}-${code}.ics`;
}
