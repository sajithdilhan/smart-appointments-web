import { http, type RequestHandler } from 'msw';
import type { BookingBackend } from './booking-backend';
import { toResponse } from './reply';

/** `GET /api/branches`, `/api/services` and `/api/slots/available` over the backend model. */
export function availabilityHandlers(backend: BookingBackend, baseUrl: string): RequestHandler[] {
  const at = (path: string) => `${baseUrl}${path}`;
  return [
    http.get(at('/api/Branches'), ({ request }) => toResponse(backend.listBranches(), request)),
    http.get(at('/api/Services'), ({ request }) => toResponse(backend.listServices(), request)),
    http.get(at('/api/Slots/available'), ({ request }) => {
      const q = new URL(request.url).searchParams;
      const reply = backend.searchSlots({
        branchId: q.get('branchId') ?? undefined,
        serviceId: q.get('serviceId') ?? undefined,
        date: q.get('date') ?? undefined,
      });
      return toResponse(reply, request);
    }),
  ];
}
