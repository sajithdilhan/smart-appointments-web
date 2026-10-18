import { render, screen } from '@testing-library/angular';
import { HeroPreviewComponent } from './hero-preview.component';
import { HowItWorksComponent } from './how-it-works.component';
import { ValuePropsComponent } from './value-props.component';

describe('landing sections', () => {
  it('value props: a labelled section with an h2 and four items', async () => {
    await render(ValuePropsComponent);
    const region = screen.getByRole('region', { name: /booking, without the back and forth/i });
    expect(region.querySelector('h2')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    for (const title of [
      'See real availability',
      'Confirmed straight away',
      'Times that make sense',
      'Cancel when plans change',
    ]) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeTruthy();
    }
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
  ])('%s: no <img>, no external URL and no h1', async (_name, component) => {
    const { container } = await render(component);
    expect(container.querySelector('img, h1')).toBeNull();
    expect(container.innerHTML.replace(/xmlns="[^"]*"/g, '')).not.toMatch(/https?:\/\//);
  });
});
