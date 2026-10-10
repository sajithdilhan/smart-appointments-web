import { screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  BRANCH_IDS,
  SERVICE_IDS,
  createBookingBackend,
} from '../../../../../testing/booking-backend';
import { BOOK_BASE, renderBook } from '../../../../../testing/render-book';

const LONDON = BRANCH_IDS.london;
const url = `/book?branch=${LONDON}`;
const card = (name: string) => screen.getByRole('radio', { name });

describe('ServiceStepComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the services sorted by name with a duration pill, in a radiogroup named Service', async () => {
    await renderBook({ url });
    await screen.findByRole('radio', { name: 'Check-up' });
    expect(screen.getByRole('radiogroup', { name: 'Service' })).toBeTruthy();
    const names = screen
      .getAllByRole('radio')
      .map((r) => within(r).getAllByText(/./)[0].textContent?.trim());
    expect(names).toEqual(['Check-up', 'Consultation', 'Long session']);
    expect(within(card('Check-up')).getByText('30 min')).toBeTruthy();
    expect(within(card('Consultation')).getByText('45 min')).toBeTruthy();
    expect(within(card('Long session')).getByText('1 h')).toBeTruthy();
  });

  it('shows the chosen branch with a Change button that returns to step 1 and drops the rest', async () => {
    const view = await renderBook({
      url: `/book?branch=${LONDON}&service=${SERVICE_IDS.checkup}&date=2026-10-05`,
    });
    await screen.findByRole('heading', { level: 2, name: 'Choose a date and time' });
    await userEvent.setup().click(screen.getByRole('button', { name: '2. Service' }));
    await screen.findByRole('heading', { level: 2, name: 'Choose a service' });
    expect(screen.getByText(/10 Baker Street, London/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Change branch' }));
    await screen.findByRole('heading', { level: 2, name: 'Choose a branch' });
    expect(view.router.url).toBe('/book');
  });

  it('arrives with no card checked (step 2 never has a service in its URL) and checks the clicked one', async () => {
    await renderBook({ url });
    await screen.findByRole('radio', { name: 'Consultation' });
    for (const r of screen.getAllByRole('radio'))
      expect(r).toHaveAttribute('aria-checked', 'false');
  });

  it('selecting a service navigates to step 3 with the service', async () => {
    const view = await renderBook({ url });
    await userEvent.setup().click(await screen.findByRole('radio', { name: 'Long session' }));
    await screen.findByRole('heading', { level: 2, name: 'Choose a date and time' });
    expect(view.router.url).toContain(`branch=${LONDON}&service=${SERVICE_IDS.longSession}`);
  });

  it('says so when there are no services', async () => {
    const backend = createBookingBackend();
    backend.state.services.splice(0);
    await renderBook({ url, backend });
    expect(await screen.findByText('No services are available right now.')).toBeTruthy();
  });

  it('shows a skeleton while loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await renderBook({
      url,
      settle: false,
      handlers: [
        http.get(`${BOOK_BASE}/api/Services`, async () => {
          await gate;
          return HttpResponse.json([]);
        }),
      ],
    });
    expect(await screen.findByLabelText('Loading services')).toHaveAttribute('aria-busy', 'true');
    release();
    await screen.findByText('No services are available right now.');
  });

  it('an outage shows Try again; another failure shows the message and toasts once', async () => {
    let status = 503;
    const view = await renderBook({
      url,
      handlers: [
        http.get(`${BOOK_BASE}/api/Services`, () =>
          status === 200
            ? HttpResponse.json([])
            : HttpResponse.json({ status, detail: 'Nope.' }, { status }),
        ),
      ],
    });
    expect(await screen.findByText(/We could not load the services/)).toBeTruthy();
    expect(view.toast.showError).not.toHaveBeenCalled();
    status = 200;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('No services are available right now.');
  });

  it('shows another failure inline and toasts it once', async () => {
    const view = await renderBook({
      url,
      handlers: [
        http.get(`${BOOK_BASE}/api/Services`, () =>
          HttpResponse.json({ status: 500, detail: 'Boom.' }, { status: 500 }),
        ),
      ],
    });
    expect(await screen.findByText('Boom.')).toBeTruthy();
    expect(view.toast.showError).toHaveBeenCalledTimes(1);
  });
});
