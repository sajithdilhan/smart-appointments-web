import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { OutageState } from '../../../core/http/outage-state';
import { ThemeService } from '../../../core/theme/theme.service';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { ProfilePage } from './profile-page';

async function open() {
  const session = createFakeSession('authenticated', 'Customer');
  await render(ProfilePage, { providers: [provideFakeSession(session)] });
  return session;
}

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists name, email and phone from the profile, with no edit or role text', async () => {
    const session = createFakeSession('authenticated', 'Customer');
    session.profileStatus.set('ready');
    session.profile.set({
      firstName: 'Ann',
      lastName: 'Example',
      email: 'ann@example.com',
      phoneNumber: '+44 20 7946 0000',
    });
    await render(ProfilePage, { providers: [provideFakeSession(session)] });
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeTruthy();
    expect(screen.getByText('Ann Example')).toBeTruthy();
    expect(screen.getByText('ann@example.com')).toBeTruthy();
    expect(screen.getByText('+44 20 7946 0000')).toBeTruthy();
    expect(screen.queryByText(/edit|password|customer/i)).toBeNull();
  });

  it('shows a skeleton while loading but the email from the token at once', async () => {
    const session = createFakeSession('authenticated', 'Customer');
    session.profileStatus.set('loading');
    await render(ProfilePage, { providers: [provideFakeSession(session)] });
    expect(screen.getAllByText('Loading')).toHaveLength(2);
    expect(screen.getByText('ann@example.com')).toBeTruthy();
  });

  it('renders "Not provided" for an empty phone', async () => {
    const session = createFakeSession('authenticated', 'Customer');
    session.profileStatus.set('ready');
    session.profile.set({
      firstName: 'Ann',
      lastName: 'E',
      email: 'ann@example.com',
      phoneNumber: null,
    });
    await render(ProfilePage, { providers: [provideFakeSession(session)] });
    expect(screen.getByText('Not provided')).toBeTruthy();
  });

  it('shows an error with Try again, which reloads, and reloads once on recovery', async () => {
    const user = userEvent.setup();
    const session = createFakeSession('authenticated', 'Customer');
    session.profileStatus.set('error');
    await render(ProfilePage, { providers: [provideFakeSession(session)] });
    expect(screen.getByRole('alert').textContent).toContain("couldn't load");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(session.reloadProfile).toHaveBeenCalledTimes(1);
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    TestBed.tick();
    expect(session.reloadProfile).toHaveBeenCalledTimes(2);
  });

  it('does not reload on recovery when there is no error', async () => {
    const session = createFakeSession('authenticated', 'Customer');
    session.profileStatus.set('ready');
    await render(ProfilePage, { providers: [provideFakeSession(session)] });
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    TestBed.tick();
    expect(session.reloadProfile).not.toHaveBeenCalled();
  });

  it('has a theme radio group in sync with ThemeService', async () => {
    const user = userEvent.setup();
    await open();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      (screen.getByRole('radio', { name: 'System' }) as HTMLInputElement).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('dark');
    theme.set('light');
    TestBed.tick();
    await Promise.resolve();
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  });

  it('signs out through the session store', async () => {
    const user = userEvent.setup();
    const session = await open();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledTimes(1);
  });
});
