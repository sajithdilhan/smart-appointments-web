import { parseTab, toListQuery } from './tab-params';

describe('parseTab', () => {
  it.each([
    [{}, { tab: 'upcoming', showCancelled: false }],
    [{ tab: 'upcoming' }, { tab: 'upcoming', showCancelled: false }],
    [{ tab: 'past' }, { tab: 'past', showCancelled: false }],
    [{ tab: 'nope' }, { tab: 'upcoming', showCancelled: false }],
    [{ tab: 'PAST' }, { tab: 'upcoming', showCancelled: false }],
    [
      { tab: null, cancelled: null },
      { tab: 'upcoming', showCancelled: false },
    ],
    [
      { tab: 'upcoming', cancelled: '1' },
      { tab: 'upcoming', showCancelled: true },
    ],
    [{ cancelled: '1' }, { tab: 'upcoming', showCancelled: true }],
    [
      { tab: 'upcoming', cancelled: 'true' },
      { tab: 'upcoming', showCancelled: false },
    ],
    [
      { tab: 'past', cancelled: '1' },
      { tab: 'past', showCancelled: false },
    ],
    [
      { tab: 'nope', cancelled: '1' },
      { tab: 'upcoming', showCancelled: true },
    ],
  ])('%j gives %j', (raw, expected) => {
    expect(parseTab(raw)).toEqual(expected);
  });
});

describe('toListQuery', () => {
  it.each([
    ['upcoming', false, { status: 'Booked', when: 'upcoming', page: 1, pageSize: 20 }],
    ['upcoming', true, { when: 'upcoming', page: 1, pageSize: 20 }],
    ['past', false, { when: 'past', page: 1, pageSize: 20 }],
    ['past', true, { when: 'past', page: 1, pageSize: 20 }],
  ] as const)('%s with showCancelled=%s', (tab, show, expected) => {
    expect(toListQuery(tab, show, 1, 20)).toEqual(expected);
  });

  it('carries page and pageSize and never a status key when none applies', () => {
    const q = toListQuery('past', false, 3, 100);
    expect(q).toEqual({ when: 'past', page: 3, pageSize: 100 });
    expect('status' in q).toBe(false);
  });

  it('a tab switch changes the request: Upcoming to Past drops status', () => {
    expect(toListQuery('upcoming', false, 1, 20)).not.toEqual(toListQuery('past', false, 1, 20));
  });
});
