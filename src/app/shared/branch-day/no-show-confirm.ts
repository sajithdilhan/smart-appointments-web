import type { ConfirmService } from '../ui/confirm-dialog';
import type { BranchDayRow } from './day-row';

export const NO_SHOW_TITLE = 'Mark as no-show?';
export const NO_SHOW_CONFIRM_LABEL = 'Mark as no-show';
export const NO_SHOW_KEEP_LABEL = 'Keep as booked';
export const NO_SHOW_WARNING =
  'This records that the customer did not attend. It cannot be undone.';

/** The dialog body: it names the customer and the time (Req 3.4). */
export function noShowBody(row: BranchDayRow): string {
  const who = row.customerName
    ? `${row.customerName} at ${row.startLabel}.`
    : `The appointment at ${row.startLabel}.`;
  return `${who} ${NO_SHOW_WARNING}`;
}

/**
 * Asks before recording a no-show (Req 3.4). Focus starts on "Keep as booked"; Escape and Keep
 * send nothing. `run` is the request: while it runs the confirm button is busy, and if it throws
 * the dialog stays open with the error inline. Resolves true once `run` has finished.
 */
export function confirmNoShow(
  confirm: ConfirmService,
  row: BranchDayRow,
  run: () => Promise<void>,
): Promise<boolean> {
  return confirm.confirm({
    title: NO_SHOW_TITLE,
    body: noShowBody(row),
    confirmLabel: NO_SHOW_CONFIRM_LABEL,
    cancelLabel: NO_SHOW_KEEP_LABEL,
    destructive: true,
    initialFocus: 'cancel',
    run,
  });
}
