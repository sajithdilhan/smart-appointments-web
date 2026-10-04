import { classifyConflict } from './conflict-map';

describe('classifyConflict: the backend strings, verbatim', () => {
  it('You already have an appointment at that time. is overlap', () => {
    expect(classifyConflict('You already have an appointment at that time.')).toBe('overlap');
  });

  it('A request with this Idempotency-Key is still being processed. is in-progress', () => {
    expect(classifyConflict('A request with this Idempotency-Key is still being processed.')).toBe(
      'in-progress',
    );
  });

  it('Slot is full. is slot-gone', () => {
    expect(classifyConflict('Slot is full.')).toBe('slot-gone');
  });

  it('Slot has already started. is slot-gone', () => {
    expect(classifyConflict('Slot has already started.')).toBe('slot-gone');
  });

  it('The slot cannot be reserved. is slot-gone', () => {
    expect(classifyConflict('The slot cannot be reserved.')).toBe('slot-gone');
  });

  it.each([
    ["Branch 'AKL' is inactive."],
    ["Branch 'north-01' is inactive."],
    ["Service type 'CHK' is inactive."],
    ["Branch 'AKL' has no working hours."],
  ])('%s is slot-gone (pattern with a real code)', (text) => {
    expect(classifyConflict(text)).toBe('slot-gone');
  });

  it.each([
    ['  YOU ALREADY HAVE AN APPOINTMENT AT THAT TIME.  ', 'overlap'],
    ['slot is full.', 'slot-gone'],
    ['\tSlot Is Full.\n', 'slot-gone'],
    ["  branch 'akl' IS INACTIVE.", 'slot-gone'],
  ] as const)('ignores case and surrounding whitespace: %j', (text, expected) => {
    expect(classifyConflict(text)).toBe(expected);
  });

  it.each([
    ['Something else entirely.'],
    ['Slot is full'],
    ['Branch is inactive.'],
    ["Branch '' is inactive."],
    [''],
    [undefined],
  ])('treats %j as unknown', (text) => {
    expect(classifyConflict(text)).toBe('unknown');
  });
});
