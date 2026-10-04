import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from './app-error';

const MAX_MESSAGE = 500;

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';
const TIMEOUT_MESSAGE = 'The request took too long. Please try again.';
const RATE_LIMIT_FALLBACK = 'Too many requests. Please wait and try again.';
const SERVER_FALLBACK = 'Something went wrong on our side.';
const GENERIC_FALLBACK = 'Something went wrong.';

const STATUS_FALLBACK: Record<number, string> = {
  400: 'The request was not valid.',
  401: 'You need to sign in.',
  403: 'You do not have permission to do that.',
  404: 'We could not find that.',
  409: 'That conflicts with the current state.',
  422: 'The request could not be processed.',
  429: RATE_LIMIT_FALLBACK,
};

function cap(text: string): string {
  return text.length > MAX_MESSAGE ? text.slice(0, MAX_MESSAGE - 1) + '…' : text;
}

function nonBlank(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Message from a JSON problem body, or null when the body gives nothing usable. */
function bodyMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const direct = nonBlank(b['detail']) ?? nonBlank(b['title']);
  if (direct) return direct;
  const errors = b['errors'];
  if (typeof errors === 'object' && errors !== null) {
    const messages = Object.values(errors).flatMap((v) =>
      Array.isArray(v) ? v.filter((m): m is string => typeof m === 'string') : [],
    );
    if (messages.length > 0) return messages.join('; ');
  }
  return null;
}

function fallbackFor(status: number): string {
  return STATUS_FALLBACK[status] ?? (status >= 500 ? SERVER_FALLBACK : GENERIC_FALLBACK);
}

function isTimeout(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function retryAfter(value: string | null): number {
  return value !== null && /^\d+$/.test(value.trim()) ? Number(value.trim()) : 60;
}

/**
 * Converts anything the HTTP stack throws into an `AppError`. Pure apart from one
 * `console.error` for a non-HTTP error (a bug). `sentId` is the correlation id the SPA sent.
 */
export function normalizeError(err: unknown, sentId?: string): AppError {
  if (err instanceof AppError) return err;
  if (isTimeout(err)) return new AppError(0, TIMEOUT_MESSAGE, 'timeout', sentId);
  if (err instanceof HttpErrorResponse) {
    const id = err.headers?.get('X-Correlation-ID') ?? sentId;
    if (err.status === 0) return new AppError(0, NETWORK_MESSAGE, 'network', id);
    const message = cap(bodyMessage(err.error) ?? fallbackFor(err.status));
    if (err.status === 429) {
      const seconds = retryAfter(err.headers?.get('Retry-After') ?? null);
      return new AppError(429, message, 'rate-limited', id, seconds);
    }
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return new AppError(err.status, message, 'unavailable', id);
    }
    if (err.status === 401) return new AppError(401, message, 'unauthorized', id);
    return new AppError(err.status, message, 'http', id);
  }
  console.error('Unexpected error in the HTTP pipeline', err);
  return new AppError(0, GENERIC_FALLBACK, 'http', sentId);
}
