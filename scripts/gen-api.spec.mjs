import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { GenApiError, HEADER, generate } from './gen-api.mjs';

const convert = async (doc) => `// ${doc.info}\n`;
const ok = (info) => ({ ok: true, status: 200, json: async () => ({ openapi: '3.1.0', info }) });

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'gen-api-'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('writes all three files with the header', async () => {
  const outDir = setup();
  const urls = [];
  await generate({
    gatewayUrl: 'http://gw.test/',
    outDir,
    convert,
    fetch: async (url) => (urls.push(url), ok(url.split('/')[4])),
  });
  assert.deepEqual(urls, [
    'http://gw.test/openapi/auth/v1.json',
    'http://gw.test/openapi/availability/v1.json',
    'http://gw.test/openapi/booking/v1.json',
  ]);
  assert.equal(readFileSync(join(outDir, 'auth.d.ts'), 'utf8'), `${HEADER}// auth\n`);
  assert.deepEqual(readdirSync(outDir).sort(), ['auth.d.ts', 'availability.d.ts', 'booking.d.ts']);
});

test('a failure leaves existing files byte-identical and names the URL', async () => {
  const outDir = setup();
  for (const n of ['auth', 'availability', 'booking'])
    writeFileSync(join(outDir, `${n}.d.ts`), `old ${n}`);
  await assert.rejects(
    generate({
      gatewayUrl: 'http://gw.test',
      outDir,
      convert,
      fetch: async (url) => {
        if (url.includes('booking')) throw new TypeError('fetch failed');
        return ok('x');
      },
    }),
    (e) => e instanceof GenApiError && e.message.includes('http://gw.test/openapi/booking/v1.json'),
  );
  for (const n of ['auth', 'availability', 'booking'])
    assert.equal(readFileSync(join(outDir, `${n}.d.ts`), 'utf8'), `old ${n}`);
  assert.deepEqual(readdirSync(outDir).sort(), ['auth.d.ts', 'availability.d.ts', 'booking.d.ts']);
});

test('a non-200 or non-OpenAPI body fails', async () => {
  const outDir = setup();
  await assert.rejects(
    generate({
      outDir,
      convert,
      fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    }),
    GenApiError,
  );
  await assert.rejects(
    generate({
      outDir,
      convert,
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    }),
    GenApiError,
  );
});

test('the CLI exits 1 and names the unreachable URL when the gateway is down', () => {
  const script = fileURLToPath(new URL('./gen-api.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, GATEWAY_URL: 'http://127.0.0.1:1' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot reach http:\/\/127\.0\.0\.1:1\/openapi\/auth\/v1\.json/);
});
