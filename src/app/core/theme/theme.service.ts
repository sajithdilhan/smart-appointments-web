import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'sa.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery = this.createMediaQuery();

  private readonly systemDark = signal(this.mediaQuery?.matches ?? false);
  readonly preference = signal<ThemePreference>(this.read());
  readonly isDark = computed(
    () => this.preference() === 'dark' || (this.preference() === 'system' && this.systemDark()),
  );

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.isDark());
    });
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Storage is unavailable (private window, blocked site data): keep the in-memory value.
    }
  }

  private read(): ThemePreference {
    try {
      const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
      return isPreference(stored) ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private createMediaQuery(): MediaQueryList | null {
    return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(DARK_QUERY) : null;
  }
}
