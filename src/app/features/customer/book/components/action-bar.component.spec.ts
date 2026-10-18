import { Component } from '@angular/core';
import { render, within } from '@testing-library/angular';
import { ActionBarComponent } from './action-bar.component';

@Component({
  imports: [ActionBarComponent],
  template: `
    <app-action-bar>
      <button type="button">Back</button>
      <button type="button">Continue</button>
    </app-action-bar>
  `,
})
class Host {}

describe('ActionBarComponent', () => {
  it('projects the step actions in order', async () => {
    const view = await render(Host);
    const buttons = within(view.container).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Back', 'Continue']);
  });

  it('sticks above the F1 bottom tab bar on narrow screens and sits in the flow from md', async () => {
    const view = await render(Host);
    const bar = view.container.querySelector('app-action-bar')!;
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('bottom-[calc(3.5rem+env(safe-area-inset-bottom))]');
    expect(bar.className).toContain('md:static');
  });
});
