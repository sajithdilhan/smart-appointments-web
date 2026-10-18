import { downloadIcs } from './ics-download';

describe('downloadIcs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clicks a download link with the file name and revokes the URL', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let clicked: HTMLAnchorElement | null = null as HTMLAnchorElement | null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clicked = document.querySelector<HTMLAnchorElement>('a[download]');
    });
    expect(downloadIcs('BEGIN', 'appointment.ics')).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
    expect((create.mock.calls[0][0] as Blob).type).toBe('text/calendar;charset=utf-8');
    expect(clicked!.download).toBe('appointment.ics');
    expect(clicked!.href).toBe('blob:x');
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('returns false and does not throw when the file cannot be created', () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('no blobs');
    });
    expect(downloadIcs('x', 'a.ics')).toBe(false);
  });

  it('still revokes when the click throws', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:y');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(downloadIcs('x', 'a.ics')).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:y');
  });
});
