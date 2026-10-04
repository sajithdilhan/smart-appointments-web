import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

class FakeMediaQuery {
  matches: boolean;
  private listeners: ((event: { matches: boolean }) => void)[] = [];
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: string, listener: (event: { matches: boolean }) => void): void {
    this.listeners.push(listener);
  }
  change(matches: boolean): void {
    this.matches = matches;
    this.listeners.forEach((listener) => listener({ matches }));
  }
}

function setup(options: { systemDark?: boolean; stored?: string | null } = {}) {
  const media = new FakeMediaQuery(options.systemDark ?? false);
  vi.stubGlobal('matchMedia', () => media);
  if (options.stored !== undefined && options.stored !== null) {
    localStorage.setItem(THEME_STORAGE_KEY, options.stored);
  }
  const service = TestBed.inject(ThemeService);
  TestBed.tick();
  return { service, media };
}

const isDark = () => document.documentElement.classList.contains('dark');

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the system preference', () => {
    const { service } = setup();
    expect(service.preference()).toBe('system');
    expect(isDark()).toBe(false);
  });

  it.each([
    ['light', false],
    ['dark', true],
  ] as const)('applies %s and persists it', (pref, dark) => {
    const { service } = setup({ systemDark: !dark });
    service.set(pref);
    TestBed.tick();
    expect(isDark()).toBe(dark);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(pref);
  });

  it('removes the dark class when switching from dark to light', () => {
    const { service } = setup();
    service.set('dark');
    TestBed.tick();
    expect(isDark()).toBe(true);
    service.set('light');
    TestBed.tick();
    expect(isDark()).toBe(false);
  });

  it('follows prefers-color-scheme live in system mode', () => {
    const { media } = setup({ systemDark: false });
    expect(isDark()).toBe(false);
    media.change(true);
    TestBed.tick();
    expect(isDark()).toBe(true);
    media.change(false);
    TestBed.tick();
    expect(isDark()).toBe(false);
  });

  it('ignores system changes when a fixed preference is chosen', () => {
    const { service, media } = setup({ systemDark: false });
    service.set('light');
    media.change(true);
    TestBed.tick();
    expect(isDark()).toBe(false);
  });

  it('restores a stored preference', () => {
    const { service } = setup({ stored: 'dark' });
    expect(service.preference()).toBe('dark');
    expect(isDark()).toBe(true);
  });

  it('treats an invalid stored value as system', () => {
    const { service } = setup({ stored: 'purple', systemDark: true });
    expect(service.preference()).toBe('system');
    expect(isDark()).toBe(true);
  });

  it('survives a throwing localStorage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('localStorage', throwing);
    const { service } = setup();
    expect(service.preference()).toBe('system');
    expect(() => service.set('dark')).not.toThrow();
    TestBed.tick();
    expect(service.preference()).toBe('dark');
    expect(isDark()).toBe(true);
  });
});
