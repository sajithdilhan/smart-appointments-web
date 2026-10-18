import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TEAL_HEX = [
  '#f0fdfa',
  '#ccfbf1',
  '#99f6e4',
  '#5eead4',
  '#2dd4bf',
  '#14b8a6',
  '#0d9488',
  '#0f766e',
  '#115e59',
  '#134e4a',
  '#042f2e',
];
const TEAL_WORD = /\bteal\b|\bteal-/i;
const SELF = 'no-teal.spec.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|css|html|js|json|svg|webmanifest)$/.test(name) && name !== SELF ? [path] : [];
  });
}

describe('palette: no teal left (Req 1.1)', () => {
  const roots = ['src', 'public'].map((d) => resolve(process.cwd(), d));
  const all = roots.flatMap(files);

  it('scans a plausible number of files', () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it('has no old teal hex value or the word teal in src/ or public/', () => {
    const offenders = all.filter((path) => {
      const text = readFileSync(path, 'utf8').toLowerCase();
      return TEAL_HEX.some((hex) => text.includes(hex)) || TEAL_WORD.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
