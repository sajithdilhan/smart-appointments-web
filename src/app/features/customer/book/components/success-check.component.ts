import { ChangeDetectionStrategy, Component } from '@angular/core';

/** An SVG check that draws itself in 600 ms; the draw is off under reduced motion. */
@Component({
  selector: 'app-success-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .check {
      stroke-dasharray: 30;
      stroke-dashoffset: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
      .check {
        animation: draw 600ms ease-out both;
      }
      .ring {
        animation: fade 300ms ease-out both;
      }
    }
    @keyframes draw {
      from {
        stroke-dashoffset: 30;
      }
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
  `,
  template: `
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 48"
      class="size-12 text-success"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle class="ring" cx="24" cy="24" r="21" />
      <path class="check" d="M14 25l7 7 13-15" />
    </svg>
  `,
})
export class SuccessCheckComponent {}
