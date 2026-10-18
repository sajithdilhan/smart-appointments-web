import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { ViewportService } from '../../../core/util/viewport.service';
import { AppointmentsStore } from './appointments.store';

export type DetailPresentation = 'none' | 'sheet' | 'page';

/**
 * Shared by the list page and the detail it hosts (provided on the page). The detail is a child
 * route, so the list stays mounted; this decides whether it renders as a sheet over the list
 * (>= 1024 px and entered from a card) or as a page (Req 5.1), and returns focus on close.
 */
@Injectable()
export class DetailHost {
  private readonly router = inject(Router);
  private readonly viewport = inject(ViewportService);
  private readonly list = inject(AppointmentsStore);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  private readonly url = signal(this.router.url);
  /** The ids on the list when the detail opened, so focus can find the nearest card. */
  private order: string[] = [];

  /** The `:id` of the open detail, or null on the plain list. */
  readonly activeId = computed(() => {
    const segments = this.router.parseUrl(this.url()).root.children['primary']?.segments ?? [];
    return segments.length === 2 && segments[0].path === 'appointments' ? segments[1].path : null;
  });
  readonly hasChild = computed(() => this.activeId() !== null);
  private readonly fromList = computed(() => {
    this.url();
    return this.router.lastSuccessfulNavigation()?.extras.state?.['fromList'] === true;
  });
  readonly presentation = computed<DetailPresentation>(() => {
    if (!this.hasChild()) return 'none';
    return this.viewport.isLg() && this.fromList() ? 'sheet' : 'page';
  });

  constructor() {
    this.order = this.list.items().map((i) => i.id);
    const sub = this.router.events.subscribe((e) => {
      if (e instanceof NavigationEnd) {
        const wasOpen = this.hasChild();
        this.url.set(this.router.url);
        if (!wasOpen && this.hasChild()) this.order = this.list.items().map((i) => i.id);
      }
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  /** Closes the detail (back to the list, query kept) and returns focus to a card or the heading. */
  async close(id: string): Promise<void> {
    if (this.activeId() !== id) return;
    await this.router.navigate(['/appointments'], { queryParamsHandling: 'preserve' });
    afterNextRender(() => this.focusAfterClose(id), { injector: this.injector });
  }

  private focusAfterClose(id: string): void {
    const link = (target: string) =>
      this.document.querySelector<HTMLElement>(`a[href^="/appointments/${target}"]`);
    const at = this.order.indexOf(id);
    const candidates =
      at < 0 ? [id] : [id, ...this.order.slice(at + 1), ...this.order.slice(0, at).reverse()];
    for (const candidate of candidates) {
      const el = link(candidate);
      if (el) {
        el.focus();
        return;
      }
    }
    this.document.getElementById('appointments-heading')?.focus();
  }
}
