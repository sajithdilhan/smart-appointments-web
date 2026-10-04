import { convertToParamMap } from '@angular/router';
import type { SlotResponse } from '../../../core/api/models';
import { BRANCH_IDS, SERVICE_IDS, createBookingBackend } from '../../../../testing/booking-backend';
import {
  buildParams,
  isCalendarDate,
  parseParams,
  repairParams,
  type Resolution,
} from './wizard-params';

const backend = createBookingBackend();
const { branches, services } = backend.state;
const daySlots: SlotResponse[] = [...backend.state.slots.values()]
  .filter((s) => s.branchId === BRANCH_IDS.london && s.date === '2026-10-05')
  .slice(0, 3);
const SLOT = daySlots[0].id;
const B = BRANCH_IDS.london;
const S = SERVICE_IDS.checkup;
const TODAY = '2026-10-04';

function guidOf(n: number): string {
  return `0000000${n}-0000-4000-8000-00000000000${n}`;
}

const loaded: Resolution = {
  branches,
  services,
  slots: daySlots,
  todayInBranch: TODAY,
  branchZone: 'Europe/London',
};
const unloaded: Resolution = {
  branches: null,
  services: null,
  slots: null,
  todayInBranch: null,
  branchZone: null,
};

describe('parseParams', () => {
  it('keeps valid values, trims and drops unknown keys', () => {
    const q = convertToParamMap({ branch: ` ${B} `, service: S, date: '2026-10-05', other: 'x' });
    expect(parseParams(q)).toEqual({ branch: B, service: S, date: '2026-10-05' });
  });

  it('drops ids that are not GUIDs and anything but done=1', () => {
    const q = convertToParamMap({ branch: 'not-a-guid', slot: '<script>', done: 'true' });
    expect(parseParams(q)).toEqual({});
    expect(parseParams(convertToParamMap({ done: '1' }))).toEqual({ done: true });
  });
});

describe('isCalendarDate', () => {
  it.each([
    ['2026-10-05', true],
    ['2026-02-29', false],
    ['2028-02-29', true],
    ['2026-13-01', false],
    ['2026-10-5', false],
    ['20261005', false],
    ['', false],
  ])('%s is %s', (value, ok) => {
    expect(isCalendarDate(value)).toBe(ok);
  });
});

describe('repairParams', () => {
  const unchanged = [
    ['empty', {}],
    ['branch', { branch: B }],
    ['branch and service', { branch: B, service: S }],
    ['with date', { branch: B, service: S, date: '2026-10-05' }],
    ['today', { branch: B, service: S, date: TODAY }],
    ['today plus 13', { branch: B, service: S, date: '2026-10-17' }],
    ['with slot', { branch: B, service: S, date: '2026-10-05', slot: SLOT }],
  ] as const;
  it.each(unchanged)('keeps a valid URL: %s', (_name, p) => {
    expect(repairParams({ ...p }, loaded, false)).toEqual({ params: p, changed: false });
  });

  const cascade = [
    ['unknown branch', { branch: guidOf(9), service: S, date: '2026-10-05', slot: SLOT }, {}],
    [
      'branch without a schedule',
      { branch: BRANCH_IDS.noSchedule, service: S, date: '2026-10-05' },
      {},
    ],
    ['unknown service', { branch: B, service: guidOf(8), date: '2026-10-05' }, { branch: B }],
    ['service without a branch', { service: S }, {}],
    ['date in the past', { branch: B, service: S, date: '2026-10-03' }, { branch: B, service: S }],
    [
      'date today plus 14',
      { branch: B, service: S, date: '2026-10-18', slot: SLOT },
      { branch: B, service: S },
    ],
    ['malformed date', { branch: B, service: S, date: '5 Oct' }, { branch: B, service: S }],
    ['impossible date', { branch: B, service: S, date: '2026-02-30' }, { branch: B, service: S }],
    [
      'slot not in the loaded list',
      { branch: B, service: S, date: '2026-10-05', slot: guidOf(7) },
      { branch: B, service: S, date: '2026-10-05' },
    ],
    ['slot without a date', { branch: B, service: S, slot: SLOT }, { branch: B, service: S }],
    [
      'done without a booking',
      { branch: B, service: S, date: '2026-10-05', done: true },
      { branch: B, service: S, date: '2026-10-05' },
    ],
  ] as const;
  it.each(cascade)('repairs %s and drops every later parameter', (_name, input, expected) => {
    expect(repairParams({ ...input }, loaded, false)).toEqual({
      params: expected,
      changed: true,
    });
  });

  it('keeps done when a booking is in memory', () => {
    const p = { branch: B, service: S, date: '2026-10-05', done: true as const };
    expect(repairParams(p, loaded, true)).toEqual({ params: p, changed: false });
  });

  it('drops everything when the branch is gone, including slot and done', () => {
    const p = {
      branch: guidOf(9),
      service: S,
      date: '2026-10-05',
      slot: SLOT,
      done: true as const,
    };
    expect(repairParams(p, loaded, true).params).toEqual({});
  });

  it('skips rules whose data is not loaded', () => {
    const p = { branch: B, service: S, date: '2026-10-05', slot: SLOT };
    expect(repairParams(p, unloaded, false)).toEqual({ params: p, changed: false });
  });

  it('still checks the date shape while the branch zone is unknown', () => {
    const p = { branch: B, service: S, date: 'garbage' };
    expect(repairParams(p, unloaded, false).params).toEqual({ branch: B, service: S });
  });

  it('skips the slot rule until the slots are loaded', () => {
    const p = { branch: B, service: S, date: '2026-10-05', slot: guidOf(7) };
    expect(repairParams(p, { ...loaded, slots: null }, false).changed).toBe(false);
  });
});

describe('buildParams', () => {
  it('builds the full query object and omits what is absent', () => {
    expect(buildParams({})).toEqual({});
    expect(buildParams({ branch: B, service: S, date: '2026-10-05', done: true })).toEqual({
      branch: B,
      service: S,
      date: '2026-10-05',
      done: '1',
    });
  });
});
