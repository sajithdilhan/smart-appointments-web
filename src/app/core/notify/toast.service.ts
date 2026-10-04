import { Injectable } from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import type { AppErrorShape } from '../http/app-error';

/** Errors stay on screen at least 8 seconds (Req 3.12). */
export const ERROR_TOAST_MS = 10_000;
export const SUCCESS_TOAST_MS = 5_000;

/**
 * The only way pages show toasts, so no page calls the toast library directly. Errors are
 * `important`, which the toaster announces assertively (aria-live), so no extra announcer
 * element is needed.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Always toasts, with a copyable reference when the error carries a correlation id. */
  showError(error: AppErrorShape): void {
    const id = error.correlationId;
    toast.error(error.message, {
      description: id ? `Reference: ${id}` : undefined,
      duration: ERROR_TOAST_MS,
      important: true,
      action: id ? { label: 'Copy reference', onClick: () => this.copy(id) } : undefined,
    });
  }

  /**
   * Toasts only where nothing else tells the user: network, timeout, and http 403, 500 and 501.
   * 400, 404, 409 and 422 are rendered inline by the caller; unauthorized, rate-limited and
   * unavailable have their own affordances (session flow, countdown, outage banner).
   */
  handleError(error: AppErrorShape): void {
    if (this.shouldToast(error)) this.showError(error);
  }

  showInfo(message: string): void {
    toast.info(message);
  }

  showSuccess(message: string): void {
    toast.success(message, { duration: SUCCESS_TOAST_MS });
  }

  showSessionExpired(): void {
    toast.info('Your session has expired. Please sign in again.', { duration: ERROR_TOAST_MS });
  }

  private shouldToast(error: AppErrorShape): boolean {
    switch (error.kind) {
      case 'network':
      case 'timeout':
        return true;
      case 'http':
        return error.status === 403 || error.status === 500 || error.status === 501;
      default:
        return false;
    }
  }

  private copy(id: string): void {
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard) return;
      clipboard.writeText(id).then(
        () => toast.success('Copied'),
        () => undefined,
      );
    } catch {
      /* the reference stays visible and selectable in the toast */
    }
  }
}
