import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CtaButtonsComponent } from './cta-buttons.component';

@Component({
  selector: 'app-cta-band',
  imports: [CtaButtonsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="cta-band-heading" class="border-t bg-accent/60">
      <div
        class="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between"
      >
        <h2 id="cta-band-heading" class="text-2xl font-semibold tracking-tight sm:text-3xl">
          Ready to book?
        </h2>
        <app-cta-buttons />
      </div>
    </section>
  `,
})
export class CtaBandComponent {}
