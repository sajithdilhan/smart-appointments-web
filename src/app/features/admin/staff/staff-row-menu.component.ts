import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmDropdownMenuImports } from '@app/shared/ui/dropdown-menu';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEllipsis, lucideLoaderCircle } from '@ng-icons/lucide';
import type { StaffAccount } from '../../../core/api/models';

/** What a menu choice carries: the member, and the button to give focus back to. */
export interface StaffMenuEvent {
  account: StaffAccount;
  opener: HTMLElement;
}

/**
 * The actions menu of one staff row: Edit (opens the drawer over the list), Deactivate or
 * Reactivate according to the status, and Delete. The trigger is disabled, with a spinner, while
 * a request for this member is in flight (Req 9.5).
 */
@Component({
  selector: 'app-staff-row-menu',
  imports: [HlmButtonImports, HlmDropdownMenuImports, NgIcon, RouterLink],
  providers: [provideIcons({ lucideEllipsis, lucideLoaderCircle })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      hlmBtn
      variant="ghost"
      size="icon"
      type="button"
      [attr.aria-label]="'Actions for ' + name()"
      [attr.aria-busy]="pending() ? 'true' : null"
      [disabled]="pending()"
      [hlmDropdownMenuTrigger]="menu"
      align="end"
    >
      <ng-icon
        [name]="pending() ? 'lucideLoaderCircle' : 'lucideEllipsis'"
        [class]="pending() ? 'animate-spin' : ''"
        aria-hidden="true"
      />
    </button>

    <ng-template #menu>
      <div hlmDropdownMenu class="w-44">
        <a
          hlmDropdownMenuItem
          [routerLink]="['/admin/staff', account().id]"
          queryParamsHandling="preserve"
          >Edit</a
        >
        @if (account().isActive) {
          <button hlmDropdownMenuItem type="button" (triggered)="deactivate.emit(event())">
            Deactivate
          </button>
        } @else {
          <button hlmDropdownMenuItem type="button" (triggered)="reactivate.emit(event())">
            Reactivate
          </button>
        }
        <button
          hlmDropdownMenuItem
          type="button"
          variant="destructive"
          (triggered)="remove.emit(event())"
        >
          Delete
        </button>
      </div>
    </ng-template>
  `,
})
export class StaffRowMenu {
  readonly account = input.required<StaffAccount>();
  readonly name = input.required<string>();
  readonly pending = input(false);
  readonly deactivate = output<StaffMenuEvent>();
  readonly reactivate = output<StaffMenuEvent>();
  readonly remove = output<StaffMenuEvent>();

  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');

  protected event(): StaffMenuEvent {
    return { account: this.account(), opener: this.trigger().nativeElement };
  }
}
