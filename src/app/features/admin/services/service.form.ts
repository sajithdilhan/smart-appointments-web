import { FormControl, FormGroup, type ValidatorFn } from '@angular/forms';
import type { CreateServiceBody, ServiceType, UpdateServiceBody } from '../../../core/api/models';
import { formSnapshot, type Normalisers } from '../shared/dirty/form-snapshot';
import { normaliseCode } from '../validation/service-rules';
import { serviceValidators } from '../validation/validators';

export type ServiceMode = 'create' | 'edit';
export type ServiceForm = ReturnType<typeof createServiceForm>;
export type ServiceValues = ReturnType<ServiceForm['getRawValue']>;

export const DEFAULT_DURATION = 30;

const NORMALISERS: Normalisers = { code: normaliseCode };

/** The code is only validated on create; on edit it is shown read-only and never sent. */
export function createServiceForm(mode: ServiceMode) {
  const text = (...validators: ValidatorFn[]) =>
    new FormControl('', { nonNullable: true, validators });
  return new FormGroup({
    code: text(...(mode === 'create' ? [serviceValidators.code] : [])),
    name: text(serviceValidators.name),
    description: text(serviceValidators.description),
    durationMinutes: new FormControl(DEFAULT_DURATION, {
      nonNullable: true,
      validators: serviceValidators.durationMinutes,
    }),
  });
}

export function fillServiceForm(form: ServiceForm, service: ServiceType): void {
  form.reset({
    code: service.code,
    name: service.name,
    description: service.description ?? '',
    durationMinutes: service.durationMinutes,
  });
}

export const serviceSnapshot = (form: ServiceForm): string =>
  formSnapshot(form.getRawValue(), NORMALISERS);

const common = (v: ServiceValues) => ({
  name: v.name.trim(),
  description: v.description.trim() === '' ? null : v.description.trim(),
  durationMinutes: v.durationMinutes,
});

export const toCreateBody = (v: ServiceValues): CreateServiceBody => ({
  code: v.code.trim(),
  ...common(v),
});

export const toUpdateBody = (v: ServiceValues): UpdateServiceBody => common(v);
