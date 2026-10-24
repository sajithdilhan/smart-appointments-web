import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircle, lucideCircleCheck } from '@ng-icons/lucide';

/** The checklist only ever sees booleans and labels, never the password. */
export interface PasswordChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
}

/**
 * The five password requirements. Not a live region (it would announce on every keystroke);
 * a single polite status says so once when the last rule is met.
 */
@Component({
  selector: 'app-password-checklist',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCircle, lucideCircleCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul [id]="id()" class="flex flex-col gap-1 text-sm">
      @for (item of results(); track item.id) {
        <li
          class="flex items-start gap-2"
          [class]="item.met ? 'text-foreground' : 'text-muted-foreground'"
        >
          <ng-icon
            [name]="item.met ? 'lucideCircleCheck' : 'lucideCircle'"
            size="16"
            class="mt-0.5 shrink-0"
            [class]="item.met ? 'text-success' : 'text-muted-foreground'"
            aria-hidden="true"
          />
          <span
            >{{ item.label }}<span class="sr-only">, {{ item.met ? 'met' : 'not met' }}</span></span
          >
        </li>
      }
    </ul>
    <p class="sr-only" role="status">{{ allMet() ? 'All password requirements met' : '' }}</p>
  `,
})
export class PasswordChecklistComponent {
  readonly results = input.required<readonly PasswordChecklistItem[]>();
  readonly id = input.required<string>();
  protected readonly allMet = computed(
    () => this.results().length > 0 && this.results().every((r) => r.met),
  );
}
