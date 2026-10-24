import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { BranchDayStore } from './branch-day.store';

/** The polite live region for mark outcomes (Req 3.7); the store clears the text after 5 s. */
@Component({
  selector: 'app-day-announcer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p role="status" class="sr-only">{{ store.announcement() }}</p>`,
})
export class DayAnnouncer {
  protected readonly store = inject(BranchDayStore);
}
