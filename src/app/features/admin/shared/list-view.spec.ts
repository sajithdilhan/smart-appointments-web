import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach } from 'vitest';
import type { CatalogStatus } from '../data/catalog-store';
import { ListStates } from './list-states.component';
import { createListView, parseStatus, syncQueryParams, textSorter } from './list-view';
import { SortHeader } from './sort-header.component';
import { StatusBadge } from './status-badge.component';

interface Row {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}
const row = (id: string, name: string, isActive = true, code = id.toUpperCase()): Row => ({
  id,
  code,
  name,
  isActive,
});

function setup(initial: Row[] = [], status: CatalogStatus = 'loaded') {
  const items = signal<Row[]>(initial);
  const st = signal<CatalogStatus>(status);
  const view = TestBed.runInInjectionContext(() =>
    createListView<Row>({
      items,
      status: st,
      searchText: (r) => `${r.code} ${r.name}`,
      sorters: {
        name: textSorter((r) => r.name),
        code: textSorter((r) => r.code),
      },
      noun: 'branches',
      singular: 'branch',
    }),
  );
  return { items, st, view };
}

const names = (rows: Row[]) => rows.map((r) => r.name);
const SAMPLE = [
  row('a', 'Zeta', true),
  row('b', 'alpha', false),
  row('c', 'Branch 10'),
  row('d', 'Branch 2'),
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createListView', () => {
  it('defaults to name order, case-insensitive and numeric-aware', () => {
    const { view } = setup(SAMPLE);
    expect(names(view.rows())).toEqual(['alpha', 'Branch 2', 'Branch 10', 'Zeta']);
    expect(view.total()).toBe(4);
  });

  it('search needs every word, over code and name, case-insensitively', () => {
    const { view } = setup(SAMPLE);
    view.q.set('BRANCH 2');
    expect(names(view.rows())).toEqual(['Branch 2']);
    view.q.set('  ');
    expect(view.rows()).toHaveLength(4);
    view.q.set('c');
    expect(names(view.rows())).toEqual(['Branch 2', 'Branch 10']);
  });

  it('status filter', () => {
    const { view } = setup(SAMPLE);
    view.status.set('inactive');
    expect(names(view.rows())).toEqual(['alpha']);
    view.status.set('active');
    expect(view.rows()).toHaveLength(3);
    view.status.set('all');
    expect(view.rows()).toHaveLength(4);
  });

  it('an unknown status in the URL parses to all', () => {
    expect(parseStatus('active')).toBe('active');
    expect(parseStatus('inactive')).toBe('inactive');
    expect(parseStatus('bogus')).toBe('all');
    expect(parseStatus(null)).toBe('all');
  });

  it('header clicks cycle asc, desc, default, with matching aria-sort', () => {
    const { view } = setup(SAMPLE);
    expect(view.ariaSort('code')).toBe('none');
    view.cycleSort('code');
    expect(view.ariaSort('code')).toBe('ascending');
    expect(view.ariaSort('name')).toBe('none');
    expect(names(view.rows())).toEqual(['Zeta', 'alpha', 'Branch 10', 'Branch 2']);
    view.cycleSort('code');
    expect(view.ariaSort('code')).toBe('descending');
    expect(view.rows()[0].code).toBe('D');
    view.cycleSort('code');
    expect(view.ariaSort('code')).toBe('none');
    expect(view.sort()).toBeNull();
    expect(names(view.rows())[0]).toBe('alpha');
    view.cycleSort('name');
    view.cycleSort('code'); // a different key starts at ascending again
    expect(view.sort()).toEqual({ key: 'code', dir: 'asc' });
  });

  it('is stable: equal keys keep the store order, in both directions', () => {
    const { view } = setup([
      row('x', 'Same', true, 'C1'),
      row('y', 'same', true, 'C2'),
      row('z', 'SAME', true, 'C3'),
    ]);
    expect(view.rows().map((r) => r.id)).toEqual(['x', 'y', 'z']);
    view.cycleSort('name');
    view.cycleSort('name');
    expect(view.rows().map((r) => r.id)).toEqual(['x', 'y', 'z']);
  });

  it('clearFilters resets search and status but not the sort', () => {
    const { view } = setup(SAMPLE);
    view.q.set('zzz');
    view.status.set('active');
    view.cycleSort('code');
    view.clearFilters();
    expect([view.q(), view.status(), view.sort()?.key]).toEqual(['', 'all', 'code']);
  });

  describe('state', () => {
    it('resolves loading, error, empty, no-match and ready', () => {
      const { view, items, st } = setup([], 'idle');
      expect(view.state()).toBe('loading');
      st.set('loading');
      expect(view.state()).toBe('loading');
      st.set('error');
      expect(view.state()).toBe('error');
      st.set('loaded');
      expect(view.state()).toBe('empty');
      items.set(SAMPLE);
      expect(view.state()).toBe('ready');
      view.q.set('nothing like this');
      expect(view.state()).toBe('no-match');
    });

    it('cached items stay ready while refreshing or after a failed refresh', () => {
      const { view, st } = setup(SAMPLE);
      st.set('loading');
      expect(view.state()).toBe('ready');
      st.set('error');
      expect(view.state()).toBe('ready');
    });
  });

  describe('announcement', () => {
    it('settles once per change, 400 ms after the last one', () => {
      const { view } = setup(SAMPLE);
      TestBed.tick();
      expect(view.announcement()).toBe('');
      vi.advanceTimersByTime(399);
      expect(view.announcement()).toBe('');
      vi.advanceTimersByTime(1);
      expect(view.announcement()).toBe('4 branches shown');

      view.q.set('b');
      TestBed.tick();
      view.q.set('br');
      TestBed.tick();
      view.q.set('bra');
      TestBed.tick();
      vi.advanceTimersByTime(399);
      expect(view.announcement()).toBe('4 branches shown');
      vi.advanceTimersByTime(1);
      expect(view.announcement()).toBe('2 branches shown');
    });

    it('uses the singular for one and announces a zero result', () => {
      const { view } = setup(SAMPLE);
      TestBed.tick();
      view.q.set('zeta');
      TestBed.tick();
      vi.advanceTimersByTime(400);
      expect(view.announcement()).toBe('1 branch shown');
      view.q.set('qqq');
      TestBed.tick();
      vi.advanceTimersByTime(400);
      expect(view.announcement()).toBe('0 branches shown');
    });

    it('says nothing while loading or on error, and nothing for an unchanged count', () => {
      const { view, items, st } = setup([], 'loading');
      TestBed.tick();
      vi.advanceTimersByTime(500);
      expect(view.announcement()).toBe('');
      st.set('loaded');
      items.set(SAMPLE);
      TestBed.tick();
      vi.advanceTimersByTime(400);
      expect(view.announcement()).toBe('4 branches shown');
      view.status.set('all'); // no change in count
      items.set([...SAMPLE]);
      TestBed.tick();
      vi.advanceTimersByTime(400);
      expect(view.announcement()).toBe('4 branches shown');
    });
  });
});

describe('syncQueryParams', () => {
  @Component({ template: '' })
  class Host {
    readonly items = signal<Row[]>(SAMPLE);
    readonly view = createListView<Row>({
      items: this.items,
      status: signal<CatalogStatus>('loaded'),
      searchText: (r) => r.name,
      sorters: {},
      noun: 'branches',
    });
    constructor() {
      syncQueryParams(this.view);
    }
  }

  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'branches', component: Host }])],
    });
    vi.useRealTimers();
    const harness = await RouterTestingHarness.create();
    const host = await harness.navigateByUrl(url, Host);
    return { harness, host, router: TestBed.inject(Router) };
  }

  it('reads q and status once; an unknown status becomes all', async () => {
    const { host } = await open('/branches?q=kandy&status=bogus');
    expect(host.view.q()).toBe('kandy');
    expect(host.view.status()).toBe('all');
  });

  it('accepts a valid status', async () => {
    const { host } = await open('/branches?status=inactive');
    expect(host.view.status()).toBe('inactive');
  });

  it('writes changes back with replaceUrl, debounced, merged with other parameters', async () => {
    const { host, router } = await open('/branches?keep=1');
    host.view.q.set('kan');
    TestBed.tick();
    host.view.status.set('active');
    TestBed.tick();
    await vi.waitFor(() => expect(router.url).toContain('status=active'));
    const params = new URL(router.url, 'http://x').searchParams;
    expect(params.get('q')).toBe('kan');
    expect(params.get('keep')).toBe('1');
    host.view.q.set('');
    host.view.status.set('all');
    TestBed.tick();
    await vi.waitFor(() => expect(router.url).toBe('/branches?keep=1'));
  });
});

describe('SortHeader', () => {
  it('names its button, exposes aria-sort and emits on click', async () => {
    vi.useRealTimers();
    const sortRequested = vi.fn();
    await render(
      `<table><thead><tr><th appSortHeader label="Name" direction="ascending" (sortRequested)="go()"></th></tr></thead></table>`,
      { imports: [SortHeader], componentProperties: { go: sortRequested } },
    );
    const header = screen.getByRole('columnheader');
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(header).toHaveAttribute('scope', 'col');
    await userEvent.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(sortRequested).toHaveBeenCalledTimes(1);
  });

  it('defaults to aria-sort none', async () => {
    vi.useRealTimers();
    await render(`<table><thead><tr><th appSortHeader label="Code"></th></tr></thead></table>`, {
      imports: [SortHeader],
    });
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none');
  });
});

describe('StatusBadge', () => {
  it.each([
    [true, 'Active'],
    [false, 'Inactive'],
  ])('active=%s shows the text %s', async (active, text) => {
    vi.useRealTimers();
    await render(StatusBadge, { inputs: { active } });
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('ListStates', () => {
  async function renderStates(state: string, extra: Record<string, unknown> = {}) {
    vi.useRealTimers();
    const retry = vi.fn();
    const clear = vi.fn();
    await render(
      `<app-list-states [state]="state" noun="branches" [errorMessage]="message" (retry)="retry()" (clearFilters)="clear()">
         <p>the rows</p>
         <a empty href="/new">New branch</a>
       </app-list-states>`,
      {
        imports: [ListStates],
        componentProperties: { state, message: null, retry, clear, ...extra },
      },
    );
    return { retry, clear };
  }

  it('loading shows a busy region and no content', async () => {
    await renderStates('loading');
    expect(screen.getByRole('status', { name: 'Loading branches' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('the rows')).not.toBeInTheDocument();
  });

  it('error shows the message and Retry', async () => {
    const { retry } = await renderStates('error', { message: 'Cannot reach the server.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('empty shows the projected call to action', async () => {
    await renderStates('empty');
    expect(screen.getByText('No branches yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New branch' })).toBeInTheDocument();
  });

  it('no-match offers Clear filters', async () => {
    const { clear } = await renderStates('no-match');
    expect(screen.getByText('No branches match your filters.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('ready projects the content', async () => {
    await renderStates('ready');
    expect(screen.getByText('the rows')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
