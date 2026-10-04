import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../../../../shared/ui/confirm-dialog';
import type { DirtyForm } from './dirty-form';

/**
 * The one unsaved-changes rule: every way out of a dirty form (Close, Escape, backdrop, Back,
 * sidebar, palette) is a router navigation, so this guard is the only place that asks. A pristine
 * form passes at once; a dirty one waits for the admin, with "Keep editing" focused first.
 */
export const unsavedChangesGuard: CanDeactivateFn<DirtyForm> = (component) =>
  !component.isDirty() ||
  inject(ConfirmService).confirm({
    title: 'Discard changes?',
    body: 'You have unsaved changes. They will be lost.',
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep editing',
    initialFocus: 'cancel',
    destructive: true,
  });
