import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { RadioItemDirective, RovingRadioGroupDirective } from './roving-radio-group.directive';

@Component({
  selector: 'app-host',
  imports: [RovingRadioGroupDirective, RadioItemDirective],
  template: `
    <div [appRadioGroup]="'Times'" (selected)="choose($event)">
      <section>
        <button type="button" [appRadioItem]="'a'" [checked]="value() === 'a'">A</button>
        <button type="button" [appRadioItem]="'b'" [checked]="value() === 'b'">B</button>
      </section>
      <section>
        <button
          type="button"
          [appRadioItem]="'c'"
          [checked]="value() === 'c'"
          [radioDisabled]="true"
        >
          C
        </button>
        <button type="button" [appRadioItem]="'d'" [checked]="value() === 'd'">D</button>
      </section>
    </div>
    <button type="button">after</button>
  `,
})
class HostComponent {
  readonly value = signal<string | null>(null);
  readonly picks: string[] = [];
  choose(v: string) {
    this.picks.push(v);
    this.value.set(v);
  }
}

async function setup(initial: string | null = null) {
  const view = await render(HostComponent);
  if (initial) {
    view.fixture.componentInstance.value.set(initial);
    view.detectChanges();
  }
  return { ...view, host: view.fixture.componentInstance };
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('roving radio group', () => {
  it('exposes a labelled radiogroup of radios with aria-checked', async () => {
    await setup('b');
    expect(screen.getByRole('radiogroup', { name: 'Times' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(radio('B')).toHaveAttribute('aria-checked', 'true');
    expect(radio('A')).toHaveAttribute('aria-checked', 'false');
  });

  it('has one tab stop: the first enabled item when nothing is checked', async () => {
    await setup();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
    ]);
  });

  it('puts the tab stop on the checked item', async () => {
    await setup('d');
    expect(radio('D')).toHaveAttribute('tabindex', '0');
    expect(radio('A')).toHaveAttribute('tabindex', '-1');
  });

  it('Tab enters on the tab stop and leaves the group in one press', async () => {
    const user = userEvent.setup();
    await setup('b');
    await user.tab();
    expect(radio('B')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('arrows move focus and select, wrapping across sections', async () => {
    const user = userEvent.setup();
    const { host } = await setup('a');
    radio('A').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('B')).toHaveFocus();
    expect(host.value()).toBe('b');
    await user.keyboard('{ArrowDown}');
    expect(radio('C')).toHaveFocus();
    expect(host.value()).toBe('b'); // a disabled item is focused but not selected
    await user.keyboard('{ArrowRight}');
    expect(radio('D')).toHaveFocus();
    expect(host.value()).toBe('d');
    await user.keyboard('{ArrowRight}');
    expect(radio('A')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(radio('D')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(radio('C')).toHaveFocus();
  });

  it('Home and End jump to the ends', async () => {
    const user = userEvent.setup();
    const { host } = await setup('b');
    radio('B').focus();
    await user.keyboard('{End}');
    expect(radio('D')).toHaveFocus();
    expect(host.value()).toBe('d');
    await user.keyboard('{Home}');
    expect(radio('A')).toHaveFocus();
    expect(host.value()).toBe('a');
  });

  it('selects with Space and Enter and on click', async () => {
    const user = userEvent.setup();
    const { host } = await setup();
    radio('B').focus();
    await user.keyboard(' ');
    expect(host.picks).toEqual(['b']);
    radio('D').focus();
    await user.keyboard('{Enter}');
    expect(host.picks).toEqual(['b', 'd']);
    await user.click(radio('A'));
    expect(host.picks).toEqual(['b', 'd', 'a']);
  });

  it('a disabled item is aria-disabled, focusable and never selected', async () => {
    const user = userEvent.setup();
    const { host } = await setup();
    const c = radio('C');
    expect(c).toHaveAttribute('aria-disabled', 'true');
    expect(radio('A')).not.toHaveAttribute('aria-disabled');
    await user.click(c);
    c.focus();
    expect(c).toHaveFocus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(host.picks).toEqual([]);
  });

  it('the tab stop follows focus while no item is checked', async () => {
    const user = userEvent.setup();
    const { detectChanges } = await setup();
    radio('C').focus();
    detectChanges();
    expect(radio('C')).toHaveAttribute('tabindex', '0');
    expect(radio('A')).toHaveAttribute('tabindex', '-1');
    await user.tab();
    detectChanges();
    expect(radio('A')).toHaveAttribute('tabindex', '0');
  });
});
