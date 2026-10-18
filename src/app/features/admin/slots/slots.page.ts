import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HlmButton } from '@app/shared/ui/button';
import { HlmInput } from '@app/shared/ui/input';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoaderCircle, lucideTriangleAlert } from '@ng-icons/lucide';
import { debounceTime, firstValueFrom, map, startWith } from 'rxjs';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import type { Branch, GenerateSlotsResult } from '../../../core/api/models';
import type { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { ToastService } from '../../../core/notify/toast.service';
import { addDays, diffDays, todayInZone, zoneOffsetMinutes } from '../../../core/time';
import { CLOCK } from '../../../core/util/clock';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import {
  FormAlertComponent,
  createFieldView,
  focusFirstInvalid,
  type FieldView,
} from '../../../shared/forms';
import { RateLimitNotice } from '../../../shared/ui/rate-limit-notice';
import { BranchesStore } from '../data/branches.store';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { ServicesStore } from '../data/services.store';
import { SlotActivityStore } from '../data/slot-activity.store';
import { formatOffset } from '../schedule/zone-options';
import { registerBeforeUnload } from '../shared/dirty/before-unload';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { MAX_DAYS_APART, isDateString } from '../validation/generation-rules';
import { MESSAGES } from '../validation/messages';
import { mapGenerateError, type FixLink } from './generate-error';
import {
  createGenerationForm,
  generationSnapshot,
  previewText,
  toGenerateBody,
} from './generation.form';
import { ResultCard } from './result-card.component';
import { estimateSlots } from './slot-estimate';

type FieldName = 'branchId' | 'serviceTypeId' | 'fromDate' | 'toDate' | 'capacity';

interface Problem {
  message: string;
  link?: FixLink;
  /** Offered for the concurrent-request conflict only; never retried automatically. */
  retry?: boolean;
}

interface RunSummary {
  result: GenerateSlotsResult;
  branch: string;
  service: string;
  range: string;
}

const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50';
const LINK =
  'font-medium text-primary underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * `/admin/slots`: generate slots for an active branch and service over a date range read in the
 * branch's own time zone, with a live local estimate and the server's counts afterwards.
 */
@Component({
  selector: 'app-slots-page',
  imports: [
    FocusHeadingDirective,
    FormAlertComponent,
    HlmButton,
    HlmInput,
    NgIcon,
    RateLimitNotice,
    ReactiveFormsModule,
    ResultCard,
    RouterLink,
  ],
  providers: [provideIcons({ lucideLoaderCircle, lucideTriangleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Slot generation</h1>

      @if (problem(); as p) {
        <div
          role="alert"
          class="flex flex-col items-start gap-2 rounded-md border-l-4 border-destructive bg-destructive/10 p-3 text-sm"
        >
          <p>{{ p.message }}</p>
          @if (p.link; as link) {
            <a [class]="linkClass" [routerLink]="link.commands" [queryParams]="link.queryParams">{{
              link.label
            }}</a>
          }
          @if (p.retry) {
            <button hlmBtn type="button" variant="outline" (click)="submit()">Try again</button>
          }
        </div>
      }
      <app-form-alert #alert [message]="alertMessage()" [reference]="alertReference()" />

      @if (loaded() && (noBranch() || noService())) {
        <div class="flex flex-col items-start gap-2 rounded-lg border p-4" data-testid="empty">
          @if (noBranch()) {
            <p>
              There is no active branch, so slots cannot be generated.
              <a [class]="linkClass" routerLink="/admin/branches/new">Create a branch</a>
              or
              <a
                [class]="linkClass"
                routerLink="/admin/branches"
                [queryParams]="{ status: 'inactive' }"
                >activate one</a
              >.
            </p>
          }
          @if (noService()) {
            <p>
              There is no active service, so slots cannot be generated.
              <a [class]="linkClass" routerLink="/admin/services/new">Create a service</a>
              or
              <a
                [class]="linkClass"
                routerLink="/admin/services"
                [queryParams]="{ status: 'inactive' }"
                >activate one</a
              >.
            </p>
          }
        </div>
      }

      <form #formEl novalidate class="flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label for="gen-branchId" class="text-sm font-medium">Branch</label>
            <select
              id="gen-branchId"
              formControlName="branchId"
              aria-required="true"
              [class]="selectClass"
              [attr.aria-invalid]="views.branchId.error() ? 'true' : null"
              [attr.aria-describedby]="views.branchId.describedBy()"
            >
              <option value="">Choose a branch</option>
              @for (b of branches.active(); track b.id) {
                <option [value]="b.id">{{ b.name }} ({{ b.code }})</option>
              }
            </select>
            @if (views.branchId.error(); as message) {
              <p id="gen-branchId-error" class="text-sm text-destructive">{{ message }}</p>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="gen-serviceTypeId" class="text-sm font-medium">Service</label>
            <select
              id="gen-serviceTypeId"
              formControlName="serviceTypeId"
              aria-required="true"
              [class]="selectClass"
              [attr.aria-invalid]="views.serviceTypeId.error() ? 'true' : null"
              [attr.aria-describedby]="views.serviceTypeId.describedBy()"
            >
              <option value="">Choose a service</option>
              @for (s of services.active(); track s.id) {
                <option [value]="s.id">{{ s.name }} ({{ s.code }})</option>
              }
            </select>
            @if (views.serviceTypeId.error(); as message) {
              <p id="gen-serviceTypeId-error" class="text-sm text-destructive">{{ message }}</p>
            }
          </div>
        </div>

        @if (hasInactive()) {
          <p class="text-sm text-muted-foreground">
            Inactive branches and services are not listed. Reactivate one to generate slots for it.
            <a
              [class]="linkClass"
              routerLink="/admin/branches"
              [queryParams]="{ status: 'inactive' }"
              >Inactive branches</a
            >,
            <a
              [class]="linkClass"
              routerLink="/admin/services"
              [queryParams]="{ status: 'inactive' }"
              >Inactive services</a
            >.
          </p>
        }

        @if (branch(); as b) {
          @if (!hasSchedule()) {
            <p
              class="flex items-start gap-2 rounded-md border p-3 text-sm"
              data-testid="no-schedule"
            >
              <ng-icon
                name="lucideTriangleAlert"
                size="18"
                class="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                This branch has no schedule, so slots cannot be generated.
                <a [class]="linkClass" [routerLink]="['/admin/branches', b.id, 'schedule']"
                  >Set a schedule</a
                >
              </span>
            </p>
          }
        }

        <div class="flex flex-col gap-1.5">
          <p class="text-sm text-muted-foreground" id="gen-zone-note">{{ zoneNote() }}</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Quick ranges">
            @for (n of quickRanges; track n) {
              <button
                hlmBtn
                type="button"
                variant="outline"
                size="sm"
                [disabled]="!branchChosen() || pending()"
                (click)="quickRange(n)"
              >
                Next {{ n }} days
              </button>
            }
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="flex flex-col gap-1.5">
            <label for="gen-fromDate" class="text-sm font-medium">From date</label>
            <input
              hlmInput
              id="gen-fromDate"
              type="date"
              formControlName="fromDate"
              aria-required="true"
              [min]="minFrom()"
              [attr.aria-invalid]="views.fromDate.error() ? 'true' : null"
              [attr.aria-describedby]="views.fromDate.describedBy()"
            />
            @if (views.fromDate.error(); as message) {
              <p id="gen-fromDate-error" class="text-sm text-destructive">{{ message }}</p>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="gen-toDate" class="text-sm font-medium">To date</label>
            <input
              hlmInput
              id="gen-toDate"
              type="date"
              formControlName="toDate"
              aria-required="true"
              [min]="minTo()"
              [max]="maxTo()"
              [attr.aria-invalid]="views.toDate.error() ? 'true' : null"
              [attr.aria-describedby]="views.toDate.describedBy()"
            />
            @if (views.toDate.error(); as message) {
              <p id="gen-toDate-error" class="text-sm text-destructive">{{ message }}</p>
            }
          </div>
        </div>
        @if (!branchChosen()) {
          <p class="-mt-2 text-sm text-muted-foreground">Choose a branch to pick dates.</p>
        }

        <div class="flex max-w-xs flex-col gap-1.5">
          <label for="gen-capacity" class="text-sm font-medium">Capacity</label>
          <input
            hlmInput
            id="gen-capacity"
            type="number"
            min="1"
            max="100"
            step="1"
            formControlName="capacity"
            aria-required="true"
            [attr.aria-invalid]="views.capacity.error() ? 'true' : null"
            [attr.aria-describedby]="views.capacity.describedBy()"
          />
          <p id="gen-capacity-hint" class="text-sm text-muted-foreground">
            How many customers can book the same slot.
          </p>
          @if (views.capacity.error(); as message) {
            <p id="gen-capacity-error" class="text-sm text-destructive">{{ message }}</p>
          }
        </div>

        <div
          role="status"
          aria-live="polite"
          class="rounded-md border p-3 text-sm"
          data-testid="preview"
        >
          @if (preview(); as text) {
            <p class="font-medium">{{ text.headline }}</p>
            <p class="text-muted-foreground">
              This is an estimate; the server's count is authoritative because it also skips
              overlapping slots.
            </p>
            @if (text.closed) {
              <p>{{ text.closed }}</p>
            }
            @if (text.today) {
              <p>{{ text.today }}</p>
            }
            @if (text.zero) {
              <p class="font-medium">{{ text.zero }}</p>
            }
          } @else {
            <p class="text-muted-foreground">
              Choose a branch, a service and a date range to see an estimate.
            </p>
          }
        </div>

        <app-rate-limit-notice [countdown]="countdown" />

        <div>
          <button
            hlmBtn
            type="submit"
            [disabled]="pending() || countdown.active() || blocked()"
            [attr.aria-busy]="pending() ? 'true' : null"
          >
            @if (pending()) {
              <ng-icon name="lucideLoaderCircle" class="animate-spin" aria-hidden="true" />
            }
            Generate slots
          </button>
        </div>
      </form>

      @if (summary(); as s) {
        <div role="status">
          <app-result-card
            [result]="s.result"
            [branch]="s.branch"
            [service]="s.service"
            [range]="s.range"
            (generateMore)="generateMore()"
          />
        </div>
      }
    </div>
  `,
})
export class SlotsPage implements DirtyForm {
  private readonly injector = inject(Injector);
  private readonly api = inject(AvailabilityApiService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(CLOCK);
  private readonly activity = inject(SlotActivityStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly branches = inject(BranchesStore);
  protected readonly services = inject(ServicesStore);

  protected readonly selectClass = SELECT;
  protected readonly linkClass = LINK;
  protected readonly quickRanges = [7, 14, 30] as const;

  protected readonly form = createGenerationForm();
  protected readonly countdown = createRetryCountdown();
  protected readonly pending = signal(false);
  protected readonly problem = signal<Problem | null>(null);
  protected readonly alertMessage = signal<string | null>(null);
  protected readonly alertReference = signal<string | null>(null);
  protected readonly summary = signal<RunSummary | null>(null);

  private readonly submitAttempted = signal(false);
  private readonly serverErrors = {
    branchId: signal<string | null>(null),
    serviceTypeId: signal<string | null>(null),
    fromDate: signal<string | null>(null),
    toDate: signal<string | null>(null),
    capacity: signal<string | null>(null),
  };
  protected readonly views: Record<FieldName, FieldView> = {
    branchId: this.view('branchId'),
    serviceTypeId: this.view('serviceTypeId'),
    fromDate: this.view('fromDate'),
    toDate: this.view('toDate'),
    capacity: this.view('capacity', true),
  };

  /** Form values as a signal (reactive forms are not signals). */
  private readonly values = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  private readonly initial = signal(generationSnapshot(this.form));
  private readonly dirty = computed(() => {
    this.values();
    return generationSnapshot(this.form) !== this.initial();
  });

  protected readonly loaded = computed(
    () => this.branches.status() === 'loaded' && this.services.status() === 'loaded',
  );
  protected readonly noBranch = computed(() => this.branches.active().length === 0);
  protected readonly noService = computed(() => this.services.active().length === 0);
  protected readonly hasInactive = computed(
    () => this.branches.inactive().length > 0 || this.services.inactive().length > 0,
  );

  protected readonly branch = computed<Branch | undefined>(() => {
    const id = this.values().branchId;
    return this.branches.active().find((b) => b.id === id);
  });
  protected readonly service = computed(() => {
    const id = this.values().serviceTypeId;
    return this.services.active().find((s) => s.id === id);
  });
  protected readonly branchChosen = computed(() => this.branch() !== undefined);
  protected readonly hasSchedule = computed(() => {
    const b = this.branch();
    return !!b && !!b.timeZoneId && b.workingHours.length > 0;
  });
  protected readonly blocked = computed(() => !!this.branch() && !this.hasSchedule());

  private readonly zone = computed(() => this.branch()?.timeZoneId ?? null);
  protected readonly zoneNote = computed(() => {
    const zone = this.zone();
    if (!zone) {
      return this.branchChosen()
        ? 'Dates are in the branch time zone once its schedule is set.'
        : 'Dates are in the time zone of the branch you choose.';
    }
    return `Dates are in ${zone} (${formatOffset(zoneOffsetMinutes(zone, this.clock.now()))})`;
  });
  private readonly today = computed(() => {
    const zone = this.zone();
    return zone ? todayInZone(zone, this.clock.now()) : null;
  });
  protected readonly minFrom = computed(() => this.today() ?? '');
  protected readonly minTo = computed(() => {
    const from = this.values().fromDate;
    return isDateString(from) ? from : (this.today() ?? '');
  });
  protected readonly maxTo = computed(() => {
    const from = this.values().fromDate;
    return isDateString(from) ? addDays(from, MAX_DAYS_APART) : '';
  });

  private readonly previewValue = computed(() => {
    const b = this.branch();
    const s = this.service();
    const { fromDate, toDate } = this.values();
    const zone = this.zone();
    if (!b || !s || !zone || !this.hasSchedule()) return null;
    if (!isDateString(fromDate) || !isDateString(toDate)) return null;
    const apart = diffDays(fromDate, toDate);
    if (apart < 0 || apart > MAX_DAYS_APART) return null;
    const estimate = estimateSlots({
      timeZoneId: zone,
      hours: b.workingHours,
      durationMinutes: s.durationMinutes,
      fromDate,
      toDate,
      nowMs: this.clock.now(),
    });
    const today = todayInZone(zone, this.clock.now());
    return previewText(estimate, today >= fromDate && today <= toDate);
  });
  /** Debounced, so typing in a date input does not announce per keystroke. */
  protected readonly preview = toSignal(toObservable(this.previewValue).pipe(debounceTime(300)), {
    initialValue: null,
  });

  private readonly formEl = viewChild<ElementRef<HTMLElement>>('formEl');
  private readonly alert = viewChild<FormAlertComponent>('alert');
  private preselected = false;

  constructor() {
    registerBeforeUnload(this.dirty);
    void this.branches.load();
    void this.services.load();
    reloadOnRecovery(this.branches);
    reloadOnRecovery(this.services);

    // Dates stay disabled until a branch is chosen; fields lock while a request runs.
    effect(() => {
      const locked = this.pending();
      const datesEnabled = this.branchChosen() && !locked;
      untracked(() => {
        const set = (
          c: { enabled: boolean; enable: (o: object) => void; disable: (o: object) => void },
          on: boolean,
        ) => {
          if (on && !c.enabled) c.enable({ emitEvent: false });
          if (!on && c.enabled) c.disable({ emitEvent: false });
        };
        set(this.form.controls.fromDate, datesEnabled);
        set(this.form.controls.toDate, datesEnabled);
        set(this.form.controls.branchId, !locked);
        set(this.form.controls.serviceTypeId, !locked);
        set(this.form.controls.capacity, !locked);
      });
    });

    // ?branchId and ?serviceId preselect a picker only when they name an active record.
    effect(() => {
      if (this.preselected || !this.loaded()) return;
      this.preselected = true;
      const params = this.route.snapshot.queryParamMap;
      const branchId = params.get('branchId');
      const serviceId = params.get('serviceId');
      untracked(() => {
        if (branchId && this.branches.active().some((b) => b.id === branchId)) {
          this.form.controls.branchId.setValue(branchId);
        }
        if (serviceId && this.services.active().some((s) => s.id === serviceId)) {
          this.form.controls.serviceTypeId.setValue(serviceId);
        }
        this.initial.set(generationSnapshot(this.form));
      });
    });
  }

  isDirty(): boolean {
    return this.dirty();
  }

  protected quickRange(days: number): void {
    const today = this.today();
    if (!today) return;
    this.form.patchValue({ fromDate: today, toDate: addDays(today, days - 1) });
  }

  protected generateMore(): void {
    this.summary.set(null);
    this.problem.set(null);
    this.submitAttempted.set(false);
    this.form.patchValue({ fromDate: '', toDate: '' });
    this.form.controls.fromDate.markAsUntouched();
    this.form.controls.toDate.markAsUntouched();
    this.initial.set(generationSnapshot(this.form));
    queueMicrotask(() => document.getElementById('gen-fromDate')?.focus());
  }

  async submit(): Promise<void> {
    if (this.pending() || this.countdown.active() || this.blocked()) return;
    this.submitAttempted.set(true);
    this.problem.set(null);
    this.alertMessage.set(null);
    this.alertReference.set(null);
    if (this.form.invalid) {
      focusFirstInvalid(this.formEl()!, this.injector);
      return;
    }
    const values = this.form.getRawValue();
    const branch = this.branch();
    const service = this.service();
    this.pending.set(true);
    this.summary.set(null);
    try {
      const result = await firstValueFrom(this.api.generateSlots(toGenerateBody(values)));
      this.activity.add(result.createdCount);
      this.summary.set({
        result,
        branch: branch ? `${branch.name} (${branch.code})` : values.branchId,
        service: service ? `${service.name} (${service.code})` : values.serviceTypeId,
        range: `${values.fromDate} to ${values.toDate}`,
      });
      this.initial.set(generationSnapshot(this.form));
      this.form.markAsPristine();
      this.pending.set(false);
    } catch (e) {
      this.pending.set(false);
      this.handleFailure(normalizeError(e), values.branchId);
    }
  }

  private handleFailure(error: AppError, branchId: string): void {
    const outcome = mapGenerateError(error, { branchId });
    switch (outcome.kind) {
      case 'offline':
        break;
      case 'rate-limited':
        this.countdown.startFrom(error);
        break;
      case 'forbidden':
        this.toast.handleError(error);
        break;
      case 'no-schedule':
      case 'branch-inactive':
      case 'service-inactive':
        this.problem.set({ message: outcome.message, link: outcome.link });
        break;
      case 'concurrent':
        this.problem.set({ message: outcome.message, retry: true });
        break;
      case 'branch-not-found':
        this.problem.set({ message: outcome.message });
        void this.branches.load({ force: true });
        break;
      case 'service-not-found':
        this.problem.set({ message: outcome.message });
        void this.services.load({ force: true });
        break;
      case 'conflict':
        this.problem.set({ message: outcome.message });
        break;
      case 'validation': {
        const mapped = Object.keys(outcome.fields) as FieldName[];
        for (const field of mapped) this.serverErrors[field].set(outcome.fields[field]);
        if (outcome.alert.length > 0) this.alertMessage.set(outcome.alert.join(' '));
        if (mapped.length > 0) focusFirstInvalid(this.formEl()!, this.injector);
        else this.alert()?.focus();
        break;
      }
      case 'other':
        this.alertMessage.set(outcome.message);
        this.alertReference.set(outcome.correlationId ?? null);
        this.alert()?.focus();
        break;
    }
  }

  private view(name: FieldName, hint = false): FieldView {
    return createFieldView({
      id: `gen-${name}`,
      control: this.form.controls[name],
      messages: MESSAGES.generation[name] as Record<string, string>,
      submitAttempted: this.submitAttempted,
      serverError: this.serverErrors[name],
      hint,
    });
  }
}
