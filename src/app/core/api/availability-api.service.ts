import { Injectable, inject } from '@angular/core';
import { ApiClient } from './api-client';

/** Empty shell with the shared request helper wired; later phases add the methods. */
@Injectable({ providedIn: 'root' })
export class AvailabilityApiService {
  protected readonly api = inject(ApiClient);
}
