import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AvailabilityApiService } from '../../../core/api/availability-api.service';
import { normalizeError } from '../../../core/http/normalize-error';
import { ToastService } from '../../../core/notify/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog';

export type StatusEntity = 'branch' | 'service';

/** The part of a catalog store this component needs. */
export interface StatusStore {
  setActive(id: string, isActive: boolean): void;
  load(opts?: { force?: boolean }): Promise<void>;
}

export interface StatusRequest {
  entity: StatusEntity;
  record: { id: string; name: string; isActive: boolean };
  store: StatusStore;
  /** Branch only: false adds the "no schedule" warning to the activate dialog. */
  hasSchedule?: boolean;
  /** Where focus goes afterwards (the button that opened the dialog). */
  returnFocus?: HTMLElement | null;
}

export type StatusResult = 'changed' | 'cancelled' | 'not-found';

/** Wording of one confirmation: only effects the contract guarantees (Req 4.1, 6.3). */
export function statusWording(entity: StatusEntity, name: string, deactivate: boolean) {
  if (entity === 'branch') {
    return deactivate
      ? {
          title: `Deactivate ${name}?`,
          confirmLabel: 'Deactivate branch',
          lines: [
            'Customers will no longer see this branch or search its slots. Admins still see it.',
            'Slot generation for it is blocked until it is reactivated.',
            'Existing appointments and already generated slots are not cancelled or removed by this action.',
          ],
        }
      : {
          title: `Activate ${name}?`,
          confirmLabel: 'Activate branch',
          lines: ['It becomes visible to customers again.'],
        };
  }
  return deactivate
    ? {
        title: `Deactivate ${name}?`,
        confirmLabel: 'Deactivate service',
        lines: [
          'Customers can no longer select this service.',
          'Existing appointments are not changed.',
          'Slot generation for it is blocked until it is reactivated.',
        ],
      }
    : {
        title: `Activate ${name}?`,
        confirmLabel: 'Activate service',
        lines: ['Customers can select this service again.'],
      };
}

/**
 * Asks, then activates or deactivates a branch or service. Place one `<app-status-confirm>` in
 * the page and call `ask()`; the dialog body is a template of this component, so its links work
 * in the declaring page's context. The dialog stays open while the call runs and shows a failure
 * inline; a `404` closes it, toasts and reloads the list.
 */
@Component({
  selector: 'app-status-confirm',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #body>
      <div class="flex flex-col gap-2">
        @for (line of lines(); track line) {
          <p>{{ line }}</p>
        }
        @if (scheduleLink(); as link) {
          <p>
            This branch has no schedule, so no slots can be generated until you set one.
            <a
              class="font-medium text-primary underline underline-offset-4"
              [routerLink]="link"
              (click)="dismiss()"
              >Set a schedule</a
            >
          </p>
        }
      </div>
    </ng-template>
  `,
})
export class StatusConfirm {
  private readonly confirmService = inject(ConfirmService);
  private readonly api = inject(AvailabilityApiService);
  private readonly toast = inject(ToastService);
  private readonly body = viewChild.required<TemplateRef<unknown>>('body');

  protected readonly lines = signal<string[]>([]);
  protected readonly scheduleLink = signal<string[] | null>(null);

  async ask(req: StatusRequest): Promise<StatusResult> {
    const { entity, record, store } = req;
    const deactivate = record.isActive;
    const wording = statusWording(entity, record.name, deactivate);
    this.lines.set(wording.lines);
    this.scheduleLink.set(
      entity === 'branch' && !deactivate && req.hasSchedule === false
        ? ['/admin/branches', record.id, 'schedule']
        : null,
    );

    let missing = false;
    const run = async (): Promise<void> => {
      try {
        const call =
          entity === 'branch'
            ? this.api.setBranchActive(record.id, !deactivate)
            : this.api.setServiceActive(record.id, !deactivate);
        await firstValueFrom(call);
      } catch (e) {
        const error = normalizeError(e);
        if (error.status === 404) {
          missing = true;
          return;
        }
        throw error;
      }
    };

    const confirmed = await this.confirmService.confirm({
      title: wording.title,
      body: this.body(),
      confirmLabel: wording.confirmLabel,
      destructive: deactivate,
      initialFocus: 'cancel',
      run,
    });

    let result: StatusResult = 'cancelled';
    if (confirmed && missing) {
      this.toast.showInfo(`That ${entity} no longer exists`);
      void store.load({ force: true });
      result = 'not-found';
    } else if (confirmed) {
      store.setActive(record.id, !deactivate);
      this.toast.showSuccess(`${record.name} is now ${deactivate ? 'inactive' : 'active'}`);
      result = 'changed';
    }
    if (result !== 'not-found') setTimeout(() => req.returnFocus?.focus(), 0);
    return result;
  }

  protected dismiss(): void {
    this.confirmService.cancel();
  }
}
