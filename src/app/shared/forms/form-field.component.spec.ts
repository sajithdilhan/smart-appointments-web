import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { FieldView } from './field-view';
import { FormFieldComponent } from './form-field.component';

const view = { id: 'f-email', error: () => null } as unknown as FieldView;

@Component({
  imports: [FormFieldComponent],
  template: `<app-form-field [view]="view" label="Email" [icon]="icon">
    <input id="f-email" />
  </app-form-field>`,
})
class Host {
  view = view;
  icon: 'lucideMail' | undefined = 'lucideMail';
}

describe('FormFieldComponent icon', () => {
  it('renders a decorative icon and keeps the label association', async () => {
    const { container } = await render(Host);
    const icon = screen.getByTestId('field-icon');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByLabelText(/Email/)).toBe(container.querySelector('input'));
    expect(container.querySelector('div.relative')!.className).toContain('[&_input]:ps-10');
  });

  it('renders no icon and no padding rule when not set', async () => {
    const { container } = await render(Host, { componentProperties: { icon: undefined } });
    expect(screen.queryByTestId('field-icon')).toBeNull();
    expect(container.querySelector('div.relative')!.className).not.toContain('ps-10');
  });
});
