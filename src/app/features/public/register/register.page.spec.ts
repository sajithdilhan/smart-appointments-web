import type { Provider } from '@angular/core';
import { Router } from '@angular/router';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { throwError } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
} from '../../../../testing/fake-session';
import { useFakeTimers } from '../../../../testing/fake-timers';
import { renderWithSession, TEST_API_BASE } from '../../../../testing/render-with-session';
import { server } from '../../../../testing/server';
import { AppError } from '../../../core/http/app-error';
import { RegisterPage } from './register.page';

const REGISTER_URL = `${TEST_API_BASE}/api/Auth/register`;
const PROBLEM = { 'Content-Type': 'application/problem+json' };

interface Inputs {
  returnUrl?: string;
}

/** Captures what the page POSTs and answers like the backend (201 unless overridden). */
function captureRegister(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json(
      { userId: 'u1', email: 'ann@example.com', role: 'Customer' },
      { status: 201 },
    ),
) {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(REGISTER_URL, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return respond();
    }),
  );
  return bodies;
}

async function setup(
  options: { inputs?: Inputs; advanceTimers?: boolean; providers?: Provider[] } = {},
) {
  const session = Object.assign(createFakeSession('anonymous'), { login: vi.fn() });
  session.login.mockResolvedValue(undefined);
  const toast = createFakeToast();
  const view = await renderWithSession(RegisterPage, {
    providers: [...provideFakeSession(session, toast), ...(options.providers ?? [])],
    componentInputs: { ...options.inputs },
  });
  const router = view.fixture.debugElement.injector.get(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const user = userEvent.setup(
    options.advanceTimers ? { advanceTimers: (ms) => void vi.advanceTimersByTime(ms) } : {},
  );
  return { ...view, session, toast, navigateByUrl, navigate, user };
}

type User = ReturnType<typeof userEvent.setup>;

const first = () => screen.getByLabelText(/^First name/) as HTMLInputElement;
const last = () => screen.getByLabelText(/^Last name/) as HTMLInputElement;
const email = () => screen.getByLabelText(/^Email/) as HTMLInputElement;
const phone = () => screen.getByLabelText(/^Phone number/) as HTMLInputElement;
const password = () => screen.getByLabelText(/^Password/) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: 'Create account' });

async function fillValid(user: User, overrides: Partial<Record<string, string>> = {}) {
  const v = {
    first: ' Ann ',
    last: 'Example',
    email: ' ann@example.com ',
    phone: '(415) 555-0123',
    password: 'Abcdefg1!',
    ...overrides,
  };
  await user.type(first(), v.first);
  await user.type(last(), v.last);
  await user.type(email(), v.email);
  await user.type(phone(), v.phone);
  await user.type(password(), v.password);
}

describe('RegisterPage', () => {
  afterEach(() => vi.useRealTimers());

  describe('markup', () => {
    it('shows an eyebrow that is not a heading, and the decorative panel tagline', async () => {
      const { container } = await setup();
      const eyebrow = [...container.querySelectorAll('p')].find(
        (el) => el.textContent?.trim() === 'Create account',
      );
      expect(eyebrow).toBeTruthy();
      expect(eyebrow!.closest('h1,h2,h3')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Create account' })).toBeNull();
      expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeTruthy();
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      expect(container.querySelector('aside')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('has one h1, a labelled form, the fields in order with their autocomplete tokens', async () => {
      const { container } = await setup();
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      expect(screen.getByRole('form', { name: 'Create your account' })).toBeTruthy();
      const inputs = [...container.querySelectorAll('form input')] as HTMLInputElement[];
      expect(inputs.map((i) => i.autocomplete)).toEqual([
        'given-name',
        'family-name',
        'email',
        'tel',
        'new-password',
      ]);
      expect(inputs.map((i) => i.id)).toEqual([
        'register-first-name',
        'register-last-name',
        'register-email',
        'register-phone',
        'register-password',
      ]);
      expect(first().getAttribute('maxlength')).toBe('50');
      expect(last().getAttribute('maxlength')).toBe('50');
      expect(phone().type).toBe('tel');
      expect(phone().getAttribute('inputmode')).toBe('tel');
      expect(email().type).toBe('email');
      expect(container.querySelector('form')!.hasAttribute('novalidate')).toBe(true);
    });

    it('has no role field and no checkbox', async () => {
      const { container } = await setup();
      expect(container.querySelector('select, [type="checkbox"], [name="role"]')).toBeNull();
      expect(screen.queryByLabelText(/role/i)).toBeNull();
    });

    it('describes the phone by its hint and the password by the checklist', async () => {
      await setup();
      const hint = screen.getByText('International format, for example +14155550123');
      expect(phone().getAttribute('aria-describedby')).toBe(hint.id);
      expect(password().getAttribute('aria-describedby')).toBe('register-password-checklist');
      expect(document.getElementById('register-password-checklist')).not.toBeNull();
    });

    it('links to /login and carries only a safe returnUrl', async () => {
      await setup({ inputs: { returnUrl: '/appointments' } });
      expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
        '/login?returnUrl=%2Fappointments',
      );
    });

    it.each(['https://evil.example', '//evil.example'])('drops returnUrl %s', async (returnUrl) => {
      await setup({ inputs: { returnUrl } });
      expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
    });

    it('updates the checklist on every keystroke without a live region on the list', async () => {
      const { user } = await setup();
      const list = document.getElementById('register-password-checklist')!;
      expect(list.getAttribute('aria-live')).toBeNull();
      await user.type(password(), 'Abcdefg1_');
      expect(list.textContent).toContain('One special character');
      expect(list.querySelectorAll('.sr-only')).toHaveLength(5);
      expect([...list.querySelectorAll('.sr-only')].map((n) => n.textContent)).toEqual([
        ', met',
        ', met',
        ', met',
        ', met',
        ', not met',
      ]);
      await user.type(password(), '!');
      await waitFor(() =>
        expect(
          screen.getByText('All password requirements met', { selector: '[role=status]' }),
        ).toBeTruthy(),
      );
    });
  });

  describe('validation', () => {
    it('shows every message, makes no request and focuses the first invalid field', async () => {
      const { user, session } = await setup();
      const bodies = captureRegister();
      await user.click(submit());
      for (const message of [
        'First name is required.',
        'Last name is required.',
        'Email is required.',
        'Phone number is required.',
        'Password is required.',
      ]) {
        expect(await screen.findByText(message)).toBeTruthy();
      }
      await waitFor(() => expect(document.activeElement).toBe(first()));
      expect(bodies).toHaveLength(0);
      expect(session.login).not.toHaveBeenCalled();
      for (const field of [first(), last(), email(), phone(), password()]) {
        expect(field.getAttribute('aria-invalid')).toBe('true');
        for (const id of field.getAttribute('aria-describedby')!.split(' ')) {
          expect(document.getElementById(id), id).not.toBeNull();
        }
      }
    });

    it.each([
      ['email', 'nope', 'Enter a valid email address.'],
      ['phone', '0123', 'Enter the number in international format, for example +14155550123.'],
      ['password', 'Abcdefg1_', 'Password does not meet all the requirements.'],
    ])('rejects a bad %s', async (field, value, message) => {
      const { user } = await setup();
      const bodies = captureRegister();
      await fillValid(user, { [field]: value });
      await user.click(submit());
      expect(await screen.findByText(message)).toBeTruthy();
      expect(bodies).toHaveLength(0);
    });

    it('stops a name at 50 characters and accepts exactly 50', async () => {
      const { user } = await setup();
      const bodies = captureRegister();
      await fillValid(user, { first: 'a'.repeat(55) });
      expect(first().value).toHaveLength(50);
      await user.click(submit());
      await waitFor(() => expect(bodies).toHaveLength(1));
    });

    it('shows an error only after blur, and clears it once valid', async () => {
      const { user } = await setup();
      await user.type(email(), 'nope');
      expect(screen.queryByText('Enter a valid email address.')).toBeNull();
      await user.tab();
      expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
      await user.clear(email());
      await user.type(email(), 'ann@example.com');
      await waitFor(() => expect(screen.queryByText('Enter a valid email address.')).toBeNull());
    });
  });

  describe('submitting', () => {
    it('posts exactly the five keys, trimmed, with the phone normalised', async () => {
      const { user } = await setup();
      const bodies = captureRegister();
      await fillValid(user);
      await user.click(submit());
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        firstName: 'Ann',
        lastName: 'Example',
        email: 'ann@example.com',
        phoneNumber: '4155550123',
        password: 'Abcdefg1!',
      });
    });

    it('is pending, busy and read-only, and a second submit sends no second request', async () => {
      const { user, navigateByUrl } = await setup();
      let finishNavigation!: (ok: boolean) => void;
      navigateByUrl.mockReturnValue(new Promise((resolve) => (finishNavigation = resolve)));
      const bodies = captureRegister(async () => {
        await delay(20);
        return HttpResponse.json({ userId: 'u1' }, { status: 201 });
      });
      await fillValid(user);
      await user.click(submit());
      await user.keyboard('{Enter}');
      expect(submit().hasAttribute('disabled')).toBe(true);
      expect(submit().getAttribute('aria-busy')).toBe('true');
      expect(first().readOnly).toBe(true);
      expect(password().readOnly).toBe(true);
      await waitFor(() => expect(navigateByUrl).toHaveBeenCalled());
      // Still pending after the 201 until the navigation completes.
      expect(submit().hasAttribute('disabled')).toBe(true);
      email().form!.requestSubmit();
      finishNavigation(true);
      expect(bodies).toHaveLength(1);
    });

    it('logs in, toasts, empties the password and goes to /book with replaceUrl', async () => {
      const { user, session, toast, navigateByUrl, fixture } = await setup();
      captureRegister();
      await fillValid(user);
      await user.click(submit());
      await waitFor(() =>
        expect(navigateByUrl).toHaveBeenCalledWith('/book', { replaceUrl: true }),
      );
      expect(session.login).toHaveBeenCalledWith('ann@example.com', 'Abcdefg1!');
      expect(toast.showSuccess).toHaveBeenCalledWith('Welcome, Ann! Your account is ready.');
      expect(toast.showError).not.toHaveBeenCalled();
      fixture.detectChanges();
      expect(password().value).toBe('');
    });

    it('goes to /login?reason=registered&email= when the auto-login fails', async () => {
      const { user, session, toast, navigate, navigateByUrl } = await setup();
      session.login.mockRejectedValue(new AppError(503, 'x', 'unavailable'));
      captureRegister();
      await fillValid(user);
      await user.click(submit());
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(['/login'], {
          queryParams: { reason: 'registered', email: 'ann@example.com' },
          replaceUrl: true,
        }),
      );
      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(toast.showSuccess).not.toHaveBeenCalled();
      expect(JSON.stringify(navigate.mock.calls)).not.toContain('Abcdefg1');
    });
  });

  describe('failures', () => {
    it('duplicate email: message on the email field with a link, focus, no toast and no alert', async () => {
      const { user, toast, session } = await setup();
      captureRegister(() =>
        HttpResponse.json(
          { status: 400, detail: 'Email is already registered.' },
          { status: 400, headers: PROBLEM },
        ),
      );
      await fillValid(user);
      await user.click(submit());
      expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
      const link = screen.getByRole('link', { name: 'Log in instead' });
      expect(link.getAttribute('href')).toBe('/login?email=ann@example.com');
      await waitFor(() => expect(document.activeElement).toBe(email()));
      expect(email().getAttribute('aria-invalid')).toBe('true');
      expect(email().getAttribute('aria-describedby')).toContain('register-email-error');
      expect(screen.getByRole('alert').textContent).toBe('');
      expect(toast.showError).not.toHaveBeenCalled();
      expect(toast.handleError).not.toHaveBeenCalled();
      expect(session.login).not.toHaveBeenCalled();
      // Every typed value is kept, the password included.
      expect(first().value).toBe(' Ann ');
      expect(password().value).toBe('Abcdefg1!');
      // Editing the email clears the server message.
      await user.type(email(), 'x');
      await waitFor(() =>
        expect(screen.queryByText('An account with this email already exists.')).toBeNull(),
      );
    });

    it('any other 400: the detail in the alert, focused, values kept', async () => {
      const { user } = await setup();
      captureRegister(() =>
        HttpResponse.json(
          { status: 400, detail: 'Phone number is invalid.' },
          { status: 400, headers: PROBLEM },
        ),
      );
      await fillValid(user);
      await user.click(submit());
      const alert = await screen.findByText('Phone number is invalid.');
      await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')));
      expect(alert).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Log in instead' })).toBeNull();
      expect(password().value).toBe('Abcdefg1!');
      expect(submit().hasAttribute('disabled')).toBe(false);
    });

    it('offline: the network message in the alert, form re-enabled, values kept', async () => {
      const { user } = await setup();
      captureRegister(() => HttpResponse.error());
      await fillValid(user);
      await user.click(submit());
      expect((await screen.findByRole('alert')).textContent).toContain('Cannot reach the server');
      expect(submit().hasAttribute('disabled')).toBe(false);
      expect(password().value).toBe('Abcdefg1!');
      expect(email().value).toBe('ann@example.com');
    });

    it('503: the unavailable message', async () => {
      const { user } = await setup();
      captureRegister(() =>
        HttpResponse.json({ status: 503, detail: 'down' }, { status: 503, headers: PROBLEM }),
      );
      await fillValid(user);
      await user.click(submit());
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Service temporarily unavailable.',
      );
    });

    it('429: counts down from Retry-After and re-enables', async () => {
      useFakeTimers();
      const register = vi.fn(() =>
        throwError(() => new AppError(429, 'Too many.', 'rate-limited', undefined, 3)),
      );
      const { user, session } = await setup({
        advanceTimers: true,
        providers: [{ provide: AuthApiService, useValue: { register } }],
      });
      await fillValid(user);
      await user.click(submit());
      expect(
        await screen.findByText('Too many attempts. Try again in 3 seconds.', {
          selector: '[aria-hidden="true"]',
        }),
      ).toBeTruthy();
      expect(submit().hasAttribute('disabled')).toBe(true);
      await vi.advanceTimersByTimeAsync(3500);
      await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(false));
      expect(register).toHaveBeenCalledTimes(1);
      expect(session.login).not.toHaveBeenCalled();
    });
  });
});
