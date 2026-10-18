import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmInput } from '@app/shared/ui/input';
import { parseStatus, type ListView, type SortState } from './list-view';

export interface SortOption {
  readonly key: string;
  readonly dir: 'asc' | 'desc';
  readonly label: string;
}

const encode = (s: SortState): string => (s ? `${s.key}:${s.dir}` : 'name:asc');

/**
 * Search box, status filter and (for the card layout, where there are no column headers) a
 * labelled sort select. Every control has a visible label.
 */
@Component({
  selector: 'app-list-toolbar',
  imports: [HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-end gap-3">
      <label class="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
        {{ searchLabel() }}
        <input
          hlmInput
          type="search"
          autocomplete="off"
          [value]="view().q()"
          (input)="view().q.set($any($event.target).value)"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm font-medium">
        Status
        <select
          class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          [value]="view().status()"
          (change)="view().status.set(parse($any($event.target).value))"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      @if (sortOptions().length > 0) {
        <label class="flex flex-col gap-1 text-sm font-medium">
          Sort by
          <select
            class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            [value]="current()"
            (change)="onSort($any($event.target).value)"
          >
            @for (o of sortOptions(); track o.key + o.dir) {
              <option [value]="o.key + ':' + o.dir">{{ o.label }}</option>
            }
          </select>
        </label>
      }
    </div>
  `,
})
export class ListToolbar {
  readonly view = input.required<Pick<ListView<unknown>, 'q' | 'status' | 'sort'>>();
  readonly searchLabel = input.required<string>();
  /** Offered only in the card layout; empty hides the select. */
  readonly sortOptions = input<readonly SortOption[]>([]);

  protected parse = parseStatus;
  protected current(): string {
    return encode(this.view().sort());
  }
  protected onSort(value: string): void {
    const [key, dir] = value.split(':');
    this.view().sort.set(
      key === 'name' && dir === 'asc' ? null : { key, dir: dir as 'asc' | 'desc' },
    );
  }
}
