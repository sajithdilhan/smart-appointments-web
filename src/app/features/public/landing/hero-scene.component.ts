import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A decorative flat illustration of a clinic reception: lavender blobs, a wall sign, a desk,
 * a chair and a plant. Inline SVG only; colours come from fill utilities so dark mode
 * switches through classes. Hidden from assistive technology.
 */
@Component({
  selector: 'app-hero-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 560 470" class="h-auto w-full" aria-hidden="true" focusable="false">
      <!-- Blobs -->
      <path
        class="fill-lavender-200 dark:fill-lavender-900/60"
        d="M118 66c62-52 178-60 262-30 86 31 162 92 160 192-2 96-66 170-160 192-92 21-168-10-238-50C54 322 8 266 14 196 20 138 62 110 118 66z"
      />
      <path
        class="fill-lavender-100 dark:fill-lavender-800/40"
        d="M470 40c40 8 70 40 66 78-4 36-40 46-70 36-34-12-52-40-44-70 6-24 24-48 48-44z"
      />
      <circle class="fill-lavender-300 dark:fill-lavender-700/50" cx="60" cy="392" r="26" />

      <!-- Back wall panel -->
      <rect
        x="104"
        y="92"
        width="372"
        height="236"
        rx="22"
        class="fill-lavender-50 dark:fill-brand-950/70"
      />
      <!-- Wall sign: a plus on a rounded tile -->
      <rect
        x="244"
        y="118"
        width="104"
        height="62"
        rx="12"
        class="fill-brand-500 dark:fill-brand-400"
      />
      <rect x="288" y="132" width="16" height="34" rx="3" class="fill-white dark:fill-brand-950" />
      <rect x="279" y="141" width="34" height="16" rx="3" class="fill-white dark:fill-brand-950" />
      <!-- Window -->
      <rect
        x="132"
        y="122"
        width="76"
        height="108"
        rx="10"
        class="fill-lavender-200 dark:fill-lavender-900"
      />
      <path
        d="M170 122v108M132 176h76"
        stroke-width="5"
        class="stroke-lavender-50 dark:stroke-brand-950"
      />
      <!-- Wall clock -->
      <circle cx="414" cy="150" r="22" class="fill-white dark:fill-lavender-200" />
      <path
        d="M414 136v14l10 6"
        fill="none"
        stroke-width="3"
        stroke-linecap="round"
        class="stroke-brand-600"
      />

      <!-- Floor shadow -->
      <ellipse
        cx="300"
        cy="404"
        rx="240"
        ry="24"
        class="fill-lavender-300/70 dark:fill-brand-950/80"
      />

      <!-- Desk -->
      <rect
        x="196"
        y="262"
        width="268"
        height="22"
        rx="8"
        class="fill-brand-700 dark:fill-brand-300"
      />
      <rect x="208" y="284" width="244" height="112" rx="10" class="fill-brand-500" />
      <rect
        x="226"
        y="302"
        width="96"
        height="76"
        rx="8"
        class="fill-brand-400 dark:fill-brand-600"
      />
      <rect
        x="338"
        y="302"
        width="96"
        height="76"
        rx="8"
        class="fill-brand-400 dark:fill-brand-600"
      />
      <!-- Monitor and service bell -->
      <rect
        x="258"
        y="206"
        width="78"
        height="52"
        rx="6"
        class="fill-brand-900 dark:fill-brand-950"
      />
      <rect
        x="266"
        y="214"
        width="62"
        height="36"
        rx="3"
        class="fill-lavender-200 dark:fill-lavender-800"
      />
      <rect x="290" y="256" width="14" height="6" class="fill-brand-900 dark:fill-brand-950" />
      <path d="M392 262c0-14 8-22 20-22s20 8 20 22z" class="fill-lavender-400" />
      <circle cx="412" cy="236" r="4" class="fill-lavender-600" />

      <!-- Waiting chair -->
      <rect
        x="62"
        y="262"
        width="22"
        height="86"
        rx="10"
        class="fill-lavender-500 dark:fill-lavender-400"
      />
      <rect
        x="62"
        y="320"
        width="100"
        height="30"
        rx="12"
        class="fill-lavender-400 dark:fill-lavender-500"
      />
      <rect
        x="78"
        y="350"
        width="8"
        height="46"
        rx="3"
        class="fill-brand-800 dark:fill-brand-200"
      />
      <rect
        x="138"
        y="350"
        width="8"
        height="46"
        rx="3"
        class="fill-brand-800 dark:fill-brand-200"
      />

      <!-- Plant -->
      <path d="M514 396h-56l8-62h40z" class="fill-brand-700 dark:fill-brand-300" />
      <path
        d="M486 334c-30-20-40-60-24-96 24 14 34 54 24 96z"
        class="fill-lavender-500 dark:fill-lavender-400"
      />
      <path
        d="M486 334c4-44 24-80 58-90 4 38-14 74-58 90z"
        class="fill-lavender-600 dark:fill-lavender-300"
      />
      <path
        d="M486 334c-4-34 2-68 22-96 12 34 4 72-22 96z"
        class="fill-lavender-400 dark:fill-lavender-500"
      />

      <!-- Sparkles -->
      <g
        fill="none"
        stroke-width="4"
        stroke-linecap="round"
        class="stroke-lavender-500 dark:stroke-lavender-300"
      >
        <path d="M60 130v22M49 141h22" />
        <path d="M514 304l12 12M526 304l-12 12" />
        <path d="M430 56l8 8M438 56l-8 8" />
      </g>
    </svg>
  `,
})
export class HeroSceneComponent {}
