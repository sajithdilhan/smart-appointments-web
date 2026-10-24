import type { Branch, ServiceType } from '../../../core/api/models';

export type CommandGroup = 'Navigate' | 'Create' | 'Records' | 'Settings';

export type CommandAction =
  | { kind: 'navigate'; url: string; queryParams?: Record<string, string> }
  | { kind: 'theme' }
  | { kind: 'signOut' };

export interface Command {
  id: string;
  label: string;
  keywords: string[];
  group: CommandGroup;
  run: CommandAction;
  hint?: string;
  icon?: string;
}

export const GROUP_ORDER: readonly CommandGroup[] = ['Navigate', 'Create', 'Records', 'Settings'];

/** At most this many record entries are shown. */
export const RECORD_LIMIT = 50;

const go = (
  id: string,
  label: string,
  url: string,
  group: CommandGroup,
  keywords: string[],
  icon?: string,
): Command => ({ id, label, keywords, group, run: { kind: 'navigate', url }, icon });

const STATIC_COMMANDS: readonly Command[] = [
  go(
    'go-dashboard',
    'Go to Dashboard',
    '/admin',
    'Navigate',
    ['home', 'overview'],
    'layout-dashboard',
  ),
  go(
    'go-branches',
    'Go to Branches',
    '/admin/branches',
    'Navigate',
    ['locations', 'sites'],
    'building-2',
  ),
  go(
    'go-services',
    'Go to Services',
    '/admin/services',
    'Navigate',
    ['service types', 'offerings'],
    'scissors',
  ),
  go(
    'go-staff',
    'Go to staff',
    '/admin/staff',
    'Navigate',
    ['staff members', 'users', 'accounts'],
    'users',
  ),
  go(
    'go-slots',
    'Go to Slot generation',
    '/admin/slots',
    'Navigate',
    ['slots', 'calendar'],
    'calendar-plus',
  ),
  go(
    'go-appointments',
    'Go to appointments',
    '/admin/appointments',
    'Navigate',
    ['bookings', 'schedule', 'day'],
    'calendar-check',
  ),
  go(
    'new-branch',
    'New branch',
    '/admin/branches/new',
    'Create',
    ['add', 'create', 'location'],
    'plus',
  ),
  go(
    'new-service',
    'New service',
    '/admin/services/new',
    'Create',
    ['add', 'create', 'service type'],
    'plus',
  ),
  go(
    'new-staff',
    'New staff member',
    '/admin/staff/new',
    'Create',
    ['add', 'create', 'staff', 'user', 'account'],
    'plus',
  ),
  go(
    'generate-slots',
    'Generate slots',
    '/admin/slots',
    'Create',
    ['create slots', 'availability'],
    'calendar-plus',
  ),
  {
    id: 'toggle-theme',
    label: 'Toggle theme',
    keywords: ['dark', 'light', 'appearance', 'mode'],
    group: 'Settings',
    run: { kind: 'theme' },
    icon: 'sun-moon',
  },
  {
    id: 'sign-out',
    label: 'Sign out',
    keywords: ['log out', 'logout', 'exit'],
    group: 'Settings',
    run: { kind: 'signOut' },
    icon: 'log-out',
  },
];

/** The static commands plus an edit entry for every branch and service already in memory. */
export function buildCommands(ctx: {
  branches: readonly Branch[];
  services: readonly ServiceType[];
}): Command[] {
  const records: Command[] = [];
  for (const b of ctx.branches) {
    const keywords = ['branch', b.code, b.name];
    records.push(
      go(`branch-${b.id}`, `Edit branch: ${b.name}`, `/admin/branches/${b.id}`, 'Records', [
        ...keywords,
        'edit',
      ]),
      go(
        `schedule-${b.id}`,
        `Edit schedule: ${b.name}`,
        `/admin/branches/${b.id}/schedule`,
        'Records',
        [...keywords, 'schedule', 'hours', 'time zone'],
      ),
    );
  }
  for (const s of ctx.services) {
    records.push(
      go(`service-${s.id}`, `Edit service: ${s.name}`, `/admin/services/${s.id}`, 'Records', [
        'service',
        s.code,
        s.name,
        'edit',
      ]),
    );
  }
  return [...STATIC_COMMANDS, ...records];
}

export interface CommandResults {
  groups: { group: CommandGroup; items: Command[] }[];
  /** Total number of commands across the groups. */
  count: number;
}

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean);

function score(command: Command, queryWords: string[], query: string): number {
  const label = command.label.toLowerCase();
  const haystack = `${label} ${command.keywords.join(' ').toLowerCase()}`;
  if (!queryWords.every((w) => haystack.includes(w))) return 0;
  if (label.startsWith(query)) return 3;
  const starts = words(haystack);
  return queryWords.every((w) => starts.some((s) => s.startsWith(w))) ? 2 : 1;
}

/**
 * Every query word must appear (case-insensitively) in the label or keywords. Ranking: 3 for a
 * label that starts with the query, 2 when every word starts a word, 1 for any substring; then
 * group order, then label. An empty query keeps registry order. Record entries are capped at
 * `limit` after ranking. Results are binned into their groups, in group order.
 */
export function filterCommands(
  all: readonly Command[],
  query: string,
  limit = RECORD_LIMIT,
): CommandResults {
  const normalised = words(query).join(' ');
  const queryWords = words(query);
  const ranked = all
    .map((command, index) => ({
      command,
      index,
      score: queryWords.length === 0 ? 1 : score(command, queryWords, normalised),
    }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        GROUP_ORDER.indexOf(a.command.group) - GROUP_ORDER.indexOf(b.command.group) ||
        (queryWords.length === 0
          ? a.index - b.index
          : a.command.label.localeCompare(b.command.label, undefined, { numeric: true })),
    );

  let records = 0;
  const kept = ranked.filter((r) => r.command.group !== 'Records' || ++records <= limit);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: kept.filter((r) => r.command.group === group).map((r) => r.command),
  })).filter((g) => g.items.length > 0);
  return { groups, count: kept.length };
}
