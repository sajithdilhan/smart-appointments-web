import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, inject } from '@angular/core';
import {
  HlmAlertDialog,
  HlmAlertDialogAction,
  HlmAlertDialogCancel,
  HlmAlertDialogContent,
  HlmAlertDialogDescription,
  HlmAlertDialogFooter,
  HlmAlertDialogHeader,
  HlmAlertDialogPortal,
  HlmAlertDialogTitle,
} from '@app/shared/ui/alert-dialog';
import { ConfirmService } from './confirm.service';

/** The one confirmation dialog, driven by `ConfirmService`; never used directly. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [
    NgTemplateOutlet,
    HlmAlertDialog,
    HlmAlertDialogPortal,
    HlmAlertDialogContent,
    HlmAlertDialogHeader,
    HlmAlertDialogTitle,
    HlmAlertDialogDescription,
    HlmAlertDialogFooter,
    HlmAlertDialogCancel,
    HlmAlertDialogAction,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-alert-dialog
      [state]="svc.state() ? 'open' : 'closed'"
      [disableClose]="!!svc.state()?.pending"
      autoFocus="[data-initial-focus]"
      (closed)="svc.cancel()"
    >
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        @if (svc.state(); as s) {
          <hlm-alert-dialog-header>
            <h2 hlmAlertDialogTitle>{{ s.options.title }}</h2>
            <div hlmAlertDialogDescription>
              @if (isText(s.options.body)) {
                {{ s.options.body }}
              } @else {
                <ng-container [ngTemplateOutlet]="template(s.options.body)" />
              }
            </div>
          </hlm-alert-dialog-header>
          @if (s.error) {
            <p role="alert" class="text-sm text-destructive">{{ s.error }}</p>
          }
          <hlm-alert-dialog-footer>
            <button
              hlmAlertDialogCancel
              type="button"
              [disabled]="s.pending"
              [attr.data-initial-focus]="s.options.initialFocus !== 'confirm' ? '' : null"
              (click)="svc.cancel()"
            >
              {{ s.options.cancelLabel ?? 'Cancel' }}
            </button>
            <button
              hlmAlertDialogAction
              type="button"
              [variant]="s.options.destructive ? 'destructive' : 'default'"
              [disabled]="s.pending"
              [attr.aria-busy]="s.pending ? 'true' : null"
              [attr.data-initial-focus]="s.options.initialFocus === 'confirm' ? '' : null"
              (click)="svc.accept()"
            >
              {{ s.options.confirmLabel }}
            </button>
          </hlm-alert-dialog-footer>
        }
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class ConfirmDialog {
  protected readonly svc = inject(ConfirmService);

  protected isText(body: unknown): body is string {
    return typeof body === 'string';
  }

  protected template(body: unknown): TemplateRef<unknown> {
    return body as TemplateRef<unknown>;
  }
}
