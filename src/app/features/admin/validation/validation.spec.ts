import { FormControl, FormGroup } from '@angular/forms';
import contract from '../../../../testing/fixtures/availability-contract.json';
import {
  BRANCH_CODE_PATTERN,
  PHONE_PATTERN,
  addressError,
  branchCodeError,
  descriptionError,
  nameError,
  normaliseCode,
  phoneError,
} from './branch-rules';
import { capacityError, dateRangeError, dateRequiredError } from './generation-rules';
import { MESSAGES, MIRRORED, firstMessage } from './messages';
import {
  TIME_PATTERN,
  normaliseTime,
  opensBeforeCloses,
  scheduleRowError,
  timeFormatError,
  zoneRequiredError,
} from './schedule-rules';
import { SERVICE_CODE_PATTERN, durationError, serviceCodeError } from './service-rules';
import {
  branchValidators,
  generationValidators,
  scheduleValidators,
  serviceValidators,
} from './validators';

describe('branch rules', () => {
  it.each([
    [' pg ', null],
    ['PG', null],
    ['a1', null],
    ['A-B', null],
    ['ABCDEFGHIJ', null],
    ['-AB', 'pattern'],
    ['AB-', 'pattern'],
    ['A', 'pattern'],
    ['ABCDEFGHIJK', 'pattern'],
    ['A_B', 'pattern'],
    ['', 'required'],
    ['   ', 'required'],
  ])('code %j -> %s', (input, expected) => {
    expect(branchCodeError(input)).toBe(expected);
  });

  it.each([
    [' pg ', 'PG'],
    ['aB-1', 'AB-1'],
    ['  ', ''],
  ])('normaliseCode(%j) = %j', (input, expected) => {
    expect(normaliseCode(input)).toBe(expected);
  });

  it('name: required, then 100 characters as sent', () => {
    expect(nameError('')).toBe('required');
    expect(nameError('   ')).toBe('required');
    expect(nameError('n'.repeat(100))).toBeNull();
    expect(nameError('n'.repeat(101))).toBe('max');
    expect(nameError(' ' + 'n'.repeat(100))).toBe('max'); // untrimmed length, as the backend
  });

  it('description: optional, 500 characters as sent', () => {
    expect(descriptionError('')).toBeNull();
    expect(descriptionError('d'.repeat(500))).toBeNull();
    expect(descriptionError('d'.repeat(501))).toBe('max');
  });

  it('address: required, 200 characters', () => {
    expect(addressError('')).toBe('required');
    expect(addressError('a'.repeat(200))).toBeNull();
    expect(addressError('a'.repeat(201))).toBe('max');
  });

  it.each([
    ['+14155550123', null],
    ['14155550123', null],
    ['0123', 'pattern'],
    ['+0123', 'pattern'],
    ['1', 'pattern'],
    ['', 'required'],
  ])('phone %j -> %s', (input, expected) => {
    expect(phoneError(input)).toBe(expected);
  });
});

describe('service rules', () => {
  it.each([
    [' cut ', null],
    ['A_B', null],
    ['A-B_C', null],
    ['_AB', 'pattern'],
    ['AB_', 'pattern'],
    ['-AB', 'pattern'],
    ['A', 'pattern'],
    ['A'.repeat(30), null],
    ['A'.repeat(31), 'pattern'],
    ['', 'required'],
  ])('code %j -> %s', (input, expected) => {
    expect(serviceCodeError(input)).toBe(expected);
  });

  it.each([
    [4, 'range'],
    [5, null],
    [7, 'step'],
    [30, null],
    [480, null],
    [485, 'range'],
    [0, 'range'],
    [5.5, 'range'],
    [Number.NaN, 'range'],
  ])('duration %s -> %s', (input, expected) => {
    expect(durationError(input)).toBe(expected);
  });
});

describe('schedule rules', () => {
  it.each([
    ['09:00', null],
    ['00:00', null],
    ['23:59', null],
    ['9:00', 'format'],
    ['24:00', 'format'],
    ['09:60', 'format'],
    ['09:00:00', 'format'],
    ['', 'required'],
  ])('time %j -> %s', (input, expected) => {
    expect(timeFormatError(input)).toBe(expected);
  });

  it('normaliseTime drops seconds', () => {
    expect(normaliseTime('09:30:00')).toBe('09:30');
    expect(normaliseTime('09:30')).toBe('09:30');
  });

  it.each([
    ['09:00', '17:00', true],
    ['09:00', '09:00', false],
    ['17:00', '09:00', false],
    ['9:00', '17:00', false],
    ['00:00', '00:01', true],
  ])('opensBeforeCloses(%s, %s) = %s', (a, b, expected) => {
    expect(opensBeforeCloses(a, b)).toBe(expected);
  });

  it('a row reports one error, and only while open', () => {
    const row = (open: boolean, opensAt: string, closesAt: string) =>
      scheduleRowError({ open, opensAt, closesAt });
    expect(row(false, '', 'zz')).toBeNull();
    expect(row(true, '', '17:00')).toBe('opensRequired');
    expect(row(true, '9:00', '17:00')).toBe('opensFormat');
    expect(row(true, '09:00', '')).toBe('closesRequired');
    expect(row(true, '09:00', '24:00')).toBe('closesFormat');
    expect(row(true, '09:00', '09:00')).toBe('order');
    expect(row(true, '09:00', '17:00')).toBeNull();
  });

  it('a zone is required', () => {
    expect(zoneRequiredError('')).toBe('required');
    expect(zoneRequiredError('Asia/Colombo')).toBeNull();
  });
});

describe('generation rules', () => {
  it.each([
    ['2026-10-05', '2026-10-05', null],
    ['2026-10-05', '2026-11-04', null], // 30 days apart: 31 dates
    ['2026-10-05', '2026-11-05', 'span'], // 31 days apart
    ['2026-10-06', '2026-10-05', 'order'],
    ['', '2026-10-05', null],
    ['2026-10-05', '', null],
    ['2026-02-01', '2026-03-03', null], // 30 days across February
    ['2026-02-01', '2026-03-04', 'span'],
  ])('range %s to %s -> %s', (from, to, expected) => {
    expect(dateRangeError(from, to)).toBe(expected);
  });

  it('dates are required in yyyy-MM-dd form', () => {
    expect(dateRequiredError('')).toBe('required');
    expect(dateRequiredError('05/10/2026')).toBe('required');
    expect(dateRequiredError('2026-10-05')).toBeNull();
  });

  it.each([
    [0, 'range'],
    [1, null],
    [100, null],
    [101, 'range'],
    [2.5, 'range'],
    [Number.NaN, 'range'],
  ])('capacity %s -> %s', (input, expected) => {
    expect(capacityError(input)).toBe(expected);
  });
});

describe('validators', () => {
  it('wrap a rule into a one-key error', () => {
    expect(branchValidators.code(new FormControl('-AB'))).toEqual({ pattern: true });
    expect(branchValidators.code(new FormControl(' pg '))).toBeNull();
    expect(branchValidators.name(new FormControl(''))).toEqual({ required: true });
    expect(serviceValidators.durationMinutes(new FormControl(7))).toEqual({ step: true });
    expect(serviceValidators.durationMinutes(new FormControl(null))).toEqual({ range: true });
    expect(generationValidators.capacity(new FormControl(0))).toEqual({ range: true });
  });

  it('phone uses the supplied normaliser', () => {
    const control = new FormControl('+1 415 555 0123');
    expect(branchValidators.phoneNumber()(control)).toEqual({ pattern: true });
    expect(branchValidators.phoneNumber((v) => v.replace(/\s/g, ''))(control)).toBeNull();
  });

  it('group validators read the group value', () => {
    const row = new FormGroup({
      open: new FormControl(true),
      opensAt: new FormControl('09:00'),
      closesAt: new FormControl('09:00'),
    });
    expect(scheduleValidators.row(row)).toEqual({ order: true });
    const range = new FormGroup({
      fromDate: new FormControl('2026-10-05'),
      toDate: new FormControl('2026-11-05'),
    });
    expect(generationValidators.dateRange(range)).toEqual({ span: true });
  });

  it('firstMessage picks the first table key present', () => {
    const table = MESSAGES.branch.code;
    expect(firstMessage(table, { pattern: true })).toBe(table.pattern);
    expect(firstMessage(table, { pattern: true, required: true })).toBe(table.required);
    expect(firstMessage(table, null)).toBeNull();
    expect(firstMessage(table, { other: true })).toBeNull();
  });
});

describe('contract with the Availability fixture', () => {
  it('every mirrored client message equals the backend message', () => {
    const byId = new Map(contract.messages.map((m) => [m.id, m.text]));
    for (const [id, text] of Object.entries(MIRRORED)) {
      expect(byId.get(id), `fixture entry ${id}`).toBe(text);
    }
  });

  it('client patterns equal the backend regexes verbatim', () => {
    expect(BRANCH_CODE_PATTERN.source).toBe(new RegExp(contract.patterns.branchCode.regex).source);
    expect(SERVICE_CODE_PATTERN.source).toBe(
      new RegExp(contract.patterns.serviceCode.regex).source,
    );
    expect(PHONE_PATTERN.source).toBe(new RegExp(contract.patterns.phone.regex).source);
    expect(TIME_PATTERN.source).toBe(new RegExp(contract.patterns.time.regex).source);
  });

  it.each([
    ['branchCode', (v: string) => branchCodeError(v)],
    ['serviceCode', (v: string) => serviceCodeError(v)],
    ['phone', (v: string) => phoneError(v)],
    ['time', (v: string) => timeFormatError(v)],
  ] as const)('the client %s rule agrees with every fixture vector', (name, rule) => {
    for (const vector of contract.patterns[name].vectors) {
      expect(rule(vector.input) === null, `${name} ${JSON.stringify(vector.input)}`).toBe(
        vector.valid,
      );
    }
  });

  it('the numeric limits match', () => {
    const { name, description, address, duration, capacity, rangeDays } = contract.limits;
    expect(nameError('n'.repeat(name.max))).toBeNull();
    expect(nameError('n'.repeat(name.max + 1))).toBe('max');
    expect(descriptionError('d'.repeat(description.max + 1))).toBe('max');
    expect(addressError('a'.repeat(address.max + 1))).toBe('max');
    expect(durationError(duration.min)).toBeNull();
    expect(durationError(duration.min - 1)).toBe('range');
    expect(durationError(duration.max + duration.step)).toBe('range');
    expect(capacityError(capacity.min)).toBeNull();
    expect(capacityError(capacity.max + 1)).toBe('range');
    expect(dateRangeError('2026-10-05', '2026-11-04')).toBeNull();
    expect(rangeDays.maxSpanned).toBe(31);
    expect(dateRangeError('2026-10-05', '2026-11-05')).toBe('span');
  });
});
