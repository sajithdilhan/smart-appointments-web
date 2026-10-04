import { HttpClient, HttpContext } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AppError } from './app-error';
import { OUTAGE_PROBE } from './http-context';
import { provideCoreHttp } from './http.providers';
import { OutageState } from './outage-state';

const BASE = 'http://gw.test:5290';
const OTHER = 'https://other.example';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideCoreHttp(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
  });
  return { client: TestBed.inject(HttpClient), outage: TestBed.inject(OutageState) };
}

/** Under fake timers the request only progresses as fake time moves; step until it is in flight. */
async function started(flag: { called: boolean }): Promise<void> {
  for (let i = 0; i < 200 && !flag.called; i++) await vi.advanceTimersByTimeAsync(1);
  expect(flag.called).toBe(true);
}

async function failureOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected the request to fail');
}

describe('HTTP pipeline', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('correlation id', () => {
    it('adds a UUID for the API origin only', async () => {
      const seen: Record<string, string | null> = {};
      server.use(
        http.get(`${BASE}/api/x`, ({ request }) => {
          seen['api'] = request.headers.get('x-correlation-id');
          return HttpResponse.json({});
        }),
        http.get(`${OTHER}/x`, ({ request }) => {
          seen['other'] = request.headers.get('x-correlation-id');
          seen['otherAuth'] = request.headers.get('authorization');
          return HttpResponse.json({});
        }),
      );
      const { client } = setup();
      await firstValueFrom(client.get(`${BASE}/api/x`));
      await firstValueFrom(client.get(`${OTHER}/x`));
      expect(seen['api']).toMatch(/^[0-9a-f-]{36}$/);
      expect(seen['other']).toBeNull();
      expect(seen['otherAuth']).toBeNull();
    });

    it('keeps an existing id', async () => {
      let id: string | null = null;
      server.use(
        http.get(`${BASE}/api/x`, ({ request }) => {
          id = request.headers.get('x-correlation-id');
          return HttpResponse.json({});
        }),
      );
      await firstValueFrom(
        setup().client.get(`${BASE}/api/x`, { headers: { 'X-Correlation-ID': 'mine' } }),
      );
      expect(id).toBe('mine');
    });

    it('puts the response id on the AppError, and the sent id on a network failure', async () => {
      server.use(
        http.get(`${BASE}/api/fail`, () =>
          HttpResponse.json(
            { status: 500, detail: 'boom' },
            { status: 500, headers: { 'X-Correlation-ID': 'resp-1' } },
          ),
        ),
        http.get(`${BASE}/api/down`, () => HttpResponse.error()),
      );
      const { client } = setup();
      const e1 = await failureOf(firstValueFrom(client.get(`${BASE}/api/fail`)));
      expect(e1).toBeInstanceOf(AppError);
      expect(e1).toMatchObject({ status: 500, message: 'boom', correlationId: 'resp-1' });
      let sent: string | undefined;
      const e2 = await failureOf(
        firstValueFrom(
          client.get(`${BASE}/api/down`, { headers: { 'X-Correlation-ID': (sent = 'sent-9') } }),
        ),
      );
      expect(e2).toMatchObject({ kind: 'network', status: 0, correlationId: sent });
    });
  });

  it('sends no credentials', async () => {
    server.use(http.get(`${BASE}/api/x`, () => HttpResponse.json({})));
    const spy = vi.spyOn(globalThis, 'fetch');
    await firstValueFrom(setup().client.get(`${BASE}/api/x`));
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.credentials).not.toBe('include');
    }
  });

  describe('errors', () => {
    it('maps HttpResponse.error() to a network AppError', async () => {
      server.use(http.get(`${BASE}/api/x`, () => HttpResponse.error()));
      const e = await failureOf(firstValueFrom(setup().client.get(`${BASE}/api/x`)));
      expect(e).toMatchObject({ kind: 'network', status: 0 });
    });

    it('times out after 30 seconds', async () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      });
      const hit = { called: false };
      server.use(
        http.get(`${BASE}/api/slow`, () => {
          hit.called = true;
          return new Promise<Response>(() => undefined);
        }),
      );
      const { client } = setup();
      const pending = failureOf(firstValueFrom(client.get(`${BASE}/api/slow`)));
      await started(hit);
      await vi.advanceTimersByTimeAsync(29_000);
      let settled = false;
      void pending.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await pending).toMatchObject({ kind: 'timeout', status: 0 });
    });
  });

  describe('outage state', () => {
    it.each([502, 503, 504])('is set by %i', async (status) => {
      server.use(http.get(`${BASE}/api/x`, () => HttpResponse.json({}, { status })));
      const { client, outage } = setup();
      await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      expect(outage.down()).toBe(true);
    });

    it('is set by a network failure', async () => {
      server.use(http.get(`${BASE}/api/x`, () => HttpResponse.error()));
      const { client, outage } = setup();
      await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      expect(outage.down()).toBe(true);
    });

    it('is set by a timeout', async () => {
      vi.useFakeTimers({
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      });
      const hit = { called: false };
      server.use(
        http.get(`${BASE}/api/slow`, () => {
          hit.called = true;
          return new Promise<Response>(() => undefined);
        }),
      );
      const { client, outage } = setup();
      const pending = failureOf(firstValueFrom(client.get(`${BASE}/api/slow`)));
      await started(hit);
      await vi.advanceTimersByTimeAsync(31_000);
      await pending;
      expect(outage.down()).toBe(true);
    });

    it.each([400, 401, 403, 404, 409, 429, 500])('is not set by %i', async (status) => {
      server.use(http.get(`${BASE}/api/x`, () => HttpResponse.json({}, { status })));
      const { client, outage } = setup();
      const error = await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      expect({ down: outage.down(), kind: error.kind, status: error.status }).toEqual({
        down: false,
        kind: error.kind,
        status,
      });
    });

    it('is cleared by a later success, once, counting the recovery', async () => {
      let up = false;
      server.use(
        http.get(`${BASE}/api/x`, () =>
          up ? HttpResponse.json({}) : HttpResponse.json({}, { status: 503 }),
        ),
      );
      const { client, outage } = setup();
      await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      expect(outage.down()).toBe(true);
      expect(outage.recovered()).toBe(0);
      up = true;
      await firstValueFrom(client.get(`${BASE}/api/x`));
      await firstValueFrom(client.get(`${BASE}/api/x`));
      expect(outage.down()).toBe(false);
      expect(outage.recovered()).toBe(1);
    });

    it('is cleared by a 4xx response too (the server answered)', async () => {
      let status = 503;
      server.use(http.get(`${BASE}/api/x`, () => HttpResponse.json({}, { status })));
      const { client, outage } = setup();
      await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      status = 404;
      await failureOf(firstValueFrom(client.get(`${BASE}/api/x`)));
      expect(outage.down()).toBe(false);
    });

    it('is never set by a failing probe', async () => {
      server.use(http.get(`${BASE}/healthz`, () => HttpResponse.error()));
      const { client, outage } = setup();
      const context = new HttpContext().set(OUTAGE_PROBE, true);
      await failureOf(firstValueFrom(client.get(`${BASE}/healthz`, { context })));
      expect(outage.down()).toBe(false);
    });
  });
});
