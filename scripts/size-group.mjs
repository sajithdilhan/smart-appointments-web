// Which built files belong to the admin lazy group. The application builder writes hashed chunk
// names, so the group is found from the code: the chunk that holds the admin route table (it names the schedule route) is
// the entry, and everything it reaches through static or dynamic imports (the pages, the shared
// forms, the palette) belongs to the group, except files that are already part of the initial
// bundle. A chunk that other lazy code also imports is "shared": counted once, reported apart.

const REF = /(?:from|import)\s*\(?\s*["'`]\.\/([\w.-]+\.js)["'`]/g;

/** @param {string} source */
export function referencedFiles(source) {
  return [...source.matchAll(REF)].map((m) => m[1]);
}

/**
 * @param {Map<string, string>} files file name to source, for every `.js` file in the output
 * @param {Set<string>} initial the files the index page loads, and what they import statically
 * @param {string} marker text that appears only in the admin entry chunk
 * @returns {{ entry: string | null; group: string[]; shared: string[] }}
 */
export function adminGroup(files, initial, marker = 'branches/:id/schedule') {
  const entry = [...files].find(
    ([name, source]) => !initial.has(name) && source.includes(marker),
  )?.[0];
  if (!entry) return { entry: null, group: [], shared: [] };

  const reach = (start) => {
    const seen = new Set();
    const queue = [start];
    while (queue.length) {
      const name = queue.pop();
      if (seen.has(name) || !files.has(name)) continue;
      seen.add(name);
      for (const ref of referencedFiles(files.get(name))) queue.push(ref);
    }
    return seen;
  };

  const group = new Set([...reach(entry)].filter((name) => !initial.has(name)));
  // Other lazy files (not initial, not in the group) that reach into the group.
  const others = [...files.keys()].filter((name) => !initial.has(name) && !group.has(name));
  const shared = new Set();
  for (const name of others) {
    for (const reached of reach(name)) if (group.has(reached)) shared.add(reached);
  }
  return { entry, group: [...group].sort(), shared: [...shared].sort() };
}

/** Files the index loads plus everything they import statically (the initial bundle). */
export function initialClosure(files, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name) || !files.has(name)) continue;
    seen.add(name);
    // Only static imports keep a file initial: strip dynamic `import("...")` calls first.
    const source = files.get(name).replace(/import\s*\(\s*["'`][^"'`]+["'`]\s*\)/g, '');
    for (const ref of referencedFiles(source)) queue.push(ref);
  }
  return seen;
}
