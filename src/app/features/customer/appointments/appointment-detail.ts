import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmSheetImports } from '@app/shared/ui/sheet';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import { RateLimitNotice } from '@app/shared/ui/rate-limit-notice';
import { map } from 'rxjs';
import { ToastService } from '../../../core/notify/toast.service';
import { formatInZone, fromEpochMs, parseUtc } from '../../../core/time';
import { CLOCK } from '../../../core/util/clock';
import { buildIcs, icsFileName } from '../shared/ics/build-ics';
import { downloadIcs } from '../shared/ics/ics-download';
import { ReferenceDataStore } from '../shared/reference-data/reference-data.store';
import { toViewModel } from './appointment-view';
import { AppointmentDetailStore } from './appointment-detail.store';
import { CancelDialog } from './cancel-dialog';
import { DetailHost } from './detail-host';
import { InlineError } from './inline-error';
import { AppointmentStatusBadge } from '../../../shared/appointments/appointment-status-badge';

const RETRYABLE_MESSAGE =
  'We could not cancel right now. Nothing was changed. Try again in a moment.';
const SLOT_NOTICE =
  'Your appointment is cancelled. The time slot may take a moment to become available again.';
const STARTED_NOTE = 'This appointment has already started and can no longer be cancelled.';

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * `/appointments/:id`. One component instance whose content is projected into either a sheet
 * over the list or a page (Req 5.1, 5.7); the cancel dialog sits outside both, so a resize
 * keeps the loaded data (the store) and an open dialog (its open state is the store's phase).
 */
@Component({
  selector: 'app-appointment-detail',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    HlmButtonImports,
    HlmSheetImports,
    HlmSkeleton,
    RateLimitNotice,
    CancelDialog,
    InlineError,
    AppointmentStatusBadge,
  ],
  providers: [AppointmentDetailStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-cancel-dialog
      [open]="store.phase().kind === 'confirming'"
      [description]="dialogDescription()"
      (confirm)="store.confirm()"
      (keep)="store.keep()"
    />

    <ng-template #body>
      <div class="flex flex-col gap-4" [attr.aria-busy]="showSkeleton() ? 'true' : null">
        @if (store.load() === 'not-found') {
          <p>We could not find this appointment.</p>
          <a hlmBtn variant="outline" routerLink="/appointments">View all appointments</a>
        } @else if (store.load() === 'error') {
          <app-inline-error [message]="store.error()?.message ?? ''" (retry)="store.reload()" />
        } @else if (showSkeleton()) {
          <div aria-hidden="true" class="flex flex-col gap-3">
            <div hlmSkeleton class="h-6 w-2/3"></div>
            <div hlmSkeleton class="h-5 w-1/2"></div>
            <div hlmSkeleton class="h-5 w-3/4"></div>
            <div hlmSkeleton class="h-5 w-1/3"></div>
          </div>
        } @else if (view(); as v) {
          <div class="flex flex-wrap items-center gap-2">
            <app-appointment-status-badge [status]="v.status" [cancelling]="store.isCancelling()" />
          </div>

          <dl class="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt class="text-muted-foreground">Service</dt>
            <dd>
              {{ v.serviceName }}
              @if (service()?.durationMinutes; as minutes) {
                <span class="text-muted-foreground">({{ minutes }} minutes)</span>
              }
            </dd>

            <dt class="text-muted-foreground">Branch</dt>
            <dd>
              {{ v.branchName }}
              @if (branch(); as b) {
                <span class="block text-muted-foreground">{{ b.address }}</span>
                <span class="block text-muted-foreground">{{ b.phoneNumber }}</span>
              }
            </dd>

            <dt class="text-muted-foreground">When</dt>
            <dd>
              {{ v.dateLabel }}, {{ v.timeRange }}
              @if (v.zoneLabel) {
                {{ v.zoneLabel }}
              }
              @if (v.browserLine) {
                <span class="block text-muted-foreground">{{ v.browserLine }}</span>
              }
            </dd>

            <dt class="text-muted-foreground">Booking reference</dt>
            <dd class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-xs break-all select-all">{{ v.id }}</span>
              <button
                hlmBtn
                variant="outline"
                size="sm"
                type="button"
                (click)="copyReference(v.id)"
              >
                Copy
              </button>
              <span class="sr-only" role="status">{{ copyMessage() }}</span>
            </dd>

            <dt class="text-muted-foreground">Booked on</dt>
            <dd>{{ bookedOn() }}</dd>

            @if (cancelledOn(); as when) {
              <dt class="text-muted-foreground">Cancelled on</dt>
              <dd>{{ when }}</dd>
            }
            @if (completedOn(); as when) {
              <dt class="text-muted-foreground">Completed on</dt>
              <dd>{{ when }}</dd>
            }
            @if (noShowOn(); as when) {
              <dt class="text-muted-foreground">Marked as no-show on</dt>
              <dd>{{ when }}</dd>
            }
          </dl>

          <div class="flex flex-col gap-3">
            @if (store.canCancel()) {
              <div class="flex flex-wrap items-center gap-2">
                <button
                  hlmBtn
                  variant="destructive"
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/90"
                  type="button"
                  [disabled]="store.countdown.active()"
                  (click)="store.openCancel()"
                >
                  Cancel appointment
                </button>
                <app-rate-limit-notice [countdown]="store.countdown" />
              </div>
            } @else if (store.hasStarted() && store.phase().kind !== 'too-late') {
              <p class="text-sm text-muted-foreground">{{ startedNote }}</p>
            }

            @if (v.canAddToCalendar && !store.isCancelling()) {
              <div>
                <button hlmBtn variant="outline" type="button" (click)="addToCalendar()">
                  Add to calendar
                </button>
              </div>
            }

            @switch (store.phase().kind) {
              @case ('too-late') {
                <p role="alert" class="text-sm text-destructive">{{ tooLate }}</p>
              }
              @case ('failed') {
                <p role="alert" class="text-sm text-destructive">{{ failedMessage() }}</p>
              }
              @case ('retryable') {
                <div role="alert" class="flex flex-col gap-2 text-sm">
                  <p>{{ retryable }}</p>
                  <div>
                    <button hlmBtn variant="outline" type="button" (click)="store.retryCancel()">
                      Try again
                    </button>
                  </div>
                </div>
              }
              @case ('cancelled') {
                @if (slotMayBeDelayed()) {
                  <p role="status" class="text-sm text-muted-foreground">{{ slotNotice }}</p>
                }
              }
            }
          </div>
        }
        <p class="sr-only" role="status">{{ store.announcement() }}</p>
      </div>
    </ng-template>

    @if (host.presentation() === 'sheet') {
      <hlm-sheet side="right" state="open" (closed)="host.close(id())">
        <hlm-sheet-content *hlmSheetPortal="let ctx" class="overflow-y-auto">
          <hlm-sheet-header>
            <h2 hlmSheetTitle class="text-lg">Appointment details</h2>
          </hlm-sheet-header>
          <div class="px-4 pb-4">
            <ng-container [ngTemplateOutlet]="body" />
          </div>
        </hlm-sheet-content>
      </hlm-sheet>
    } @else {
      <div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <a
          routerLink="/appointments"
          queryParamsHandling="preserve"
          class="text-sm font-medium text-primary underline"
        >
          Back to my appointments
        </a>
        <h1
          id="appointment-heading"
          tabindex="-1"
          class="text-3xl font-semibold tracking-tight outline-none"
        >
          Appointment details
        </h1>
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
  `,
})
export class AppointmentDetail {
  protected readonly store = inject(AppointmentDetailStore);
  protected readonly host = inject(DetailHost);
  private readonly reference = inject(ReferenceDataStore);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(CLOCK);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);

  protected readonly startedNote = STARTED_NOTE;
  protected readonly tooLate =
    'This appointment has already started, so it can no longer be cancelled.';
  protected readonly retryable = RETRYABLE_MESSAGE;
  protected readonly slotNotice = SLOT_NOTICE;

  protected readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });
  protected readonly copyMessage = signal('');

  protected readonly branch = computed(() => {
    const a = this.store.appointment();
    return a ? this.reference.branchById(a.branchId) : undefined;
  });
  protected readonly service = computed(() => {
    const a = this.store.appointment();
    return a ? this.reference.serviceById(a.serviceTypeId) : undefined;
  });

  private readonly lookupSettled = computed(() =>
    [this.reference.branchesState(), this.reference.servicesState()].every(
      (s) => s === 'ready' || s === 'error',
    ),
  );
  protected readonly showSkeleton = computed(
    () => this.store.load() === 'loading' || !this.lookupSettled(),
  );

  protected readonly view = computed(() => {
    const a = this.store.appointment();
    if (!a) return null;
    return toViewModel(a, {
      tab: 'upcoming',
      // The store's clock reading, so the view and `canCancel` agree.
      now: fromEpochMs(this.store.nowMs()),
      branch: this.branch(),
      service: this.service(),
    });
  });

  protected readonly dialogDescription = computed(() => {
    const v = this.view();
    if (!v) return '';
    const zone = v.zoneLabel ? ` ${v.zoneLabel}` : '';
    return `${v.serviceName} at ${v.branchName}, ${v.dateLabel}, ${v.timeRange}${zone}.`;
  });

  protected readonly bookedOn = computed(() =>
    this.accountTime(this.store.appointment()?.createdAtUtc),
  );
  protected readonly cancelledOn = computed(() => {
    const a = this.store.appointment();
    return a?.status === 'Cancelled' && a.cancelledAtUtc
      ? this.accountTime(a.cancelledAtUtc)
      : null;
  });

  protected readonly completedOn = computed(() => {
    const a = this.store.appointment();
    return a?.status === 'Completed' && a.completedAtUtc
      ? this.accountTime(a.completedAtUtc)
      : null;
  });
  protected readonly noShowOn = computed(() => {
    const a = this.store.appointment();
    return a?.status === 'NoShow' && a.noShowAtUtc ? this.accountTime(a.noShowAtUtc) : null;
  });

  protected readonly slotMayBeDelayed = computed(() => {
    const phase = this.store.phase();
    return phase.kind === 'cancelled' && phase.slotMayBeDelayed;
  });
  protected readonly failedMessage = computed(() => {
    const phase = this.store.phase();
    return phase.kind === 'failed' ? phase.error.message : '';
  });

  constructor() {
    this.reference.ensureBranches();
    this.reference.ensureServices();
    effect(() => {
      const id = this.id();
      untracked(() => void this.store.init(id));
    });
    effect(() => {
      if (this.store.load() === 'not-found') {
        this.title.setTitle('Appointment not found | Smart Appointments');
      }
    });
    afterNextRender(
      () => {
        if (this.host.presentation() === 'page') {
          document.getElementById('appointment-heading')?.focus();
        }
      },
      { injector: this.injector },
    );
  }

  /** Account events (not branch times) are shown in the browser's zone, zone named. */
  private accountTime(utc: string | null | undefined): string {
    if (!utc) return '';
    return formatInZone(parseUtc(utc), browserZone(), { style: 'datetime', showZoneName: true });
  }

  protected async copyReference(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      this.copyMessage.set('Booking reference copied.');
    } catch {
      // The reference stays visible and selectable.
      this.copyMessage.set('Could not copy. Select the reference to copy it.');
    }
  }

  protected addToCalendar(): void {
    const a = this.store.appointment();
    if (!a) return;
    const branch = this.branch();
    const service = this.service();
    const start = parseUtc(a.startUtc);
    const zone = branch?.timeZoneId?.trim();
    const created = buildIcs(
      {
        appointmentId: a.id,
        startUtc: start,
        endUtc: parseUtc(a.endUtc),
        serviceName: service?.name,
        branchName: branch?.name,
        branchAddress: branch?.address,
        branchPhone: branch?.phoneNumber,
        localStart: branch && zone ? formatInZone(start, zone, { style: 'time' }) : undefined,
        zoneId: branch && zone ? zone : undefined,
      },
      fromEpochMs(this.clock.now()),
    );
    if (!downloadIcs(created, icsFileName(branch?.code ?? 'appointment', start))) {
      this.toast.showError({
        status: 0,
        kind: 'http',
        message: 'We could not create the calendar file.',
      });
    }
  }
}
