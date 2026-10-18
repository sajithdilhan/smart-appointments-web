import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-how-it-works',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-labelledby="how-it-works-heading"
      class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <h2 id="how-it-works-heading" class="text-2xl font-semibold tracking-tight sm:text-3xl">
        How it works
      </h2>
      <ol class="mt-8 grid gap-6 md:grid-cols-3">
        @for (step of steps; track step) {
          <li class="flex items-center gap-4">
            <span
              aria-hidden="true"
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              >{{ $index + 1 }}</span
            >
            <span class="text-base font-medium">{{ step }}</span>
          </li>
        }
      </ol>
    </section>
  `,
})
export class HowItWorksComponent {
  protected readonly steps = [
    'Choose a branch and service',
    'Pick a day and time',
    'Get confirmed',
  ] as const;
}
