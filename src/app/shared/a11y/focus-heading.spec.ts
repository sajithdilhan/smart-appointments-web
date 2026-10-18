import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FocusHeadingDirective } from './focus-heading.directive';

@Component({
  imports: [FocusHeadingDirective],
  template: `<h1 appFocusHeading>Title</h1>`,
})
class Host {}

@Component({ template: '' })
class Blank {}

function mount() {
  const fixture = TestBed.createComponent(Host);
  fixture.autoDetectChanges();
  return fixture;
}

describe('FocusHeadingDirective', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '', component: Blank }])],
    }),
  );

  it('makes the heading programmatically focusable', async () => {
    const fixture = mount();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').getAttribute('tabindex')).toBe('-1');
  });

  it('does not move focus on the first load', async () => {
    const fixture = mount();
    await fixture.whenStable();
    expect(document.activeElement).not.toBe(fixture.nativeElement.querySelector('h1'));
  });

  it('focuses the heading after an in-app navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    const fixture = mount();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('h1'));
  });
});
