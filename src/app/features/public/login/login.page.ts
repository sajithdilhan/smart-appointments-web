import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { landingRouteFor } from '../../../core/auth/landing';
import { resolvePostLoginTarget } from '../../../core/auth/post-login-target';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';
import { SessionStore } from '../../../core/auth/session.store';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { FieldA11yDirective } from '../../../shared/forms/field-a11y.directive';
import { createFieldView } from '../../../shared/forms/field-view';
import { focusFirstInvalid } from '../../../shared/forms/focus-first-invalid';
import { FormAlertComponent } from '../../../shared/forms/form-alert.component';
import { FormFieldComponent } from '../../../shared/forms/form-field.component';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { AuthLayoutComponent } from '../auth/auth-layout.component';
import { Outcome, toAppError } from '../auth/outcome';
import { PasswordFieldComponent } from '../auth/password-field.component';
import { createLoginForm, LOGIN_MESSAGES } from './login.form';
import { mapLoginError } from './login-error';

interface ErrorAlert {
  message: string;
  reference: string | null;
}

const EMAIL_MAX = 254;

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIcon,
    HlmButton,
    HlmInput,
    AuthLayoutComponent,
    FocusHeadingDirective,
    FieldA11yDirective,
    FormFieldComponent,
    FormAlertComponent,
    PasswordFieldComponent,
    RateLimitNotice,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
})
export class LoginPage {
  /** Query parameters, bound by `withComponentInputBinding()`. */
  readonly email = input<unknown>();
  readonly reason = input<unknown>();
  readonly returnUrl = input<unknown>();

  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = createLoginForm();
  protected readonly pending = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorAlert = signal<ErrorAlert | null>(null);
  protected readonly countdown = createRetryCountdown();

  protected readonly emailView = createFieldView({
    id: 'login-email',
    control: this.form.controls.email,
    messages: LOGIN_MESSAGES.email,
    submitAttempted: this.submitAttempted,
  });
  protected readonly passwordView = createFieldView({
    id: 'login-password',
    control: this.form.controls.password,
    messages: LOGIN_MESSAGES.password,
    submitAttempted: this.submitAttempted,
  });

  protected readonly notice = computed(() => {
    switch (this.reason()) {
      case 'registered':
        return 'Your account was created. Log in to continue.';
      case 'session-expired':
        return 'Your session has ended. Log in again.';
      default:
        return null;
    }
  });

  /** Only a `returnUrl` that passed `safeReturnUrl` is ever carried across the link. */
  protected readonly safeReturn = computed(() => safeReturnUrl(this.returnUrl()));

  private readonly passwordField = viewChild.required(PasswordFieldComponent);
  private readonly alertRegion = viewChild.required<FormAlertComponent>('alertRegion');

  constructor() {
    effect(() => {
      const email = this.email();
      const registered = this.reason() === 'registered';
      untracked(() => {
        if (typeof email !== 'string' || email === '') return;
        this.form.controls.email.setValue(email.slice(0, EMAIL_MAX));
        // The heading focuses itself after the render; wait one render more so the password wins.
        if (registered) {
          afterNextRender(
            () => afterNextRender(() => this.passwordField().focus(), { injector: this.injector }),
            { injector: this.injector },
          );
        }
      });
    });
  }

  protected async submit(): Promise<void> {
    if (this.pending()) return;
    this.submitAttempted.set(true);
    if (this.form.invalid) {
      focusFirstInvalid(this.host, this.injector);
      return;
    }
    if (this.countdown.active()) return;

    this.pending.set(true);
    this.errorAlert.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await this.session.login(email.trim(), password);
    } catch (e) {
      this.apply(mapLoginError(toAppError(e)));
      this.pending.set(false);
      return;
    }

    // Pending stays on until the navigation completes, so a late Enter cannot log in twice.
    const role = this.session.role()!;
    const target = resolvePostLoginTarget(role, this.returnUrl());
    if (await this.router.navigateByUrl(target, { replaceUrl: true })) return;
    if (await this.router.navigateByUrl(landingRouteFor(role), { replaceUrl: true })) return;
    this.pending.set(false);
  }

  private apply(outcome: Outcome): void {
    if (outcome.kind === 'countdown') {
      this.countdown.start(outcome.seconds);
      return;
    }
    if (outcome.kind !== 'alert') return;
    this.errorAlert.set({ message: outcome.message, reference: outcome.reference ?? null });
    if (outcome.focus === 'password') {
      // A rejected login clears the password; the form was already submitted once, so the
      // empty field must not read as a fresh "required" error.
      this.form.controls.password.reset('');
      this.submitAttempted.set(false);
      afterNextRender(() => this.passwordField().focus(), { injector: this.injector });
    } else if (outcome.focus === 'alert') {
      afterNextRender(() => this.alertRegion().focus(), { injector: this.injector });
    }
  }
}
