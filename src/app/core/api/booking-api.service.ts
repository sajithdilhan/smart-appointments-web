import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type {
  AppointmentResponse,
  AppointmentStatus,
  BranchAppointmentsPage,
  MyAppointmentsPage,
} from './models';
import { toPromise, type RequestOptions } from './to-promise';
import type { components } from './generated/booking';

type CreateAppointmentRequest = components['schemas']['CreateAppointmentRequest'];

export type { RequestOptions };

export interface MyAppointmentsQuery {
  status?: 'Booked' | 'Cancelled' | 'Completed' | 'NoShow';
  when: 'upcoming' | 'past';
  page: number;
  pageSize: number;
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

  /**
   * `GET /api/appointments/branch/{branchId}`: one branch-local day, soonest first. `status` is
   * left out for "All"; the date is a branch-zone calendar date (`yyyy-MM-dd`).
   */
  listBranchAppointments(
    branchId: string,
    query: { date: string; status?: AppointmentStatus; page: number; pageSize: number },
    options: RequestOptions = {},
  ): Promise<BranchAppointmentsPage> {
    const params: Record<string, string | number> = {
      date: query.date,
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.status !== undefined) params['status'] = query.status;
    return toPromise(
      this.api.get<BranchAppointmentsPage>(
        `/api/appointments/branch/${encodeURIComponent(branchId)}`,
        { params },
      ),
      options.signal,
    );
  }

  /** `POST .../complete`: no body and no `Idempotency-Key` (repeating the outcome is a `200`). */
  completeAppointment(id: string, options: RequestOptions = {}): Promise<AppointmentResponse> {
    return toPromise(
      this.api.post<AppointmentResponse>(`/api/appointments/${encodeURIComponent(id)}/complete`),
      options.signal,
    );
  }

  /** `POST .../no-show`: as `completeAppointment`. */
  markNoShow(id: string, options: RequestOptions = {}): Promise<AppointmentResponse> {
    return toPromise(
      this.api.post<AppointmentResponse>(`/api/appointments/${encodeURIComponent(id)}/no-show`),
      options.signal,
    );
  }
}
