import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
  type BookingBackend,
} from '../src/testing/booking-backend';
import { mockBooking } from './book-backend';
import { mockBackend, seedRefreshToken } from './mock-backend';

/** The earliest slot of London's check-up: a deterministic target for the deep links. */
function firstSlot(backend: BookingBackend, serviceId: string = SERVICE_IDS.checkup) {
  return [...backend.state.slots.values()]
    .filter((s) => s.branchId === BRANCH_IDS.london && s.serviceTypeId === serviceId)
    .sort((a, b) => a.startMs - b.startMs)[0];
}

async function setup(page: Page) {
  const backend = createBookingBackend({ nowMs: Date.now() });
  await mockBackend(page, { role: 'Customer' });
  await seedRefreshToken(page, 'rt_1');
  const recorder = await mockBooking(page, backend);
  return { backend, recorder };
}

const reviewUrl = (backend: BookingBackend) => {
  const slot = firstSlot(backend);
  return {
    slot,
    url: `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${slot.date}&slot=${slot.id}`,
  };
};

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });
const countdown = (page: Page) =>
  page.getByText(/Too many attempts\. Try again in \d+ seconds?\./).first();

/** Selects the next day until one has times (a weekend has none). */
async function reachDayWithTimes(page: Page) {
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

test('books an appointment with the keyboard only and downloads the .ics', async ({ page }) => {
  await setup(page);
  await page.goto('/book');
  await expect(heading(page, 'Choose a branch')).toBeVisible();

  await page.getByRole('radio', { name: 'London' }).focus();
  await page.keyboard.press('Enter');
  await expect(heading(page, 'Choose a service')).toBeFocused();

  await page.getByRole('radio', { name: 'Check-up' }).focus();
  await page.keyboard.press('Space');
  await expect(heading(page, 'Choose a date and time')).toBeFocused();

  const times = await reachDayWithTimes(page);
  await times.getByRole('radio').first().focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to review' }).focus();
  await page.keyboard.press('Enter');

  await expect(heading(page, 'Review and confirm')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
  await page.getByRole('button', { name: 'Confirm booking' }).focus();
  await page.keyboard.press('Enter');

  await expect(heading(page, "You're booked")).toBeFocused();
  await expect(page).toHaveURL(/done=1/);
  await expect(page).not.toHaveURL(/slot=/);

  await page.getByRole('button', { name: /Add to calendar/ }).focus();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Enter'),
  ]);
  expect(download.suggestedFilename()).toMatch(/^appointment-\d{8}-lon\.ics$/);
  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('DTSTART:');
  expect(text).toContain('LOCATION:10 Baker Street\\, London');
});

test('a deep link to Review shows the summary', async ({ page }) => {
  const { backend } = await setup(page);
  await page.goto(reviewUrl(backend).url);
  await expect(heading(page, 'Review and confirm')).toBeVisible();
  await expect(page.getByText('10 Baker Street, London')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toBeEnabled();
});

test('a stale slot in the link recovers to step 3 with a note', async ({ page }) => {
  const { backend } = await setup(page);
  const { slot } = reviewUrl(backend);
  const stale = '00000000-0000-4000-8000-0000000000ee';
  await page.goto(
    `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${slot.date}&slot=${stale}`,
  );
  await expect(heading(page, 'Choose a date and time')).toBeVisible();
  await expect(page.getByText('That link is out of date. Choose again.')).toBeVisible();
  await expect(page).not.toHaveURL(/slot=/);
});

test('an overlapping appointment shows the 409 message with a link to My appointments', async ({
  page,
}) => {
  const { backend } = await setup(page);
  const other = firstSlot(backend, SERVICE_IDS.consult);
  backend.createAppointment('00000000-0000-4000-8000-00000000f001', { slotId: other.id });
  await page.goto(reviewUrl(backend).url);
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('You already have an appointment at that time.');
  await expect(alert.getByRole('link', { name: 'View my appointments' })).toHaveAttribute(
    'href',
    '/appointments',
  );
  await expect(page.getByRole('button', { name: 'Choose another time' })).toBeVisible();
});

test('a 503 followed by a retry with the same key books once', async ({ page }) => {
  const { backend, recorder } = await setup(page);
  const { slot, url } = reviewUrl(backend);
  backend.state.flags.unavailableNext = 1;
  await page.goto(url);
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.locator('app-inline-alert')).toContainText(
    'It may or may not have gone through',
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(heading(page, "You're booked")).toBeVisible();
  expect(recorder.creates).toHaveLength(2);
  expect(recorder.creates[1].key).toBe(recorder.creates[0].key);
  expect(recorder.creates[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(recorder.creates[0].body).toEqual({ slotId: slot.id });
  expect(backend.bookedFor(slot.id)).toHaveLength(1);
});

test('a 429 on the slot search shows the countdown and no automatic retry', async ({ page }) => {
  const { backend, recorder } = await setup(page);
  const { slot } = reviewUrl(backend);
  backend.state.flags.searchRateLimitAfter = 0;
  await page.goto(
    `/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}&date=${slot.date}`,
  );
  await expect(countdown(page)).toBeVisible();
  const sent = recorder.searches.length;
  await page.waitForTimeout(1500);
  expect(recorder.searches.length).toBe(sent);
});

test('a 429 on Confirm replaces the button with the countdown', async ({ page }) => {
  const { backend, recorder } = await setup(page);
  backend.state.flags.createRateLimited = true;
  await page.goto(reviewUrl(backend).url);
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(countdown(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm booking' })).toHaveCount(0);
  expect(recorder.creates).toHaveLength(1);
});
