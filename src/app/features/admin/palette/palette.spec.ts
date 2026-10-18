import type { Branch, ServiceType } from '../../../core/api/models';
import { buildCommands, type Command, filterCommands, RECORD_LIMIT } from './command-registry';
import { isPaletteShortcut, platformKeyLabel } from './shortcut';

const branch = (n: number, name = `Branch ${n}`): Branch => ({
  id: `b-${n}`,
  code: `B${n}`,
  name,
  description: null,
  address: 'x',
  phoneNumber: '+1',
  isActive: true,
  createdAtUtc: '',
  updatedAtUtc: null,
  timeZoneId: null,
  workingHours: [],
});
const service = (n: number, name = `Service ${n}`): ServiceType => ({
  id: `s-${n}`,
  code: `S${n}`,
  name,
  description: null,
  durationMinutes: 30,
  isActive: true,
  createdAtUtc: '',
  updatedAtUtc: null,
});

const labels = (r: ReturnType<typeof filterCommands>) =>
  r.groups.flatMap((g) => g.items.map((i) => i.label));

describe('buildCommands', () => {
  it('has the static commands, with no records when the stores are empty', () => {
    const all = buildCommands({ branches: [], services: [] });
    expect(all.map((c) => c.label)).toEqual([
      'Go to Dashboard',
      'Go to Branches',
      'Go to Services',
      'Go to Slot generation',
      'New branch',
      'New service',
      'Generate slots',
      'Toggle theme',
      'Sign out',
    ]);
    expect(all.find((c) => c.label === 'New branch')?.run).toEqual({
      kind: 'navigate',
      url: '/admin/branches/new',
    });
    expect(all.find((c) => c.label === 'Toggle theme')?.run).toEqual({ kind: 'theme' });
    expect(all.find((c) => c.label === 'Sign out')?.run).toEqual({ kind: 'signOut' });
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('adds edit entries for loaded branches and services', () => {
    const all = buildCommands({ branches: [branch(1, 'Kandy')], services: [service(1, 'Cut')] });
    const records = all.filter((c) => c.group === 'Records');
    expect(records.map((c) => [c.label, c.run])).toEqual([
      ['Edit branch: Kandy', { kind: 'navigate', url: '/admin/branches/b-1' }],
      ['Edit schedule: Kandy', { kind: 'navigate', url: '/admin/branches/b-1/schedule' }],
      ['Edit service: Cut', { kind: 'navigate', url: '/admin/services/s-1' }],
    ]);
  });
});

describe('filterCommands', () => {
  const all = buildCommands({
    branches: [branch(1, 'Kandy'), branch(2, 'Galle')],
    services: [service(1, 'Haircut')],
  });

  it('an empty query lists everything in group order, registry order inside a group', () => {
    const r = filterCommands(all, '');
    expect(r.groups.map((g) => g.group)).toEqual(['Navigate', 'Create', 'Records', 'Settings']);
    expect(r.count).toBe(all.length);
    expect(r.groups[0].items.map((i) => i.label)).toEqual([
      'Go to Dashboard',
      'Go to Branches',
      'Go to Services',
      'Go to Slot generation',
    ]);
    expect(r.groups[2].items[0].label).toBe('Edit branch: Kandy');
  });

  it('every word must match the label or keywords, case-insensitively', () => {
    expect(labels(filterCommands(all, 'GO SLOT'))).toEqual(['Go to Slot generation']);
    expect(labels(filterCommands(all, 'logout'))).toEqual(['Sign out']);
    expect(labels(filterCommands(all, 'dark'))).toEqual(['Toggle theme']);
    expect(filterCommands(all, 'zzzz').count).toBe(0);
    expect(filterCommands(all, 'zzzz').groups).toEqual([]);
  });

  it('ranks a label prefix before a word-start match before a substring', () => {
    const items: Command[] = [
      { id: 'a', label: 'Open the gate', keywords: [], group: 'Navigate', run: { kind: 'theme' } },
      { id: 'b', label: 'Gate keeper', keywords: [], group: 'Navigate', run: { kind: 'theme' } },
      { id: 'c', label: 'Investigate', keywords: [], group: 'Navigate', run: { kind: 'theme' } },
    ];
    expect(labels(filterCommands(items, 'gate'))).toEqual([
      'Gate keeper', // label prefix
      'Open the gate', // word start
      'Investigate', // substring
    ]);
  });

  it('breaks ties by group order, then label', () => {
    const r = filterCommands(all, 'branch');
    // "New branch" (Create) and "Go to Branches" (Navigate) are not label-prefix matches of
    // "branch"; both score as word-start matches, so Navigate comes first within the flat order.
    expect(labels(r).slice(0, 2)).toEqual(['Go to Branches', 'New branch']);
    expect(r.groups.map((g) => g.group)).toEqual(['Navigate', 'Create', 'Records']);
  });

  it('finds records by name and by code', () => {
    expect(labels(filterCommands(all, 'kandy'))).toEqual([
      'Edit branch: Kandy',
      'Edit schedule: Kandy',
    ]);
    expect(labels(filterCommands(all, 'b2'))).toEqual([
      'Edit branch: Galle',
      'Edit schedule: Galle',
    ]);
    expect(labels(filterCommands(all, 'edit service hair'))).toEqual(['Edit service: Haircut']);
  });

  it(`caps record entries at ${RECORD_LIMIT} after sorting and never caps static commands`, () => {
    const many = buildCommands({
      branches: Array.from({ length: 40 }, (_, i) => branch(i)),
      services: [],
    }); // 80 branch and schedule records
    const r = filterCommands(many, '');
    const records = r.groups.find((g) => g.group === 'Records')!.items;
    expect(records).toHaveLength(RECORD_LIMIT);
    expect(r.count).toBe(9 + RECORD_LIMIT);
    expect(
      filterCommands(many, '', 5).groups.find((g) => g.group === 'Records')!.items,
    ).toHaveLength(5);
    expect(filterCommands(many, 'go to').count).toBe(4); // statics untouched by the cap
  });

  it('group headings are group names, never commands', () => {
    for (const g of filterCommands(all, '').groups) {
      expect(all.some((c) => c.label === g.group)).toBe(false);
    }
  });
});

describe('isPaletteShortcut', () => {
  const key = (init: Partial<KeyboardEvent>) =>
    isPaletteShortcut({
      key: 'k',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...init,
    });

  it.each([
    [{ ctrlKey: true }, true],
    [{ metaKey: true }, true],
    [{ ctrlKey: true, key: 'K' }, true],
    [{}, false],
    [{ ctrlKey: true, shiftKey: true }, false],
    [{ metaKey: true, altKey: true }, false],
    [{ ctrlKey: true, key: 'j' }, false],
  ])('%j -> %s', (init, expected) => {
    expect(key(init)).toBe(expected);
  });
});

describe('platformKeyLabel', () => {
  it.each([
    [{ userAgentData: { platform: 'macOS' } }, '⌘K'],
    [{ platform: 'MacIntel' }, '⌘K'],
    [{ platform: 'iPhone' }, '⌘K'],
    [{ platform: 'iPad' }, '⌘K'],
    [{ platform: 'Win32' }, 'Ctrl K'],
    [{ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }, 'Ctrl K'], // userAgentData wins
    [{ platform: 'Linux x86_64' }, 'Ctrl K'],
    [{}, 'Ctrl K'],
  ])('%j -> %s', (nav, expected) => {
    expect(platformKeyLabel(nav)).toBe(expected);
  });
});
