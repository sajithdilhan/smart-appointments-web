import { http, HttpResponse } from 'msw';
import { server } from './server';

describe('MSW setup', () => {
  it('fails an unmocked network call', async () => {
    await expect(fetch('http://unmocked.test/anything')).rejects.toThrow();
  });

  it('serves a handler registered for the test', async () => {
    server.use(http.get('http://mocked.test/ping', () => HttpResponse.json({ ok: true })));
    const response = await fetch('http://mocked.test/ping');
    expect(await response.json()).toEqual({ ok: true });
  });
});
