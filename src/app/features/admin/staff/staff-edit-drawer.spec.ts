import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterLink, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
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
import { StaffEditDrawer } from './staff-edit-drawer.component';

@Component({
  selector: 'app-list-host',
  imports: [RouterLink, RouterOutlet, FocusHeadingDirective],
  template: `
    <h1 appFocusHeading>Staff</h1>
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

function setup() {
  const kandy = seedBranch({ name: 'Kandy', code: 'KDY' });
  const galle = seedBranch({ name: 'Galle', code: 'GAL' });
  const jaffna = seedBranch({ name: 'Jaffna', code: 'JAF', isActive: false });
  for (const b of [kandy, galle, jaffna]) {
    staffBackend.addBranch({ id: b.id, isActive: b.isActive });
  }
  const ana = staffBackend.addStaff({
    firstName: 'Ana',
    lastName: 'Perera',
    email: 'ana@example.com',
    phoneNumber: '+94771111111',
    branchId: kandy.id,
  });
  return { kandy, galle, jaffna, ana };
}

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: ListHost,
          children: [
            { path: ':id', component: StaffEditDrawer, canDeactivate: [unsavedChangesGuard] },
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

const branchSelect = () => screen.getByRole('combobox', { name: /^Branch/ });
const save = () => screen.getByRole('button', { name: 'Save' });
const writes = () => staffBackend.state.requests.filter((r) => r.method !== 'GET');
const optionTexts = () =>
  within(branchSelect())
    .getAllByRole('option')
    .map((o) => o.textContent!.trim());

describe('StaffEditDrawer', () => {
  it('is a labelled modal dialog showing the member read-only and the current branch', async () => {
    const { ana, kandy } = setup();
    await open(`/${ana.id}`);
    const dialog = await screen.findByRole('dialog', { name: 'Edit staff member' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await within(dialog).findByText('Ana Perera');
    expect(within(dialog).getByText('ana@example.com')).toBeVisible();
    expect(within(dialog).getByText('+94771111111')).toBeVisible();
    expect(within(dialog).getByText('Active')).toBeVisible();
    expect(within(dialog).getByText(/2026/)).toBeVisible();
    // Name, email, phone, status and date are text, not inputs.
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await waitFor(() => expect(branchSelect()).toHaveValue(kandy.id));
    expect(
      staffBackend.state.requests.filter((r) => r.method === 'GET').map((r) => r.path),
    ).toEqual([`/api/auth/staff/${ana.id}`]);
  });

  it('lists the active branches', async () => {
    const { ana } = setup();
    await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(optionTexts()).toEqual(['Select a branch', 'Galle', 'Kandy']));
  });

  it('shows the sign-out notice above Save', async () => {
    const { ana } = setup();
    await open(`/${ana.id}`);
    const notice = await screen.findByText(
      'Moving a staff member signs them out of every device. They sign in again to work at the new branch.',
    );
    expect(notice.compareDocumentPosition(save()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('disables Save for the same branch and enables it for another', async () => {
    const { ana, galle } = setup();
    await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(save()).toBeDisabled());
    await userEvent.selectOptions(branchSelect(), galle.id);
    expect(save()).toBeEnabled();
    await userEvent.selectOptions(branchSelect(), ana.branchId);
    expect(save()).toBeDisabled();
  });

  it('shows a current branch that is inactive, marked, with Save disabled until another is chosen', async () => {
    const { jaffna } = setup();
    const ben = staffBackend.addStaff({ firstName: 'Ben', lastName: 'Silva', branchId: jaffna.id });
    await open(`/${ben.id}`);
    await screen.findByText('Ben Silva');
    await waitFor(() => expect(optionTexts()).toContain('Jaffna (inactive)'));
    expect(branchSelect()).toHaveValue(jaffna.id);
    expect(save()).toBeDisabled();
  });

  it('moves the member, closes, toasts the branch name and reloads the list', async () => {
    const { ana, galle } = setup();
    const { router, store } = await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(save()).toBeDisabled());
    await userEvent.selectOptions(branchSelect(), galle.id);
    await userEvent.click(save());
    await waitFor(() => expect(router.url).toBe('/'));
    expect(writes().map((r) => [r.method, r.path, r.body])).toEqual([
      ['PUT', `/api/auth/staff/${ana.id}/branch`, { branchId: galle.id }],
    ]);
    expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera moved to Galle.');
    await waitFor(() => expect(store.items().map((i) => i.branchId)).toEqual([galle.id]));
    expect(staffBackend.state.revocations[ana.id]).toBe(1);
  });

  it('shows 422 on the Branch field, reloads the branches and asks for another choice', async () => {
    const { ana, galle } = setup();
    const { branches } = await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(optionTexts()).toContain('Galle'));
    await userEvent.selectOptions(branchSelect(), galle.id);
    // Galle is deactivated by someone else meanwhile.
    staffBackend.state.branches.find((b) => b.id === galle.id)!.isActive = false;
    galle.isActive = false;
    await userEvent.click(save());
    expect(
      await screen.findByText('This branch is not active any more. Choose another.'),
    ).toBeVisible();
    await waitFor(() => expect(branches.active().map((b) => b.name)).toEqual(['Kandy']));
    expect(branchSelect()).toHaveValue('');
    expect(branchSelect()).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the branch-check alert on 503 and keeps the chosen branch', async () => {
    const { ana, galle } = setup();
    const { router } = await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(optionTexts()).toContain('Galle'));
    await userEvent.selectOptions(branchSelect(), galle.id);
    staffBackend.flags.branchCheckUnavailable = true;
    await userEvent.click(save());
    expect(
      await screen.findByText('The branch could not be checked right now. Try again shortly.'),
    ).toBeVisible();
    expect(router.url).toBe(`/${ana.id}`);
    expect(branchSelect()).toHaveValue(galle.id);
    expect(save()).toBeEnabled();
  });

  it('says the account is gone when the read returns 404, and reloads the list', async () => {
    setup();
    const ghost = '00000000-0000-4000-8000-0000000000aa';
    const { store } = await open(`/${ghost}`);
    expect(await screen.findByText('This staff account no longer exists.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to staff' })).toHaveAttribute(
      'href',
      '/admin/staff',
    );
    await waitFor(() => expect(store.status()).toBe('ready'));
    expect(
      staffBackend.state.requests.filter((r) => r.method === 'GET').map((r) => r.search),
    ).toContain('?page=1&pageSize=100');
  });

  it('says the account is gone when the move returns 404', async () => {
    const { ana, galle } = setup();
    await open(`/${ana.id}`);
    await screen.findByText('Ana Perera');
    await waitFor(() => expect(optionTexts()).toContain('Galle'));
    await userEvent.selectOptions(branchSelect(), galle.id);
    ana.deleted = true;
    await userEvent.click(save());
    expect(await screen.findByText('This staff account no longer exists.')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: /^Branch/ })).not.toBeInTheDocument();
  });

  it('shows not-found for an id that is not a GUID, without any request', async () => {
    setup();
    await open('/not-a-guid');
    expect(await screen.findByText('This staff account no longer exists.')).toBeVisible();
    expect(staffBackend.state.requests).toEqual([]);
  });

  it('shows an error with Retry when the read fails', async () => {
    const { ana } = setup();
    staffBackend.flags.failNext = 500;
    await open(`/${ana.id}`);
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveTextContent(/./));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Ana Perera')).toBeVisible();
  });

  describe('unsaved changes', () => {
    it('leaves a pristine drawer without asking', async () => {
      const { ana } = setup();
      const { router } = await open(`/${ana.id}`);
      await screen.findByText('Ana Perera');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(router.url).toBe('/'));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('asks before discarding a chosen branch; Keep editing stays and Discard leaves', async () => {
      const { ana, galle } = setup();
      const { router } = await open(`/${ana.id}`);
      await screen.findByText('Ana Perera');
      await waitFor(() => expect(optionTexts()).toContain('Galle'));
      await userEvent.selectOptions(branchSelect(), galle.id);
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
      expect(router.url).toBe(`/${ana.id}`);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
      await waitFor(() => expect(router.url).toBe('/'));
    });
  });
});
