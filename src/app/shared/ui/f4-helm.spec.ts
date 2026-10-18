import { ChangeDetectionStrategy, Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { HlmAlertDialogImports } from '@app/shared/ui/alert-dialog';
import { HlmBadgeImports } from '@app/shared/ui/badge';
import { HlmRadioGroupImports } from '@app/shared/ui/radio-group';
import { HlmSkeleton } from '@app/shared/ui/skeleton';
import { HlmSwitchImports } from '@app/shared/ui/switch';

// Smoke renders of the helm components F4 uses: they mount and expose the roles and
// variants the feature relies on.

@Component({
  selector: 'app-badge-host',
  imports: [HlmBadgeImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span hlmBadge>Booked</span>
    <span hlmBadge variant="secondary">Cancelled</span>
    <span hlmBadge variant="outline">Other</span>
    <span hlmBadge variant="success">Active</span>
    <span hlmBadge variant="muted">Inactive</span>
  `,
})
class BadgeHost {}

@Component({
  selector: 'app-skeleton-host',
  imports: [HlmSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div hlmSkeleton data-testid="sk"></div>`,
})
class SkeletonHost {}

@Component({
  selector: 'app-switch-host',
  imports: [HlmSwitchImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<hlm-switch aria-label="Show cancelled" />`,
})
class SwitchHost {}

@Component({
  selector: 'app-radio-host',
  imports: [HlmRadioGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-radio-group aria-label="Theme" value="light">
      <hlm-radio value="system" aria-label="System"><hlm-radio-indicator indicator /></hlm-radio>
      <hlm-radio value="light" aria-label="Light"><hlm-radio-indicator indicator /></hlm-radio>
      <hlm-radio value="dark" aria-label="Dark"><hlm-radio-indicator indicator /></hlm-radio>
    </hlm-radio-group>
  `,
})
class RadioHost {}

@Component({
  selector: 'app-dialog-host',
  imports: [HlmAlertDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-alert-dialog>
      <button hlmAlertDialogTrigger>Open</button>
      <hlm-alert-dialog-content *hlmAlertDialogPortal="let ctx">
        <hlm-alert-dialog-header>
          <h2 hlmAlertDialogTitle>Cancel this appointment?</h2>
          <p hlmAlertDialogDescription>Details here.</p>
        </hlm-alert-dialog-header>
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel>Keep appointment</button>
          <button hlmAlertDialogAction>Cancel appointment</button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
class DialogHost {}

describe('helm components used by F4', () => {
  it('badge renders its variants with their text', async () => {
    await render(BadgeHost);
    for (const [text, variant] of [
      ['Booked', 'default'],
      ['Cancelled', 'secondary'],
      ['Other', 'outline'],
      ['Active', 'success'],
      ['Inactive', 'muted'],
    ]) {
      expect(screen.getByText(text).getAttribute('data-variant')).toBe(variant);
    }
    expect(screen.getByText('Active').className).toContain('bg-success-soft');
    expect(screen.getByText('Inactive').className).toContain('bg-muted');
  });

  it('skeleton is a block that pulses only when motion is allowed', async () => {
    await render(SkeletonHost);
    const el = screen.getByTestId('sk');
    expect(el.getAttribute('data-slot')).toBe('skeleton');
    expect(el.className).toContain('motion-safe:animate-pulse');
  });

  it('switch is a named switch that toggles', async () => {
    const user = userEvent.setup();
    await render(SwitchHost);
    const toggle = screen.getByRole('switch', { name: 'Show cancelled' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('radio group exposes named radios with the bound value checked', async () => {
    const user = userEvent.setup();
    await render(RadioHost);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
  });

  it('alert dialog opens as an alertdialog with its title and actions, and closes on Keep', async () => {
    const user = userEvent.setup();
    await render(DialogHost);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Cancel this appointment?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel appointment' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep appointment' }));
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
