import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  type Signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { HlmInput } from '@app/shared/ui/input';
import { fromEpochMs } from '../../../core/time';
import { CLOCK } from '../../../core/util/clock';
import { createListbox } from '../shared/listbox/create-listbox';
import { optionId } from '../shared/listbox/listbox-aria';
import {
  browserZoneOption,
  buildZoneOptions,
  filterZones,
  zoneLabel,
  type ZoneOption,
} from './zone-options';

/**
 * The time-zone picker: a WAI-ARIA combobox with a listbox popup. Only list members are accepted
 * (the value changes on selecting an option, never from typing alone). Focus stays on the input.
 * The option list is built on first open and shared for the page.
 */
@Component({
  selector: 'app-time-zone-combobox',
  imports: [HlmInput],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimeZoneCombobox),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <input
      hlmInput
      type="text"
      role="combobox"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      aria-autocomplete="list"
      [attr.id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.aria-expanded]="box.open()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="box.open() ? box.activeId() : null"
      [disabled]="disabled()"
      [value]="box.open() ? box.query() : display()"
      (input)="onType($any($event.target).value)"
      (focus)="onFocus()"
      (blur)="onBlur()"
      (keydown)="onKeydown($event)"
    />
    @if (box.open()) {
      <ul
        role="listbox"
        [id]="listId"
        aria-label="Time zones"
        class="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
      >
        @for (item of results().items; track item.id + ($index === 0 && item.browser ? 'b' : '')) {
          <!-- Focus stays on the input (aria-activedescendant); the keyboard acts there. -->
          <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
          <li
            role="option"
            [id]="optionId($index)"
            [attr.aria-selected]="$index === box.activeIndex()"
            class="cursor-pointer border-l-2 border-transparent px-3 py-2 text-sm aria-selected:border-primary aria-selected:bg-accent"
            (mousedown)="$event.preventDefault()"
            (mouseenter)="box.setActive($index)"
            (click)="box.select($index)"
          >
            {{ item.label }}
          </li>
        } @empty {
          <li role="presentation" class="px-3 py-2 text-sm text-muted-foreground">
            No matching time zones
          </li>
        }
      </ul>
      @if (results().truncated) {
        <p role="status" class="mt-1 text-xs text-muted-foreground">
          Keep typing to narrow the list
        </p>
      }
    }
  `,
})
export class TimeZoneCombobox implements ControlValueAccessor {
  private static nextId = 0;
  private readonly clock = inject(CLOCK);

  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string>('Time zone');
  readonly describedBy = input<string | null>(null);
  readonly invalid = input(false);

  protected readonly listId = `tz-list-${TimeZoneCombobox.nextId++}`;
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private all: ZoneOption[] | null = null;
  private readonly now = () => fromEpochMs(this.clock.now());
  /** Bumped when the option list is first built, so the filter recomputes. */
  private readonly built = signal(false);

  protected readonly results: Signal<{ items: ZoneOption[]; truncated: boolean }> = computed(() => {
    if (!this.built()) return { items: [] as ZoneOption[], truncated: false };
    const base = this.all ?? [];
    const browser = this.value() === '' ? browserZoneOption(this.now()) : null;
    return filterZones(browser ? [browser, ...base] : base, this.box.query());
  });

  protected readonly box = createListbox<ZoneOption>({
    items: computed(() => this.results().items),
    idPrefix: this.listId,
  });

  /** The closed input shows the zone and its offset. */
  protected readonly display = computed(() =>
    this.value() ? zoneLabel(this.value(), this.now()) : '',
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.box.selected.subscribe((option) => {
      this.value.set(option.id);
      this.onChange(option.id);
      this.close();
    });
  }

  protected optionId(index: number): string {
    return optionId(this.listId, index);
  }

  private ensureOptions(): void {
    if (!this.all) {
      this.all = buildZoneOptions(this.now());
      this.built.set(true);
    }
  }

  private open(): void {
    this.ensureOptions();
    this.box.open.set(true);
  }

  private close(): void {
    this.box.open.set(false);
    this.box.query.set('');
  }

  protected onFocus(): void {
    // Opening on focus would hide the field's value; the list opens on typing or the arrow keys.
  }

  protected onType(text: string): void {
    this.open();
    this.box.query.set(text);
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (!this.box.open() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) this.ensureOptions();
    const wasOpen = this.box.open();
    this.box.onKeydown(e);
    if (wasOpen && e.key === 'Escape') this.close();
  }

  protected onBlur(): void {
    this.close();
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
