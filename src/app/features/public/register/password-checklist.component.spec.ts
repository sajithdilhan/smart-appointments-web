import { render, screen } from '@testing-library/angular';
import { evaluatePasswordRules } from '../validation/password-rules';
import { PasswordChecklistComponent } from './password-checklist.component';

const setup = (password: string) =>
  render(PasswordChecklistComponent, {
    inputs: { results: evaluatePasswordRules(password), id: 'pw-rules' },
  });

describe('PasswordChecklistComponent', () => {
  it('lists the five rules under the given id and is not a live region', async () => {
    const { container } = await setup('');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    const list = container.querySelector('ul')!;
    expect(list.id).toBe('pw-rules');
    expect(list.getAttribute('aria-live')).toBeNull();
    expect(list.getAttribute('role')).toBeNull();
  });

  it.each([
    ['A', 'One uppercase letter'],
    ['a', 'One lowercase letter'],
    ['1', 'One digit'],
    ['!', 'One special character'],
    ['abcdefgh', 'At least 8 characters'],
  ])('%j meets the rule "%s"', async (password, label) => {
    await setup(password);
    const item = screen.getAllByRole('listitem').find((li) => li.textContent?.includes(label))!;
    expect(item.textContent).toContain(', met');
    expect(item.textContent).not.toContain('not met');
  });

  it('an underscore alone leaves the special rule unmet', async () => {
    await setup('_');
    const item = screen
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('special character'))!;
    expect(item.textContent).toContain(', not met');
  });

  it('writes the polite status text only when every rule is met', async () => {
    const { rerender } = await setup('Abc1');
    expect(screen.getByRole('status').textContent).toBe('');
    await rerender({ inputs: { results: evaluatePasswordRules('Abcdefg1!'), id: 'pw-rules' } });
    expect(screen.getAllByText('All password requirements met')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('All password requirements met');
    await rerender({ inputs: { results: evaluatePasswordRules('Abcdefg1'), id: 'pw-rules' } });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('takes booleans and labels only: the result type has no password field', async () => {
    const results = evaluatePasswordRules('Secret1!');
    expect(results.every((r) => Object.keys(r).sort().join() === 'id,label,met')).toBe(true);
    expect(JSON.stringify(results)).not.toContain('Secret1!');
  });
});
