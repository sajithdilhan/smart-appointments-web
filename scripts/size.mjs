// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.env.DIST_DIR ?? 'dist/smart-appointments-web/browser';
const maxKb = Number(process.env.MAX_GZIP_KB ?? 250);

const html = readFileSync(join(root, 'index.html'), 'utf8');
const files = new Set();
for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
  const isScript = /^<script/i.test(tag);
  const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1];
  if (!isScript && rel !== 'modulepreload' && rel !== 'stylesheet') continue;
  const ref = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
  if (ref && !/^[a-z]+:\/\//i.test(ref)) files.add(ref.replace(/^\//, ''));
}

let rawTotal = 0;
let gzTotal = 0;
const rows = [];
for (const file of files) {
  const buf = readFileSync(join(root, file));
  const gz = gzipSync(buf, { level: 9 }).length;
  rawTotal += buf.length;
  gzTotal += gz;
  rows.push([file, (buf.length / 1000).toFixed(2), (gz / 1000).toFixed(2)]);
}

const width = Math.max(...rows.map((r) => r[0].length), 5);
console.log(`${'file'.padEnd(width)}  raw kB  gzip kB`);
for (const [f, raw, gz] of rows)
  console.log(`${f.padEnd(width)}  ${raw.padStart(6)}  ${gz.padStart(7)}`);
console.log(
  `${'total'.padEnd(width)}  ${(rawTotal / 1000).toFixed(2).padStart(6)}  ${(gzTotal / 1000).toFixed(2).padStart(7)}`,
);

if (gzTotal / 1000 > maxKb) {
  console.error(`Initial gzip size ${(gzTotal / 1000).toFixed(2)} kB exceeds ${maxKb} kB`);
  process.exit(1);
}
console.log(`OK: within ${maxKb} kB gzipped`);

// F4 lazy chunks (appointments + profile): the chunks holding these components plus every chunk
// that only F4 chunks import (shared framework chunks used elsewhere are not counted).
const F4_MARKERS = [
  'app-appointments-page',
  'app-appointment-detail',
  'app-appointment-not-found',
  'app-profile-page',
  'app-appointment-card',
  'app-theme-picker',
  'app-status-badge',
];
const maxF4Kb = Number(process.env.MAX_F4_GZIP_KB ?? 40);

const all = readdirSync(root).filter((f) => f.endsWith('.js'));
const text = new Map(all.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
const importsOf = (f) => {
  const out = new Set();
  for (const m of text.get(f).matchAll(/(?:from\s*|import\s*\(?\s*)["']\.\/([^"']+\.js)["']/g)) {
    if (text.has(m[1])) out.add(m[1]);
  }
  return out;
};
const importers = new Map(all.map((f) => [f, new Set()]));
for (const f of all) for (const dep of importsOf(f)) importers.get(dep).add(f);

const f4 = new Set(
  all.filter((f) => !files.has(f) && F4_MARKERS.some((m) => text.get(f).includes(m))),
);
for (let grew = true; grew;) {
  grew = false;
  for (const f of all) {
    if (f4.has(f) || files.has(f)) continue;
    const who = importers.get(f);
    if (who.size > 0 && [...who].every((w) => f4.has(w))) {
      f4.add(f);
      grew = true;
    }
  }
}
let f4Gz = 0;
for (const f of f4) f4Gz += gzipSync(readFileSync(join(root, f)), { level: 9 }).length;
console.log(
  `F4 lazy chunks: ${f4.size} files, ${(f4Gz / 1000).toFixed(2)} kB gzipped (limit ${maxF4Kb} kB)`,
);
if (f4Gz / 1000 > maxF4Kb) {
  console.error(`F4 lazy gzip size exceeds ${maxF4Kb} kB`);
  process.exit(1);
}
