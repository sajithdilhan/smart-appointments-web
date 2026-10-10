// Fixed process zone, different from every zone the tests use (UTC+14).
process.env['TZ'] = 'Pacific/Kiritimati';
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { configure } from '@testing-library/dom';
import { server } from './server';

// jsdom has no matchMedia. The real app config wires ViewportService, ThemeService and the CDK
// BreakpointObserver, which call it, so provide a minimal inert MediaQueryList. Specs that
// install their own (stubViewport) keep control: this only runs when it is undefined.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// The first render of a lazy route in a file loads its chunk; on a loaded machine that can pass 5 s.
vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
