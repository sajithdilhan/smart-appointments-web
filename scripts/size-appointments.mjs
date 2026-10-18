// F4's lazy group (appointments + profile): the chunks holding these components plus every chunk
// that only F4 chunks import (shared framework chunks used elsewhere are not counted).
export const APPOINTMENTS_MARKERS = [
  'app-appointments-page',
  'app-appointment-detail',
  'app-appointment-not-found',
  'app-profile-page',
  'app-appointment-card',
  'app-theme-picker',
  'app-appointment-status-badge',
];

/**
 * `sources` maps each built .js file name to its text; `initial` is the set of initial files.
 * Returns the set of file names in the F4 group.
 */
export function appointmentsGroup(sources, initial, markers = APPOINTMENTS_MARKERS) {
  const all = [...sources.keys()];
  const importers = new Map(all.map((f) => [f, new Set()]));
  for (const f of all) {
    for (const m of sources
      .get(f)
      .matchAll(/(?:from\s*|import\s*\(?\s*)["']\.\/([^"']+\.js)["']/g)) {
      if (sources.has(m[1])) importers.get(m[1]).add(f);
    }
  }
  const group = new Set(
    all.filter((f) => !initial.has(f) && markers.some((m) => sources.get(f).includes(m))),
  );
  for (let grew = true; grew;) {
    grew = false;
    for (const f of all) {
      if (group.has(f) || initial.has(f)) continue;
      const who = importers.get(f);
      if (who.size > 0 && [...who].every((w) => group.has(w))) {
        group.add(f);
        grew = true;
      }
    }
  }
  return group;
}
