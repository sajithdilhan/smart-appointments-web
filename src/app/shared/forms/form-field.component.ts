import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideLock,
  lucideMail,
  lucidePhone,
  lucideUser,
} from '@ng-icons/lucide';
import { FieldView } from './field-view';

export type FieldIcon = 'lucideUser' | 'lucideMail' | 'lucidePhone' | 'lucideLock';

/** Label, input slot, optional hint and error line (icon plus text, never colour alone). */
@Component({
  selector: 'app-form-field',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircleAlert, lucideLock, lucideMail, lucidePhone, lucideUser })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5">
      <label [for]="view().id" class="text-sm font-medium text-foreground">
        {{ label() }}
        <span aria-hidden="true" class="text-destructive">*</span>
      </label>
      <div class="relative" [class]="icon() ? '[&_input]:ps-10' : ''">
        @if (icon(); as name) {
          <ng-icon
            [name]="name"
            size="18"
            class="pointer-events-none absolute start-3 top-[1.375rem] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
            data-testid="field-icon"
          />
        }
        <ng-content />
      </div>
      @if (hint(); as text) {
        <p [id]="view().id + '-hint'" class="text-sm text-muted-foreground">{{ text }}</p>
      }
      @if (view().error(); as message) {
        <p [id]="view().id + '-error'" class="flex gap-1.5 text-sm text-destructive">
          <ng-icon name="lucideCircleAlert" size="16" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{{ message }}</span>
          <ng-content select="[errorAction]" />
        </p>
      }
    </div>
  `,
})
export class FormFieldComponent {
  readonly view = input.required<FieldView>();
  readonly label = input.required<string>();
  readonly hint = input<string>();
  /** Optional decorative leading icon (an ng-icon name registered here). */
  readonly icon = input<FieldIcon>();
}
