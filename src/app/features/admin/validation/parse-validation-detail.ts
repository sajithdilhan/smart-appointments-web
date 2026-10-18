/** What the backend puts before the joined rule messages of a validation `400`. */
export const VALIDATION_PREFIX = 'Invalid request data. Errors: ';

/**
 * Splits a validation `detail` into its rule messages. The backend joins them with a bare comma,
 * and some of its own messages contain commas ("Code must be 2-10 letters, digits or hyphens,
 * and cannot ..."), so a plain `split(',')` would shred a known message. Known messages are
 * therefore matched first, longest first; a known message is consumed whole when it ends at a
 * comma or at the end of the string. Anything else is taken up to the next comma (an unknown
 * message, reported as such). A detail without the prefix is returned as one item.
 */
export function splitValidationDetail(detail: string, known: readonly string[]): string[] {
  if (!detail.startsWith(VALIDATION_PREFIX)) return [detail];
  const body = detail.slice(VALIDATION_PREFIX.length);
  const byLength = [...known].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (let i = 0; i < body.length;) {
    const hit = byLength.find(
      (m) => body.startsWith(m, i) && (i + m.length === body.length || body[i + m.length] === ','),
    );
    const comma = body.indexOf(',', i);
    const end = hit ? i + hit.length : comma === -1 ? body.length : comma;
    out.push(body.slice(i, end));
    i = end + 1; // skip the joining comma
  }
  return out.filter(Boolean);
}
