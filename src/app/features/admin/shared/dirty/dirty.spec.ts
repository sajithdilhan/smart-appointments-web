import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ConfirmService } from '../../../../shared/ui/confirm-dialog';
import { registerBeforeUnload } from './before-unload';
import type { DirtyForm } from './dirty-form';
import { formSnapshot } from './form-snapshot';
import { unsavedChangesGuard } from './unsaved-changes.guard';

afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

function runGuard(form: DirtyForm) {
  return TestBed.runInInjectionContext(() =>
    unsavedChangesGuard(
      form,
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
      {} as RouterStateSnapshot,
    ),
  );
}

describe('unsavedChangesGuard', () => {
  it('lets a pristine form go without any dialog', () => {
    expect(runGuard({ isDirty: () => false })).toBe(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('blocks a dirty form until the admin discards, with Keep editing focused first', async () => {
    const outcome = runGuard({ isDirty: () => true }) as Promise<boolean>;
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Discard changes?');
    expect(dialog).toHaveTextContent('You have unsaved changes. They will be lost.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await outcome).toBe(true);
  });

  it('Keep editing vetoes the navigation', async () => {
    const outcome = runGuard({ isDirty: () => true }) as Promise<boolean>;
    await screen.findByRole('alertdialog');
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(await outcome).toBe(false);
  });

  it('two exits at once show one dialog and share the answer', async () => {
    const dirty = { isDirty: () => true };
    const a = runGuard(dirty) as Promise<boolean>;
    const b = runGuard(dirty) as Promise<boolean>;
    expect(a).toBe(b);
    await screen.findByRole('alertdialog');
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    TestBed.inject(ConfirmService).cancel();
    expect(await a).toBe(false);
  });
});

describe('registerBeforeUnload', () => {
  it('is registered only while dirty and removed when pristine and on destroy', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const count = (spy: typeof add) => spy.mock.calls.filter((c) => c[0] === 'beforeunload').length;
    const dirty = signal(false);
    TestBed.runInInjectionContext(() => registerBeforeUnload(dirty));
    TestBed.tick();
    expect(count(add)).toBe(0);

    dirty.set(true);
    TestBed.tick();
    expect(count(add)).toBe(1);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    dirty.set(false);
    TestBed.tick();
    expect(count(remove)).toBe(1);

    dirty.set(true);
    TestBed.tick();
    expect(count(add)).toBe(2);
    TestBed.resetTestingModule(); // destroys the owner
    expect(count(remove)).toBe(2);
    vi.restoreAllMocks();
  });
});

describe('formSnapshot', () => {
  it('ignores cosmetic differences: trimming, key order and named normalisers', () => {
    const normalisers = {
      code: (v: string) => v.toUpperCase(),
      phoneNumber: (v: string) => v.replace(/[\s-]/g, ''),
      opensAt: (v: string) => v.slice(0, 5),
    };
    const a = formSnapshot(
      { code: ' pg ', name: ' Kandy ', phoneNumber: '+1 415-555-0123' },
      normalisers,
    );
    const b = formSnapshot({ phoneNumber: '+14155550123', name: 'Kandy', code: 'PG' }, normalisers);
    expect(a).toBe(b);
    expect(formSnapshot({ opensAt: '09:00:00' }, normalisers)).toBe(
      formSnapshot({ opensAt: '09:00' }, normalisers),
    );
  });

  it('notices real changes, in nested arrays too', () => {
    const rows = (t: string) => ({ days: [{ day: 'Monday', open: true, opensAt: t }] });
    expect(formSnapshot(rows('09:00'))).not.toBe(formSnapshot(rows('09:05')));
    expect(formSnapshot({ n: 'a' })).not.toBe(formSnapshot({ n: 'b' }));
    expect(formSnapshot({ open: true })).not.toBe(formSnapshot({ open: false }));
  });

  it('reads a form control through getRawValue, including disabled controls', () => {
    const form = new FormGroup({
      name: new FormControl(' A '),
      locked: new FormControl({ value: 'x', disabled: true }),
    });
    expect(formSnapshot(form)).toBe(JSON.stringify({ locked: 'x', name: 'A' }));
  });
});
