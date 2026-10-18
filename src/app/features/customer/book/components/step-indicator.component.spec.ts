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

async function setup(step: StepId, wide = true) {
  stubViewport(wide);
  const goTo = vi.fn();
  await render(StepIndicatorComponent, { inputs: { step }, on: { goTo } });
  return goTo;
}

describe('StepIndicator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is an ordered list named "Booking progress" with the steps in order', async () => {
    await setup('datetime');
    const list = screen.getByRole('list', { name: 'Booking progress' });
    expect(list.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.trim())).toEqual([
      '1. Branch',
      '2. Service',
      '3. Date and time',
      '4. Review',
    ]);
  });

  it('marks only the current step with aria-current="step"', async () => {
    await setup('service');
    const current = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('2. Service');
    expect(current[0]).toHaveAttribute('aria-current', 'step');
  });

  it('makes earlier steps buttons and later ones plain text', async () => {
    const goTo = await setup('review');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual([
      '1. Branch',
      '2. Service',
      '3. Date and time',
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: '2. Service' }));
    expect(goTo).toHaveBeenCalledWith('service');
  });

  it('first step has no buttons; the unreachable steps are not interactive', async () => {
    await setup('branch');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows "Step N of 4: name" instead of the list under 640 px', async () => {
    await setup('datetime', false);
    expect(screen.getByText('Step 3 of 4: Date and time')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows "Booked" on success in both layouts', async () => {
    await setup('success');
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
