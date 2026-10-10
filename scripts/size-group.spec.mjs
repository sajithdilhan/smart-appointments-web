import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupChunks } from './size-group.mjs';

const out = (entryPoint, ...imports) => ({
  ...(entryPoint ? { entryPoint } : {}),
  imports: imports.map(([path, kind]) => ({ path, kind })),
});
const S = 'import-statement';
const D = 'dynamic-import';
const PREFIX = 'src/app/features/customer/book/';

const meta = {
  outputs: {
    'main.js': out('src/main.ts', ['common.js', S], ['book-routes.js', D]),
    'common.js': out(),
    'book-routes.js': out(
      `${PREFIX}book.routes.ts`,
      ['common.js', S],
      ['shared-a.js', S],
      ['confetti.js', D],
      ['build-ics.js', D],
    ),
    'shared-a.js': out(undefined, ['shared-b.js', S]),
    'shared-b.js': out(),
    'confetti.js': out(`${PREFIX}components/confetti.component.ts`, ['common.js', S]),
    'build-ics.js': out('src/app/features/customer/shared/ics/build-ics.ts'),
    'ics-download.js': out('src/app/features/customer/shared/ics/ics-download.ts'),
    'admin.js': out('src/app/features/admin/admin.routes.ts', ['shared-a.js', S]),
  },
};

test('counts the group entries and their non-initial static imports once', () => {
  const { group } = groupChunks(meta, new Set(['main.js', 'common.js']), PREFIX);
  assert.deepEqual(group, ['book-routes.js', 'shared-a.js', 'shared-b.js']);
});

test('reports the confetti and ics chunks separately and never in the group', () => {
  const { group, separate } = groupChunks(meta, new Set(['main.js', 'common.js']), PREFIX);
  assert.deepEqual(separate.confetti, ['confetti.js']);
  assert.deepEqual(separate.ics, ['build-ics.js', 'ics-download.js']);
  assert.ok(!group.includes('confetti.js'));
});

test('an initial chunk is never counted and another feature is not in the group', () => {
  const { group } = groupChunks(meta, new Set(['main.js', 'common.js', 'shared-a.js']), PREFIX);
  assert.ok(!group.includes('shared-a.js'));
  assert.ok(!group.includes('admin.js'));
});

test('an empty group when nothing is under the prefix', () => {
  assert.deepEqual(groupChunks(meta, new Set(), 'src/app/nowhere/').group, []);
});
