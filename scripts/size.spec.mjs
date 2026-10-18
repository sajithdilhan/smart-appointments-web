import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GROUP_DEFAULTS, groupFiles, initialFiles, reportAdmin } from './size.mjs';

const outDir = 'dist/app/browser';
const out = (entryPoint, imports = []) => ({
  entryPoint,
  imports: imports.map(([path, kind]) => ({ path: `${outDir}/${path}`, kind })),
});

test('initialFiles reads scripts, modulepreloads and stylesheets but not external or other links', () => {
  const html = `
    <link rel="stylesheet" href="styles.css"><link rel="icon" href="favicon.ico">
    <link rel="modulepreload" href="/chunk-a.js"><script src="main.js" type="module"></script>
    <script src="https://cdn.example/x.js"></script>`;
  assert.deepEqual([...initialFiles(html)], ['styles.css', 'chunk-a.js', 'main.js']);
});

test('groupFiles takes group entries and their static, non-initial imports once', () => {
  const stats = {
    outputs: {
      [`${outDir}/main.js`]: out('src/main.ts', [['routes.js', 'dynamic-import']]),
      [`${outDir}/routes.js`]: out('src/app/features/public/public.routes.ts', [
        ['main.js', 'import-statement'],
        ['login.js', 'dynamic-import'],
        ['register.js', 'dynamic-import'],
      ]),
      [`${outDir}/login.js`]: out('src/app/features/public/login/login.page.ts', [
        ['forms.js', 'import-statement'],
      ]),
      [`${outDir}/register.js`]: out('src/app/features/public/register/register.page.ts', [
        ['forms.js', 'import-statement'],
      ]),
      [`${outDir}/forms.js`]: out(undefined, [['vendor.js', 'import-statement']]),
      [`${outDir}/vendor.js`]: out(undefined),
      [`${outDir}/admin.js`]: out('src/app/features/admin/admin.routes.ts', [
        ['other.js', 'import-statement'],
      ]),
      [`${outDir}/other.js`]: out(undefined),
      [`${outDir}/styles.css`]: out(undefined),
    },
  };
  const files = groupFiles(stats, {
    entryPrefix: 'src/app/features/public/',
    outDir,
    initial: new Set(['main.js']),
  });
  assert.deepEqual([...files].sort(), [
    'forms.js',
    'login.js',
    'register.js',
    'routes.js',
    'vendor.js',
  ]);
});

test('groupFiles accepts Windows separators in keys and entry points', () => {
  const stats = {
    outputs: {
      'dist\\app\\browser\\a.js': { entryPoint: 'src\\app\\features\\public\\a.ts', imports: [] },
    },
  };
  const files = groupFiles(stats, {
    entryPrefix: 'src/app/features/public/',
    outDir,
    initial: new Set(),
  });
  assert.deepEqual([...files], ['a.js']);
});

test('admin is a known group with its own 120 kB default, handled by the size-group walker', () => {
  assert.equal(GROUP_DEFAULTS.admin, 120);
  assert.equal(typeof reportAdmin, 'function');
});
