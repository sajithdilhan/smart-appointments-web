import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmAlertDialogImports } from '@app/shared/ui/alert-dialog';

/**
 * The confirm dialog of Req 6.2: an `alertdialog` whose open state follows the detail store's
 * `confirming` phase. "Keep appointment" has the initial focus; Escape and the backdrop act
 * as Keep (the dialog's own close is reported as `keep` while the phase is still confirming).
 */
@Component({
  selector: 'app-cancel-dialog',
  imports: [HlmAlertDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-alert-dialog
      [state]="open() ? 'open' : 'closed'"
      autoFocus="[data-initial-focus]"
      (closed)="onClosed()"
    >
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Cancel this appointment?</h2>
          <p hlmAlertDialogDescription>{{ description() }}</p>
        </hlm-alert-dialog-header>
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel data-initial-focus (click)="keep.emit()">
            Keep appointment
          </button>
          <button hlmAlertDialogAction variant="destructive" (click)="confirm.emit()">
            Cancel appointment
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class CancelDialog {
  readonly open = input.required<boolean>();
  /** "<service> at <branch>, <date and time zone label>". */
  readonly description = input.required<string>();
  readonly confirm = output<void>();
  readonly keep = output<void>();

  protected onClosed(): void {
    if (this.open()) this.keep.emit();
  }
}
