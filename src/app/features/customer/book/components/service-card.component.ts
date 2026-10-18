import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideClock } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@app/shared/ui/badge';
import type { ServiceTypeResponse } from '../../../../core/api/models';
import { formatDuration } from '../duration';

/**
 * One service as a radio card (the step puts `appRadioItem` on the host). The name is the
 * accessible name; the description is clamped to two lines and the duration is a text pill.
 * A chosen card shows a check mark as well as the border, so it never relies on colour alone.
 */
@Component({
  selector: 'app-service-card',
  imports: [NgIcon, HlmBadgeImports],
  providers: [provideIcons({ lucideCheck, lucideClock })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex min-h-11 cursor-pointer flex-col gap-2 rounded-xl border border-input bg-card p-4 text-start text-card-foreground hover:bg-accent aria-checked:border-primary aria-checked:ring-2 aria-checked:ring-ring',
    '[attr.aria-labelledby]': 'nameId()',
    '[attr.aria-describedby]': 'durationId()',
  },
  template: `
    <span class="flex items-start justify-between gap-2">
      <span [id]="nameId()" class="text-base font-semibold">{{ service().name }}</span>
      @if (checked()) {
        <ng-icon name="lucideCheck" size="18" class="shrink-0 text-primary" aria-hidden="true" />
      }
    </span>
    @if (service().description) {
      <span class="line-clamp-2 text-sm text-muted-foreground">{{ service().description }}</span>
    }
    <span [id]="durationId()" hlmBadge variant="secondary">
      <ng-icon name="lucideClock" aria-hidden="true" />
      {{ duration() }}
    </span>
  `,
})
export class ServiceCardComponent {
  readonly service = input.required<ServiceTypeResponse>();
  /** Mirrors the radio item's `checked`, to draw the check mark. */
  readonly checked = input(false);

  protected readonly duration = computed(() => formatDuration(this.service().durationMinutes));
  protected readonly nameId = computed(() => `service-${this.service().id}-name`);
  protected readonly durationId = computed(() => `service-${this.service().id}-duration`);
}
