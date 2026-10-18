import { createRegisterForm } from './register.form';

const valid = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phoneNumber: '+14155550123',
  password: 'Abcdefg1!',
};

describe('createRegisterForm', () => {
  it('has exactly the five controls, all required', () => {
    const form = createRegisterForm();
    expect(Object.keys(form.controls)).toEqual([
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'password',
    ]);
    for (const c of Object.values(form.controls)) expect(c.errors).toEqual({ required: true });
  });

  it('accepts valid values, including a formatted phone number', () => {
    const form = createRegisterForm();
    form.setValue({ ...valid, phoneNumber: '+1 (415) 555-0123' });
    expect(form.valid).toBe(true);
  });

  it.each([
    ['firstName', 'a'.repeat(51), { maxlength: true }],
    ['lastName', 'a'.repeat(51), { maxlength: true }],
    ['email', 'nope', { email: true }],
    ['phoneNumber', '0123', { pattern: true }],
    ['password', 'abcdefg1!', { weak: true }],
  ] as const)('%s: %j fails with the right key', (name, value, errors) => {
    const form = createRegisterForm();
    form.setValue({ ...valid, [name]: value });
    expect(form.controls[name].errors).toEqual(errors);
  });

  it('allows 50-character names', () => {
    const form = createRegisterForm();
    form.setValue({ ...valid, firstName: 'a'.repeat(50), lastName: 'b'.repeat(50) });
    expect(form.valid).toBe(true);
  });
});
