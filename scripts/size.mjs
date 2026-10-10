// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
//
// `--group admin` measures the admin lazy group instead: every lazy file reachable from the admin
// route chunk (shared chunks counted once and listed apart), against MAX_GZIP_KB_ADMIN (default 120).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { adminGroup, initialClosure } from './size-group.mjs';

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

const groupFlag = process.argv.indexOf('--group');
if (groupFlag !== -1) {
  const name = process.argv[groupFlag + 1];
  if (name !== 'admin') {
    console.error(`Unknown group "${name}". Supported: admin`);
    process.exit(2);
  }
  const maxAdmin = Number(process.env.MAX_GZIP_KB_ADMIN ?? 120);
  const sources = new Map(
    readdirSync(root)
      .filter((f) => f.endsWith('.js'))
      .map((f) => [f, readFileSync(join(root, f), 'utf8')]),
  );
  const initial = initialClosure(
    sources,
    [...files].filter((f) => f.endsWith('.js')),
  );
  const { entry, group, shared } = adminGroup(sources, initial);
  if (!entry) {
    console.error('No admin chunk found in the build output.');
    process.exit(1);
  }
  let gz = 0;
  const lines = group.map((f) => {
    const size = gzipSync(readFileSync(join(root, f)), { level: 9 }).length;
    gz += size;
    return `${f.padEnd(34)} ${(size / 1000).toFixed(2).padStart(8)} kB gzip${shared.includes(f) ? '  (shared with other lazy code)' : ''}`;
  });
  console.log(`Admin lazy group (entry ${entry}), ${group.length} files:`);
  for (const line of lines) console.log(line);
  const sharedGz = shared.reduce(
    (n, f) => n + gzipSync(readFileSync(join(root, f)), { level: 9 }).length,
    0,
  );
  console.log(
    `total ${(gz / 1000).toFixed(2)} kB gzip, of which shared ${(sharedGz / 1000).toFixed(2)} kB`,
  );
  if (gz / 1000 > maxAdmin) {
    console.error(`Admin group gzip size ${(gz / 1000).toFixed(2)} kB exceeds ${maxAdmin} kB`);
    process.exit(1);
  }
  console.log(`OK: within ${maxAdmin} kB gzipped`);
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
