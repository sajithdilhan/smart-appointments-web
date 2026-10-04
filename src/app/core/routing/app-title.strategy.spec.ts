import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppTitleStrategy } from './app-title.strategy';

@Component({ selector: 'app-title-test-page', template: '' })
class Page {}

const routes: Routes = [
  { path: 'plain', title: 'Sign in', component: Page },
  { path: 'untitled', component: Page },
  { path: 'fn', title: () => 'Computed', component: Page },
  { path: 'empty-string', title: '', component: Page },
  { path: 'blank-fn', title: () => '   ', component: Page },
  {
    path: 'throws',
    title: () => {
      throw new Error('boom');
    },
    component: Page,
  },
  { path: 'non-string', title: (() => 42) as never, component: Page },
];

async function open(url: string): Promise<string> {
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), { provide: TitleStrategy, useClass: AppTitleStrategy }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return TestBed.inject(Title).getTitle();
}

describe('AppTitleStrategy', () => {
  it('formats a string title as "<Page> | Smart Appointments"', async () => {
    expect(await open('/plain')).toBe('Sign in | Smart Appointments');
  });

  it('uses the bare application name when a route has no title', async () => {
    expect(await open('/untitled')).toBe('Smart Appointments');
  });

  it('accepts a function title', async () => {
    expect(await open('/fn')).toBe('Computed | Smart Appointments');
  });

  it.each(['/empty-string', '/blank-fn', '/non-string'])(
    'falls back to the application name for the empty or non-string title on %s',
    async (url) => {
      expect(await open(url)).toBe('Smart Appointments');
    },
  );

  it('a title function that throws fails the navigation in Angular itself, before the strategy runs', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: TitleStrategy, useClass: AppTitleStrategy }],
    });
    const harness = await RouterTestingHarness.create();
    await expect(harness.navigateByUrl('/throws')).rejects.toThrow('boom');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('falls back to the application name when reading the title throws', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: TitleStrategy, useClass: AppTitleStrategy }],
    });
    const strategy = TestBed.inject(TitleStrategy);
    vi.spyOn(strategy, 'buildTitle').mockImplementation(() => {
      throw new Error('boom');
    });
    strategy.updateTitle(TestBed.inject(Router).routerState.snapshot);
    expect(TestBed.inject(Title).getTitle()).toBe('Smart Appointments');
  });
});
