// Fixed process zone, different from every zone the tests use (UTC+14).
process.env['TZ'] = 'Pacific/Kiritimati';
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
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

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
