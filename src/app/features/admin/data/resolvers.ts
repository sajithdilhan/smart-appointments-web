import { inject } from '@angular/core';
import type { ResolveFn } from '@angular/router';
import type { Crumb } from '../../../shared/layout/breadcrumb-trail';
import { BranchesStore } from './branches.store';
import { ServicesStore } from './services.store';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && GUID.test(value);
}

/**
 * Breadcrumb data: the record's name from the store (fetching it once if needed), or a fallback
 * when the id is not a GUID (no request is made), the record does not exist or the call fails.
 * A resolver that fails never blocks navigation.
 */
export const branchCrumb: ResolveFn<string> = async (route) => {
  const id = route.paramMap.get('id');
  if (!isGuid(id)) return 'Branch';
  try {
    return (await inject(BranchesStore).ensure(id))?.name ?? 'Branch';
  } catch {
    return 'Branch';
  }
};

export const serviceCrumb: ResolveFn<string> = async (route) => {
  const id = route.paramMap.get('id');
  if (!isGuid(id)) return 'Service';
  try {
    return (await inject(ServicesStore).ensure(id))?.name ?? 'Service';
  } catch {
    return 'Service';
  }
};

/**
 * Breadcrumbs of `branches/:id/schedule`, one route spanning three levels: Branches, the branch's
 * name (its edit drawer) and Schedule. The shell's trail renders a list stored under `breadcrumb`.
 */
export const scheduleCrumbs: ResolveFn<Crumb[]> = async (route) => {
  const id = route.paramMap.get('id');
  const name = (await branchCrumb(route, undefined as never)) as string;
  const base = '/admin/branches';
  return [
    { label: 'Branches', url: base },
    { label: name, url: `${base}/${id ?? ''}` },
    { label: 'Schedule', url: `${base}/${id ?? ''}/schedule` },
  ];
};
