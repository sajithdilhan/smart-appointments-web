import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OutageBanner } from '@app/shared/layout/outage-banner';
import { HlmToaster } from '@app/shared/ui/sonner';
import { RouteAnnouncer } from './shared/layout/route-announcer';
import { RouteProgress } from './shared/layout/route-progress';

@Component({
  imports: [RouterOutlet, HlmToaster, OutageBanner, RouteProgress, RouteAnnouncer],
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
