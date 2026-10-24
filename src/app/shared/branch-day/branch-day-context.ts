import { InjectionToken, type Signal } from '@angular/core';

/**
 * What a host (the staff page, the admin appointments page) tells the day-list engine. Provide it
 * with `{ provide: BRANCH_DAY_CONTEXT, useFactory: ... }` on the page, next to `BranchDayStore`.
 */
export interface BranchDayContext {
  /** The branch whose day is shown; null while none is chosen (the store then requests nothing). */
  branchId: Signal<string | null>;
  /** The branch's IANA zone, 'UTC' when it has none (Req 1.6). */
  zone: Signal<string>;
  /** Service names by id; a missing id shows "Unavailable service" (Req 2.4). */
  services: Signal<ReadonlyMap<string, { name: string }>>;
}

export const BRANCH_DAY_CONTEXT = new InjectionToken<BranchDayContext>('BRANCH_DAY_CONTEXT');
