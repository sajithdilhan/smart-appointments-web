import { inject } from '@angular/core';
import { ConfirmService } from '../ui/confirm-dialog';
import { BranchDayStore } from './branch-day.store';
import type { BranchDayRow } from './day-row';
import { confirmNoShow } from './no-show-confirm';

export interface RowMarks {
  /** One click, no confirmation (Req 3.3). */
  complete(row: BranchDayRow): Promise<void>;
  /** Asks first (Req 3.4); a failure that is not `409`/`404` keeps the dialog open with the message. */
  noShow(row: BranchDayRow): Promise<void>;
}

/**
 * Connects a row's actions to the page's `BranchDayStore`: the toasts, the announcement and the
 * reload live in the store's `mark`. Call it once, in an injection context.
 */
export function createRowMarks(): RowMarks {
  const store = inject(BranchDayStore);
  const confirm = inject(ConfirmService);
  return {
    async complete(row) {
      await store.mark(row.id, 'complete');
    },
    async noShow(row) {
      await confirmNoShow(confirm, row, async () => {
        const result = await store.mark(row.id, 'no-show', { quietFailure: true });
        // 409 and 404 were toasted and reloaded by the store; anything else stays in the dialog.
        if (result.ok === false && !result.reloaded) throw result.error;
      });
    },
  };
}
