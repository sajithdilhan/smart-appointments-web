import type { Page } from '@playwright/test';
import { mockAdminApi } from './mock-admin-api';
import { mockStaffApi, type MockStaffApi } from './mock-staff-api';
import type { MockAdminApi, MockBranch } from './mock-admin-api';

/**
 * An Admin session for `/admin/appointments`: `mockAdminApi` answers the branch and service
 * reads, `mockStaffApi` (stacked on top, `availability: false`) the day list and the marks. A
 * branch is seeded in both so the day list knows its zone.
 */
export interface AdminAppointmentsApi {
  admin: MockAdminApi;
  staff: MockStaffApi;
  seedBranch(partial?: Partial<MockBranch>): MockBranch;
}

export async function mockAdminAppointments(page: Page): Promise<AdminAppointmentsApi> {
  const admin = await mockAdminApi(page);
  const staff = await mockStaffApi(page, { role: 'Admin', availability: false, fallthrough: true });
  admin.seedService({ code: 'CUT', name: 'Haircut' });
  staff.seedService({ id: admin.state.services[0].id, name: 'Haircut' });
  return {
    admin,
    staff,
    seedBranch(partial = {}) {
      const branch = admin.seedBranch({ timeZoneId: 'Europe/London', ...partial });
      staff.seedBranch({ ...branch });
      return branch;
    },
  };
}
