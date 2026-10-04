import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => `${m.ruleId}: ${m.message}`);
}

const OUTSIDE = 'src/app/features/sample/sample.ts';
const INSIDE = 'src/app/core/time/sample.ts';
const samples = {
  'new Date(<value>)': 'export const d = (s: string) => new Date(s);',
  'new Date(<number>)': 'export const d = (n: number) => new Date(n);',
  'Date.parse': 'export const d = (s: string) => Date.parse(s);',
  toLocaleString: 'export const d = (x: Date) => x.toLocaleString();',
  toLocaleDateString: 'export const d = (x: Date) => x.toLocaleDateString();',
  toLocaleTimeString: 'export const d = (x: Date) => x.toLocaleTimeString();',
  DatePipe: "import { DatePipe } from '@angular/common';\nexport const p = DatePipe;",
};

for (const [name, code] of Object.entries(samples)) {
  test(`${name} is rejected outside core/time`, async () => {
    const found = await messages(code, OUTSIDE);
    assert.ok(
      found.some((m) => m.startsWith('no-restricted-')),
      `expected a restriction: ${found}`,
    );
  });
  test(`${name} is allowed inside core/time and in specs`, async () => {
    if (name === 'DatePipe') return;
    assert.deepEqual(
      (await messages(code, INSIDE)).filter((m) => m.startsWith('no-restricted-')),
      [],
    );
    assert.deepEqual(
      (await messages(code, 'src/app/features/sample/sample.spec.ts')).filter((m) =>
        m.startsWith('no-restricted-'),
      ),
      [],
    );
  });
}

test('DatePipe is also rejected in core and shared (the zone rules keep their patterns)', async () => {
  for (const file of ['src/app/core/auth/sample.ts', 'src/app/shared/layout/sample.ts']) {
    const found = await messages(samples.DatePipe, file);
    assert.ok(
      found.some((m) => m.includes('DatePipe formats')),
      file,
    );
  }
});

test('new Date() with no argument stays allowed', async () => {
  const found = await messages('export const now = new Date();', OUTSIDE);
  assert.deepEqual(
    found.filter((m) => m.startsWith('no-restricted-')),
    [],
  );
});
