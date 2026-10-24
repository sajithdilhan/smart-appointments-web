import { DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { AvailabilityApiService } from '../../core/api/availability-api.service';
import { StaffBranchStore } from '../../core/branch/staff-branch.store';
import { OutageState } from '../../core/http/outage-state';
import type { BranchDayContext } from '../../shared/branch-day';

/**
 * The staff page's `BRANCH_DAY_CONTEXT`: the branch and zone come from `StaffBranchStore`, the
 * service names from `AvailabilityApiService.services()`, loaded once per page. A failure leaves
 * the map empty ("Unavailable service") and is tried again when an outage recovers.
 */
export function createStaffDayContext(): BranchDayContext {
  const branch = inject(StaffBranchStore);
  const api = inject(AvailabilityApiService);
  const outage = inject(OutageState);
  const destroyRef = inject(DestroyRef);

  const services = signal<ReadonlyMap<string, { name: string }>>(new Map());
  let failed = false;

  function load(): void {
    const subscription = api.services().subscribe({
      next: (list) => {
        failed = false;
        services.set(new Map(list.map((s) => [s.id, { name: s.name }] as const)));
      },
      error: () => {
        failed = true;
      },
    });
    destroyRef.onDestroy(() => subscription.unsubscribe());
  }
  load();

  let seen = outage.recovered();
  effect(() => {
    const recovered = outage.recovered();
    if (recovered === seen) return;
    seen = recovered;
    if (failed) untracked(load);
  });

  return { branchId: branch.activeBranchId, zone: branch.zone, services: services.asReadonly() };
}
