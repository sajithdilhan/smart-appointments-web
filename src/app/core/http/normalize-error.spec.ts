import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { AppError } from './app-error';
import { normalizeError } from './normalize-error';

function failure(status: number, error: unknown, headers: Record<string, string> = {}) {
  return new HttpErrorResponse({ status, error, headers: new HttpHeaders(headers), url: 'x' });
}

describe('normalizeError', () => {
  describe('body shapes', () => {
    it.each([
      [
        '{status, detail}',
        failure(400, { status: 400, detail: 'Email is taken.' }),
        'Email is taken.',
      ],
      [
        'detail wins over a different body status',
        failure(409, { status: 400, detail: 'Conflict detail' }),
        'Conflict detail',
      ],
      [
        'ValidationProblemDetails with title',
        failure(400, {
          title: 'One or more validation errors occurred.',
          status: 400,
          errors: { a: ['x'] },
        }),
        'One or more validation errors occurred.',
      ],
      [
        'ValidationProblemDetails with only errors',
        failure(400, {
          status: 400,
          errors: { Email: ['Bad email.'], Name: ['Too short.', 'Required.'] },
        }),
        'Bad email.; Too short.; Required.',
      ],
      ['empty body', failure(401, null), 'You need to sign in.'],
      [
        'string body is never shown',
        failure(400, '<html>secret stack</html>'),
        'The request was not valid.',
      ],
      ['object without detail or title', failure(404, { foo: 1 }), 'We could not find that.'],
      [
        'blank detail',
        failure(403, { status: 403, detail: '   ' }),
        'You do not have permission to do that.',
      ],
      ['array body', failure(409, ['x']), 'That conflicts with the current state.'],
    ])('%s', (_name, input, message) => {
      expect(normalizeError(input).message).toBe(message);
    });

    it.each([
      [400, 'The request was not valid.'],
      [401, 'You need to sign in.'],
      [403, 'You do not have permission to do that.'],
      [404, 'We could not find that.'],
      [409, 'That conflicts with the current state.'],
      [422, 'The request could not be processed.'],
      [500, 'Something went wrong on our side.'],
      [502, 'Something went wrong on our side.'],
      [418, 'Something went wrong.'],
    ])('empty body fallback for %i', (status, message) => {
      expect(normalizeError(failure(status, null)).message).toBe(message);
    });

    it('keeps the HTTP status even when the body disagrees', () => {
      expect(normalizeError(failure(409, { status: 400, detail: 'x' })).status).toBe(409);
    });
  });

  describe('kinds', () => {
    it('maps status 0 to network with the sent correlation id', () => {
      const e = normalizeError(failure(0, new ProgressEvent('error')), 'sent-1');
      expect(e).toMatchObject({
        status: 0,
        kind: 'network',
        correlationId: 'sent-1',
        message: 'Cannot reach the server. Check your connection and try again.',
      });
    });

    it('maps rxjs TimeoutError and AbortError / TimeoutError DOMExceptions to timeout', () => {
      for (const err of [
        new TimeoutError(),
        new DOMException('aborted', 'AbortError'),
        new DOMException('timed out', 'TimeoutError'),
      ]) {
        expect(normalizeError(err, 'id')).toMatchObject({
          status: 0,
          kind: 'timeout',
          correlationId: 'id',
          message: 'The request took too long. Please try again.',
        });
      }
    });

    it.each([
      [{ 'Retry-After': '30' }, 30],
      [{ 'Retry-After': '0' }, 0],
      [{}, 60],
      [{ 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }, 60],
      [{ 'Retry-After': '-5' }, 60],
      [{ 'Retry-After': '1.5' }, 60],
    ])('429 with headers %j gives retryAfterSeconds %i', (headers, seconds) => {
      const e = normalizeError(failure(429, { status: 429, detail: 'Slow down.' }, headers));
      expect(e).toMatchObject({ status: 429, kind: 'rate-limited', retryAfterSeconds: seconds });
      expect(e.message).toBe('Slow down.');
    });

    it('429 without a body uses the fallback', () => {
      expect(normalizeError(failure(429, null)).message).toBe(
        'Too many requests. Please wait and try again.',
      );
    });

    it.each([
      [502, 'unavailable'],
      [503, 'unavailable'],
      [504, 'unavailable'],
      [401, 'unauthorized'],
      [500, 'http'],
      [501, 'http'],
      [403, 'http'],
      [404, 'http'],
    ])('status %i is kind %s', (status, kind) => {
      expect(normalizeError(failure(status, null)).kind).toBe(kind);
    });

    it('prefers the response correlation id over the sent one', () => {
      const e = normalizeError(failure(500, null, { 'X-Correlation-ID': 'from-server' }), 'sent');
      expect(e.correlationId).toBe('from-server');
      expect(normalizeError(failure(500, null), 'sent').correlationId).toBe('sent');
    });
  });

  describe('safety', () => {
    it('caps an oversized detail at 500 characters with an ellipsis', () => {
      const e = normalizeError(failure(400, { status: 400, detail: 'x'.repeat(5000) }));
      expect(e.message).toHaveLength(500);
      expect(e.message.endsWith('…')).toBe(true);
    });

    it('never puts a stack, the raw body or headers in the message', () => {
      const body = '<html>Stack trace at Foo.Bar()</html>';
      const e = normalizeError(failure(500, body, { 'X-Secret': 'token-123' }));
      expect(e.message).not.toContain('Stack');
      expect(e.message).not.toContain('token-123');
    });

    it('turns an unexpected thrown value into a generic error and logs it once', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const e = normalizeError(new TypeError('bug'), 'id');
      expect(e).toMatchObject({ status: 0, kind: 'http', message: 'Something went wrong.' });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('passes an AppError through unchanged', () => {
      const original = new AppError(401, 'm', 'unauthorized');
      expect(normalizeError(original)).toBe(original);
    });
  });
});
