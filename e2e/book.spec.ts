import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { BRANCH_IDS, SERVICE_IDS } from '../src/testing/booking-backend';
import {
  countdown,
  firstSlot,
  heading,
  pickDate,
  reachDayWithTimes,
  reviewUrl,
  setup,
} from './book-helpers';

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

test('picks a day on the month calendar and lists its times', async ({ page }) => {
  const { backend } = await setup(page);
  const dates = [
    ...new Set(
      [...backend.state.slots.values()]
        .filter((s) => s.branchId === BRANCH_IDS.london && s.serviceTypeId === SERVICE_IDS.checkup)
        .sort((a, b) => a.startMs - b.startMs)
        .map((s) => s.date),
    ),
  ];
  const target = dates[2];
  await page.goto(`/book?branch=${BRANCH_IDS.london}&service=${SERVICE_IDS.checkup}`);
  await expect(page.getByRole('grid')).toBeVisible();
  await pickDate(page, target);
  await expect(page).toHaveURL(new RegExp(`date=${target}`));
  await expect(page.getByRole('radiogroup', { name: 'Available times' })).toBeVisible();
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
