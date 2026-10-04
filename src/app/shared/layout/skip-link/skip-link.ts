import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

/**
 * The first focusable element of every shell. A plain `#main-content` href would resolve
 * against the document's `<base href>` and leave the page, so the click moves focus itself.
 */
@Component({
  selector: 'app-skip-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      href="#main-content"
      class="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      (click)="skip($event)"
    >
      Skip to content
    </a>
  `,
})
export class SkipLink {
  private readonly document = inject(DOCUMENT);

  protected skip(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }
}
