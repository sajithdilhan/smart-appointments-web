import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { http, HttpResponse } from 'msw';
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
