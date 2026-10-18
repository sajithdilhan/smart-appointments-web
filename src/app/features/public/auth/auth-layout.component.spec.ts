import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  imports: [AuthLayoutComponent],
  template: `<app-auth-layout [illustration]="variant()">
    <form authForm aria-label="Test form"><input aria-label="Field" /></form>
  </app-auth-layout>`,
})
class Host {
  readonly variant = signal<'login' | 'register'>('login');
}

describe('AuthLayoutComponent', () => {
  it('renders the projected form in the form slot', async () => {
    await render(Host);
    const slot = screen.getByTestId('auth-form-slot');
    expect(slot.contains(screen.getByRole('form', { name: 'Test form' }))).toBe(true);
  });

  it('hides the illustration panel from assistive tech and below lg', async () => {
    const { container } = await render(Host);
    const panel = container.querySelector('aside')!;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.classList).toContain('hidden');
    expect(panel.classList).toContain('lg:flex');
    expect(panel.textContent?.trim()).toBe('');
  });

  it('draws a decorative svg that is not focusable', async () => {
    const { container } = await render(Host);
    const svg = container.querySelector('aside svg')!;
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBe('presentation');
  });

  it('draws a different picture per variant', async () => {
    const { container, fixture } = await render(Host);
    const loginHtml = container.querySelector('aside svg')!.innerHTML;
    fixture.componentInstance.variant.set('register');
    fixture.detectChanges();
    expect(container.querySelector('aside svg')!.innerHTML).not.toBe(loginHtml);
  });
});
