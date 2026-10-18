import { http, HttpResponse, type RequestHandler } from 'msw';
import type { AppointmentsBackend, BackendProblem } from '../appointments-backend';

function problemResponse(p: BackendProblem): Response {
  return new HttpResponse(JSON.stringify(p), {
    status: p.status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

/**
 * MSW handlers over an `AppointmentsBackend`. Register with `server.use(...handlers)`; the
 * gateway answers `/api/Branches` and `/api/branches` alike, so both casings are served.
 */
export function appointmentsHandlers(
  baseUrl: string,
  backend: AppointmentsBackend,
): RequestHandler[] {
  const path = (p: string) => `${baseUrl}${p}`;
  const reply = <T>(r: { ok: true; body: T } | { ok: false; problem: BackendProblem }) =>
    r.ok ? HttpResponse.json(r.body as object) : problemResponse(r.problem);

  return [
    http.get(path('/api/appointments/my'), ({ request }) => {
      const q = new URL(request.url).searchParams;
      const read = (name: string): string | null => {
        for (const [k, v] of q) if (k.toLowerCase() === name.toLowerCase()) return v;
        return null;
      };
      return reply(
        backend.list({
          status: read('status'),
          when: read('when'),
          page: read('page'),
          pageSize: read('pageSize'),
        }),
      );
    }),
    http.get(path('/api/appointments/:id'), ({ params }) =>
      reply(backend.get(String(params['id']))),
    ),
    http.post(path('/api/appointments/:id/cancel'), ({ params }) => {
      const outcome = backend.cancel(String(params['id']));
      return outcome.kind === 'no-content'
        ? new HttpResponse(null, { status: 204 })
        : problemResponse(outcome.problem);
    }),
    ...['/api/Branches', '/api/branches'].map((p) =>
      http.get(path(p), () => HttpResponse.json(backend.activeBranches())),
    ),
    ...['/api/Services', '/api/services'].map((p) =>
      http.get(path(p), () => HttpResponse.json(backend.activeServices())),
    ),
  ];
}
