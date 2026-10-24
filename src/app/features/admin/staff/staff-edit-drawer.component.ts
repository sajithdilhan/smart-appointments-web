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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { firstValueFrom, startWith } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import type { StaffAccount } from '../../../core/api/models';
import type { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import {
  FormAlertComponent,
  FormFieldComponent,
  createFieldView,
  focusFirstInvalid,
  type FieldView,
} from '../../../shared/forms';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { BranchesStore } from '../data/branches.store';
import { isGuid } from '../data/resolvers';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { restoreFocusOnDestroy } from '../shared/drawer-focus';
import { DrawerFrame } from '../shared/drawer-frame.component';
import { StatusBadge } from '../shared/status-badge.component';
import { mapStaffSaveError } from './staff-error';
import {
  MOVE_NOTICE,
  STAFF_FIELD_MESSAGES,
  STAFF_NOT_FOUND_MESSAGE,
  movedMessage,
} from './staff-messages';
import { fullName, registeredLabel } from './staff-view';

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive';

type State = 'loading' | 'ready' | 'not-found' | 'load-error';

/**
 * Shows a staff account and moves it to another branch, in a side drawer over the list
 * (`/admin/staff/:id`). Everything but the branch is read-only. The account is read from the
 * server, not the list, so the drawer is right on a deep link. Saving needs a different, active
 * branch; moving a member signs them out everywhere, which the drawer says before Save.
 */
@Component({
  selector: 'app-staff-edit-drawer',
  imports: [
    DrawerFrame,
    FormAlertComponent,
    FormFieldComponent,
    HlmButton,
    NgIcon,
    RateLimitNotice,
    ReactiveFormsModule,
    RouterLink,
    StatusBadge,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer-frame title="Edit staff member" (closeRequested)="close()">
      @switch (state()) {
        @case ('loading') {
          <p role="status" aria-busy="true" class="text-sm text-muted-foreground">
            Loading the staff member…
          </p>
        }
        @case ('not-found') {
          <div class="flex flex-col items-start gap-3">
            <p role="alert" class="font-medium">{{ notFoundMessage }}</p>
            <a hlmBtn variant="outline" routerLink="/admin/staff" queryParamsHandling="preserve"
              >Back to staff</a
            >
          </div>
        }
        @case ('load-error') {
          <div class="flex flex-col items-start gap-3">
            <app-form-alert [message]="loadError()?.message ?? null" />
            <div class="flex flex-wrap gap-2">
              <button hlmBtn variant="outline" type="button" (click)="load()">Retry</button>
              <a hlmBtn variant="outline" routerLink="/admin/staff" queryParamsHandling="preserve"
                >Back to staff</a
              >
            </div>
          </div>
        }
        @default {
          @if (account(); as a) {
            <form
              #formEl
              novalidate
              class="flex flex-col gap-4"
              [formGroup]="form"
              (ngSubmit)="submit()"
            >
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt class="text-muted-foreground">Name</dt>
                <dd class="font-medium">{{ name() }}</dd>
                <dt class="text-muted-foreground">Email</dt>
                <dd class="break-all">{{ a.email }}</dd>
                <dt class="text-muted-foreground">Phone</dt>
                <dd>{{ a.phoneNumber }}</dd>
                <dt class="text-muted-foreground">Status</dt>
                <dd><app-status-badge [active]="a.isActive" /></dd>
                <dt class="text-muted-foreground">Registered</dt>
                <dd>{{ registered() }}</dd>
              </dl>

              <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

              <app-form-field label="Branch" [view]="branchView">
                <select
                  formControlName="branchId"
                  aria-required="true"
                  [class]="selectClass"
                  [id]="branchView.id"
                  [attr.aria-invalid]="branchView.error() ? 'true' : null"
                  [attr.aria-describedby]="branchView.describedBy()"
                >
                  <option value="">Select a branch</option>
                  @for (o of options(); track o.id) {
                    <option [value]="o.id">{{ o.label }}</option>
                  }
                </select>
              </app-form-field>

              <p class="rounded-md bg-muted p-3 text-sm">{{ notice }}</p>

              <app-rate-limit-notice [countdown]="countdown" />

              <div class="flex flex-wrap items-center gap-2">
                <button
                  hlmBtn
                  type="submit"
                  [disabled]="unchanged() || pending() || countdown.active()"
                  [attr.aria-busy]="pending() ? 'true' : null"
                >
                  @if (pending()) {
                    <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
                  }
                  Save
                </button>
                <button hlmBtn type="button" variant="outline" (click)="close()">Cancel</button>
              </div>
            </form>
          }
        }
      }
    </app-drawer-frame>
  `,
})
export class StaffEditDrawer implements DirtyForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly api = inject(AuthApiService);
  private readonly store = inject(StaffAccountsStore);
  private readonly toast = inject(ToastService);
  private readonly branches = inject(BranchesStore);

  private readonly id = this.route.snapshot.paramMap.get('id');

  protected readonly notice = MOVE_NOTICE;
  protected readonly notFoundMessage = STAFF_NOT_FOUND_MESSAGE;
  protected readonly selectClass = SELECT;
  protected readonly countdown = createRetryCountdown();
  protected readonly state = signal<State>('loading');
  protected readonly account = signal<StaffAccount | null>(null);
  protected readonly loadError = signal<AppError | null>(null);
  protected readonly pending = signal(false);
  protected readonly alertMessage = signal<string | null>(null);
  protected readonly alertReference = signal<string | null>(null);

  protected readonly form = new FormGroup({
    branchId: new FormControl('', { nonNullable: true, validators: Validators.required }),
  });

  private readonly submitAttempted = signal(false);
  private readonly branchServerError = signal<string | null>(null);
  protected readonly branchView: FieldView = createFieldView({
    id: 'staff-edit-branch',
    control: this.form.controls.branchId,
    messages: STAFF_FIELD_MESSAGES.branchId,
    submitAttempted: this.submitAttempted,
    serverError: this.branchServerError,
  });

  private readonly chosen = toSignal(
    this.form.controls.branchId.valueChanges.pipe(startWith(this.form.controls.branchId.value)),
    { requireSync: true },
  );
  protected readonly unchanged = computed(() => this.chosen() === (this.account()?.branchId ?? ''));
  private readonly saved = signal(false);
  private readonly dirty = computed(() => !this.saved() && !this.unchanged() && !!this.account());

  protected readonly name = computed(() => {
    const a = this.account();
    return a ? fullName(a) : '';
  });
  protected readonly registered = computed(() => {
    const a = this.account();
    return a ? registeredLabel(a.registeredAtUtc) : '';
  });

  /** Active branches, plus the member's current branch when it is not one of them. */
  protected readonly options = computed(() => {
    const list = this.branches.active().map((b) => ({ id: b.id, label: b.name }));
    const current = this.account()?.branchId;
    if (current && !list.some((o) => o.id === current)) {
      const b = this.branches.byId(current);
      const loading = this.branches.status() === 'idle' || this.branches.status() === 'loading';
      list.unshift({
        id: current,
        label: b ? `${b.name} (inactive)` : loading ? 'Loading…' : 'Unknown branch',
      });
    }
    return list;
  });

  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');
  private readonly frame = viewChild(DrawerFrame);

  constructor() {
    restoreFocusOnDestroy();
    registerBeforeUnload(this.dirty);
    if (this.branches.status() === 'idle') void this.branches.load();
    void this.load();
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

  protected async load(): Promise<void> {
    if (!isGuid(this.id)) {
      this.state.set('not-found');
      return;
    }
    this.state.set('loading');
    this.loadError.set(null);
    try {
      const account = await firstValueFrom(this.api.getStaff(this.id));
      this.account.set(account);
      this.form.controls.branchId.setValue(account.branchId, { emitEvent: true });
      this.state.set('ready');
      queueMicrotask(() => this.frame()?.focusFirst());
    } catch (e) {
      const error = normalizeError(e);
      if (error.status === 404) {
        this.state.set('not-found');
        void this.store.reload();
      } else {
        this.loadError.set(error);
        this.state.set('load-error');
      }
    }
  }

  protected async submit(): Promise<void> {
    const account = this.account();
    if (!account || this.pending() || this.countdown.active() || this.unchanged()) return;
    this.submitAttempted.set(true);
    this.alertMessage.set(null);
    this.alertReference.set(null);
    if (this.form.invalid) {
      focusFirstInvalid(this.formEl()!, this.injector);
      return;
    }
    const branchId = this.form.controls.branchId.value;
    this.pending.set(true);
    try {
      const moved = await firstValueFrom(this.api.moveStaff(account.id, branchId));
      this.saved.set(true);
      this.pending.set(false);
      const branchName = this.branches.byId(branchId)?.name ?? '';
      this.toast.showSuccess(movedMessage(fullName(moved ?? account), branchName));
      void this.store.reload();
      this.close();
    } catch (e) {
      this.pending.set(false);
      await this.handleFailure(normalizeError(e));
    }
  }

  private async handleFailure(error: AppError): Promise<void> {
    const outcome = mapStaffSaveError(error, 'move');
    switch (outcome.kind) {
      case 'offline':
      case 'forbidden':
        this.toast.handleError(error);
        break;
      case 'rate-limited':
        this.countdown.startFrom(error);
        break;
      case 'field':
        await this.branches.load({ force: true });
        this.form.controls.branchId.setValue('');
        this.branchServerError.set(outcome.message);
        focusFirstInvalid(this.formEl()!, this.injector);
        break;
      case 'validation': {
        const message = outcome.fields['branchId'];
        if (message) {
          this.branchServerError.set(message);
          focusFirstInvalid(this.formEl()!, this.injector);
        }
        if (outcome.alert.length > 0) this.alertMessage.set(outcome.alert.join(' '));
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
        this.saved.set(true);
        this.account.set(null);
        this.state.set('not-found');
        void this.store.reload();
        break;
    }
  }
}
