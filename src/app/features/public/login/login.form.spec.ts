import { createLoginForm, LOGIN_MESSAGES } from './login.form';

describe('createLoginForm', () => {
  it('requires both fields', () => {
    const form = createLoginForm();
    expect(form.controls.email.errors).toEqual({ required: true });
    expect(form.controls.password.errors).toEqual({ required: true });
    expect(form.invalid).toBe(true);
  });

  it('checks the email shape but applies no password strength rules', () => {
    const form = createLoginForm();
    form.setValue({ email: 'nope', password: 'x' });
    expect(form.controls.email.errors).toEqual({ email: true });
    expect(form.controls.password.valid).toBe(true);
    form.setValue({ email: 'a@b.co', password: 'x' });
    expect(form.valid).toBe(true);
  });

  it('has a message for every error key it can produce', () => {
    expect(Object.keys(LOGIN_MESSAGES.email)).toEqual(['required', 'email']);
    expect(Object.keys(LOGIN_MESSAGES.password)).toEqual(['required']);
  });
});
