import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterLink, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { flags, seedBranch, state } from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import { ToastService } from '../../../core/notify/toast.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { BranchesStore } from '../data/branches.store';
import { unsavedChangesGuard } from '../shared/dirty/unsaved-changes.guard';
import { BranchDrawer } from './branch-drawer.component';

@Component({
  selector: 'app-list-host',
  imports: [RouterLink, RouterOutlet, FocusHeadingDirective],
  template: `
    <h1 appFocusHeading>Branches</h1>
    <a routerLink="new" queryParamsHandling="preserve">Open new</a>
    <router-outlet />
  `,
})
class ListHost {}

let toast: FakeToast;

beforeEach(() => {
  useAdminBackend();
  toast = createFakeToast();
});
afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
  vi.restoreAllMocks();
});

async function open(url: string, role: 'Admin' | 'Customer' = 'Admin') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: ListHost,
          children: [
            { path: 'new', component: BranchDrawer, canDeactivate: [unsavedChangesGuard] },
            { path: ':id', component: BranchDrawer, canDeactivate: [unsavedChangesGuard] },
          ],
        },
      ]),
      ...provideAdminApi(role),
      { provide: ToastService, useValue: toast },
      BranchesStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ListHost);
  return { harness, router: TestBed.inject(Router), store: TestBed.inject(BranchesStore) };
}

const field = (name: string) => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });
const writes = () => state.requests.filter((r) => r.method !== 'GET');

async function fillValid(over: Partial<Record<string, string>> = {}) {
  const v = {
    Code: 'col-01',
    Name: 'Colombo Central',
    Address: '1 Galle Road',
    'Phone number': '+94 11-222 3344',
    ...over,
  };
  for (const [label, value] of Object.entries(v)) {
    const el = field(label);
    await userEvent.clear(el);
    if (value) {
      await userEvent.click(el);
      await userEvent.paste(value);
    }
  }
}

/** Replaces the response of one method with a fixed one; other calls go through. */
function stubFetch(method: string, respond: () => Response) {
  const original = window.fetch;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) =>
    init?.method === method ? respond() : original(input, init),
  );
}

describe('BranchDrawer: create', () => {
  it('is a labelled modal dialog with the fields in order and focus on the first', async () => {
    await open('/new');
    const dialog = await screen.findByRole('dialog', { name: 'New branch' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(field('Code')).toHaveFocus());
    expect(screen.getAllByRole('textbox').map((e) => e.id)).toEqual([
      'branch-code',
      'branch-name',
      'branch-description',
      'branch-address',
      'branch-phoneNumber',
    ]);
  });

  it('shows the normalised code preview and the description counter', async () => {
    await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Code/ }), ' col-01 ');
    expect(screen.getByText('COL-01')).toBeInTheDocument();
    expect(screen.getByText(/Will be saved as/)).toBeInTheDocument();
    await userEvent.type(field('Description'), 'abc');
    expect(screen.getByText('497 characters remaining')).toBeInTheDocument();
  });

  it('shows no preview for an invalid code', async () => {
    await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Code/ }), '-AB');
    expect(screen.queryByText(/Will be saved as/)).not.toBeInTheDocument();
  });

  it('validates on submit with the backend wording, sends nothing, focuses the first invalid field', async () => {
    await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Code/ }), 'A');
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(
      await screen.findByText(
        'Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Name is required.')).toBeVisible();
    expect(screen.getByText('Address is required.')).toBeVisible();
    expect(screen.getByText('Phone number is required.')).toBeVisible();
    expect(field('Code')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field('Code')).toHaveFocus());
    expect(writes()).toHaveLength(0);
  });

  it('rejects a phone without the country code and an over-long name', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid({ Name: 'x'.repeat(101), 'Phone number': '0123' });
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(await screen.findByText('Name cannot exceed 100 characters.')).toBeVisible();
    expect(
      screen.getByText('Enter a phone number with the country code, for example +14155550123.'),
    ).toBeVisible();
    expect(writes()).toHaveLength(0);
  });

  it('sends trimmed values, a null description and the cleaned phone, then closes', async () => {
    const { router, store } = await open('/new?q=x');
    await screen.findByRole('dialog');
    await fillValid({ Code: ' col-01 ', Name: '  Colombo Central ' });
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() => expect(router.url).toBe('/?q=x'));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      code: 'col-01',
      name: 'Colombo Central',
      description: null,
      address: '1 Galle Road',
      phoneNumber: '+94112223344',
    });
    expect(store.items().map((b) => b.code)).toEqual(['COL-01']);
    expect(toast.showSuccess).toHaveBeenCalledWith(
      'Branch COL-01 created',
      expect.objectContaining({ label: 'Set schedule' }),
    );
  });

  it('the Set schedule toast action opens the schedule page of the new branch', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalled());
    const action = toast.showSuccess.mock.calls[0][1] as { onClick: () => void };
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    action.onClick();
    expect(spy).toHaveBeenCalledWith(['/admin/branches', state.branches[0].id, 'schedule']);
  });

  it('keeps double submits to one request', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    const save = screen.getByRole('button', { name: 'Create branch' });
    await userEvent.click(save);
    await userEvent.click(save);
    await waitFor(() => expect(state.branches).toHaveLength(1));
    expect(writes()).toHaveLength(1);
  });

  it('is busy while pending: Save disabled with aria-busy and fields read-only', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = window.fetch;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') await gate;
      return original(input, init);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    const save = screen.getByRole('button', { name: 'Create branch' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(field('Name')).toHaveAttribute('readonly');
    release();
    await waitFor(() => expect(state.branches).toHaveLength(1));
  });

  it('a duplicate code (409) shows the normalised code under Code, focuses it, keeps values, no toast', async () => {
    seedBranch({ code: 'COL-01' });
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid({ Code: 'col-01' });
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(await screen.findByText('A branch with code COL-01 already exists.')).toBeVisible();
    expect(field('Code')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field('Code')).toHaveFocus());
    expect(field('Name')).toHaveValue('Colombo Central');
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(toast.handleError).not.toHaveBeenCalled();
    await userEvent.type(field('Code'), '2');
    expect(screen.queryByText('A branch with code COL-01 already exists.')).not.toBeInTheDocument();
  });

  it('maps a 400 to its fields and puts unknown messages in the alert, keeping the values', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    stubFetch(
      'POST',
      () =>
        new Response(
          JSON.stringify({
            status: 400,
            detail:
              'Invalid request data. Errors: Invalid phone number format.,Something odd happened',
          }),
          { status: 400, headers: { 'content-type': 'application/problem+json' } },
        ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(await screen.findByText('Invalid phone number format.')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something odd happened');
    expect(field('Phone number')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field('Phone number')).toHaveFocus());
    expect(field('Name')).toHaveValue('Colombo Central');
  });

  it('keeps the form open and re-enabled after a network error', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    flags.networkError = true;
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create branch' })).toBeEnabled(),
    );
    expect(field('Name')).toHaveValue('Colombo Central');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('a 429 disables Save and shows the rate-limit notice', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    flags.rateLimited = true;
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    expect((await screen.findAllByText(/Too many attempts. Try again in/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole('button', { name: 'Create branch' })).toBeDisabled();
  });

  it('a 403 goes to the toast policy and the form stays open', async () => {
    await open('/new', 'Customer');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() => expect(toast.handleError).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('BranchDrawer: edit', () => {
  it('shows the code as read-only text and does not send it', async () => {
    const b = seedBranch({ code: 'COL-01', name: 'Colombo', description: 'Main' });
    const { router, store } = await open(`/${b.id}`);
    expect(await screen.findByRole('dialog', { name: 'Edit branch' })).toBeVisible();
    await waitFor(() => expect(field('Name')).toHaveValue('Colombo'));
    expect(screen.getByTestId('branch-code')).toHaveTextContent('COL-01');
    expect(screen.getByText('The code cannot be changed after creation')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /^Code/ })).not.toBeInTheDocument();
    await userEvent.clear(field('Name'));
    await userEvent.type(field('Name'), 'Colombo North');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      name: 'Colombo North',
      description: 'Main',
      address: '1 Main Street',
      phoneNumber: '+14155550123',
    });
    expect(store.byId(b.id)?.name).toBe('Colombo North');
    expect(toast.showSuccess).toHaveBeenCalledWith('Branch updated');
  });

  it('refetches the record when the update answers without a body', async () => {
    const b = seedBranch({ name: 'Colombo' });
    const { store } = await open(`/${b.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Colombo'));
    stubFetch('PUT', () => {
      b.name = 'Renamed';
      return new Response(null, { status: 204 });
    });
    await userEvent.type(field('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(store.byId(b.id)?.name).toBe('Renamed'));
  });

  it('deactivates from the drawer header and the badge follows', async () => {
    const b = seedBranch({ name: 'Colombo' });
    const { store } = await open(`/${b.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Colombo'));
    expect(screen.getByText('Active')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Colombo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate branch' }));
    await waitFor(() => expect(store.byId(b.id)?.isActive).toBe(false));
    expect(await screen.findByText('Inactive')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Activate Colombo' })).toBeVisible();
  });

  it('a non-GUID id shows the not-found state with no request', async () => {
    await open('/not-a-guid');
    expect(await screen.findByText('That branch could not be found.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(state.requests).toHaveLength(0);
  });

  it('an unknown GUID shows the not-found state', async () => {
    await open(`/${crypto.randomUUID()}`);
    expect(await screen.findByText('That branch could not be found.')).toBeVisible();
  });

  it('a 404 on save closes the drawer, toasts and reloads the list', async () => {
    const b = seedBranch({ name: 'Colombo' });
    const { router, store } = await open(`/${b.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Colombo'));
    state.branches.length = 0;
    await userEvent.type(field('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(toast.showInfo).toHaveBeenCalledWith('That branch no longer exists');
    await waitFor(() => expect(store.status()).toBe('loaded'));
    expect(store.items()).toHaveLength(0);
  });
});

describe('BranchDrawer: leaving and focus', () => {
  it('a pristine drawer closes on Escape without a dialog, keeping the query', async () => {
    const { router } = await open('/new?q=kan');
    await screen.findByRole('dialog', { name: 'New branch' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.url).toBe('/?q=kan'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Escape on a dirty drawer goes through the guard; Keep editing stays, Discard leaves', async () => {
    const { router } = await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Typed');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(router.url).toBe('/new');
    expect(field('Name')).toHaveValue('Typed');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
  });

  it('typing and deleting back to the original is pristine again', async () => {
    const b = seedBranch({ name: 'Colombo' });
    const { router } = await open(`/${b.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Colombo'));
    await userEvent.type(field('Name'), 'x');
    await userEvent.type(field('Name'), '{Backspace}');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.url).toBe('/'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('a successful save does not trigger the guard', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create branch' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('returns focus to the link that opened the drawer', async () => {
    const { router } = await open('/');
    const opener = screen.getByRole('link', { name: 'Open new' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.url).toBe('/'));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('falls back to the page heading when opened by deep link', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.url).toBe('/'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Branches' })).toHaveFocus());
  });

  it('registers a beforeunload handler only once dirty', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    await open('/new');
    await screen.findByRole('dialog');
    expect(add.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(false);
    await userEvent.type(field('Name'), 'x');
    await waitFor(() => expect(add.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true));
  });
});
