import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { SlotResponse } from '../../../../core/api/models';
import {
  RadioItemDirective,
  RovingRadioGroupDirective,
} from '../../../../shared/a11y/roving-radio-group.directive';
import { groupSlots } from '../day-parts';
import { BookingWizardStore } from '../wizard.store';
import { SlotChipComponent } from './slot-chip.component';

/**
 * The free times grouped by part of the day (Req 6.1, 6.2): headings for the non-empty groups
 * and one radio group over all chips, so the arrow keys move across groups in visual order.
 * A choice is held in the store; only "Continue to review" writes `slot` to the URL.
 */
@Component({
  selector: 'app-slot-groups',
  imports: [RadioItemDirective, RovingRadioGroupDirective, SlotChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [appRadioGroup]="'Available times'"
      (selected)="store.selectSlot($event)"
      class="flex flex-col gap-4"
    >
      @for (g of groups(); track g.part) {
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-muted-foreground">{{ g.heading }}</h3>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            @for (s of g.slots; track s.id) {
              <app-slot-chip
                [appRadioItem]="s.id"
                [checked]="store.selectedSlotId() === s.id"
                [slot]="s"
              />
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class SlotGroupsComponent {
  protected readonly store = inject(BookingWizardStore);
  readonly slots = input.required<readonly SlotResponse[]>();
  protected readonly groups = computed(() => groupSlots(this.slots()));
}
