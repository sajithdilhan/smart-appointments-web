import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { HlmButtonImports } from '@app/shared/ui/button';
import { EmptyState } from '@app/shared/ui/empty-state';
import { InlineAlert } from '@app/shared/ui/inline-alert';
import { HlmSkeletonImports } from '@app/shared/ui/skeleton';
import type { AppError } from '../../../../core/http/app-error';
import { ToastService } from '../../../../core/notify/toast.service';
import {
  RadioItemDirective,
  RovingRadioGroupDirective,
} from '../../../../shared/a11y/roving-radio-group.directive';
import { ReferenceDataStore } from '../../shared/reference-data/reference-data.store';
import { StepHeadingDirective } from '../step-heading.directive';
import { BookingWizardStore } from '../wizard.store';
import { isOutageError } from './branch-step.component';
import { ServiceCardComponent } from './service-card.component';

/**
 * Step 2 (Req 3): the services from the shared reference data as a radio group of cards, with
 * the chosen branch above as a compact summary and a "Change" button. Choosing a service
 * navigates to step 3. The backend has no branch-service mapping, so every service is offered.
 */
@Component({
  selector: 'app-service-step',
  imports: [
    EmptyState,
    HlmButtonImports,
    HlmSkeletonImports,
    InlineAlert,
    RadioItemDirective,
    RovingRadioGroupDirective,
    ServiceCardComponent,
    StepHeadingDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'book-step flex flex-col gap-4' },
  template: `
    <h2 appStepHeading class="text-xl font-semibold">Choose a service</h2>

    <div
      class="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
    >
      @if (store.branch(); as branch) {
        <p>
          <span class="text-muted-foreground">Branch:</span>
          <span class="font-medium"> {{ branch.name }}</span>
          <span class="text-muted-foreground"> · {{ branch.address }}</span>
        </p>
      } @else {
        <div hlmSkeleton class="h-5 w-64" aria-hidden="true"></div>
      }
      <button hlmBtn variant="outline" size="sm" type="button" (click)="store.goTo('branch')">
        Change
        <span class="sr-only">branch</span>
      </button>
    </div>

    @if (error(); as e) {
      <app-inline-alert tone="error">
        <p>
          {{ isOutage(e) ? 'We could not load the services. Check your connection.' : e.message }}
        </p>
        <div>
          <button hlmBtn variant="outline" type="button" (click)="reference.ensureServices()">
            Try again
          </button>
        </div>
      </app-inline-alert>
    } @else if (services() === null) {
      <div
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Loading services"
      >
        @for (n of skeletons; track n) {
          <div hlmSkeleton class="h-28"></div>
        }
      </div>
    } @else if (services()!.length === 0) {
      <app-empty-state title="No services are available right now." />
    } @else {
      <div
        [appRadioGroup]="'Service'"
        [selectOnMove]="false"
        (selected)="store.chooseService($event)"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        @for (s of services(); track s.id) {
          <app-service-card
            [appRadioItem]="s.id"
            [checked]="store.effective().service === s.id"
            [service]="s"
          />
        }
      </div>
    }
  `,
})
export class ServiceStepComponent {
  protected readonly store = inject(BookingWizardStore);
  protected readonly reference = inject(ReferenceDataStore);
  private readonly toast = inject(ToastService);
  protected readonly isOutage = isOutageError;
  protected readonly skeletons = [1, 2, 3];

  protected readonly services = this.reference.services;
  protected readonly error = computed(() =>
    this.reference.servicesState() === 'error' && this.services() === null
      ? this.reference.servicesError()
      : null,
  );

  constructor() {
    this.reference.ensureServices();
    let toasted: AppError | null = null;
    effect(() => {
      const e = this.error();
      if (e && e !== toasted && !isOutageError(e)) {
        toasted = e;
        untracked(() => this.toast.showError(e));
      }
    });
  }
}
