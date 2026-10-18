import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CtaBandComponent } from './cta-band.component';
import { HeroComponent } from './hero.component';
import { HowItWorksComponent } from './how-it-works.component';
import { ValuePropsComponent } from './value-props.component';

/** The public landing page: hero (with the single `<h1>`), value props, steps, closing band. */
@Component({
  selector: 'app-landing-page',
  imports: [HeroComponent, ValuePropsComponent, HowItWorksComponent, CtaBandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-hero />
    <app-value-props />
    <app-how-it-works />
    <app-cta-band />
  `,
})
export class LandingPage {}
