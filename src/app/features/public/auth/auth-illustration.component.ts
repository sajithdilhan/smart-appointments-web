import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type AuthIllustrationVariant = 'login' | 'register';

/**
 * Decorative inline SVG for the auth panel: a 3D-style pastel calendar with binding rings, a mint
 * check badge, a plant behind it and floating bubbles. Theme-independent (it sits on the gradient);
 * the two variants differ in the day marked on the calendar face.
 */
@Component({
  selector: 'app-auth-illustration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 360 320"
      class="mx-auto h-auto w-full max-w-sm"
      role="presentation"
      focusable="false"
      aria-hidden="true"
      fill="none"
    >
      <!-- bubbles -->
      <circle cx="46" cy="70" r="14" fill="#fff" fill-opacity="0.22" />
      <circle cx="318" cy="52" r="9" fill="#fff" fill-opacity="0.28" />
      <circle cx="334" cy="150" r="18" fill="#fff" fill-opacity="0.16" />
      <circle cx="30" cy="190" r="8" fill="#fff" fill-opacity="0.26" />
      <circle cx="300" cy="262" r="6" fill="#fff" fill-opacity="0.3" />
      <!-- shadow -->
      <ellipse cx="180" cy="296" rx="124" ry="14" fill="#1e1b4b" fill-opacity="0.28" />
      <!-- plant behind -->
      <g transform="translate(30 -6)">
        <path
          d="M272 262c-6-34-2-62 10-92"
          stroke="#34d399"
          stroke-width="5"
          stroke-linecap="round"
        />
        <path d="M282 172c-20-4-32-18-34-36 20 0 34 14 34 36z" fill="#6ee7b7" />
        <path d="M278 204c18-6 36-2 46-22-22-6-42 4-46 22z" fill="#34d399" />
        <path d="M272 236c-18-8-30-24-30-40 20 4 32 18 30 40z" fill="#a7f3d0" />
        <path d="M252 262h46l-5 32h-36z" fill="#fdba74" />
        <rect x="248" y="256" width="54" height="10" rx="5" fill="#fb923c" />
      </g>
      <!-- calendar body (depth, then face) -->
      <rect x="64" y="64" width="212" height="216" rx="26" fill="#a78bfa" />
      <rect x="56" y="56" width="212" height="216" rx="26" fill="#ede9fe" />
      <path d="M56 82a26 26 0 0 1 26-26h160a26 26 0 0 1 26 26v34H56z" fill="#c4b5fd" />
      <path d="M268 236l-34 36a26 26 0 0 0 8 0 26 26 0 0 0 26-26z" fill="#ddd6fe" />
      <!-- binding rings -->
      <rect x="102" y="34" width="14" height="46" rx="7" fill="#6d28d9" />
      <rect x="208" y="34" width="14" height="46" rx="7" fill="#6d28d9" />
      <rect x="104" y="36" width="4" height="30" rx="2" fill="#fff" fill-opacity="0.45" />
      <rect x="210" y="36" width="4" height="30" rx="2" fill="#fff" fill-opacity="0.45" />
      <!-- day cells -->
      <g fill="#c4b5fd">
        <rect x="84" y="136" width="26" height="20" rx="6" />
        <rect x="120" y="136" width="26" height="20" rx="6" />
        <rect x="156" y="136" width="26" height="20" rx="6" />
        <rect x="192" y="136" width="26" height="20" rx="6" />
        <rect x="84" y="226" width="26" height="20" rx="6" />
        <rect x="120" y="226" width="26" height="20" rx="6" />
        <rect x="192" y="226" width="26" height="20" rx="6" />
      </g>
      @switch (variant()) {
        @case ('login') {
          <rect x="84" y="166" width="26" height="20" rx="6" fill="#c4b5fd" />
          <rect x="120" y="166" width="26" height="20" rx="6" fill="#c4b5fd" />
          <rect x="192" y="196" width="26" height="20" rx="6" fill="#c4b5fd" />
        }
        @case ('register') {
          <rect x="84" y="196" width="26" height="20" rx="6" fill="#c4b5fd" />
          <rect x="156" y="166" width="26" height="20" rx="6" fill="#c4b5fd" />
          <rect x="192" y="166" width="26" height="20" rx="6" fill="#c4b5fd" />
        }
      }
      <!-- check badge -->
      <circle
        cx="176"
        cy="206"
        r="40"
        fill="#059669"
        fill-opacity="0.25"
        transform="translate(4 6)"
      />
      <circle cx="176" cy="206" r="40" fill="#34d399" />
      <circle cx="176" cy="206" r="40" stroke="#fff" stroke-opacity="0.7" stroke-width="4" />
      <path
        d="M158 207l14 14 28-30"
        stroke="#fff"
        stroke-width="10"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
})
export class AuthIllustrationComponent {
  readonly variant = input.required<AuthIllustrationVariant>();
}
