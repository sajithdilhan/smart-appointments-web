import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ThemeService } from '../../../core/theme/theme.service';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked');

  it('is a radiogroup with three named options and system selected', async () => {
    await render(ThemeToggle);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(checked('Use system theme')).toBe('true');
    expect(checked('Use dark theme')).toBe('false');
  });

  it('selects dark on click and announces the state', async () => {
    const user = userEvent.setup();
    await render(ThemeToggle);
    await user.click(screen.getByRole('radio', { name: 'Use dark theme' }));
    expect(checked('Use dark theme')).toBe('true');
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('moves with arrow keys, wrapping, and keeps one tab stop', async () => {
    const user = userEvent.setup();
    await render(ThemeToggle);
    screen.getByRole('radio', { name: 'Use system theme' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(TestBed.inject(ThemeService).preference()).toBe('light');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Use light theme' }));
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
  });
});
