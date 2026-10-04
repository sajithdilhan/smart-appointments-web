import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { ApiClient } from './api-client';

const BASE = 'http://gw.test:5290';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
  });
  return TestBed.inject(ApiClient);
}

describe('ApiClient', () => {
  it('builds absolute URLs and rejects a path without a leading slash', () => {
    const api = setup();
    expect(api.url('/api/x?y=1')).toBe(`${BASE}/api/x?y=1`);
    expect(() => api.url('api/x')).toThrow();
  });

  it('adds no Idempotency-Key and preserves a caller-supplied one', async () => {
    let headers: Headers | undefined;
    server.use(
      http.post(`${BASE}/api/things`, ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({ ok: true });
      }),
    );
    const api = setup();
    await firstValueFrom(api.post('/api/things', { a: 1 }));
    expect(headers!.has('idempotency-key')).toBe(false);
    await firstValueFrom(
      api.post('/api/things', { a: 1 }, { headers: { 'Idempotency-Key': 'k-1' } }),
    );
    expect(headers!.get('idempotency-key')).toBe('k-1');
  });

  it('sets Content-Type only when there is a body', async () => {
    let contentType: string | null = 'unset';
    server.use(
      http.post(`${BASE}/api/empty`, ({ request }) => {
        contentType = request.headers.get('content-type');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await firstValueFrom(setup().post('/api/empty'), { defaultValue: null });
    expect(contentType).toBeNull();
  });

  it('supports query params, put, delete and postFull', async () => {
    server.use(
      http.get(`${BASE}/api/q`, ({ request }) =>
        HttpResponse.json({ q: new URL(request.url).searchParams.get('a') }),
      ),
      http.put(`${BASE}/api/r`, () => HttpResponse.json({ m: 'put' })),
      http.delete(`${BASE}/api/r`, () => HttpResponse.json({ m: 'delete' })),
      http.post(`${BASE}/api/full`, () =>
        HttpResponse.json({ id: 1 }, { status: 201, headers: { Location: `${BASE}/api/full/1` } }),
      ),
    );
    const api = setup();
    expect(await firstValueFrom(api.get('/api/q', { params: { a: 'z' } }))).toEqual({ q: 'z' });
    expect(await firstValueFrom(api.put('/api/r', {}))).toEqual({ m: 'put' });
    expect(await firstValueFrom(api.delete('/api/r'))).toEqual({ m: 'delete' });
    const full = await firstValueFrom(api.postFull<{ id: number }>('/api/full', {}));
    expect(full.status).toBe(201);
    expect(full.headers.get('Location')).toBe(`${BASE}/api/full/1`);
    expect(full.body).toEqual({ id: 1 });
  });
});
