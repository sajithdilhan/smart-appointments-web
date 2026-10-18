import { STEPS, stepFromParams, stepNumber, stepTitle } from './steps';

describe('stepFromParams', () => {
  it.each([
    [{}, 'branch'],
    [{ branch: 'b' }, 'service'],
    [{ branch: 'b', service: 's' }, 'datetime'],
    [{ branch: 'b', service: 's', date: '2026-10-05' }, 'datetime'],
    [{ branch: 'b', service: 's', date: '2026-10-05', slot: 'x' }, 'review'],
    [{ branch: 'b', service: 's', date: '2026-10-05', done: '1' }, 'success'],
    [{ service: 's' }, 'branch'],
    [{ branch: ' ' }, 'branch'],
    [{ branch: 'b', service: 's', done: '1' }, 'datetime'],
  ] as const)('%j gives %s', (params, step) => {
    expect(stepFromParams({ ...params })).toBe(step);
  });
});

describe('stepTitle', () => {
  it('uses the app title on the first step and "<step> | Book an appointment" after it', () => {
    expect(stepTitle('branch')).toBe('Book an appointment');
    expect(stepTitle('service')).toBe('Service | Book an appointment');
    expect(stepTitle('datetime')).toBe('Date and time | Book an appointment');
    expect(stepTitle('review')).toBe('Review | Book an appointment');
    expect(stepTitle('success')).toBe('Appointment booked');
  });
});

describe('stepNumber', () => {
  it('is one-based and goes past the last step on success', () => {
    expect(STEPS.map((s) => stepNumber(s.id))).toEqual([1, 2, 3, 4]);
    expect(stepNumber('success')).toBe(5);
  });
});
