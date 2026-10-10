import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { serviceValidators } from '../validation/validators';
import { formatDuration } from './duration';
import { DurationStepper } from './duration-stepper.component';

async function renderStepper(initial = 30) {
  const control = new FormControl(initial, {
    nonNullable: true,
    validators: serviceValidators.durationMinutes,
  });
  await render(
    `<label for="d">Duration</label><app-duration-stepper inputId="d" [formControl]="control" />`,
    { imports: [DurationStepper, ReactiveFormsModule], componentProperties: { control } },
  );
  return control;
}

const input = () => screen.getByRole('textbox', { name: 'Duration' });
const dec = () => screen.getByRole('button', { name: 'Decrease duration' });
const inc = () => screen.getByRole('button', { name: 'Increase duration' });

describe('formatDuration', () => {
  it.each([
    [5, '5 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [120, '2 h'],
    [480, '8 h'],
  ])('%i minutes reads %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('DurationStepper', () => {
  it('shows the value, the unit and the hours echo', async () => {
    await renderStepper(90);
    expect(input()).toHaveValue('90');
    expect(input()).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByText('minutes')).toBeVisible();
    expect(screen.getByText('1 h 30 min')).toBeVisible();
  });

  it('the buttons step by 5 and the control follows', async () => {
    const control = await renderStepper(30);
    await userEvent.click(inc());
    expect(control.value).toBe(35);
    expect(input()).toHaveValue('35');
    await userEvent.click(dec());
    await userEvent.click(dec());
    expect(control.value).toBe(25);
  });

  it('ArrowUp and ArrowDown are the same steps', async () => {
    const control = await renderStepper(30);
    input().focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(control.value).toBe(40);
    await userEvent.keyboard('{ArrowDown}');
    expect(control.value).toBe(35);
  });

  it('clamps at 5 and 480 and disables the button at the bound', async () => {
    const low = await renderStepper(5);
    expect(dec()).toBeDisabled();
    expect(inc()).toBeEnabled();
    input().focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(low.value).toBe(5);
  });

  it('disables Increase at 480', async () => {
    const control = await renderStepper(475);
    await userEvent.click(inc());
    expect(control.value).toBe(480);
    expect(inc()).toBeDisabled();
    await userEvent.keyboard('{ArrowUp}');
    expect(control.value).toBe(480);
  });

  it('never rounds a typed value: 7 stays 7 and the control reports the step error', async () => {
    const control = await renderStepper(30);
    await userEvent.clear(input());
    await userEvent.type(input(), '7');
    expect(control.value).toBe(7);
    expect(input()).toHaveValue('7');
    expect(control.errors).toEqual({ step: true });
  });

  it('text that is not a number gives a range error', async () => {
    const control = await renderStepper(30);
    await userEvent.clear(input());
    expect(control.errors).toEqual({ range: true });
    await userEvent.type(input(), 'abc');
    expect(control.errors).toEqual({ range: true });
  });

  it('preset chips are toggle buttons with aria-pressed that set the value and keep focus', async () => {
    const control = await renderStepper(30);
    const group = screen.getByRole('group', { name: 'Common durations' });
    expect(group).toBeVisible();
    expect(screen.getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '60 min' })).toHaveAttribute('aria-pressed', 'false');
    const chip = screen.getByRole('button', { name: '60 min' });
    await userEvent.click(chip);
    expect(control.value).toBe(60);
    expect(input()).toHaveValue('60');
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveFocus();
    expect(screen.getByRole('button', { name: '30 min' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the stepper updates the chips', async () => {
    await renderStepper(40);
    expect(screen.getByRole('button', { name: '45 min' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(inc());
    expect(screen.getByRole('button', { name: '45 min' })).toHaveAttribute('aria-pressed', 'true');
  });
});
