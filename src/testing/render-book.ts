import type { RequestHandler } from 'msw';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BookingWizardStore } from '../app/features/customer/book/wizard.store';
import { APP_CONFIG } from '../app/core/config/app-config';
import { provideCoreHttp } from '../app/core/http/http.providers';
import { AppTitleStrategy } from '../app/core/routing/app-title.strategy';
import { CLOCK } from '../app/core/util/clock';
import { availabilityHandlers } from './availability.handlers';
import {
  BRANCH_IDS,
  DEFAULT_NOW_MS,
  SERVICE_IDS,
  createBookingBackend,
  type BookingBackend,
} from './booking-backend';
import { bookingHandlers } from './booking.handlers';
import {
  createFakeSession,
  createFakeToast,
  provideFakeSession,
  type FakeSession,
  type FakeToast,
} from './fake-session';
import { ManualClock } from './manual-clock';
import { server } from './server';
import { stubViewport } from './stub-viewport';

export const BOOK_BASE = 'http://gw.test:5290';

export interface RenderBookOptions {
  /** Where to start, for example `/book?branch=...`. Defaults to `/book`. */
  url?: string;
  nowMs?: number;
  backend?: BookingBackend;
  /** Viewport width in CSS pixels; defaults to a desktop 1280. */
  width?: number;
  status?: 'authenticated' | 'unknown' | 'anonymous';
  /** Skip waiting for the first HTTP work, to look at a loading state. Defaults to true. */
  settle?: boolean;
  /** Handlers that take precedence over the model's (a delayed or failing endpoint). */
  handlers?: RequestHandler[];
  /** Runs after the providers exist and before the first navigation (install spies here). */
  beforeNavigate?: (router: Router) => void;
}

export interface RenderedBook {
  harness: RouterTestingHarness;
  backend: BookingBackend;
  clock: ManualClock;
  session: FakeSession;
  toast: FakeToast;
  router: Router;
  /** The wizard store of the rendered route. */
  store: () => InstanceType<typeof BookingWizardStore>;
  /** Navigates and waits for the router and the pending HTTP work. */
  go: (url: string) => Promise<void>;
}

const routes: Routes = [
  { path: 'book', loadChildren: () => import('../app/features/customer/book/book.routes') },
  { path: 'appointments', children: [] },
  { path: 'login', children: [] },
];

/**
 * Renders the booking wizard's route with the real HTTP pipeline against the stateful booking
 * model (`createBookingBackend`), a manual clock at a fixed instant, a signed-in Customer and
 * the title strategy. Call `vi.unstubAllGlobals()` in `afterEach`.
 */
export async function renderBook(options: RenderBookOptions = {}): Promise<RenderedBook> {
  stubViewport(options.width ?? 1280);
  const nowMs = options.nowMs ?? DEFAULT_NOW_MS;
  const backend = options.backend ?? createBookingBackend({ nowMs });
  const clock = new ManualClock(nowMs);
  const session = createFakeSession(options.status ?? 'authenticated', 'Customer');
  const toast = createFakeToast();
  server.use(
    ...(options.handlers ?? []),
    ...availabilityHandlers(backend, BOOK_BASE),
    ...bookingHandlers(backend, BOOK_BASE),
  );
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      provideCoreHttp(),
      { provide: TitleStrategy, useClass: AppTitleStrategy },
      { provide: APP_CONFIG, useValue: { apiBaseUrl: BOOK_BASE } },
      { provide: CLOCK, useValue: clock },
      ...provideFakeSession(session, toast),
    ],
  });
  const router = TestBed.inject(Router);
  options.beforeNavigate?.(router);
  const harness = await RouterTestingHarness.create();
  const go = async (url: string) => {
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
  };
  if (options.settle === false) await harness.navigateByUrl(options.url ?? '/book');
  else await go(options.url ?? '/book');
  return {
    harness,
    backend,
    clock,
    session,
    toast,
    router,
    store: () => harness.routeDebugElement!.injector.get(BookingWizardStore),
    go,
  };
}

/** The first slot of a branch, service and date in the model (ids are deterministic). */
export function firstSlot(
  backend: BookingBackend,
  where: { branchId?: string; serviceId?: string; date: string },
) {
  const found = [...backend.state.slots.values()]
    .filter(
      (s) =>
        s.branchId === (where.branchId ?? BRANCH_IDS.london) &&
        s.serviceTypeId === (where.serviceId ?? SERVICE_IDS.checkup) &&
        s.date === where.date,
    )
    .sort((a, b) => a.startMs - b.startMs)[0];
  if (!found) throw new Error(`no slot on ${where.date}`);
  return found;
}
