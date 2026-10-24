import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { HlmButton } from '@app/shared/ui/button';
import { HlmSheetImports } from '@app/shared/ui/sheet';
import { longDateLabel, parseUtc, timeHm, zonedParts } from '../../core/time';
import { ViewportService } from '../../core/util/viewport.service';
import { AppointmentStatusBadge } from '../appointments/appointment-status-badge';
import { BranchDayStore } from './branch-day.store';
import { NAME_UNAVAILABLE, type BranchDayRow } from './day-row';
import { createRowMarks } from './marks';
import { RowActions } from './row-actions.component';

/** "Saturday 24 October 2026, 10:30" in the branch zone. */
export function stampLabel(iso: string, zone: string): string {
  const at = parseUtc(iso);
  return `${longDateLabel(zonedParts(zone, at).date)}, ${timeHm(at, zone)}`;
}

/**
 * The detail panel of one row of the day list (Req 4): a side sheet at 1024 px and wider, a
 * full-width sheet below. It reads the row from the store by id, so it shows the status after a
 * mark's reload, and it has no route of its own: the host keeps the open id. Focus goes back to
 * the button that opened it, or to that row's button if the row was re-rendered meanwhile.
 */
@Component({
  selector: 'app-appointment-sheet',
  imports: [AppointmentStatusBadge, HlmButton, HlmSheetImports, RowActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (row(); as r) {
      <hlm-sheet side="right" state="open" (closed)="close()">
        <hlm-sheet-content *hlmSheetPortal="let ctx" [class]="sheetClass()">
          <hlm-sheet-header>
            <h2 hlmSheetTitle class="text-lg">Appointment details</h2>
          </hlm-sheet-header>
          <div class="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div class="flex flex-wrap items-center gap-2">
              <app-appointment-status-badge [status]="r.status" />
            </div>

            <dl class="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
              <dt class="text-muted-foreground">Customer</dt>
              <dd class="break-words">{{ r.customerName ?? nameUnavailable }}</dd>

              <dt class="text-muted-foreground">Phone</dt>
              <dd>
                @if (r.phone; as phone) {
                  <a [href]="'tel:' + phone" class="text-primary underline">{{ phone }}</a>
                } @else {
                  <span class="text-muted-foreground">Not available</span>
                }
              </dd>

              <dt class="text-muted-foreground">Service</dt>
              <dd class="break-words">
                {{ r.serviceName }}
                <span class="text-muted-foreground">({{ r.durationMinutes }} minutes)</span>
              </dd>

              <dt class="text-muted-foreground">Date</dt>
              <dd>{{ r.dateLabel }}</dd>

              <dt class="text-muted-foreground">Time</dt>
              <dd>
                {{ r.timeRange }}
                @if (zoneLabel(); as zone) {
                  <span class="text-muted-foreground">({{ zone }})</span>
                }
              </dd>

              <dt class="text-muted-foreground">Booked on</dt>
              <dd>{{ stamp(r.createdAtUtc) }}</dd>

              @if (r.cancelledAtUtc; as at) {
                <dt class="text-muted-foreground">Cancelled on</dt>
                <dd>{{ stamp(at) }}</dd>
              }
              @if (r.completedAtUtc; as at) {
                <dt class="text-muted-foreground">Completed on</dt>
                <dd>{{ stamp(at) }}</dd>
              }
              @if (r.noShowAtUtc; as at) {
                <dt class="text-muted-foreground">Marked as no-show on</dt>
                <dd>{{ stamp(at) }}</dd>
              }

              <dt class="text-muted-foreground">Appointment ID</dt>
              <dd class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs break-all select-all">{{ r.id }}</span>
                <button hlmBtn variant="outline" size="sm" type="button" (click)="copyId(r.id)">
                  Copy
                </button>
                <span class="sr-only" role="status">{{ copyMessage() }}</span>
              </dd>
            </dl>

            <app-row-actions
              [row]="r"
              [marking]="store.marking()[r.id] ?? null"
              [nowMs]="store.nowMs()"
              [zone]="store.context.zone()"
              (complete)="marks.complete(r)"
              (noShow)="marks.noShow(r)"
            />
          </div>
        </hlm-sheet-content>
      </hlm-sheet>
    }
  `,
})
export class AppointmentSheet {
  protected readonly store = inject(BranchDayStore);
  private readonly viewport = inject(ViewportService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected readonly marks = createRowMarks();

  /** The open row's id, or null when closed. The host owns it (a page signal, not a route). */
  readonly rowId = input<string | null>(null);
  /** The button that opened the sheet, for the focus return. */
  readonly opener = input<HTMLElement | null>(null);
  readonly closed = output<void>();

  protected readonly nameUnavailable = NAME_UNAVAILABLE;
  protected readonly copyMessage = signal('');
  protected readonly row = computed<BranchDayRow | undefined>(() => {
    const id = this.rowId();
    return id ? this.store.rows().find((r) => r.id === id) : undefined;
  });
  protected readonly zoneLabel = computed(() =>
    this.store.context.zone() === 'UTC' ? 'UTC' : null,
  );
  protected readonly sheetClass = computed(() =>
    this.viewport.isLg()
      ? 'overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md'
      : 'overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-none',
  );

  constructor() {
    // The row left the list (another day, another filter): there is nothing to show any more.
    effect(() => {
      const id = this.rowId();
      if (id && this.store.load() === 'ready' && !this.row()) {
        untracked(() => this.close());
      }
    });
    effect(() => {
      this.rowId();
      this.copyMessage.set('');
    });
  }

  protected stamp(iso: string): string {
    return stampLabel(iso, this.store.context.zone());
  }

  protected close(): void {
    const id = this.rowId();
    const opener = this.opener();
    this.closed.emit();
    afterNextRender(() => this.returnFocus(id, opener), { injector: this.injector });
  }

  protected async copyId(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      this.copyMessage.set('Appointment ID copied.');
    } catch {
      // The id stays visible and selectable.
      this.copyMessage.set('Could not copy. Select the ID to copy it.');
    }
  }

  private returnFocus(id: string | null, opener: HTMLElement | null): void {
    if (opener?.isConnected) {
      opener.focus();
      return;
    }
    const again = Array.from(this.document.querySelectorAll<HTMLElement>('[data-row-open]')).find(
      (el) => el.getAttribute('data-row-open') === id,
    );
    again?.focus();
  }
}
