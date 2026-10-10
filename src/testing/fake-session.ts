import { computed, signal, type Provider, type WritableSignal } from '@angular/core';
import type { Role, SessionStatus } from '../app/core/auth/session.model';
import { SessionStore, type Profile, type ProfileStatus } from '../app/core/auth/session.store';
import { ToastService } from '../app/core/notify/toast.service';

/** A signal-based stand-in for `SessionStore` with the surface the shells and guards read. */
export interface FakeSession {
  status: WritableSignal<SessionStatus>;
  role: WritableSignal<Role | null>;
  profile: WritableSignal<Profile | null>;
  profileStatus: WritableSignal<ProfileStatus>;
  displayName: WritableSignal<string>;
  user: WritableSignal<{ email: string } | null>;
  isAuthenticated: () => boolean;
  settled: () => Promise<void>;
  logout: ReturnType<typeof vi.fn>;
  reloadProfile: ReturnType<typeof vi.fn>;
  loadProfile: ReturnType<typeof vi.fn>;
  /** No bearer: lets a spec use the real HTTP pipeline with a fake session. */
  accessTokenForRequest: () => Promise<string | null>;
}

export function createFakeSession(status: SessionStatus, role: Role | null = null): FakeSession {
  const statusSignal = signal(status);
  return {
    status: statusSignal,
    role: signal(role),
    profile: signal<Profile | null>(null),
    profileStatus: signal<ProfileStatus>('idle'),
    displayName: signal(role ? 'Ann Example' : ''),
    user: signal(role ? { email: 'ann@example.com' } : null),
    isAuthenticated: computed(() => statusSignal() === 'authenticated'),
    settled: () => Promise.resolve(),
    logout: vi.fn(() => Promise.resolve()),
    reloadProfile: vi.fn(() => Promise.resolve()),
    loadProfile: vi.fn(() => Promise.resolve()),
    accessTokenForRequest: () => Promise.resolve(null),
  };
}

export interface FakeToast {
  showInfo: ReturnType<typeof vi.fn>;
  showSuccess: ReturnType<typeof vi.fn>;
  showError: ReturnType<typeof vi.fn>;
  handleError: ReturnType<typeof vi.fn>;
  showSessionExpired: ReturnType<typeof vi.fn>;
}

export function createFakeToast(): FakeToast {
  return {
    showInfo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    handleError: vi.fn(),
    showSessionExpired: vi.fn(),
  };
}

export function provideFakeSession(session: FakeSession, toast = createFakeToast()): Provider[] {
  return [
    { provide: SessionStore, useValue: session },
    { provide: ToastService, useValue: toast },
  ];
}
