import {
  computed,
  linkedSignal,
  OutputEmitterRef,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { optionId } from './listbox-aria';

export interface Listbox<T> {
  readonly query: WritableSignal<string>;
  readonly open: WritableSignal<boolean>;
  /** Supplied by the caller's filter. */
  readonly items: Signal<readonly T[]>;
  /** -1 when there is none; resets to 0 whenever `items` changes. */
  readonly activeIndex: Signal<number>;
  /** `${idPrefix}-opt-${index}` for `aria-activedescendant`, or null. */
  readonly activeId: Signal<string | null>;
  /**
   * Keyboard behaviour for the combobox input; returns true (after `preventDefault`) when the key
   * was handled. ArrowDown and ArrowUp open a closed list; every other key acts only while open.
   */
  onKeydown(e: KeyboardEvent): boolean;
  /** Sets the highlight (e.g. on pointer hover). Ignored for an out-of-range index. */
  setActive(index: number): void;
  /** Emits `selected` with the item at `index`. Closing is the caller's decision. */
  select(index: number): void;
  readonly selected: OutputEmitterRef<T>;
}

const PAGE = 10;

/**
 * The headless engine behind both comboboxes (time zone, command palette): query, items, active
 * index and the keyboard. Focus never leaves the input; the host binds `activeId` to
 * `aria-activedescendant`. Call it in an injection context.
 */
export function createListbox<T>(opts: {
  items: Signal<readonly T[]>;
  idPrefix: string;
  wrap?: boolean;
}): Listbox<T> {
  const wrap = opts.wrap ?? true;
  const query = signal('');
  const open = signal(false);
  const selected = new OutputEmitterRef<T>();
  const index = linkedSignal<readonly T[], number>({
    source: opts.items,
    computation: (items) => (items.length > 0 ? 0 : -1),
  });
  const activeId = computed(() => (index() >= 0 ? optionId(opts.idPrefix, index()) : null));

  const move = (delta: number): void => {
    const count = opts.items().length;
    if (count === 0) return;
    const next = index() + delta;
    index.set(wrap ? (next + count) % count : Math.min(count - 1, Math.max(0, next)));
  };

  const select = (i: number): void => {
    const item = opts.items()[i];
    if (item !== undefined) selected.emit(item);
  };

  const handled = (e: KeyboardEvent): true => {
    e.preventDefault();
    return true;
  };

  return {
    query,
    open,
    items: opts.items,
    activeIndex: index.asReadonly(),
    activeId,
    selected,
    select,
    setActive(i) {
      if (i >= 0 && i < opts.items().length) index.set(i);
    },
    onKeydown(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return false;
      const count = opts.items().length;
      if (!open()) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          open.set(true);
          return handled(e);
        }
        return false;
      }
      switch (e.key) {
        case 'ArrowDown':
          move(1);
          return handled(e);
        case 'ArrowUp':
          move(-1);
          return handled(e);
        case 'Home':
          if (count > 0) index.set(0);
          return handled(e);
        case 'End':
          if (count > 0) index.set(count - 1);
          return handled(e);
        case 'PageDown':
          if (count > 0) index.set(Math.min(count - 1, index() + PAGE));
          return handled(e);
        case 'PageUp':
          if (count > 0) index.set(Math.max(0, index() - PAGE));
          return handled(e);
        case 'Enter':
          if (index() < 0) return false;
          select(index());
          return handled(e);
        case 'Escape':
          open.set(false);
          return handled(e);
        default:
          return false;
      }
    },
  };
}
