import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type { BranchResponse, ServiceTypeResponse, SlotResponse, SlotSearchParams } from './models';

/** Paths use the casing the OpenAPI document emits; the gateway routes are case-insensitive. */
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
}
