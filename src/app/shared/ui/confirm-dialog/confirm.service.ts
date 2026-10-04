import {
  ApplicationRef,
  EnvironmentInjector,
  Injectable,
  TemplateRef,
  createComponent,
  inject,
  signal,
  type ComponentRef,
} from '@angular/core';
import { ConfirmDialog } from './confirm-dialog.component';

export interface ConfirmOptions {
  title: string;
  body: TemplateRef<unknown> | string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Where focus starts: Cancel for destructive confirmations and the unsaved-changes prompt. */
  initialFocus?: 'cancel' | 'confirm';
  /**
   * The work the confirmation triggers. While it runs the confirm button shows `aria-busy`; the
   * dialog closes only when it resolves, and stays open with the error inline if it rejects.
   */
  run?: () => Promise<void>;
}

export interface ConfirmState {
  options: ConfirmOptions;
  pending: boolean;
  error: string | null;
}

/**
 * One confirmation at a time: a second `confirm()` while one is open returns the same promise.
 * The dialog component is created on first use and lives for the rest of the session.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private host: ComponentRef<ConfirmDialog> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private settle: ((result: boolean) => void) | null = null;

  readonly state = signal<ConfirmState | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.ensureHost();
    this.state.set({ options, pending: false, error: null });
    this.inFlight = new Promise<boolean>((resolve) => {
      this.settle = resolve;
    });
    return this.inFlight;
  }

  /** Cancel, Escape or backdrop. Ignored while `run` is pending. */
  cancel(): void {
    if (this.state()?.pending) return;
    this.finish(false);
  }

  async accept(): Promise<void> {
    const current = this.state();
    if (!current || current.pending) return;
    const run = current.options.run;
    if (!run) {
      this.finish(true);
      return;
    }
    this.state.set({ ...current, pending: true, error: null });
    try {
      await run();
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'Something went wrong.';
      this.state.update((s) => (s ? { ...s, pending: false, error: message } : s));
      return;
    }
    this.finish(true);
  }

  private finish(result: boolean): void {
    this.state.set(null);
    const settle = this.settle;
    this.settle = null;
    this.inFlight = null;
    settle?.(result);
  }

  private ensureHost(): void {
    if (this.host) return;
    this.host = createComponent(ConfirmDialog, { environmentInjector: this.injector });
    this.appRef.attachView(this.host.hostView);
    document.body.appendChild(this.host.location.nativeElement);
  }
}
