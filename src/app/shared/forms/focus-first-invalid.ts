import { afterNextRender, ElementRef, Injector } from '@angular/core';

/**
 * Focuses the first `[aria-invalid="true"]` element in DOM order, after the next render so the
 * host bindings of the current pass are applied before the query.
 */
export function focusFirstInvalid(host: ElementRef<HTMLElement> | HTMLElement, injector: Injector) {
  const root = host instanceof ElementRef ? host.nativeElement : host;
  afterNextRender(() => root.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), {
    injector,
  });
}
