import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { DayNav } from './day-nav.component';

async function setup(inputs: { date?: string; today?: string; zoneLabel?: string | null } = {}) {
  const dateChange = vi.fn();
  const view = await render(DayNav, {
    inputs: { date: '2026-10-24', today: '2026-10-24', ...inputs },
    on: { dateChange },
    providers: [provideRouter([])],
  });
  return { dateChange, view };
}

describe('DayNav', () => {
  it('has the Appointments heading and the date written out in full', async () => {
    await setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Appointments' })).toBeTruthy();
    expect(screen.getByText('Saturday 24 October 2026')).toBeTruthy();
  });

  it('Previous day and Next day emit the neighbouring dates, across month ends', async () => {
    const { dateChange, view } = await setup({ date: '2026-10-31', today: '2026-10-20' });
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(dateChange).toHaveBeenLastCalledWith('2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(dateChange).toHaveBeenLastCalledWith('2026-10-30');
    view.fixture.componentRef.setInput('date', '2026-03-01');
    await view.fixture.whenStable();
    await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(dateChange).toHaveBeenLastCalledWith('2026-02-28');
  });

  it('Today is disabled on today and emits today from another day', async () => {
    const { dateChange, view } = await setup();
    expect((screen.getByRole('button', { name: 'Today' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    view.fixture.componentRef.setInput('date', '2026-10-30');
    await view.fixture.whenStable();
    const today = screen.getByRole('button', { name: 'Today' }) as HTMLButtonElement;
    expect(today.disabled).toBe(false);
    await userEvent.click(today);
    expect(dateChange).toHaveBeenCalledWith('2026-10-24');
  });

  it('has a labelled date input showing the day, and emits a picked date', async () => {
    const { dateChange } = await setup();
    const input = screen.getByLabelText('Go to date') as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('2026-10-24');
    input.value = '2026-12-25';
    input.dispatchEvent(new Event('change'));
    expect(dateChange).toHaveBeenLastCalledWith('2026-12-25');
  });

  it('ignores an emptied input and puts the shown day back', async () => {
    const { dateChange } = await setup();
    const input = screen.getByLabelText('Go to date') as HTMLInputElement;
    input.value = '';
    input.dispatchEvent(new Event('change'));
    expect(dateChange).not.toHaveBeenCalled();
    expect(input.value).toBe('2026-10-24');
  });

  it('labels the zone only when given one', async () => {
    const { view } = await setup({ zoneLabel: 'UTC' });
    expect(screen.getByText('Times in UTC')).toBeTruthy();
    view.fixture.componentRef.setInput('zoneLabel', null);
    await view.fixture.whenStable();
    expect(screen.queryByText(/Times in/)).toBeNull();
  });
});
