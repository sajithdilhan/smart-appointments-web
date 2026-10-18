import { AppError } from '../../../core/http/app-error';
import { mapLoginError } from './login-error';

const err = (
  status: number,
  kind: AppError['kind'],
  message = 'server message',
  correlationId?: string,
  retryAfterSeconds?: number,
) => new AppError(status, message, kind, correlationId, retryAfterSeconds);

describe('mapLoginError', () => {
  it('401 gives the fixed message and never reads the server detail', () => {
    expect(mapLoginError(err(401, 'unauthorized', 'No such user bob@x.com'))).toEqual({
      kind: 'alert',
      message: 'Invalid email or password.',
      focus: 'password',
    });
  });

  it.each([
    [err(400, 'http', 'Email is invalid.'), 'Email is invalid.', 'alert'],
    [
      err(502, 'unavailable'),
      'Service temporarily unavailable. Please try again in a moment.',
      'none',
    ],
    [
      err(503, 'unavailable'),
      'Service temporarily unavailable. Please try again in a moment.',
      'none',
    ],
    [
      err(504, 'unavailable'),
      'Service temporarily unavailable. Please try again in a moment.',
      'none',
    ],
    [err(0, 'network', 'Cannot reach the server.'), 'Cannot reach the server.', 'none'],
    [err(0, 'timeout', 'The request took too long.'), 'The request took too long.', 'none'],
    [err(403, 'http', 'Forbidden.'), 'Forbidden.', 'alert'],
    [err(404, 'http', 'Not found.'), 'Not found.', 'alert'],
    [err(409, 'http', 'Conflict.'), 'Conflict.', 'alert'],
  ])('%#: maps to an alert', (error, message, focus) => {
    expect(mapLoginError(error)).toEqual({ kind: 'alert', message, focus });
  });

  it('other 5xx carries the correlation id as the reference', () => {
    expect(mapLoginError(err(500, 'http', 'Something went wrong on our side.', 'abc-1'))).toEqual({
      kind: 'alert',
      message: 'Something went wrong on our side.',
      reference: 'abc-1',
      focus: 'none',
    });
  });

  it('other 5xx without a correlation id has no reference key', () => {
    expect(mapLoginError(err(500, 'http', 'Boom'))).toEqual({
      kind: 'alert',
      message: 'Boom',
      focus: 'none',
    });
  });

  it('429 starts the countdown from Retry-After, falling back to 60', () => {
    expect(mapLoginError(err(429, 'rate-limited', 'x', undefined, 3))).toEqual({
      kind: 'countdown',
      seconds: 3,
    });
    expect(mapLoginError(err(429, 'rate-limited'))).toEqual({ kind: 'countdown', seconds: 60 });
  });
});
