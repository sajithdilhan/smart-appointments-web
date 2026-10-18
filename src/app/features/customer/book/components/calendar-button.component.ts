import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarPlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@app/shared/ui/button';
import { CLOCK } from '../../../../core/util/clock';
import { fromEpochMs, hhmm, parseUtc } from '../../../../core/time';
import { ToastService } from '../../../../core/notify/toast.service';
import type { Booked } from '../wizard.store';

export const CALENDAR_ERROR = 'We could not create the calendar file.';

/**
 * "Add to calendar" (Req 10): generates the `.ics` on the client, with no network request, and
 * downloads it. The generator and the download helper are loaded with `import()` on the first
 * click, so they are their own lazy chunk (shared later with the appointment detail). A failure
 * is one error toast and never throws.
 */
@Component({
  selector: 'app-calendar-button',
  imports: [HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideCalendarPlus })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button hlmBtn type="button" (click)="add()">
      <ng-icon name="lucideCalendarPlus" aria-hidden="true" />
      Add to calendar
      <span class="sr-only">download .ics file</span>
    </button>
  `,
})
export class CalendarButtonComponent {
  readonly booked = input.required<Booked>();
  private readonly toast = inject(ToastService);
  private readonly clock = inject(CLOCK);

  protected async add(): Promise<void> {
    const { appointment, branch, service, slot } = this.booked();
    try {
      const [{ buildIcs, icsFileName }, { downloadIcs }] = await Promise.all([
        import('../../shared/ics/build-ics'),
        import('../../shared/ics/ics-download'),
      ]);
      const start = parseUtc(appointment.startUtc);
      const text = buildIcs(
        {
          appointmentId: appointment.id,
          startUtc: start,
          endUtc: parseUtc(appointment.endUtc),
          serviceName: service.name,
          branchName: branch.name,
          branchAddress: branch.address,
          branchPhone: branch.phoneNumber,
          localStart: hhmm(slot.localStartTime),
          zoneId: branch.timeZoneId ?? 'UTC',
        },
        fromEpochMs(this.clock.now()),
      );
      if (!downloadIcs(text, icsFileName(branch.code, start))) this.fail();
    } catch {
      this.fail();
    }
  }

  private fail(): void {
    this.toast.showError({ status: 0, kind: 'http', message: CALENDAR_ERROR });
  }
}
