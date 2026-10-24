export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'digit' | 'special';

export interface PasswordRule {
  readonly id: PasswordRuleId;
  readonly label: string;
  test(p: string): boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One digit (0-9)', test: (p) => /[0-9]/.test(p) },
  {
    id: 'special',
    label: 'One special character, for example ! or @ (an underscore does not count)',
    // The complement of .NET's \w, which is what the backend checks.
    test: (p) => /[^\p{L}\p{Mn}\p{Nd}\p{Pc}]/u.test(p),
  },
];

export interface PasswordRuleResult {
  readonly id: PasswordRuleId;
  readonly label: string;
  readonly met: boolean;
}

export function evaluatePasswordRules(p: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, met: r.test(p) }));
}

export function passwordIsValid(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}
