import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { StepId } from '../steps';
import { StepIndicatorComponent } from './step-indicator.component';

function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('640px') ? wide : false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function setup(step: StepId, wide = true, disabled = false) {
  stubViewport(wide);
  const goTo = vi.fn();
  await render(StepIndicatorComponent, { inputs: { step, disabled }, on: { goTo } });
  return goTo;
}

const items = () => screen.getAllByRole('listitem');
const circle = (n: string) => screen.getByText(n).parentElement!;
const text = (li: HTMLElement) =>
  [...li.querySelectorAll('.sr-only')].map((e) => e.textContent).join(' ');

describe('StepIndicator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is an ordered list named "Booking progress" with the four steps in order', async () => {
    await setup('datetime');
    const list = screen.getByRole('list', { name: 'Booking progress' });
    expect(list.tagName).toBe('OL');
    expect(items().map(text)).toEqual([
      '1. Branch Completed',
      '2. Service Completed',
      '3. Date and time',
      '4. Review',
    ]);
  });

  it('marks only the current step with aria-current="step", shown as a filled circle', async () => {
    await setup('service');
    const current = items().filter((li) => li.hasAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(text(current[0])).toBe('2. Service');
    expect(current[0]).toHaveAttribute('aria-current', 'step');
    expect(circle('2')).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('shows later steps muted and without a check', async () => {
    await setup('service');
    expect(circle('3')).toHaveClass('text-muted-foreground');
    expect(circle('4')).toHaveClass('text-muted-foreground');
    expect(items()[2].querySelector('svg')).toBeNull();
  });

  it('shows a check and an sr-only "Completed" for each earlier step', async () => {
    await setup('review');
    for (const li of items().slice(0, 3)) {
      expect(li.querySelector('svg')).not.toBeNull();
      expect(li).toHaveTextContent(/completed/i);
    }
    expect(items()[3].querySelector('svg')).toBeNull();
  });

  it('makes earlier steps buttons and later ones plain text', async () => {
    const goTo = await setup('review');
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-describedby'))).toEqual([
      'step-done-branch',
      'step-done-service',
      'step-done-datetime',
    ]);
    expect(screen.getByRole('button', { name: '1. Branch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3. Date and time' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '2. Service' }));
    expect(goTo).toHaveBeenCalledWith('service');
  });

  it('has no buttons on the first step', async () => {
    await setup('branch');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('disables the earlier steps while disabled', async () => {
    await setup('review', true, true);
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('shows all four steps completed and no buttons on success', async () => {
    await setup('success');
    expect(items().map(text)).toEqual([
      '1. Branch (completed)',
      '2. Service (completed)',
      '3. Date and time (completed)',
      '4. Review (completed)',
    ]);
    expect(items().filter((li) => li.hasAttribute('aria-current'))).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows "Step N of 4: name" instead of the list under 640 px', async () => {
    await setup('datetime', false);
    expect(screen.getByText('Step 3 of 4: Date and time')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows "Booked" under 640 px on success', async () => {
    await setup('success', false);
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
