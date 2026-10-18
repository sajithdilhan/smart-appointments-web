import { AppError, type AppErrorKind } from '../../../core/http/app-error';
import { mapConfirmError, type ConfirmOutcome } from './confirm-outcome';

function err(
  status: number,
  message: string,
  kind: AppErrorKind = 'http',
  retryAfterSeconds?: number,
) {
  return new AppError(status, message, kind, undefined, retryAfterSeconds);
}

describe('mapConfirmError', () => {
  const table: [string, AppError, ConfirmOutcome][] = [
    ['404 slot not found', err(404, 'Slot not found.'), { kind: 'slot-gone' }],
    ['409 overlap', err(409, 'You already have an appointment at that time.'), { kind: 'overlap' }],
    [
      '409 in progress',
      err(409, 'A request with this Idempotency-Key is still being processed.'),
      { kind: 'in-progress' },
    ],
    ['409 slot is full', err(409, 'Slot is full.'), { kind: 'slot-gone' }],
    ['409 started', err(409, 'Slot has already started.'), { kind: 'slot-gone' }],
    ['409 inactive branch', err(409, "Branch 'AKL' is inactive."), { kind: 'slot-gone' }],
    ['409 unknown text', err(409, 'A brand new reason.'), { kind: 'slot-gone' }],
    [
      '422 key reused',
      err(422, 'This Idempotency-Key was already used with a different request.'),
      { kind: 'key-mismatch' },
    ],
    [
      '429 with seconds',
      err(429, 'Too many requests.', 'rate-limited', 42),
      { kind: 'rate-limited', seconds: 42 },
    ],
    [
      '429 without seconds',
      err(429, 'Too many requests.', 'rate-limited'),
      { kind: 'rate-limited', seconds: 60 },
    ],
    ['503 unavailable', err(503, 'down', 'unavailable'), { kind: 'retryable' }],
    ['502 unavailable', err(502, 'down', 'unavailable'), { kind: 'retryable' }],
    ['network', err(0, 'offline', 'network'), { kind: 'retryable' }],
    ['timeout', err(0, 'slow', 'timeout'), { kind: 'retryable' }],
    ['401', err(401, 'You need to sign in.', 'unauthorized'), { kind: 'session-ended' }],
    [
      '400',
      err(400, 'The Idempotency-Key header is required.'),
      { kind: 'failed', message: 'The Idempotency-Key header is required.' },
    ],
    [
      '403',
      err(403, 'You do not have permission to do that.'),
      { kind: 'failed', message: 'You do not have permission to do that.' },
    ],
    [
      '500 other',
      err(500, 'Something went wrong on our side.'),
      { kind: 'failed', message: 'Something went wrong on our side.' },
    ],
  ];

  it.each(table)('%s', (_name, error, expected) => {
    expect(mapConfirmError(error)).toEqual(expected);
  });
});
