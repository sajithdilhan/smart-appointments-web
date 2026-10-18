import {
  ALREADY_STARTED_DETAIL,
  cancelConflictMessage,
  GENERIC_CONFLICT_MESSAGE,
  TOO_LATE_MESSAGE,
} from './cancel-conflict';

describe('cancelConflictMessage', () => {
  it('pins the known backend text', () => {
    expect(ALREADY_STARTED_DETAIL).toBe(
      'The appointment has already started and can no longer be cancelled.',
    );
  });

  it('maps the known text to the fixed too-late message', () => {
    expect(cancelConflictMessage(ALREADY_STARTED_DETAIL)).toEqual({
      phase: 'too-late',
      message: 'This appointment has already started, so it can no longer be cancelled.',
    });
    expect(TOO_LATE_MESSAGE).toBe(
      'This appointment has already started, so it can no longer be cancelled.',
    );
  });

  it('tolerates surrounding whitespace on the known text', () => {
    expect(cancelConflictMessage(`  ${ALREADY_STARTED_DETAIL}\n`).phase).toBe('too-late');
  });

  it.each([
    ['another sentence', 'The appointment is locked.'],
    ['the known text in another case', ALREADY_STARTED_DETAIL.toUpperCase()],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('maps %s to the generic message that keeps the button', (_name, detail) => {
    expect(cancelConflictMessage(detail)).toEqual({
      phase: 'failed',
      message: "We couldn't cancel this appointment. Refresh and try again.",
    });
    expect(GENERIC_CONFLICT_MESSAGE).toBe(
      "We couldn't cancel this appointment. Refresh and try again.",
    );
  });

  it('never returns the raw detail', () => {
    const raw = 'Internal: slot 42 locked by job 7';
    expect(JSON.stringify(cancelConflictMessage(raw))).not.toContain(raw);
  });
});
