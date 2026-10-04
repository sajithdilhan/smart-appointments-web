import { provideRouter } from '@angular/router';
import { render } from '@testing-library/angular';
import { App } from './app';

describe('App', () => {
  it('renders the router outlet without a page frame of its own', async () => {
    const { container } = await render(App, { providers: [provideRouter([])] });
    expect(container.querySelector('router-outlet')).not.toBeNull();
    expect(container.querySelector('main')).toBeNull();
  });
});
