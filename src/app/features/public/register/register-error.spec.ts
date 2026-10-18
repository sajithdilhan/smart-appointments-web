import { AppError } from '../../../core/http/app-error';
import { mapRegisterError } from './register-error';

const err = (
  status: number,
  kind: AppError['kind'],
  message = 'server message',
  correlationId?: string,
  retryAfterSeconds?: number,
) => new AppError(status, message, kind, correlationId, retryAfterSeconds);

describe('mapRegisterError', () => {
  it.each([
    'Email is already registered.',
    'email is already registered.',
    '  EMAIL IS ALREADY REGISTERED.  ',
  ])('recognises the duplicate email by its message: %j', (message) => {
    expect(mapRegisterError(err(400, 'http', message))).toEqual({ kind: 'field-email-taken' });
  });

  it('a changed message degrades to the general 400 alert', () => {
    expect(mapRegisterError(err(400, 'http', 'That address is taken.'))).toEqual({
      kind: 'alert',
      message: 'That address is taken.',
      focus: 'alert',
    });
  });

  it('the duplicate message on another status is not a duplicate', () => {
    expect(mapRegisterError(err(409, 'http', 'Email is already registered.')).kind).toBe('alert');
  });

  it('any other 400 goes to the alert with focus, keeping the joined messages', () => {
    expect(
      mapRegisterError(err(400, 'http', 'Password is too weak; Phone number is invalid.')),
    ).toEqual({
      kind: 'alert',
      message: 'Password is too weak; Phone number is invalid.',
      focus: 'alert',
    });
  });

  it('429 counts down from Retry-After, falling back to 60', () => {
    expect(mapRegisterError(err(429, 'rate-limited', 'x', undefined, 7))).toEqual({
      kind: 'countdown',
      seconds: 7,
    });
    expect(mapRegisterError(err(429, 'rate-limited'))).toEqual({ kind: 'countdown', seconds: 60 });
  });

  it.each([
    [err(503, 'unavailable'), 'Service temporarily unavailable. Please try again in a moment.'],
    [err(0, 'network', 'Cannot reach the server.'), 'Cannot reach the server.'],
    [err(0, 'timeout', 'Too slow.'), 'Too slow.'],
  ])('%#: keeps the form and shows an alert without moving focus', (error, message) => {
    expect(mapRegisterError(error)).toEqual({ kind: 'alert', message, focus: 'none' });
  });

  it('other 5xx shows the reference', () => {
    expect(mapRegisterError(err(500, 'http', 'Oops', 'cid-9'))).toEqual({
      kind: 'alert',
      message: 'Oops',
      reference: 'cid-9',
      focus: 'none',
    });
  });
});
