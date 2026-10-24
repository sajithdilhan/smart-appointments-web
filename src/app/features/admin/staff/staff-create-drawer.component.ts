import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { DirtyForm } from '../shared/dirty/dirty-form';

/** Stub (F7-T6): chunk C replaces it with the create form. */
@Component({
  selector: 'app-staff-create-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h2 class="text-xl font-semibold">New staff member</h2>`,
})
export class StaffCreateDrawer implements DirtyForm {
  isDirty(): boolean {
    return false;
  }
}
