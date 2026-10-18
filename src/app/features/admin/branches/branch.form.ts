import { FormControl, FormGroup, type ValidatorFn } from '@angular/forms';
import type { Branch, CreateBranchBody, UpdateBranchBody } from '../../../core/api/models';
import { normalizePhone } from '../../../shared/forms';
import { formSnapshot, type Normalisers } from '../shared/dirty/form-snapshot';
import { normaliseCode } from '../validation/branch-rules';
import { branchValidators } from '../validation/validators';

export type BranchMode = 'create' | 'edit';

export type BranchForm = ReturnType<typeof createBranchForm>;
export type BranchValues = ReturnType<BranchForm['getRawValue']>;

/** Cosmetic differences that never make the form dirty: code case, phone separators. */
export const BRANCH_NORMALISERS: Normalisers = {
  code: normaliseCode,
  phoneNumber: normalizePhone,
};

/** The code is only validated on create; on edit it is shown read-only and never sent. */
export function createBranchForm(mode: BranchMode) {
  const text = (...validators: ValidatorFn[]) =>
    new FormControl('', { nonNullable: true, validators });
  return new FormGroup({
    code: text(...(mode === 'create' ? [branchValidators.code] : [])),
    name: text(branchValidators.name),
    description: text(branchValidators.description),
    address: text(branchValidators.address),
    phoneNumber: text(branchValidators.phoneNumber(normalizePhone)),
  });
}

export function fillBranchForm(form: BranchForm, branch: Branch): void {
  form.reset({
    code: branch.code,
    name: branch.name,
    description: branch.description ?? '',
    address: branch.address,
    phoneNumber: branch.phoneNumber,
  });
}

export const branchSnapshot = (form: BranchForm): string =>
  formSnapshot(form.getRawValue(), BRANCH_NORMALISERS);

const common = (v: BranchValues) => ({
  name: v.name.trim(),
  description: v.description.trim() === '' ? null : v.description.trim(),
  address: v.address.trim(),
  phoneNumber: normalizePhone(v.phoneNumber.trim()),
});

export const toCreateBody = (v: BranchValues): CreateBranchBody => ({
  code: v.code.trim(),
  ...common(v),
});

export const toUpdateBody = (v: BranchValues): UpdateBranchBody => common(v);
