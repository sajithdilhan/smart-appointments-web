import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import type { Role } from '../../../core/auth/session.model';
import { UserMenu } from './user-menu';

async function setup(role: Role) {
  const session = createFakeSession('authenticated', role);
  await render(UserMenu, { providers: [provideRouter([]), ...provideFakeSession(session)] });
  return { session, user: userEvent.setup() };
}

describe('UserMenu', () => {
  it('shows the display name on an accessibly named trigger', async () => {
    await setup('Customer');
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger.textContent).toContain('Ann Example');
  });

  it('opens with Profile and Sign out for a customer', async () => {
    const { user } = await setup('Customer');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
  });

  it('offers only Sign out to an admin', async () => {
    const { user } = await setup('Admin');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Profile' })).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const { user } = await setup('Staff');
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    await screen.findByRole('menuitem', { name: 'Sign out' });
    // The CDK menu reads the legacy keyCode, which user-event's {Escape} does not set.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', keyCode: 27 });
    await vi.waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('calls logout on Sign out', async () => {
    const { user, session } = await setup('Customer');
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledOnce();
  });
});
