import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { HlmSwitchImports } from '@app/shared/ui/switch';
import type { AppointmentTab } from './tab-params';

const TABS: readonly { value: AppointmentTab; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

/**
 * ARIA tab list (roving tabindex; Left/Right wrap, Home/End jump) and the "Show cancelled"
 * switch, which exists only on Upcoming. It only reports choices: the page writes the URL.
 */
@Component({
  selector: 'app-appointment-tabs',
  imports: [HlmSwitchImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Appointments" class="inline-flex gap-1">
        @for (t of tabs; track t.value) {
          <button
            #tabButton
            type="button"
            role="tab"
            [id]="'appointments-tab-' + t.value"
            [attr.aria-selected]="tab() === t.value"
            [attr.aria-controls]="panelId()"
            [tabindex]="tab() === t.value ? 0 : -1"
            class="min-h-11 rounded-md px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring aria-selected:bg-primary aria-selected:text-primary-foreground"
            (click)="tabChange.emit(t.value)"
            (keydown)="onKeydown($event, $index)"
          >
            {{ t.label }}
          </button>
        }
      </div>
      @if (tab() === 'upcoming') {
        <div class="flex flex-col">
          <div class="flex items-center gap-2 text-sm font-medium">
            <hlm-switch
              inputId="show-cancelled-switch"
              [checked]="showCancelled()"
              aria-describedby="show-cancelled-hint"
              (checkedChange)="showCancelledChange.emit($event)"
            />
            <label for="show-cancelled-switch">Show cancelled</label>
          </div>
          <span id="show-cancelled-hint" class="text-xs text-muted-foreground">
            Also lists upcoming appointments you cancelled.
          </span>
        </div>
      }
    </div>
  `,
})
export class AppointmentTabs {
  readonly tab = input.required<AppointmentTab>();
  readonly showCancelled = input(false);
  /** The id of the tabpanel the page labels with the selected tab. */
  readonly panelId = input('appointments-panel');
  readonly tabChange = output<AppointmentTab>();
  readonly showCancelledChange = output<boolean>();

  protected readonly tabs = TABS;
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const last = TABS.length - 1;
    let next = -1;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next < 0) return;
    event.preventDefault();
    this.buttons()[next].nativeElement.focus();
    this.tabChange.emit(TABS[next].value);
  }
}
