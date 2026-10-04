/** The id of option `index` in a listbox, as named by `aria-activedescendant`. */
export function optionId(idPrefix: string, index: number): string {
  return `${idPrefix}-opt-${index}`;
}
