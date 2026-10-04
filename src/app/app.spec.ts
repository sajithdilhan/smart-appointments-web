import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { App } from './app';

describe('App', () => {
  it('renders the application name', async () => {
    await render(App, { providers: [provideRouter([])] });
    expect(screen.getByRole('heading', { level: 1, name: /smart appointments/i })).toBeTruthy();
  });

  it('renders the design-system sample: a button and a labelled input', async () => {
    await render(App, { providers: [provideRouter([])] });
    expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy();
    expect(screen.getByLabelText('Sample input')).toBeTruthy();
  });
});
