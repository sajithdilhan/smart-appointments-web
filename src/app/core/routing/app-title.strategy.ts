import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'Smart Appointments';

/**
 * One title format for the whole app: "<Page> | Smart Appointments", or the bare application
 * name when a route sets no title (or its title is empty or not a string). A route `title`
 * may be a string or a function; Angular resolves a function before this runs.
 */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let page: unknown;
    try {
      page = this.buildTitle(snapshot);
    } catch {
      page = undefined;
    }
    const text = typeof page === 'string' ? page.trim() : '';
    this.title.setTitle(text ? `${text} | ${APP_NAME}` : APP_NAME);
  }
}
