import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmAlertImports } from '@app/shared/ui/alert';
import { HlmButtonImports } from '@app/shared/ui/button';
import { OutageState } from '../../../core/http/outage-state';

/**
 * In-flow (never fixed, so it cannot cover the mobile tab bar) notice shown while the backend
 * looks unreachable. The alert role announces it when it is inserted; focus does not move.
 */
@Component({
  selector: 'app-outage-banner',
  imports: [HlmAlertImports, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (outage.down()) {
      <div
        hlmAlert
        class="flex items-center justify-between gap-3 rounded-none border-0 border-b border-warning bg-warning text-warning-foreground"
      >
        <p>Service temporarily unavailable. Some features may not work.</p>
        <button
          hlmBtn
          type="button"
          size="sm"
          class="bg-warning-foreground text-warning hover:bg-warning-foreground/90"
          [disabled]="outage.probing()"
          [attr.aria-busy]="outage.probing() ? 'true' : null"
          (click)="outage.retry()"
        >
          Retry
        </button>
      </div>
    }
  `,
})
export class OutageBanner {
  protected readonly outage = inject(OutageState);
}
