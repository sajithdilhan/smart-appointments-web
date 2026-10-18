import { effect, inject, untracked } from '@angular/core';
import { OutageState } from '../../../core/http/outage-state';

/**
 * Reloads a store each time the backend comes back from an outage (`OutageState.recovered`), for
 * data that is not keyed on the router. The first run, at registration, is skipped. Call it in an
 * injection context.
 */
export function reloadOnRecovery(store: { load(opts?: { force?: boolean }): Promise<void> }): void {
  const outage = inject(OutageState);
  let first = true;
  effect(() => {
    outage.recovered();
    if (first) {
      first = false;
      return;
    }
    untracked(() => void store.load({ force: true }));
  });
}
