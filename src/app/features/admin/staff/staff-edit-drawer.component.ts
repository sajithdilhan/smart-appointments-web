import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { DirtyForm } from '../shared/dirty/dirty-form';

/** Stub (F7-T6): chunk C replaces it with the edit form. */
@Component({
  selector: 'app-staff-edit-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 class="text-xl font-semibold">Edit staff member</h2>`,
})
export class StaffEditDrawer implements DirtyForm {
  isDirty(): boolean {
    return false;
  }
}
