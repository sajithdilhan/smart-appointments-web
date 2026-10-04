import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { http, HttpResponse } from 'msw';
import { server } from '../../../testing/server';
import { APP_CONFIG } from '../config/app-config';
import { AvailabilityApiService } from './availability-api.service';

const BASE = 'http://gw.test:5290';

describe('AvailabilityApiService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: APP_CONFIG, useValue: { apiBaseUrl: BASE } }],
    });
    return TestBed.inject(AvailabilityApiService);
  }

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
