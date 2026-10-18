import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A decorative mock of the booking summary. Hidden from assistive tech and not focusable. */
@Component({
  selector: 'app-hero-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      aria-hidden="true"
      inert
      class="w-full max-w-sm rounded-xl border bg-card p-5 text-card-foreground shadow-soft"
    >
      <p class="text-sm font-semibold">Downtown Branch</p>
      <p class="text-sm text-muted-foreground">General consultation, 30 min</p>
      <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
        <span class="rounded-md border px-2 py-1.5 text-center">09:30</span>
        <span
          class="rounded-md border border-primary bg-primary px-2 py-1.5 text-center text-primary-foreground"
          >10:00</span
        >
        <span class="rounded-md border px-2 py-1.5 text-center">10:30</span>
      </div>
      <p class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <svg
          viewBox="0 0 16 16"
          class="size-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          focusable="false"
        >
          <path d="M3 8.5l3 3 7-7" />
        </svg>
        Confirmed
      </p>
    </div>
  `,
})
export class HeroPreviewComponent {}
