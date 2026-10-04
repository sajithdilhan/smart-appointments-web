import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type AuthIllustrationVariant = 'login' | 'register';

/** Decorative inline SVG for the auth panel: a calendar card with a check (login) or a plus (register). */
@Component({
  selector: 'app-auth-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 320 280"
      class="h-auto w-full max-w-sm"
      role="presentation"
      focusable="false"
      aria-hidden="true"
      fill="none"
    >
      <rect x="40" y="40" width="240" height="200" rx="20" fill="#fff" fill-opacity="0.95" />
      <rect x="40" y="40" width="240" height="52" rx="20" class="fill-brand-400" />
      <rect x="40" y="72" width="240" height="20" class="fill-brand-400" />
      <rect x="84" y="24" width="12" height="32" rx="6" class="fill-brand-300" />
      <rect x="224" y="24" width="12" height="32" rx="6" class="fill-brand-300" />
      @switch (variant()) {
        @case ('login') {
          <circle
            cx="160"
            cy="166"
            r="40"
            class="fill-brand-100 stroke-brand-400"
            stroke-width="3"
          />
          <path
            d="M142 167l12 12 24-26"
            class="stroke-brand-700"
            stroke-width="9"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        }
        @case ('register') {
          <circle
            cx="116"
            cy="160"
            r="30"
            class="fill-brand-100 stroke-brand-400"
            stroke-width="3"
          />
          <path
            d="M116 144v32M100 160h32"
            class="stroke-brand-700"
            stroke-width="8"
            stroke-linecap="round"
          />
          <rect x="164" y="132" width="86" height="22" rx="11" class="fill-brand-200" />
          <rect x="164" y="162" width="86" height="22" rx="11" class="fill-brand-300" />
          <rect x="164" y="192" width="86" height="22" rx="11" class="fill-brand-100" />
        }
      }
    </svg>
  `,
})
export class AuthIllustrationComponent {
  readonly variant = input.required<AuthIllustrationVariant>();
}
