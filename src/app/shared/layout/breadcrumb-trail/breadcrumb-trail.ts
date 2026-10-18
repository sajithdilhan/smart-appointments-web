import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, type ActivatedRouteSnapshot } from '@angular/router';
import { HlmBreadcrumbImports } from '@app/shared/ui/breadcrumb';

export interface Crumb {
  readonly label: string;
  readonly url: string;
}

/**
 * A route's breadcrumb: the static `data.breadcrumb`, else the value a resolver stored under the
 * same key (a record's name, or a list of crumbs with absolute URLs for a route that spans several
 * levels, such as `branches/:id/schedule`).
 */
function labelOf(route: ActivatedRouteSnapshot): unknown {
  const fixed = route.routeConfig?.data?.['breadcrumb'];
  if (fixed !== undefined) return fixed;
  return route.routeConfig?.resolve?.['breadcrumb'] ? route.data['breadcrumb'] : undefined;
}

/**
 * Crumbs from the activated route chain: each route that sets `data.breadcrumb` adds one,
 * linking to the URL accumulated so far. A later route on the same URL (an index child) replaces
 * the earlier label, so `/admin` shows just "Dashboard".
 */
export function crumbsOf(root: ActivatedRouteSnapshot): Crumb[] {
  const crumbs: Crumb[] = [];
  let url = '';
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    const segment = route.url.map((s) => s.path).join('/');
    if (segment) url += `/${segment}`;
    const label = labelOf(route);
    const entries: Crumb[] =
      typeof label === 'string' && label
        ? [{ label, url: url || '/' }]
        : Array.isArray(label)
          ? label
          : [];
    for (const crumb of entries) {
      const last = crumbs.at(-1);
      if (last && last.url === crumb.url) crumbs[crumbs.length - 1] = crumb;
      else crumbs.push(crumb);
    }
  }
  return crumbs;
}

@Component({
  selector: 'app-breadcrumb-trail',
  imports: [HlmBreadcrumbImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (crumbs().length > 0) {
      <nav hlmBreadcrumb aria-label="Breadcrumb">
        <ol hlmBreadcrumbList>
          @for (crumb of crumbs(); track crumb.url; let last = $last) {
            <li hlmBreadcrumbItem>
              @if (last) {
                <span hlmBreadcrumbPage>{{ crumb.label }}</span>
              } @else {
                <a hlmBreadcrumbLink [link]="crumb.url">{{ crumb.label }}</a>
              }
            </li>
            @if (!last) {
              <li hlmBreadcrumbSeparator></li>
            }
          }
        </ol>
      </nav>
    }
  `,
})
export class BreadcrumbTrail {
  private readonly router = inject(Router);
  protected readonly crumbs = signal<Crumb[]>(crumbsOf(this.router.routerState.snapshot.root));

  constructor() {
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.crumbs.set(crumbsOf(this.router.routerState.snapshot.root));
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
