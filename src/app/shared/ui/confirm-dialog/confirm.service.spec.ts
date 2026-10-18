import { TestBed } from '@angular/core/testing';
import { screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { ConfirmService } from './confirm.service';

const base = {
  title: 'Deactivate Kandy?',
  body: 'It will stop appearing.',
  confirmLabel: 'Deactivate',
};

function open(extra: Partial<Parameters<ConfirmService['confirm']>[0]> = {}) {
  const service = TestBed.inject(ConfirmService);
  const result = service.confirm({ ...base, ...extra });
  return { service, result };
}

async function dialog() {
  return screen.findByRole('alertdialog');
}

afterEach(() => {
  document.body.querySelectorAll('app-confirm-dialog').forEach((n) => n.remove());
});

describe('ConfirmService', () => {
  it('shows an alert dialog with the title, the body and both buttons', async () => {
    const { service, result } = open();
    const el = await dialog();
    expect(el).toHaveAccessibleName('Deactivate Kandy?');
    expect(el).toHaveTextContent('It will stop appearing.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    service.cancel();
    expect(await result).toBe(false);
  });

  it('puts initial focus on Cancel (or the cancel label) by default and on Confirm when asked', async () => {
    const first = open({ initialFocus: 'cancel', cancelLabel: 'Keep editing' });
    await dialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus());
    first.service.cancel();
    await first.result;
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    const second = open({ initialFocus: 'confirm' });
    await dialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate' })).toHaveFocus());
    second.service.cancel();
    await second.result;
  });

  it('resolves false on Cancel and true on confirm (no run)', async () => {
    const a = open();
    await dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await a.result).toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    const b = open();
    await dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(await b.result).toBe(true);
  });

  it('Escape cancels', async () => {
    const { result } = open();
    await dialog();
    await userEvent.keyboard('{Escape}');
    expect(await result).toBe(false);
  });

  it('a second call while one is open returns the same promise and one dialog', async () => {
    const { service, result } = open();
    const again = service.confirm({ ...base, title: 'Other' });
    expect(again).toBe(result);
    await dialog();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    service.cancel();
    await result;
    const next = service.confirm(base);
    expect(next).not.toBe(result);
    service.cancel();
    await next;
  });

  describe('with run', () => {
    it('stays open and busy while it runs, then closes true', async () => {
      let finish!: () => void;
      const run = vi.fn(() => new Promise<void>((r) => (finish = r)));
      const { result } = open({ run });
      await dialog();
      const confirm = screen.getByRole('button', { name: 'Deactivate' });
      await userEvent.click(confirm);
      await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
      expect(confirm).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(run).toHaveBeenCalledTimes(1);
      finish();
      expect(await result).toBe(true);
    });

    it('a rejection keeps the dialog open with the message inline, and a retry can succeed', async () => {
      const run = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Cannot reach the server.'))
        .mockResolvedValueOnce();
      const { result } = open({ run });
      await dialog();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      expect(await result).toBe(true);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('ignores cancel while pending', async () => {
      let finish!: () => void;
      const { service, result } = open({ run: () => new Promise<void>((r) => (finish = r)) });
      await dialog();
      await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
      service.cancel();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      finish();
      expect(await result).toBe(true);
    });
  });
});
