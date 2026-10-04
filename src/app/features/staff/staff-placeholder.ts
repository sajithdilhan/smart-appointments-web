import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The staff area until the backend's staff service exists. */
@Component({
  selector: 'app-staff-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-2 p-6">
      <h1 class="text-3xl font-semibold tracking-tight">Staff workspace</h1>
      <p class="text-muted-foreground">The staff workspace is coming.</p>
    </div>
  `,
})
export class StaffPlaceholder {}
