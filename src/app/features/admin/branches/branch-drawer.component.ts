import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import type { DirtyForm } from '../shared/dirty/dirty-form';
import { isGuid } from '../data/resolvers';

@Component({
  selector: 'app-branch-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notFound) {
      <h2>Branch not found</h2>
    } @else {
      <h2>{{ id ? 'Edit branch' : 'New branch' }}</h2>
    }
  `,
})
export class BranchDrawer implements DirtyForm {
  isDirty(): boolean {
    return false;
  }

  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly notFound = this.id !== null && !isGuid(this.id);
}
