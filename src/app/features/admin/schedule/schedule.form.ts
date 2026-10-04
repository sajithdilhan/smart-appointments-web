import { FormArray, FormControl, FormGroup } from '@angular/forms';
import type { ScheduleBody } from '../../../core/api/models';
import { DAY_NAMES, type DayName } from '../../../core/time';
import { formSnapshot } from '../shared/dirty/form-snapshot';
import { normaliseTime, scheduleRowError } from '../validation/schedule-rules';
import { scheduleValidators } from '../validation/validators';

/** The week as the editor shows it, Monday first. */
export const DAYS: readonly DayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export type DayGroup = FormGroup<{
  day: FormControl<DayName>;
  open: FormControl<boolean>;
  opensAt: FormControl<string>;
  closesAt: FormControl<string>;
}>;

export type ScheduleForm = FormGroup<{
  timeZoneId: FormControl<string>;
  days: FormArray<DayGroup>;
}>;

/** What a freshly opened day starts with, so the admin edits rather than types from nothing. */
export const DEFAULT_OPENS = '09:00';
export const DEFAULT_CLOSES = '17:00';

function createDay(day: DayName): DayGroup {
  return new FormGroup(
    {
      day: new FormControl(day, { nonNullable: true }),
      open: new FormControl(false, { nonNullable: true }),
      opensAt: new FormControl('', { nonNullable: true }),
      closesAt: new FormControl('', { nonNullable: true }),
    },
    { validators: scheduleValidators.row },
  );
}

/** Always seven rows, Monday first, all closed, no zone. */
export function createScheduleForm(): ScheduleForm {
  return new FormGroup({
    timeZoneId: new FormControl('', {
      nonNullable: true,
      validators: scheduleValidators.timeZoneId,
    }),
    days: new FormArray(DAYS.map(createDay)),
  });
}

interface HoursLike {
  dayOfWeek: DayName | number;
  opensAt: string;
  closesAt: string;
}

function nameOf(day: DayName | number): DayName {
  return typeof day === 'number' ? DAY_NAMES[day] : day;
}

/**
 * Seeds the form from a branch: days absent from `workingHours` are closed, times are cut to
 * `HH:mm` (the backend may serialise `TimeOnly` with seconds) and the form becomes pristine.
 */
export function fromBranch(
  form: ScheduleForm,
  branch: { timeZoneId: string | null; workingHours: readonly HoursLike[] },
): void {
  const byDay = new Map(branch.workingHours.map((h) => [nameOf(h.dayOfWeek), h]));
  form.controls.timeZoneId.setValue(branch.timeZoneId ?? '');
  for (const row of form.controls.days.controls) {
    const hours = byDay.get(row.controls.day.value);
    row.patchValue({
      open: !!hours,
      opensAt: hours ? normaliseTime(hours.opensAt) : '',
      closesAt: hours ? normaliseTime(hours.closesAt) : '',
    });
  }
  form.markAsPristine();
  form.markAsUntouched();
}

/** The request body: open days only, Monday first, `dayOfWeek` as the name, times as `HH:mm`. */
export function toRequest(form: ScheduleForm): ScheduleBody {
  return {
    timeZoneId: form.controls.timeZoneId.value,
    workingHours: form.controls.days.controls
      .filter((row) => row.controls.open.value)
      .map((row) => ({
        dayOfWeek: row.controls.day.value,
        opensAt: normaliseTime(row.controls.opensAt.value),
        closesAt: normaliseTime(row.controls.closesAt.value),
      })),
  };
}

/** Opens or closes a day; an opened day with no times gets 09:00 to 17:00. */
export function setDayOpen(row: DayGroup, open: boolean): void {
  row.controls.open.setValue(open);
  if (open && row.controls.opensAt.value === '' && row.controls.closesAt.value === '') {
    row.patchValue({ opensAt: DEFAULT_OPENS, closesAt: DEFAULT_CLOSES });
  }
  row.markAsDirty();
}

/** Monday is open and valid, so there is something to copy. */
export function canCopyMonday(form: ScheduleForm): boolean {
  const monday = form.controls.days.at(0);
  return monday.controls.open.value && scheduleRowError(monday.getRawValue()) === null;
}

/** Copies Monday's three values to Tuesday through Friday and marks the form dirty. */
export function copyMondayToWeekdays(form: ScheduleForm): boolean {
  if (!canCopyMonday(form)) return false;
  const { opensAt, closesAt } = form.controls.days.at(0).getRawValue();
  for (const row of form.controls.days.controls.slice(1, 5)) {
    row.patchValue({ open: true, opensAt, closesAt });
  }
  form.markAsDirty();
  return true;
}

export function closeAll(form: ScheduleForm): void {
  for (const row of form.controls.days.controls) row.controls.open.setValue(false);
  form.markAsDirty();
}

export function hasOpenDay(form: ScheduleForm): boolean {
  return form.controls.days.controls.some((row) => row.controls.open.value);
}

/**
 * Stable string of what would be sent (zone plus the request's open days), so a closed day's
 * leftover times and `HH:mm:ss` against `HH:mm` never count as a change.
 */
export function scheduleSnapshot(form: ScheduleForm): string {
  return formSnapshot(toRequest(form));
}
