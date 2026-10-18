import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendar,
  lucideClock,
  lucideMail,
  lucideMapPin,
  lucidePencil,
  lucidePhone,
  lucideStethoscope,
} from '@ng-icons/lucide';
import type {
  BranchResponse,
  ServiceTypeResponse,
  SlotResponse,
} from '../../../../core/api/models';
import type { SessionStore } from '../../../../core/auth/session.store';
import { formatInZone, hhmm, parseUtc, zoneDiffersFromBrowser } from '../../../../core/time';
import { formatLongDate } from '../clock-text';
import { formatDuration } from '../duration';
import type { StepId } from '../steps';

export type EditableStep = Extract<StepId, 'branch' | 'service' | 'datetime'>;

type Session = InstanceType<typeof SessionStore>;

export interface ReviewContact {
  email: string;
  phoneNumber: string | null;
}

/**
 * The Contact row's data: the profile's email and phone once it is ready; until then, and when
 * the fetch failed, the session email alone (the row is informative, so there is no error UI).
 */
export function reviewContact(session: Session): ReviewContact | null {
  const profile = session.profile();
  if (session.profileStatus() === 'ready' && profile) {
    return { email: profile.email, phoneNumber: profile.phoneNumber };
  }
  const email = session.user()?.email;
  return email ? { email, phoneNumber: null } : null;
}

/** Starts the profile fetch the first time a screen needs the contact. */
export function loadProfileIfIdle(session: Session): void {
  if (session.profileStatus() === 'idle') void session.loadProfile();
}

/**
 * The "Booking summary" card (F3 Req 7.1, F6 Req 8.1, 8.2): icon rows, separated by dividers,
 * for the branch with address and a phone link, the service with duration, the date and time
 * range in the branch's own wall clock (with the zone and the start in the customer's zone when
 * they differ), and the contact. The review step makes the first three rows editable. It does
 * not claim the slot is still free: the server decides at Confirm (F3 Req 7.8).
 */
@Component({
  selector: 'app-review-card',
  imports: [NgIcon, NgTemplateOutlet],
  providers: [
    provideIcons({
      lucideCalendar,
      lucideClock,
      lucideMail,
      lucideMapPin,
      lucidePencil,
      lucidePhone,
      lucideStethoscope,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-soft',
  },
  template: `
    <h3 class="text-lg font-semibold">Booking summary</h3>
    <div class="flex flex-col divide-y divide-border">
      <div class="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3 first:pt-0">
        <span
          class="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
          aria-hidden="true"
          ><ng-icon name="lucideMapPin" size="18"
        /></span>
        <dl class="flex min-w-0 flex-col gap-0.5">
          <dt class="text-sm text-muted-foreground">Branch</dt>
          <dd class="font-medium">{{ branch().name }}</dd>
          <dd class="text-sm text-muted-foreground">{{ branch().address }}</dd>
          <dd class="flex items-center gap-1.5 text-sm">
            <ng-icon name="lucidePhone" size="16" class="shrink-0" aria-hidden="true" />
            <a class="text-primary underline underline-offset-2" [href]="phoneHref()">
              {{ branch().phoneNumber }}
            </a>
          </dd>
        </dl>
        @if (editable()) {
          <ng-container
            *ngTemplateOutlet="editButton; context: { step: 'branch', name: 'branch' }"
          />
        }
      </div>
      <div class="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3">
        <span
          class="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
          aria-hidden="true"
          ><ng-icon name="lucideStethoscope" size="18"
        /></span>
        <dl class="flex min-w-0 flex-col gap-0.5">
          <dt class="text-sm text-muted-foreground">Service</dt>
          <dd class="font-medium">{{ service().name }}</dd>
          <dd class="text-sm text-muted-foreground">{{ duration() }}</dd>
        </dl>
        @if (editable()) {
          <ng-container
            *ngTemplateOutlet="editButton; context: { step: 'service', name: 'service' }"
          />
        }
      </div>
      <div class="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3">
        <span
          class="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
          aria-hidden="true"
          ><ng-icon name="lucideCalendar" size="18"
        /></span>
        <dl class="flex min-w-0 flex-col gap-0.5">
          <dt class="text-sm text-muted-foreground">Date &amp; time</dt>
          <dd class="font-medium">{{ when() }}</dd>
          @if (zoneNote(); as note) {
            <dd class="text-sm text-muted-foreground">{{ note.zone }}</dd>
            <dd class="flex items-center gap-1.5 text-sm">
              <ng-icon name="lucideClock" size="16" class="shrink-0" aria-hidden="true" />
              {{ note.yours }}
            </dd>
          }
        </dl>
        @if (editable()) {
          <ng-container
            *ngTemplateOutlet="editButton; context: { step: 'datetime', name: 'date and time' }"
          />
        }
      </div>
      @if (contact(); as c) {
        <div class="grid grid-cols-[auto_1fr_auto] items-start gap-3 py-3 last:pb-0">
          <span
            class="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground"
            aria-hidden="true"
            ><ng-icon name="lucideMail" size="18"
          /></span>
          <dl class="flex min-w-0 flex-col gap-0.5">
            <dt class="text-sm text-muted-foreground">Contact</dt>
            <dd class="font-medium break-all">{{ c.email }}</dd>
            @if (c.phoneNumber) {
              <dd class="text-sm text-muted-foreground">{{ c.phoneNumber }}</dd>
            }
          </dl>
        </div>
      }
    </div>
    <p class="text-sm text-muted-foreground">
      You can cancel this appointment from My appointments.
    </p>

    <ng-template #editButton let-step="step" let-name="name">
      <button
        type="button"
        class="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary hover:bg-accent"
        [attr.aria-label]="'Edit ' + name"
        (click)="edit.emit(step)"
      >
        <ng-icon name="lucidePencil" size="14" aria-hidden="true" />
        Edit
      </button>
    </ng-template>
  `,
})
export class ReviewCardComponent {
  readonly branch = input.required<BranchResponse>();
  readonly service = input.required<ServiceTypeResponse>();
  readonly slot = input.required<SlotResponse>();
  readonly branchZone = input.required<string>();
  /** Shows an Edit button on the Branch, Service and Date & time rows. */
  readonly editable = input(false);
  /** The signed-in customer; the Contact row is left out when null. */
  readonly contact = input<ReviewContact | null>(null);
  /** The step the customer wants to change. */
  readonly edit = output<EditableStep>();

  protected readonly duration = computed(() => formatDuration(this.service().durationMinutes));
  protected readonly phoneHref = computed(
    () => `tel:${this.branch().phoneNumber.replace(/[^\d+]/g, '')}`,
  );
  protected readonly when = computed(() => {
    const s = this.slot();
    return `${formatLongDate(s.date)}, ${hhmm(s.localStartTime)} to ${hhmm(s.localEndTime)}`;
  });
  protected readonly zoneNote = computed(() => {
    const s = this.slot();
    const start = parseUtc(s.startAtUtc);
    if (!zoneDiffersFromBrowser(this.branchZone(), start)) return null;
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      zone: `${this.branchZone()} time`,
      yours: `${formatInZone(start, mine, { style: 'time' })} your time`,
    };
  });
}
