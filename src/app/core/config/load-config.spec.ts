import { loadConfig } from './load-config';

function respond(body: unknown, init: ResponseInit = { status: 200 }): typeof fetch {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn(async () => new Response(text, init)) as unknown as typeof fetch;
}

describe('loadConfig', () => {
  it('requests /config.json uncached', async () => {
    const fetchFn = respond({ apiBaseUrl: 'http://localhost:5290' });
    await loadConfig(fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      '/config.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it.each([
    ['a plain origin', 'http://localhost:5290', 'http://localhost:5290'],
    ['https', 'https://api.example.com', 'https://api.example.com'],
    ['a trailing slash', 'http://localhost:5290/', 'http://localhost:5290'],
    ['a path, query and fragment', 'https://api.example.com/v1/x?a=1#f', 'https://api.example.com'],
  ])('accepts %s and normalises to the origin', async (_name, input, expected) => {
    const result = await loadConfig(respond({ apiBaseUrl: input }));
    expect(result).toEqual({ ok: true, config: { apiBaseUrl: expected } });
  });

  it.each([
    ['a 404', respond('nope', { status: 404 }), 'config.json returned 404'],
    ['a 500', respond('boom', { status: 500 }), 'config.json returned 500'],
    [
      'a network error',
      (() => Promise.reject(new TypeError('failed'))) as unknown as typeof fetch,
      'could not reach config.json',
    ],
    ['invalid JSON', respond('{not json'), 'config.json is not valid JSON'],
    ['a missing apiBaseUrl', respond({}), 'apiBaseUrl is missing'],
    ['a JSON null body', respond('null'), 'apiBaseUrl is missing'],
    ['a blank apiBaseUrl', respond({ apiBaseUrl: '   ' }), 'apiBaseUrl is missing'],
    ['an empty apiBaseUrl', respond({ apiBaseUrl: '' }), 'apiBaseUrl is missing'],
    [
      'a non-http scheme',
      respond({ apiBaseUrl: 'ftp://x' }),
      'apiBaseUrl is not a valid http(s) URL',
    ],
    ['a non-URL', respond({ apiBaseUrl: 'not a url' }), 'apiBaseUrl is not a valid http(s) URL'],
    ['a non-string', respond({ apiBaseUrl: 42 }), 'apiBaseUrl is not a valid http(s) URL'],
  ])('rejects %s', async (_name, fetchFn, reason) => {
    expect(await loadConfig(fetchFn)).toEqual({ ok: false, reason });
  });

  it('gives up when there is no answer within the timeout', async () => {
    vi.useFakeTimers();
    try {
      const hanging = ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted')));
        })) as unknown as typeof fetch;
      const pending = loadConfig(hanging, 5000);
      await vi.advanceTimersByTimeAsync(5001);
      expect(await pending).toEqual({ ok: false, reason: 'could not reach config.json' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never includes the response body in the reason', async () => {
    const result = await loadConfig(respond('SECRET-BODY', { status: 500 }));
    expect(JSON.stringify(result)).not.toContain('SECRET-BODY');
  });
});
