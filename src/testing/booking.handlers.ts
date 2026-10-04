import { http, type RequestHandler } from 'msw';
import type { BookingBackend } from './booking-backend';
import { toResponse } from './reply';

/** `POST /api/appointments` over the backend model. */
export function bookingHandlers(backend: BookingBackend, baseUrl: string): RequestHandler[] {
  return [
    http.post(`${baseUrl}/api/appointments`, async ({ request }) => {
      let body: unknown = null;
      try {
        body = await request.json();
      } catch {
        /* no or invalid JSON body */
      }
      return toResponse(
        backend.createAppointment(request.headers.get('Idempotency-Key'), body),
        request,
      );
    }),
  ];
}
