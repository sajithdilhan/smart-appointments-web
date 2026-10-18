import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type {
  Branch,
  BranchResponse,
  CreateBranchBody,
  CreateServiceBody,
  GenerateSlotsBody,
  GenerateSlotsResult,
  ScheduleBody,
  ServiceType,
  ServiceTypeResponse,
  SlotResponse,
  SlotSearchParams,
  UpdateBranchBody,
  UpdateServiceBody,
} from './models';

/**
 * Availability calls through the gateway. Paths use the casing the OpenAPI document emits
 * (`/api/Branches`); the gateway routes are case-insensitive. No method sets `Idempotency-Key`.
 * `update*` return the record or nothing: the spec does not say, so callers handle both.
 */
@Injectable({ providedIn: 'root' })
export class AvailabilityApiService {
  protected readonly api = inject(ApiClient);

  branches(): Observable<BranchResponse[]> {
    return this.api.get<BranchResponse[]>('/api/Branches');
  }

  services(): Observable<ServiceTypeResponse[]> {
    return this.api.get<ServiceTypeResponse[]>('/api/Services');
  }

  availableSlots(params: SlotSearchParams): Observable<SlotResponse[]> {
    return this.api.get<SlotResponse[]>('/api/Slots/available', {
      params: { branchId: params.branchId, serviceId: params.serviceId, date: params.date },
    });
  }

  listBranches(o: { includeInactive: boolean }): Observable<Branch[]> {
    return this.api.get<Branch[]>('/api/Branches', {
      params: { includeInactive: o.includeInactive },
    });
  }

  getBranch(id: string): Observable<Branch> {
    return this.api.get<Branch>(`/api/Branches/${encodeURIComponent(id)}`);
  }

  createBranch(body: CreateBranchBody): Observable<Branch> {
    return this.api.post<Branch>('/api/Branches', body);
  }

  updateBranch(id: string, body: UpdateBranchBody): Observable<Branch | void> {
    return this.api.put<Branch | void>(`/api/Branches/${encodeURIComponent(id)}`, body);
  }

  setSchedule(id: string, body: ScheduleBody): Observable<Branch> {
    return this.api.put<Branch>(`/api/Branches/${encodeURIComponent(id)}/schedule`, body);
  }

  setBranchActive(id: string, active: boolean): Observable<void> {
    const action = active ? 'activate' : 'deactivate';
    return this.api.post<void>(`/api/Branches/${encodeURIComponent(id)}/${action}`);
  }

  listServices(o: { includeInactive: boolean }): Observable<ServiceType[]> {
    return this.api.get<ServiceType[]>('/api/Services', {
      params: { includeInactive: o.includeInactive },
    });
  }

  getService(id: string): Observable<ServiceType> {
    return this.api.get<ServiceType>(`/api/Services/${encodeURIComponent(id)}`);
  }

  createService(body: CreateServiceBody): Observable<ServiceType> {
    return this.api.post<ServiceType>('/api/Services', body);
  }

  updateService(id: string, body: UpdateServiceBody): Observable<ServiceType | void> {
    return this.api.put<ServiceType | void>(`/api/Services/${encodeURIComponent(id)}`, body);
  }

  setServiceActive(id: string, active: boolean): Observable<void> {
    const action = active ? 'activate' : 'deactivate';
    return this.api.post<void>(`/api/Services/${encodeURIComponent(id)}/${action}`);
  }

  generateSlots(body: GenerateSlotsBody): Observable<GenerateSlotsResult> {
    return this.api.post<GenerateSlotsResult>('/api/Slots/generate', body);
  }
}
