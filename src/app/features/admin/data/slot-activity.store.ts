import { Injectable, signal } from '@angular/core';

/** Slots generated in this browser session. In memory only: the backend has no admin slot count. */
@Injectable()
export class SlotActivityStore {
  readonly createdThisSession = signal(0);
  /** How many generations ran, so "created 0" is distinguishable from "never generated". */
  readonly generations = signal(0);

  add(created: number): void {
    this.createdThisSession.update((n) => n + created);
    this.generations.update((n) => n + 1);
  }

  reset(): void {
    this.createdThisSession.set(0);
    this.generations.set(0);
  }
}
