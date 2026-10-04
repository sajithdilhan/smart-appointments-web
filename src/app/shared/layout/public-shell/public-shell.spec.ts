import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { stubViewport } from '../../../../testing/stub-viewport';
import type { Role } from '../../../core/auth/session.model';
import { PublicShell } from './public-shell';

function renderShell(role: Role | null) {
  const session = createFakeSession(role ? 'authenticated' : 'anonymous', role);
  return render(PublicShell, {
    providers: [provideRouter([]), ...provideFakeSession(session)],
  });
}

describe('PublicShell', () => {
  beforeEach(() => {
    localStorage.clear();
    stubViewport(1280);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has the skip link as the first focusable element, then the name link', async () => {
    const user = userEvent.setup();
    await renderShell(null);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Skip to content' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Smart Appointments' }));
  });

  it('moves focus to the main landmark when the skip link is used', async () => {
    const user = userEvent.setup();
    await renderShell(null);
    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('has one main landmark with the expected id, one labelled nav and a footer', async () => {
    await renderShell(null);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main').id).toBe('main-content');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Account' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });

  it('offers Sign in and Create account to an anonymous visitor', async () => {
    await renderShell(null);
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/register',
    );
    expect(screen.queryByRole('link', { name: 'Go to my dashboard' })).toBeNull();
  });

  it.each([
    ['Customer', '/book'],
    ['Admin', '/admin'],
    ['Staff', '/staff'],
  ] as const)('offers "Go to my dashboard" to a signed-in %s', async (role, href) => {
    await renderShell(role);
    expect(screen.getByRole('link', { name: 'Go to my dashboard' }).getAttribute('href')).toBe(
      href,
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('contains the theme toggle', async () => {
    await renderShell(null);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
  });
});
