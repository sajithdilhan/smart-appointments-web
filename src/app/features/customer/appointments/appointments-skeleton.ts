import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmSkeleton } from '@app/shared/ui/skeleton';

/** Three placeholder cards of a real card's height; the parent sets `aria-busy`. */
@Component({
  selector: 'app-appointments-skeleton',
  imports: [HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-hidden="true" class="flex flex-col gap-2">
      @for (n of [1, 2, 3]; track n) {
        <div hlmSkeleton class="h-24 w-full rounded-lg sm:h-20"></div>
      }
    </div>
  `,
})
export class AppointmentsSkeleton {}
