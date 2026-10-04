import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { stubViewport } from '../../../../testing/stub-viewport';
import { PaletteLauncher } from '../../../core/ui/palette-launcher';
import { safeRemove } from '../../../core/util/safe-storage';
import { AdminShell, SIDEBAR_KEY } from './admin-shell';

@Component({ selector: 'app-as-page', template: '' })
class Page {}

const routes: Routes = [
  {
    path: 'admin',
    data: { breadcrumb: 'Admin' },
    children: [
      { path: '', pathMatch: 'full', data: { breadcrumb: 'Dashboard' }, component: Page },
      { path: 'branches', data: { breadcrumb: 'Branches' }, component: Page },
      { path: 'services', data: { breadcrumb: 'Services' }, component: Page },
      { path: 'slots', data: { breadcrumb: 'Slot generation' }, component: Page },
    ],
  },
];

async function renderShell(width: number) {
  stubViewport(width);
  const session = createFakeSession('authenticated', 'Admin');
  const view = await render(AdminShell, {
    providers: [provideRouter(routes), ...provideFakeSession(session)],
  });
  return { ...view, session, user: userEvent.setup() };
}

const toggle = () => screen.getByRole('button', { name: 'Toggle sidebar' });
const sidebar = () => document.getElementById('admin-sidebar')!;

describe('AdminShell', () => {
  beforeEach(() => {
    localStorage.clear();
    safeRemove(SIDEBAR_KEY); // the in-memory copy is shared by the whole test run
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('from 1024 px', () => {
    it('shows the labelled admin navigation with the four destinations', async () => {
      await renderShell(1280);
      const nav = screen.getByRole('navigation', { name: 'Admin' });
      for (const name of ['Dashboard', 'Branches', 'Services', 'Slot generation']) {
        expect(within(nav).getByRole('link', { name })).toBeTruthy();
      }
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });

    it('collapses to icons and expands again, with aria-expanded and aria-controls', async () => {
      const { user } = await renderShell(1280);
      expect(toggle().getAttribute('aria-controls')).toBe('admin-sidebar');
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(sidebar().className).toContain('w-60');
      await user.click(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(sidebar().className).toContain('w-14');
      expect(screen.getByRole('link', { name: 'Branches' }).getAttribute('title')).toBe('Branches');
      expect(screen.queryByText('Slot generation')).toBeNull();
      await user.click(toggle());
      expect(sidebar().className).toContain('w-60');
    });

    it('persists the collapsed state across a re-render', async () => {
      const first = await renderShell(1280);
      await first.user.click(toggle());
      expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1');
      first.fixture.destroy();
      TestBed.resetTestingModule();
      await renderShell(1280);
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(sidebar().className).toContain('w-14');
    });

    it('survives a throwing localStorage', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const { user } = await renderShell(1280);
      await user.click(toggle());
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('marks only the current destination with aria-current', async () => {
      await renderShell(1280);
      await TestBed.inject(Router).navigateByUrl('/admin/branches');
      await vi.waitFor(() =>
        expect(screen.getByRole('link', { name: 'Branches' }).getAttribute('aria-current')).toBe(
          'page',
        ),
      );
      expect(
        screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current'),
      ).toBeNull();
    });
  });

  describe('below 1024 px', () => {
    it('has no sidebar toggle or inline navigation until the drawer opens', async () => {
      await renderShell(600);
      expect(screen.queryByRole('button', { name: 'Toggle sidebar' })).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeTruthy();
    });

    it('opens the drawer, closes it on Escape and returns focus to the toggle', async () => {
      const { user } = await renderShell(600);
      const opener = screen.getByRole('button', { name: 'Open navigation menu' });
      await user.click(opener);
      expect(await screen.findByRole('navigation', { name: 'Admin' })).toBeTruthy();
      expect(opener.getAttribute('aria-expanded')).toBe('true');
      await user.keyboard('{Escape}');
      await vi.waitFor(() =>
        expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull(),
      );
      expect(document.activeElement).toBe(opener);
    });

    it('closes the drawer on navigation', async () => {
      const { user } = await renderShell(600);
      await user.click(screen.getByRole('button', { name: 'Open navigation menu' }));
      const nav = await screen.findByRole('navigation', { name: 'Admin' });
      await user.click(within(nav).getByRole('link', { name: 'Services' }));
      await vi.waitFor(() =>
        expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull(),
      );
      expect(TestBed.inject(Router).url).toBe('/admin/services');
    });
  });

  describe('breadcrumbs', () => {
    it.each([
      ['/admin', ['Dashboard']],
      ['/admin/branches', ['Admin', 'Branches']],
      ['/admin/services', ['Admin', 'Services']],
      ['/admin/slots', ['Admin', 'Slot generation']],
    ])('on %s shows %j', async (url, expected) => {
      await renderShell(1280);
      await TestBed.inject(Router).navigateByUrl(url);
      await vi.waitFor(() => {
        const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
        const labels = Array.from(trail.querySelectorAll('li:not([role="presentation"])')).map(
          (li) => li.textContent?.trim(),
        );
        expect(labels).toEqual(expected);
      });
      const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
      expect(trail.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(
        expected.at(-1),
      );
    });
  });

  describe('palette button', () => {
    it('is absent while the palette is not available', async () => {
      await renderShell(1280);
      expect(screen.queryByRole('button', { name: /search or jump to/i })).toBeNull();
    });

    it('shows with a kbd hint when available and counts a request per click', async () => {
      const { user } = await renderShell(1280);
      const launcher = TestBed.inject(PaletteLauncher);
      launcher.available.set(true);
      const button = await screen.findByRole('button', { name: /search or jump to/i });
      expect(button.querySelector('kbd')).not.toBeNull();
      await user.click(button);
      await user.click(button);
      expect(launcher.requests()).toBe(2);
    });

    it('is icon-only below 640 px', async () => {
      await renderShell(500);
      TestBed.inject(PaletteLauncher).available.set(true);
      const button = await screen.findByRole('button', { name: 'Search or jump to' });
      expect(button.querySelector('kbd')).toBeNull();
    });

    it('is never made available by the shell itself', async () => {
      await renderShell(1280);
      expect(TestBed.inject(PaletteLauncher).available()).toBe(false);
    });
  });

  it('has the skip link first and signs out through the user menu', async () => {
    const { user, session } = await renderShell(1280);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Skip to content' }));
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledOnce();
  });
});
