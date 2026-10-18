import { render, screen } from '@testing-library/angular';
import { HeroSceneComponent } from './hero-scene.component';
import { HeroPreviewComponent } from './hero-preview.component';
import { HowItWorksComponent } from './how-it-works.component';
import { ValuePropsComponent } from './value-props.component';

describe('landing sections', () => {
  it('value props: a labelled "Why choose us?" section with four cards', async () => {
    const { container } = await render(ValuePropsComponent);
    const region = screen.getByRole('region', { name: 'Why choose us?' });
    expect(region.querySelector('h2')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    const cards = [
      ['Fast & easy booking', 'Book in seconds, anytime.', 'lavender'],
      ['Instant confirmation', 'Get your booking details immediately.', 'blue'],
      ['Multiple branches', 'Find a branch near you.', 'mint'],
      ['Flexible cancellation', 'Cancel online anytime, hassle-free.', 'peach'],
    ] as const;
    const items = [...container.querySelectorAll('li')];
    cards.forEach(([title, text, tint], i) => {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeTruthy();
      expect(items[i].querySelector('p')?.textContent?.trim()).toBe(text);
      const tile = items[i].querySelector('span')!;
      expect(tile.classList.contains(`bg-tile-${tint}`)).toBe(true);
      expect(tile.classList.contains(`text-tile-${tint}-foreground`)).toBe(true);
      expect(tile.querySelector('ng-icon')?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('how it works: a labelled section with an ordered list of three steps', async () => {
    const { container } = await render(HowItWorksComponent);
    expect(screen.getByRole('region', { name: 'How it works' })).toBeTruthy();
    const list = container.querySelector('ol')!;
    expect(
      [...list.querySelectorAll('li')].map((li) => li.textContent?.replace(/^\s*\d\s*/, '').trim()),
    ).toEqual(['Choose a branch and service', 'Pick a day and time', 'Get confirmed']);
  });

  it('hero preview: decorative, inert and without images or links', async () => {
    const { container } = await render(HeroPreviewComponent);
    const root = container.querySelector('[aria-hidden="true"]')!;
    expect(root.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('img, a, button, input')).toBeNull();
  });

  it.each([
    ['value props', ValuePropsComponent],
    ['how it works', HowItWorksComponent],
    ['hero preview', HeroPreviewComponent],
    ['hero scene', HeroSceneComponent],
  ])('%s: no <img>, no external URL and no h1', async (_name, component) => {
    const { container } = await render(component);
    expect(container.querySelector('img, h1')).toBeNull();
    expect(container.innerHTML.replace(/xmlns="[^"]*"/g, '')).not.toMatch(/https?:\/\//);
  });
});
