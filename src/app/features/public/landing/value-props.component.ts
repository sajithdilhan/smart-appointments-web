import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarCheck, lucideMapPin, lucideShieldCheck, lucideZap } from '@ng-icons/lucide';

interface ValueProp {
  readonly icon: string;
  readonly tile: string;
  readonly title: string;
  readonly text: string;
}

@Component({
  selector: 'app-value-props',
  imports: [NgIcon],
  providers: [provideIcons({ lucideZap, lucideCalendarCheck, lucideMapPin, lucideShieldCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-labelledby="value-props-heading"
      class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <h2 id="value-props-heading" class="text-2xl font-bold tracking-tight sm:text-3xl">
        Why choose us?
      </h2>
      <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @for (item of items; track item.title) {
          <li class="rounded-2xl border bg-card p-5 text-card-foreground shadow-soft">
            <span class="flex size-11 items-center justify-center rounded-xl" [class]="item.tile">
              <ng-icon [name]="item.icon" size="22" aria-hidden="true" />
            </span>
            <h3 class="mt-4 text-base font-semibold">{{ item.title }}</h3>
            <p class="mt-1 text-sm text-muted-foreground">{{ item.text }}</p>
          </li>
        }
      </ul>
    </section>
  `,
})
export class ValuePropsComponent {
  protected readonly items: readonly ValueProp[] = [
    {
      icon: 'lucideZap',
      tile: 'bg-tile-lavender text-tile-lavender-foreground',
      title: 'Fast & easy booking',
      text: 'Book in seconds, anytime.',
    },
    {
      icon: 'lucideCalendarCheck',
      tile: 'bg-tile-blue text-tile-blue-foreground',
      title: 'Instant confirmation',
      text: 'Get your booking details immediately.',
    },
    {
      icon: 'lucideMapPin',
      tile: 'bg-tile-mint text-tile-mint-foreground',
      title: 'Multiple branches',
      text: 'Find a branch near you.',
    },
    {
      icon: 'lucideShieldCheck',
      tile: 'bg-tile-peach text-tile-peach-foreground',
      title: 'Flexible cancellation',
      text: 'Cancel online anytime, hassle-free.',
    },
  ];
}
