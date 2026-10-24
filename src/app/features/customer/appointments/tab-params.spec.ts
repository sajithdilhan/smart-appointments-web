import { parseTab, toListQuery } from './tab-params';

describe('parseTab', () => {
  it.each([
    [{}, { tab: 'upcoming', showCancelled: false, pastStatus: 'all' }],
    [{ tab: 'upcoming' }, { tab: 'upcoming', showCancelled: false, pastStatus: 'all' }],
    [{ tab: 'past' }, { tab: 'past', showCancelled: false, pastStatus: 'all' }],
    [{ tab: 'nope' }, { tab: 'upcoming', showCancelled: false, pastStatus: 'all' }],
    [{ tab: 'PAST' }, { tab: 'upcoming', showCancelled: false, pastStatus: 'all' }],
    [
      { tab: null, cancelled: null },
      { tab: 'upcoming', showCancelled: false, pastStatus: 'all' },
    ],
    [
      { tab: 'upcoming', cancelled: '1' },
      { tab: 'upcoming', showCancelled: true, pastStatus: 'all' },
    ],
    [{ cancelled: '1' }, { tab: 'upcoming', showCancelled: true, pastStatus: 'all' }],
    [
      { tab: 'upcoming', cancelled: 'true' },
      { tab: 'upcoming', showCancelled: false, pastStatus: 'all' },
    ],
    [
      { tab: 'past', cancelled: '1' },
      { tab: 'past', showCancelled: false, pastStatus: 'all' },
    ],
    [
      { tab: 'nope', cancelled: '1' },
      { tab: 'upcoming', showCancelled: true, pastStatus: 'all' },
    ],
  ])('%j gives %j', (raw, expected) => {
    expect(parseTab(raw)).toEqual(expected);
  });

  it.each(['Completed', 'NoShow', 'Cancelled', 'Booked'] as const)(
    'pstatus=%s is honoured on Past',
    (pstatus) => {
      expect(parseTab({ tab: 'past', pstatus })).toEqual({
        tab: 'past',
        showCancelled: false,
        pastStatus: pstatus,
      });
    },
  );

  it.each(['all', 'completed', 'noshow', 'Archived', '', null])(
    'pstatus=%j on Past is All',
    (pstatus) => {
      expect(parseTab({ tab: 'past', pstatus }).pastStatus).toBe('all');
    },
  );

  it('pstatus is ignored on Upcoming', () => {
    expect(parseTab({ tab: 'upcoming', pstatus: 'Completed' }).pastStatus).toBe('all');
    expect(parseTab({ pstatus: 'Completed' }).pastStatus).toBe('all');
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

  it.each(['Completed', 'NoShow', 'Cancelled', 'Booked'] as const)(
    'Past sends status=%s',
    (status) => {
      expect(toListQuery('past', false, 2, 20, status)).toEqual({
        status,
        when: 'past',
        page: 2,
        pageSize: 20,
      });
    },
  );

  it('Past with All sends no status, and Upcoming ignores the Past status', () => {
    expect('status' in toListQuery('past', false, 1, 20, 'all')).toBe(false);
    expect(toListQuery('upcoming', false, 1, 20, 'Completed')).toEqual({
      status: 'Booked',
      when: 'upcoming',
      page: 1,
      pageSize: 20,
    });
  });
});
