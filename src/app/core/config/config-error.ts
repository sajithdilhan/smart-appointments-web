/**
 * Renders the standalone configuration error page with plain DOM calls. It depends on
 * nothing else (no Angular, Tailwind, Spartan or router), so it works when the rest failed.
 */
export function renderConfigError(reason: string): void {
  document.title = 'Configuration error';

  const container = document.createElement('main');
  container.setAttribute('role', 'alert');
  Object.assign(container.style, {
    boxSizing: 'border-box',
    maxWidth: '36rem',
    margin: '10vh auto 0',
    padding: '1.5rem',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: '1.125rem',
    lineHeight: '1.6',
    color: '#18181b',
    background: '#ffffff',
  });

  const heading = document.createElement('h1');
  heading.textContent = 'Configuration error';
  Object.assign(heading.style, { fontSize: '1.75rem', margin: '0 0 1rem' });

  const explanation = document.createElement('p');
  explanation.textContent =
    'The application is not configured correctly. Ask whoever runs this deployment to check the API address.';

  const detail = document.createElement('p');
  detail.textContent = reason;
  Object.assign(detail.style, {
    fontFamily: 'ui-monospace, Consolas, monospace',
    background: '#f4f4f5',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.375rem',
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Try again';
  Object.assign(button.style, {
    font: 'inherit',
    color: '#ffffff',
    background: '#0f766e',
    border: '0',
    borderRadius: '0.5rem',
    padding: '0.6rem 1.2rem',
    cursor: 'pointer',
  });
  button.addEventListener('click', () => location.reload());

  container.append(heading, explanation, detail, button);
  document.body.replaceChildren(container);
  Object.assign(document.body.style, { background: '#ffffff', margin: '0' });
  button.focus();
}
