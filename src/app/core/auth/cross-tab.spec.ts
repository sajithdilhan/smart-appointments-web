import { TestBed } from '@angular/core/testing';
import { useFakeTimers } from '../../../testing/fake-timers';
import { makeAccessToken } from '../../../testing/make-access-token';
import { AppError } from '../http/app-error';
import { CrossTabSync, parseSessionMessage } from './cross-tab';

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(data: unknown) {
    this.posted.push(data);
  }
  deliver(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

/** A minimal `navigator.locks`: one holder at a time, waiters honour an abort signal. */
class FakeLocks {
  private tail: Promise<unknown> = Promise.resolve();
  request<T>(_name: string, opts: { signal?: AbortSignal }, cb: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    const run = new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      void previous.then(() => {
        if (opts.signal?.aborted) return;
        opts.signal?.removeEventListener('abort', onAbort);
        cb().then(resolve, reject);
      });
    });
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function stubEnvironment(locks: unknown = new FakeLocks()) {
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

function unstubEnvironment() {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'locks');
}

const token = (role: 'Customer' | 'Admin' = 'Customer') =>
  makeAccessToken({ sub: 'u', email: 'a@b.c', role, expiresInSeconds: 3600 });

describe('parseSessionMessage', () => {
  const updated = {
    type: 'session-updated',
    tabId: 'other',
    accessToken: token(),
    accessTokenExpiresAtUtc: '2026-10-04T14:00:00Z',
  };

  it('accepts well-formed messages from another tab', () => {
    expect(parseSessionMessage(updated, 'me')).toEqual(updated);
    expect(
      parseSessionMessage({ type: 'session-ended', tabId: 'o', reason: 'expired' }, 'me'),
    ).toEqual({
      type: 'session-ended',
      tabId: 'o',
      reason: 'expired',
    });
    expect(parseSessionMessage({ type: 'request-session', tabId: 'o' }, 'me')).toEqual({
      type: 'request-session',
      tabId: 'o',
    });
  });

  it.each([
    ['own tab', { ...updated, tabId: 'me' }],
    ['null', null],
    ['a string', 'hello'],
    ['no tabId', { type: 'request-session' }],
    ['unknown type', { type: 'nope', tabId: 'o' }],
    ['an invalid access token', { ...updated, accessToken: 'garbage' }],
    ['a non-string access token', { ...updated, accessToken: 5 }],
    ['a missing expiry', { ...updated, accessTokenExpiresAtUtc: undefined }],
    ['a bad end reason', { type: 'session-ended', tabId: 'o', reason: 'because' }],
    ['a missing end reason', { type: 'session-ended', tabId: 'o' }],
  ])('rejects %s', (_name, data) => {
    expect(parseSessionMessage(data, 'me')).toBeNull();
  });
});

describe('CrossTabSync with Web Locks and BroadcastChannel', () => {
  beforeEach(() => stubEnvironment());
  afterEach(() => {
    unstubEnvironment();
    vi.useRealTimers();
  });

  it('is supported and broadcasts with its tab id on sa.session', () => {
    const sync = TestBed.inject(CrossTabSync);
    expect(sync.supported).toBe(true);
    sync.broadcast({ type: 'session-ended', reason: 'logout' });
    const channel = FakeBroadcastChannel.instances[0];
    expect(channel.name).toBe('sa.session');
    expect(channel.posted).toEqual([
      { type: 'session-ended', reason: 'logout', tabId: sync.tabId },
    ]);
  });

  it('delivers valid messages to subscribers and ignores own and invalid ones', () => {
    const sync = TestBed.inject(CrossTabSync);
    const handler = vi.fn();
    const off = sync.subscribe(handler);
    const channel = FakeBroadcastChannel.instances[0];
    channel.deliver({ type: 'session-ended', tabId: sync.tabId, reason: 'logout' });
    channel.deliver({ type: 'session-ended', tabId: 'x', reason: 'bogus' });
    channel.deliver('junk');
    expect(handler).not.toHaveBeenCalled();
    channel.deliver({ type: 'session-ended', tabId: 'x', reason: 'logout' });
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    channel.deliver({ type: 'session-ended', tabId: 'x', reason: 'logout' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('waitForUpdate resolves on a valid session-updated, or after the timeout', async () => {
    useFakeTimers();
    const sync = TestBed.inject(CrossTabSync);
    const channel = FakeBroadcastChannel.instances[0];
    let resolved = 0;
    void sync.waitForUpdate(1000).then(() => resolved++);
    channel.deliver({ type: 'session-ended', tabId: 'x', reason: 'logout' });
    await vi.advanceTimersByTimeAsync(100);
    expect(resolved).toBe(0);
    channel.deliver({
      type: 'session-updated',
      tabId: 'x',
      accessToken: token(),
      accessTokenExpiresAtUtc: 'z',
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(1);
    void sync.waitForUpdate(1000).then(() => resolved++);
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(2);
  });

  it('serialises callbacks through the lock', async () => {
    const sync = TestBed.inject(CrossTabSync);
    const order: string[] = [];
    const a = sync.withLock('sa.refresh', 15_000, async () => {
      order.push('a1');
      await new Promise((r) => setTimeout(r, 5));
      order.push('a2');
    });
    const b = sync.withLock('sa.refresh', 15_000, async () => void order.push('b'));
    await Promise.all([a, b]);
    expect(order).toEqual(['a1', 'a2', 'b']);
  });

  it('gives up waiting for a lock held longer than 15 seconds with a timeout AppError', async () => {
    useFakeTimers();
    const sync = TestBed.inject(CrossTabSync);
    void sync.withLock('sa.refresh', 15_000, () => new Promise<void>(() => undefined));
    const waiter = sync
      .withLock('sa.refresh', 15_000, async () => 'never')
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void waiter.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await waiter;
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ kind: 'timeout', status: 0 });
  });

  it('does not cancel a lock that was already granted', async () => {
    useFakeTimers();
    const sync = TestBed.inject(CrossTabSync);
    const result = sync.withLock('sa.refresh', 1000, async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return 'done';
    });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBe('done');
  });
});

describe('CrossTabSync fallback', () => {
  afterEach(() => {
    unstubEnvironment();
    vi.restoreAllMocks();
  });

  it('warns once, serialises within the tab, never broadcasts and does not crash', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    Reflect.deleteProperty(navigator, 'locks');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sync = TestBed.inject(CrossTabSync);
    expect(sync.supported).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => sync.broadcast({ type: 'request-session' })).not.toThrow();

    const order: string[] = [];
    const a = sync.withLock('x', 15_000, async () => {
      order.push('a1');
      await new Promise((r) => setTimeout(r, 5));
      order.push('a2');
    });
    const b = sync.withLock('x', 15_000, async () => void order.push('b'));
    await Promise.all([a, b]);
    expect(order).toEqual(['a1', 'a2', 'b']);
    await expect(sync.withLock('x', 1, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(sync.withLock('x', 1, async () => 'fine')).resolves.toBe('fine');
  });
});
