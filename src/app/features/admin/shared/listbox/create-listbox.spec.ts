import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createListbox } from './create-listbox';

function setup(initial: string[], wrap?: boolean) {
  const items = signal<readonly string[]>(initial);
  const box = TestBed.runInInjectionContext(() =>
    createListbox<string>({ items, idPrefix: 'zone', wrap }),
  );
  const chosen: string[] = [];
  box.selected.subscribe((v) => chosen.push(v));
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
    const handled = box.onKeydown(e);
    return { handled, prevented: e.defaultPrevented };
  };
  return { items, box, chosen, press };
}

const FIVE = ['a', 'b', 'c', 'd', 'e'];

describe('createListbox', () => {
  it('starts closed with the first item active and an option id for aria-activedescendant', () => {
    const { box } = setup(FIVE);
    expect(box.open()).toBe(false);
    expect(box.activeIndex()).toBe(0);
    expect(box.activeId()).toBe('zone-opt-0');
    expect(box.query()).toBe('');
  });

  it('has no active option when empty', () => {
    const { box } = setup([]);
    expect(box.activeIndex()).toBe(-1);
    expect(box.activeId()).toBeNull();
  });

  it('ArrowDown and ArrowUp open a closed list without moving', () => {
    const { box, press } = setup(FIVE);
    expect(press('ArrowDown')).toEqual({ handled: true, prevented: true });
    expect(box.open()).toBe(true);
    expect(box.activeIndex()).toBe(0);
    box.open.set(false);
    press('ArrowUp');
    expect(box.open()).toBe(true);
    expect(box.activeIndex()).toBe(0);
  });

  it('other keys do nothing while closed', () => {
    const { press, chosen } = setup(FIVE);
    for (const key of ['Home', 'End', 'Enter', 'Escape', 'PageDown', 'a']) {
      expect(press(key)).toEqual({ handled: false, prevented: false });
    }
    expect(chosen).toEqual([]);
  });

  it.each([
    ['ArrowDown', 0, 1],
    ['ArrowDown', 4, 0], // wraps
    ['ArrowUp', 0, 4], // wraps
    ['ArrowUp', 3, 2],
    ['Home', 3, 0],
    ['End', 1, 4],
    ['PageDown', 0, 4], // clamps (no wrap) with five items
    ['PageUp', 3, 0],
  ])('%s from %i lands on %i', (key, from, to) => {
    const { box, press } = setup(FIVE);
    box.open.set(true);
    box.setActive(from);
    expect(press(key).prevented).toBe(true);
    expect(box.activeIndex()).toBe(to);
    expect(box.activeId()).toBe(`zone-opt-${to}`);
  });

  it('PageDown and PageUp move by ten', () => {
    const many = Array.from({ length: 30 }, (_, i) => `i${i}`);
    const { box, press } = setup(many);
    box.open.set(true);
    press('PageDown');
    expect(box.activeIndex()).toBe(10);
    press('PageDown');
    press('PageDown');
    expect(box.activeIndex()).toBe(29);
    press('PageUp');
    expect(box.activeIndex()).toBe(19);
  });

  it('without wrap the ends stop', () => {
    const { box, press } = setup(FIVE, false);
    box.open.set(true);
    press('ArrowUp');
    expect(box.activeIndex()).toBe(0);
    box.setActive(4);
    press('ArrowDown');
    expect(box.activeIndex()).toBe(4);
  });

  it('Enter selects the active item', () => {
    const { box, press, chosen } = setup(FIVE);
    box.open.set(true);
    press('ArrowDown');
    expect(press('Enter')).toEqual({ handled: true, prevented: true });
    expect(chosen).toEqual(['b']);
  });

  it('Enter on an empty list is not handled', () => {
    const { box, press, chosen } = setup([]);
    box.open.set(true);
    expect(press('Enter')).toEqual({ handled: false, prevented: false });
    expect(chosen).toEqual([]);
  });

  it('empty list: arrows, Home and End are safe', () => {
    const { box, press } = setup([]);
    box.open.set(true);
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']) press(key);
    expect(box.activeIndex()).toBe(-1);
  });

  it('Escape closes', () => {
    const { box, press } = setup(FIVE);
    box.open.set(true);
    expect(press('Escape').prevented).toBe(true);
    expect(box.open()).toBe(false);
  });

  it('ignores chords with Ctrl, Meta or Alt and plain typing', () => {
    const { box, press } = setup(FIVE);
    box.open.set(true);
    expect(press('ArrowDown', { ctrlKey: true }).handled).toBe(false);
    expect(press('Home', { altKey: true }).handled).toBe(false);
    expect(press('x').handled).toBe(false);
    expect(box.activeIndex()).toBe(0);
  });

  it('resets the highlight to the first item when items change, and to -1 when none', () => {
    const { box, items } = setup(FIVE);
    box.setActive(3);
    items.set(['x', 'y']);
    expect(box.activeIndex()).toBe(0);
    box.setActive(1);
    items.set([]);
    expect(box.activeIndex()).toBe(-1);
    items.set(['z']);
    expect(box.activeIndex()).toBe(0);
  });

  it('select(i) emits and ignores out-of-range indexes; setActive ignores them too', () => {
    const { box, chosen } = setup(FIVE);
    box.select(2);
    box.select(9);
    box.select(-1);
    expect(chosen).toEqual(['c']);
    box.setActive(99);
    expect(box.activeIndex()).toBe(0);
  });
});
