import { expect, type Page } from '@playwright/test';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
  type BookingBackend,
} from '../src/testing/booking-backend';
import { mockBooking } from './book-backend';
import { mockBackend, seedRefreshToken } from './mock-backend';

/** The earliest slot of London's check-up: a deterministic target for the deep links. */
export function firstSlot(backend: BookingBackend, serviceId: string = SERVICE_IDS.checkup) {
  return [...backend.state.slots.values()]
    .filter((s) => s.branchId === BRANCH_IDS.london && s.serviceTypeId === serviceId)
    .sort((a, b) => a.startMs - b.startMs)[0];
}

export async function setup(page: Page) {
  const backend = createBookingBackend({ nowMs: Date.now() });
  await mockBackend(page, { role: 'Customer' });
  await seedRefreshToken(page, 'rt_1');
  const recorder = await mockBooking(page, backend);
  return { backend, recorder };
}

export const reviewUrl = (backend: BookingBackend) => {
  const slot = firstSlot(backend);
  return {
    slot,
    url: `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${slot.date}&slot=${slot.id}`,
  };
};

export const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });
export const countdown = (page: Page) =>
  page.getByText(/Too many attempts\. Try again in \d+ seconds?\./).first();

/** Selects the next day until one has times (a weekend has none). */
export async function reachDayWithTimes(page: Page) {
  const times = page.getByRole('radiogroup', { name: 'Available times' });
  for (let i = 0; i < 7; i++) {
    await expect(times.or(page.getByText(/No times available on/))).toBeVisible();
    if (await times.isVisible()) return times;
    const empty = page.getByText(/No times available on/);
    const shown = await empty.textContent();
    await page.getByRole('button', { name: /^Check / }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(shown!, { exact: true })).toBeHidden();
  }
  throw new Error('no day with times in the strip');
}
