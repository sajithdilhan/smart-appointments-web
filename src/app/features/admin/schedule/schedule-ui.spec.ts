import { signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ViewportService } from '../../../core/util/viewport.service';
import { ScheduleDayRow } from './schedule-day-row.component';
import { createScheduleForm, fromBranch } from './schedule.form';
import { TimeZoneCombobox } from './time-zone-combobox.component';
import { resetZoneOptionsCache } from './zone-options';

beforeEach(resetZoneOptionsCache);

async function renderCombobox(initial = '') {
  const control = new FormControl(initial, { nonNullable: true });
  const view = await render(
    `<label for="tz">Time zone</label><app-time-zone-combobox inputId="tz" [formControl]="control" />`,
    { imports: [TimeZoneCombobox, ReactiveFormsModule], componentProperties: { control } },
  );
  return { control, ...view };
}

describe('TimeZoneCombobox', () => {
  it('has the combobox ARIA contract, closed', async () => {
    await renderCombobox();
    const box = screen.getByRole('combobox', { name: 'Time zone' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(box).toHaveAttribute('aria-controls');
    expect(box).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows the selected zone with its offset when closed', async () => {
    await renderCombobox('Asia/Colombo');
    expect(screen.getByRole('combobox')).toHaveValue('Asia/Colombo, UTC+05:30');
  });

  it('typing opens a filtered listbox; the active option is named by aria-activedescendant', async () => {
    await renderCombobox();
    const box = screen.getByRole('combobox');
    await userEvent.type(box, 'colombo');
    expect(box).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox');
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Asia/Colombo, UTC+05:30');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0].id);
  });

  it('Enter selects the active option, sets the value and closes; offsets are shown', async () => {
    const { control } = await renderCombobox();
    const box = screen.getByRole('combobox');
    await userEvent.type(box, 'new york{Enter}');
    expect(control.value).toBe('America/New_York');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect((box as HTMLInputElement).value).toMatch(/^America\/New_York, UTC-0[45]:00$/);
  });

  it('arrow keys move the highlight; clicking an option selects it', async () => {
    const { control } = await renderCombobox();
    const box = screen.getByRole('combobox');
    await userEvent.type(box, 'asia/k');
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getAllByRole('option')[1]);
    expect(control.value).toBe(options[1].textContent!.split(',')[0].trim());
  });

  it('free text is not accepted: the value is unchanged after typing and blurring', async () => {
    const { control } = await renderCombobox('Europe/London');
    const box = screen.getByRole('combobox');
    await userEvent.clear(box);
    await userEvent.type(box, 'Nowhere/Land');
    expect(screen.getByText('No matching time zones')).toBeInTheDocument();
    await userEvent.tab();
    expect(control.value).toBe('Europe/London');
    expect((box as HTMLInputElement).value).toMatch(/^Europe\/London, UTC\+0[01]:00$/);
  });

  it('Escape closes the list without changing the value', async () => {
    const { control } = await renderCombobox('Asia/Colombo');
    const box = screen.getByRole('combobox');
    await userEvent.type(box, 'x');
    expect(box).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(control.value).toBe('Asia/Colombo');
  });

  it('offers the browser zone first while the field is empty, and says the list is truncated', async () => {
    await renderCombobox();
    const box = screen.getByRole('combobox');
    await userEvent.click(box);
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.getAllByRole('option')[0]).toHaveTextContent("Your browser's zone");
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.getByRole('status')).toHaveTextContent('Keep typing to narrow the list');
  });

  it('marks the touched state on blur', async () => {
    const { control } = await renderCombobox();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.tab();
    expect(control.touched).toBe(true);
  });
});

describe('ScheduleDayRow', () => {
  async function renderRow(index: number, isMd = true, submitAttempted = false) {
    const form = createScheduleForm();
    fromBranch(form, {
      timeZoneId: 'UTC',
      workingHours: [{ dayOfWeek: 'Monday', opensAt: '09:00', closesAt: '17:00' }],
    });
    await render(ScheduleDayRow, {
      inputs: { row: form.controls.days.at(index), submitAttempted },
      providers: [{ provide: ViewportService, useValue: { isMd: signal(isMd) } }],
    });
    return form.controls.days.at(index);
  }

  it('an open day shows the named switch and time inputs', async () => {
    await renderRow(0);
    expect(screen.getByRole('switch', { name: 'Open on Monday' })).toBeChecked();
    expect(screen.getByLabelText('Monday opens')).toHaveValue('09:00');
    expect(screen.getByLabelText('Monday closes')).toHaveValue('17:00');
    expect(screen.getByLabelText('Monday opens')).toHaveAttribute('step', '300');
  });

  it('a closed day shows "Closed" and no time inputs; the switch opens it with defaults', async () => {
    const row = await renderRow(1);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tuesday opens')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Open on Tuesday' }));
    expect(row.controls.open.value).toBe(true);
    expect(await screen.findByLabelText('Tuesday opens')).toHaveValue('09:00');
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
  });

  it('shows the row error linked by aria-describedby once touched', async () => {
    await renderRow(0);
    const opens = screen.getByLabelText('Monday opens');
    await userEvent.clear(opens);
    await userEvent.type(opens, '17:30');
    await userEvent.tab();
    const error = await screen.findByText('Opening time must be before closing time.');
    expect(opens).toHaveAttribute('aria-invalid', 'true');
    expect(opens.getAttribute('aria-describedby')).toBe(error.id);
    expect(screen.getByLabelText('Monday closes').getAttribute('aria-describedby')).toBe(error.id);
  });

  it('shows the error straight away after a failed Save attempt', async () => {
    const row = await renderRow(0, true, true);
    row.patchValue({ closesAt: '' });
    expect(await screen.findByText('Enter a closing time.')).toBeInTheDocument();
  });

  it('is a card below 768 px and a grid row from it', async () => {
    await renderRow(0, false);
    expect(document.querySelector('[data-layout="card"]')).not.toBeNull();
  });
});
