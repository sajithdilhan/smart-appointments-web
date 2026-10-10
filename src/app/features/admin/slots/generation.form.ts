import {
  FormControl,
  FormGroup,
  type AbstractControl,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import type { GenerateSlotsBody } from '../../../core/api/models';
import { formSnapshot } from '../shared/dirty/form-snapshot';
import { dateRangeError, isDateString } from '../validation/generation-rules';
import { generationValidators } from '../validation/validators';
import type { Estimate } from './slot-estimate';

export type GenerationForm = ReturnType<typeof createGenerationForm>;
export type GenerationValues = ReturnType<GenerationForm['getRawValue']>;

export const DEFAULT_CAPACITY = 1;

const required: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value !== '' ? null : { required: true };

/** The end date: required, then not before the start and at most 30 days after it. */
const toDateRule: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const to = c.value as string;
  if (!isDateString(to)) return { required: true };
  const from = (c.parent?.get('fromDate')?.value as string | undefined) ?? '';
  const key = dateRangeError(from, to);
  return key ? { [key]: true } : null;
};

export function createGenerationForm() {
  const fromDate = new FormControl('', {
    nonNullable: true,
    validators: generationValidators.dateRequired,
  });
  const toDate = new FormControl('', { nonNullable: true, validators: toDateRule });
  // The end date's rule reads the start date, so it re-runs when the start changes.
  fromDate.valueChanges.subscribe(() => toDate.updateValueAndValidity());
  return new FormGroup({
    branchId: new FormControl('', { nonNullable: true, validators: required }),
    serviceTypeId: new FormControl('', { nonNullable: true, validators: required }),
    fromDate,
    toDate,
    capacity: new FormControl<number | null>(DEFAULT_CAPACITY, {
      validators: generationValidators.capacity,
    }),
  });
}

export const generationSnapshot = (form: GenerationForm): string =>
  formSnapshot(form.getRawValue());

export function toGenerateBody(v: GenerationValues): GenerateSlotsBody {
  return {
    branchId: v.branchId,
    serviceTypeId: v.serviceTypeId,
    fromDate: v.fromDate,
    toDate: v.toDate,
    capacity: v.capacity as number,
  };
}

export interface PreviewText {
  headline: string;
  closed: string | null;
  today: string | null;
  zero: string | null;
}

/** The preview wording for an estimate. `todayInRange`: today (branch zone) is one of the dates. */
export function previewText(e: Estimate, todayInRange: boolean): PreviewText {
  const days = `${e.days} ${e.days === 1 ? 'day' : 'days'}`;
  let zero: string | null = null;
  if (e.slots === 0) {
    zero =
      e.closedDays === e.days
        ? 'No slots would be created: the branch is closed on every day in this range.'
        : e.droppedPast > 0
          ? 'No slots would be created: every slot in this range has already started.'
          : 'No slots would be created in this range.';
  }
  return {
    headline: `${days}, about ${e.slots} slots estimated`,
    closed:
      e.closedDays > 0
        ? `${e.closedDays} closed ${e.closedDays === 1 ? 'day' : 'days'} in this range`
        : null,
    today: todayInRange ? 'Slots that have already started today are not created.' : null,
    zero,
  };
}
