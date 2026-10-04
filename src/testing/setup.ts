// Fixed process zone, different from every zone the tests use (UTC+14).
process.env['TZ'] = 'Pacific/Kiritimati';
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
