import type { RequestHandler } from 'msw';

/** Shared default handlers. Empty on purpose: tests opt in with `server.use(...)`. */
export const handlers: RequestHandler[] = [];
