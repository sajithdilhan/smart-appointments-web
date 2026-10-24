import type { Observable } from 'rxjs';

export interface RequestOptions {
  /** Aborting cancels the in-flight HTTP request and rejects with the signal's reason. */
  signal?: AbortSignal;
}

/** Observable to promise that unsubscribes (cancelling the request) when `signal` aborts. */
export function toPromise<T>(source: Observable<T>, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let value: T;
    let seen = false;
    const onAbort = () => {
      sub.unsubscribe();
      reject(signal?.reason);
    };
    const sub = source.subscribe({
      next: (v) => {
        value = v;
        seen = true;
      },
      error: (e: unknown) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
      complete: () => {
        signal?.removeEventListener('abort', onAbort);
        // A 204 still emits one (null) body, so an empty stream is a bug.
        if (seen) resolve(value);
        else reject(new Error('The request completed without a response.'));
      },
    });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
