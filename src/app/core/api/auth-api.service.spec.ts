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
