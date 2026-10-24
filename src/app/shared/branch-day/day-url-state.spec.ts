import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ManualClock } from '../../../testing/manual-clock';
import { CLOCK } from '../../core/util/clock';
import { createDayUrlState, type DayUrlState } from './day-url-state';

// Saturday 24 October 2026, 10:30 UTC (11:30 in London). In Pacific/Kiritimati (UTC+14) it is already the 25th.
const NOW = Date.parse('2026-10-24T10:30:00Z');

const branchId = signal<string | null>('b1');
const zone = signal('Europe/London');
let state: DayUrlState;

@Component({ selector: 'app-host', template: '', changeDetection: ChangeDetectionStrategy.OnPush })
class Host {
  constructor() {
    state = createDayUrlState({ branchId, zone });
  }
}

async function open(url: string) {
  branchId.set('b1');
  zone.set('Europe/London');
  TestBed.configureTestingModule({
    providers: [
      { provide: CLOCK, useValue: new ManualClock(NOW) },
      provideRouter([{ path: 'day', component: Host }]),
    ],
  });
  TestBed.inject(Router).setUpLocationChangeListener();
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  return { harness, router: TestBed.inject(Router), location: TestBed.inject(Location) };
}

const settle = async (harness: RouterTestingHarness) => {
  await harness.fixture.whenStable();
  TestBed.tick();
  await harness.fixture.whenStable();
};

describe('createDayUrlState', () => {
  it('reads a valid date and a known status', async () => {
    await open('/day?date=2026-11-02&status=Completed');
    expect(state.date()).toBe('2026-11-02');
    expect(state.status()).toBe('Completed');
    expect(state.today()).toBe('2026-10-24');
  });

  it('replaces a missing date with today in the branch zone, adding no history entry', async () => {
    const { router, location, harness } = await open('/day');
    await settle(harness);
    expect(router.url).toBe('/day?date=2026-10-24');
    expect(state.date()).toBe('2026-10-24');
    // Replaced, not pushed: going Back leaves the page (no entry for the bare URL).
    location.back();
    await new Promise((r) => setTimeout(r, 20));
    expect(router.url).not.toBe('/day');
  });

  it('uses the zone for today (a zone ahead of UTC is already on the 25th)', async () => {
    zone.set('Pacific/Kiritimati');
    TestBed.configureTestingModule({
      providers: [
        { provide: CLOCK, useValue: new ManualClock(NOW) },
        provideRouter([{ path: 'day', component: Host }]),
      ],
    });
    TestBed.inject(Router).setUpLocationChangeListener();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/day');
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/day?date=2026-10-25');
  });

  it.each(['2026-02-30', 'tomorrow', '24-10-2026'])(
    'replaces the malformed date %s and keeps the status',
    async (date) => {
      const { router, harness } = await open(`/day?date=${date}&status=NoShow`);
      await settle(harness);
      expect(router.url).toBe('/day?date=2026-10-24&status=NoShow');
    },
  );

  it('writes nothing while no branch is known', async () => {
    branchId.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: CLOCK, useValue: new ManualClock(NOW) },
        provideRouter([{ path: 'day', component: Host }]),
      ],
    });
    TestBed.inject(Router).setUpLocationChangeListener();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/day');
    await settle(harness);
    expect(TestBed.inject(Router).url).toBe('/day');
  });

  it('falls back to All for an unknown status without touching the URL', async () => {
    const { router, harness } = await open('/day?date=2026-10-24&status=Pending');
    await settle(harness);
    expect(state.status()).toBe('all');
    expect(router.url).toBe('/day?date=2026-10-24&status=Pending');
  });

  it('setDate adds a history entry so Back returns to the previous day', async () => {
    const { router, location, harness } = await open('/day?date=2026-10-24');
    await state.setDate('2026-10-25');
    await settle(harness);
    expect(router.url).toBe('/day?date=2026-10-25');
    expect(state.date()).toBe('2026-10-25');
    location.back();
    await vi.waitFor(() => expect(router.url).toBe('/day?date=2026-10-24'));
    expect(state.date()).toBe('2026-10-24');
  });

  it('setStatus keeps the date and drops the parameter for All', async () => {
    const { router, harness } = await open('/day?date=2026-10-24');
    await state.setStatus('Booked');
    await settle(harness);
    expect(router.url).toBe('/day?date=2026-10-24&status=Booked');
    await state.setStatus('all');
    await settle(harness);
    expect(router.url).toBe('/day?date=2026-10-24');
  });

  it('goToday returns to today, and does nothing when already there', async () => {
    const { router, harness } = await open('/day?date=2026-10-30');
    await state.goToday();
    await settle(harness);
    expect(router.url).toBe('/day?date=2026-10-24');
    const events: unknown[] = [];
    router.events.subscribe((e) => events.push(e));
    await state.goToday();
    expect(events).toEqual([]);
  });

  it('resetDate clears the date and the next parse gives today in the new zone', async () => {
    const { router, harness } = await open('/day?date=2026-10-30&status=Booked');
    zone.set('Pacific/Kiritimati');
    await state.resetDate();
    await settle(harness);
    expect(router.url).toBe('/day?status=Booked&date=2026-10-25');
    expect(state.date()).toBe('2026-10-25');
  });
});
