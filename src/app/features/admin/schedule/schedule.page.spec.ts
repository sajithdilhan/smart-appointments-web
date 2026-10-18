import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { flags, seedBranch, state } from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import { ToastService } from '../../../core/notify/toast.service';
import { stubViewport } from '../../../../testing/stub-viewport';
import { BranchesStore } from '../data/branches.store';
import { unsavedChangesGuard } from '../shared/dirty/unsaved-changes.guard';
import { SchedulePage } from './schedule.page';

@Component({ selector: 'app-branches-stub', template: `<p>branches list</p>` })
class BranchesStub {}

let toast: FakeToast;

beforeEach(() => {
  useAdminBackend();
  toast = createFakeToast();
  stubViewport(1280);
});
afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function open(id: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: 'branches/:id/schedule',
          component: SchedulePage,
          canDeactivate: [unsavedChangesGuard],
        },
        { path: 'branches', component: BranchesStub },
        { path: 'admin/branches', component: BranchesStub },
      ]),
      ...provideAdminApi(),
      { provide: ToastService, useValue: toast },
      BranchesStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/branches/${id}/schedule`, SchedulePage);
  return { router: TestBed.inject(Router), store: TestBed.inject(BranchesStore) };
}

const writes = () => state.requests.filter((r) => r.method === 'PUT');
const save = () => screen.getByRole('button', { name: 'Save schedule' });

const WEEK = (days: number) =>
  (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const)
    .slice(0, days)
    .map((dayOfWeek) => ({ dayOfWeek, opensAt: '09:00:00', closesAt: '17:00:00' }));

async function chooseZone(text: string) {
  const box = screen.getByRole('combobox', { name: 'Time zone' });
  await userEvent.type(box, `${text}{Enter}`);
}

describe('SchedulePage', () => {
  it('loads the branch and seeds the grid: heading, zone, open days with HH:mm, closed days', async () => {
    const b = seedBranch({
      name: 'Colombo',
      timeZoneId: 'Asia/Colombo',
      workingHours: WEEK(2) as never,
    });
    await open(b.id);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Schedule for Colombo' }),
    ).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue(
      'Asia/Colombo, UTC+05:30',
    );
    expect(screen.getByLabelText('Monday opens')).toHaveValue('09:00');
    expect(screen.getByLabelText('Tuesday closes')).toHaveValue('17:00');
    expect(screen.queryByLabelText('Wednesday opens')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(
      screen.getByText(/affects only slots generated from now on. Existing slots stay as they are/),
    ).toBeVisible();
    expect(screen.getByText(/cannot cross midnight/)).toBeVisible();
  });

  it('shows a note for an inactive branch but still lets it be edited', async () => {
    const b = seedBranch({ name: 'Galle', isActive: false });
    await open(b.id);
    expect(await screen.findByText(/This branch is inactive/)).toBeVisible();
    expect(save()).toBeEnabled();
  });

  it('shows not-found for an unknown id and for a non-GUID id, the latter without a request', async () => {
    await open('not-a-guid');
    expect(await screen.findByText('That branch could not be found.')).toBeVisible();
    expect(state.requests).toHaveLength(0);
  });

  it('shows not-found for an unknown GUID', async () => {
    await open(crypto.randomUUID());
    expect(await screen.findByText('That branch could not be found.')).toBeVisible();
  });

  it('requires a time zone and sends nothing while a row is invalid', async () => {
    const b = seedBranch({});
    await open(b.id);
    await screen.findByRole('combobox', { name: 'Time zone' });
    await userEvent.click(save());
    expect(await screen.findByText('Choose a time zone.')).toBeVisible();
    expect(writes()).toHaveLength(0);
  });

  it('saves the open days only, Monday first, as HH:mm; the form becomes pristine', async () => {
    const b = seedBranch({ name: 'Colombo' });
    const { store, router } = await open(b.id);
    await screen.findByRole('combobox', { name: 'Time zone' });
    await chooseZone('colombo');
    await userEvent.click(screen.getByRole('switch', { name: 'Open on Monday' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Open on Wednesday' }));
    await userEvent.click(save());
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalledWith('Schedule saved'));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      timeZoneId: 'Asia/Colombo',
      workingHours: [
        { dayOfWeek: 'Monday', opensAt: '09:00', closesAt: '17:00' },
        { dayOfWeek: 'Wednesday', opensAt: '09:00', closesAt: '17:00' },
      ],
    });
    expect(store.byId(b.id)?.workingHours).toHaveLength(2);
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue(
      'Asia/Colombo, UTC+05:30',
    );
    // pristine: leaving does not prompt
    await router.navigateByUrl('/branches');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('branches list')).toBeVisible();
  });

  it('Copy Monday to weekdays fills Tuesday to Friday, leaves the weekend and toasts', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Monday to weekdays' }));
    expect(await screen.findByLabelText('Friday closes')).toHaveValue('17:00');
    expect(screen.queryByLabelText('Saturday opens')).not.toBeInTheDocument();
    expect(toast.showSuccess).toHaveBeenCalledWith("Copied Monday's hours to Tuesday to Friday");
  });

  it('saving with every day closed asks first; Cancel sends nothing, Save sends an empty list', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Close all days' }));
    await userEvent.click(save());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('no working hours');
    expect(dialog).toHaveTextContent('blocked until you set a schedule');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
    await userEvent.click(save());
    const again = await screen.findByRole('alertdialog');
    await userEvent.click(within(again).getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body).toEqual({ timeZoneId: 'Asia/Colombo', workingHours: [] });
  });

  it('a 400 shows the messages in the alert region and keeps the values', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Monday to weekdays' }));
    const original = window.fetch;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'PUT'
        ? new Response(
            JSON.stringify({
              status: 400,
              detail: 'Invalid request data. Errors: A day of the week can be listed only once.',
            }),
            { status: 400, headers: { 'content-type': 'application/problem+json' } },
          )
        : original(input, init),
    );
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A day of the week can be listed only once.',
    );
    expect(screen.getByLabelText('Friday closes')).toHaveValue('17:00');
  });

  it('a 404 on save toasts, reloads and returns to the list', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Monday to weekdays' }));
    state.branches.length = 0;
    await userEvent.click(save());
    expect(await screen.findByText('branches list')).toBeVisible();
    expect(toast.showInfo).toHaveBeenCalledWith('That branch no longer exists');
  });

  it('keeps the form and re-enables Save after a network error', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Monday to weekdays' }));
    flags.networkError = true;
    await userEvent.click(save());
    await waitFor(() => expect(save()).toBeEnabled());
    expect(screen.getByLabelText('Friday closes')).toHaveValue('17:00');
  });

  it('a 429 disables Save and shows the rate-limit notice', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Copy Monday to weekdays' }));
    flags.rateLimited = true;
    await userEvent.click(save());
    expect((await screen.findAllByText(/Too many attempts/)).length).toBeGreaterThan(0);
    expect(save()).toBeDisabled();
  });

  it('the guard blocks a dirty exit until Discard; Keep editing stays', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    const { router } = await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Close all days' }));
    void router.navigateByUrl('/branches');
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.url).toBe(`/branches/${b.id}/schedule`);
    void router.navigateByUrl('/branches');
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.url).toBe('/branches'));
  });

  it('a background reload does not overwrite what is being edited', async () => {
    const b = seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: WEEK(1) as never });
    const { store } = await open(b.id);
    await screen.findByLabelText('Monday opens');
    await userEvent.click(screen.getByRole('button', { name: 'Close all days' }));
    await store.load({ force: true });
    expect(screen.queryByLabelText('Monday opens')).not.toBeInTheDocument();
  });
});
