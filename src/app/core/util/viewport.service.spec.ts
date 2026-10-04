import { TestBed } from '@angular/core/testing';
import { ViewportService } from './viewport.service';

class FakeMql {
  private listeners = new Set<(e: { matches: boolean }) => void>();
  constructor(
    readonly query: string,
    public matches: boolean,
  ) {}
  addEventListener(_t: string, l: (e: { matches: boolean }) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_t: string, l: (e: { matches: boolean }) => void) {
    this.listeners.delete(l);
  }
  set(matches: boolean) {
    this.matches = matches;
    this.listeners.forEach((l) => l({ matches }));
  }
  get count() {
    return this.listeners.size;
  }
}

describe('ViewportService', () => {
  const queries = new Map<string, FakeMql>();

  function stub(width: number) {
    queries.clear();
    vi.stubGlobal('matchMedia', (q: string) => {
      const min = Number(/min-width: (\d+)px/.exec(q)?.[1]);
      const mql = new FakeMql(q, width >= min);
      queries.set(q, mql);
      return mql;
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('reflects the initial viewport width', () => {
    stub(800);
    const v = TestBed.inject(ViewportService);
    expect(v.isMd()).toBe(true);
    expect(v.isLg()).toBe(false);
  });

  it('follows media query changes and stops listening on destroy', () => {
    stub(500);
    const v = TestBed.inject(ViewportService);
    expect(v.isMd()).toBe(false);
    queries.get('(min-width: 768px)')!.set(true);
    expect(v.isMd()).toBe(true);
    TestBed.resetTestingModule();
    expect(queries.get('(min-width: 768px)')!.count).toBe(0);
  });

  it('treats a missing matchMedia as a small viewport', () => {
    vi.stubGlobal('matchMedia', undefined);
    const v = TestBed.inject(ViewportService);
    expect(v.isMd()).toBe(false);
  });
});
