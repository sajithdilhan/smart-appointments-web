import { AppError } from '../../../core/http/app-error';
import { makeAppointment } from '../../../../testing/make-appointment';
import { ALREADY_STARTED_DETAIL, GENERIC_CONFLICT_MESSAGE } from './cancel-conflict';
import {
  cancelReducer,
  IDLE,
  isUnconfirmed,
  type CancelEvent,
  type CancelPhase,
} from './cancel-reducer';

const idle: CancelPhase = { kind: 'idle' };
const confirming: CancelPhase = { kind: 'confirming' };
const cancelling: CancelPhase = { kind: 'cancelling' };
const retryable: CancelPhase = { kind: 'retryable' };

const http = (status: number, message: string) => new AppError(status, message, 'http', 'cid');
const err = (error: AppError): CancelEvent => ({ type: 'err', error });
const booked = makeAppointment({ status: 'Booked' });
const cancelled = makeAppointment({ status: 'Cancelled' });

describe('cancelReducer: user steps', () => {
  it.each<[string, CancelPhase, CancelEvent, CancelPhase]>([
    ['idle --open--> confirming', idle, { type: 'open' }, confirming],
    ['confirming --keep--> idle', confirming, { type: 'keep' }, idle],
    ['confirming --confirm--> cancelling', confirming, { type: 'confirm' }, cancelling],
    ['retryable --retry--> cancelling', retryable, { type: 'retry' }, cancelling],
    ['rate-limited --open--> confirming', { kind: 'rate-limited' }, { type: 'open' }, confirming],
    [
      'failed --open--> confirming (the button was kept)',
      { kind: 'failed', error: http(403, 'no') },
      { type: 'open' },
      confirming,
    ],
  ])('%s', (_name, from, event, to) => {
    expect(cancelReducer(from, event)).toEqual(to);
  });

  it.each<[string, CancelPhase, CancelEvent]>([
    ['a repeated confirm while cancelling', cancelling, { type: 'confirm' }],
    ['confirm without a dialog', idle, { type: 'confirm' }],
    [
      'confirm after cancelled',
      { kind: 'cancelled', refreshed: true, slotMayBeDelayed: false },
      { type: 'confirm' },
    ],
    ['retry outside retryable', idle, { type: 'retry' }],
    ['retry while cancelling', cancelling, { type: 'retry' }],
    ['open while cancelling', cancelling, { type: 'open' }],
    ['open when too late', { kind: 'too-late' }, { type: 'open' }],
    ['open when retryable (it has its own button)', retryable, { type: 'open' }],
    ['keep while cancelling', cancelling, { type: 'keep' }],
    ['err while idle', idle, err(http(409, ALREADY_STARTED_DETAIL))],
    ['ok204 while idle', idle, { type: 'ok204' }],
    [
      'reGetResult while confirming',
      confirming,
      { type: 'reGetResult', after: 'ok', result: cancelled },
    ],
  ])('ignores %s (same object back)', (_name, phase, event) => {
    expect(cancelReducer(phase, event)).toBe(phase);
  });
});

describe('cancelReducer: outcomes while cancelling', () => {
  it('204 stays optimistic until the re-GET reports', () => {
    expect(cancelReducer(cancelling, { type: 'ok204' })).toBe(cancelling);
  });

  it.each<[string, CancelEvent, CancelPhase]>([
    [
      '204 then re-GET Cancelled',
      { type: 'reGetResult', after: 'ok', result: cancelled },
      { kind: 'cancelled', refreshed: true, slotMayBeDelayed: false },
    ],
    [
      '204 then the re-GET fails: still cancelled, not refreshed',
      { type: 'reGetResult', after: 'ok', result: new AppError(0, 'x', 'network') },
      { kind: 'cancelled', refreshed: false, slotMayBeDelayed: false },
    ],
    [
      '204 then re-GET says Booked: the 204 wins',
      { type: 'reGetResult', after: 'ok', result: booked },
      { kind: 'cancelled', refreshed: false, slotMayBeDelayed: false },
    ],
    [
      '503 then re-GET Cancelled: cancelled with the slot notice',
      { type: 'reGetResult', after: 'unconfirmed', result: cancelled },
      { kind: 'cancelled', refreshed: true, slotMayBeDelayed: true },
    ],
    [
      '503 then re-GET Booked: retryable',
      { type: 'reGetResult', after: 'unconfirmed', result: booked },
      { kind: 'retryable' },
    ],
    [
      '503 then the re-GET fails: retryable (state unknown)',
      { type: 'reGetResult', after: 'unconfirmed', result: new AppError(503, 'x', 'unavailable') },
      { kind: 'retryable' },
    ],
    [
      '503 then an unknown status: retryable',
      { type: 'reGetResult', after: 'unconfirmed', result: makeAppointment({ status: 'NoShow' }) },
      { kind: 'retryable' },
    ],
    [
      'a re-GET 404 hands over to the not-found state',
      { type: 'reGetResult', after: 'unconfirmed', result: http(404, 'gone') },
      idle,
    ],
  ])('%s', (_name, event, expected) => {
    expect(cancelReducer(cancelling, event)).toEqual(expected);
  });

  it.each<[string, AppError]>([
    ['503', new AppError(503, 'down', 'unavailable')],
    ['502', new AppError(502, 'bad gateway', 'unavailable')],
    ['500', http(500, 'boom')],
    ['network error', new AppError(0, 'offline', 'network')],
    ['timeout', new AppError(0, 'slow', 'timeout')],
  ])('a %s never moves the phase by itself (re-GET first)', (_name, error) => {
    expect(isUnconfirmed(error)).toBe(true);
    expect(cancelReducer(cancelling, err(error))).toBe(cancelling);
  });

  it('409 with the known text is too-late', () => {
    expect(cancelReducer(cancelling, err(http(409, ALREADY_STARTED_DETAIL)))).toEqual({
      kind: 'too-late',
    });
  });

  it('409 with another text is a generic failure that hides the raw detail', () => {
    const next = cancelReducer(cancelling, err(http(409, 'Internal: locked')));
    expect(next.kind).toBe('failed');
    if (next.kind !== 'failed') return;
    expect(next.error.message).toBe(GENERIC_CONFLICT_MESSAGE);
    expect(next.error.status).toBe(409);
    expect(next.error.correlationId).toBe('cid');
    expect(JSON.stringify(next)).not.toContain('Internal');
  });

  it('403 keeps its F1 error', () => {
    const forbidden = http(403, 'You do not have access.');
    expect(cancelReducer(cancelling, err(forbidden))).toEqual({ kind: 'failed', error: forbidden });
  });

  it('429 is rate-limited', () => {
    expect(
      cancelReducer(cancelling, err(new AppError(429, 'slow down', 'rate-limited', 'c', 60))),
    ).toEqual({
      kind: 'rate-limited',
    });
  });

  it('404 hands over to the not-found state', () => {
    expect(cancelReducer(cancelling, err(http(404, 'nope')))).toEqual(IDLE);
  });

  it('any other failure is failed with the error', () => {
    const bad = http(400, 'bad');
    expect(cancelReducer(cancelling, err(bad))).toEqual({ kind: 'failed', error: bad });
  });

  it('a retry after 503 then Booked reaches cancelling again, once', () => {
    let phase = cancelReducer(cancelling, err(new AppError(503, 'down', 'unavailable')));
    phase = cancelReducer(phase, { type: 'reGetResult', after: 'unconfirmed', result: booked });
    expect(phase.kind).toBe('retryable');
    phase = cancelReducer(phase, { type: 'retry' });
    expect(phase.kind).toBe('cancelling');
    expect(cancelReducer(phase, { type: 'retry' })).toBe(phase);
  });
});

describe('isUnconfirmed', () => {
  it.each<[AppError, boolean]>([
    [http(400, 'x'), false],
    [http(403, 'x'), false],
    [http(404, 'x'), false],
    [http(409, 'x'), false],
    [new AppError(429, 'x', 'rate-limited'), false],
    [new AppError(401, 'x', 'unauthorized'), false],
  ])('%j is not unconfirmed', (error, expected) => {
    expect(isUnconfirmed(error)).toBe(expected);
  });
});
