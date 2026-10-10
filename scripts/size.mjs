// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
//
// `--group book`: instead sums the gzip size of the booking wizard's lazy chunks (the outputs
// whose entry point is under src/app/features/customer/book/, plus the non-initial chunks they
// import statically, shared chunks once) from the build's `browser-stats.json`, and fails above
// MAX_GZIP_KB_BOOK (default 60). The confetti and `.ics` chunks are reported separately.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { groupChunks } from './size-group.mjs';

const root = process.env.DIST_DIR ?? 'dist/smart-appointments-web/browser';
const maxKb = Number(process.env.MAX_GZIP_KB ?? 250);
const maxBookKb = Number(process.env.MAX_GZIP_KB_BOOK ?? 60);
const statsFile = process.env.STATS_FILE ?? join(root, '..', 'browser-stats.json');
const groupArg = process.argv.includes('--group')
  ? process.argv[process.argv.indexOf('--group') + 1]
  : null;

const html = readFileSync(join(root, 'index.html'), 'utf8');
const files = new Set();
for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
  const isScript = /^<script/i.test(tag);
  const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1];
  if (!isScript && rel !== 'modulepreload' && rel !== 'stylesheet') continue;
  const ref = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
  if (ref && !/^[a-z]+:\/\//i.test(ref)) files.add(ref.replace(/^\//, ''));
}

const gzipKb = (file) => gzipSync(readFileSync(join(root, file)), { level: 9 }).length / 1000;

if (groupArg !== null) {
  if (groupArg !== 'book') {
    console.error(`Unknown group "${groupArg}" (only "book")`);
    process.exit(1);
  }
  let meta;
  try {
    meta = JSON.parse(readFileSync(statsFile, 'utf8'));
  } catch {
    console.error(`Cannot read ${statsFile}: build with "statsJson" enabled (pnpm build does).`);
    process.exit(1);
  }
  const { group, separate } = groupChunks(meta, files, 'src/app/features/customer/book/');
  const width = Math.max(...group.map((f) => f.length), 5, 'confetti (separate)'.length);
  let total = 0;
  console.log(`${'chunk'.padEnd(width)}  gzip kB`);
  for (const file of group) {
    const kb = gzipKb(file);
    total += kb;
    console.log(`${file.padEnd(width)}  ${kb.toFixed(2).padStart(7)}`);
  }
  console.log(`${'book total'.padEnd(width)}  ${total.toFixed(2).padStart(7)}`);
  for (const [label, list] of Object.entries(separate)) {
    const kb = list.reduce((sum, f) => sum + gzipKb(f), 0);
    console.log(`${(label + ' (separate)').padEnd(width)}  ${kb.toFixed(2).padStart(7)}`);
  }
  if (group.some((file) => files.has(file))) {
    console.error('A booking chunk is in the initial bundle');
    process.exit(1);
  }
  if (total > maxBookKb) {
    console.error(`Booking gzip size ${total.toFixed(2)} kB exceeds ${maxBookKb} kB`);
    process.exit(1);
  }
  console.log(`OK: booking wizard within ${maxBookKb} kB gzipped`);
  process.exit(0);
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
