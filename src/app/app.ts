import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmCardImports } from '@app/shared/ui/card';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';

@Component({
  imports: [RouterOutlet, HlmButtonImports, HlmCardImports, HlmInputImports, HlmLabelImports],
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
