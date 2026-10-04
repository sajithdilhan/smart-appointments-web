import { Injectable, signal } from '@angular/core';

/**
 * The seam between the admin shell and a command palette a later phase (F5) provides. F1
 * registers no palette and handles no keyboard shortcut: while `available()` is false the shell
 * shows no search button. F5 sets `available` when its palette exists, reacts to `requests`
 * (a counter, so each click is a new value) and owns Ctrl/Cmd K.
 */
@Injectable({ providedIn: 'root' })
export class PaletteLauncher {
  readonly available = signal(false);
  readonly requests = signal(0);

  request(): void {
    this.requests.update((n) => n + 1);
  }
}
