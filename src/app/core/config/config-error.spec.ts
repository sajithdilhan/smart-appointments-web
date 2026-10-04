import { screen } from '@testing-library/dom';
import { renderConfigError } from './config-error';

describe('renderConfigError', () => {
  const reload = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '<app-root>shell</app-root>';
    document.title = 'Smart Appointments';
    vi.stubGlobal('location', { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    reload.mockReset();
  });

  it('replaces the page with a heading, the reason and a Try again button', () => {
    renderConfigError('config.json returned 404');
    expect(screen.getByRole('heading', { name: 'Configuration error' })).toBeTruthy();
    expect(screen.getByText('config.json returned 404')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(document.querySelector('app-root')).toBeNull();
  });

  it('sets the document title', () => {
    renderConfigError('x');
    expect(document.title).toBe('Configuration error');
  });

  it('focuses the button and reloads the page when it is activated', () => {
    renderConfigError('x');
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(document.activeElement).toBe(button);
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders the reason as text, never as HTML', () => {
    renderConfigError('<img src=x onerror=alert(1)>');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});
