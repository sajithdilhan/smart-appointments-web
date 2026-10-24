import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { filter, fromEvent } from 'rxjs';
import { PaletteLauncher } from '../../core/ui/palette-launcher';
import { BranchesStore } from './data/branches.store';
import { ServicesStore } from './data/services.store';
import { SlotActivityStore } from './data/slot-activity.store';
import { StaffAccountsStore } from './data/staff-accounts.store';
import { CommandPalette } from './palette/command-palette.component';
import { isPaletteShortcut } from './palette/shortcut';

/**
 * The admin feature's root route component. It tells the F1 shell a palette exists, owns the
 * palette and its Ctrl/Cmd+K listener (both removed when it is destroyed), and resets the
 * stores on destroy: route environment injectors outlive navigation, so without this a logout, or
 * a different admin signing in, would see the previous admin's lists.
 */
@Component({
  selector: 'app-admin-frame',
  imports: [RouterOutlet, CommandPalette],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />
    <app-command-palette [(open)]="paletteOpen" />
  `,
})
export class AdminFrame {
  private readonly launcher = inject(PaletteLauncher);
  private readonly doc = inject(DOCUMENT);
  protected readonly paletteOpen = signal(false);

  constructor() {
    const branches = inject(BranchesStore);
    const services = inject(ServicesStore);
    const activity = inject(SlotActivityStore);
    const staff = inject(StaffAccountsStore);
    this.launcher.available.set(true);

    fromEvent<KeyboardEvent>(this.doc, 'keydown')
      .pipe(
        filter((e): e is KeyboardEvent => isPaletteShortcut(e)),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        e.preventDefault();
        this.openPalette();
      });

    // Each click on the shell's "Search or jump to" button is a new `requests` value.
    let seen = this.launcher.requests();
    effect(() => {
      const n = this.launcher.requests();
      untracked(() => {
        if (n !== seen) this.openPalette();
        seen = n;
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.launcher.available.set(false);
      branches.reset();
      services.reset();
      activity.reset();
      staff.reset();
    });
  }

  /** Not while another modal (a drawer, a confirmation) is open. */
  private openPalette(): void {
    if (this.paletteOpen()) return;
    if (this.doc.querySelector('[aria-modal="true"]')) return;
    this.paletteOpen.set(true);
  }
}
