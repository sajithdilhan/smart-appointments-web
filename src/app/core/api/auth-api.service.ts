import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import type {
  LoginRequest,
  LogoutRequest,
  ProfileResponse,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  TokenResponse,
} from './models';

/**
 * Paths use the casing the OpenAPI document emits (`/api/Auth/...`); the gateway routes are
 * case-insensitive and the interceptors compare auth endpoints case-insensitively.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly api = inject(ApiClient);

  register(body: RegisterRequest): Observable<RegisterResponse> {
    return this.api.post<RegisterResponse>('/api/Auth/register', body);
  }

  login(body: LoginRequest): Observable<TokenResponse> {
    return this.api.post<TokenResponse>('/api/Auth/login', body);
  }

  refresh(refreshToken: string): Observable<TokenResponse> {
    const body: RefreshRequest = { refreshToken };
    return this.api.post<TokenResponse>('/api/Auth/refresh', body);
  }

  logout(refreshToken: string): Observable<void> {
    const body: LogoutRequest = { refreshToken };
    return this.api.post<void>('/api/Auth/logout', body);
  }

  me(): Observable<ProfileResponse> {
    return this.api.get<ProfileResponse>('/api/Auth/me');
  }
}
