import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '../../../core/api/auth-api.service';
import type { StaffAccount } from '../../../core/api/models';
import { AppError } from '../../../core/http/app-error';
import { normalizeError } from '../../../core/http/normalize-error';
import { ToastService } from '../../../core/notify/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { mapStaffActionError, type StaffAction } from './staff-error';
import {
  deactivateWording,
  deactivatedMessage,
  deleteWording,
  deletedMessage,
  reactivateBlockedMessage,
  reactivatedMessage,
} from './staff-messages';
import { fullName } from './staff-view';

/** Reactivate was refused because the member's branch is not active. */
export interface BlockedReactivation {
  id: string;
  name: string;
  message: string;
}

/**
 * Deactivate, reactivate and delete a staff account (Req 9), for the staff list page (provided
 * there). Deactivate and delete ask first through `ConfirmService`, whose busy button and inline
 * error cover the request; reactivate has no dialog. Every success toasts and reloads the list;
 * a `404` toasts "no longer exists" and reloads. `pending` holds the ids with a request in flight
 * so their row menus stay disabled.
 */
@Injectable()
export class StaffRowActions {
  private readonly api = inject(AuthApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(StaffAccountsStore);
  private readonly toast = inject(ToastService);
  private readonly doc = inject(DOCUMENT);

  readonly pending = signal<ReadonlySet<string>>(new Set());
  /** Set by a refused reactivation; the page shows it as a banner with a link to the Edit drawer. */
  readonly blocked = signal<BlockedReactivation | null>(null);

  dismissBlocked(): void {
    this.blocked.set(null);
  }

  async deactivate(account: StaffAccount, opener?: HTMLElement): Promise<void> {
    const name = fullName(account);
    const wording = deactivateWording(name);
    const done = await this.ask(account, wording, (missing) =>
      this.call(account, 'deactivate', () => this.api.setStaffActive(account.id, false), missing),
    );
    if (done === 'done') this.toast.showSuccess(deactivatedMessage(name));
    this.finish(done, opener);
  }

  async remove(account: StaffAccount, opener?: HTMLElement): Promise<void> {
    const name = fullName(account);
    const wording = deleteWording(name, account.email);
    const done = await this.ask(account, wording, (missing) =>
      this.call(account, 'delete', () => this.api.deleteStaff(account.id), missing),
    );
    if (done === 'done') this.toast.showSuccess(deletedMessage(name));
    this.finish(done, opener);
  }

  async reactivate(account: StaffAccount, opener?: HTMLElement): Promise<void> {
    if (this.pending().has(account.id)) return;
    const name = fullName(account);
    this.setPending(account.id, true);
    try {
      await firstValueFrom(this.api.setStaffActive(account.id, true));
    } catch (e) {
      const error = normalizeError(e);
      const outcome = mapStaffActionError(error, 'reactivate');
      switch (outcome.kind) {
        case 'not-found':
          this.notFound(outcome.message);
          break;
        case 'branch-inactive':
          this.blocked.set({ id: account.id, name, message: reactivateBlockedMessage(name) });
          break;
        case 'unavailable':
          this.toast.showError(
            new AppError(error.status, outcome.message, 'unavailable', error.correlationId),
          );
          break;
        case 'generic':
          this.toast.handleError(error);
          break;
      }
      return;
    } finally {
      this.setPending(account.id, false);
    }
    this.toast.showSuccess(reactivatedMessage(name));
    this.finish('done', opener);
  }

  /** Opens the confirmation; `run` reports a `404` through `missing` and throws anything else. */
  private async ask(
    account: StaffAccount,
    wording: { title: string; body: string; confirmLabel: string },
    run: (missing: { value: boolean }) => Promise<void>,
  ): Promise<'done' | 'missing' | 'cancelled'> {
    if (this.pending().has(account.id)) return 'cancelled';
    const missing = { value: false };
    const confirmed = await this.confirm.confirm({
      ...wording,
      destructive: true,
      initialFocus: 'cancel',
      run: () => run(missing),
    });
    if (!confirmed) return 'cancelled';
    return missing.value ? 'missing' : 'done';
  }

  private async call(
    account: StaffAccount,
    action: StaffAction,
    request: () => ReturnType<AuthApiService['deleteStaff']>,
    missing: { value: boolean },
  ): Promise<void> {
    this.setPending(account.id, true);
    try {
      await firstValueFrom(request());
    } catch (e) {
      const error = normalizeError(e);
      const outcome = mapStaffActionError(error, action);
      if (outcome.kind === 'not-found') {
        missing.value = true;
        return;
      }
      // The dialog stays open and shows this message under the text.
      throw error;
    } finally {
      this.setPending(account.id, false);
    }
  }

  private finish(result: 'done' | 'missing' | 'cancelled', opener?: HTMLElement): void {
    if (result === 'missing') this.notFound('This staff account no longer exists.');
    if (result === 'done') void this.store.reload();
    // Give focus back to the row's menu button, or to the page heading when the row is gone.
    setTimeout(() => {
      if (opener?.isConnected) opener.focus();
      else this.doc.querySelector<HTMLElement>('h1[appFocusHeading]')?.focus();
    }, 0);
  }

  private notFound(message: string): void {
    this.toast.showError(new AppError(404, message, 'http'));
    void this.store.reload();
  }

  private setPending(id: string, on: boolean): void {
    this.pending.update((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
