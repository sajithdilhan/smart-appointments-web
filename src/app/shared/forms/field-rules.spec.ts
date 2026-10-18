import { FormControl } from '@angular/forms';
import { email, maxTrimmed, phone, requiredTrimmed } from './field-rules';
import {
  emailValidator,
  firstFailing,
  maxLengthValidator,
  phoneValidator,
  requiredValidator,
} from './validators';

describe('field rules', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['a', null],
  ])('requiredTrimmed(%j) = %s', (v, expected) => {
    expect(requiredTrimmed(v)).toBe(expected);
  });

  it('maxTrimmed counts the trimmed value: 50 passes, 51 fails', () => {
    const rule = maxTrimmed(50);
    expect(rule('a'.repeat(50))).toBeNull();
    expect(rule('a'.repeat(51))).toBe('maxlength');
    expect(rule(' ' + 'a'.repeat(50) + ' ')).toBeNull();
  });

  it.each([
    ['user@example.com', null],
    ['first.last+tag@sub.example.co', null],
    ['  user@example.com  ', null],
    ['', null],
    ['user', 'email'],
    ['user@', 'email'],
    ['@example.com', 'email'],
    ['user@exa mple.com', 'email'],
    ['user@@example.com', 'email'],
  ])('email(%j) = %s', (v, expected) => {
    expect(email(v)).toBe(expected);
  });

  it.each([
    ['+14155550123', null],
    ['(415) 555-0123', null],
    ['', null],
    ['0123', 'pattern'],
    ['+0123', 'pattern'],
    ['+1234567890123456', 'pattern'],
    ['abc', 'pattern'],
  ])('phone(%j) = %s', (v, expected) => {
    expect(phone(v)).toBe(expected);
  });
});

describe('validators', () => {
  const errors = (v: ReturnType<typeof firstFailing>, value: string) => v(new FormControl(value));

  it('reports required before the other rules, one key only', () => {
    expect(errors(emailValidator, '')).toEqual({ required: true });
    expect(errors(emailValidator, 'nope')).toEqual({ email: true });
    expect(errors(emailValidator, 'a@b.co')).toBeNull();
    expect(errors(phoneValidator, '')).toEqual({ required: true });
    expect(errors(phoneValidator, '0123')).toEqual({ pattern: true });
    expect(errors(maxLengthValidator(50), '')).toEqual({ required: true });
    expect(errors(maxLengthValidator(50), 'a'.repeat(51))).toEqual({ maxlength: true });
    expect(errors(requiredValidator, '  ')).toEqual({ required: true });
  });

  it('treats a non-string control value as empty', () => {
    expect(requiredValidator(new FormControl(null))).toEqual({ required: true });
  });
});
