import { TestBed } from '@angular/core/testing';
import { toast } from '@spartan-ng/brain/sonner';
import { AppError } from '../http/app-error';
import { ERROR_TOAST_MS, SUCCESS_TOAST_MS, ToastService } from './toast.service';

function lastOptions(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.at(-1)![1] as Record<string, unknown>;
}

describe('ToastService policy', () => {
  afterEach(() => vi.restoreAllMocks());

  const cases: [string, AppError, boolean][] = [
    ['network', new AppError(0, 'm', 'network'), true],
    ['timeout', new AppError(0, 'm', 'timeout'), true],
    ['http 403', new AppError(403, 'm', 'http'), true],
    ['http 500', new AppError(500, 'm', 'http'), true],
    ['http 501', new AppError(501, 'm', 'http'), true],
    ['http 400', new AppError(400, 'm', 'http'), false],
    ['http 404', new AppError(404, 'm', 'http'), false],
    ['http 409', new AppError(409, 'm', 'http'), false],
    ['http 422', new AppError(422, 'm', 'http'), false],
    ['unauthorized', new AppError(401, 'm', 'unauthorized'), false],
    ['rate-limited', new AppError(429, 'm', 'rate-limited', undefined, 60), false],
    ['unavailable', new AppError(503, 'm', 'unavailable'), false],
  ];

  it.each(cases)('handleError for %s toasts: %s', (_name, error, expected) => {
    const spy = vi.spyOn(toast, 'error').mockReturnValue(1);
    TestBed.inject(ToastService).handleError(error);
    expect(spy).toHaveBeenCalledTimes(expected ? 1 : 0);
  });

  it('showError always toasts, assertively, for at least 8 seconds', () => {
    const spy = vi.spyOn(toast, 'error').mockReturnValue(1);
    TestBed.inject(ToastService).showError(new AppError(404, 'Gone', 'http', 'ref-1'));
    expect(spy).toHaveBeenCalledWith('Gone', expect.anything());
    const options = lastOptions(spy);
    expect(options['important']).toBe(true);
    expect(options['duration']).toBe(ERROR_TOAST_MS);
    expect(ERROR_TOAST_MS).toBeGreaterThanOrEqual(8000);
    expect(options['description']).toBe('Reference: ref-1');
  });

  it('has no reference line or action without a correlation id', () => {
    const spy = vi.spyOn(toast, 'error').mockReturnValue(1);
    TestBed.inject(ToastService).showError(new AppError(500, 'Boom', 'http'));
    const options = lastOptions(spy);
    expect(options['description']).toBeUndefined();
    expect(options['action']).toBeUndefined();
  });

  it('showSuccess auto-dismisses after 5 seconds and showInfo is polite', () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const info = vi.spyOn(toast, 'info').mockReturnValue(1);
    const service = TestBed.inject(ToastService);
    service.showSuccess('Welcome');
    expect(success).toHaveBeenCalledWith('Welcome', { duration: SUCCESS_TOAST_MS });
    service.showInfo('FYI');
    expect(info).toHaveBeenCalledWith('FYI');
  });

  it('showSessionExpired shows the session-ended message', () => {
    const info = vi.spyOn(toast, 'info').mockReturnValue(1);
    TestBed.inject(ToastService).showSessionExpired();
    expect(info.mock.calls[0][0]).toBe('Your session has expired. Please sign in again.');
  });
});
