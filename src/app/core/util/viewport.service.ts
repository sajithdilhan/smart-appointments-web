import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

function watch(query: string, destroyRef: DestroyRef): Signal<boolean> {
  const state = signal(false);
  try {
    const mql = globalThis.matchMedia(query);
    state.set(mql.matches);
    const listener = (e: MediaQueryListEvent) => state.set(e.matches);
    mql.addEventListener('change', listener);
    destroyRef.onDestroy(() => mql.removeEventListener('change', listener));
  } catch {
    /* no matchMedia: treated as a small viewport */
  }
  return state.asReadonly();
}

/** `matchMedia` as signals, so layout can use `@if` and tests can stub the media query. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly destroyRef = inject(DestroyRef);
  /** Viewport is at least 768 px wide. */
  readonly isMd = watch('(min-width: 768px)', this.destroyRef);
  /** Viewport is at least 1024 px wide. */
  readonly isLg = watch('(min-width: 1024px)', this.destroyRef);
  /** Viewport is at least 640 px wide. */
  readonly isSm = watch('(min-width: 640px)', this.destroyRef);
}
