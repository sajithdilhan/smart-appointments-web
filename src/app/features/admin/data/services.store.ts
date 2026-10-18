import { Injectable, inject } from '@angular/core';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import type { ServiceType } from '../../../core/api/models';
import { CLOCK } from '../../../core/util/clock';
import { CatalogStore } from './catalog-store';

/** All service types, active and inactive. Provided by the admin routes, reset when the frame is destroyed. */
@Injectable()
export class ServicesStore extends CatalogStore<ServiceType> {
  constructor() {
    const api = inject(AvailabilityApiService);
    const clock = inject(CLOCK);
    super({
      list: () => api.listServices({ includeInactive: true }),
      get: (id) => api.getService(id),
      sortKey: (s) => `${s.name} ${s.code}`,
      now: () => clock.now(),
    });
  }
}
