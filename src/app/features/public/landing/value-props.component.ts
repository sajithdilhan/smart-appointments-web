import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarCheck,
  lucideCalendarSearch,
  lucideCalendarX,
  lucideGlobe,
} from '@ng-icons/lucide';

interface ValueProp {
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}

@Component({
  selector: 'app-value-props',
  imports: [NgIcon],
  providers: [
    provideIcons({ lucideCalendarSearch, lucideCalendarCheck, lucideGlobe, lucideCalendarX }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      aria-labelledby="value-props-heading"
      class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <h2 id="value-props-heading" class="text-2xl font-semibold tracking-tight sm:text-3xl">
        Booking, without the back and forth
      </h2>
      <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @for (item of items; track item.title) {
          <li class="rounded-xl border bg-card p-5 text-card-foreground shadow-soft">
            <ng-icon [name]="item.icon" size="24" class="text-primary" aria-hidden="true" />
            <h3 class="mt-3 text-base font-semibold">{{ item.title }}</h3>
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
      icon: 'lucideCalendarSearch',
      title: 'See real availability',
      text: 'Only open times are shown, so what you pick is what you get.',
    },
    {
      icon: 'lucideCalendarCheck',
      title: 'Confirmed straight away',
      text: 'Your appointment is booked the moment you confirm it.',
    },
    {
      icon: 'lucideGlobe',
      title: 'Times that make sense',
      text: "Shown in the branch's own time zone.",
    },
    {
      icon: 'lucideCalendarX',
      title: 'Cancel when plans change',
      text: 'Free up your slot any time before it starts.',
    },
  ];
}
