import { FormControl } from '@angular/forms';
import { evaluatePasswordRules, passwordIsValid } from './password-rules';
import { strongPasswordValidator } from './password-validator';

describe('password rules', () => {
  it.each([
    ['Abcdefg1!', true],
    ['Abcdefg1_', false],
    ['abcdefg1!', false],
    ['ABCDEFG1!', false],
    ['Abcdefgh!', false],
    ['Abcdefg1', false],
    ['Abc1!', false],
    ['Abcdef1€', true],
    ['Abcdef1 ', true],
    ['Abcdef1é', false],
  ])('passwordIsValid(%j) = %s', (p, expected) => {
    expect(passwordIsValid(p)).toBe(expected);
  });

  const special = (p: string) => evaluatePasswordRules(p).find((r) => r.id === 'special')!.met;

  it.each([
    ['é', false],
    ['_', false],
    ['€', true],
    [' ', true],
    ['!', true],
  ])('special rule for %j = %s', (p, expected) => {
    expect(special(p)).toBe(expected);
  });

  it('evaluates the five rules in order with their labels', () => {
    const results = evaluatePasswordRules('Ab1');
    expect(results.map((r) => r.id)).toEqual(['length', 'upper', 'lower', 'digit', 'special']);
    expect(results.map((r) => r.met)).toEqual([false, true, true, true, false]);
    expect(results.every((r) => r.label.length > 0)).toBe(true);
  });

  it('validator: required first, then weak, then valid', () => {
    expect(strongPasswordValidator(new FormControl(''))).toEqual({ required: true });
    expect(strongPasswordValidator(new FormControl('abc'))).toEqual({ weak: true });
    expect(strongPasswordValidator(new FormControl('Abcdefg1!'))).toBeNull();
  });
});
