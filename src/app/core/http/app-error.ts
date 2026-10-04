export type AppErrorKind =
  'http' | 'network' | 'timeout' | 'unauthorized' | 'rate-limited' | 'unavailable';

export interface AppErrorShape {
  readonly status: number;
  readonly message: string;
  readonly kind: AppErrorKind;
  readonly correlationId?: string;
  readonly retryAfterSeconds?: number;
}

/**
 * The only error type callers see from the HTTP pipeline. It extends `Error` so RxJS and
 * `firstValueFrom` treat it as an error, but `message` is the only thing ever displayed: it
 * never holds a stack, a raw body or a header.
 */
export class AppError extends Error implements AppErrorShape {
  constructor(
    readonly status: number,
    message: string,
    readonly kind: AppErrorKind,
    readonly correlationId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
