import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminGroup, initialClosure, referencedFiles } from './size-group.mjs';

const files = new Map([
  [
    'main.js',
    'import{a}from"./chunk-init.js";const r=()=>import("./chunk-admin.js");const p=()=>import("./chunk-public.js");',
  ],
  ['chunk-init.js', 'export const a=1;'],
  [
    'chunk-admin.js',
    'path:"branches/:id/schedule";import("./chunk-page.js");import{f}from"./chunk-forms.js";',
  ],
  ['chunk-page.js', 'import{f}from"./chunk-forms.js";import{u}from"./chunk-init.js";'],
  ['chunk-forms.js', 'export const f=1;'],
  ['chunk-public.js', 'import{f}from"./chunk-forms.js";'],
  ['chunk-other.js', 'nothing'],
]);

test('referencedFiles finds static and dynamic imports', () => {
  assert.deepEqual(referencedFiles(files.get('main.js')), [
    'chunk-init.js',
    'chunk-admin.js',
    'chunk-public.js',
  ]);
});

test('the initial closure follows static imports only', () => {
  assert.deepEqual([...initialClosure(files, ['main.js'])].sort(), ['chunk-init.js', 'main.js']);
});

test('the admin group is everything reachable from the admin entry, minus the initial files', () => {
  const initial = initialClosure(files, ['main.js']);
  const { entry, group, shared } = adminGroup(files, initial);
  assert.equal(entry, 'chunk-admin.js');
  assert.deepEqual(group, ['chunk-admin.js', 'chunk-forms.js', 'chunk-page.js']);
  assert.deepEqual(shared, ['chunk-forms.js']);
});

test('no admin entry gives an empty group', () => {
  const { entry, group } = adminGroup(new Map([['main.js', '']]), new Set(['main.js']));
  assert.equal(entry, null);
  assert.deepEqual(group, []);
});
