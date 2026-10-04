import { createFakeChannelPair } from './fake-channel';

describe('fake channel pair', () => {
  it('delivers a message to the other tab only, on a microtask', async () => {
    const { a, b } = createFakeChannelPair();
    const atA = vi.fn();
    const atB = vi.fn();
    a.subscribe(atA);
    b.subscribe(atB);
    a.broadcast({ type: 'session-ended', reason: 'logout' });
    expect(atB).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(atB).toHaveBeenCalledWith({ type: 'session-ended', reason: 'logout', tabId: 'tab-a' });
    expect(atA).not.toHaveBeenCalled();
  });

  it('serialises locks across tabs in call order', async () => {
    const { a, b } = createFakeChannelPair();
    const order: string[] = [];
    const first = a.withLock('sa.refresh', 15_000, async () => {
      order.push('a start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('a end');
    });
    const second = b.withLock('sa.refresh', 15_000, async () => {
      order.push('b start');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['a start', 'a end', 'b start']);
  });

  it('keeps the lock usable after a failing callback', async () => {
    const { a, b } = createFakeChannelPair();
    await expect(a.withLock('x', 1, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(b.withLock('x', 1, async () => 'fine')).resolves.toBe('fine');
  });

  it('waitForUpdate resolves on a session-updated from the other tab, or after the timeout', async () => {
    const { a, b } = createFakeChannelPair();
    const waited = b.waitForUpdate(60_000);
    a.broadcast({ type: 'session-updated' });
    await expect(waited).resolves.toBeUndefined();
    vi.useFakeTimers();
    try {
      const timedOut = b.waitForUpdate(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(timedOut).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
