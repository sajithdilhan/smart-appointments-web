import { Router } from '@angular/router';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../../testing/fake-session';
import { useFakeTimers } from '../../../../testing/fake-timers';
import { renderWithSession } from '../../../../testing/render-with-session';
import type { Role } from '../../../core/auth/session.model';
import { AppError } from '../../../core/http/app-error';
import { LoginPage } from './login.page';

interface Inputs {
  email?: string;
  reason?: string;
  returnUrl?: string;
}

async function setup(options: { role?: Role; inputs?: Inputs; advanceTimers?: boolean } = {}) {
  const role = options.role ?? 'Customer';
  const session = Object.assign(createFakeSession('anonymous'), { login: vi.fn() });
  session.login.mockImplementation(() => {
    session.status.set('authenticated');
    session.role.set(role);
    return Promise.resolve();
  });
  const toast = createFakeToast();
  const view = await renderWithSession(LoginPage, {
    providers: provideFakeSession(session, toast),
    componentInputs: { ...options.inputs },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const user = userEvent.setup(
    options.advanceTimers ? { advanceTimers: (ms) => void vi.advanceTimersByTime(ms) } : {},
  );
  return { ...view, session, toast, navigate, user };
}

const email = () => screen.getByLabelText(/^Email/) as HTMLInputElement;
const password = () => screen.getByLabelText(/^Password/) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /^Log in$/ });

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  e = 'ann@example.com',
  p = 'Secret1!',
) {
  if (e) await user.type(email(), e);
  if (p) await user.type(password(), p);
}

describe('LoginPage', () => {
  afterEach(() => vi.useRealTimers());

  describe('markup', () => {
    it('shows an eyebrow that is not a heading, and the decorative panel tagline', async () => {
      const { container } = await setup();
      const eyebrow = [...container.querySelectorAll('p')].find(
        (el) => el.textContent?.trim() === 'Sign in',
      );
      expect(eyebrow).toBeTruthy();
      expect(eyebrow!.closest('h1,h2,h3')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeTruthy();
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      expect(container.querySelector('aside')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('has one h1, a labelled form, the right field attributes and a register link', async () => {
      const { container } = await setup();
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeTruthy();
      expect(screen.getByRole('form', { name: 'Welcome back' })).toBeTruthy();
      expect(email().type).toBe('email');
      expect(email().getAttribute('inputmode')).toBe('email');
      expect(email().getAttribute('autocomplete')).toBe('username');
      expect(password().getAttribute('autocomplete')).toBe('current-password');
      expect(password().type).toBe('password');
      expect(container.querySelector('form')!.hasAttribute('novalidate')).toBe(true);
      expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
        '/register',
      );
    });

    it('toggles the password visibility and keeps the value', async () => {
      const { user } = await setup();
      await user.type(password(), 'Secret1!');
      await user.click(screen.getByRole('button', { name: 'Show password' }));
      expect(password().type).toBe('text');
      expect(password().value).toBe('Secret1!');
    });
  });

  describe('validation', () => {
    it.each([
      ['', '', ['Email is required.', 'Password is required.']],
      ['not-an-email', 'x', ['Enter a valid email address.']],
      ['ann@example.com', '', ['Password is required.']],
    ])('email %j password %j shows %j and makes no call', async (e, p, messages) => {
      const { user, session } = await setup();
      await fill(user, e, p);
      await user.click(submit());
      for (const message of messages) expect(await screen.findByText(message)).toBeTruthy();
      expect(session.login).not.toHaveBeenCalled();
    });

    it('focuses the first invalid field and wires aria-invalid and aria-describedby', async () => {
      const { user } = await setup();
      await user.click(submit());
      await waitFor(() => expect(document.activeElement).toBe(email()));
      expect(email().getAttribute('aria-invalid')).toBe('true');
      for (const field of [email(), password()]) {
        for (const id of field.getAttribute('aria-describedby')!.split(' ')) {
          expect(document.getElementById(id), id).not.toBeNull();
        }
        expect(field.getAttribute('aria-required')).toBe('true');
      }
    });

    it('does not apply password strength rules', async () => {
      const { user, session } = await setup();
      await fill(user, 'ann@example.com', 'a');
      await user.click(submit());
      await waitFor(() => expect(session.login).toHaveBeenCalledTimes(1));
    });
  });

  describe('submitting', () => {
    it('calls login once with the trimmed email and the untouched password', async () => {
      const { user, session } = await setup();
      await user.type(email(), '  ann@example.com  ');
      await user.type(password(), ' Secret1! ');
      await user.click(submit());
      await waitFor(() =>
        expect(session.login).toHaveBeenCalledWith('ann@example.com', ' Secret1! '),
      );
      expect(session.login).toHaveBeenCalledTimes(1);
    });

    it('is pending, busy and read-only until the navigation completes, and sends one call', async () => {
      let finishNavigation!: (ok: boolean) => void;
      const { user, session, navigate } = await setup();
      navigate.mockReturnValue(new Promise((resolve) => (finishNavigation = resolve)));
      await fill(user);
      await user.click(submit());
      await user.keyboard('{Enter}');
      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(submit().hasAttribute('disabled')).toBe(true);
      expect(submit().getAttribute('aria-busy')).toBe('true');
      expect(email().readOnly).toBe(true);
      expect(password().readOnly).toBe(true);
      email().form!.requestSubmit();
      expect(session.login).toHaveBeenCalledTimes(1);
      finishNavigation(true);
    });

    it.each<[Role, string]>([
      ['Customer', '/book'],
      ['Admin', '/admin'],
      ['Staff', '/staff'],
    ])('sends a %s to %s with replaceUrl', async (role, landing) => {
      const { user, navigate } = await setup({ role });
      await fill(user);
      await user.click(submit());
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(landing, { replaceUrl: true }));
    });

    it.each<[Role, string, string]>([
      ['Customer', '/appointments', '/appointments'],
      ['Customer', '/admin', '/book'],
      ['Admin', '/appointments', '/admin'],
      ['Customer', 'https://evil.example', '/book'],
    ])('as %s, returnUrl %s goes to %s', async (role, returnUrl, expected) => {
      const { user, navigate } = await setup({ role, inputs: { returnUrl } });
      await fill(user);
      await user.click(submit());
      await waitFor(() => expect(navigate).toHaveBeenCalledWith(expected, { replaceUrl: true }));
    });

    it('falls back to the landing route when the first navigation resolves false', async () => {
      const { user, navigate } = await setup({ inputs: { returnUrl: '/appointments' } });
      navigate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await fill(user);
      await user.click(submit());
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
      expect(navigate).toHaveBeenNthCalledWith(1, '/appointments', { replaceUrl: true });
      expect(navigate).toHaveBeenNthCalledWith(2, '/book', { replaceUrl: true });
    });

    it('re-enables the form when both navigations resolve false', async () => {
      const { user, navigate } = await setup();
      navigate.mockResolvedValue(false);
      await fill(user);
      await user.click(submit());
      await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(false));
    });

    it('never puts the password in the URL', async () => {
      const { user, navigate } = await setup();
      await fill(user, 'ann@example.com', 'Secret1!');
      await user.click(submit());
      await waitFor(() => expect(navigate).toHaveBeenCalled());
      expect(JSON.stringify(navigate.mock.calls)).not.toContain('Secret1');
    });
  });

  describe('failures', () => {
    it('401: fixed message, password cleared and focused, email kept, no toast', async () => {
      const { user, session, toast } = await setup();
      session.login.mockRejectedValue(
        new AppError(401, 'Invalid user or password.', 'unauthorized'),
      );
      await fill(user);
      await user.click(submit());
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Invalid email or password.');
      expect(alert.textContent).not.toContain('Invalid user');
      expect(email().value).toBe('ann@example.com');
      expect(password().value).toBe('');
      await waitFor(() => expect(document.activeElement).toBe(password()));
      expect(screen.queryByText('Password is required.')).toBeNull();
      expect(toast.showError).not.toHaveBeenCalled();
      expect(toast.handleError).not.toHaveBeenCalled();
    });

    it('400: shows the normalised message in the alert and focuses it', async () => {
      const { user, session } = await setup();
      session.login.mockRejectedValue(new AppError(400, 'Email is invalid.', 'http'));
      await fill(user);
      await user.click(submit());
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Email is invalid.');
      await waitFor(() => expect(document.activeElement).toBe(alert));
      expect(password().value).toBe('Secret1!');
    });

    it.each([
      [
        new AppError(503, 'x', 'unavailable'),
        'Service temporarily unavailable. Please try again in a moment.',
      ],
      [
        new AppError(0, 'Cannot reach the server. Check your connection and try again.', 'network'),
        'Cannot reach the server.',
      ],
      [new AppError(0, 'The request timed out. Try again.', 'timeout'), 'The request timed out.'],
    ])('outage %#: alert, form re-enabled, both values kept', async (error, text) => {
      const { user, session } = await setup();
      session.login.mockRejectedValue(error);
      await fill(user);
      await user.click(submit());
      expect((await screen.findByRole('alert')).textContent).toContain(text);
      expect(submit().hasAttribute('disabled')).toBe(false);
      expect(email().value).toBe('ann@example.com');
      expect(password().value).toBe('Secret1!');
    });

    it('other 5xx shows the reference', async () => {
      const { user, session } = await setup();
      session.login.mockRejectedValue(
        new AppError(500, 'Something went wrong.', 'http', 'cid-123'),
      );
      await fill(user);
      await user.click(submit());
      expect((await screen.findByRole('alert')).textContent).toContain('Reference: cid-123');
    });

    it.each([
      ['Retry-After 3', 3, 3],
      ['a missing Retry-After', undefined, 60],
    ])('429 with %s counts down and re-enables', async (_name, retryAfter, seconds) => {
      useFakeTimers();
      const { user, session } = await setup({ advanceTimers: true });
      session.login.mockRejectedValue(
        new AppError(429, 'Too many.', 'rate-limited', undefined, retryAfter),
      );
      await fill(user);
      await user.click(submit());
      expect(
        await screen.findByText(`Too many attempts. Try again in ${seconds} seconds.`, {
          selector: '[aria-hidden="true"]',
        }),
      ).toBeTruthy();
      expect(submit().hasAttribute('disabled')).toBe(true);
      expect(screen.queryByRole('alert')?.textContent ?? '').not.toContain('Invalid');
      await vi.advanceTimersByTimeAsync(seconds * 1000 - 500);
      expect(submit().hasAttribute('disabled')).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(false));
      expect(
        screen.getByText('You can try again now.', { selector: '[aria-hidden="true"]' }),
      ).toBeTruthy();
      expect(session.login).toHaveBeenCalledTimes(1);
    });
  });

  describe('route inputs', () => {
    it('prefills the email silently and shows no notice for email alone', async () => {
      await setup({ inputs: { email: 'new@example.com' } });
      await waitFor(() => expect(email().value).toBe('new@example.com'));
      expect(screen.queryByText(/account was created/)).toBeNull();
    });

    it('reason=registered shows the notice and focuses the password', async () => {
      await setup({ inputs: { reason: 'registered', email: 'new@example.com' } });
      expect(await screen.findByText('Your account was created. Log in to continue.')).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(password()));
      expect(email().value).toBe('new@example.com');
    });

    it('reason=session-expired shows its notice', async () => {
      await setup({ inputs: { reason: 'session-expired' } });
      expect(await screen.findByText('Your session has ended. Log in again.')).toBeTruthy();
    });

    it('ignores an unknown reason', async () => {
      const { container } = await setup({ inputs: { reason: '<b>x</b>' } });
      expect(container.querySelector('b')).toBeNull();
      expect(screen.queryByText(/account was created|session has ended/)).toBeNull();
    });

    it('limits a prefilled email to 254 characters', async () => {
      await setup({ inputs: { email: 'a'.repeat(300) } });
      await waitFor(() => expect(email().value).toHaveLength(254));
    });
  });

  describe('register link', () => {
    it('carries a safe returnUrl', async () => {
      await setup({ inputs: { returnUrl: '/appointments' } });
      expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
        '/register?returnUrl=%2Fappointments',
      );
    });

    it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)'])(
      'drops the rejected returnUrl %s',
      async (returnUrl) => {
        await setup({ inputs: { returnUrl } });
        expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
          '/register',
        );
      },
    );
  });
});
