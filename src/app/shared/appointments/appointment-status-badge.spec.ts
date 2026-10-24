import { render, screen } from '@testing-library/angular';
import { AppointmentStatusBadge } from './appointment-status-badge';

describe('AppointmentStatusBadge (shared)', () => {
  it('Completed is a success badge with a hidden icon and its own text', async () => {
    const { container } = await render(AppointmentStatusBadge, {
      inputs: { status: 'Completed' },
    });
    const badge = screen.getByText('Completed');
    expect(badge.getAttribute('data-variant')).toBe('success');
    const icon = container.querySelector('ng-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('name')).toBe('lucideCircleCheck');
  });

  it('NoShow reads "No-show" in a warning badge with a hidden icon', async () => {
    const { container } = await render(AppointmentStatusBadge, { inputs: { status: 'NoShow' } });
    const badge = screen.getByText('No-show');
    expect(badge.getAttribute('data-variant')).toBe('warning');
    expect(screen.queryByText('NoShow')).toBeNull();
    const icon = container.querySelector('ng-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.getAttribute('name')).toBe('lucideUserX');
  });

  it('an unknown status keeps its own text, neutral, with no icon', async () => {
    const { container } = await render(AppointmentStatusBadge, { inputs: { status: 'Archived' } });
    expect(screen.getByText('Archived').getAttribute('data-variant')).toBe('muted');
    expect(container.querySelector('ng-icon')).toBeNull();
  });

  it('a past Booked is muted with hidden "(past)" text and never says Completed', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'Booked', isPast: true } });
    const badge = screen.getByText('Booked', { exact: false });
    expect(badge.getAttribute('data-variant')).toBe('muted');
    expect(badge.textContent).toContain('(past)');
    expect(screen.queryByText(/completed/i)).toBeNull();
  });

  it('Completed and NoShow ignore the past flag', async () => {
    await render(AppointmentStatusBadge, { inputs: { status: 'Completed', isPast: true } });
    expect(screen.getByText('Completed').getAttribute('data-variant')).toBe('success');
    expect(screen.queryByText('(past)')).toBeNull();
  });
});
