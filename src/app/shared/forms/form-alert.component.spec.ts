import { render, screen } from '@testing-library/angular';
import { FormAlertComponent } from './form-alert.component';

describe('FormAlertComponent', () => {
  it('is an alert region for errors', async () => {
    await render(FormAlertComponent, { inputs: { tone: 'error', message: 'Bad' } });
    expect(screen.getByRole('alert').textContent).toContain('Bad');
  });

  it('is a status region for info', async () => {
    await render(FormAlertComponent, { inputs: { tone: 'info', message: 'Note' } });
    expect(screen.getByRole('status').textContent).toContain('Note');
  });

  it('keeps the region in the DOM when empty', async () => {
    await render(FormAlertComponent, { inputs: { tone: 'error', message: null } });
    expect(screen.getByRole('alert').textContent?.trim()).toBe('');
  });

  it('does not duplicate the message on a re-render with the same text', async () => {
    const { rerender } = await render(FormAlertComponent, {
      inputs: { tone: 'error', message: 'Same' },
    });
    await rerender({ inputs: { tone: 'error', message: 'Same' } });
    expect(screen.getAllByText('Same')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('shows the reference line and can take focus', async () => {
    const { fixture } = await render(FormAlertComponent, {
      inputs: { message: 'Oops', reference: 'abc-123' },
    });
    expect(screen.getByText('Reference: abc-123')).toBeTruthy();
    fixture.componentInstance.focus();
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  });
});
