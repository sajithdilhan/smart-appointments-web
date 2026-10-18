import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provideRouter } from '@angular/router';
import { render, screen, within } from '@testing-library/angular';
import { createFakeSession, provideFakeSession } from '../../../../testing/fake-session';
import { ROLES, type Role } from '../../../core/auth/session.model';
import { CtaBandComponent } from './cta-band.component';
import { HeroComponent } from './hero.component';
import { LandingPage } from './landing.page';

const landing: Record<Role, string> = { Customer: '/book', Admin: '/admin', Staff: '/staff' };
const dir = join(process.cwd(), 'src/app/features/public/landing');

function renderLanding(who: 'anonymous' | Role = 'anonymous', component = LandingPage) {
  const session =
    who === 'anonymous' ? createFakeSession('anonymous') : createFakeSession('authenticated', who);
  return render(component, { providers: [provideRouter([]), ...provideFakeSession(session)] });
}

describe('LandingPage', () => {
  it('has exactly one h1 and the sections in order, each a labelled region', async () => {
    const { container } = await renderLanding();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Book your next appointment in minutes.' }),
    ).toBeTruthy();
    const headings = [...container.querySelectorAll('h1, h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual([
      'Book your next appointment in minutes.',
      'Booking, without the back and forth',
      'How it works',
      'Ready to book?',
    ]);
    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(4);
    for (const region of regions) expect(region.getAttribute('aria-labelledby')).toBeTruthy();
    expect(regions.map((r) => r.querySelector('h1, h2')?.textContent?.trim())).toEqual(headings);
  });

  it('offers sign-up and log-in to a visitor, in the hero and in the closing band', async () => {
    await renderLanding();
    const hero = screen.getByRole('region', { name: /book your next appointment/i });
    const band = screen.getByRole('region', { name: 'Ready to book?' });
    for (const area of [hero, band]) {
      expect(
        within(area).getByRole('link', { name: 'Create an account' }).getAttribute('href'),
      ).toBe('/register');
      expect(within(area).getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe(
        '/login',
      );
    }
  });

  it.each(ROLES)('offers only the dashboard to a signed-in %s', async (role) => {
    await renderLanding(role);
    const links = screen.getAllByRole('link', { name: 'Go to my dashboard' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe(landing[role]);
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Create an account' })).toBeNull();
  });

  it('issues no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    await renderLanding();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it.each([
    ['hero', HeroComponent],
    ['closing band', CtaBandComponent],
  ])('%s: no <img> and no external URL', async (_name, component) => {
    const { container } = await renderLanding('anonymous', component as never);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML.replace(/xmlns="[^"]*"/g, '')).not.toMatch(/https?:\/\//);
  });

  it('puts the entrance animation on the hero children', async () => {
    const { container } = await renderLanding();
    expect(container.querySelectorAll('.hero .reveal').length).toBeGreaterThanOrEqual(3);
  });
});

describe('hero stylesheet', () => {
  const css = readFileSync(join(dir, 'hero.component.css'), 'utf8');
  const template = readFileSync(join(dir, 'hero.component.html'), 'utf8');

  it('switches the entrance animation off under prefers-reduced-motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.reveal\s*\{\s*animation: none;/,
    );
  });

  it('keeps the entrance short, transform and opacity only, and not looping', () => {
    const animation = /\.reveal\s*\{[^}]*animation:\s*reveal\s+(\d+)ms/.exec(css);
    expect(Number(animation?.[1])).toBeLessThanOrEqual(400);
    expect(css).not.toMatch(/infinite/);
    const withoutDataUris = css.replace(/url\("data:[^"]*"\)/g, '');
    expect(withoutDataUris).not.toMatch(/url\(/);
  });

  it('uses no raster image or third-party origin', () => {
    expect(template).not.toMatch(/<img|https?:\/\//);
    expect(css.replace(/xmlns='[^']*'/g, '')).not.toMatch(/https?:\/\//);
  });
});
