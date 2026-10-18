import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarCheck } from '@ng-icons/lucide';

/**
 * The logo: a rounded indigo tile with a calendar-check icon, then the "Smart Appointments"
 * wordmark. The icon is decorative. With `compact` only the tile shows and the wordmark stays
 * in the accessibility tree as screen-reader text, so a surrounding link keeps its name.
 */
@Component({
  selector: 'app-brand-mark',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCalendarCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex min-w-0 items-center gap-2' },
  template: `
    <span
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
    >
      <ng-icon name="lucideCalendarCheck" size="18" aria-hidden="true" />
    </span>
    <span [class]="compact() ? 'sr-only' : 'truncate font-bold tracking-tight'">
      Smart Appointments
    </span>
  `,
})
export class BrandMark {
  readonly compact = input(false);
}
