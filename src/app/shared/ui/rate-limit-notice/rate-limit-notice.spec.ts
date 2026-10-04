import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { useFakeTimers } from '../../../../testing/fake-timers';
import { render, screen } from '@testing-library/angular';
import { createRetryCountdown } from '../../../core/http/retry-countdown';
import { RateLimitNotice } from './rate-limit-notice';

describe('RateLimitNotice', () => {
  beforeEach(() => useFakeTimers());
  afterEach(() => vi.useRealTimers());

  @Component({
    selector: 'app-host',
    imports: [RateLimitNotice],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<app-rate-limit-notice [countdown]="countdown" />',
  })
  class Host {
    readonly countdown = createRetryCountdown();
  }

  async function setup() {
    const view = await render(Host);
    return { countdown: view.fixture.componentInstance.countdown, ...view };
  }

  const flush = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
  };

  it('renders nothing visible while idle, with an empty status region', async () => {
    const { container } = await setup();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByRole('status').textContent?.trim()).toBe('');
  });

  it('shows the countdown text hidden from assistive technology', async () => {
    const { countdown, container } = await setup();
    countdown.start(3);
    await flush(0);
    const visible = container.querySelector('[aria-hidden="true"]')!;
    expect(visible.textContent).toMatch(/Too many attempts\. Try again in 3 seconds\./);
    await flush(1000);
    expect(visible.textContent).toMatch(/in 2 seconds/);
  });

  it('writes the status text exactly twice across a full countdown', async () => {
    const { countdown } = await setup();
    const status = screen.getByRole('status');
    const seen: string[] = [status.textContent!.trim()];
    const observer = new MutationObserver(() => seen.push(status.textContent!.trim()));
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    countdown.start(4);
    for (let i = 0; i < 20; i++) await flush(250);
    await Promise.resolve();
    observer.disconnect();

    const changes = seen.filter((text, i) => i === 0 || text !== seen[i - 1]);
    expect(changes).toEqual([
      '',
      'Too many attempts. Try again in 4 seconds.',
      'You can try again now.',
    ]);
    expect(
      screen.getByText('You can try again now.', { selector: '[aria-hidden="true"]' }),
    ).toBeTruthy();
  });

  it('does not re-announce when the countdown is replaced while active', async () => {
    const { countdown } = await setup();
    countdown.start(10);
    await flush(2000);
    countdown.start(30);
    await flush(1000);
    expect(screen.getByRole('status').textContent?.trim()).toBe(
      'Too many attempts. Try again in 10 seconds.',
    );
  });

  it('uses the singular for one second', async () => {
    const { countdown, container } = await setup();
    countdown.start(1);
    await flush(0);
    expect(container.querySelector('[aria-hidden="true"]')!.textContent).toMatch(/in 1 second\./);
  });
});
