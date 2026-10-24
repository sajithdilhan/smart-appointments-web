import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ManualClock } from '../../../testing/manual-clock';
import { makeAppointment, resetMakeAppointment } from '../../../testing/make-appointment';
import { createNowSignal } from '../../core/util/now-signal';
import { CLOCK } from '../../core/util/clock';
import type { BranchAppointment } from '../../core/api/models';
import { toRow, type BranchDayRow } from './day-row';
import { RowActions } from './row-actions.component';

const START = Date.parse('2026-10-24T09:30:00Z'); // 10:30 in London (BST)

function row(overrides: Partial<BranchAppointment> = {}): BranchDayRow {
  resetMakeAppointment();
  return toRow(
    {
      ...makeAppointment({ startUtc: '2026-10-24T09:30:00Z', ...overrides }),
      customer: { firstName: 'Ana', lastName: 'Perera', phoneNumber: '+94771234567' },
      ...overrides,
    },
    { zone: 'Europe/London', services: new Map() },
  );
}

const button = (name: RegExp | string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('RowActions', () => {
  it.each(['Completed', 'NoShow', 'Cancelled'])('offers nothing for a %s row', async (status) => {
    await render(RowActions, {
      inputs: { row: row({ status }), nowMs: START + 1, zone: 'Europe/London' },
    });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('is disabled before the start, with the hint tied to both buttons', async () => {
    await render(RowActions, {
      inputs: { row: row(), nowMs: START - 60_000, zone: 'Europe/London' },
    });
    const complete = button('Complete Ana Perera at 10:30');
    const noShow = button('No-show Ana Perera at 10:30');
    expect(complete.disabled).toBe(true);
    expect(noShow.disabled).toBe(true);
    const hint = screen.getByText('Available from 10:30');
    expect(hint.id).not.toBe('');
    expect(complete.getAttribute('aria-describedby')).toBe(hint.id);
    expect(noShow.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('puts the date in the hint when the day is not today', async () => {
    await render(RowActions, {
      inputs: { row: row(), nowMs: Date.parse('2026-10-23T09:00:00Z'), zone: 'Europe/London' },
    });
    expect(screen.getByText('Available from Sat 24 Oct, 10:30')).toBeTruthy();
  });

  it('is enabled, without a hint, once the start has passed', async () => {
    await render(RowActions, { inputs: { row: row(), nowMs: START, zone: 'Europe/London' } });
    expect(button(/^Complete/).disabled).toBe(false);
    expect(button(/^No-show/).disabled).toBe(false);
    expect(screen.queryByText(/Available from/)).toBeNull();
    expect(button(/^Complete/).getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the activated button busy and disables both', async () => {
    await render(RowActions, {
      inputs: { row: row(), nowMs: START, zone: 'Europe/London', marking: 'no-show' },
    });
    expect(button(/^No-show/).getAttribute('aria-busy')).toBe('true');
    expect(button(/^Complete/).getAttribute('aria-busy')).toBeNull();
    expect(button(/^No-show/).disabled).toBe(true);
    expect(button(/^Complete/).disabled).toBe(true);
  });

  it('emits complete and noShow', async () => {
    const complete = vi.fn();
    const noShow = vi.fn();
    await render(RowActions, {
      inputs: { row: row(), nowMs: START, zone: 'Europe/London' },
      on: { complete, noShow },
    });
    await userEvent.click(button(/^Complete/));
    await userEvent.click(button(/^No-show/));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(noShow).toHaveBeenCalledTimes(1);
  });

  it('names the appointment when there is no customer name', async () => {
    await render(RowActions, {
      inputs: { row: row({ customer: null }), nowMs: START, zone: 'Europe/London' },
    });
    expect(button('Complete appointment at 10:30')).toBeTruthy();
  });
});

@Component({
  selector: 'app-actions-host',
  imports: [RowActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-row-actions [row]="row()" [nowMs]="clock.now()" zone="Europe/London" />`,
})
class Host {
  readonly row = input.required<BranchDayRow>();
  protected readonly clock = createNowSignal();

  constructor() {
    this.clock.watch(computed(() => [this.row().startMs]));
  }
}

describe('RowActions with the now signal', () => {
  it('turns on exactly when the clock passes the start, without a reload', async () => {
    const clock = new ManualClock(START - 5 * 60_000);
    await render(Host, {
      inputs: { row: row() },
      providers: [{ provide: CLOCK, useValue: clock }],
    });
    expect(button(/^Complete/).disabled).toBe(true);
    clock.advance(5 * 60_000 - 1);
    expect(button(/^Complete/).disabled).toBe(true);
    clock.advance(1);
    await vi.waitFor(() => expect(button(/^Complete/).disabled).toBe(false));
    expect(screen.queryByText(/Available from/)).toBeNull();
  });
});
