/** Ctrl+K or Cmd+K, with no Shift or Alt. */
export function isPaletteShortcut(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
}

interface NavigatorLike {
  userAgentData?: { platform?: string };
  platform?: string;
}

/** "⌘K" on Apple platforms, otherwise "Ctrl K". */
export function platformKeyLabel(nav: NavigatorLike = globalThis.navigator): string {
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K';
}
