/**
 * Stubs `matchMedia` for a viewport of `width` CSS pixels: `(min-width: Npx)` queries match when
 * `width >= N`; every other query (colour scheme, reduced motion) does not. Pair with
 * `vi.unstubAllGlobals()`.
 */
export function stubViewport(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    return {
      media: query,
      matches: min ? width >= Number(min[1]) : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}
