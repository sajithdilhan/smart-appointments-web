// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
import { readFileSync } from 'node:fs';
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
