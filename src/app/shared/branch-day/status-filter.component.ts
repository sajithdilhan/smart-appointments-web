import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { parseStatusFilter, STATUS_FILTERS, type StatusFilter } from './day-params';

let nextId = 0;

/** The status filter of the day list (Req 2.5): a labelled native select. */
@Component({
  selector: 'app-status-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1">
      <label [for]="selectId" class="text-sm font-medium">Status</label>
      <select
        [id]="selectId"
        class="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        (change)="onChange($event)"
      >
        @for (f of filters; track f.value) {
          <option [value]="f.value" [selected]="f.value === value()">{{ f.label }}</option>
        }
      </select>
    </div>
  `,
})
export class StatusFilterSelect {
  readonly value = input<StatusFilter>('all');
  readonly valueChange = output<StatusFilter>();

  protected readonly filters = STATUS_FILTERS;
  protected readonly selectId = `day-status-${nextId++}`;

  protected onChange(event: Event): void {
    this.valueChange.emit(parseStatusFilter((event.target as HTMLSelectElement).value));
  }
}
