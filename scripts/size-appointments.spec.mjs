import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appointmentsGroup } from './size-appointments.mjs';

const sources = new Map([
  ['main.js', 'import "./common.js"; import("./appts.js")'],
  ['common.js', 'export const a = 1;'],
  ['appts.js', 'import "./only-f4.js"; import "./shared.js"; const x = "app-appointments-page";'],
  ['profile.js', 'import "./shared.js"; const x = "app-profile-page";'],
  ['only-f4.js', 'export const b = 1;'],
  ['shared.js', 'export const c = 1;'],
  ['other.js', 'import "./shared.js"; import "./lonely.js";'],
  ['lonely.js', 'export const d = 1;'],
]);

test('collects marker chunks and chunks only F4 chunks import', () => {
  const group = appointmentsGroup(sources, new Set(['main.js', 'common.js']));
  assert.deepEqual([...group].sort(), ['appts.js', 'only-f4.js', 'profile.js']);
});

test('never counts initial files', () => {
  const group = appointmentsGroup(sources, new Set(['main.js', 'common.js', 'appts.js']));
  assert.ok(!group.has('appts.js'));
});
