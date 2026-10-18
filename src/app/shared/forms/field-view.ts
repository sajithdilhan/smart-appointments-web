import { DestroyRef, inject, Signal, WritableSignal, computed } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, ValidationErrors } from '@angular/forms';
import { map, startWith } from 'rxjs';

export interface ControlState {
  readonly touched: boolean;
  readonly invalid: boolean;
  readonly errors: ValidationErrors | null;
}

export interface FieldView {
  readonly id: string;
  /** The visible message, or null. */
  readonly error: Signal<string | null>;
  /** Space-joined ids for `aria-describedby`: extras, then the hint, then the error. */
  readonly describedBy: Signal<string | null>;
}

export interface FieldViewOptions {
  readonly id: string;
  readonly control: AbstractControl;
  /** Error key to message. */
  readonly messages: Record<string, string>;
  readonly submitAttempted: Signal<boolean>;
  /** A server-side error; it wins over the client error and clears when the value changes. */
  readonly serverError?: WritableSignal<string | null>;
  readonly hint?: boolean;
  /** Ids of other elements that describe the field, e.g. the password checklist. */
  readonly extraDescribedBy?: readonly string[];
}

const FALLBACK_MESSAGE = 'Enter a valid value.';

/**
 * The control's touched/invalid state as a signal. Reactive forms do not notify a zoneless
 * OnPush view, but the unified `events` stream (value, status, touched) wrapped in a signal does.
 * Needs an injection context.
 */
export function controlState(control: AbstractControl): Signal<ControlState> {
  const snapshot = (): ControlState => ({
    touched: control.touched,
    invalid: control.invalid,
    errors: control.errors,
  });
  return toSignal(control.events.pipe(startWith(null), map(snapshot)), {
    initialValue: snapshot(),
  });
}

/** Builds the view shared by a field's a11y directive and its form-field wrapper. */
export function createFieldView(opts: FieldViewOptions): FieldView {
  const state = controlState(opts.control);
  const { serverError } = opts;

  if (serverError) {
    opts.control.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => serverError.set(null));
  }

  const error = computed<string | null>(() => {
    const server = serverError?.() ?? null;
    if (server) return server;
    const s = state();
    if (!(s.touched || opts.submitAttempted()) || !s.invalid) return null;
    const key = s.errors ? Object.keys(s.errors)[0] : undefined;
    return (key !== undefined ? opts.messages[key] : undefined) ?? FALLBACK_MESSAGE;
  });

  const describedBy = computed<string | null>(() => {
    const ids = [...(opts.extraDescribedBy ?? [])];
    if (opts.hint) ids.push(`${opts.id}-hint`);
    if (error()) ids.push(`${opts.id}-error`);
    return ids.length > 0 ? ids.join(' ') : null;
  });

  return { id: opts.id, error, describedBy };
}
