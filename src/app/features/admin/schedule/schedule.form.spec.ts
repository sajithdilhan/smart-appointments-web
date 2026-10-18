import {
  DAYS,
  canCopyMonday,
  closeAll,
  copyMondayToWeekdays,
  createScheduleForm,
  fromBranch,
  hasOpenDay,
  scheduleSnapshot,
  setDayOpen,
  toRequest,
} from './schedule.form';

const branch = {
  timeZoneId: 'Asia/Colombo',
  workingHours: [
    { dayOfWeek: 'Monday' as const, opensAt: '09:00:00', closesAt: '17:00:00' },
    { dayOfWeek: 'Saturday' as const, opensAt: '10:00', closesAt: '13:30' },
  ],
};

describe('schedule form', () => {
  it('always has seven closed rows, Monday first, and no zone', () => {
    const form = createScheduleForm();
    expect(form.controls.days.controls.map((r) => r.controls.day.value)).toEqual([...DAYS]);
    expect(DAYS[0]).toBe('Monday');
    expect(DAYS[6]).toBe('Sunday');
    expect(hasOpenDay(form)).toBe(false);
    expect(form.controls.timeZoneId.hasError('required')).toBe(true);
    expect(toRequest(form)).toEqual({ timeZoneId: '', workingHours: [] });
  });

  it('fromBranch: absent days are closed, seconds are cut and the form is pristine', () => {
    const form = createScheduleForm();
    form.markAsDirty();
    fromBranch(form, branch);
    const rows = form.controls.days.controls;
    expect(rows[0].getRawValue()).toEqual({
      day: 'Monday',
      open: true,
      opensAt: '09:00',
      closesAt: '17:00',
    });
    expect(rows[1].controls.open.value).toBe(false);
    expect(rows[5].getRawValue()).toMatchObject({
      open: true,
      opensAt: '10:00',
      closesAt: '13:30',
    });
    expect(form.value.timeZoneId).toBe('Asia/Colombo');
    expect(form.pristine).toBe(true);
  });

  it('fromBranch accepts a branch with no schedule and a numeric day (0 = Sunday)', () => {
    const form = createScheduleForm();
    fromBranch(form, { timeZoneId: null, workingHours: [] });
    expect(form.controls.timeZoneId.value).toBe('');
    fromBranch(form, {
      timeZoneId: 'UTC',
      workingHours: [{ dayOfWeek: 0, opensAt: '08:00', closesAt: '09:00' }],
    });
    expect(form.controls.days.at(6).controls.open.value).toBe(true);
  });

  it('toRequest lists open days only, Monday first, as names and HH:mm', () => {
    const form = createScheduleForm();
    fromBranch(form, branch);
    form.controls.days.at(6).patchValue({ open: true, opensAt: '12:00:00', closesAt: '14:00' });
    expect(toRequest(form)).toEqual({
      timeZoneId: 'Asia/Colombo',
      workingHours: [
        { dayOfWeek: 'Monday', opensAt: '09:00', closesAt: '17:00' },
        { dayOfWeek: 'Saturday', opensAt: '10:00', closesAt: '13:30' },
        { dayOfWeek: 'Sunday', opensAt: '12:00', closesAt: '14:00' },
      ],
    });
  });

  it('opening a day with no times fills 09:00 to 17:00 and marks it dirty; closing keeps the times', () => {
    const form = createScheduleForm();
    const row = form.controls.days.at(2);
    setDayOpen(row, true);
    expect(row.getRawValue()).toMatchObject({ open: true, opensAt: '09:00', closesAt: '17:00' });
    expect(row.dirty).toBe(true);
    row.patchValue({ opensAt: '10:00' });
    setDayOpen(row, false);
    expect(row.controls.opensAt.value).toBe('10:00');
    setDayOpen(row, true);
    expect(row.controls.opensAt.value).toBe('10:00'); // not overwritten
  });

  describe('row validation', () => {
    it('reports one error key per open row only', () => {
      const form = createScheduleForm();
      const row = form.controls.days.at(0);
      expect(row.valid).toBe(true); // closed
      row.patchValue({ open: true, opensAt: '', closesAt: '' });
      expect(row.errors).toEqual({ opensRequired: true });
      row.patchValue({ opensAt: '9:00', closesAt: '17:00' });
      expect(row.errors).toEqual({ opensFormat: true });
      row.patchValue({ opensAt: '09:00', closesAt: '09:00' });
      expect(row.errors).toEqual({ order: true });
      row.patchValue({ closesAt: '17:00' });
      expect(row.valid).toBe(true);
    });
  });

  describe('copy Monday to weekdays', () => {
    it('is unavailable while Monday is closed or invalid', () => {
      const form = createScheduleForm();
      expect(canCopyMonday(form)).toBe(false);
      expect(copyMondayToWeekdays(form)).toBe(false);
      form.controls.days.at(0).patchValue({ open: true, opensAt: '09:00', closesAt: '09:00' });
      expect(canCopyMonday(form)).toBe(false);
    });

    it('copies the three values to Tuesday through Friday and marks the form dirty', () => {
      const form = createScheduleForm();
      fromBranch(form, branch);
      expect(copyMondayToWeekdays(form)).toBe(true);
      const open = form.controls.days.controls.map((r) => r.controls.open.value);
      expect(open).toEqual([true, true, true, true, true, true, false]);
      for (const row of form.controls.days.controls.slice(1, 5)) {
        expect(row.getRawValue()).toMatchObject({ opensAt: '09:00', closesAt: '17:00' });
      }
      expect(form.controls.days.at(5).controls.opensAt.value).toBe('10:00'); // Saturday untouched
      expect(form.dirty).toBe(true);
    });
  });

  it('closeAll closes every day and marks the form dirty', () => {
    const form = createScheduleForm();
    fromBranch(form, branch);
    closeAll(form);
    expect(hasOpenDay(form)).toBe(false);
    expect(toRequest(form).workingHours).toEqual([]);
    expect(form.dirty).toBe(true);
  });

  describe('snapshot', () => {
    it('ignores seconds and the leftover times of a closed day, and sees real changes', () => {
      const a = createScheduleForm();
      const b = createScheduleForm();
      fromBranch(a, branch);
      fromBranch(b, branch);
      b.controls.days.at(2).patchValue({ opensAt: '11:11', closesAt: '12:00' }); // closed row
      b.controls.days.at(0).patchValue({ opensAt: '09:00:00' });
      expect(scheduleSnapshot(b)).toBe(scheduleSnapshot(a));
      b.controls.days.at(0).patchValue({ opensAt: '09:05' });
      expect(scheduleSnapshot(b)).not.toBe(scheduleSnapshot(a));
      fromBranch(b, branch);
      b.controls.timeZoneId.setValue('Europe/London');
      expect(scheduleSnapshot(b)).not.toBe(scheduleSnapshot(a));
    });
  });
});
