import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClock } from '@ng-icons/lucide';
import { HlmBadgeImports } from '@app/shared/ui/badge';
import type { ServiceTypeResponse } from '../../../../core/api/models';
import { formatDuration } from '../duration';

/**
 * One service as a radio card (the step puts `appRadioItem` on the host). The name is the
 * accessible name; the description is clamped to two lines and the duration is a text pill.
 * A chosen card shows a filled radio dot as well as the border and fill, so it never relies on colour alone.
 */
@Component({
  selector: 'app-service-card',
  imports: [NgIcon, HlmBadgeImports],
  providers: [provideIcons({ lucideClock })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'group flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-input bg-card p-4 text-start text-card-foreground hover:bg-accent aria-checked:border-primary aria-checked:bg-accent/50 aria-checked:ring-1 aria-checked:ring-primary',
    '[attr.aria-labelledby]': 'nameId()',
    '[attr.aria-describedby]': 'durationId()',
  },
  template: `
    <span
      aria-hidden="true"
      class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-input group-aria-checked:border-primary"
    >
      <span class="size-2 rounded-full group-aria-checked:bg-primary"></span>
    </span>
    <span class="flex min-w-0 flex-1 flex-col gap-2">
      <span [id]="nameId()" class="text-base font-semibold">{{ service().name }}</span>
      @if (service().description) {
        <span class="line-clamp-2 text-sm text-muted-foreground">{{ service().description }}</span>
      }
      <span [id]="durationId()" hlmBadge variant="secondary" class="self-start">
        <ng-icon name="lucideClock" aria-hidden="true" />
        {{ duration() }}
      </span>
    </span>
  `,
})
export class ServiceCardComponent {
  readonly service = input.required<ServiceTypeResponse>();
  /** Mirrors the radio item's `checked` (the host's `aria-checked` styles the dot). */
  readonly checked = input(false);

  protected readonly duration = computed(() => formatDuration(this.service().durationMinutes));
  protected readonly nameId = computed(() => `service-${this.service().id}-name`);
  protected readonly durationId = computed(() => `service-${this.service().id}-duration`);
}
