import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';

/** Unknown, someone else's and non-GUID ids all end here (Req 5.3): no distinction. */
@Component({
  selector: 'app-appointment-not-found',
  imports: [RouterLink, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-3xl flex-col items-start gap-3 px-4 py-6">
      <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight outline-none">
        Appointment not found
      </h1>
      <p class="text-muted-foreground">
        We could not find this appointment. It may have been removed, or the link is wrong.
      </p>
      <a hlmBtn variant="outline" routerLink="/appointments">Back to my appointments</a>
    </div>
  `,
})
export class AppointmentNotFound {}
