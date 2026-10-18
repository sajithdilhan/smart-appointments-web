import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

let nextId = 0;

/**
 * The side panel chrome of the create and edit drawers: a modal dialog (`aria-modal`, focus
 * trapped) fixed to the right edge, full width below 640 px. It is open for as long as it exists.
 * Escape, the backdrop and the Close button only emit `closeRequested`; the owner turns that into
 * a router navigation, so the unsaved-changes guard decides and a stray Escape cannot lose work.
 * Transitions are `motion-safe:` only, so reduced motion disables them.
 */
@Component({
  selector: 'app-drawer-frame',
  imports: [CdkTrapFocus, NgIcon],
  providers: [provideIcons({ lucideX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50" role="presentation" (keydown.escape)="onEscape($event)">
      <div
        class="absolute inset-0 bg-black/50 motion-safe:animate-in motion-safe:duration-200 motion-safe:fade-in-0"
        aria-hidden="true"
        (click)="closeRequested.emit()"
      ></div>
      <div
        #panel
        cdkTrapFocus
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        class="absolute inset-y-0 right-0 flex w-full flex-col bg-popover text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:duration-200 motion-safe:slide-in-from-right sm:max-w-md"
      >
        <header class="flex items-start justify-between gap-2 border-b p-4">
          <h2 [id]="titleId" class="text-lg font-semibold">{{ title() }}</h2>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Close"
            (click)="closeRequested.emit()"
          >
            <ng-icon name="lucideX" size="18" aria-hidden="true" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto p-4"><ng-content /></div>
      </div>
    </div>
  `,
})
export class DrawerFrame {
  readonly title = input.required<string>();
  readonly closeRequested = output<void>();
  protected readonly titleId = `drawer-title-${nextId++}`;
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  constructor() {
    afterNextRender(() => this.focusFirst());
  }

  /**
   * Moves focus to the first editable field, else the Close button. Owners whose content appears
   * later (a record being loaded) call it again.
   */
  focusFirst(): void {
    const root = this.panel().nativeElement;
    const field = root.querySelector<HTMLElement>(
      '[data-autofocus], input:not([readonly]):not([disabled]):not([type="hidden"]), textarea:not([readonly]):not([disabled]), select:not([disabled])',
    );
    (field ?? root.querySelector<HTMLElement>('button'))?.focus();
  }

  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return; // a combobox popup consumed it
    event.stopPropagation();
    this.closeRequested.emit();
  }
}
