import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AvailabilityApiService } from './availability-api.service';

const BASE = 'http://gw.test:5290';
const ID = '0190a1b2-0000-7000-8000-000000000001';

interface Seen {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
  });
  return TestBed.inject(AvailabilityApiService);
}

function capture(
  method: 'get' | 'post' | 'put',
  path: string,
  status = 200,
  reply: unknown = {},
): Seen[] {
  const seen: Seen[] = [];
  server.use(
    http[method](`${BASE}${path}`, async ({ request }) => {
      const text = await request.text();
      seen.push({
        url: request.url,
        method: request.method,
        body: text ? JSON.parse(text) : undefined,
        headers: request.headers,
      });
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json(reply as object, { status });
    }),
  );
  return seen;
}

describe('AvailabilityApiService admin methods', () => {
  it('listBranches GETs with includeInactive in the query string', async () => {
    const seen = capture('get', '/api/Branches', 200, []);
    await firstValueFrom(setup().listBranches({ includeInactive: true }));
    expect(seen[0].method).toBe('GET');
    expect(seen[0].url).toBe(`${BASE}/api/Branches?includeInactive=true`);
    expect(seen[0].body).toBeUndefined();
    expect(seen[0].headers.has('idempotency-key')).toBe(false);
  });

  it('listBranches sends includeInactive=false when asked', async () => {
    const seen = capture('get', '/api/Branches', 200, []);
    await firstValueFrom(setup().listBranches({ includeInactive: false }));
    expect(new URL(seen[0].url).searchParams.get('includeInactive')).toBe('false');
  });

  it('getBranch GETs by id', async () => {
    const seen = capture('get', `/api/Branches/${ID}`, 200, { id: ID });
    expect(await firstValueFrom(setup().getBranch(ID))).toEqual({ id: ID });
    expect(seen[0].url).toBe(`${BASE}/api/Branches/${ID}`);
  });

  it('createBranch POSTs the body', async () => {
    const body = { code: 'PG', name: 'N', description: null, address: 'A', phoneNumber: '+1415' };
    const seen = capture('post', '/api/Branches', 201, { id: ID });
    await firstValueFrom(setup().createBranch(body));
    expect(seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/Branches`, body });
    expect(seen[0].headers.has('idempotency-key')).toBe(false);
  });

  it('updateBranch PUTs the body and accepts a record or an empty response', async () => {
    const body = { name: 'N', description: null, address: 'A', phoneNumber: '+1415' };
    const api = setup();
    const seen = capture('put', `/api/Branches/${ID}`, 200, { id: ID });
    expect(await firstValueFrom(api.updateBranch(ID, body))).toEqual({ id: ID });
    expect(seen[0]).toMatchObject({ method: 'PUT', url: `${BASE}/api/Branches/${ID}`, body });
    capture('put', `/api/Branches/${ID}`, 204);
    expect(await firstValueFrom(api.updateBranch(ID, body))).toBeNull();
  });

  it('setSchedule PUTs timeZoneId and workingHours', async () => {
    const body = {
      timeZoneId: 'Asia/Colombo',
      workingHours: [{ dayOfWeek: 'Monday' as const, opensAt: '09:00', closesAt: '17:00' }],
    };
    const seen = capture('put', `/api/Branches/${ID}/schedule`, 200, { id: ID });
    await firstValueFrom(setup().setSchedule(ID, body));
    expect(seen[0]).toMatchObject({
      method: 'PUT',
      url: `${BASE}/api/Branches/${ID}/schedule`,
      body,
    });
  });

  it.each([
    [true, 'activate'],
    [false, 'deactivate'],
  ])('setBranchActive(%s) POSTs %s with no body and accepts 204', async (active, action) => {
    const seen = capture('post', `/api/Branches/${ID}/${action}`, 204);
    await firstValueFrom(setup().setBranchActive(ID, active), { defaultValue: undefined });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/Branches/${ID}/${action}`,
      body: undefined,
    });
    expect(seen[0].headers.has('idempotency-key')).toBe(false);
  });

  it('listServices GETs with includeInactive', async () => {
    const seen = capture('get', '/api/Services', 200, []);
    await firstValueFrom(setup().listServices({ includeInactive: true }));
    expect(seen[0].url).toBe(`${BASE}/api/Services?includeInactive=true`);
  });

  it('getService GETs by id', async () => {
    const seen = capture('get', `/api/Services/${ID}`, 200, { id: ID });
    await firstValueFrom(setup().getService(ID));
    expect(seen[0].url).toBe(`${BASE}/api/Services/${ID}`);
  });

  it('createService POSTs the body', async () => {
    const body = { code: 'CUT', name: 'Cut', description: null, durationMinutes: 30 };
    const seen = capture('post', '/api/Services', 201, { id: ID });
    await firstValueFrom(setup().createService(body));
    expect(seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/Services`, body });
  });

  it('updateService PUTs the body', async () => {
    const body = { name: 'Cut', description: 'x', durationMinutes: 45 };
    const seen = capture('put', `/api/Services/${ID}`, 200, { id: ID });
    await firstValueFrom(setup().updateService(ID, body));
    expect(seen[0]).toMatchObject({ method: 'PUT', url: `${BASE}/api/Services/${ID}`, body });
  });

  it.each([
    [true, 'activate'],
    [false, 'deactivate'],
  ])('setServiceActive(%s) POSTs %s', async (active, action) => {
    const seen = capture('post', `/api/Services/${ID}/${action}`, 204);
    await firstValueFrom(setup().setServiceActive(ID, active), { defaultValue: undefined });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/Services/${ID}/${action}`,
    });
  });

  it('generateSlots POSTs the range with no Idempotency-Key', async () => {
    const body = {
      branchId: ID,
      serviceTypeId: ID,
      fromDate: '2026-10-05',
      toDate: '2026-10-11',
      capacity: 2,
    };
    const seen = capture('post', '/api/Slots/generate', 200, { createdCount: 3, skippedCount: 1 });
    expect(await firstValueFrom(setup().generateSlots(body))).toEqual({
      createdCount: 3,
      skippedCount: 1,
    });
    expect(seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/Slots/generate`, body });
    expect(seen[0].headers.has('idempotency-key')).toBe(false);
  });
});

describe('AvailabilityApiService booking methods', () => {
  it('branches GETs /api/Branches', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${BASE}/api/Branches`, ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json([{ id: 'b1' }]);
      }),
    );
    expect(await firstValueFrom(setup().branches())).toEqual([{ id: 'b1' }]);
    expect(urls).toEqual([`${BASE}/api/Branches`]);
  });

  it('services GETs /api/Services', async () => {
    server.use(http.get(`${BASE}/api/Services`, () => HttpResponse.json([{ id: 's1' }])));
    expect(await firstValueFrom(setup().services())).toEqual([{ id: 's1' }]);
  });

  it('availableSlots sends branchId, serviceId and date as query parameters', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${BASE}/api/Slots/available`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json([]);
      }),
    );
    await firstValueFrom(
      setup().availableSlots({ branchId: 'b-1', serviceId: 's-1', date: '2026-10-05' }),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].pathname).toBe('/api/Slots/available');
    expect(Object.fromEntries(seen[0].searchParams)).toEqual({
      branchId: 'b-1',
      serviceId: 's-1',
      date: '2026-10-05',
    });
  });
});
