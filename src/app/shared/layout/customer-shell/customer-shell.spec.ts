import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { stubViewport } from '../../../../testing/stub-viewport';
import { CustomerShell } from './customer-shell';

@Component({ selector: 'app-cs-page', template: '<h1>A page</h1>' })
class Page {}

async function renderShell(width: number) {
  localStorage.clear();
  stubViewport(width);
  const session = createFakeSession('authenticated', 'Customer');
  const view = await render(CustomerShell, {
    providers: [
      provideRouter([
        { path: 'book', component: Page },
        { path: 'appointments', component: Page },
        { path: 'appointments/:id', component: Page },
        { path: 'profile', component: Page },
      ]),
      ...provideFakeSession(session),
    ],
  });
  return { ...view, session };
}

const LINKS = ['Book', 'My appointments', 'Profile'];

describe('CustomerShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the bottom tab bar and no top links below 768 px', async () => {
    const { container } = await renderShell(500);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('bottom-0');
    for (const name of LINKS) expect(screen.getByRole('link', { name })).toBeTruthy();
    expect(container.querySelectorAll('header nav')).toHaveLength(0);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });

  it('gives the bottom tabs touch targets of at least 44 px and pads the content', async () => {
    await renderShell(500);
    for (const name of LINKS) {
      expect(screen.getByRole('link', { name }).className).toMatch(/min-h-14/);
    }
    expect(screen.getByRole('main').className).toContain(
      'pb-[calc(4rem+env(safe-area-inset-bottom))]',
    );
  });

  it('shows the links in the top bar and no bottom bar from 768 px', async () => {
    const { container } = await renderShell(1024);
    expect(container.querySelectorAll('header nav')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main' }).className).not.toContain('fixed');
    for (const name of LINKS) expect(screen.getByRole('link', { name })).toBeTruthy();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('main').className).not.toContain('pb-[calc');
  });

  it.each([500, 1024])('marks the active link with aria-current="page" at %i px', async (width) => {
    await renderShell(width);
    await TestBed.inject(Router).navigateByUrl('/appointments/7');
    await vi.waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'My appointments' }).getAttribute('aria-current'),
      ).toBe('page'),
    );
    expect(screen.getByRole('link', { name: 'Book' }).getAttribute('aria-current')).toBeNull();
  });

  it('has one main landmark, the skip link first, and renders the routed page inside it', async () => {
    const user = userEvent.setup();
    await renderShell(1024);
    await TestBed.inject(Router).navigateByUrl('/book');
    expect(await screen.findByRole('heading', { name: 'A page' })).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Skip to content' }));
  });

  it.each([500, 1024])('signs out through the user menu at %i px', async (width) => {
    const user = userEvent.setup();
    const { session } = await renderShell(width);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledOnce();
  });

  it('contains the theme toggle', async () => {
    await renderShell(1024);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
  });
});
