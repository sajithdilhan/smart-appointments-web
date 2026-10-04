import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@app/shared/ui/button';
import { HlmCardImports } from '@app/shared/ui/card';
import { HlmInputImports } from '@app/shared/ui/input';
import { HlmLabelImports } from '@app/shared/ui/label';
import { HlmToaster } from '@app/shared/ui/sonner';
import { ThemeToggle } from '@app/shared/ui/theme-toggle';

@Component({
  imports: [
    RouterOutlet,
    ThemeToggle,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmToaster,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
