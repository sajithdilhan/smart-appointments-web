import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';
import { SessionStore } from '../../../core/auth/session.store';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { FieldA11yDirective } from '../../../shared/forms/field-a11y.directive';
import { createFieldView } from '../../../shared/forms/field-view';
import { focusFirstInvalid } from '../../../shared/forms/focus-first-invalid';
import { FormAlertComponent } from '../../../shared/forms/form-alert.component';
import { FormFieldComponent } from '../../../shared/forms/form-field.component';
import { normalizePhone } from '../../../shared/forms/phone';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { AuthLayoutComponent } from '../auth/auth-layout.component';
import { Outcome, toAppError } from '../auth/outcome';
import { PasswordFieldComponent } from '../auth/password-field.component';
import { evaluatePasswordRules } from '../validation/password-rules';
import { PasswordChecklistComponent } from './password-checklist.component';
import { EMAIL_TAKEN_MESSAGE, mapRegisterError } from './register-error';
import { createRegisterForm, REGISTER_MESSAGES } from './register.form';

interface ErrorAlert {
  message: string;
  reference: string | null;
}

@Component({
  selector: 'app-register-page',
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
    PasswordChecklistComponent,
    RateLimitNotice,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.page.html',
})
export class RegisterPage {
  /** Query parameter, bound by `withComponentInputBinding()`; only carried on if it is safe. */
  readonly returnUrl = input<unknown>();

  private readonly session = inject(SessionStore);
  private readonly authApi = inject(AuthApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = createRegisterForm();
  protected readonly pending = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorAlert = signal<ErrorAlert | null>(null);
  protected readonly emailTaken = signal<string | null>(null);
  protected readonly takenEmail = signal('');
  protected readonly countdown = createRetryCountdown();
  protected readonly checklistId = 'register-password-checklist';

  /** Booleans and labels only: the password string never leaves its form control. */
  protected readonly passwordResults = toSignal(
    this.form.controls.password.valueChanges.pipe(
      startWith(''),
      map((value) => evaluatePasswordRules(value)),
    ),
    { requireSync: true },
  );

  private view(id: string, key: keyof typeof REGISTER_MESSAGES) {
    return createFieldView({
      id: `register-${id}`,
      control: this.form.controls[key],
      messages: REGISTER_MESSAGES[key],
      submitAttempted: this.submitAttempted,
      ...(key === 'email' ? { serverError: this.emailTaken } : {}),
      ...(key === 'phoneNumber' ? { hint: true } : {}),
      ...(key === 'password' ? { extraDescribedBy: [this.checklistId] } : {}),
    });
  }

  protected readonly firstNameView = this.view('first-name', 'firstName');
  protected readonly lastNameView = this.view('last-name', 'lastName');
  protected readonly emailView = this.view('email', 'email');
  protected readonly phoneView = this.view('phone', 'phoneNumber');
  protected readonly passwordView = this.view('password', 'password');

  /** Only a `returnUrl` that passed `safeReturnUrl` is ever carried across the link. */
  protected readonly safeReturn = computed(() => safeReturnUrl(this.returnUrl()));

  private readonly alertRegion = viewChild.required<FormAlertComponent>('alertRegion');

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
    this.emailTaken.set(null);
    const v = this.form.getRawValue();
    const body = {
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      email: v.email.trim(),
      phoneNumber: normalizePhone(v.phoneNumber),
      password: v.password,
    };

    try {
      await firstValueFrom(this.authApi.register(body));
    } catch (e) {
      this.apply(mapRegisterError(toAppError(e)), body.email);
      this.pending.set(false);
      return;
    }

    // From here the account exists: pending stays on until the navigation, so a double click
    // or a late Enter cannot create a second request.
    try {
      await this.session.login(body.email, body.password);
    } catch {
      this.form.controls.password.reset('');
      await this.router.navigate(['/login'], {
        queryParams: { reason: 'registered', email: body.email },
        replaceUrl: true,
      });
      return;
    }
    this.form.controls.password.reset('');
    this.toast.showSuccess(`Welcome, ${body.firstName}! Your account is ready.`);
    if (!(await this.router.navigateByUrl('/book', { replaceUrl: true }))) this.pending.set(false);
  }

  private apply(outcome: Outcome, email: string): void {
    switch (outcome.kind) {
      case 'countdown':
        this.countdown.start(outcome.seconds);
        return;
      case 'field-email-taken':
        this.takenEmail.set(email);
        this.emailTaken.set(EMAIL_TAKEN_MESSAGE);
        focusFirstInvalid(this.host, this.injector);
        return;
      case 'alert':
        this.errorAlert.set({ message: outcome.message, reference: outcome.reference ?? null });
        if (outcome.focus === 'alert') {
          afterNextRender(() => this.alertRegion().focus(), { injector: this.injector });
        }
        return;
    }
  }
}
