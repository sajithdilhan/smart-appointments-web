import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendar, lucideCircleCheck, lucideMapPin } from '@ng-icons/lucide';

/** A decorative "Appointment Confirmed!" card. Hidden from assistive tech and not focusable. */
@Component({
  selector: 'app-hero-preview',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleCheck, lucideMapPin, lucideCalendar })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      aria-hidden="true"
      inert
      class="w-full max-w-xs rounded-2xl border bg-card p-5 text-card-foreground shadow-lifted"
    >
      <p class="flex items-center gap-2.5 text-base font-bold">
        <ng-icon name="lucideCircleCheck" size="26" class="shrink-0 text-success" />
        Appointment Confirmed!
      </p>
      <div class="mt-4 flex items-start gap-3">
        <ng-icon name="lucideMapPin" size="18" class="mt-0.5 shrink-0 text-primary" />
        <div>
          <p class="text-sm font-semibold">Downtown Branch</p>
          <p class="text-sm text-muted-foreground">General consultation</p>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <ng-icon name="lucideCalendar" size="18" class="shrink-0 text-primary" />
        <p class="text-sm font-semibold">12 Oct 2026</p>
        <span
          class="ms-auto rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success-soft-foreground"
          >10:00 AM</span
        >
      </div>
      <hr class="my-4 border-border" />
      <p class="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
        <ng-icon name="lucideCircleCheck" size="16" />
        Confirmed
      </p>
    </div>
  `,
})
export class HeroPreviewComponent {}
