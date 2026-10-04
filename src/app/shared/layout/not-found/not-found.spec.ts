import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { routes } from '../../../app.routes';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { stubViewport } from '../../../../testing/stub-viewport';
import { AppTitleStrategy } from '../../../core/routing/app-title.strategy';
import type { Role } from '../../../core/auth/session.model';
import { App } from '../../../app';

async function open(role: Role | null, url: string) {
  stubViewport(1280);
  const session = createFakeSession(role ? 'authenticated' : 'anonymous', role);
  const view = await render(App, {
    providers: [
      provideRouter(routes),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
      ...provideFakeSession(session),
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  await screen.findByRole('heading', { level: 1, name: 'Page not found' });
  return { ...view, session, user: userEvent.setup() };
}

const robots = () => document.head.querySelector('meta[name="robots"]');

describe('not-found page', () => {
  // matchMedia stays stubbed for the whole file: the toaster reads it while it is destroyed
  // after each test, so unstubbing in afterEach would break that cleanup.

  it('renders in the public shell for an anonymous visitor, with a link home', async () => {
    await open(null, '/no/such/page');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe(
      '/',
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('renders in the customer shell with a link to /book', async () => {
    await open('Customer', '/no/such/page');
    expect(screen.getByRole('link', { name: 'My appointments' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe(
      '/book',
    );
  });

  it('renders in the admin shell with a link to /admin', async () => {
    await open('Admin', '/nowhere');
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe(
      '/admin',
    );
  });

  it('renders in the staff shell with a link to /staff', async () => {
    await open('Staff', '/nowhere');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe(
      '/staff',
    );
  });

  it('sets the document title', async () => {
    await open(null, '/nowhere');
    expect(TestBed.inject(Title).getTitle()).toBe('Page not found | Smart Appointments');
  });

  it('does not echo the requested URL into the page', async () => {
    await open(null, '/secret-token-12345?x=y');
    expect(document.body.textContent).not.toContain('secret-token-12345');
  });

  it('adds noindex while shown and removes it on leaving', async () => {
    await open(null, '/nowhere');
    expect(robots()?.getAttribute('content')).toBe('noindex');
    await TestBed.inject(Router).navigateByUrl('/');
    await vi.waitFor(() => expect(robots()).toBeNull());
  });

  it('signs a staff member out from the staff shell', async () => {
    const { user, session } = await open('Staff', '/nowhere');
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledOnce();
  });

  it('redirects a customer who opens /admin instead of showing the 404', async () => {
    stubViewport(1280);
    const session = createFakeSession('authenticated', 'Customer');
    await render(App, {
      providers: [
        provideRouter(routes),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
        ...provideFakeSession(session),
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin');
    expect(router.url).toBe('/book');
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
  });
});
