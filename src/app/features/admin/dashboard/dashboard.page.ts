import { ChangeDetectionStrategy, Component, computed, inject, type Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocusHeadingDirective } from '../../../shared/a11y/focus-heading.directive';
import { BranchesStore } from '../data/branches.store';
import type { CatalogStatus } from '../data/catalog-store';
import { reloadOnRecovery } from '../data/reload-on-recovery';
import { ServicesStore } from '../data/services.store';
import { SlotActivityStore } from '../data/slot-activity.store';
import { NeedsAttention, needsAttention } from './needs-attention.component';
import { StatCard, type CardState } from './stat-card.component';

function cardState(store: {
  items: Signal<readonly unknown[]>;
  status: Signal<CatalogStatus>;
}): CardState {
  if (store.items().length > 0) return 'ready';
  const status = store.status();
  if (status === 'error') return 'error';
  return status === 'loaded' ? 'ready' : 'loading';
}

const LINK =
  'inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

/**
 * The state of the catalog at a glance: four figures, the branches that cannot generate slots yet,
 * quick actions and this session's slot count. Each store loads on its own, so a failure affects
 * only the cards that depend on it.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [FocusHeadingDirective, NeedsAttention, RouterLink, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <h1 appFocusHeading class="text-3xl font-semibold tracking-tight">Dashboard</h1>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <app-stat-card
          label="Active branches"
          link="/admin/branches"
          [value]="activeBranches()"
          [state]="branchState()"
          [errorMessage]="branches.error()?.message ?? null"
          (retry)="branches.load()"
        />
        <app-stat-card
          label="Inactive branches"
          link="/admin/branches"
          [queryParams]="{ status: 'inactive' }"
          [value]="'' + branches.inactive().length"
          [state]="branchState()"
          [errorMessage]="branches.error()?.message ?? null"
          (retry)="branches.load()"
        />
        <app-stat-card
          label="Active services"
          link="/admin/services"
          [value]="activeServices()"
          [state]="serviceState()"
          [errorMessage]="services.error()?.message ?? null"
          (retry)="services.load()"
        />
        <app-stat-card
          label="Inactive services"
          link="/admin/services"
          [queryParams]="{ status: 'inactive' }"
          [value]="'' + services.inactive().length"
          [state]="serviceState()"
          [errorMessage]="services.error()?.message ?? null"
          (retry)="services.load()"
        />
      </div>

      @if (branchState() === 'ready') {
        <app-needs-attention [branches]="attention()" />
      }

      <div class="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="quick-actions-title" class="rounded-xl border bg-card p-4">
          <h2 id="quick-actions-title" class="text-lg font-semibold">Quick actions</h2>
          <ul class="mt-3 flex flex-col gap-2">
            <li>
              <a routerLink="/admin/branches/new" [class]="linkClass">New branch</a>
            </li>
            <li>
              <a routerLink="/admin/services/new" [class]="linkClass">New service</a>
            </li>
            <li>
              <a routerLink="/admin/slots" [class]="linkClass">Generate slots</a>
              @if (generateNote(); as note) {
                <p class="text-sm text-muted-foreground">{{ note }}</p>
              }
            </li>
          </ul>
        </section>

        <section aria-labelledby="session-title" class="rounded-xl border bg-card p-4">
          <h2 id="session-title" class="text-lg font-semibold">Slots generated this session</h2>
          @if (activity.generations() === 0) {
            <p class="mt-2 text-muted-foreground">No slots generated yet</p>
          } @else {
            <p class="mt-2 text-3xl font-semibold tracking-tight">
              {{ activity.createdThisSession() }}
              <span class="text-base font-normal text-muted-foreground">this session</span>
            </p>
          }
          <p class="mt-1 text-sm text-muted-foreground">
            This count resets when you reload the page.
          </p>
        </section>
      </div>
    </div>
  `,
})
export class DashboardPage {
  protected readonly branches = inject(BranchesStore);
  protected readonly services = inject(ServicesStore);
  protected readonly activity = inject(SlotActivityStore);
  protected readonly linkClass = LINK;

  protected readonly branchState = computed(() => cardState(this.branches));
  protected readonly serviceState = computed(() => cardState(this.services));
  protected readonly activeBranches = computed(
    () => `${this.branches.active().length} of ${this.branches.items().length}`,
  );
  protected readonly activeServices = computed(
    () => `${this.services.active().length} of ${this.services.items().length}`,
  );
  protected readonly attention = computed(() => needsAttention(this.branches.items()));

  /** What blocks "Generate slots", named only once both lists are known. */
  protected readonly generateNote = computed(() => {
    if (this.branchState() !== 'ready' || this.serviceState() !== 'ready') return null;
    const noBranch = this.branches.active().length === 0;
    const noService = this.services.active().length === 0;
    if (noBranch && noService) return 'Create an active branch and an active service first';
    if (noBranch) return 'Create an active branch first';
    if (noService) return 'Create an active service first';
    return null;
  });

  constructor() {
    void this.branches.load();
    void this.services.load();
    reloadOnRecovery(this.branches);
    reloadOnRecovery(this.services);
  }
}
