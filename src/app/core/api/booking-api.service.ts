import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type { AppointmentResponse, MyAppointmentsPage } from './models';
import type { components } from './generated/booking';

type CreateAppointmentRequest = components['schemas']['CreateAppointmentRequest'];

export interface MyAppointmentsQuery {
  status?: 'Booked';
  when: 'upcoming' | 'past';
  page: number;
  pageSize: number;
}

export interface RequestOptions {
  /** Aborting cancels the in-flight HTTP request and rejects with the signal's reason. */
  signal?: AbortSignal;
}

/** Observable to promise that unsubscribes (cancelling the request) when `signal` aborts. */
function toPromise<T>(source: Observable<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let value: T;
    let seen = false;
    const onAbort = () => {
      sub.unsubscribe();
      reject(signal?.reason);
    };
    const sub = source.subscribe({
      next: (v) => {
        value = v;
        seen = true;
      },
      error: (e: unknown) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
      complete: () => {
        signal?.removeEventListener('abort', onAbort);
        // A 204 still emits one (null) body, so an empty stream is a bug.
        if (seen) resolve(value);
        else reject(new Error('The request completed without a response.'));
      },
    });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

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

  /** `GET /api/appointments/my`. Only the four contract parameters are ever sent. */
  listMyAppointments(
    query: MyAppointmentsQuery,
    options: RequestOptions = {},
  ): Promise<MyAppointmentsPage> {
    const params: Record<string, string | number> = {
      when: query.when,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.status !== undefined) params['status'] = query.status;
    return toPromise(
      this.api.get<MyAppointmentsPage>('/api/appointments/my', { params }),
      options.signal,
    );
  }

  getAppointment(id: string, options: RequestOptions = {}): Promise<AppointmentResponse> {
    return toPromise(
      this.api.get<AppointmentResponse>(`/api/appointments/${encodeURIComponent(id)}`),
      options.signal,
    );
  }

  /** `POST .../cancel`: no body and no `Idempotency-Key` (the backend call is idempotent). */
  cancelAppointment(id: string, options: RequestOptions = {}): Promise<void> {
    return toPromise(
      this.api.post<void>(`/api/appointments/${encodeURIComponent(id)}/cancel`),
      options.signal,
    );
  }
}
