import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';

/**
 * Call in a drawer's constructor. It remembers the element that had focus (the link or button
 * that opened the drawer: routing renders after the click and focus has not moved yet) and
 * returns focus there when the drawer is destroyed. When there is no meaningful opener (a deep
 * link leaves focus on `body`) or it is gone, focus goes to the page heading.
 */
export function restoreFocusOnDestroy(): void {
  const doc = inject(DOCUMENT);
  const opener = doc.activeElement as HTMLElement | null;
  inject(DestroyRef).onDestroy(() => {
    if (opener && opener !== doc.body && opener.isConnected) {
      opener.focus();
      return;
    }
    doc.querySelector<HTMLElement>('h1[appFocusHeading]')?.focus();
  });
}
