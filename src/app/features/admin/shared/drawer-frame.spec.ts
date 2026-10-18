import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { DrawerFrame } from './drawer-frame.component';
import { restoreFocusOnDestroy } from './drawer-focus';

@Component({
  selector: 'app-host',
  imports: [DrawerFrame],
  template: `
    <h1 appFocusHeading tabindex="-1">Branches</h1>
    <button type="button" (click)="open = true">Open drawer</button>
    @if (open) {
      <app-drawer-frame title="New branch" (closeRequested)="requests = requests + 1">
        <label>Name <input /></label>
        <button type="button" (click)="open = false">Done</button>
      </app-drawer-frame>
    }
    <p data-testid="requests">{{ requests }}</p>
  `,
})
class Host {
  open = false;
  requests = 0;
}

@Component({ selector: 'app-focus-probe', template: `` })
class FocusProbe {
  constructor() {
    restoreFocusOnDestroy();
  }
}

@Component({
  imports: [FocusProbe],
  template: `
    <h1 appFocusHeading id="page-heading" tabindex="-1">Page</h1>
    <button type="button" (click)="show.set(true)">Opener</button>
    @if (show()) {
      <app-focus-probe />
    }
  `,
})
class ProbeHost {
  show = signal(false);
}

type ProbeView = Awaited<ReturnType<typeof render<ProbeHost>>>;
async function show(view: ProbeView) {
  view.fixture.componentInstance.show.set(true);
  await view.fixture.whenStable();
}
async function hide(view: ProbeView) {
  view.fixture.componentInstance.show.set(false);
  await view.fixture.whenStable();
}

async function openDrawer() {
  const view = await render(Host);
  await userEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
  return view;
}

describe('DrawerFrame', () => {
  it('is a modal dialog labelled by its heading, with focus on the first field', async () => {
    await openDrawer();
    const dialog = screen.getByRole('dialog', { name: 'New branch' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'New branch' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus());
  });

  it('traps focus: Tab and Shift+Tab wrap inside the dialog', async () => {
    await openDrawer();
    const field = screen.getByRole('textbox', { name: 'Name' });
    await waitFor(() => expect(field).toHaveFocus());
    // The CDK trap wraps with two sentinel anchors around the dialog (jsdom does not run them).
    const anchors = document.querySelectorAll('.cdk-focus-trap-anchor');
    expect(anchors).toHaveLength(2);
    expect(anchors[0].nextElementSibling).toBe(screen.getByRole('dialog'));
  });

  it('Escape, the backdrop and Close only emit closeRequested; the drawer stays open', async () => {
    await openDrawer();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('requests')).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('requests')).toHaveTextContent('2');
    const backdrop = document.querySelector<HTMLElement>('[aria-hidden="true"].absolute')!;
    await userEvent.click(backdrop);
    expect(screen.getByTestId('requests')).toHaveTextContent('3');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('ignores an Escape another control already handled', async () => {
    await openDrawer();
    const field = screen.getByRole('textbox', { name: 'Name' });
    field.addEventListener('keydown', (e) => e.preventDefault());
    await userEvent.type(field, '{Escape}');
    expect(screen.getByTestId('requests')).toHaveTextContent('0');
  });

  it('animates only under motion-safe, so reduced motion disables the transitions', async () => {
    await openDrawer();
    const panel = screen.getByRole('dialog');
    const classes = panel.className.split(/\s+/);
    expect(classes).toContain('motion-safe:animate-in');
    expect(classes).not.toContain('animate-in');
    expect(classes.some((c) => /^(slide-in|fade-in|duration)/.test(c))).toBe(false);
  });
});

describe('restoreFocusOnDestroy', () => {
  it('returns focus to the control that opened the drawer', async () => {
    const view = await render(ProbeHost);
    const opener = screen.getByRole('button', { name: 'Opener' });
    await userEvent.click(opener);
    expect(opener).toHaveFocus();
    screen.getByRole('heading').focus();
    await hide(view);
    expect(opener).toHaveFocus();
  });

  it('falls back to the page heading on a deep link (focus on body)', async () => {
    const view = await render(ProbeHost);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.body).toBe(document.activeElement);
    await show(view);
    await hide(view);
    expect(screen.getByRole('heading')).toHaveFocus();
    TestBed.resetTestingModule();
  });
});
