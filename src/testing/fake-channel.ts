/**
 * An in-memory stand-in for `CrossTabSync`: two or more "tabs" share one message bus and one
 * lock queue, so two `SessionStore` instances can be tested together. Messages are delivered
 * to every other tab on a microtask, like a real `BroadcastChannel`.
 */
export interface FakeMessage {
  type: string;
  tabId: string;
  [key: string]: unknown;
}

type Handler = (message: FakeMessage) => void;

export class FakeCrossTab {
  readonly supported = true;
  private readonly handlers = new Set<Handler>();
  private updateWaiters = new Set<() => void>();

  constructor(
    readonly tabId: string,
    private readonly bus: FakeBus,
  ) {
    bus.tabs.add(this);
  }

  broadcast(message: Omit<FakeMessage, 'tabId'>): void {
    const full = { ...message, tabId: this.tabId } as FakeMessage;
    this.bus.sent.push(full);
    for (const tab of this.bus.tabs) {
      if (tab === this) continue;
      queueMicrotask(() => tab.receive(full));
    }
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Serialises `fn` across every tab of the bus, like `navigator.locks`. */
  withLock<T>(_name: string, _waitMs: number, fn: () => Promise<T>): Promise<T> {
    const run = this.bus.lock.then(fn, fn);
    this.bus.lock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Resolves on the next `session-updated` from another tab, or after `ms`. */
  waitForUpdate(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.updateWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.updateWaiters.add(done);
    });
  }

  private receive(message: FakeMessage): void {
    for (const handler of this.handlers) handler(message);
    if (message.type === 'session-updated') for (const w of [...this.updateWaiters]) w();
  }
}

export class FakeBus {
  readonly tabs = new Set<FakeCrossTab>();
  /** Every message ever broadcast, for assertions. */
  readonly sent: FakeMessage[] = [];
  lock: Promise<unknown> = Promise.resolve();
}

/** Two tabs on one bus. */
export function createFakeChannelPair(): { a: FakeCrossTab; b: FakeCrossTab; bus: FakeBus } {
  const bus = new FakeBus();
  return { a: new FakeCrossTab('tab-a', bus), b: new FakeCrossTab('tab-b', bus), bus };
}
