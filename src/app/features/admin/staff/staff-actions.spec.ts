import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { seedBranch } from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import { server } from '../../../../testing/server';
import { STAFF_API_BASE } from '../../../../testing/staff-accounts-backend';
import {
  provideStaffApi,
  staffBackend,
  useStaffBackends,
} from '../../../../testing/staff-test-setup';
import { stubViewport } from '../../../../testing/stub-viewport';
import { AppError } from '../../../core/http/app-error';
import { ToastService } from '../../../core/notify/toast.service';
import { BranchesStore } from '../data/branches.store';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { StaffAccountsPage } from './staff.page';

let toast: FakeToast;

beforeEach(() => {
  useStaffBackends();
  toast = createFakeToast();
});
afterEach(async () => {
  const store = TestBed.inject(StaffAccountsStore);
  await vi.waitFor(() => expect(store.status()).not.toBe('loading'));
  vi.unstubAllGlobals();
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

function setup() {
  const kandy = seedBranch({ name: 'Kandy', code: 'KDY' });
  const galle = seedBranch({ name: 'Galle', code: 'GAL', isActive: false });
  staffBackend.addBranch({ id: kandy.id });
  staffBackend.addBranch({ id: galle.id, isActive: false });
  const ana = staffBackend.addStaff({
    firstName: 'Ana',
    lastName: 'Perera',
    email: 'ana@example.com',
    branchId: kandy.id,
  });
  const ben = staffBackend.addStaff({
    firstName: 'Ben',
    lastName: 'Silva',
    email: 'ben@example.com',
    branchId: galle.id,
    isActive: false,
  });
  const cleo = staffBackend.addStaff({
    firstName: 'Cleo',
    lastName: 'Fernando',
    email: 'cleo@example.com',
    branchId: kandy.id,
    isActive: false,
  });
  return { kandy, galle, ana, ben, cleo };
}

async function open() {
  stubViewport(1280);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '', component: StaffAccountsPage }]),
      ...provideStaffApi(),
      { provide: ToastService, useValue: toast },
      BranchesStore,
      StaffAccountsStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/', StaffAccountsPage);
  const store = TestBed.inject(StaffAccountsStore);
  await waitFor(() => expect(store.items().length).toBeGreaterThan(0));
  return { store };
}

const writes = () => staffBackend.state.requests.filter((r) => r.method !== 'GET');
const lists = () => staffBackend.state.requests.filter((r) => r.method === 'GET');
const rowFor = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

async function choose(name: string, action: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  await userEvent.click(await screen.findByRole('menuitem', { name: action }));
}

describe('deactivate', () => {
  it('asks with the exact wording, focuses Cancel, and sends nothing on Cancel', async () => {
    setup();
    await open();
    await choose('Ana Perera', 'Deactivate');
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate Ana Perera?' });
    expect(dialog).toHaveTextContent(
      "Ana Perera will be signed out of every device and won't be able to sign in. Pages they already have open may keep working for up to an hour.",
    );
    expect(within(dialog).getByRole('button', { name: 'Deactivate' })).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes()).toHaveLength(0);
  });

  it('sends the request on confirm, toasts, reloads and shows the new status', async () => {
    const { ana } = setup();
    await open();
    await choose('Ana Perera', 'Deactivate');
    const before = lists().length;
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(writes().map((r) => [r.method, r.path])).toEqual([
      ['POST', `/api/auth/staff/${ana.id}/deactivate`],
    ]);
    expect(toast.showSuccess).toHaveBeenCalledWith('Ana Perera deactivated.');
    await waitFor(() => expect(rowFor('Ana Perera')).toHaveTextContent('Inactive'));
    expect(lists().length).toBeGreaterThan(before);
    expect(staffBackend.state.revocations[ana.id]).toBe(1);
  });

  it('keeps the dialog open with the message when the request fails', async () => {
    setup();
    await open();
    await choose('Ana Perera', 'Deactivate');
    staffBackend.flags.failNext = 500;
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent(/./));
    expect(toast.showSuccess).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('shows the busy state and disables the row while the request is in flight', async () => {
    setup();
    await open();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post(`${STAFF_API_BASE}/api/auth/staff/:id/deactivate`, async () => {
        await gate; // no response: the model answers next
      }),
    );
    await choose('Ana Perera', 'Deactivate');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Deactivate' })).toHaveAttribute(
        'aria-busy',
        'true',
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Actions for Ana Perera', hidden: true }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Actions for Ben Silva', hidden: true }),
    ).toBeEnabled();
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Ana Perera' })).toBeEnabled(),
    );
  });

  it('says the account is gone on 404, reloads and does not claim success', async () => {
    const { ana } = setup();
    await open();
    await choose('Ana Perera', 'Deactivate');
    ana.deleted = true;
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(toast.showError).toHaveBeenCalled());
    const error = toast.showError.mock.calls[0][0] as AppError;
    expect(error.message).toBe('This staff account no longer exists.');
    expect(toast.showSuccess).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Ana Perera/ })).not.toBeInTheDocument(),
    );
  });
});

describe('delete', () => {
  it('asks with the exact wording, a destructive confirm and focus on Cancel', async () => {
    setup();
    await open();
    await choose('Ana Perera', 'Delete');
    const dialog = await screen.findByRole('alertdialog', {
      name: "Delete Ana Perera's staff account?",
    });
    expect(dialog).toHaveTextContent(
      "They will never be able to sign in again, and ana@example.com can't be used for a new account. This cannot be undone.",
    );
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' });
    expect(confirm).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
  });

  it('deletes on confirm: request, toast, reload, the row is gone', async () => {
    const { ana } = setup();
    await open();
    await choose('Ana Perera', 'Delete');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Ana Perera/ })).not.toBeInTheDocument(),
    );
    expect(writes().map((r) => [r.method, r.path])).toEqual([
      ['DELETE', `/api/auth/staff/${ana.id}`],
    ]);
    expect(toast.showSuccess).toHaveBeenCalledWith("Ana Perera's account was deleted.");
  });

  it('says the account is gone on 404', async () => {
    const { ana } = setup();
    await open();
    await choose('Ana Perera', 'Delete');
    ana.deleted = true;
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(toast.showError).toHaveBeenCalled());
    expect((toast.showError.mock.calls[0][0] as AppError).message).toBe(
      'This staff account no longer exists.',
    );
    expect(toast.showSuccess).not.toHaveBeenCalled();
  });
});

describe('reactivate', () => {
  it('has no dialog: it sends the request, toasts, reloads and shows Active', async () => {
    const { cleo } = setup();
    await open();
    await choose('Cleo Fernando', 'Reactivate');
    await waitFor(() => expect(rowFor('Cleo Fernando')).toHaveTextContent('Active'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writes().map((r) => [r.method, r.path])).toEqual([
      ['POST', `/api/auth/staff/${cleo.id}/activate`],
    ]);
    expect(toast.showSuccess).toHaveBeenCalledWith('Cleo Fernando can sign in again.');
  });

  it('shows a banner with an Edit link when the branch is not active (422)', async () => {
    const { ben } = setup();
    await open();
    await choose('Ben Silva', 'Reactivate');
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(
      "Ben Silva's branch is not active. Move them to an active branch first.",
    );
    expect(within(banner).getByRole('link', { name: 'Edit Ben Silva' })).toHaveAttribute(
      'href',
      `/admin/staff/${ben.id}`,
    );
    expect(toast.showSuccess).not.toHaveBeenCalled();
    await userEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the outage text on 503', async () => {
    setup();
    await open();
    staffBackend.flags.branchCheckUnavailable = true;
    await choose('Cleo Fernando', 'Reactivate');
    await waitFor(() => expect(toast.showError).toHaveBeenCalled());
    const error = toast.showError.mock.calls[0][0] as AppError;
    expect(error.status).toBe(503);
    expect(error.message).toBe('Service temporarily unavailable. Some features may not work.');
    expect(rowFor('Cleo Fernando')).toHaveTextContent('Inactive');
  });

  it('says the account is gone on 404 and reloads', async () => {
    const { cleo } = setup();
    await open();
    cleo.deleted = true;
    await choose('Cleo Fernando', 'Reactivate');
    await waitFor(() => expect(toast.showError).toHaveBeenCalled());
    expect((toast.showError.mock.calls[0][0] as AppError).message).toBe(
      'This staff account no longer exists.',
    );
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Cleo Fernando/ })).not.toBeInTheDocument(),
    );
  });

  it('leaves other failures to the shared toast policy', async () => {
    setup();
    await open();
    staffBackend.flags.failNext = 500;
    await choose('Cleo Fernando', 'Reactivate');
    await waitFor(() => expect(toast.handleError).toHaveBeenCalled());
    expect(toast.showSuccess).not.toHaveBeenCalled();
  });
});
