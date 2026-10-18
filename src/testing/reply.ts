import { HttpResponse } from 'msw';
import type { BackendReply } from './booking-backend';

/** One response shape for every handler: echo the correlation id, problem+json for errors. */
export function toResponse(reply: BackendReply, request: Request): Response {
  if (reply.drop) return HttpResponse.error();
  const headers = new Headers(reply.headers);
  const correlation = request.headers.get('X-Correlation-ID');
  if (correlation) headers.set('X-Correlation-ID', correlation);
  if (reply.status >= 400) {
    headers.set('Content-Type', 'application/problem+json');
    return new HttpResponse(JSON.stringify(reply.body), { status: reply.status, headers });
  }
  headers.set('Content-Type', 'application/json');
  return new HttpResponse(JSON.stringify(reply.body ?? null), { status: reply.status, headers });
}
