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
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle } from '@ng-icons/lucide';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import type { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { FormAlertComponent, createFieldView, focusFirstInvalid } from '../../../shared/forms';
import { ConfirmService } from '../../../shared/ui/confirm-dialog';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { BranchesStore } from '../data/branches.store';
import { isGuid } from '../data/resolvers';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { StatusBadge } from '../shared/status-badge.component';
import { MESSAGES } from '../validation/messages';
import { ScheduleDayRow } from './schedule-day-row.component';
import { mapScheduleError } from './schedule-error';
import {
  canCopyMonday,
  closeAll,
  copyMondayToWeekdays,
  createScheduleForm,
  fromBranch,
  hasOpenDay,
  scheduleSnapshot,
  toRequest,
} from './schedule.form';
import { TimeZoneCombobox } from './time-zone-combobox.component';

/**
 * `/admin/branches/:id/schedule`: the time zone and the weekly opening hours of one branch. The
 * form is seeded from the branch once, and again only after a successful save, so a background
 * reload can never overwrite what the admin is typing.
 */
@Component({
  selector: 'app-schedule-page',
  imports: [
    FocusHeadingDirective,
    FormAlertComponent,
    HlmButton,
    NgIcon,
    RateLimitNotice,
    ReactiveFormsModule,
    RouterLink,
    ScheduleDayRow,
    StatusBadge,
    TimeZoneCombobox,
  ],
  providers: [provideIcons({ lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <a
          routerLink="/admin/branches"
          class="inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4"
          >Back to branches</a
        >
      </div>
      <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">
        {{ branch() ? 'Schedule for ' + branch()!.name : 'Schedule' }}
      </h1>

      @switch (state()) {
        @case ('loading') {
          <p role="status" aria-busy="true" class="text-sm text-muted-foreground">
            Loading the branch…
          </p>
        }
        @case ('not-found') {
          <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
            <p class="font-medium">That branch could not be found.</p>
            <a hlmBtn variant="outline" routerLink="/admin/branches">Back to branches</a>
          </div>
        }
        @case ('error') {
          <div class="flex flex-col items-start gap-3 rounded-lg border p-6">
            <app-form-alert [message]="loadError()?.message ?? null" />
            <button hlmBtn variant="outline" type="button" (click)="reload()">Retry</button>
          </div>
        }
        @default {
          @if (branch(); as b) {
            @if (!b.isActive) {
              <p class="flex items-center gap-2 text-sm text-muted-foreground">
                <app-status-badge [active]="false" />
                This branch is inactive. You can still edit its schedule.
              </p>
            }
          }
          <form
            #formEl
            novalidate
            class="flex flex-col gap-4"
            [formGroup]="form"
            (ngSubmit)="save()"
          >
            <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

            <div class="flex max-w-md flex-col gap-1.5">
              <label for="schedule-zone" class="text-sm font-medium"
                >Time zone <span aria-hidden="true" class="text-destructive">*</span></label
              >
              <app-time-zone-combobox
                inputId="schedule-zone"
                [formControl]="form.controls.timeZoneId"
                [invalid]="!!zoneView.error()"
                [describedBy]="zoneView.describedBy()"
              />
              @if (zoneView.error(); as message) {
                <p id="schedule-zone-error" class="text-sm text-destructive">{{ message }}</p>
              }
            </div>

            <p class="text-sm text-muted-foreground">
              One opening interval per day is supported, and it cannot cross midnight.
            </p>

            <div class="flex flex-wrap gap-2">
              <button
                hlmBtn
                type="button"
                variant="outline"
                [disabled]="!canCopy()"
                (click)="copyMonday()"
              >
                Copy Monday to weekdays
              </button>
              <button hlmBtn type="button" variant="outline" (click)="closeAllDays()">
                Close all days
              </button>
            </div>

            <div role="group" aria-label="Opening hours" class="flex flex-col gap-3 md:gap-0">
              @for (row of form.controls.days.controls; track row.controls.day.value) {
                <app-schedule-day-row [row]="row" [submitAttempted]="submitAttempted()" />
              }
            </div>

            <p class="text-sm text-muted-foreground">
              Changing the schedule affects only slots generated from now on. Existing slots stay as
              they are.
            </p>

            <app-rate-limit-notice [countdown]="countdown" />

            <div class="flex flex-wrap gap-2">
              <button
                hlmBtn
                type="submit"
                [disabled]="pending() || countdown.active()"
                [attr.aria-busy]="pending() ? 'true' : null"
              >
                @if (pending()) {
                  <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
                }
                Save schedule
              </button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class SchedulePage implements DirtyForm {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly api = inject(AvailabilityApiService);
  private readonly store = inject(BranchesStore);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  private readonly id = this.route.snapshot.paramMap.get('id');

  protected readonly form = createScheduleForm();
  protected readonly countdown = createRetryCountdown();
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly loadError = signal<AppError | null>(null);
  protected readonly pending = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly alertMessage = signal<string | null>(null);
  protected readonly alertReference = signal<string | null>(null);

  private readonly zoneServerError = signal<string | null>(null);
  protected readonly zoneView = createFieldView({
    id: 'schedule-zone',
    control: this.form.controls.timeZoneId,
    messages: MESSAGES.schedule.timeZoneId,
    submitAttempted: this.submitAttempted,
    serverError: this.zoneServerError,
  });

  /** The stored record, so the heading and the inactive note follow the store. */
  protected readonly branch = computed(() => (this.id ? this.store.byId(this.id) : undefined));

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => scheduleSnapshot(this.form)),
    ),
    { initialValue: scheduleSnapshot(this.form) },
  );
  private readonly initial = signal(scheduleSnapshot(this.form));
  private readonly dirty = computed(() => this.formValue() !== this.initial());
  protected readonly canCopy = computed(() => {
    this.formValue();
    return canCopyMonday(this.form);
  });

  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');

  constructor() {
    registerBeforeUnload(this.dirty);
    void this.load();
  }

  isDirty(): boolean {
    return this.dirty();
  }

  protected reload(): void {
    this.state.set('loading');
    void this.load();
  }

  protected copyMonday(): void {
    if (copyMondayToWeekdays(this.form)) {
      this.toast.showSuccess("Copied Monday's hours to Tuesday to Friday");
    }
  }

  protected closeAllDays(): void {
    closeAll(this.form);
  }

  async save(): Promise<void> {
    if (this.pending() || this.countdown.active()) return;
    this.submitAttempted.set(true);
    this.alertMessage.set(null);
    this.alertReference.set(null);
    if (this.form.invalid) {
      focusFirstInvalid(this.formEl()!, this.injector);
      return;
    }
    if (!hasOpenDay(this.form)) {
      const ok = await this.confirmService.confirm({
        title: 'Save with every day closed?',
        body: 'The branch will have no working hours, so slot generation for it is blocked until you set a schedule.',
        confirmLabel: 'Save schedule',
        initialFocus: 'cancel',
      });
      if (!ok) return;
    }
    const id = this.id!;
    this.pending.set(true);
    try {
      const saved = await firstValueFrom(this.api.setSchedule(id, toRequest(this.form)));
      this.store.upsert(saved);
      fromBranch(this.form, saved);
      this.initial.set(scheduleSnapshot(this.form));
      this.submitAttempted.set(false);
      this.pending.set(false);
      this.toast.showSuccess('Schedule saved');
    } catch (e) {
      this.pending.set(false);
      this.handleFailure(normalizeError(e));
    }
  }

  private handleFailure(error: AppError): void {
    const outcome = mapScheduleError(error);
    switch (outcome.kind) {
      case 'offline':
        break;
      case 'rate-limited':
        this.countdown.startFrom(error);
        break;
      case 'forbidden':
        this.toast.handleError(error);
        break;
      case 'validation':
        if (outcome.fields['timeZoneId']) {
          this.zoneServerError.set(outcome.fields['timeZoneId']);
          focusFirstInvalid(this.formEl()!, this.injector);
        }
        if (outcome.alert.length > 0) {
          this.alertMessage.set(outcome.alert.join(' '));
          if (!outcome.fields['timeZoneId']) this.alert()?.focus();
        }
        break;
      case 'not-found':
        this.initial.set(scheduleSnapshot(this.form));
        this.toast.showInfo('That branch no longer exists');
        void this.store.load({ force: true });
        void this.router.navigate(['/admin/branches']);
        break;
      case 'other':
        this.alertMessage.set(outcome.message);
        this.alertReference.set(outcome.correlationId ?? null);
        this.alert()?.focus();
        break;
    }
  }

  private async load(): Promise<void> {
    if (!isGuid(this.id)) {
      this.state.set('not-found');
      return;
    }
    try {
      const branch = await this.store.ensure(this.id);
      if (!branch) {
        this.state.set('not-found');
        return;
      }
      fromBranch(this.form, branch);
      this.initial.set(scheduleSnapshot(this.form));
      this.state.set('ready');
    } catch (e) {
      this.loadError.set(normalizeError(e));
      this.state.set('error');
    }
  }
}
