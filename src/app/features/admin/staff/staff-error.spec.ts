import { STAFF_TEXTS } from '../../../../testing/staff-accounts-backend';
import { AppError } from '../../../core/http/app-error';
import { VALIDATION_PREFIX } from '../validation/parse-validation-detail';
import { mapStaffActionError, mapStaffSaveError } from './staff-error';
import {
  BRANCH_CHECK_UNAVAILABLE_MESSAGE,
  BRANCH_INACTIVE_MESSAGE,
  EMAIL_TAKEN_MESSAGE,
  OUTAGE_MESSAGE,
  STAFF_NOT_FOUND_MESSAGE,
  STAFF_SERVER_MESSAGES,
} from './staff-messages';

const http = (status: number, message: string) => new AppError(status, message, 'http', 'cid-1');
const invalid = (...texts: string[]) => http(400, VALIDATION_PREFIX + texts.join(','));

describe('mapStaffSaveError', () => {
  it('maps the duplicate email of a create onto the Email field', () => {
    expect(mapStaffSaveError(http(400, EMAIL_TAKEN_MESSAGE), 'create')).toEqual({
      kind: 'field',
      field: 'email',
      message: 'Email is already registered.',
      reloadBranches: false,
    });
  });

  it('does not treat the duplicate-email text as a field error when moving', () => {
    expect(mapStaffSaveError(http(400, EMAIL_TAKEN_MESSAGE), 'move')).toEqual({
      kind: 'alert',
      message: EMAIL_TAKEN_MESSAGE,
    });
  });

  it.each(['create', 'move'] as const)(
    'maps 422 to the Branch field and a branch reload (%s)',
    (mode) => {
      expect(mapStaffSaveError(http(422, STAFF_TEXTS.branchInactive('x')), mode)).toEqual({
        kind: 'field',
        field: 'branchId',
        message: BRANCH_INACTIVE_MESSAGE,
        reloadBranches: true,
      });
    },
  );

  it.each(['create', 'move'] as const)('maps 503 to the branch-check alert (%s)', (mode) => {
    const error = new AppError(503, STAFF_TEXTS.unavailable, 'unavailable');
    expect(mapStaffSaveError(error, mode)).toEqual({
      kind: 'alert',
      message: BRANCH_CHECK_UNAVAILABLE_MESSAGE,
    });
  });

  it('maps 404 of a move to not-found and leaves a create 404 to the generic outcome', () => {
    expect(mapStaffSaveError(http(404, STAFF_TEXTS.notFound('x')), 'move')).toEqual({
      kind: 'not-found',
      message: STAFF_NOT_FOUND_MESSAGE,
    });
    expect(mapStaffSaveError(http(404, 'nope'), 'create').kind).toBe('other');
  });

  it('splits a validation 400 into fields and a form alert', () => {
    const outcome = mapStaffSaveError(
      invalid(
        STAFF_TEXTS.firstNameRequired,
        STAFF_TEXTS.emailFormat,
        STAFF_TEXTS.passwordUpper,
        STAFF_TEXTS.passwordDigit,
        'Something we do not know',
      ),
      'create',
    );
    expect(outcome).toEqual({
      kind: 'validation',
      fields: {
        firstName: 'First name is required.',
        email: 'Invalid email format.',
        password: 'Password must contain at least one uppercase letter.',
      },
      alert: ['Something we do not know'],
    });
  });

  it('maps the move validation text onto the branch field', () => {
    const outcome = mapStaffSaveError(invalid(STAFF_TEXTS.branchRequired), 'move');
    expect(outcome).toEqual({
      kind: 'validation',
      fields: { branchId: 'Branch is required.' },
      alert: [],
    });
  });

  it('sends any other 400 text to the form alert', () => {
    expect(mapStaffSaveError(http(400, 'Weird.'), 'create')).toEqual({
      kind: 'alert',
      message: 'Weird.',
    });
  });

  it('classifies offline, rate-limited and forbidden before anything else', () => {
    expect(mapStaffSaveError(new AppError(0, 'down', 'network'), 'create').kind).toBe('offline');
    expect(mapStaffSaveError(new AppError(0, 'slow', 'timeout'), 'move').kind).toBe('offline');
    expect(mapStaffSaveError(new AppError(502, 'bad', 'unavailable'), 'create').kind).toBe(
      'offline',
    );
    expect(mapStaffSaveError(new AppError(429, 'wait', 'rate-limited', 'c', 30), 'create')).toEqual(
      { kind: 'rate-limited', message: 'wait', retryAfterSeconds: 30 },
    );
    expect(mapStaffSaveError(http(403, STAFF_TEXTS.forbidden), 'create').kind).toBe('forbidden');
  });

  it('keeps the server text and the correlation id for anything else', () => {
    expect(mapStaffSaveError(http(500, 'Boom.'), 'create')).toEqual({
      kind: 'other',
      message: 'Boom.',
      correlationId: 'cid-1',
    });
  });

  it('knows every validation text of the backend model, each on its field', () => {
    const backendTexts = [
      STAFF_TEXTS.firstNameRequired,
      STAFF_TEXTS.firstNameLength,
      STAFF_TEXTS.lastNameRequired,
      STAFF_TEXTS.lastNameLength,
      STAFF_TEXTS.emailRequired,
      STAFF_TEXTS.emailFormat,
      STAFF_TEXTS.phoneRequired,
      STAFF_TEXTS.phoneFormat,
      STAFF_TEXTS.passwordRequired,
      STAFF_TEXTS.passwordLength,
      STAFF_TEXTS.passwordUpper,
      STAFF_TEXTS.passwordLower,
      STAFF_TEXTS.passwordDigit,
      STAFF_TEXTS.passwordSpecial,
      STAFF_TEXTS.branchRequired,
    ];
    expect(STAFF_SERVER_MESSAGES.map((m) => m.message)).toEqual(backendTexts);
    expect(STAFF_TEXTS.duplicateEmail).toBe(EMAIL_TAKEN_MESSAGE);
    for (const entry of STAFF_SERVER_MESSAGES) {
      const outcome = mapStaffSaveError(invalid(entry.message), 'create');
      expect(outcome).toEqual({
        kind: 'validation',
        fields: { [entry.field!]: entry.message },
        alert: [],
      });
    }
  });
});

describe('mapStaffActionError', () => {
  it.each(['deactivate', 'reactivate', 'delete'] as const)(
    'maps 404 to not-found (%s)',
    (action) => {
      expect(mapStaffActionError(http(404, STAFF_TEXTS.notFound('x')), action)).toEqual({
        kind: 'not-found',
        message: 'This staff account no longer exists.',
      });
    },
  );

  it('maps reactivate 422 to the blocked-branch outcome and reactivate 503 to the outage text', () => {
    expect(mapStaffActionError(http(422, STAFF_TEXTS.branchInactive('x')), 'reactivate')).toEqual({
      kind: 'branch-inactive',
    });
    expect(
      mapStaffActionError(new AppError(503, STAFF_TEXTS.unavailable, 'unavailable'), 'reactivate'),
    ).toEqual({ kind: 'unavailable', message: OUTAGE_MESSAGE });
  });

  it('leaves 422 and 503 of the other actions, and everything else, to the generic policy', () => {
    expect(mapStaffActionError(http(422, 'x'), 'deactivate')).toEqual({ kind: 'generic' });
    expect(mapStaffActionError(new AppError(503, 'x', 'unavailable'), 'delete')).toEqual({
      kind: 'generic',
    });
    expect(mapStaffActionError(http(403, 'x'), 'reactivate')).toEqual({ kind: 'generic' });
    expect(mapStaffActionError(new AppError(0, 'x', 'network'), 'delete')).toEqual({
      kind: 'generic',
    });
  });
});
