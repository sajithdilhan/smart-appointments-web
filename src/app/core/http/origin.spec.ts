import { HttpRequest } from '@angular/common/http';
import { isApiRequest, isAuthEndpoint } from './origin';

const config = { apiBaseUrl: 'http://localhost:5290' };
const req = (url: string) => new HttpRequest('GET', url);

describe('isApiRequest', () => {
  it('matches only the configured origin', () => {
    expect(isApiRequest(req('http://localhost:5290/api/x'), config)).toBe(true);
    expect(isApiRequest(req('http://localhost:5291/api/x'), config)).toBe(false);
    expect(isApiRequest(req('https://localhost:5290/api/x'), config)).toBe(false);
    expect(isApiRequest(req('https://other.example/api/x'), config)).toBe(false);
    expect(isApiRequest(req('/relative'), config)).toBe(false);
    expect(isApiRequest(req('http://localhost:5290.evil.example/x'), config)).toBe(false);
  });
});

describe('isAuthEndpoint', () => {
  it.each(['login', 'register', 'refresh', 'logout'])('matches %s in any casing', (name) => {
    expect(isAuthEndpoint(req(`http://localhost:5290/api/Auth/${name}`))).toBe(true);
    expect(isAuthEndpoint(req(`http://localhost:5290/api/auth/${name}`))).toBe(true);
    expect(isAuthEndpoint(req(`http://localhost:5290/API/AUTH/${name.toUpperCase()}`))).toBe(true);
  });
  it('does not match other paths, including me and profile', () => {
    expect(isAuthEndpoint(req('http://localhost:5290/api/Auth/me'))).toBe(false);
    expect(isAuthEndpoint(req('http://localhost:5290/api/Auth/profile'))).toBe(false);
    expect(isAuthEndpoint(req('http://localhost:5290/api/appointments'))).toBe(false);
  });
});
