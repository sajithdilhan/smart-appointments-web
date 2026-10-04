import { Component, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { createFieldView } from '../../../shared/forms/field-view';
import { PasswordFieldComponent } from './password-field.component';

@Component({
  imports: [PasswordFieldComponent],
  template: `<app-password-field
    [view]="view"
    [control]="control"
    [pending]="pending()"
    autocomplete="new-password"
  />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
  readonly pending = signal(false);
  readonly view = createFieldView({
    id: 'password',
    control: this.control,
    messages: {},
    submitAttempted: signal(false),
  });
}

describe('PasswordFieldComponent', () => {
  const input = () => screen.getByLabelText(/^Password/) as HTMLInputElement;

  it('starts hidden with a named, unpressed toggle', async () => {
    await render(Host);
    expect(input().type).toBe('password');
    expect(input().getAttribute('autocomplete')).toBe('new-password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles visibility, renames the button and keeps the value and caret', async () => {
    const user = userEvent.setup();
    await render(Host);
    await user.type(input(), 'Secret1!');
    input().setSelectionRange(2, 4);
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    const hide = await screen.findByRole('button', { name: 'Hide password' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(input().type).toBe('text');
    expect(input().value).toBe('Secret1!');
    expect([input().selectionStart, input().selectionEnd]).toEqual([2, 4]);
    await user.click(hide);
    expect(input().type).toBe('password');
    expect(input().value).toBe('Secret1!');
  });

  it('is read-only (not disabled) while pending and keeps the value', async () => {
    const { fixture } = await render(Host);
    fixture.componentInstance.control.setValue('abc');
    fixture.componentInstance.pending.set(true);
    fixture.detectChanges();
    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    expect(input().value).toBe('abc');
  });

  it('does not block paste', async () => {
    const user = userEvent.setup();
    await render(Host);
    await user.click(input());
    await user.paste('Pasted1!');
    expect(input().value).toBe('Pasted1!');
  });
});
