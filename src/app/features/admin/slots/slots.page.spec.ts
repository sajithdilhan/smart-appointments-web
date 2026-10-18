import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import {
  flags,
  seedBranch,
  seedService,
  state,
} from '../../../../testing/availability-admin-backend';
import { createFakeToast } from '../../../../testing/fake-session';
import { ToastService } from '../../../core/notify/toast.service';
import { CLOCK } from '../../../core/util/clock';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { SlotActivityStore } from '../data/slot-activity.store';
import { unsavedChangesGuard } from '../shared/dirty/unsaved-changes.guard';
import { SlotsPage } from './slots.page';

/** Monday 2026-10-05 00:00 UTC, which is 05:30 the same day in Asia/Colombo. */
const NOW = Date.UTC(2026, 9, 5, 0, 0);

@Component({ selector: 'app-other', template: `<p>elsewhere</p>` })
class Other {}

beforeEach(() => {
  useAdminBackend();
  state.nowMs = NOW;
});
afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const hours = WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: '09:00', closesAt: '17:00' }));

function seedWorld() {
  const branch = seedBranch({
    code: 'COL',
    name: 'Colombo',
    timeZoneId: 'Asia/Colombo',
    workingHours: hours,
  });
  const service = seedService({ code: 'CUT', name: 'Haircut', durationMinutes: 60 });
  return { branch, service };
}

async function open(url = '/') {
  const toast = createFakeToast();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', component: SlotsPage, canDeactivate: [unsavedChangesGuard] },
        { path: 'other', component: Other },
      ]),
      ...provideAdminApi(),
      { provide: ToastService, useValue: toast },
      { provide: CLOCK, useValue: { now: () => NOW, setTimer: () => () => undefined } },
      BranchesStore,
      ServicesStore,
      SlotActivityStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, SlotsPage);
  await waitFor(() => expect(TestBed.inject(ServicesStore).status()).toBe('loaded'));
  await waitFor(() => expect(TestBed.inject(BranchesStore).status()).toBe('loaded'));
  harness.detectChanges();
  return { router: TestBed.inject(Router), toast, activity: TestBed.inject(SlotActivityStore) };
}

const branchSelect = () => screen.getByLabelText('Branch');
const serviceSelect = () => screen.getByLabelText('Service');
const fromInput = () => screen.getByLabelText('From date');
const toInput = () => screen.getByLabelText('To date');
const generate = () => screen.getByRole('button', { name: 'Generate slots' });
const posts = () => state.requests.filter((r) => r.method === 'POST');

async function choose(branchId: string, serviceId: string) {
  await userEvent.selectOptions(branchSelect(), branchId);
  await userEvent.selectOptions(serviceSelect(), serviceId);
}

async function range(from: string, to: string) {
  await userEvent.type(fromInput(), from);
  await userEvent.type(toInput(), to);
}

describe('SlotsPage: pickers', () => {
  it('has one h1 and lists only active records as "{name} ({code})"', async () => {
    const { branch, service } = seedWorld();
    seedBranch({ code: 'OLD', name: 'Closed branch', isActive: false });
    seedService({ code: 'OLDS', name: 'Old service', isActive: false });
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Slot generation' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Colombo (COL)' })).toHaveValue(branch.id);
    expect(screen.getByRole('option', { name: 'Haircut (CUT)' })).toHaveValue(service.id);
    expect(screen.queryByRole('option', { name: /Closed branch/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Old service/ })).not.toBeInTheDocument();
    expect(state.requests.filter((r) => r.method === 'GET').map((r) => r.search)).toEqual([
      '?includeInactive=true',
      '?includeInactive=true',
    ]);
  });

  it('notes that inactive records are not listed, with links to them', async () => {
    seedWorld();
    seedBranch({ isActive: false });
    await open();
    expect(
      screen.getByText(
        /Inactive branches and services are not listed. Reactivate one to generate slots for it./,
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Inactive branches' })).toHaveAttribute(
      'href',
      '/admin/branches?status=inactive',
    );
    expect(screen.getByRole('link', { name: 'Inactive services' })).toHaveAttribute(
      'href',
      '/admin/services?status=inactive',
    );
  });

  it('shows what is missing, with links, and disables Generate when nothing is active', async () => {
    seedBranch({ isActive: false });
    await open();
    expect(screen.getByText(/There is no active branch/)).toBeVisible();
    expect(screen.getByText(/There is no active service/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create a branch' })).toHaveAttribute(
      'href',
      '/admin/branches/new',
    );
    expect(screen.getByRole('link', { name: 'Create a service' })).toBeVisible();
    await userEvent.click(generate());
    expect(posts()).toHaveLength(0);
  });

  it('?branchId and ?serviceId preselect active records and ignore anything else', async () => {
    const { branch, service } = seedWorld();
    await open(`/?branchId=${branch.id}&serviceId=${service.id}`);
    await waitFor(() => expect(branchSelect()).toHaveValue(branch.id));
    expect(serviceSelect()).toHaveValue(service.id);
  });

  it('ignores an id that is not an active record', async () => {
    const { branch } = seedWorld();
    const inactive = seedService({ code: 'OFF', name: 'Off', isActive: false });
    await open(`/?branchId=${branch.id}&serviceId=${inactive.id}`);
    await waitFor(() => expect(branchSelect()).toHaveValue(branch.id));
    expect(serviceSelect()).toHaveValue('');
  });
});

describe('SlotsPage: schedule and dates', () => {
  it('warns when the branch has no schedule, links to it and disables Generate', async () => {
    const { service } = seedWorld();
    const bare = seedBranch({ code: 'KDY', name: 'Kandy' });
    await open();
    await choose(bare.id, service.id);
    expect(
      screen.getByText(/This branch has no schedule, so slots cannot be generated/),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set a schedule' })).toHaveAttribute(
      'href',
      `/admin/branches/${bare.id}/schedule`,
    );
    expect(generate()).toBeDisabled();
  });

  it('disables the dates with a hint until a branch is chosen', async () => {
    const { branch } = seedWorld();
    await open();
    expect(fromInput()).toBeDisabled();
    expect(toInput()).toBeDisabled();
    expect(screen.getByText('Choose a branch to pick dates.')).toBeVisible();
    await userEvent.selectOptions(branchSelect(), branch.id);
    expect(fromInput()).toBeEnabled();
  });

  it('labels the dates with the branch zone and bounds them to today in that zone', async () => {
    const { branch } = seedWorld();
    await open();
    await userEvent.selectOptions(branchSelect(), branch.id);
    expect(screen.getByText('Dates are in Asia/Colombo (UTC+05:30)')).toBeVisible();
    expect(fromInput()).toHaveAttribute('min', '2026-10-05');
    expect(toInput()).toHaveAttribute('min', '2026-10-05');
    await userEvent.type(fromInput(), '2026-10-07');
    expect(toInput()).toHaveAttribute('min', '2026-10-07');
    expect(toInput()).toHaveAttribute('max', '2026-11-06');
  });

  it('the quick ranges count from today in the branch zone', async () => {
    const { branch } = seedWorld();
    await open();
    await userEvent.selectOptions(branchSelect(), branch.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    expect(fromInput()).toHaveValue('2026-10-05');
    expect(toInput()).toHaveValue('2026-10-11');
    await userEvent.click(screen.getByRole('button', { name: 'Next 30 days' }));
    expect(toInput()).toHaveValue('2026-11-03');
  });

  it('rejects an end before the start and a span over 31 days, sending nothing', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await range('2026-10-09', '2026-10-06');
    await userEvent.click(generate());
    expect(await screen.findByText('From date cannot be after to date.')).toBeVisible();
    await userEvent.clear(toInput());
    await userEvent.type(toInput(), '2026-11-09');
    expect(await screen.findByText('The date range cannot span more than 31 days.')).toBeVisible();
    expect(posts()).toHaveLength(0);
  });

  it('accepts exactly 31 dates', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await range('2026-10-05', '2026-11-04');
    await userEvent.click(generate());
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it('requires a capacity from 1 to 100', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    await userEvent.clear(screen.getByLabelText('Capacity'));
    await userEvent.type(screen.getByLabelText('Capacity'), '101');
    await userEvent.click(generate());
    expect(await screen.findByText('Capacity must be between 1 and 100.')).toBeVisible();
    expect(screen.getByText('How many customers can book the same slot.')).toBeVisible();
    expect(posts()).toHaveLength(0);
  });
});

describe('SlotsPage: preview', () => {
  it('estimates days and slots, the closed days and the already-started-today note', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    await waitFor(() =>
      expect(screen.getByText('7 days, about 40 slots estimated')).toBeInTheDocument(),
    );
    expect(screen.getByText('2 closed days in this range')).toBeVisible();
    expect(
      screen.getByText('Slots that have already started today are not created.'),
    ).toBeVisible();
    expect(screen.getByText(/This is an estimate/)).toBeVisible();
    expect(screen.getByTestId('preview')).toHaveAttribute('role', 'status');
  });

  it('uses the singular for one day', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await range('2026-10-06', '2026-10-06');
    await waitFor(() =>
      expect(screen.getByText('1 day, about 8 slots estimated')).toBeInTheDocument(),
    );
  });

  it('a zero estimate explains why but keeps Generate enabled', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await range('2026-10-10', '2026-10-11');
    await waitFor(() =>
      expect(
        screen.getByText(
          'No slots would be created: the branch is closed on every day in this range.',
        ),
      ).toBeInTheDocument(),
    );
    expect(generate()).toBeEnabled();
  });
});

describe('SlotsPage: generating', () => {
  it('sends the body once, shows the result card with focus and counts the session', async () => {
    const { branch, service } = seedWorld();
    const { activity } = await open();
    await choose(branch.id, service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    await userEvent.click(generate());
    const heading = await screen.findByRole('heading', { name: /slots created/ });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toEqual({
      branchId: branch.id,
      serviceTypeId: service.id,
      fromDate: '2026-10-05',
      toDate: '2026-10-11',
      capacity: 1,
    });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText('0 skipped because they overlap existing slots')).toBeVisible();
    const card = within(heading.closest('section')!);
    expect(card.getByText('Colombo (COL)')).toBeVisible();
    expect(card.getByText('Haircut (CUT)')).toBeVisible();
    expect(card.getByText('2026-10-05 to 2026-10-11')).toBeVisible();
    expect(heading.closest('[role="status"]')).not.toBeNull();
    expect(activity.createdThisSession()).toBe(40);
    expect(activity.generations()).toBe(1);
  });

  it('is busy while pending: Generate is disabled with aria-busy', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = window.fetch;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') await gate;
      return original(input, init);
    });
    await userEvent.click(generate());
    expect(generate()).toBeDisabled();
    expect(generate()).toHaveAttribute('aria-busy', 'true');
    expect(fromInput()).toBeDisabled();
    await userEvent.click(generate());
    release();
    await screen.findByRole('heading', { name: /slots created/ });
    expect(posts()).toHaveLength(1);
  });

  it('explains a run that created nothing instead of reporting plain success', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await range('2026-10-10', '2026-10-11');
    await userEvent.click(generate());
    expect(await screen.findByRole('heading', { name: '0 slots created' })).toBeVisible();
    expect(screen.getByText(/Nothing was created/)).toBeVisible();
  });

  it('Generate more clears the dates and keeps the pickers', async () => {
    const { branch, service } = seedWorld();
    await open();
    await choose(branch.id, service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    await userEvent.click(generate());
    await userEvent.click(await screen.findByRole('button', { name: 'Generate more' }));
    expect(fromInput()).toHaveValue('');
    expect(toInput()).toHaveValue('');
    expect(branchSelect()).toHaveValue(branch.id);
    expect(screen.queryByRole('heading', { name: /slots created/ })).not.toBeInTheDocument();
  });
});

describe('SlotsPage: errors', () => {
  async function ready() {
    const world = seedWorld();
    const page = await open();
    await choose(world.branch.id, world.service.id);
    await userEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    return { ...world, ...page };
  }

  it('409 no working hours: explained with a Set a schedule link', async () => {
    const { branch } = await ready();
    state.branches.find((b) => b.id === branch.id)!.workingHours = [];
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent('This branch has no schedule');
    expect(screen.getAllByRole('link', { name: 'Set a schedule' }).at(-1)).toHaveAttribute(
      'href',
      `/admin/branches/${branch.id}/schedule`,
    );
  });

  it('409 inactive branch: explained with an Activate it link', async () => {
    const { branch } = await ready();
    state.branches.find((b) => b.id === branch.id)!.isActive = false;
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent('This branch is inactive');
    expect(screen.getByRole('link', { name: 'Activate it' })).toHaveAttribute(
      'href',
      '/admin/branches?status=inactive',
    );
  });

  it('409 inactive service: explained with an Activate it link', async () => {
    const { service } = await ready();
    state.services.find((s) => s.id === service.id)!.isActive = false;
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent('This service is inactive');
    expect(screen.getByRole('link', { name: 'Activate it' })).toHaveAttribute(
      'href',
      '/admin/services?status=inactive',
    );
  });

  it('409 concurrent generation: offers Try again by hand, never automatically', async () => {
    await ready();
    flags.concurrentGeneration = true;
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent(
      'Another generation for this branch and service was running at the same time. Check the result and try again.',
    );
    expect(posts()).toHaveLength(1);
    flags.concurrentGeneration = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: '40 slots created' })).toBeVisible();
    expect(posts()).toHaveLength(2);
  });

  it('404 branch: says it no longer exists and reloads the pickers', async () => {
    const { branch } = await ready();
    state.branches.splice(
      state.branches.findIndex((b) => b.id === branch.id),
      1,
    );
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent('That branch no longer exists');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Colombo (COL)' })).not.toBeInTheDocument(),
    );
  });

  it('404 service: says it no longer exists', async () => {
    const { service } = await ready();
    state.services.splice(
      state.services.findIndex((s) => s.id === service.id),
      1,
    );
    await userEvent.click(generate());
    expect(await problem()).toHaveTextContent('That service no longer exists');
  });

  it('a 400 puts known messages on their fields and the rest in the alert', async () => {
    await ready();
    const original = window.fetch;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              status: 400,
              detail:
                'Invalid request data. Errors: Capacity must be between 1 and 100.,Something else',
            }),
            { status: 400, headers: { 'content-type': 'application/problem+json' } },
          )
        : original(input, init),
    );
    await userEvent.click(generate());
    expect(await screen.findByText('Capacity must be between 1 and 100.')).toBeVisible();
    expect(screen.getByLabelText('Capacity')).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('Something else')).toBeVisible();
  });

  it('a 429 disables Generate and shows the rate-limit notice', async () => {
    await ready();
    flags.rateLimited = true;
    await userEvent.click(generate());
    expect((await screen.findAllByText(/Too many attempts/)).length).toBeGreaterThan(0);
    expect(generate()).toBeDisabled();
  });

  it('keeps the form after a network error', async () => {
    await ready();
    flags.networkError = true;
    await userEvent.click(generate());
    await waitFor(() => expect(generate()).toBeEnabled());
    expect(toInput()).toHaveValue('2026-10-11');
  });
});

describe('SlotsPage: unsaved changes', () => {
  it('a pristine form leaves freely; a changed one asks first', async () => {
    const { branch } = seedWorld();
    const { router } = await open();
    await router.navigateByUrl('/other');
    expect(await screen.findByText('elsewhere')).toBeVisible();
    await router.navigateByUrl('/');
    await screen.findByRole('option', { name: 'Colombo (COL)' });
    await userEvent.selectOptions(branchSelect(), branch.id);
    void router.navigateByUrl('/other');
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.url).toBe('/');
  });

  it('a preselected picker counts as the initial state', async () => {
    const { branch } = seedWorld();
    const { router } = await open(`/?branchId=${branch.id}`);
    await waitFor(() => expect(branchSelect()).toHaveValue(branch.id));
    await router.navigateByUrl('/other');
    expect(await screen.findByText('elsewhere')).toBeVisible();
  });
});

/** The alert that has text (the form's own alert region is always present, and empty). */
function problem() {
  return waitFor(() => {
    const el = screen.getAllByRole('alert').find((a) => (a.textContent ?? '').trim() !== '');
    if (!el) throw new Error('no alert with text');
    return el;
  });
}
