import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideEyeOff } from '@ng-icons/lucide';
import { HlmInput } from '@app/shared/ui/input';
import { FieldA11yDirective } from '../../../shared/forms/field-a11y.directive';
import { FieldView } from '../../../shared/forms/field-view';
import { FormFieldComponent } from '../../../shared/forms/form-field.component';

/** A password input with a show/hide button. The value stays in the control, never in a signal. */
@Component({
  selector: 'app-password-field',
  imports: [ReactiveFormsModule, NgIcon, HlmInput, FieldA11yDirective, FormFieldComponent],
  providers: [provideIcons({ lucideEye, lucideEyeOff })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-form-field [view]="view()" [label]="label()" [hint]="hint()" icon="lucideLock">
      <div class="relative">
        <input
          #input
          hlmInput
          class="h-11 pr-12"
          [id]="view().id"
          [type]="visible() ? 'text' : 'password'"
          [formControl]="control()"
          [appField]="view()"
          [readOnly]="pending()"
          [attr.autocomplete]="autocomplete()"
        />
        <button
          type="button"
          class="absolute top-0.5 right-0.5 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          [attr.aria-label]="visible() ? 'Hide password' : 'Show password'"
          [attr.aria-pressed]="visible()"
          (click)="toggle()"
        >
          <ng-icon [name]="visible() ? 'lucideEyeOff' : 'lucideEye'" size="18" aria-hidden="true" />
        </button>
      </div>
    </app-form-field>
  `,
})
export class PasswordFieldComponent {
  readonly view = input.required<FieldView>();
  readonly control = input.required<FormControl<string>>();
  readonly label = input('Password');
  readonly hint = input<string>();
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly pending = input(false);

  protected readonly visible = signal(false);
  private readonly injector = inject(Injector);
  private readonly inputEl = viewChild.required<ElementRef<HTMLInputElement>>('input');

  focus(): void {
    this.inputEl().nativeElement.focus();
  }

  protected toggle(): void {
    const el = this.inputEl().nativeElement;
    const { selectionStart: start, selectionEnd: end } = el;
    this.visible.update((v) => !v);
    afterNextRender(
      () => {
        if (start !== null && end !== null) el.setSelectionRange(start, end);
      },
      { injector: this.injector },
    );
  }
}
