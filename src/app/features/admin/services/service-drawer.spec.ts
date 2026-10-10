import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterLink, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { flags, seedService, state } from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import { ToastService } from '../../../core/notify/toast.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { ServicesStore } from '../data/services.store';
import { unsavedChangesGuard } from '../shared/dirty/unsaved-changes.guard';
import { ServiceDrawer } from './service-drawer.component';

@Component({
  selector: 'app-list-host',
  imports: [RouterLink, RouterOutlet, FocusHeadingDirective],
  template: `
    <h1 appFocusHeading>Services</h1>
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

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          component: ListHost,
          children: [
            { path: 'new', component: ServiceDrawer, canDeactivate: [unsavedChangesGuard] },
            { path: ':id', component: ServiceDrawer, canDeactivate: [unsavedChangesGuard] },
          ],
        },
      ]),
      ...provideAdminApi(),
      { provide: ToastService, useValue: toast },
      ServicesStore,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ListHost);
  return { router: TestBed.inject(Router), store: TestBed.inject(ServicesStore) };
}

const field = (name: string) => screen.getByRole('textbox', { name: new RegExp(`^${name}`) });
const writes = () => state.requests.filter((r) => r.method !== 'GET');
const duration = () => screen.getByRole('textbox', { name: /^Duration/ });

async function fillValid(over: Partial<Record<string, string>> = {}) {
  const v = { Code: 'cut_01', Name: 'Haircut', ...over };
  for (const [label, value] of Object.entries(v)) {
    const el = field(label);
    await userEvent.clear(el);
    if (value) {
      await userEvent.click(el);
      await userEvent.paste(value);
    }
  }
}

describe('ServiceDrawer: create', () => {
  it('is a labelled modal dialog with the fields, a default duration and focus on Code', async () => {
    await open('/new');
    const dialog = await screen.findByRole('dialog', { name: 'New service' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(field('Code')).toHaveFocus());
    expect(duration()).toHaveValue('30');
    expect(screen.getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('previews the upper-cased code', async () => {
    await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Code/ }), ' cut_01 ');
    expect(screen.getByText('CUT_01')).toBeInTheDocument();
  });

  it('shows the backend wording for a bad code, an empty name and an off-step duration', async () => {
    await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Code/ }), 'a_');
    await userEvent.clear(duration());
    await userEvent.type(duration(), '7');
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    expect(
      await screen.findByText(
        'Code must be 2-30 letters, digits, hyphens or underscores, and cannot start or end with a hyphen or underscore.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Name is required.')).toBeVisible();
    expect(screen.getByText('Duration must be a multiple of 5 minutes.')).toBeVisible();
    expect(writes()).toHaveLength(0);
    await waitFor(() => expect(field('Code')).toHaveFocus());
  });

  it('shows the range message for 480+ and sends nothing', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.clear(duration());
    await userEvent.type(duration(), '485');
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByText('Duration must be between 5 and 480 minutes.')).toBeVisible();
    expect(writes()).toHaveLength(0);
  });

  it('a preset sets the duration that is sent; the body is trimmed with a null description', async () => {
    const { router, store } = await open('/new?q=x');
    await screen.findByRole('dialog');
    await fillValid({ Code: ' cut_01 ', Name: ' Haircut ' });
    await userEvent.click(screen.getByRole('button', { name: '45 min' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() => expect(router.url).toBe('/?q=x'));
    expect(writes()).toHaveLength(1);
    expect(writes()[0].body).toEqual({
      code: 'cut_01',
      name: 'Haircut',
      description: null,
      durationMinutes: 45,
    });
    expect(store.items().map((s) => s.code)).toEqual(['CUT_01']);
    expect(toast.showSuccess).toHaveBeenCalledWith(
      'Service CUT_01 created',
      expect.objectContaining({ label: 'Generate slots' }),
    );
  });

  it('the Generate slots action opens /admin/slots with the new service preselected', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() => expect(toast.showSuccess).toHaveBeenCalled());
    const action = toast.showSuccess.mock.calls[0][1] as { onClick: () => void };
    const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    action.onClick();
    expect(spy).toHaveBeenCalledWith(['/admin/slots'], {
      queryParams: { serviceId: state.services[0].id },
    });
  });

  it('a duplicate code (409) shows the normalised code under Code and keeps values', async () => {
    seedService({ code: 'CUT_01' });
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByText('A service with code CUT_01 already exists.')).toBeVisible();
    await waitFor(() => expect(field('Code')).toHaveFocus());
    expect(field('Name')).toHaveValue('Haircut');
    expect(toast.handleError).not.toHaveBeenCalled();
  });

  it('keeps double submits to one request', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    const save = screen.getByRole('button', { name: 'Create service' });
    await userEvent.click(save);
    await userEvent.click(save);
    await waitFor(() => expect(state.services).toHaveLength(1));
    expect(writes()).toHaveLength(1);
  });

  it('a 429 disables Save and shows the notice; a network error re-enables it', async () => {
    await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    flags.networkError = true;
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create service' })).toBeEnabled(),
    );
    flags.networkError = false;
    flags.rateLimited = true;
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    expect((await screen.findAllByText(/Too many attempts/)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Create service' })).toBeDisabled();
  });
});

describe('ServiceDrawer: edit', () => {
  it('shows the code read-only, the duration note, and sends an update without the code', async () => {
    const s = seedService({ code: 'CUT_01', name: 'Haircut', durationMinutes: 45 });
    const { router, store } = await open(`/${s.id}`);
    expect(await screen.findByRole('dialog', { name: 'Edit service' })).toBeVisible();
    await waitFor(() => expect(field('Name')).toHaveValue('Haircut'));
    expect(screen.getByTestId('service-code')).toHaveTextContent('CUT_01');
    expect(screen.queryByRole('textbox', { name: /^Code/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Changing the duration affects only slots generated from now on. Existing slots keep their length.',
      ),
    ).toBeVisible();
    expect(duration()).toHaveValue('45');
    await userEvent.click(screen.getByRole('button', { name: 'Increase duration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(writes()[0].body).toEqual({ name: 'Haircut', description: null, durationMinutes: 50 });
    expect(store.byId(s.id)?.durationMinutes).toBe(50);
    expect(toast.showSuccess).toHaveBeenCalledWith('Service updated');
  });

  it('deactivates from the drawer header', async () => {
    const s = seedService({ name: 'Haircut' });
    const { store } = await open(`/${s.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Haircut'));
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Haircut' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate service' }));
    await waitFor(() => expect(store.byId(s.id)?.isActive).toBe(false));
    expect(await screen.findByText('Inactive')).toBeVisible();
  });

  it('a non-GUID and an unknown id show the not-found state', async () => {
    await open('/not-a-guid');
    expect(await screen.findByText('That service could not be found.')).toBeVisible();
    expect(state.requests).toHaveLength(0);
  });

  it('a 404 on save closes the drawer, toasts and reloads', async () => {
    const s = seedService({ name: 'Haircut' });
    const { router, store } = await open(`/${s.id}`);
    await waitFor(() => expect(field('Name')).toHaveValue('Haircut'));
    state.services.length = 0;
    await userEvent.type(field('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(toast.showInfo).toHaveBeenCalledWith('That service no longer exists');
    await waitFor(() => expect(store.status()).toBe('loaded'));
    expect(store.items()).toHaveLength(0);
  });
});

describe('ServiceDrawer: leaving', () => {
  it('a dirty drawer asks before Escape closes it; a pristine one does not', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.url).toBe('/'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Keep editing stays and Discard leaves', async () => {
    const { router } = await open('/new');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Name/ }), 'Typed');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(router.url).toBe('/new');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.url).toBe('/'));
  });

  it('a successful save does not trigger the guard', async () => {
    const { router } = await open('/new');
    await screen.findByRole('dialog');
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() => expect(router.url).toBe('/'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
