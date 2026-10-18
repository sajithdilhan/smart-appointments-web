import { Component, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import {
  flags,
  seedBranch,
  seedService,
  state,
} from '../../../../testing/availability-admin-backend';
import { createFakeToast, type FakeToast } from '../../../../testing/fake-session';
import type { Branch, ServiceType } from '../../../core/api/models';
import { ToastService } from '../../../core/notify/toast.service';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { StatusConfirm, statusWording } from './status-confirm.component';

@Component({
  selector: 'app-host',
  imports: [StatusConfirm],
  template: `
    @for (b of branches.items(); track b.id) {
      <button
        type="button"
        [attr.aria-label]="(b.isActive ? 'Deactivate ' : 'Activate ') + b.name"
        (click)="toggleBranch(b, $event)"
      >
        {{ b.isActive ? 'Deactivate' : 'Activate' }}
      </button>
      <span>{{ b.name }} is {{ b.isActive ? 'active' : 'inactive' }}</span>
    }
    @for (s of services.items(); track s.id) {
      <button
        type="button"
        [attr.aria-label]="'Toggle ' + s.name"
        (click)="toggleService(s, $event)"
      >
        Toggle service
      </button>
    }
    <app-status-confirm />
  `,
})
class Host {
  readonly branches = inject(BranchesStore);
  readonly services = inject(ServicesStore);
  private readonly confirm = viewChild.required(StatusConfirm);

  toggleBranch(b: Branch, e: Event) {
    void this.confirm().ask({
      entity: 'branch',
      record: b,
      store: this.branches,
      hasSchedule: !!b.timeZoneId && b.workingHours.length > 0,
      returnFocus: e.currentTarget as HTMLElement,
    });
  }

  toggleService(s: ServiceType, e: Event) {
    void this.confirm().ask({
      entity: 'service',
      record: s,
      store: this.services,
      returnFocus: e.currentTarget as HTMLElement,
    });
  }
}

let toast: FakeToast;

beforeEach(() => {
  useAdminBackend();
  toast = createFakeToast();
});
afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

async function open() {
  const view = await render(Host, {
    providers: [
      provideRouter([]),
      ...provideAdminApi(),
      { provide: ToastService, useValue: toast },
      BranchesStore,
      ServicesStore,
    ],
  });
  await TestBed.inject(BranchesStore).load();
  await TestBed.inject(ServicesStore).load();
  view.fixture.detectChanges();
  return view;
}

const calls = () => state.requests.filter((r) => r.method === 'POST');

describe('statusWording', () => {
  it.each([
    ['branch', true, 'Existing appointments and already generated slots are not cancelled'],
    ['branch', false, 'visible to customers again'],
    ['service', true, 'Existing appointments are not changed'],
    ['service', false, 'select this service again'],
  ] as const)('%s deactivate=%s', (entity, deactivate, text) => {
    const w = statusWording(entity, 'X', deactivate);
    expect(w.lines.join(' ')).toContain(text);
    expect(w.title).toBe(`${deactivate ? 'Deactivate' : 'Activate'} X?`);
  });
});

describe('StatusConfirm: branches', () => {
  it('states only guaranteed effects, names the branch, and focuses Cancel first', async () => {
    seedBranch({ name: 'Colombo' });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Colombo' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate Colombo?' });
    expect(dialog).toHaveTextContent(
      'Customers will no longer see this branch or search its slots',
    );
    expect(dialog).toHaveTextContent('Admins still see it');
    expect(dialog).toHaveTextContent('Slot generation for it is blocked until it is reactivated');
    expect(dialog).toHaveTextContent(
      'Existing appointments and already generated slots are not cancelled or removed by this action',
    );
    expect(screen.getByRole('button', { name: 'Deactivate branch' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('Cancel sends nothing and returns focus to the row button', async () => {
    seedBranch({ name: 'Colombo' });
    await open();
    const trigger = screen.getByRole('button', { name: 'Deactivate Colombo' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(calls()).toHaveLength(0);
    expect(toast.showSuccess).not.toHaveBeenCalled();
  });

  it('confirming sends one request, updates the badge, toasts neutrally and refocuses the row button', async () => {
    const b = seedBranch({ name: 'Colombo' });
    await open();
    const trigger = screen.getByRole('button', { name: 'Deactivate Colombo' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate branch' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls().map((c) => c.path)).toEqual([`/api/Branches/${b.id}/deactivate`]);
    expect(await screen.findByText('Colombo is inactive')).toBeInTheDocument();
    expect(toast.showSuccess).toHaveBeenCalledWith('Colombo is now inactive');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Activate Colombo' })).toHaveFocus(),
    );
  });

  it('shows pending: the confirm button is disabled with aria-busy while the call runs', async () => {
    seedBranch({ name: 'Colombo' });
    await open();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = window.fetch;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') await gate;
      return original(input, init);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Colombo' }));
    const confirm = await screen.findByRole('button', { name: 'Deactivate branch' });
    await userEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    release();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    vi.restoreAllMocks();
  });

  it('activating a branch without a schedule adds the warning and a link to the schedule page', async () => {
    const b = seedBranch({ name: 'Kandy', isActive: false });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Activate Kandy' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Activate Kandy?' });
    expect(dialog).toHaveTextContent('visible to customers again');
    expect(dialog).toHaveTextContent(
      'This branch has no schedule, so no slots can be generated until you set one',
    );
    expect(screen.getByRole('link', { name: 'Set a schedule' })).toHaveAttribute(
      'href',
      `/admin/branches/${b.id}/schedule`,
    );
    expect(screen.getByRole('button', { name: 'Activate branch' })).toBeInTheDocument();
  });

  it('a branch with a schedule gets no warning', async () => {
    seedBranch({
      name: 'Galle',
      isActive: false,
      timeZoneId: 'Asia/Colombo',
      workingHours: [{ dayOfWeek: 'Monday', opensAt: '09:00', closesAt: '17:00' }],
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Activate Galle' }));
    await screen.findByRole('alertdialog');
    expect(screen.queryByText(/no schedule/)).not.toBeInTheDocument();
  });

  it('a 404 closes the dialog, toasts and reloads the list', async () => {
    seedBranch({ name: 'Colombo' });
    const { fixture } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Colombo' }));
    const confirm = await screen.findByRole('button', { name: 'Deactivate branch' });
    state.branches.length = 0;
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(toast.showInfo).toHaveBeenCalledWith('That branch no longer exists');
    await waitFor(() => expect(TestBed.inject(BranchesStore).items()).toHaveLength(0));
    fixture.detectChanges();
  });

  it('another failure keeps the dialog open with the message so the admin can retry', async () => {
    seedBranch({ name: 'Colombo' });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Colombo' }));
    const confirm = await screen.findByRole('button', { name: 'Deactivate branch' });
    flags.failNext = 503;
    await userEvent.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent(/.+/);
    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(toast.showSuccess).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate branch' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(toast.showSuccess).toHaveBeenCalledWith('Colombo is now inactive');
  });
});

describe('StatusConfirm: services', () => {
  it('deactivate states the service wording and calls the services endpoint', async () => {
    const s = seedService({ name: 'Haircut' });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Haircut' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate Haircut?' });
    expect(dialog).toHaveTextContent('Customers can no longer select this service');
    expect(dialog).toHaveTextContent('Existing appointments are not changed');
    expect(dialog).toHaveTextContent('Slot generation for it is blocked');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate service' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(calls().map((c) => c.path)).toEqual([`/api/Services/${s.id}/deactivate`]);
    expect(TestBed.inject(ServicesStore).byId(s.id)?.isActive).toBe(false);
  });

  it('activate uses the lighter wording', async () => {
    seedService({ name: 'Haircut', isActive: false });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Haircut' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Activate Haircut?' });
    expect(dialog).toHaveTextContent('Customers can select this service again');
    expect(screen.getByRole('button', { name: 'Activate service' })).toBeInTheDocument();
  });
});
