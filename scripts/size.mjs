// Gzipped size of the initial files listed in the production index.html.
// Fails (exit 1) when the total exceeds MAX_GZIP_KB (default 250).
//
// `--group <name>` measures a lazy feature group instead: every output whose entry point is under
// src/app/features/<name>/, plus the non-initial chunks those outputs import statically (each counted
// once), read from the build's stats metafile (`statsJson` in the production configuration). Fails
// when the total exceeds MAX_GZIP_KB_<NAME> (default from GROUP_DEFAULTS).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const GROUP_DEFAULTS = { public: 50 };

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
