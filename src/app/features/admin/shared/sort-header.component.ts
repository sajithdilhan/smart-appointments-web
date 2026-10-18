import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideArrowUpDown } from '@ng-icons/lucide';

/** A sortable column header: `<th>` with `aria-sort` holding a button named "Sort by {label}". */
@Component({
  // An attribute selector on a native `th` keeps the table's column semantics.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'th[appSortHeader]',
  imports: [NgIcon],
  providers: [provideIcons({ lucideArrowDown, lucideArrowUp, lucideArrowUpDown })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { scope: 'col', '[attr.aria-sort]': 'direction()' },
  template: `
    <button
      type="button"
      class="inline-flex min-h-8 items-center gap-1 rounded-md px-1 font-medium hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
      [attr.aria-label]="'Sort by ' + label()"
      (click)="sortRequested.emit()"
    >
      {{ label() }}
      <ng-icon [name]="icon()" size="14" aria-hidden="true" />
    </button>
  `,
})
export class SortHeader {
  readonly label = input.required<string>();
  readonly direction = input<'ascending' | 'descending' | 'none'>('none');
  readonly sortRequested = output<void>();

  protected icon(): string {
    const d = this.direction();
    return d === 'ascending'
      ? 'lucideArrowUp'
      : d === 'descending'
        ? 'lucideArrowDown'
        : 'lucideArrowUpDown';
  }
}
