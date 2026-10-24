import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterLink, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { fireEvent, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { seedBranch } from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import {
  provideStaffApi,
  staffBackend,
  useStaffBackends,
} from '../../../../testing/staff-test-setup';
import { ToastService } from '../../../core/notify/toast.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { BranchesStore } from '../data/branches.store';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { unsavedChangesGuard } from '../shared/dirty/unsaved-changes.guard';
import { StaffCreateDrawer } from './staff-create-drawer.component';

@Component({
  selector: 'app-list-host',
  imports: [RouterLink, RouterOutlet, FocusHeadingDirective],
  template: `
    <h1 appFocusHeading>Staff</h1>
    <a routerLink="new" queryParamsHandling="preserve">Open new</a>
    <router-outlet />
  `,
})
class ListHost {}

let toast: FakeToast;

beforeEach(() => {
  useStaffBackends();
  toast = createFakeToast();
});
afterEach(async () => {
  // A saved form reloads the list without waiting: let that request finish before the next test.
  const store = TestBed.inject(StaffAccountsStore);
  await vi.waitFor(() => expect(store.status()).not.toBe('loading'));
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

const PASSWORD = 'Str0ng!pass';

function seedBranches() {
  const kandy = seedBranch({ name: 'Kandy', code: 'KDY' });
  const galle = seedBranch({ name: 'Galle', code: 'GAL', isActive: false });
  staffBackend.addBranch({ id: kandy.id });
  staffBackend.addBranch({ id: galle.id, isActive: false });
  return { kandy, galle };
}

async function open(url = '/new') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: ListHost,
          children: [
            { path: 'new', component: StaffCreateDrawer, canDeactivate: [unsavedChangesGuard] },
          ],
        },
      ]),
      ...provideStaffApi(),
      { provide: ToastService, useValue: toast },
      BranchesStore,
      StaffAccountsStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ListHost);
  return {
    router: TestBed.inject(Router),
    store: TestBed.inject(StaffAccountsStore),
    branches: TestBed.inject(BranchesStore),
  };
}

const textbox = (name: string) => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });
const password = () => screen.getByLabelText(/^Password/) as HTMLInputElement;
const branchSelect = () => screen.getByRole('combobox', { name: /^Branch/ });
const posts = () => staffBackend.state.requests.filter((r) => r.method === 'POST');
const submitButton = () => screen.getByRole('button', { name: 'Create staff member' });

async function paste(el: HTMLElement, value: string) {
  await userEvent.click(el);
  await userEvent.paste(value);
}

async function fillValid(branchId: string, over: Partial<Record<string, string>> = {}) {
  const v = {
    'First name': 'Ana',
    'Last name': 'Perera',
    Email: 'ana@example.com',
    'Phone number': '+94 77-123 4567',
    ...over,
  };
  for (const [label, value] of Object.entries(v)) await paste(textbox(label), value!);
  await paste(password(), PASSWORD);
  await userEvent.selectOptions(branchSelect(), branchId);
}

describe('StaffCreateDrawer', () => {
  it('is a labelled modal dialog with every field, and focus starts on First name', async () => {
    seedBranches();
    await open();
    const dialog = await screen.findByRole('dialog', { name: 'New staff member' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(textbox('First name')).toHaveFocus());
    for (const label of ['First name', 'Last name', 'Email', 'Phone number']) {
      expect(textbox(label)).toBeVisible();
    }
    expect(password()).toHaveAttribute('type', 'password');
    expect(branchSelect()).toBeVisible();
  });

  it('offers only active branches', async () => {
    seedBranches();
    await open();
    await screen.findByRole('dialog');
    await waitFor(() => expect(within(branchSelect()).getAllByRole('option')).toHaveLength(2));
    expect(
      within(branchSelect())
        .getAllByRole('option')
        .map((o) => o.textContent!.trim()),
    ).toEqual(['Select a branch', 'Kandy']);
  });

  it('says so when no branch is active', async () => {
    await open();
    expect(
      await screen.findByText(
        'There are no active branches. Activate a branch before adding staff.',
      ),
    ).toBeVisible();
  });

  it('shows every required message on submit, focuses the first, and sends nothing', async () => {
    seedBranches();
    await open();
    await screen.findByRole('dialog');
    await userEvent.click(submitButton());
    for (const message of [
      'First name is required.',
      'Last name is required.',
      'Email is required.',
      'Phone number is required.',
      'Password is required.',
      'Choose a branch.',
    ]) {
      expect(screen.getByText(message)).toBeVisible();
    }
    await waitFor(() => expect(textbox('First name')).toHaveFocus());
    expect(textbox('First name')).toHaveAttribute('aria-invalid', 'true');
    expect(posts()).toHaveLength(0);
  });

  it('validates the email, the phone number and the password strength', async () => {
    const { kandy } = seedBranches();
    await open();
    await screen.findByRole('dialog');
    await paste(textbox('First name'), 'Ana');
    await paste(textbox('Last name'), 'Perera');
    await paste(textbox('Email'), 'not-an-email');
    await paste(textbox('Phone number'), '+0123');
    await paste(password(), 'weak');
    await userEvent.selectOptions(branchSelect(), kandy.id);
    await userEvent.click(submitButton());
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(
      screen.getByText('Enter the number in international format, for example +14155550123.'),
    ).toBeVisible();
    expect(screen.getByText('Password does not meet all the requirements.')).toBeVisible();
    expect(posts()).toHaveLength(0);
  });

  it('updates the password checklist as the password is typed', async () => {
    seedBranches();
    await open();
    await screen.findByRole('dialog');
    expect(screen.getByText('At least 8 characters')).toHaveTextContent(/not met/);
    await paste(password(), 'abcdefgh1');
    expect(screen.getByText('At least 8 characters')).toHaveTextContent(/, met/);
    expect(screen.getByText('One lowercase letter (a-z)')).toHaveTextContent(/, met/);
    expect(screen.getByText('One digit (0-9)')).toHaveTextContent(/, met/);
    expect(screen.getByText('One uppercase letter (A-Z)')).toHaveTextContent(/not met/);
  });

  it('sends the trimmed values with the phone number normalised, then closes and reloads', async () => {
    const { kandy } = seedBranches();
    const { router, store } = await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id, { 'First name': '  Ana ', Email: ' ana@example.com ' });
    await userEvent.click(submitButton());
    await waitFor(() => expect(router.url).toBe('/'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toEqual({
      firstName: 'Ana',
      lastName: 'Perera',
      email: 'ana@example.com',
      phoneNumber: '+94771234567',
      password: PASSWORD,
      branchId: kandy.id,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera can now sign in.');
    await waitFor(() => expect(store.items().map((i) => i.email)).toEqual(['ana@example.com']));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows a duplicate email on the Email field and keeps the values', async () => {
    const { kandy } = seedBranches();
    staffBackend.state.takenEmails.push('ana@example.com');
    const { router } = await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    await userEvent.click(submitButton());
    expect(await screen.findByText('Email is already registered.')).toBeVisible();
    expect(textbox('Email')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(textbox('Email')).toHaveFocus());
    expect(textbox('First name')).toHaveValue('Ana');
    expect(router.url).toBe('/new');
    // Editing the field clears the server message.
    await userEvent.type(textbox('Email'), 'x');
    expect(screen.queryByText('Email is already registered.')).not.toBeInTheDocument();
  });

  it('shows 422 on the Branch field, reloads the branches and clears the stale choice', async () => {
    const { kandy } = seedBranches();
    const { branches } = await open();
    await screen.findByRole('dialog');
    await waitFor(() => expect(branches.active()).toHaveLength(1));
    await fillValid(kandy.id);
    // The branch was deactivated by someone else meanwhile.
    kandy.isActive = false;
    staffBackend.state.branches.find((b) => b.id === kandy.id)!.isActive = false;
    await userEvent.click(submitButton());
    expect(
      await screen.findByText('This branch is not active any more. Choose another.'),
    ).toBeVisible();
    await waitFor(() => expect(branches.active()).toHaveLength(0));
    expect(branchSelect()).toHaveValue('');
    expect(branchSelect()).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('Last name')).toHaveValue('Perera');
  });

  it('shows the branch-check alert on 503 and keeps the values, but not the password', async () => {
    const { kandy } = seedBranches();
    staffBackend.flags.branchCheckUnavailable = true;
    const { router } = await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    await userEvent.click(submitButton());
    expect(
      await screen.findByText('The branch could not be checked right now. Try again shortly.'),
    ).toBeVisible();
    expect(router.url).toBe('/new');
    expect(textbox('First name')).toHaveValue('Ana');
    expect(textbox('Email')).toHaveValue('ana@example.com');
    expect(branchSelect()).toHaveValue(kandy.id);
    expect(password()).toHaveValue('');
    // A retry works once the service is back.
    staffBackend.flags.branchCheckUnavailable = false;
    await paste(password(), PASSWORD);
    await userEvent.click(submitButton());
    await waitFor(() => expect(router.url).toBe('/'));
  });

  it('sends any other server message to the form alert', async () => {
    const { kandy } = seedBranches();
    staffBackend.flags.failAll = 400;
    await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    await userEvent.click(submitButton());
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent('The availability service is unavailable'));
    expect(password()).toHaveValue('');
  });

  it('starts a countdown on a rate limit instead of failing silently', async () => {
    const { kandy } = seedBranches();
    staffBackend.flags.rateLimited = true;
    await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    await userEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
  });

  it('sends one request when submitted twice in a row', async () => {
    const { kandy } = seedBranches();
    const { router } = await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    const form = submitButton().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(router.url).toBe('/'));
    expect(posts()).toHaveLength(1);
  });

  it('empties the password control as soon as the request settles, even on failure', async () => {
    const { kandy } = seedBranches();
    staffBackend.state.takenEmails.push('ana@example.com');
    await open();
    await screen.findByRole('dialog');
    await fillValid(kandy.id);
    expect(password()).toHaveValue(PASSWORD);
    await userEvent.click(submitButton());
    await screen.findByText('Email is already registered.');
    expect(password()).toHaveValue('');
    expect(screen.getByText('Password is required.')).toBeVisible();
  });

  describe('unsaved changes', () => {
    it('leaves a pristine form without asking', async () => {
      seedBranches();
      const { router } = await open();
      await screen.findByRole('dialog');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(router.url).toBe('/'));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('asks before discarding typed values; Keep editing stays and Discard leaves', async () => {
      seedBranches();
      const { router } = await open();
      await paste(textbox('First name'), 'Ana');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
      expect(router.url).toBe('/new');
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
      await waitFor(() => expect(router.url).toBe('/'));
    });

    it('counts a typed password as unsaved work without keeping its text', async () => {
      seedBranches();
      const { router } = await open();
      await screen.findByRole('dialog');
      await paste(password(), PASSWORD);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(await screen.findByRole('button', { name: 'Discard changes' })).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
      await waitFor(() => expect(router.url).toBe('/'));
    });

    it('a successful save does not trigger the guard', async () => {
      const { kandy } = seedBranches();
      const { router } = await open();
      await screen.findByRole('dialog');
      await fillValid(kandy.id);
      await userEvent.click(submitButton());
      await waitFor(() => expect(router.url).toBe('/'));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });
});
