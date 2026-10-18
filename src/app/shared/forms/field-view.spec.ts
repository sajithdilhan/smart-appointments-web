import { Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { FieldA11yDirective } from './field-a11y.directive';
import { createFieldView } from './field-view';
import { focusFirstInvalid } from './focus-first-invalid';
import { FormFieldComponent } from './form-field.component';
import { requiredValidator } from './validators';

@Component({
  imports: [ReactiveFormsModule, FormFieldComponent, FieldA11yDirective],
  template: `
    <form #f novalidate>
      <app-form-field [view]="nameView" label="Name" hint="Your full name">
        <input id="name" [formControl]="name" [appField]="nameView" />
      </app-form-field>
      <app-form-field [view]="emailView" label="Email">
        <input id="email" [formControl]="email" [appField]="emailView" />
        <a errorAction href="/login">Log in instead</a>
      </app-form-field>
      <button type="button" (click)="submit()">Submit</button>
      <button type="button" (click)="setServer()">Server</button>
    </form>
    <p id="extra">Extra</p>
  `,
})
class Host {
  private readonly injector = inject(Injector);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly name = new FormControl('', { nonNullable: true, validators: [requiredValidator] });
  readonly email = new FormControl('', { nonNullable: true, validators: [requiredValidator] });
  readonly submitAttempted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly nameView = createFieldView({
    id: 'name',
    control: this.name,
    messages: { required: 'Name is required.' },
    submitAttempted: this.submitAttempted,
    hint: true,
    extraDescribedBy: ['extra'],
  });
  readonly emailView = createFieldView({
    id: 'email',
    control: this.email,
    messages: { required: 'Email is required.' },
    submitAttempted: this.submitAttempted,
    serverError: this.serverError,
  });
  readonly group = new FormGroup({ name: this.name, email: this.email });

  submit() {
    this.submitAttempted.set(true);
    focusFirstInvalid(this.el, this.injector);
  }
  setServer() {
    this.email.setValue('taken@example.com');
    this.serverError.set('An account with this email already exists.');
  }
}

const describedIds = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);

describe('field view, field a11y and form field', () => {
  it('shows an error only after blur or submit, and clears it when valid', async () => {
    const user = userEvent.setup();
    await render(Host);
    const name = screen.getByLabelText(/Name/);
    expect(screen.queryByText('Name is required.')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();

    await user.click(name);
    await user.tab();
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(name.getAttribute('aria-invalid')).toBe('true');

    await user.type(name, 'Ada');
    expect(screen.queryByText('Name is required.')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows every error after a submit attempt', async () => {
    const user = userEvent.setup();
    await render(Host);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Name is required.')).toBeTruthy();
    expect(screen.getByText('Email is required.')).toBeTruthy();
  });

  it('every aria-describedby id resolves to an element, extras and hint first', async () => {
    const user = userEvent.setup();
    await render(Host);
    const name = screen.getByLabelText(/Name/);
    expect(describedIds(name)).toEqual(['extra', 'name-hint']);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Name is required.');
    expect(describedIds(name)).toEqual(['extra', 'name-hint', 'name-error']);
    for (const id of describedIds(name)) expect(document.getElementById(id)).not.toBeNull();
    expect(name.getAttribute('aria-required')).toBe('true');
  });

  it('a server error wins, renders the action slot, and clears on edit', async () => {
    const user = userEvent.setup();
    await render(Host);
    await user.click(screen.getByRole('button', { name: 'Server' }));
    const email = screen.getByLabelText(/Email/);
    expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('link', { name: 'Log in instead' })).toBeTruthy();
    expect(document.getElementById('email-error')).not.toBeNull();

    await user.type(email, 'x');
    expect(screen.queryByText('An account with this email already exists.')).toBeNull();
    expect(email.getAttribute('aria-invalid')).toBeNull();
  });

  it('focuses the first invalid field in DOM order', async () => {
    const user = userEvent.setup();
    await render(Host);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Name is required.');
    expect(document.activeElement).toBe(screen.getByLabelText(/Name/));

    await user.type(screen.getByLabelText(/Name/), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Email is required.');
    expect(document.activeElement).toBe(screen.getByLabelText(/Email/));
  });
});
