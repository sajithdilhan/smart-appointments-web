// Pure grouping of the esbuild metafile (`browser-stats.json`) for `pnpm size:book`.

/** Entry points reported on their own: lazy chunks the wizard loads on demand. */
const SEPARATE = [
  { label: 'confetti', match: /\/confetti\.component\.ts$/ },
  { label: 'ics', match: /\/ics\/(build-ics|ics-download)\.ts$/ },
];

/**
 * @param {{ outputs: Record<string, { entryPoint?: string, imports: { path: string, kind: string }[] }> }} meta
 * @param {Set<string>} initial output files of the initial bundle (from index.html)
 * @param {string} prefix source folder of the group, for example `src/app/features/customer/book/`
 * @returns {{ group: string[], separate: Record<string, string[]> }}
 *   `group`: the group's entry chunks plus every non-initial chunk they statically import,
 *   shared chunks once. `separate`: the lazy chunks reported on their own, which are never
 *   counted in `group`.
 */
export function groupChunks(meta, initial, prefix) {
  const outputs = meta.outputs;
  const separate = Object.fromEntries(SEPARATE.map((s) => [s.label, []]));
  const separateFiles = new Set();
  for (const [file, out] of Object.entries(outputs)) {
    const hit = SEPARATE.find((s) => out.entryPoint && s.match.test(out.entryPoint));
    if (hit) {
      separate[hit.label].push(file);
      separateFiles.add(file);
    }
  }

  const group = new Set();
  const visit = (file) => {
    if (group.has(file) || initial.has(file) || separateFiles.has(file) || !outputs[file]) return;
    group.add(file);
    for (const imp of outputs[file].imports) {
      if (imp.kind === 'import-statement') visit(imp.path);
    }
  };
  for (const [file, out] of Object.entries(outputs)) {
    if (out.entryPoint?.startsWith(prefix)) visit(file);
  }
  return { group: [...group].sort(), separate };
}
