import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createBranchDayBackend } from '../../../testing/branch-day-backend';
import { provideBranchDayApi } from '../../../testing/branch-day-test-setup';
import { createFakeSession, provideFakeSession } from '../../../testing/fake-session';
import { BRANCH_ID } from '../../../testing/make-appointment';
import { server } from '../../../testing/server';
import { OutageState } from '../../core/http/outage-state';
import { NOT_LINKED_MESSAGE, StaffGate } from './staff-gate.component';

@Component({ selector: 'app-sg-probe', template: '<p>day page</p>' })
class Probe {}

const OTHER_ID = '00000000-0000-4000-8000-0000000000b2';

async function setup(branchId: string | null = BRANCH_ID) {
  const backend = createBranchDayBackend();
  server.use(...backend.handlers);
  const session = createFakeSession('authenticated', 'Staff');
  session.user.set({
    email: 'staff@example.com',
    ...(branchId ? { branchId } : {}),
  } as never);
  const view = await render(StaffGate, {
    providers: [
      provideRouter([{ path: '', component: Probe }]),
      ...provideBranchDayApi(),
      ...provideFakeSession(session),
    ],
  });
  await TestBed.inject(Router).navigateByUrl('/');
  const dayRequests = () =>
    backend.state.requests.filter((r) => r.path.toLowerCase().includes('/appointments'));
  return { ...view, backend, session, dayRequests, user: userEvent.setup() };
}

describe('StaffGate', () => {
  it('shows a loading state, then the routed page once the branch is known', async () => {
    const { backend } = await setup();
    expect(screen.getByRole('status', { name: 'Loading your branch' })).toBeTruthy();
    expect(await screen.findByText('day page')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading your branch' })).toBeNull();
    expect(backend.state.requests).toHaveLength(1);
  });

  it('shows the not-linked message with Sign out and no page when the token has no branch', async () => {
    const { session, backend, user, dayRequests } = await setup(null);
    expect(await screen.findByText(NOT_LINKED_MESSAGE)).toBeTruthy();
    expect(NOT_LINKED_MESSAGE).toBe(
      'Your account is not linked to an active branch. Ask an administrator to check your branch.',
    );
    expect(screen.queryByText('day page')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.logout).toHaveBeenCalledTimes(1);
    expect(backend.state.requests).toEqual([]);
    expect(dayRequests()).toEqual([]);
  });

  it('shows the same message when the branch is unknown (404) and requests no appointments', async () => {
    const { dayRequests } = await setup(OTHER_ID);
    expect(await screen.findByText(NOT_LINKED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('day page')).toBeNull();
    expect(dayRequests()).toEqual([]);
  });
});

describe('StaffGate failures', () => {
  async function failing() {
    const backend = createBranchDayBackend();
    backend.flags.networkError = true;
    server.use(...backend.handlers);
    const session = createFakeSession('authenticated', 'Staff');
    session.user.set({ email: 'staff@example.com', branchId: BRANCH_ID } as never);
    const view = await render(StaffGate, {
      providers: [
        provideRouter([{ path: '', component: Probe }]),
        ...provideBranchDayApi(),
        ...provideFakeSession(session),
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/');
    return { ...view, backend, user: userEvent.setup() };
  }

  it('shows the error state with Retry for a network failure, then the page after Retry', async () => {
    const { backend, user } = await failing();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('day page')).toBeNull();
    backend.flags.networkError = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('day page')).toBeTruthy();
  });

  it('retries by itself when the outage recovers', async () => {
    const { backend } = await failing();
    await screen.findByRole('alert');
    backend.flags.networkError = false;
    TestBed.inject(OutageState).recovered.update((n) => n + 1);
    expect(await screen.findByText('day page')).toBeTruthy();
  });
});
