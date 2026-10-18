// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
//
// `--group <name>` measures a lazy feature group instead: every output whose entry point is under
// src/app/features/<name>/, plus the non-initial chunks those outputs import statically (each counted
// once), read from the build's stats metafile (`statsJson` in the production configuration). Fails
// when the total exceeds MAX_GZIP_KB_<NAME> (default from GROUP_DEFAULTS).
//
// `--group admin` is the exception: it dispatches to the walker in size-group.mjs, which follows
// dynamic imports too (every lazy file reachable from the admin route chunk, shared chunks counted
// once and listed apart), against MAX_GZIP_KB_ADMIN (default 120).
//
// `--group book` is the other exception: it dispatches to groupChunks in size-book.mjs, which sums
// the booking wizard's lazy chunks (entry points under src/app/features/customer/book/ plus the
// non-initial chunks they import statically, shared chunks once) and reports the confetti and
// `.ics` chunks separately, against MAX_GZIP_KB_BOOK (default 60).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { groupChunks } from './size-book.mjs';
import { adminGroup, initialClosure } from './size-group.mjs';

export const GROUP_DEFAULTS = { public: 50, admin: 120, book: 60 };

/** Files referenced by script, modulepreload and stylesheet tags of index.html. */
export function initialFiles(html) {
  const files = new Set();
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const isScript = /^<script/i.test(tag);
    const rel = /\brel=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!isScript && rel !== 'modulepreload' && rel !== 'stylesheet') continue;
    const ref = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (ref && !/^[a-z]+:\/\//i.test(ref)) files.add(ref.replace(/^\//, ''));
  }
  return files;
}

/**
 * Output files of a feature group: the outputs whose entry point is under `entryPrefix`, plus the
 * chunks they import statically (transitively), excluding the initial files. Paths are relative to
 * `outDir` (the prefix the metafile puts on output keys).
 */
export function groupFiles(stats, { entryPrefix, outDir, initial }) {
  const strip = (p) => p.replace(/\\/g, '/').replace(`${outDir}/`, '');
  const outputs = new Map(
    Object.entries(stats.outputs)
      .filter(([key]) => key.endsWith('.js'))
      .map(([key, value]) => [strip(key), value]),
  );
  const files = new Set();
  const visit = (file) => {
    if (files.has(file) || initial.has(file) || !outputs.has(file)) return;
    files.add(file);
    for (const imp of outputs.get(file).imports ?? []) {
      if (imp.kind === 'import-statement') visit(strip(imp.path));
    }
  };
  for (const [file, output] of outputs) {
    if (output.entryPoint?.replace(/\\/g, '/').startsWith(entryPrefix)) visit(file);
  }
  return files;
}

function report(root, files, maxKb, label) {
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
    console.error(`${label} gzip size ${(gzTotal / 1000).toFixed(2)} kB exceeds ${maxKb} kB`);
    process.exit(1);
  }
  console.log(`OK: within ${maxKb} kB gzipped`);
}

/** F5's admin report: walks the built sources (static and dynamic imports) instead of the metafile. */
export function reportAdmin(root, initialSet, maxKb) {
  const sources = new Map(
    readdirSync(root)
      .filter((f) => f.endsWith('.js'))
      .map((f) => [f, readFileSync(join(root, f), 'utf8')]),
  );
  const initial = initialClosure(
    sources,
    [...initialSet].filter((f) => f.endsWith('.js')),
  );
  // Never walk into another feature's lazy entry chunks (e.g. public), reached by dynamic import.
  const statsPath = process.env.STATS_JSON ?? `${root}-stats.json`;
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
  const outDir = root.replace(/\\/g, '/');
  const stop = new Set();
  for (const [key, output] of Object.entries(stats.outputs)) {
    const entryPoint = output.entryPoint?.replace(/\\/g, '/');
    const foreign = /^src\/app\/features\/([^/]+)\//.exec(entryPoint ?? '')?.[1];
    if (foreign && foreign !== 'admin') {
      stop.add(key.replace(/\\/g, '/').replace(`${outDir}/`, ''));
    }
  }
  const { entry, group, shared } = adminGroup(sources, initial, undefined, stop);
  if (!entry) {
    console.error('No admin chunk found in the build output.');
    process.exit(1);
  }
  const gzOf = (f) => gzipSync(readFileSync(join(root, f)), { level: 9 }).length;
  let gz = 0;
  const lines = group.map((f) => {
    const size = gzOf(f);
    gz += size;
    return `${f.padEnd(34)} ${(size / 1000).toFixed(2).padStart(8)} kB gzip${shared.includes(f) ? '  (shared with other lazy code)' : ''}`;
  });
  console.log(`Admin lazy group (entry ${entry}), ${group.length} files:`);
  for (const line of lines) console.log(line);
  const sharedGz = shared.reduce((n, f) => n + gzOf(f), 0);
  console.log(
    `total ${(gz / 1000).toFixed(2)} kB gzip, of which shared ${(sharedGz / 1000).toFixed(2)} kB`,
  );
  if (gz / 1000 > maxKb) {
    console.error(`Admin group gzip size ${(gz / 1000).toFixed(2)} kB exceeds ${maxKb} kB`);
    process.exit(1);
  }
  console.log(`OK: within ${maxKb} kB gzipped`);
}

/** F3's booking report: the wizard's chunks from the metafile, confetti and ics reported apart. */
export function reportBook(root, initial, maxKb) {
  const statsPath = process.env.STATS_JSON ?? `${root}-stats.json`;
  let meta;
  try {
    meta = JSON.parse(readFileSync(statsPath, 'utf8'));
  } catch {
    console.error(`Cannot read ${statsPath}: build with "statsJson" enabled (pnpm build does).`);
    process.exit(1);
  }
  const gzipKb = (file) => gzipSync(readFileSync(join(root, file)), { level: 9 }).length / 1000;
  const { group, separate } = groupChunks(meta, initial, 'src/app/features/customer/book/');
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
  if (group.some((file) => initial.has(file))) {
    console.error('A booking chunk is in the initial bundle');
    process.exit(1);
  }
  if (total > maxKb) {
    console.error(`Booking gzip size ${total.toFixed(2)} kB exceeds ${maxKb} kB`);
    process.exit(1);
  }
  console.log(`OK: booking wizard within ${maxKb} kB gzipped`);
}

function main() {
  const root = process.env.DIST_DIR ?? 'dist/smart-appointments-web/browser';
  const initial = initialFiles(readFileSync(join(root, 'index.html'), 'utf8'));
  const groupArg = process.argv.indexOf('--group');
  if (groupArg === -1) {
    report(root, initial, Number(process.env.MAX_GZIP_KB ?? 250), 'Initial');
    return;
  }

  const group = process.argv[groupArg + 1];
  if (!group || !(group in GROUP_DEFAULTS)) {
    console.error(`Unknown group "${group}"; known: ${Object.keys(GROUP_DEFAULTS).join(', ')}`);
    process.exit(2);
  }
  if (group === 'admin') {
    reportAdmin(root, initial, Number(process.env.MAX_GZIP_KB_ADMIN ?? GROUP_DEFAULTS.admin));
    return;
  }
  if (group === 'book') {
    reportBook(root, initial, Number(process.env.MAX_GZIP_KB_BOOK ?? GROUP_DEFAULTS.book));
    return;
  }
  const statsPath = process.env.STATS_JSON ?? `${root}-stats.json`;
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'));
  const files = groupFiles(stats, {
    entryPrefix: `src/app/features/${group}/`,
    outDir: root.replace(/\\/g, '/'),
    initial,
  });
  if (files.size === 0) {
    console.error(`No outputs found for group "${group}" in ${statsPath}`);
    process.exit(1);
  }
  const envKey = `MAX_GZIP_KB_${group.toUpperCase()}`;
  report(root, files, Number(process.env[envKey] ?? GROUP_DEFAULTS[group]), `Group "${group}"`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
