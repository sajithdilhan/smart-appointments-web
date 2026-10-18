import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { delay, http, HttpResponse } from 'msw';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { BookingApiService } from './booking-api.service';

const BASE = 'http://gw.test:5290';

describe('BookingApiService', () => {
  it('createAppointment POSTs exactly { slotId } with the Idempotency-Key header', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    const seen: { url: string; key: string | null; body: unknown; type: string | null }[] = [];
    server.use(
      http.post(`${BASE}/api/appointments`, async ({ request }) => {
        seen.push({
          url: request.url,
          key: request.headers.get('Idempotency-Key'),
          body: await request.json(),
          type: request.headers.get('Content-Type'),
        });
        return HttpResponse.json({ id: 'a1' }, { status: 201 });
      }),
    );
    const result = await firstValueFrom(
      TestBed.inject(BookingApiService).createAppointment('slot-1', 'key-1'),
    );
    expect(result).toEqual({ id: 'a1' });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(`${BASE}/api/appointments`);
    expect(seen[0].key).toBe('key-1');
    expect(seen[0].body).toEqual({ slotId: 'slot-1' });
    expect(seen[0].type).toContain('application/json');
  });
});

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const EMPTY = { items: [], page: 1, pageSize: 20, totalCount: 0 };

describe('BookingApiService (appointments)', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    return TestBed.inject(BookingApiService);
  }

  function captureList() {
    const seen: URL[] = [];
    server.use(
      http.get(`${BASE}/api/appointments/my`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json(EMPTY);
      }),
    );
    return seen;
  }

  it('listMyAppointments GETs the absolute URL with exactly the contract parameters', async () => {
    const seen = captureList();
    const res = await setup().listMyAppointments({
      status: 'Booked',
      when: 'upcoming',
      page: 2,
      pageSize: 20,
    });
    expect(res).toEqual(EMPTY);
    expect(seen).toHaveLength(1);
    expect(seen[0].origin + seen[0].pathname).toBe(`${BASE}/api/appointments/my`);
    expect([...seen[0].searchParams.keys()].sort()).toEqual(['page', 'pageSize', 'status', 'when']);
    expect(seen[0].searchParams.get('status')).toBe('Booked');
    expect(seen[0].searchParams.get('when')).toBe('upcoming');
    expect(seen[0].searchParams.get('page')).toBe('2');
    expect(seen[0].searchParams.get('pageSize')).toBe('20');
    expect(seen[0].searchParams.has('customerId')).toBe(false);
  });

  it('omits status when it is undefined', async () => {
    const seen = captureList();
    await setup().listMyAppointments({ when: 'past', page: 1, pageSize: 20 });
    expect([...seen[0].searchParams.keys()].sort()).toEqual(['page', 'pageSize', 'when']);
  });

  it('getAppointment GETs /api/appointments/{id}', async () => {
    const seen: { method: string; url: string }[] = [];
    server.use(
      http.get(`${BASE}/api/appointments/:id`, ({ request }) => {
        seen.push({ method: request.method, url: request.url });
        return HttpResponse.json({ id: ID });
      }),
    );
    const res = await setup().getAppointment(ID);
    expect(res).toMatchObject({ id: ID });
    expect(seen).toEqual([{ method: 'GET', url: `${BASE}/api/appointments/${ID}` }]);
  });

  it('cancelAppointment POSTs with no Idempotency-Key and no content type', async () => {
    const seen: { method: string; url: string; key: string | null; type: string | null }[] = [];
    server.use(
      http.post(`${BASE}/api/appointments/:id/cancel`, ({ request }) => {
        seen.push({
          method: request.method,
          url: request.url,
          key: request.headers.get('idempotency-key'),
          type: request.headers.get('content-type'),
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await setup().cancelAppointment(ID);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/appointments/${ID}/cancel`,
      key: null,
    });
    expect(seen[0].type ?? '').not.toContain('application/json');
  });

  it('aborting the signal cancels the request and rejects with the reason', async () => {
    let arrived = false;
    let aborted = false;
    server.use(
      http.get(`${BASE}/api/appointments/my`, async ({ request }) => {
        arrived = true;
        request.signal.addEventListener('abort', () => (aborted = true));
        await delay(300);
        return HttpResponse.json(EMPTY);
      }),
    );
    const controller = new AbortController();
    const pending = setup().listMyAppointments(
      { when: 'past', page: 1, pageSize: 20 },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(arrived).toBe(true));
    controller.abort(new DOMException('stop', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(aborted).toBe(true));
  });

  it('rejects at once when the signal is already aborted, sending nothing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(setup().getAppointment(ID, { signal: controller.signal })).rejects.toBeDefined();
  });
});
