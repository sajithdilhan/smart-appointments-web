import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBan, lucideCalendarCheck, lucideLoaderCircle } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@app/shared/ui/badge';

/**
 * Meaning is in text and icon, never colour alone. A past `Booked` keeps "Booked" with hidden
 * "(past)" text (no invented "Completed"); an unknown status shows its own value, neutral.
 */
@Component({
  selector: 'app-appointment-status-badge',
  imports: [HlmBadgeImports, NgIcon],
  providers: [provideIcons({ lucideBan, lucideCalendarCheck, lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span hlmBadge [variant]="variant()" [class.text-muted-foreground]="mutedPast()">
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
    return 'unknown';
  });
  protected readonly text = computed(() => (this.cancelling() ? 'Cancelling…' : this.status()));
  protected readonly variant = computed(() => (this.kind() === 'booked' ? 'default' : 'secondary'));
  protected readonly mutedPast = computed(() => this.isPast() && this.kind() === 'booked');
}
