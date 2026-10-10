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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { HlmTextarea } from '@app/shared/ui/textarea';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import type { Branch } from '../../../core/api/models';
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
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { BranchesStore } from '../data/branches.store';
import { isGuid } from '../data/resolvers';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { restoreFocusOnDestroy } from '../shared/drawer-focus';
import { DrawerFrame } from '../shared/drawer-frame.component';
import { DESCRIPTION_MAX, normaliseCode } from '../validation/branch-rules';
import { MESSAGES } from '../validation/messages';
import { mapBranchError } from './branch-error';
import {
  branchSnapshot,
  createBranchForm,
  fillBranchForm,
  toCreateBody,
  toUpdateBody,
  type BranchMode,
} from './branch.form';

type FieldName = 'code' | 'name' | 'description' | 'address' | 'phoneNumber';

/**
 * Create (`/admin/branches/new`) and edit (`/admin/branches/:id`) in a side drawer over the list.
 * Every way out is a router navigation, so the unsaved-changes guard decides; a successful save
 * makes the form pristine before it navigates. The code is immutable after creation.
 */
@Component({
  selector: 'app-branch-drawer',
  imports: [
    DrawerFrame,
    FieldA11yDirective,
    FormAlertComponent,
    FormFieldComponent,
    HlmButton,
    HlmInput,
    HlmTextarea,
    NgIcon,
    RateLimitNotice,
    ReactiveFormsModule,
    RouterLink,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer-frame [title]="title" (closeRequested)="close()">
      @if (state() === 'loading') {
        <p role="status" aria-busy="true" class="text-sm text-muted-foreground">
          Loading the branch…
        </p>
      } @else if (state() === 'not-found') {
        <div class="flex flex-col items-start gap-3">
          <p class="font-medium">That branch could not be found.</p>
          <a hlmBtn variant="outline" routerLink="/admin/branches" queryParamsHandling="preserve"
            >Back to branches</a
          >
        </div>
      } @else if (state() === 'load-error') {
        <div class="flex flex-col items-start gap-3">
          <app-form-alert [message]="loadError()?.message ?? null" />
          <a hlmBtn variant="outline" routerLink="/admin/branches" queryParamsHandling="preserve"
            >Back to branches</a
          >
        </div>
      } @else {
        <form
          #formEl
          novalidate
          class="flex flex-col gap-4"
          [formGroup]="form"
          (ngSubmit)="submit()"
        >
          <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

          @if (mode === 'create') {
            <app-form-field
              label="Code"
              hint="Letters, digits and hyphens; saved in upper case"
              [view]="views.code"
            >
              <input
                hlmInput
                formControlName="code"
                autocomplete="off"
                maxlength="10"
                [id]="views.code.id"
                [appField]="views.code"
                [readOnly]="pending()"
              />
            </app-form-field>
            @if (codePreview(); as preview) {
              <p class="-mt-2 text-sm text-muted-foreground" aria-live="off">
                Will be saved as <span class="font-mono font-medium">{{ preview }}</span>
              </p>
            }
          } @else {
            <div class="flex flex-col gap-1.5">
              <p class="text-sm font-medium">Code</p>
              <p class="font-mono" data-testid="branch-code">{{ values().code }}</p>
              <p class="text-sm text-muted-foreground">The code cannot be changed after creation</p>
            </div>
          }

          <app-form-field label="Name" [view]="views.name">
            <input
              hlmInput
              formControlName="name"
              autocomplete="off"
              [id]="views.name.id"
              [appField]="views.name"
              [readOnly]="pending()"
            />
          </app-form-field>

          <div class="flex flex-col gap-1.5">
            <label [for]="views.description.id" class="text-sm font-medium text-foreground"
              >Description <span class="font-normal text-muted-foreground">(optional)</span></label
            >
            <textarea
              hlmTextarea
              formControlName="description"
              rows="3"
              [id]="views.description.id"
              [readOnly]="pending()"
              [attr.aria-invalid]="views.description.error() ? 'true' : null"
              [attr.aria-describedby]="views.description.describedBy()"
            ></textarea>
            <p [id]="views.description.id + '-hint'" class="text-sm text-muted-foreground">
              {{ descriptionRemaining() }} characters remaining
            </p>
            @if (views.description.error(); as message) {
              <p [id]="views.description.id + '-error'" class="text-sm text-destructive">
                {{ message }}
              </p>
            }
          </div>

          <app-form-field label="Address" [view]="views.address">
            <input
              hlmInput
              formControlName="address"
              autocomplete="off"
              [id]="views.address.id"
              [appField]="views.address"
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
              formControlName="phoneNumber"
              type="tel"
              autocomplete="off"
              [id]="views.phoneNumber.id"
              [appField]="views.phoneNumber"
              [readOnly]="pending()"
            />
          </app-form-field>

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
              {{ mode === 'create' ? 'Create branch' : 'Save changes' }}
            </button>
            <button hlmBtn type="button" variant="outline" (click)="close()">Cancel</button>
          </div>
        </form>
      }
    </app-drawer-frame>
  `,
})
export class BranchDrawer implements DirtyForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly api = inject(AvailabilityApiService);
  private readonly store = inject(BranchesStore);
  private readonly toast = inject(ToastService);

  private readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly mode: BranchMode = this.id === null ? 'create' : 'edit';
  protected readonly title = this.mode === 'create' ? 'New branch' : 'Edit branch';

  protected readonly form = createBranchForm(this.mode);
  protected readonly countdown = createRetryCountdown();
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'load-error'>(
    this.mode === 'create' ? 'ready' : 'loading',
  );
  protected readonly loadError = signal<AppError | null>(null);
  protected readonly pending = signal(false);
  protected readonly alertMessage = signal<string | null>(null);
  protected readonly alertReference = signal<string | null>(null);

  private readonly submitAttempted = signal(false);
  private readonly serverErrors = {
    code: signal<string | null>(null),
    name: signal<string | null>(null),
    description: signal<string | null>(null),
    address: signal<string | null>(null),
    phoneNumber: signal<string | null>(null),
  };

  protected readonly views: Record<FieldName, FieldView> = {
    code: this.view('code', true),
    name: this.view('name'),
    description: this.view('description', true),
    address: this.view('address'),
    phoneNumber: this.view('phoneNumber', true),
  };

  protected readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  private readonly initial = signal(branchSnapshot(this.form));
  private readonly dirty = computed(() => {
    this.values();
    return branchSnapshot(this.form) !== this.initial();
  });

  protected readonly codePreview = computed(() => {
    const code = this.values().code;
    return code.trim() !== '' && this.form.controls.code.valid ? normaliseCode(code) : null;
  });
  protected readonly descriptionRemaining = computed(
    () => DESCRIPTION_MAX - this.values().description.length,
  );

  private readonly frame = viewChild(DrawerFrame);
  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');

  constructor() {
    restoreFocusOnDestroy();
    registerBeforeUnload(this.dirty);
    if (this.mode === 'edit') void this.loadBranch();
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
    const values = this.form.getRawValue();
    this.pending.set(true);
    try {
      if (this.mode === 'create') {
        const created = await firstValueFrom(this.api.createBranch(toCreateBody(values)));
        this.store.upsert(created);
        this.finish();
        this.toast.showSuccess(`Branch ${created.code} created`, {
          label: 'Set schedule',
          onClick: () => void this.router.navigate(['/admin/branches', created.id, 'schedule']),
        });
      } else {
        const id = this.id!;
        const result = await firstValueFrom(this.api.updateBranch(id, toUpdateBody(values)));
        if (result && typeof result === 'object' && 'id' in result) {
          this.store.upsert(result as Branch);
        } else {
          await this.store.ensure(id, { force: true }).catch(() => null);
        }
        this.finish();
        this.toast.showSuccess('Branch updated');
      }
    } catch (e) {
      this.pending.set(false);
      this.handleFailure(normalizeError(e), values.code);
    }
  }

  /** Pristine first, so the navigation that follows passes the unsaved-changes guard. */
  private finish(): void {
    this.initial.set(branchSnapshot(this.form));
    this.form.markAsPristine();
    this.close();
  }

  private handleFailure(error: AppError, sentCode: string): void {
    const outcome = mapBranchError(error, this.mode === 'create' ? { code: sentCode } : {});
    switch (outcome.kind) {
      case 'offline':
        break; // values kept and re-enabled; the outage banner explains
      case 'rate-limited':
        this.countdown.startFrom(error);
        break;
      case 'forbidden':
        this.toast.handleError(error);
        break;
      case 'duplicate-code':
        this.serverErrors.code.set(outcome.message);
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
      case 'not-found':
        this.initial.set(branchSnapshot(this.form));
        this.toast.showInfo('That branch no longer exists');
        void this.store.load({ force: true });
        this.close();
        break;
      case 'other':
        this.alertMessage.set(outcome.message);
        this.alertReference.set(outcome.correlationId ?? null);
        this.alert()?.focus();
        break;
    }
  }

  private async loadBranch(): Promise<void> {
    const id = this.id;
    if (!isGuid(id)) {
      this.state.set('not-found');
      return;
    }
    try {
      const branch = await this.store.ensure(id);
      if (!branch) {
        this.state.set('not-found');
        return;
      }
      fillBranchForm(this.form, branch);
      this.initial.set(branchSnapshot(this.form));
      this.state.set('ready');
      queueMicrotask(() => this.frame()?.focusFirst());
    } catch (e) {
      this.loadError.set(normalizeError(e));
      this.state.set('load-error');
    }
  }

  private view(name: FieldName, hint = false): FieldView {
    return createFieldView({
      id: `branch-${name}`,
      control: this.form.controls[name],
      messages: MESSAGES.branch[name] as Record<string, string>,
      submitAttempted: this.submitAttempted,
      serverError: this.serverErrors[name],
      hint,
    });
  }
}
