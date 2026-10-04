import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  const end = css.indexOf('\n}', start);
  const body = css.slice(start, end);
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    vars[m[1]!] = m[2]!;
  }
  return vars;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

// [foreground token, background token, minimum ratio]
const pairs: [string, string, number][] = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['success-foreground', 'success', 4.5],
  ['warning-foreground', 'warning', 4.5],
  ['primary', 'background', 4.5], // text links
  ['ring', 'background', 3],
  ['input', 'background', 3], // control boundaries
];

describe.each([
  ['light', ':root'],
  ['dark', '.dark'],
])('%s theme contrast', (_name, selector) => {
  const tokens = parseBlock(css, selector);

  it.each(pairs)('%s on %s is at least %d:1', (fg, bg, min) => {
    expect(tokens[fg], `${fg} defined`).toBeDefined();
    expect(tokens[bg], `${bg} defined`).toBeDefined();
    expect(ratio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min);
  });
});
