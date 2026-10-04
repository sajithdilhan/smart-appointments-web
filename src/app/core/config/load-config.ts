import type { AppConfig } from './app-config';

export type ConfigResult =
  | { readonly ok: true; readonly config: AppConfig }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): ConfigResult => ({ ok: false, reason });

/**
 * Fetches `/config.json` and validates it. Pure apart from the fetch it is handed.
 * The failure reasons are fixed strings so no response body is ever surfaced.
 */
export async function loadConfig(fetchFn: typeof fetch, timeoutMs = 5000): Promise<ConfigResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchFn('/config.json', { cache: 'no-store', signal: controller.signal });
    } catch {
      return fail('could not reach config.json');
    }
    if (!response.ok) {
      return fail(`config.json returned ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fail('config.json is not valid JSON');
    }

    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const value = raw['apiBaseUrl'];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      return fail('apiBaseUrl is missing');
    }
    if (typeof value !== 'string') {
      return fail('apiBaseUrl is not a valid http(s) URL');
    }

    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return fail('apiBaseUrl is not a valid http(s) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fail('apiBaseUrl is not a valid http(s) URL');
    }
    return { ok: true, config: { apiBaseUrl: url.origin } };
  } finally {
    clearTimeout(timer);
  }
}
