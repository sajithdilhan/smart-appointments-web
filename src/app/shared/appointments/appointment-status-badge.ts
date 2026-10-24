import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBan,
  lucideCalendarCheck,
  lucideCircleCheck,
  lucideLoaderCircle,
  lucideUserX,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@app/shared/ui/badge';

/**
 * Meaning is in text and icon, never colour alone. A past `Booked` keeps "Booked" with hidden
 * "(past)" text (no invented "Completed"); `Completed` and `NoShow` come from the server; an
 * unknown status shows its own value, neutral.
 */
@Component({
  selector: 'app-appointment-status-badge',
  imports: [HlmBadgeImports, NgIcon],
  providers: [
    provideIcons({
      lucideBan,
      lucideCalendarCheck,
      lucideCircleCheck,
      lucideLoaderCircle,
      lucideUserX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span hlmBadge [variant]="variant()">
      @switch (kind()) {
        @case ('cancelling') {
          <ng-icon name="lucideLoaderCircle" aria-hidden="true" class="motion-safe:animate-spin" />
        }
        @case ('booked') {
          <ng-icon name="lucideCalendarCheck" aria-hidden="true" />
        }
        @case ('cancelled') {
          <ng-icon name="lucideBan" aria-hidden="true" />
        }
        @case ('completed') {
          <ng-icon name="lucideCircleCheck" aria-hidden="true" />
        }
        @case ('no-show') {
          <ng-icon name="lucideUserX" aria-hidden="true" />
        }
      }
      {{ text() }}
      @if (mutedPast()) {
        <span class="sr-only">(past)</span>
      }
    </span>
  `,
})
export class AppointmentStatusBadge {
  readonly status = input.required<string>();
  /** The item came from the Past tab. */
  readonly isPast = input(false);
  /** The optimistic state while a cancel is pending. */
  readonly cancelling = input(false);

  protected readonly kind = computed(() => {
    if (this.cancelling()) return 'cancelling';
    if (this.status() === 'Booked') return 'booked';
    if (this.status() === 'Cancelled') return 'cancelled';
    if (this.status() === 'Completed') return 'completed';
    if (this.status() === 'NoShow') return 'no-show';
    return 'unknown';
  });
  protected readonly text = computed(() => {
    if (this.cancelling()) return 'Cancelling…';
    if (this.kind() === 'no-show') return 'No-show';
    return this.status();
  });
  protected readonly variant = computed(() => {
    switch (this.kind()) {
      case 'completed':
        return 'success';
      case 'no-show':
        return 'warning';
      case 'booked':
        return this.isPast() ? 'muted' : 'default';
      default:
        return 'muted';
    }
  });
  protected readonly mutedPast = computed(() => this.isPast() && this.kind() === 'booked');
}
