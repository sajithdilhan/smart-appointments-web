import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { RetryCountdown } from '../../../core/http/retry-countdown';

/**
 * The one rate-limit countdown notice of the app. The visible text updates every second and is
 * hidden from assistive technology; a separate visually hidden status region changes exactly
 * twice per countdown (at the start and at the end), so a screen reader is not interrupted
 * every second.
 */
@Component({
  selector: 'app-rate-limit-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (countdown().active()) {
      <p class="text-sm text-muted-foreground" aria-hidden="true">
        Too many attempts. Try again in {{ countdown().remaining() }}
        {{ countdown().remaining() === 1 ? 'second' : 'seconds' }}.
      </p>
    } @else if (ended()) {
      <p class="text-sm text-muted-foreground" aria-hidden="true">You can try again now.</p>
    }
    <p class="sr-only" role="status">{{ announcement() }}</p>
  `,
})
export class RateLimitNotice {
  readonly countdown = input.required<RetryCountdown>();

  protected readonly announcement = signal('');
  protected readonly ended = signal(false);
  private wasActive = false;

  constructor() {
    effect(() => {
      const active = this.countdown().active();
      untracked(() => {
        if (active && !this.wasActive) {
          const n = this.countdown().remaining();
          this.ended.set(false);
          this.announcement.set(
            `Too many attempts. Try again in ${n} ${n === 1 ? 'second' : 'seconds'}.`,
          );
        } else if (!active && this.wasActive) {
          this.ended.set(true);
          this.announcement.set('You can try again now.');
        }
        this.wasActive = active;
      });
    });
  }
}
