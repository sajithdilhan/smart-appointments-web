import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const script = readFileSync(resolve(process.cwd(), 'public/theme-init.js'), 'utf8');

function run(options: { stored?: string | null; systemDark?: boolean }): boolean {
  const classes = new Set<string>();
  const fakeWindow = {
    localStorage: {
      getItem: () => {
        if (options.stored === 'throw') throw new Error('blocked');
        return options.stored ?? null;
      },
    },
    matchMedia: () => ({ matches: options.systemDark ?? false }),
  };
  const fakeDocument = { documentElement: { classList: { add: (c: string) => classes.add(c) } } };
  new Function('window', 'document', script)(fakeWindow, fakeDocument);
  return classes.has('dark');
}

describe('theme-init.js', () => {
  it.each([
    ['dark stored, system light', 'dark', false, true],
    ['light stored, system dark', 'light', true, false],
    ['system stored, system dark', 'system', true, true],
    ['system stored, system light', 'system', false, false],
    ['nothing stored, system dark', null, true, true],
    ['invalid stored, system light', 'purple', false, false],
    ['throwing storage, system dark', 'throw', true, true],
  ] as const)('%s', (_name, stored, systemDark, expected) => {
    expect(run({ stored, systemDark })).toBe(expected);
  });
});
