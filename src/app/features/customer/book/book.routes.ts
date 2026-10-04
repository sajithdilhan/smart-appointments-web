import type { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { BookPage } from './book.page';
import { IdempotencyKeyStore } from './idempotency-key.store';
import { SlotSearchService } from './slot-search.service';
import { stepFromParams, stepTitle } from './steps';
import { BookingWizardStore } from './wizard.store';

/**
 * The title follows the step, which follows the query parameters, so the route reruns its
 * resolvers on every parameter change and the F1 title strategy recomputes it. The function
 * must not throw (a throwing title fails the navigation).
 */
function bookTitle(route: ActivatedRouteSnapshot): string {
  try {
    return stepTitle(stepFromParams(route.queryParams));
  } catch {
    return 'Book an appointment';
  }
}

/** Children of the customer shell's `book` route; the shell carries the guards. */
export const BOOK_ROUTES: Routes = [
  {
    path: '',
    component: BookPage,
    title: bookTitle,
    runGuardsAndResolvers: 'paramsOrQueryParamsChange',
    providers: [BookingWizardStore, SlotSearchService, IdempotencyKeyStore],
  },
];

export default BOOK_ROUTES;
