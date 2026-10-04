import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PaletteLauncher } from '../../core/ui/palette-launcher';
import { BranchesStore } from './data/branches.store';
import { ServicesStore } from './data/services.store';
import { SlotActivityStore } from './data/slot-activity.store';

/**
 * The admin feature's root route component. It tells the F1 shell a palette exists, and resets the
 * three stores when it is destroyed: route environment injectors outlive navigation, so without
 * this a logout, or a different admin signing in, would see the previous admin's lists.
 */
@Component({
  selector: 'app-admin-frame',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class AdminFrame {
  private readonly launcher = inject(PaletteLauncher);

  constructor() {
    const branches = inject(BranchesStore);
    const services = inject(ServicesStore);
    const activity = inject(SlotActivityStore);
    this.launcher.available.set(true);
    inject(DestroyRef).onDestroy(() => {
      this.launcher.available.set(false);
      branches.reset();
      services.reset();
      activity.reset();
    });
  }
}
