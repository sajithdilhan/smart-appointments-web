import {
  makeAppointment,
  resetMakeAppointment,
  SERVICE_ID,
} from '../../../testing/make-appointment';
import type { BranchAppointment } from '../../core/api/models';
import { toRow, UNAVAILABLE_SERVICE } from './day-row';

function item(overrides: Partial<BranchAppointment> = {}): BranchAppointment {
  return {
    ...makeAppointment({ startUtc: '2026-10-24T09:30:00Z' }),
    customer: { firstName: 'Ana', lastName: 'Perera', phoneNumber: '+94771234567' },
    ...overrides,
  };
}

const services = new Map([[SERVICE_ID, { name: 'Health check' }]]);

beforeEach(() => resetMakeAppointment());

describe('toRow', () => {
  it('shows times in the branch zone, 24-hour, with the long date and the duration', () => {
    const row = toRow(item(), { zone: 'Europe/London', services });
    expect(row.startLabel).toBe('10:30');
    expect(row.endLabel).toBe('11:00');
    expect(row.timeRange).toBe('10:30 to 11:00');
    expect(row.dateLabel).toBe('Saturday 24 October 2026');
    expect(row.durationMinutes).toBe(30);
  });

  it('uses UTC when that is the zone', () => {
    expect(toRow(item(), { zone: 'UTC', services }).startLabel).toBe('09:30');
  });

  it('puts the day in the branch zone, not in UTC', () => {
    const late = item({ startUtc: '2026-10-24T23:30:00Z', endUtc: '2026-10-25T00:00:00Z' });
    // London is still on BST until 01:00 UTC on the 25th, so 23:30Z is 00:30 on the 25th there.
    expect(toRow(late, { zone: 'Europe/London', services }).dateLabel).toBe(
      'Sunday 25 October 2026',
    );
    expect(toRow(late, { zone: 'UTC', services }).dateLabel).toBe('Saturday 24 October 2026');
  });

  it('joins the customer name and phone', () => {
    const row = toRow(item(), { zone: 'UTC', services });
    expect(row.customerName).toBe('Ana Perera');
    expect(row.phone).toBe('+94771234567');
  });

  it('has no name and no phone for a null customer', () => {
    const row = toRow(item({ customer: null }), { zone: 'UTC', services });
    expect(row.customerName).toBeNull();
    expect(row.phone).toBeNull();
  });

  it('resolves the service name or falls back', () => {
    expect(toRow(item(), { zone: 'UTC', services }).serviceName).toBe('Health check');
    expect(toRow(item(), { zone: 'UTC', services: new Map() }).serviceName).toBe(
      UNAVAILABLE_SERVICE,
    );
    expect(UNAVAILABLE_SERVICE).toBe('Unavailable service');
  });

  it('can be marked only while Booked', () => {
    const ctx = { zone: 'UTC', services };
    expect(toRow(item(), ctx).canMark).toBe(true);
    for (const status of ['Completed', 'NoShow', 'Cancelled', 'Mystery']) {
      expect(toRow(item({ status }), ctx).canMark).toBe(false);
    }
  });

  it('carries the outcome times, null when absent', () => {
    const ctx = { zone: 'UTC', services };
    const row = toRow(item({ status: 'Completed', completedAtUtc: '2026-10-24T10:00:00Z' }), ctx);
    expect(row.completedAtUtc).toBe('2026-10-24T10:00:00Z');
    expect(row.noShowAtUtc).toBeNull();
    expect(row.cancelledAtUtc).toBeNull();
  });
});
