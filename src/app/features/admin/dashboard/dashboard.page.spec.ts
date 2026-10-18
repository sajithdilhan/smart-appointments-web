import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { provideAdminApi, useAdminBackend } from '../../../../testing/admin-test-setup';
import {
  ADMIN_API_BASE,
  seedBranch,
  seedService,
  state,
} from '../../../../testing/availability-admin-backend';
import { server } from '../../../../testing/server';
import { OutageState } from '../../../core/http/outage-state';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { SlotActivityStore } from '../data/slot-activity.store';
import { DashboardPage } from './dashboard.page';

beforeEach(useAdminBackend);

const HOURS = [{ dayOfWeek: 'Monday' as const, opensAt: '09:00', closesAt: '17:00' }];

function renderPage() {
  return render(DashboardPage, {
    providers: [
      provideRouter([]),
      ...provideAdminApi(),
      BranchesStore,
      ServicesStore,
      SlotActivityStore,
    ],
  });
}

function seedSchedule(over = {}) {
  return seedBranch({ timeZoneId: 'Asia/Colombo', workingHours: HOURS, ...over });
}

describe('DashboardPage', () => {
  it('renders one h1, requests both lists with includeInactive, and shows the figures', async () => {
    seedSchedule({ name: 'A' });
    seedSchedule({ name: 'B' });
    seedSchedule({ name: 'C' });
    seedSchedule({ name: 'D', isActive: false });
    seedService({ name: 'Cut' });
    seedService({ name: 'Dye', isActive: false });
    await renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByRole('link', { name: 'Active branches: 3 of 4' })).toHaveAttribute(
      'href',
      '/admin/branches',
    );
    expect(screen.getByRole('link', { name: 'Inactive branches: 1' })).toHaveAttribute(
      'href',
      '/admin/branches?status=inactive',
    );
    expect(await screen.findByRole('link', { name: 'Active services: 1 of 2' })).toHaveAttribute(
      'href',
      '/admin/services',
    );
    expect(screen.getByRole('link', { name: 'Inactive services: 1' })).toHaveAttribute(
      'href',
      '/admin/services?status=inactive',
    );
    const lists = state.requests.filter((r) => r.method === 'GET');
    expect(lists.map((r) => r.search).sort()).toEqual([
      '?includeInactive=true',
      '?includeInactive=true',
    ]);
  });

  it('shows a busy skeleton per card while the requests are pending', async () => {
    await renderPage();
    const busy = document.querySelectorAll('[aria-busy="true"]');
    expect(busy).toHaveLength(4);
    await screen.findByRole('link', { name: 'Active branches: 0 of 0' });
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
  });

  it('a failed request affects only the cards that depend on it, and Retry reloads them', async () => {
    seedSchedule();
    let failing = true;
    server.use(
      http.get(`${ADMIN_API_BASE}/api/Services`, () =>
        failing ? HttpResponse.json({ status: 500, detail: 'boom' }, { status: 500 }) : undefined,
      ),
    );
    await renderPage();
    expect(await screen.findByRole('link', { name: 'Active branches: 1 of 1' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Inactive branches: 0' })).toBeVisible();
    const retries = await screen.findAllByRole('button', { name: /^Retry loading/ });
    expect(retries.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Retry loading active services',
      'Retry loading inactive services',
    ]);
    expect(screen.queryByRole('link', { name: /services/i })).not.toBeInTheDocument();
    failing = false;
    await userEvent.click(retries[0]);
    expect(await screen.findByRole('link', { name: 'Active services: 0 of 0' })).toBeVisible();
  });

  describe('needs attention', () => {
    it('lists active branches without a time zone or hours, with a Set schedule link', async () => {
      const noZone = seedBranch({ name: 'Colombo Central', code: 'COL', workingHours: HOURS });
      const noHours = seedBranch({ name: 'Kandy', code: 'KDY', timeZoneId: 'Asia/Colombo' });
      seedSchedule({ name: 'Galle' });
      seedBranch({ name: 'Closed one', isActive: false });
      await renderPage();
      const section = (await screen.findByRole('heading', { name: 'Needs attention' }))
        .parentElement as HTMLElement;
      const rows = within(section).getAllByRole('listitem');
      expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'Colombo Central (COL) Set schedule',
        'Kandy (KDY) Set schedule',
      ]);
      expect(
        within(section).getByRole('link', { name: 'Set schedule for Colombo Central' }),
      ).toHaveAttribute('href', `/admin/branches/${noZone.id}/schedule`);
      expect(within(section).getByRole('link', { name: 'Set schedule for Kandy' })).toHaveAttribute(
        'href',
        `/admin/branches/${noHours.id}/schedule`,
      );
    });

    it('says so when every active branch has a schedule', async () => {
      seedSchedule();
      await renderPage();
      expect(await screen.findByText('Every active branch has a schedule.')).toBeVisible();
      const section = screen.getByRole('heading', { name: 'Needs attention' }).parentElement!;
      expect(within(section).queryByRole('list')).not.toBeInTheDocument();
    });
  });

  describe('quick actions', () => {
    it('links to the three actions', async () => {
      await renderPage();
      expect(screen.getByRole('link', { name: 'New branch' })).toHaveAttribute(
        'href',
        '/admin/branches/new',
      );
      expect(screen.getByRole('link', { name: 'New service' })).toHaveAttribute(
        'href',
        '/admin/services/new',
      );
      expect(screen.getByRole('link', { name: 'Generate slots' })).toHaveAttribute(
        'href',
        '/admin/slots',
      );
    });

    it.each([
      [false, false, 'Create an active branch and an active service first'],
      [false, true, 'Create an active branch first'],
      [true, false, 'Create an active service first'],
    ])('notes what is missing (branch %s, service %s)', async (branch, service, note) => {
      if (branch) seedSchedule();
      if (service) seedService();
      await renderPage();
      expect(await screen.findByText(note)).toBeVisible();
      expect(screen.getByRole('link', { name: 'Generate slots' })).toBeVisible();
    });

    it('has no note when both exist', async () => {
      seedSchedule();
      seedService();
      await renderPage();
      await screen.findByRole('link', { name: 'Active services: 1 of 1' });
      expect(screen.queryByText(/first$/)).not.toBeInTheDocument();
    });
  });

  describe('slots generated this session', () => {
    it('says "No slots generated yet" rather than 0', async () => {
      await renderPage();
      expect(screen.getByText('No slots generated yet')).toBeVisible();
      expect(screen.getByText('This count resets when you reload the page.')).toBeVisible();
    });

    it('shows the figure once a generation ran, even one that created none', async () => {
      await renderPage();
      const activity = TestBed.inject(SlotActivityStore);
      activity.add(12);
      await waitFor(() => expect(screen.getByText('12')).toBeVisible());
      expect(screen.queryByText('No slots generated yet')).not.toBeInTheDocument();
      activity.reset();
      activity.add(0);
      await waitFor(() => expect(screen.getByText('0')).toBeVisible());
    });
  });

  it('reloads both lists when the backend recovers from an outage', async () => {
    await renderPage();
    await screen.findByRole('link', { name: 'Active branches: 0 of 0' });
    const before = state.requests.length;
    seedSchedule({ name: 'Late' });
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    expect(await screen.findByRole('link', { name: 'Active branches: 1 of 1' })).toBeVisible();
    expect(state.requests.length).toBe(before + 2);
  });
});
