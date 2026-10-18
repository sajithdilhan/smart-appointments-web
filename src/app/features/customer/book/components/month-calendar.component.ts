import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import {
  addDays,
  fromEpochMs,
  monthGrid,
  windowMonths,
  type MonthDay,
} from '../../../../core/time';
import { BookingWizardStore } from '../wizard.store';

let nextId = 0;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Monday = 0 … Sunday = 6. */
function mondayOffset(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (fromEpochMs(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return fromEpochMs(Date.UTC(y, m, 0)).getUTCDate();
}

/** Weekday headings, Monday first: "Mon" with "Monday" as its abbreviation. */
function weekdayHeadings(): { short: string; long: string }[] {
  const short = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'short' });
  const long = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', weekday: 'long' });
  // 5 January 2026 is a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const noon = fromEpochMs(Date.UTC(2026, 0, 5 + i, 12));
    return { short: short.format(noon), long: long.format(noon) };
  });
}

/**
 * The month calendar of step 3 (Req 7): a WAI-ARIA date-picker grid over the 14-day booking
 * window that the store already computes (`strip()`, in the branch's zone). Only the window's
 * days are enabled; the previous and next buttons move across the one or two months it touches.
 * One roving tab stop; the arrows move focus (they never select), Home and End go to the
 * first and last bookable day of the week, Page Up and Page Down to the adjacent month, and
 * Enter, Space or a click select through `store.chooseDate`, so the URL, the slot search and
 * the midnight roll-over work as before.
 */
@Component({
  selector: 'app-month-calendar',
  imports: [NgIcon],
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block rounded-2xl border bg-card p-3 text-card-foreground shadow-soft sm:p-4',
    '(keydown)': 'onKeydown($event)',
    '(focusin)': 'onFocusIn($event)',
  },
  template: `
    @if (grid(); as g) {
      <div class="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          class="flex size-9 items-center justify-center rounded-full hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          [disabled]="!hasPrevious()"
          (click)="shiftMonth(-1)"
        >
          <ng-icon name="lucideChevronLeft" size="18" aria-hidden="true" />
        </button>
        <p [id]="titleId" class="font-semibold" aria-live="polite">{{ g.title }}</p>
        <button
          type="button"
          aria-label="Next month"
          class="flex size-9 items-center justify-center rounded-full hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
          [disabled]="!hasNext()"
          (click)="shiftMonth(1)"
        >
          <ng-icon name="lucideChevronRight" size="18" aria-hidden="true" />
        </button>
      </div>
      <table
        role="grid"
        class="w-full table-fixed border-collapse text-center"
        [attr.aria-labelledby]="titleId"
      >
        <thead>
          <tr>
            @for (h of headings; track h.long) {
              <th
                scope="col"
                [attr.abbr]="h.long"
                class="pb-1 text-xs font-medium text-muted-foreground"
              >
                {{ h.short }}
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (week of g.weeks; track week[0].date) {
            <tr>
              @for (d of week; track d.date) {
                <td
                  role="gridcell"
                  class="p-0.5"
                  [attr.aria-selected]="d.inMonth && d.bookable ? store.date() === d.date : null"
                >
                  @if (d.inMonth) {
                    <button
                      type="button"
                      class="mx-auto flex aspect-square w-full max-w-10 items-center justify-center rounded-full text-sm font-medium"
                      [class]="dayClass(d)"
                      [attr.data-date]="d.date"
                      [attr.aria-label]="label(d)"
                      [attr.aria-current]="d.isToday ? 'date' : null"
                      [attr.tabindex]="d.date === tabDate() ? 0 : -1"
                      [disabled]="!d.bookable"
                      (click)="select(d)"
                    >
                      {{ d.day }}
                    </button>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class MonthCalendarComponent {
  protected readonly store = inject(BookingWizardStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly titleId = `month-calendar-title-${nextId++}`;
  protected readonly headings = weekdayHeadings();

  /** First and last bookable day: today in the branch's zone and the 13 days after it. */
  private readonly window = computed(() => {
    const strip = this.store.strip();
    return strip.length > 0 ? { first: strip[0].date, last: strip[strip.length - 1].date } : null;
  });
  private readonly months = computed(() => {
    const w = this.window();
    return w ? windowMonths(w.first, w.last) : [];
  });

  /** The month on show ("yyyy-MM"): the selected day's, else today's; the arrows move it. */
  private readonly shown = linkedSignal<string>(() =>
    (this.store.date() ?? this.store.todayInBranch() ?? '').slice(0, 7),
  );
  private readonly visibleMonth = computed(() => {
    const months = this.months();
    const shown = this.shown();
    return months.includes(shown) ? shown : (months[0] ?? '');
  });

  protected readonly grid = computed(() => {
    const w = this.window();
    const ym = this.visibleMonth();
    if (!w || !ym) return null;
    const [y, m] = ym.split('-').map(Number);
    return monthGrid(y, m, w.first, w.last);
  });

  protected readonly hasPrevious = computed(() => this.months().indexOf(this.visibleMonth()) > 0);
  protected readonly hasNext = computed(() => {
    const months = this.months();
    const i = months.indexOf(this.visibleMonth());
    return i >= 0 && i < months.length - 1;
  });

  /** The day that has focus within the grid; follows the selection until the user moves. */
  private readonly focused = linkedSignal<string | null>(() => this.store.date());

  /** The one day with `tabindex="0"`: the focused day, else the selected one, else the first. */
  protected readonly tabDate = computed(() => {
    const g = this.grid();
    if (!g) return null;
    const days = g.weeks.flat().filter((d) => d.inMonth && d.bookable);
    const wanted = [this.focused(), this.store.date()];
    for (const date of wanted) {
      if (date && days.some((d) => d.date === date)) return date;
    }
    return days[0]?.date ?? null;
  });

  protected label(d: MonthDay): string {
    return d.isToday ? `Today, ${d.fullLabel}` : d.fullLabel;
  }

  protected dayClass(d: MonthDay): string {
    if (!d.bookable) return 'cursor-default text-muted-foreground/60';
    const base =
      this.store.date() === d.date
        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
        : 'text-foreground hover:bg-accent';
    return d.isToday ? `${base} ring-2 ring-primary/50 ring-offset-2 ring-offset-card` : base;
  }

  protected select(d: MonthDay): void {
    if (!d.bookable || d.date === this.store.date()) return;
    this.store.chooseDate(d.date);
  }

  protected shiftMonth(step: -1 | 1): void {
    const months = this.months();
    const next = months[months.indexOf(this.visibleMonth()) + step];
    if (next) this.shown.set(next);
  }

  protected onFocusIn(event: FocusEvent): void {
    const date = (event.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset['date'];
    if (date) this.focused.set(date);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const w = this.window();
    const current = (event.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset[
      'date'
    ];
    if (!w || !current || event.altKey || event.ctrlKey || event.metaKey) return;
    const clamp = (d: string) => (d < w.first ? w.first : d > w.last ? w.last : d);

    let target: string | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        target = clamp(addDays(current, -1));
        break;
      case 'ArrowRight':
        target = clamp(addDays(current, 1));
        break;
      case 'ArrowUp':
        target = clamp(addDays(current, -7));
        break;
      case 'ArrowDown':
        target = clamp(addDays(current, 7));
        break;
      case 'Home':
        target = clamp(addDays(current, -mondayOffset(current)));
        break;
      case 'End':
        target = clamp(addDays(current, 6 - mondayOffset(current)));
        break;
      case 'PageUp':
      case 'PageDown': {
        const months = this.months();
        const next =
          months[months.indexOf(current.slice(0, 7)) + (event.key === 'PageUp' ? -1 : 1)];
        if (next) {
          const day = Math.min(Number(current.slice(8)), daysInMonth(next));
          target = clamp(`${next}-${pad(day)}`);
        }
        break;
      }
      default:
        return; // Enter and Space activate the focused button natively.
    }
    event.preventDefault();
    if (target) this.moveTo(target);
  }

  /** Focus a day (switching the month if needed); never selects it. */
  private moveTo(date: string): void {
    this.focused.set(date);
    this.shown.set(date.slice(0, 7));
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus(),
      { injector: this.injector },
    );
  }
}
