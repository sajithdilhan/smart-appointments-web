import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { StaffBranchStore } from '../../../core/branch/staff-branch.store';
import { StaffShell } from './staff-shell';

function renderShell(status: string, branch: { name: string; code: string } | null) {
  const store = { status: signal(status), branch: signal(branch) };
  return render(StaffShell, {
    providers: [
      provideRouter([]),
      ...provideFakeSession(createFakeSession('authenticated', 'Staff')),
      { provide: StaffBranchStore, useValue: store },
    ],
  });
}

describe('StaffShell', () => {
  it('shows the branch name and code once loaded', async () => {
    await renderShell('ready', { name: 'London Central', code: 'LDN' });
    expect(screen.getByText('London Central (LDN)')).toBeTruthy();
  });

  it('shows no branch while it loads', async () => {
    await renderShell('loading', null);
    expect(screen.queryByText(/\(LDN\)/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('shows no branch when the account is not linked', async () => {
    await renderShell('not-linked', null);
    expect(screen.queryByText(/\(/)).toBeNull();
  });
});
