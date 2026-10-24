import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import type { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import {
  FieldA11yDirective,
  FormAlertComponent,
  FormFieldComponent,
  createFieldView,
  focusFirstInvalid,
  type FieldView,
} from '../../../shared/forms';
import { PasswordChecklistComponent } from '../../../shared/forms/password-checklist.component';
import { PasswordFieldComponent } from '../../../shared/forms/password-field.component';
import { evaluatePasswordRules } from '../../../shared/forms/password-rules';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { BranchesStore } from '../data/branches.store';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { restoreFocusOnDestroy } from '../shared/drawer-focus';
import { DrawerFrame } from '../shared/drawer-frame.component';
import { mapStaffSaveError } from './staff-error';
import { STAFF_FIELD_MESSAGES, createdMessage } from './staff-messages';
import { createStaffForm, staffSnapshot, toCreateBody } from './staff.form';

type FieldName = keyof typeof STAFF_FIELD_MESSAGES;

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive';

/**
 * Creates a staff account in a side drawer over the list (`/admin/staff/new`). Same flow as the
 * F5 drawers: every way out is a routed exit guarded against losing work, a successful save
 * makes the form pristine before navigating. The password is read once into the request and the
 * control is emptied as soon as the request settles; it is never kept in a signal.
 */
@Component({
  selector: 'app-staff-create-drawer',
  imports: [
    DrawerFrame,
    FieldA11yDirective,
    FormAlertComponent,
    FormFieldComponent,
    HlmButton,
    HlmInput,
    NgIcon,
    PasswordChecklistComponent,
    PasswordFieldComponent,
    RateLimitNotice,
    ReactiveFormsModule,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer-frame title="New staff member" (closeRequested)="close()">
      <form #formEl novalidate class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

        <app-form-field label="First name" [view]="views.firstName">
          <input
            hlmInput
            formControlName="firstName"
            maxlength="50"
            autocomplete="off"
            [id]="views.firstName.id"
            [appField]="views.firstName"
            [readOnly]="pending()"
          />
        </app-form-field>
        <app-form-field label="Last name" [view]="views.lastName">
          <input
            hlmInput
            formControlName="lastName"
            maxlength="50"
            autocomplete="off"
            [id]="views.lastName.id"
            [appField]="views.lastName"
            [readOnly]="pending()"
          />
        </app-form-field>
        <app-form-field label="Email" [view]="views.email">
          <input
            hlmInput
            type="email"
            inputmode="email"
            formControlName="email"
            autocomplete="off"
            [id]="views.email.id"
            [appField]="views.email"
            [readOnly]="pending()"
          />
        </app-form-field>
        <app-form-field
          label="Phone number"
          hint="International format, for example +14155550123"
          [view]="views.phoneNumber"
        >
          <input
            hlmInput
            type="tel"
            inputmode="tel"
            formControlName="phoneNumber"
            autocomplete="off"
            [id]="views.phoneNumber.id"
            [appField]="views.phoneNumber"
            [readOnly]="pending()"
          />
        </app-form-field>

        <div class="flex flex-col gap-3">
          <app-password-field
            [view]="views.password"
            [control]="form.controls.password"
            [pending]="pending()"
            autocomplete="new-password"
          />
          <app-password-checklist [id]="checklistId" [results]="passwordResults()" />
        </div>

        <app-form-field label="Branch" [view]="views.branchId">
          <select
            formControlName="branchId"
            aria-required="true"
            [class]="selectClass"
            [id]="views.branchId.id"
            [attr.aria-invalid]="views.branchId.error() ? 'true' : null"
            [attr.aria-describedby]="views.branchId.describedBy()"
          >
            <option value="">Select a branch</option>
            @for (b of branches.active(); track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </app-form-field>
        @if (noActiveBranch()) {
          <p class="-mt-2 text-sm text-muted-foreground">
            There are no active branches. Activate a branch before adding staff.
          </p>
        }

        <app-rate-limit-notice [countdown]="countdown" />

        <div class="flex flex-wrap items-center gap-2">
          <button
            hlmBtn
            type="submit"
            [disabled]="pending() || countdown.active()"
            [attr.aria-busy]="pending() ? 'true' : null"
          >
            @if (pending()) {
              <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
            }
            Create staff member
          </button>
          <button hlmBtn type="button" variant="outline" (click)="close()">Cancel</button>
        </div>
      </form>
    </app-drawer-frame>
  `,
})
export class StaffCreateDrawer implements DirtyForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly api = inject(AuthApiService);
  private readonly store = inject(StaffAccountsStore);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchesStore);

  protected readonly form = createStaffForm();
  protected readonly countdown = createRetryCountdown();
  protected readonly pending = signal(false);
  protected readonly alertMessage = signal<string | null>(null);
  protected readonly alertReference = signal<string | null>(null);
  protected readonly selectClass = SELECT;
  protected readonly checklistId = 'staff-password-checklist';

  private readonly submitAttempted = signal(false);
  private readonly serverErrors = {
    firstName: signal<string | null>(null),
    lastName: signal<string | null>(null),
    email: signal<string | null>(null),
    phoneNumber: signal<string | null>(null),
    password: signal<string | null>(null),
    branchId: signal<string | null>(null),
  };

  protected readonly views: Record<FieldName, FieldView> = {
    firstName: this.view('firstName'),
    lastName: this.view('lastName'),
    email: this.view('email'),
    phoneNumber: this.view('phoneNumber', { hint: true }),
    password: this.view('password', { extraDescribedBy: [this.checklistId] }),
    branchId: this.view('branchId'),
  };

  /** Booleans and labels only: the password string never leaves its form control. */
  protected readonly passwordResults = toSignal(
    this.form.controls.password.valueChanges.pipe(
      startWith(''),
      map((value) => evaluatePasswordRules(value)),
    ),
    { requireSync: true },
  );

  private readonly initial = staffSnapshot(this.form);
  private readonly snapshot = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => staffSnapshot(this.form)),
    ),
    { requireSync: true },
  );
  private readonly succeeded = signal(false);
  /** A saved form is not dirty any more, whatever it still shows. */
  private readonly dirty = computed(() => !this.succeeded() && this.snapshot() !== this.initial);

  protected readonly noActiveBranch = computed(
    () => this.branches.status() === 'loaded' && this.branches.active().length === 0,
  );

  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');

  constructor() {
    restoreFocusOnDestroy();
    registerBeforeUnload(this.dirty);
    if (this.branches.status() === 'idle') void this.branches.load();
  }

  isDirty(): boolean {
    return this.dirty();
  }

  close(): void {
    void this.router.navigate(['..'], {
      relativeTo: this.route,
      queryParamsHandling: 'preserve',
    });
  }

  async submit(): Promise<void> {
    if (this.pending() || this.countdown.active()) return;
    this.submitAttempted.set(true);
    this.alertMessage.set(null);
    this.alertReference.set(null);
    if (this.form.invalid) {
      focusFirstInvalid(this.formEl()!, this.injector);
      return;
    }
    const body = toCreateBody(this.form.getRawValue());
    this.pending.set(true);
    let failure: AppError | null = null;
    try {
      await firstValueFrom(this.api.createStaff(body));
    } catch (e) {
      failure = normalizeError(e);
    }
    // The password has done its job: empty the control before anything is shown or awaited.
    this.form.controls.password.reset('');
    if (failure === null) {
      this.succeeded.set(true);
      this.pending.set(false);
      this.toast.showSuccess(createdMessage(body.firstName, body.lastName));
      void this.store.reload();
      this.close();
      return;
    }
    this.pending.set(false);
    await this.handleFailure(failure);
  }

  private async handleFailure(error: AppError): Promise<void> {
    const outcome = mapStaffSaveError(error, 'create');
    switch (outcome.kind) {
      case 'offline':
      case 'forbidden':
        this.toast.handleError(error);
        break;
      case 'rate-limited':
        this.countdown.startFrom(error);
        break;
      case 'field':
        if (outcome.reloadBranches) {
          await this.branches.load({ force: true });
          const chosen = this.form.controls.branchId.value;
          if (!this.branches.active().some((b) => b.id === chosen)) {
            this.form.controls.branchId.setValue('');
          }
        }
        this.serverErrors[outcome.field].set(outcome.message);
        focusFirstInvalid(this.formEl()!, this.injector);
        break;
      case 'validation': {
        const mapped = Object.keys(outcome.fields) as FieldName[];
        for (const field of mapped) this.serverErrors[field].set(outcome.fields[field]);
        if (outcome.alert.length > 0) this.alertMessage.set(outcome.alert.join(' '));
        if (mapped.length > 0) focusFirstInvalid(this.formEl()!, this.injector);
        else this.alert()?.focus();
        break;
      }
      case 'alert':
        this.alertMessage.set(outcome.message);
        this.alert()?.focus();
        break;
      case 'other':
        this.alertMessage.set(outcome.message);
        this.alertReference.set(outcome.correlationId ?? null);
        this.alert()?.focus();
        break;
      case 'not-found':
        this.alertMessage.set(outcome.message);
        break;
    }
  }

  private view(
    name: FieldName,
    extra: { hint?: boolean; extraDescribedBy?: readonly string[] } = {},
  ): FieldView {
    return createFieldView({
      id: `staff-${name}`,
      control: this.form.controls[name],
      messages: STAFF_FIELD_MESSAGES[name] as Record<string, string>,
      submitAttempted: this.submitAttempted,
      serverError: this.serverErrors[name],
      ...extra,
    });
  }
}
