import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { StatusFilterSelect } from './status-filter.component';

describe('StatusFilterSelect', () => {
  it('offers All, Booked, Completed, No-show and Cancelled under the label Status', async () => {
    await render(StatusFilterSelect, { inputs: { value: 'all' } });
    const select = screen.getByLabelText('Status') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      'All',
      'Booked',
      'Completed',
      'No-show',
      'Cancelled',
    ]);
  });

  it('shows the current value', async () => {
    await render(StatusFilterSelect, { inputs: { value: 'NoShow' } });
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('NoShow');
  });

  it('emits the chosen filter', async () => {
    const valueChange = vi.fn();
    await render(StatusFilterSelect, { inputs: { value: 'all' }, on: { valueChange } });
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Completed');
    expect(valueChange).toHaveBeenLastCalledWith('Completed');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'No-show');
    expect(valueChange).toHaveBeenLastCalledWith('NoShow');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'All');
    expect(valueChange).toHaveBeenLastCalledWith('all');
  });
});
