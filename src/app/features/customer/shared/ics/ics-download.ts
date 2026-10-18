/**
 * Downloads text as a `.ics` file with a Blob, an object URL and a temporary `<a download>`;
 * the URL is revoked right after the click. Never throws: returns `false` on failure so the
 * caller can show the one error toast ("We could not create the calendar file.").
 */
export function downloadIcs(text: string, fileName: string): boolean {
  let url: string | null = null;
  try {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.hidden = true;
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
    return true;
  } catch {
    return false;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
