import type { Params } from '@angular/router';

export type StepId = 'branch' | 'service' | 'datetime' | 'review' | 'success';

/** The four numbered steps; Success replaces the indicator with a "Booked" state. */
export const STEPS = [
  { id: 'branch', label: 'Branch' },
  { id: 'service', label: 'Service' },
  { id: 'datetime', label: 'Date and time' },
  { id: 'review', label: 'Review' },
] as const;

const present = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * The step a set of query parameters points at, by presence only: whether the values are valid
 * is the store's job (`repairParams`). `done=1` is the success view; the store only keeps that
 * step when a booking is in memory.
 */
export function stepFromParams(p: Params): StepId {
  if (p['done'] === '1' && present(p['branch']) && present(p['service']) && present(p['date'])) {
    return 'success';
  }
  if (!present(p['branch'])) return 'branch';
  if (!present(p['service'])) return 'service';
  if (!present(p['date']) || !present(p['slot'])) return 'datetime';
  return 'review';
}

/** The page title without the app name (the title strategy appends "| Smart Appointments"). */
export function stepTitle(step: StepId): string {
  switch (step) {
    case 'branch':
      return 'Book an appointment';
    case 'success':
      return 'Appointment booked';
    default: {
      const label = STEPS.find((s) => s.id === step)!.label;
      return `${label} | Book an appointment`;
    }
  }
}

/** One-based position in the indicator; success counts as past the last step. */
export function stepNumber(step: StepId): number {
  return step === 'success' ? STEPS.length + 1 : STEPS.findIndex((s) => s.id === step) + 1;
}
