import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, type ActivatedRouteSnapshot } from '@angular/router';
import { HlmBreadcrumbImports } from '@app/shared/ui/breadcrumb';

export interface Crumb {
  readonly label: string;
  readonly url: string;
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
    const label = route.routeConfig?.data?.['breadcrumb'];
    if (typeof label !== 'string' || !label) continue;
    const crumb = { label, url: url || '/' };
    const last = crumbs.at(-1);
    if (last && last.url === crumb.url) crumbs[crumbs.length - 1] = crumb;
    else crumbs.push(crumb);
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
