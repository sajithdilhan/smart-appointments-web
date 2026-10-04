import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChildren } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: string;
}

@Component({
  selector: 'app-theme-toggle',
  imports: [NgIcon],
  providers: [provideIcons({ lucideMonitor, lucideSun, lucideMoon })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="radiogroup"
      aria-label="Theme"
      class="border-input bg-background inline-flex gap-1 rounded-lg border p-1"
    >
      @for (option of options; track option.value) {
        <button
          #radio
          type="button"
          role="radio"
          class="text-foreground hover:bg-muted aria-checked:bg-primary aria-checked:text-primary-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
          [attr.aria-checked]="theme.preference() === option.value"
          [attr.aria-label]="option.label"
          [attr.title]="option.label"
          [tabindex]="theme.preference() === option.value ? 0 : -1"
          (click)="select(option.value)"
          (keydown)="onKeydown($event, $index)"
        >
          <ng-icon [name]="option.icon" size="16" aria-hidden="true" />
        </button>
      }
    </div>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  protected readonly options: readonly ThemeOption[] = [
    { value: 'system', label: 'Use system theme', icon: 'lucideMonitor' },
    { value: 'light', label: 'Use light theme', icon: 'lucideSun' },
    { value: 'dark', label: 'Use dark theme', icon: 'lucideMoon' },
  ];

  protected select(value: ThemePreference): void {
    this.theme.set(value);
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const last = this.options.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.select(this.options[next]!.value);
    this.radios()[next]?.nativeElement.focus();
  }
}
