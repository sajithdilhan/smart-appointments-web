import { effect, type Signal } from '@angular/core';

function handler(e: BeforeUnloadEvent): void {
  e.preventDefault();
  e.returnValue = '';
}

/**
 * Asks the browser to confirm closing or reloading the tab while `isDirty()` is true. The listener
 * exists only while dirty and is removed when the form becomes pristine and when the owner is
 * destroyed. Call in an injection context.
 */
export function registerBeforeUnload(isDirty: Signal<boolean>): void {
  effect((onCleanup) => {
    if (!isDirty()) return;
    window.addEventListener('beforeunload', handler);
    onCleanup(() => window.removeEventListener('beforeunload', handler));
  });
}
