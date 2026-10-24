import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { HlmDialog, HlmDialogContent, HlmDialogPortal } from '@app/shared/ui/dialog';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { SessionStore } from '../../../core/auth/session.store';
import { ThemeService } from '../../../core/theme/theme.service';
import { HlmInput } from '@app/shared/ui/input';
import { BranchesStore } from '../data/branches.store';
import { ServicesStore } from '../data/services.store';
import { StaffAccountsStore } from '../data/staff-accounts.store';
import { createListbox } from '../shared/listbox/create-listbox';
import { optionId } from '../shared/listbox/listbox-aria';
import { buildCommands, filterCommands, type Command } from './command-registry';

const LIST_ID = 'palette-list';

/**
 * The admin command palette: a modal dialog holding a WAI-ARIA combobox over a grouped listbox.
 * Records come from the stores that are already loaded; it never makes a request. Focus stays on
 * the input (`aria-activedescendant`). Running a command closes the palette first.
 */
@Component({
  selector: 'app-command-palette',
  imports: [HlmDialog, HlmDialogContent, HlmDialogPortal, HlmInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hlm-dialog
      aria-label="Command palette"
      autoFocus="[data-initial-focus]"
      [restoreFocus]="false"
      [state]="open() ? 'open' : 'closed'"
      (closed)="dismiss()"
    >
      <hlm-dialog-content
        *hlmDialogPortal
        [showCloseButton]="false"
        class="top-0 w-full max-w-lg gap-0 p-0 sm:mt-24"
      >
        <div class="border-b p-3">
          <input
            hlmInput
            type="text"
            role="combobox"
            data-initial-focus
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            aria-label="Search commands"
            aria-autocomplete="list"
            aria-expanded="true"
            [attr.aria-controls]="listId"
            [attr.aria-activedescendant]="box.activeId()"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (keydown)="onKeydown($event)"
          />
        </div>
        <div
          role="listbox"
          aria-label="Commands"
          class="max-h-80 overflow-y-auto p-2"
          [id]="listId"
        >
          @for (group of rows(); track group.group) {
            <div role="group" [attr.aria-label]="group.group" class="mb-1">
              <p
                role="presentation"
                class="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {{ group.group }}
              </p>
              @for (row of group.items; track row.command.id) {
                <!-- Focus stays on the input (aria-activedescendant); the keyboard acts there. -->
                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
                <div
                  role="option"
                  class="cursor-pointer rounded-md border-l-2 border-transparent px-2 py-2 text-sm aria-selected:border-primary aria-selected:bg-accent"
                  [id]="optionId(row.index)"
                  [attr.aria-selected]="row.index === box.activeIndex()"
                  (mousedown)="$event.preventDefault()"
                  (mouseenter)="box.setActive(row.index)"
                  (click)="box.select(row.index)"
                >
                  {{ row.command.label }}
                </div>
              }
            </div>
          }
          @if (count() === 0) {
            <p role="status" class="px-2 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </p>
          }
        </div>
        <p class="sr-only" role="status">{{ announcement() }}</p>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CommandPalette {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);
  private readonly session = inject(SessionStore);
  private readonly branches = inject(BranchesStore);
  private readonly services = inject(ServicesStore);
  private readonly staff = inject(StaffAccountsStore);

  readonly open = model(false);
  protected readonly listId = LIST_ID;

  protected readonly query = signal('');
  private readonly commands = computed(() =>
    buildCommands({
      branches: this.branches.items(),
      services: this.services.items(),
      staff: this.staff.items(),
    }),
  );
  private readonly results = computed(() => filterCommands(this.commands(), this.query()));
  protected readonly count = computed(() => this.results().count);
  private readonly flat = computed(() => this.results().groups.flatMap((g) => g.items));

  /** Groups with each command's position in the flat list, for option ids and the highlight. */
  protected readonly rows = computed(() => {
    let index = 0;
    return this.results().groups.map((g) => ({
      group: g.group,
      items: g.items.map((command) => ({ command, index: index++ })),
    }));
  });

  protected readonly box = createListbox<Command>({
    items: this.flat,
    idPrefix: 'palette',
  });

  /** "5 results", debounced and written only when the count changes. */
  protected readonly announcement = toSignal(
    toObservable(this.count).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      map((n) => (n === 0 ? '' : `${n} ${n === 1 ? 'result' : 'results'}`)),
    ),
    { initialValue: '' },
  );

  private opener: HTMLElement | null = null;

  constructor() {
    this.box.selected.subscribe((command) => this.run(command));
    effect(() => {
      if (this.open()) {
        untracked(() => {
          const active = this.doc.activeElement;
          this.opener = active instanceof HTMLElement && active !== this.doc.body ? active : null;
          this.query.set('');
          this.box.open.set(true);
        });
      }
    });
  }

  protected optionId(index: number): string {
    return optionId('palette', index);
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close(true);
      return;
    }
    this.box.onKeydown(e);
  }

  /** The dialog closed itself (Escape at the document level, backdrop). */
  protected dismiss(): void {
    if (this.open()) this.close(true);
  }

  private close(restoreFocus: boolean): void {
    this.open.set(false);
    const opener = this.opener;
    this.opener = null;
    if (restoreFocus) setTimeout(() => opener?.focus(), 0);
  }

  private run(command: Command): void {
    const action = command.run;
    if (action.kind === 'navigate') {
      const here = this.router.url.split(/[?#]/)[0];
      const sameRoute = here === action.url && !action.queryParams;
      this.close(sameRoute);
      if (!sameRoute) {
        void this.router.navigate([action.url], { queryParams: action.queryParams });
      }
      return;
    }
    this.close(true);
    if (action.kind === 'theme') {
      this.theme.set(this.theme.isDark() ? 'light' : 'dark');
    } else {
      void this.session.logout();
    }
  }
}
