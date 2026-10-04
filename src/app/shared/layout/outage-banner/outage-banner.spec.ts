import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen } from '@testing-library/angular';
import { http, HttpResponse } from 'msw';
import { firstValueFrom } from 'rxjs';
import { OutageState } from '../../../core/http/outage-state';
import { server } from '../../../../testing/server';
import { renderWithSession, TEST_API_BASE } from '../../../../testing/render-with-session';
import { OutageBanner } from './outage-banner';

const BANNER = 'Service temporarily unavailable. Some features may not work.';

async function setup() {
  const view = await renderWithSession(OutageBanner);
  return {
    ...view,
    client: TestBed.inject(HttpClient),
    outage: TestBed.inject(OutageState),
    router: TestBed.inject(Router),
  };
}

async function call(client: HttpClient, path = '/api/x') {
  await firstValueFrom(client.get(`${TEST_API_BASE}${path}`)).catch(() => undefined);
  TestBed.tick();
}

describe('OutageBanner', () => {
  it('is absent while the backend is reachable', async () => {
    await setup();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([502, 503, 504])('appears for a %i', async (status) => {
    server.use(http.get(`${TEST_API_BASE}/api/x`, () => HttpResponse.json({}, { status })));
    const { client } = await setup();
    await call(client);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(BANNER);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('appears for a network failure', async () => {
    server.use(http.get(`${TEST_API_BASE}/api/x`, () => HttpResponse.error()));
    const { client } = await setup();
    await call(client);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it.each([400, 401, 403, 404, 409, 429])('does not appear for a %i', async (status) => {
    server.use(http.get(`${TEST_API_BASE}/api/x`, () => HttpResponse.json({}, { status })));
    const { client } = await setup();
    await call(client);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Retry probes /healthz once; a Degraded 200 clears the banner and re-navigates', async () => {
    let up = false;
    let probes = 0;
    server.use(
      http.get(`${TEST_API_BASE}/api/x`, () => HttpResponse.json({}, { status: 503 })),
      http.get(`${TEST_API_BASE}/healthz`, () => {
        probes++;
        return up ? HttpResponse.text('Degraded') : HttpResponse.text('down', { status: 503 });
      }),
    );
    const { client, outage, router, fixture } = await setup();
    const navigate = vi.spyOn(router, 'navigateByUrl');
    await call(client);
    await screen.findByRole('alert');

    // First probe fails: the banner stays and the button is usable again.
    await outage.retry();
    TestBed.tick();
    expect(probes).toBe(1);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    expect(outage.down()).toBe(true);

    up = true;
    await outage.retry();
    await fixture.whenStable();
    TestBed.tick();
    expect(probes).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(router.url, { onSameUrlNavigation: 'reload' });
    expect(outage.recovered()).toBe(1);
  });

  it('disables Retry and sets aria-busy while the probe is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get(`${TEST_API_BASE}/api/x`, () => HttpResponse.json({}, { status: 503 })),
      http.get(`${TEST_API_BASE}/healthz`, async () => {
        await gate;
        return HttpResponse.text('Healthy');
      }),
    );
    const { client } = await setup();
    await call(client);
    const button = await screen.findByRole('button', { name: 'Retry' });
    button.click();
    await vi.waitFor(() => {
      TestBed.tick();
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    release();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('a failing probe never sets the outage on its own', async () => {
    server.use(http.get(`${TEST_API_BASE}/healthz`, () => HttpResponse.error()));
    const { outage } = await setup();
    await outage.retry();
    expect(outage.down()).toBe(false);
    expect(outage.probing()).toBe(false);
  });
});
