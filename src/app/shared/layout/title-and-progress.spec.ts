import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, TitleStrategy, provideRouter, type Routes } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { AppTitleStrategy } from '../../core/routing/app-title.strategy';
import { RouteAnnouncer } from './route-announcer';
import { RouteProgress } from './route-progress';

@Component({ selector: 'app-tp-page', template: '' })
class Page {}

let release: () => void = () => undefined;
const routes: Routes = [
  { path: 'a', title: 'Page A', component: Page },
  { path: 'b', title: () => 'Page B', component: Page },
  {
    path: 'slow',
    title: 'Slow page',
    component: Page,
    canActivate: [() => new Promise<boolean>((resolve) => (release = () => resolve(true)))],
  },
];

const providers = () => [
  provideRouter(routes),
  { provide: TitleStrategy, useClass: AppTitleStrategy },
];

describe('RouteAnnouncer', () => {
  it('announces the new title after each navigation', async () => {
    await render(RouteAnnouncer, { providers: providers() });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/a');
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Page A | Smart Appointments'),
    );
    await router.navigateByUrl('/b');
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Page B | Smart Appointments'),
    );
  });

  it('is a polite live region', async () => {
    await render(RouteAnnouncer, { providers: providers() });
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });
});

describe('RouteProgress', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  const bar = (container: Element) => container.querySelector('[aria-hidden="true"]');

  it('stays hidden for a fast navigation', async () => {
    const { container } = await render(RouteProgress, { providers: providers() });
    await TestBed.inject(Router).navigateByUrl('/a');
    await vi.advanceTimersByTimeAsync(500);
    TestBed.tick();
    expect(bar(container)).toBeNull();
  });

  it('shows only after 150 ms of a slow navigation, hidden from assistive technology, and ends with it', async () => {
    const { container } = await render(RouteProgress, { providers: providers() });
    const router = TestBed.inject(Router);
    const navigation = router.navigateByUrl('/slow');
    await vi.advanceTimersByTimeAsync(100);
    TestBed.tick();
    expect(bar(container)).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    TestBed.tick();
    expect(bar(container)).not.toBeNull();
    expect(bar(container)?.getAttribute('aria-hidden')).toBe('true');
    release();
    await navigation;
    TestBed.tick();
    expect(bar(container)).toBeNull();
  });
});
