import type { Page, Route } from '@playwright/test';
import type { BackendReply, BookingBackend } from '../src/testing/booking-backend';
import { API, CORS } from './mock-backend';

export interface BookingRecorder {
  /** Every `POST /api/appointments` the page sent, in order. */
  readonly creates: { key: string | null; body: unknown }[];
  /** Every slot search (`branchId|serviceId|date`) the page sent. */
  readonly searches: string[];
}

function reply(route: Route, result: BackendReply) {
  if (result.drop) return route.abort('failed');
  const correlation = route.request().headers()['x-correlation-id'];
  return route.fulfill({
    status: result.status,
    headers: {
      ...CORS,
      ...result.headers,
      ...(correlation ? { 'x-correlation-id': correlation } : {}),
      'content-type': result.status >= 400 ? 'application/problem+json' : 'application/json',
    },
    body: JSON.stringify(result.body ?? null),
  });
}

/**
 * Mocks the Availability and Booking endpoints of the gateway over the stateful booking model
 * of the unit tests (`src/testing/booking-backend.ts`), so the end-to-end flows exercise the
 * same rules: idempotency replay, overlap, capacity and the injectable faults. Register it
 * after `mockBackend`: the auth routes it does not handle fall back to that mock.
 */
export async function mockBooking(page: Page, backend: BookingBackend): Promise<BookingRecorder> {
  const recorder: BookingRecorder = { creates: [], searches: [] };
  await page.route(`${API}/api/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(request.url());
    const path = url.pathname.toLowerCase();
    if (path === '/api/branches') return reply(route, backend.listBranches());
    if (path === '/api/services') return reply(route, backend.listServices());
    if (path === '/api/slots/available') {
      const q = url.searchParams;
      recorder.searches.push(`${q.get('branchId')}|${q.get('serviceId')}|${q.get('date')}`);
      return reply(
        route,
        backend.searchSlots({
          branchId: q.get('branchId') ?? undefined,
          serviceId: q.get('serviceId') ?? undefined,
          date: q.get('date') ?? undefined,
        }),
      );
    }
    if (path === '/api/appointments' && request.method() === 'POST') {
      const key = request.headers()['idempotency-key'] ?? null;
      const body = request.postDataJSON() as unknown;
      recorder.creates.push({ key, body });
      return reply(route, backend.createAppointment(key, body));
    }
    return route.fallback();
  });
  return recorder;
}
