import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { CtaButtonsComponent } from './cta-buttons.component';
import { HeroSceneComponent } from './hero-scene.component';
import { HeroPreviewComponent } from './hero-preview.component';

/** The landing hero: the page's only `<h1>`, the calls to action and a decorative preview. */
@Component({
  selector: 'app-hero',
  imports: [FocusHeadingDirective, CtaButtonsComponent, HeroPreviewComponent, HeroSceneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {}
