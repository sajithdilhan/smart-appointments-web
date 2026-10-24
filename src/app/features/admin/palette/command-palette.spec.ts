import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import { seedBranch, seedService, state } from '../../../../testing/availability-admin-backend';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
  type FakeSession,
} from '../../../../testing/fake-session';
import { ThemeService } from '../../../core/theme/theme.service';
import { PaletteLauncher } from '../../../core/ui/palette-launcher';
import { AdminFrame } from '../admin-frame.component';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { SlotActivityStore } from '../data/slot-activity.store';

@Component({
  selector: 'app-page-stub',
  template: `<h1>Stub page</h1>
    <input aria-label="Some text" /><button type="button">Opener</button>`,
})
class PageStub {}

@Component({ selector: 'app-other-stub', template: `<h1>Other page</h1>` })
class OtherStub {}

let session: FakeSession;

beforeEach(() => {
  useAdminBackend();
  session = createFakeSession('authenticated', 'Admin');
});
afterEach(() => {
  document.body.querySelectorAll('[aria-modal]').forEach((n) => n.remove());
});

async function open(url = '/admin') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: '', pathMatch: 'full', component: OtherStub },
        {
          path: 'admin',
          component: AdminFrame,
          children: [
            { path: '', component: PageStub },
            { path: 'branches', component: OtherStub },
            { path: 'services/new', component: OtherStub },
          ],
        },
      ]),
      ...provideAdminApi(),
      BranchesStore,
      ServicesStore,
      SlotActivityStore,
      ...provideFakeSession(session, createFakeToast()),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { harness, router: TestBed.inject(Router), launcher: TestBed.inject(PaletteLauncher) };
}

const chord = (mod: 'Control' | 'Meta') => userEvent.keyboard(`{${mod}>}k{/${mod}}`);
const palette = () => screen.findByRole('dialog', { name: 'Command palette' });
const input = () => screen.getByRole('combobox', { name: 'Search commands' });
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent!.trim());

describe('command palette', () => {
  it('opens on Ctrl+K as a modal dialog with focus in the combobox', async () => {
    await open();
    await chord('Control');
    const dialog = await palette();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(input()).toHaveFocus());
  });

  it('opens on Cmd+K too, and also from inside a text field', async () => {
    await open();
    screen.getByRole('textbox', { name: 'Some text' }).focus();
    await chord('Meta');
    expect(await palette()).toBeVisible();
  });

  it('has the combobox ARIA contract and an active option named by aria-activedescendant', async () => {
    await open();
    await chord('Control');
    await palette();
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-autocomplete', 'list');
    const list = screen.getByRole('listbox');
    expect(input().getAttribute('aria-controls')).toBe(list.id);
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input().getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('lists the static commands in groups whose headings are not options', async () => {
    await open();
    await chord('Control');
    await palette();
    expect(optionNames()).toEqual([
      'Go to Dashboard',
      'Go to Branches',
      'Go to Services',
      'Go to staff',
      'Go to Slot generation',
      'Go to appointments',
      'New branch',
      'New service',
      'New staff member',
      'Generate slots',
      'Toggle theme',
      'Sign out',
    ]);
    for (const heading of ['Navigate', 'Create', 'Settings']) {
      expect(screen.getByRole('group', { name: heading })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: heading })).not.toBeInTheDocument();
    }
  });

  it('filters by every typed word against label and keywords, case-insensitively', async () => {
    await open();
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'NEW serv');
    expect(optionNames()).toEqual(['New service']);
    await userEvent.clear(input());
    await userEvent.type(input(), 'dark');
    expect(optionNames()).toEqual(['Toggle theme']);
  });

  it('shows "No matching commands" in a status region when nothing matches', async () => {
    await open();
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'zzzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matching commands')).toBeVisible();
    expect(screen.getByText('No matching commands').closest('[role="status"]')).not.toBeNull();
    expect(input().getAttribute('aria-activedescendant')).toBeNull();
  });

  it('announces the result count once it settles', async () => {
    await open();
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'new');
    await waitFor(() => expect(screen.getByText('3 results')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('moves with the arrows (wrapping), Home and End, without leaving the input', async () => {
    await open();
    await chord('Control');
    await palette();
    const active = () => screen.getAllByRole('option').findIndex((o) => o.ariaSelected === 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe(2);
    await userEvent.keyboard('{End}');
    expect(active()).toBe(11);
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(0);
    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toBe(11);
    await userEvent.keyboard('{Home}');
    expect(active()).toBe(0);
    expect(input()).toHaveFocus();
  });

  it('Enter runs the highlighted command: closes first, then navigates', async () => {
    const { router } = await open();
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'go to branches{Enter}');
    await waitFor(() => expect(router.url).toBe('/admin/branches'));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('a click runs an option', async () => {
    const { router } = await open();
    await chord('Control');
    await palette();
    await userEvent.click(screen.getByRole('option', { name: 'New service' }));
    await waitFor(() => expect(router.url).toBe('/admin/services/new'));
  });

  it('a command for the current route closes the palette and changes nothing', async () => {
    const { router } = await open('/admin');
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'go to dashboard{Enter}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    );
    expect(router.url).toBe('/admin');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Escape closes and returns focus to the element that had it', async () => {
    await open();
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    await chord('Control');
    await palette();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('Toggle theme flips the theme and Sign out logs out', async () => {
    await open();
    const theme = TestBed.inject(ThemeService);
    theme.set('light');
    await chord('Control');
    await palette();
    await userEvent.click(screen.getByRole('option', { name: 'Toggle theme' }));
    expect(theme.preference()).toBe('dark');
    await chord('Control');
    await palette();
    await userEvent.click(screen.getByRole('option', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalled();
  });

  it('opens from the launcher button request', async () => {
    const { launcher } = await open();
    expect(launcher.available()).toBe(true);
    launcher.request();
    expect(await palette()).toBeVisible();
  });

  it('does not open while another modal is open', async () => {
    await open();
    const foreign = document.createElement('div');
    foreign.setAttribute('role', 'dialog');
    foreign.setAttribute('aria-modal', 'true');
    document.body.appendChild(foreign);
    await chord('Control');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('ignores Ctrl+Shift+K and Alt+Ctrl+K', async () => {
    await open();
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
    await userEvent.keyboard('{Control>}{Alt>}k{/Alt}{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('offers record entries from loaded stores only, and issues no request of its own', async () => {
    const b = seedBranch({ name: 'Colombo Central', code: 'COL' });
    const s = seedService({ name: 'Haircut', code: 'CUT' });
    await open();
    TestBed.inject(BranchesStore).upsert(b);
    TestBed.inject(ServicesStore).upsert(s);
    state.requests.length = 0;
    await chord('Control');
    await palette();
    await userEvent.type(input(), 'colombo');
    expect(optionNames()).toEqual([
      'Edit branch: Colombo Central',
      'Edit schedule: Colombo Central',
    ]);
    await userEvent.clear(input());
    await userEvent.type(input(), 'haircut');
    expect(optionNames()).toEqual(['Edit service: Haircut']);
    expect(
      within(screen.getByRole('group', { name: 'Records' })).getAllByRole('option'),
    ).toHaveLength(1);
    expect(state.requests).toHaveLength(0);
  });

  it('has no record entries while the stores are empty', async () => {
    await open();
    await chord('Control');
    await palette();
    expect(screen.queryByRole('group', { name: 'Records' })).not.toBeInTheDocument();
  });

  it('removes its key listener when the admin frame is destroyed', async () => {
    const { harness } = await open();
    await harness.navigateByUrl('/');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }),
    );
    await Promise.resolve();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(TestBed.inject(PaletteLauncher).available()).toBe(false);
  });
});
