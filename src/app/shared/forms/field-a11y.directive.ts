import { Directive, input } from '@angular/core';
import { FieldView } from './field-view';

/** Wires an input to its `FieldView`: invalid state, description ids and required. */
@Directive({
  selector: 'input[appField]',
  host: {
    '[attr.aria-invalid]': 'view().error() ? "true" : null',
    '[attr.aria-describedby]': 'view().describedBy()',
    'aria-required': 'true',
  },
})
export class FieldA11yDirective {
  readonly view = input.required<FieldView>({ alias: 'appField' });
}
