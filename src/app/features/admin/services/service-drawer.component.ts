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
import type { ServiceType } from '../../../core/api/models';
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
import { isGuid } from '../data/resolvers';
import { ServicesStore } from '../data/services.store';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { restoreFocusOnDestroy } from '../shared/drawer-focus';
import { DrawerFrame } from '../shared/drawer-frame.component';
import { StatusBadge } from '../shared/status-badge.component';
import { StatusConfirm } from '../shared/status-confirm.component';
import { DESCRIPTION_MAX } from '../validation/branch-rules';
import { MESSAGES } from '../validation/messages';
import { normaliseCode } from '../validation/service-rules';
import { DurationStepper } from './duration-stepper.component';
import { mapServiceError } from './service-error';
import {
  createServiceForm,
  fillServiceForm,
  serviceSnapshot,
  toCreateBody,
  toUpdateBody,
  type ServiceMode,
} from './service.form';

type FieldName = 'code' | 'name' | 'description' | 'durationMinutes';

/**
 * Create (`/admin/services/new`) and edit (`/admin/services/:id`) in a side drawer over the list.
 * Same flow as the branch drawer: routed exits guarded, pristine before navigating after a save,
 * code immutable after creation.
 */
@Component({
  selector: 'app-service-drawer',
  imports: [
    DrawerFrame,
    DurationStepper,
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
    StatusBadge,
    StatusConfirm,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer-frame [title]="title" (closeRequested)="close()">
      @if (state() === 'loading') {
        <p role="status" aria-busy="true" class="text-sm text-muted-foreground">
          Loading the service…
        </p>
      } @else if (state() === 'not-found') {
        <div class="flex flex-col items-start gap-3">
          <p class="font-medium">That service could not be found.</p>
          <a hlmBtn variant="outline" routerLink="/admin/services" queryParamsHandling="preserve"
            >Back to services</a
          >
        </div>
      } @else if (state() === 'load-error') {
        <div class="flex flex-col items-start gap-3">
          <app-form-alert [message]="loadError()?.message ?? null" />
          <a hlmBtn variant="outline" routerLink="/admin/services" queryParamsHandling="preserve"
            >Back to services</a
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
          @if (record(); as r) {
            <div class="flex flex-wrap items-center justify-between gap-2">
              <app-status-badge [active]="r.isActive" />
              <button
                hlmBtn
                type="button"
                variant="outline"
                [attr.aria-label]="(r.isActive ? 'Deactivate ' : 'Activate ') + r.name"
                (click)="toggleStatus($event)"
              >
                {{ r.isActive ? 'Deactivate' : 'Activate' }}
              </button>
            </div>
          }
          <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

          @if (mode === 'create') {
            <app-form-field
              label="Code"
              hint="Letters, digits, hyphens and underscores; saved in upper case"
              [view]="views.code"
            >
              <input
                hlmInput
                formControlName="code"
                autocomplete="off"
                maxlength="30"
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
              <p class="font-mono" data-testid="service-code">{{ values().code }}</p>
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

          <app-form-field
            label="Duration"
            [hint]="
              mode === 'edit'
                ? 'Changing the duration affects only slots generated from now on. Existing slots keep their length.'
                : undefined
            "
            [view]="views.durationMinutes"
          >
            <app-duration-stepper
              formControlName="durationMinutes"
              [inputId]="views.durationMinutes.id"
              [describedBy]="views.durationMinutes.describedBy()"
              [invalid]="!!views.durationMinutes.error()"
              [locked]="pending()"
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
              {{ mode === 'create' ? 'Create service' : 'Save changes' }}
            </button>
            <button hlmBtn type="button" variant="outline" (click)="close()">Cancel</button>
          </div>
        </form>
      }
    </app-drawer-frame>
    <app-status-confirm />
  `,
})
export class ServiceDrawer implements DirtyForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly api = inject(AvailabilityApiService);
  private readonly store = inject(ServicesStore);
  private readonly toast = inject(ToastService);

  private readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly mode: ServiceMode = this.id === null ? 'create' : 'edit';
  protected readonly title = this.mode === 'create' ? 'New service' : 'Edit service';

  protected readonly form = createServiceForm(this.mode);
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
    durationMinutes: signal<string | null>(null),
  };

  protected readonly views: Record<FieldName, FieldView> = {
    code: this.view('code', true),
    name: this.view('name'),
    description: this.view('description', true),
    durationMinutes: this.view('durationMinutes', this.mode === 'edit'),
  };

  protected readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  private readonly initial = signal(serviceSnapshot(this.form));
  private readonly dirty = computed(() => {
    this.values();
    return serviceSnapshot(this.form) !== this.initial();
  });

  protected readonly codePreview = computed(() => {
    const code = this.values().code;
    return code.trim() !== '' && this.form.controls.code.valid ? normaliseCode(code) : null;
  });
  protected readonly descriptionRemaining = computed(
    () => DESCRIPTION_MAX - this.values().description.length,
  );
  /** The stored record (edit mode), so the badge follows activation. */
  protected readonly record = computed(() => (this.id ? this.store.byId(this.id) : undefined));

  private readonly statusConfirm = viewChild.required(StatusConfirm);
  private readonly frame = viewChild(DrawerFrame);
  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');

  constructor() {
    restoreFocusOnDestroy();
    registerBeforeUnload(this.dirty);
    if (this.mode === 'edit') void this.loadService();
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

  protected async toggleStatus(event: Event): Promise<void> {
    const record = this.record();
    if (!record) return;
    const result = await this.statusConfirm().ask({
      entity: 'service',
      record,
      store: this.store,
      returnFocus: event.currentTarget as HTMLElement,
    });
    if (result === 'not-found') {
      this.initial.set(serviceSnapshot(this.form));
      this.close();
    }
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
        const created = await firstValueFrom(this.api.createService(toCreateBody(values)));
        this.store.upsert(created);
        this.finish();
        this.toast.showSuccess(`Service ${created.code} created`, {
          label: 'Generate slots',
          onClick: () =>
            void this.router.navigate(['/admin/slots'], {
              queryParams: { serviceId: created.id },
            }),
        });
      } else {
        const id = this.id!;
        const result = await firstValueFrom(this.api.updateService(id, toUpdateBody(values)));
        if (result && typeof result === 'object' && 'id' in result) {
          this.store.upsert(result as ServiceType);
        } else {
          await this.store.ensure(id, { force: true }).catch(() => null);
        }
        this.finish();
        this.toast.showSuccess('Service updated');
      }
    } catch (e) {
      this.pending.set(false);
      this.handleFailure(normalizeError(e), values.code);
    }
  }

  /** Pristine first, so the navigation that follows passes the unsaved-changes guard. */
  private finish(): void {
    this.initial.set(serviceSnapshot(this.form));
    this.form.markAsPristine();
    this.close();
  }

  private handleFailure(error: AppError, sentCode: string): void {
    const outcome = mapServiceError(error, this.mode === 'create' ? { code: sentCode } : {});
    switch (outcome.kind) {
      case 'offline':
        break;
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
        this.initial.set(serviceSnapshot(this.form));
        this.toast.showInfo('That service no longer exists');
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

  private async loadService(): Promise<void> {
    const id = this.id;
    if (!isGuid(id)) {
      this.state.set('not-found');
      return;
    }
    try {
      const service = await this.store.ensure(id);
      if (!service) {
        this.state.set('not-found');
        return;
      }
      fillServiceForm(this.form, service);
      this.initial.set(serviceSnapshot(this.form));
      this.state.set('ready');
      queueMicrotask(() => this.frame()?.focusFirst());
    } catch (e) {
      this.loadError.set(normalizeError(e));
      this.state.set('load-error');
    }
  }

  private view(name: FieldName, hint = false): FieldView {
    return createFieldView({
      id: `service-${name}`,
      control: this.form.controls[name],
      messages: MESSAGES.service[name] as Record<string, string>,
      submitAttempted: this.submitAttempted,
      serverError: this.serverErrors[name],
      hint,
    });
  }
}
