import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideCircleOff } from '@ng-icons/lucide';
import { HlmBadge } from '@app/shared/ui/badge';

/** "Active" or "Inactive": an icon and text, never colour alone. */
@Component({
  selector: 'app-status-badge',
  imports: [NgIcon, HlmBadge],
  providers: [provideIcons({ lucideCircleCheck, lucideCircleOff })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span hlmBadge [variant]="active() ? 'default' : 'outline'">
      <ng-icon [name]="active() ? 'lucideCircleCheck' : 'lucideCircleOff'" aria-hidden="true" />
      {{ active() ? 'Active' : 'Inactive' }}
    </span>
  `,
})
export class StatusBadge {
  readonly active = input.required<boolean>();
}
