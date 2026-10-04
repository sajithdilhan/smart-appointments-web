import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it('renders the application name', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] })
      .compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent).toContain('Smart Appointments');
  });
});
