import { render, screen } from '@testing-library/angular';
import { BrandMark } from './brand-mark';

describe('BrandMark', () => {
  it('renders the wordmark and a hidden icon', async () => {
    const { container } = await render(BrandMark);
    expect(screen.getByText('Smart Appointments').className).not.toContain('sr-only');
    expect(container.querySelector('ng-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps the wordmark for assistive technology when compact', async () => {
    await render(BrandMark, { inputs: { compact: true } });
    expect(screen.getByText('Smart Appointments').className).toContain('sr-only');
  });

  it('hides the wordmark visually below sm but keeps it readable with collapseOnPhone', async () => {
    await render(BrandMark, { inputs: { collapseOnPhone: true } });
    expect(screen.getByText('Smart Appointments').className).toContain('max-sm:sr-only');
  });
});
