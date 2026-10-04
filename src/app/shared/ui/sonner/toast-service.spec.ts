import { TestBed } from '@angular/core/testing';
import { toast, toastState } from '@spartan-ng/brain/sonner';
import { fireEvent, render, screen } from '@testing-library/angular';
import { AppError } from '../../../core/http/app-error';
import { ToastService } from '../../../core/notify/toast.service';
import { HlmToaster } from '@app/shared/ui/sonner';

describe('ToastService in the toaster', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    toast.dismiss();
    toastState.reset();
  });

  it('renders the message and reference, and Copy writes the id', async () => {
    await render(HlmToaster);
    TestBed.inject(ToastService).showError(new AppError(500, 'Server broke', 'http', 'abc-123'));
    expect(await screen.findByText('Server broke')).toBeTruthy();
    expect(screen.getByText('Reference: abc-123')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy reference' }));
    expect(writeText).toHaveBeenCalledWith('abc-123');
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('announces an error assertively', async () => {
    await render(HlmToaster);
    TestBed.inject(ToastService).showError(new AppError(500, 'Server broke', 'http'));
    const message = await screen.findByText('Server broke');
    expect(message.closest('[aria-live]')?.getAttribute('aria-live')).toBe('assertive');
  });

  it('does not throw when the Clipboard API is denied or missing', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    await render(HlmToaster);
    const service = TestBed.inject(ToastService);
    service.showError(new AppError(500, 'First', 'http', 'id-1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy reference' }));
    expect(screen.getByText('Reference: id-1')).toBeTruthy();

    vi.stubGlobal('navigator', {});
    service.showError(new AppError(500, 'Second', 'http', 'id-2'));
    const buttons = await screen.findAllByRole('button', { name: 'Copy reference' });
    expect(() => fireEvent.click(buttons[buttons.length - 1])).not.toThrow();
    expect(screen.getByText('Reference: id-2')).toBeTruthy();
  });
});
