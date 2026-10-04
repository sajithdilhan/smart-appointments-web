import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OutageBanner } from '@app/shared/layout/outage-banner';
import { HlmToaster } from '@app/shared/ui/sonner';

@Component({
  imports: [RouterOutlet, HlmToaster, OutageBanner],
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
