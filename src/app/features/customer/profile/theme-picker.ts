import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmRadioGroupImports } from '@app/shared/ui/radio-group';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';

/** The appearance radio group; shares `ThemeService.preference` with the header toggle. */
@Component({
  selector: 'app-theme-picker',
  imports: [HlmRadioGroupImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-radio-group aria-label="Theme" [value]="theme.preference()" (valueChange)="select($event)">
      @for (option of options; track option.value) {
        <div class="flex min-h-11 items-center gap-3">
          <hlm-radio [value]="option.value" [aria-label]="option.label">
            <hlm-radio-indicator indicator />
          </hlm-radio>
          <span aria-hidden="true" class="text-sm">{{ option.label }}</span>
        </div>
      }
    </hlm-radio-group>
  `,
})
export class ThemePicker {
  protected readonly theme = inject(ThemeService);
  protected readonly options: readonly { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  protected select(value: unknown): void {
    if (value === 'system' || value === 'light' || value === 'dark') this.theme.set(value);
  }
}
