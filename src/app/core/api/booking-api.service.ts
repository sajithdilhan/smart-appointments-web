import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type { AppointmentResponse } from './models';
import type { components } from './generated/booking';

type CreateAppointmentRequest = components['schemas']['CreateAppointmentRequest'];

@Injectable({ providedIn: 'root' })
export class BookingApiService {
  protected readonly api = inject(ApiClient);

  /** The key is the caller's: a retry of the same intent must send the same key. */
  createAppointment(slotId: string, idempotencyKey: string): Observable<AppointmentResponse> {
    const body: CreateAppointmentRequest = { slotId };
    return this.api.post<AppointmentResponse>('/api/appointments', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }
}
