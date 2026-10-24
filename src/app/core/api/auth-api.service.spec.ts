import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { http, HttpResponse } from 'msw';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AuthApiService } from './auth-api.service';

const BASE = 'http://gw.test:5290';

interface Seen {
  url: string;
  method: string;
  body: unknown;
  contentType: string | null;
}

describe('AuthApiService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    return TestBed.inject(AuthApiService);
  }

  /** Records the verb, URL and parsed body of every request that arrives. */
  function capture(method: 'get' | 'post', path: string, status = 200, body: unknown = {}) {
    const seen: Seen[] = [];
    server.use(
      http[method](`${BASE}${path}`, async ({ request }) => {
        const text = await request.text();
        seen.push({
          url: request.url,
          method: request.method,
          body: text ? JSON.parse(text) : undefined,
          contentType: request.headers.get('content-type'),
        });
        return status === 204
          ? new HttpResponse(null, { status })
          : HttpResponse.json(body as object, { status });
      }),
    );
    return seen;
  }

  it('register POSTs the body to an absolute URL', async () => {
    const reply = { userId: '1', email: 'a@b.c', role: 'Customer' };
    const seen = capture('post', '/api/Auth/register', 201, reply);
    const req = { firstName: 'A', lastName: 'B', email: 'a@b.c', phoneNumber: '1', password: 'x' };
    expect(await firstValueFrom(setup().register(req))).toEqual(reply);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: `${BASE}/api/Auth/register`, body: req });
    expect(seen[0].contentType).toContain('application/json');
  });

  it('login POSTs email and password', async () => {
    const seen = capture('post', '/api/Auth/login', 200, { accessToken: 'a', refreshToken: 'r' });
    await firstValueFrom(setup().login({ email: 'a@b.c', password: 'p' }));
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/Auth/login`,
      body: { email: 'a@b.c', password: 'p' },
    });
  });

  it('refresh POSTs the refresh token', async () => {
    const seen = capture('post', '/api/Auth/refresh', 200, {
      accessToken: 'a',
      refreshToken: 'r2',
    });
    const res = await firstValueFrom(setup().refresh('r1'));
    expect(res).toMatchObject({ refreshToken: 'r2' });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/Auth/refresh`,
      body: { refreshToken: 'r1' },
    });
  });

  it('logout POSTs the refresh token and accepts 204', async () => {
    const seen = capture('post', '/api/Auth/logout', 204);
    await firstValueFrom(setup().logout('r1'), { defaultValue: undefined });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/Auth/logout`,
      body: { refreshToken: 'r1' },
    });
  });

  it('me GETs the profile with no body', async () => {
    const profile = {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.c',
      phoneNumber: null,
      isActive: true,
    };
    const seen = capture('get', '/api/Auth/me', 200, profile);
    expect(await firstValueFrom(setup().me())).toEqual(profile);
    expect(seen[0]).toMatchObject({ method: 'GET', url: `${BASE}/api/Auth/me`, body: undefined });
  });
});

describe('AuthApiService (staff)', () => {
  const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
  const BRANCH = '9b8c7d6e-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
  const PAGE = { items: [], page: 1, pageSize: 100, totalCount: 0 };

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    return TestBed.inject(AuthApiService);
  }

  function capture(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    status = 200,
    reply: object = {},
  ) {
    const seen: (Seen & { search: URLSearchParams })[] = [];
    server.use(
      http[method](`${BASE}${path}`, async ({ request }) => {
        const text = await request.text();
        seen.push({
          url: request.url,
          method: request.method,
          body: text ? JSON.parse(text) : undefined,
          contentType: request.headers.get('content-type'),
          search: new URL(request.url).searchParams,
        });
        return status === 204
          ? new HttpResponse(null, { status })
          : HttpResponse.json(reply, { status });
      }),
    );
    return seen;
  }

  it('listStaff GETs with the filters, page and pageSize', async () => {
    const seen = capture('get', '/api/auth/staff', 200, PAGE);
    const res = await setup().listStaff({
      branchId: BRANCH,
      isActive: false,
      page: 2,
      pageSize: 100,
    });
    expect(res).toEqual(PAGE);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('GET');
    expect(seen[0].url.split('?')[0]).toBe(`${BASE}/api/auth/staff`);
    expect(seen[0].search.get('branchId')).toBe(BRANCH);
    expect(seen[0].search.get('isActive')).toBe('false');
    expect(seen[0].search.get('page')).toBe('2');
    expect(seen[0].search.get('pageSize')).toBe('100');
  });

  it('listStaff leaves the filters out when not given', async () => {
    const seen = capture('get', '/api/auth/staff', 200, PAGE);
    await setup().listStaff({ page: 1, pageSize: 100 });
    expect([...seen[0].search.keys()].sort()).toEqual(['page', 'pageSize']);
  });

  it('listStaff rejects when its signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      setup().listStaff({ page: 1, pageSize: 100 }, { signal: controller.signal }),
    ).rejects.toBeDefined();
  });

  it('getStaff GETs /api/auth/staff/{id}', async () => {
    const seen = capture('get', `/api/auth/staff/${ID}`, 200, { id: ID });
    expect(await firstValueFrom(setup().getStaff(ID))).toEqual({ id: ID });
    expect(seen.map((s) => [s.method, s.url])).toEqual([['GET', `${BASE}/api/auth/staff/${ID}`]]);
  });

  it('createStaff POSTs the body to /api/auth/staff', async () => {
    const seen = capture('post', '/api/auth/staff', 201, { id: ID });
    const body = {
      firstName: 'Ana',
      lastName: 'Perera',
      email: 'ana@example.com',
      phoneNumber: '+94771234567',
      password: 'Str0ng!Passw0rd',
      branchId: BRANCH,
    };
    expect(await firstValueFrom(setup().createStaff(body))).toEqual({ id: ID });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe(`${BASE}/api/auth/staff`);
    expect(seen[0].body).toEqual(body);
    expect(seen[0].contentType).toContain('application/json');
  });

  it('moveStaff PUTs { branchId } to .../branch', async () => {
    const seen = capture('put', `/api/auth/staff/${ID}/branch`, 200, { id: ID });
    await firstValueFrom(setup().moveStaff(ID, BRANCH));
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('PUT');
    expect(seen[0].url).toBe(`${BASE}/api/auth/staff/${ID}/branch`);
    expect(seen[0].body).toEqual({ branchId: BRANCH });
  });

  it.each([
    [true, 'activate'],
    [false, 'deactivate'],
  ] as const)('setStaffActive(%s) POSTs .../%s with no body', async (active, segment) => {
    const seen = capture('post', `/api/auth/staff/${ID}/${segment}`, 204);
    await firstValueFrom(setup().setStaffActive(ID, active));
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe(`${BASE}/api/auth/staff/${ID}/${segment}`);
    expect(seen[0].body).toBeUndefined();
  });

  it('deleteStaff DELETEs /api/auth/staff/{id}', async () => {
    const seen = capture('delete', `/api/auth/staff/${ID}`, 204);
    await firstValueFrom(setup().deleteStaff(ID));
    expect(seen.map((s) => [s.method, s.url])).toEqual([
      ['DELETE', `${BASE}/api/auth/staff/${ID}`],
    ]);
    expect(seen[0].body).toBeUndefined();
  });
});
