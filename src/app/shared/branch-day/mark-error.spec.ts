import { AppError } from '../../core/http/app-error';
import { DAY_FORBIDDEN_TEXT, DAY_ZONE_UNAVAILABLE_TEXT, dayErrorText } from './day-errors';
import { MARK_NOT_FOUND_TEXT, mapMarkError } from './mark-error';

describe('mapMarkError', () => {
  it('409 carries the server text and reloads', () => {
    const e = new AppError(409, 'The appointment has not started yet.', 'http');
    expect(mapMarkError(e)).toEqual({
      kind: 'conflict',
      message: 'The appointment has not started yet.',
      reload: true,
    });
  });

  it('404 has fixed text and reloads', () => {
    expect(mapMarkError(new AppError(404, 'Appointment x was not found.', 'http'))).toEqual({
      kind: 'not-found',
      message: MARK_NOT_FOUND_TEXT,
      reload: true,
    });
    expect(MARK_NOT_FOUND_TEXT).toBe('This appointment is no longer available.');
  });

  it.each([
    [403, 'http'],
    [500, 'http'],
    [0, 'network'],
    [0, 'timeout'],
    [429, 'rate-limited'],
    [503, 'unavailable'],
  ] as const)('%s (%s) does not reload', (status, kind) => {
    expect(mapMarkError(new AppError(status, 'nope', kind)).reload).toBe(false);
  });
});

describe('dayErrorText', () => {
  it('words 403 and 503 and passes the rest through', () => {
    expect(dayErrorText(new AppError(403, 'x', 'http'))).toBe(DAY_FORBIDDEN_TEXT);
    expect(DAY_FORBIDDEN_TEXT).toBe('You can only see your own branch.');
    expect(dayErrorText(new AppError(503, 'x', 'unavailable'))).toBe(DAY_ZONE_UNAVAILABLE_TEXT);
    expect(DAY_ZONE_UNAVAILABLE_TEXT).toBe(
      "The branch's time zone could not be loaded. Try again shortly.",
    );
    expect(dayErrorText(new AppError(500, 'Something went wrong on our side.', 'http'))).toBe(
      'Something went wrong on our side.',
    );
    expect(dayErrorText(new AppError(0, 'Cannot reach the server.', 'network'))).toBe(
      'Cannot reach the server.',
    );
  });
});
