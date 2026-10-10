import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  viewChild,
} from '@angular/core';
import {
  RadioItemDirective,
  RovingRadioGroupDirective,
} from '../../../../shared/a11y/roving-radio-group.directive';
import { ViewportService } from '../../../../core/util/viewport.service';
import { BookingWizardStore } from '../wizard.store';

/**
 * The 14-day strip (Req 4): a radio group of day buttons in the branch's zone, "Today" and
 * month labels, the selected day scrolled into view (smooth only without reduced motion).
 * Arrow keys select (WAI-ARIA radio pattern); the debounce and budget of the slot search keep a
 * held key from sending a request per day. The store sets the default date and rolls the strip
 * over at the branch's midnight.
 */
@Component({
  selector: 'app-date-strip',
  imports: [RadioItemDirective, RovingRadioGroupDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #scroller
      class="-mx-4 [scroll-snap-type:x_proximity] [scrollbar-width:thin] overflow-x-auto px-4 pb-2"
    >
      <div
        [appRadioGroup]="'Choose a date'"
        (selected)="store.chooseDate($event)"
        class="flex w-max gap-2"
      >
        @for (day of store.strip(); track day.date) {
          <button
            type="button"
            [appRadioItem]="day.date"
            [checked]="store.date() === day.date"
            [attr.aria-label]="day.isToday ? 'Today, ' + day.fullLabel : day.fullLabel"
            class="flex min-h-16 min-w-16 snap-center flex-col items-center justify-center gap-0.5 rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground hover:bg-accent aria-checked:border-primary aria-checked:bg-primary aria-checked:text-primary-foreground"
          >
            <span class="text-xs">
              @if (day.monthShort) {
                {{ day.monthShort }}
              }
            </span>
            <span class="font-medium">{{ day.weekdayShort }} {{ day.day }}</span>
            <span class="text-xs">{{ day.isToday ? 'Today' : '' }}</span>
          </button>
        }
      </div>
    </div>
  `,
})
export class DateStripComponent {
  protected readonly store = inject(BookingWizardStore);
  private readonly viewport = inject(ViewportService);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    afterRenderEffect(() => {
      const date = this.store.date();
      this.store.strip();
      const checked =
        this.scroller().nativeElement.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!date || !checked || typeof checked.scrollIntoView !== 'function') return;
      checked.scrollIntoView({
        inline: 'center',
        block: 'nearest',
        behavior: this.viewport.prefersReducedMotion() ? 'auto' : 'smooth',
      });
    });
  }
}
