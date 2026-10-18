import contract from '../../../../testing/fixtures/availability-contract.json';
import { AppError } from '../../../core/http/app-error';
import { mapBranchError } from '../branches/branch-error';
import { GENERATE_PATTERNS, mapGenerateError } from '../slots/generate-error';
import { mapScheduleError } from '../schedule/schedule-error';
import { mapServiceError } from '../services/service-error';
import { VALIDATION_PREFIX, splitValidationDetail } from './parse-validation-detail';
import {
  BRANCH_SERVER_MESSAGES,
  GENERATION_SERVER_MESSAGES,
  SCHEDULE_SERVER_MESSAGES,
  SERVICE_SERVER_MESSAGES,
  classifyCommon,
  mapServerValidation,
} from './server-messages';

const P = VALIDATION_PREFIX;
const CODE_MSG =
  'Code must be 2-10 letters, digits or hyphens, and cannot start or end with a hyphen.';
const known = BRANCH_SERVER_MESSAGES.map((e) => e.message);

const err = (status: number, message: string, kind: AppError['kind'] = 'http') =>
  new AppError(status, message, kind, 'cid-1');

describe('splitValidationDetail', () => {
  it('returns the whole detail when there is no prefix', () => {
    expect(splitValidationDetail('Branch is gone.', known)).toEqual(['Branch is gone.']);
  });

  it('splits simple messages on the bare comma', () => {
    expect(splitValidationDetail(`${P}Name is required.,Address is required.`, known)).toEqual([
      'Name is required.',
      'Address is required.',
    ]);
  });

  it('keeps a known message that contains commas whole, at the start, middle and end', () => {
    expect(splitValidationDetail(`${P}${CODE_MSG}`, known)).toEqual([CODE_MSG]);
    expect(splitValidationDetail(`${P}${CODE_MSG},Name is required.`, known)).toEqual([
      CODE_MSG,
      'Name is required.',
    ]);
    expect(
      splitValidationDetail(`${P}Name is required.,${CODE_MSG},Address is required.`, known),
    ).toEqual(['Name is required.', CODE_MSG, 'Address is required.']);
    expect(splitValidationDetail(`${P}Name is required.,${CODE_MSG}`, known)).toEqual([
      'Name is required.',
      CODE_MSG,
    ]);
  });

  it('takes an unknown message up to the next comma and keeps the known ones after it', () => {
    expect(splitValidationDetail(`${P}Something odd happened,Name is required.`, known)).toEqual([
      'Something odd happened',
      'Name is required.',
    ]);
    expect(splitValidationDetail(`${P}Name is required.,Something, unknown, tail`, known)).toEqual([
      'Name is required.',
      'Something',
      ' unknown',
      ' tail',
    ]);
  });

  it('does not match a known message that is only a prefix of the next text', () => {
    // "Name is required.X" is not the known message: only a comma or the end terminates one.
    expect(splitValidationDetail(`${P}Name is required.X,Address is required.`, known)).toEqual([
      'Name is required.X',
      'Address is required.',
    ]);
  });

  it('drops empty fragments', () => {
    expect(splitValidationDetail(`${P}`, known)).toEqual([]);
    expect(splitValidationDetail(`${P}Name is required.,,`, known)).toEqual(['Name is required.']);
  });
});

describe('mapServerValidation', () => {
  it('maps known messages to fields and keeps the first per field', () => {
    const detail = `${P}${CODE_MSG},Name is required.,Name cannot exceed 100 characters.,Invalid phone number format.`;
    expect(mapServerValidation(detail, BRANCH_SERVER_MESSAGES)).toEqual({
      fields: {
        code: CODE_MSG,
        name: 'Name is required.',
        phoneNumber: 'Invalid phone number format.',
      },
      unmapped: [],
    });
  });

  it('sends unknown text to the alert, once', () => {
    const detail = `${P}Mystery,Mystery,Address is required.`;
    expect(mapServerValidation(detail, BRANCH_SERVER_MESSAGES)).toEqual({
      fields: { address: 'Address is required.' },
      unmapped: ['Mystery'],
    });
  });

  it('a detail without the prefix is unmapped as one item', () => {
    expect(mapServerValidation('The request was not valid.', SERVICE_SERVER_MESSAGES)).toEqual({
      fields: {},
      unmapped: ['The request was not valid.'],
    });
  });

  it('schedule: the zone goes to its field, day-row messages to the alert', () => {
    const detail = `${P}Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.,Opening time must be before closing time.,Day of week is not valid.`;
    expect(mapServerValidation(detail, SCHEDULE_SERVER_MESSAGES)).toEqual({
      fields: {
        timeZoneId: "Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.",
      },
      unmapped: ['Opening time must be before closing time.', 'Day of week is not valid.'],
    });
  });

  it('generation: range messages belong to the end date', () => {
    const detail = `${P}The date range cannot span more than 31 days.,Capacity must be between 1 and 100.`;
    expect(mapServerValidation(detail, GENERATION_SERVER_MESSAGES)).toEqual({
      fields: {
        toDate: 'The date range cannot span more than 31 days.',
        capacity: 'Capacity must be between 1 and 100.',
      },
      unmapped: [],
    });
  });
});

describe('contract: server-message tables against the fixture', () => {
  const tables = {
    branch: BRANCH_SERVER_MESSAGES,
    service: SERVICE_SERVER_MESSAGES,
    schedule: SCHEDULE_SERVER_MESSAGES,
    generation: GENERATION_SERVER_MESSAGES,
  };
  const byId = new Map(contract.messages.map((e) => [e.id, e]));

  it.each(Object.entries(tables))(
    'every %s entry exists in the fixture with the same text and field',
    (form, table) => {
      for (const entry of table) {
        const fixture = byId.get(entry.id);
        expect(fixture, `fixture entry ${entry.id}`).toBeDefined();
        expect(entry.message).toBe(fixture!.text);
        expect(entry.field).toBe(fixture!.field);
        expect(fixture!.form).toBe(form);
      }
    },
  );

  it('the tables cover every fixture message of their form', () => {
    for (const [form, table] of Object.entries(tables)) {
      const ids = new Set(table.map((e) => e.id));
      for (const entry of contract.messages.filter((e) => e.form === form)) {
        expect(ids.has(entry.id), `${form} table is missing ${entry.id}`).toBe(true);
      }
    }
  });

  it('the validation prefix equals the fixture envelope', () => {
    expect(VALIDATION_PREFIX).toBe(contract.validationEnvelope.prefix);
  });

  it('the client generation patterns match the fixture examples, and only theirs', () => {
    const example = (id: string) => contract.errors.find((e) => e.id === id)!.example;
    expect(GENERATE_PATTERNS.noWorkingHours.test(example('generation.noWorkingHours'))).toBe(true);
    expect(GENERATE_PATTERNS.branchInactive.test(example('generation.branchInactive'))).toBe(true);
    expect(GENERATE_PATTERNS.serviceInactive.test(example('generation.serviceInactive'))).toBe(
      true,
    );
    expect(GENERATE_PATTERNS.concurrent.test(example('generation.concurrent'))).toBe(true);
    expect(GENERATE_PATTERNS.branchNotFound.test(example('branch.notFound'))).toBe(true);
    expect(GENERATE_PATTERNS.serviceNotFound.test(example('service.notFound'))).toBe(true);
    // The branch and service patterns must not shadow each other.
    expect(GENERATE_PATTERNS.branchInactive.test(example('generation.serviceInactive'))).toBe(
      false,
    );
    expect(GENERATE_PATTERNS.serviceInactive.test(example('generation.branchInactive'))).toBe(
      false,
    );
    expect(GENERATE_PATTERNS.branchNotFound.test(example('service.notFound'))).toBe(false);
    for (const e of contract.errors) expect(new RegExp(e.pattern).test(e.example)).toBe(true);
  });
});

describe('classifyCommon', () => {
  it.each([
    [err(0, 'offline', 'network'), 'offline'],
    [err(0, 'slow', 'timeout'), 'offline'],
    [err(503, 'down', 'unavailable'), 'offline'],
    [err(403, 'no'), 'forbidden'],
  ])('%j', (error, kind) => {
    expect(classifyCommon(error)?.kind).toBe(kind);
  });

  it('carries Retry-After for a 429, defaulting to 60', () => {
    expect(classifyCommon(new AppError(429, 'slow down', 'rate-limited', 'c', 30))).toEqual({
      kind: 'rate-limited',
      message: 'slow down',
      retryAfterSeconds: 30,
    });
    expect(classifyCommon(new AppError(429, 'x', 'rate-limited'))).toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it('is null for ordinary failures', () => {
    expect(classifyCommon(err(500, 'x'))).toBeNull();
    expect(classifyCommon(err(409, 'x'))).toBeNull();
  });
});

describe('mapBranchError / mapServiceError', () => {
  it('a 409 on create names the normalised code that was sent, not the detail', () => {
    expect(
      mapBranchError(err(409, "A branch with code 'ZZ' already exists."), { code: ' pg ' }),
    ).toEqual({
      kind: 'duplicate-code',
      field: 'code',
      message: 'A branch with code PG already exists.',
    });
    expect(mapServiceError(err(409, 'x'), { code: 'cut_1' })).toEqual({
      kind: 'duplicate-code',
      field: 'code',
      message: 'A service with code CUT_1 already exists.',
    });
  });

  it('a 409 without a sent code (an update) is an ordinary failure', () => {
    expect(mapBranchError(err(409, 'conflict'))).toMatchObject({
      kind: 'other',
      message: 'conflict',
    });
  });

  it('a 400 maps fields and sends the rest to the alert', () => {
    expect(mapBranchError(err(400, `${P}${CODE_MSG},Mystery`), { code: '-ab' })).toEqual({
      kind: 'validation',
      fields: { code: CODE_MSG },
      alert: ['Mystery'],
    });
    expect(mapServiceError(err(400, `${P}Duration must be a multiple of 5 minutes.`))).toEqual({
      kind: 'validation',
      fields: { durationMinutes: 'Duration must be a multiple of 5 minutes.' },
      alert: [],
    });
  });

  it('a 404 is not-found; 403, offline and 429 are common outcomes; the rest is other with the correlation id', () => {
    expect(mapBranchError(err(404, 'gone'))).toEqual({ kind: 'not-found' });
    expect(mapServiceError(err(404, 'gone'))).toEqual({ kind: 'not-found' });
    expect(mapBranchError(err(403, 'no')).kind).toBe('forbidden');
    expect(mapServiceError(err(0, 'off', 'network')).kind).toBe('offline');
    expect(mapBranchError(new AppError(429, 'wait', 'rate-limited', 'c', 12))).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 12,
    });
    expect(mapBranchError(err(500, 'boom'))).toEqual({
      kind: 'other',
      message: 'boom',
      correlationId: 'cid-1',
    });
  });
});

describe('mapScheduleError', () => {
  it('maps a 400 to the zone field and the alert', () => {
    expect(
      mapScheduleError(
        err(
          400,
          `${P}A day of the week can be listed only once.,Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.`,
        ),
      ),
    ).toEqual({
      kind: 'validation',
      fields: {
        timeZoneId: "Time zone must be an IANA time zone identifier, such as 'Asia/Colombo'.",
      },
      alert: ['A day of the week can be listed only once.'],
    });
  });

  it('handles 404, 403, outage and other', () => {
    expect(mapScheduleError(err(404, 'gone'))).toEqual({ kind: 'not-found' });
    expect(mapScheduleError(err(403, 'no')).kind).toBe('forbidden');
    expect(mapScheduleError(err(504, 'slow', 'unavailable')).kind).toBe('offline');
    expect(mapScheduleError(err(500, 'x')).kind).toBe('other');
  });
});

describe('mapGenerateError', () => {
  const sent = { branchId: 'b-1' };
  const e = (id: string) => contract.errors.find((x) => x.id === id)!;

  it.each([
    [
      'generation.noWorkingHours',
      'no-schedule',
      'Set a schedule',
      ['/admin', 'branches', 'b-1', 'schedule'],
      undefined,
    ],
    [
      'generation.branchInactive',
      'branch-inactive',
      'Activate it',
      ['/admin', 'branches'],
      { status: 'inactive' },
    ],
    [
      'generation.serviceInactive',
      'service-inactive',
      'Activate it',
      ['/admin', 'services'],
      { status: 'inactive' },
    ],
  ])('409 %s', (id, kind, label, commands, queryParams) => {
    const outcome = mapGenerateError(err(409, e(id).example), sent);
    expect(outcome).toMatchObject({ kind, link: { label, commands } });
    expect((outcome as { link: { queryParams?: object } }).link.queryParams).toEqual(queryParams);
  });

  it('409 concurrent offers a manual retry', () => {
    expect(mapGenerateError(err(409, e('generation.concurrent').example), sent)).toEqual({
      kind: 'concurrent',
      message:
        'Another generation for this branch and service was running at the same time. Check the result and try again.',
      actionLabel: 'Try again',
    });
  });

  it('another 409 keeps the server text', () => {
    expect(mapGenerateError(err(409, 'Something else.'), sent)).toEqual({
      kind: 'conflict',
      message: 'Something else.',
    });
  });

  it('the link ids come from the form, not the detail', () => {
    const outcome = mapGenerateError(err(409, "Branch 'OTHER' has no working hours."), {
      branchId: 'chosen',
    });
    expect(outcome).toMatchObject({
      link: { commands: ['/admin', 'branches', 'chosen', 'schedule'] },
    });
  });

  it('404 tells a missing branch from a missing service', () => {
    expect(mapGenerateError(err(404, e('branch.notFound').example), sent)).toEqual({
      kind: 'branch-not-found',
      message: 'That branch no longer exists',
    });
    expect(mapGenerateError(err(404, e('service.notFound').example), sent)).toEqual({
      kind: 'service-not-found',
      message: 'That service no longer exists',
    });
    expect(mapGenerateError(err(404, 'Nothing.'), sent).kind).toBe('other');
  });

  it('400 maps the generation fields', () => {
    expect(
      mapGenerateError(
        err(400, `${P}From date cannot be after to date.,Capacity must be between 1 and 100.`),
        sent,
      ),
    ).toEqual({
      kind: 'validation',
      fields: {
        toDate: 'From date cannot be after to date.',
        capacity: 'Capacity must be between 1 and 100.',
      },
      alert: [],
    });
  });

  it('403, 429, outage and other', () => {
    expect(mapGenerateError(err(403, 'no'), sent).kind).toBe('forbidden');
    expect(mapGenerateError(new AppError(429, 'w', 'rate-limited', 'c', 5), sent).kind).toBe(
      'rate-limited',
    );
    expect(mapGenerateError(err(0, 'x', 'timeout'), sent).kind).toBe('offline');
    expect(mapGenerateError(err(500, 'x'), sent).kind).toBe('other');
  });
});
