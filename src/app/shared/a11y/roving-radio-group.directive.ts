import {
  Directive,
  ElementRef,
  computed,
  contentChildren,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * A radio group with a roving tabindex (WAI-ARIA radio pattern): one tab stop, arrows move
 * focus and select across every descendant item in DOM order (wrapping), Home and End jump to
 * the ends, Space and Enter select. An item with `radioDisabled` stays in the order and stays
 * focusable but is never selected. The group does not own the selection: it emits `selected`
 * and the parent sets `[checked]` on the items.
 */
@Directive({
  selector: '[appRadioGroup]',
  host: {
    role: 'radiogroup',
    '[attr.aria-label]': 'label() || null',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class RovingRadioGroupDirective {
  /** The accessible name of the group: `[appRadioGroup]="'Branch'"`. */
  readonly label = input('', { alias: 'appRadioGroup' });
  readonly selected = output<string>();
  /**
   * WAI-ARIA moves selection with the arrow keys. A group whose selection leaves the page (the
   * branch and service cards navigate to the next step) sets this to false: arrows then only
   * move focus and Space or Enter select, so an arrow key never changes the context (WCAG 3.2.2).
   */
  readonly selectOnMove = input(true);

  readonly items = contentChildren(
    forwardRef(() => RadioItemDirective),
    { descendants: true },
  );
  private readonly active = signal<string | null>(null);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The value of the item that is the single tab stop. */
  readonly tabStop = computed(() => {
    const items = this.items();
    const active = this.active();
    if (active !== null && items.some((i) => i.value() === active)) return active;
    const checked = items.find((i) => i.checked());
    if (checked) return checked.value();
    return (items.find((i) => !i.radioDisabled()) ?? items[0])?.value() ?? null;
  });

  /** @internal */
  select(item: RadioItemDirective): void {
    if (!item.radioDisabled()) this.selected.emit(item.value());
  }

  /** @internal */
  focusItem(item: RadioItemDirective): void {
    this.active.set(item.value());
  }

  /** @internal */
  onKey(event: KeyboardEvent, item: RadioItemDirective): void {
    const items = this.items();
    const index = items.indexOf(item);
    let target: RadioItemDirective | undefined;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = items[(index + 1) % items.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        target = items[(index - 1 + items.length) % items.length];
        break;
      case 'Home':
        target = items[0];
        break;
      case 'End':
        target = items[items.length - 1];
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.select(item);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!target) return;
    this.active.set(target.value());
    target.focus();
    if (this.selectOnMove()) this.select(target);
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.active.set(null);
  }
}

@Directive({
  selector: '[appRadioItem]',
  host: {
    role: 'radio',
    '[attr.aria-checked]': 'checked()',
    '[attr.aria-disabled]': 'radioDisabled() ? "true" : null',
    '[attr.tabindex]': 'tabindex()',
    '(click)': 'onClick()',
    '(keydown)': 'onKey($event)',
    '(focus)': 'onFocus()',
  },
})
export class RadioItemDirective {
  /** The item value: `[appRadioItem]="branch.id"`. */
  readonly value = input.required<string>({ alias: 'appRadioItem' });
  readonly checked = input(false);
  readonly radioDisabled = input(false);

  protected readonly group = inject(RovingRadioGroupDirective);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tabindex = computed(() => (this.group.tabStop() === this.value() ? 0 : -1));

  protected onClick(): void {
    this.group.select(this);
  }

  protected onKey(event: KeyboardEvent): void {
    this.group.onKey(event, this);
  }

  protected onFocus(): void {
    this.group.focusItem(this);
  }

  focus(): void {
    this.el.nativeElement.focus();
  }
}
