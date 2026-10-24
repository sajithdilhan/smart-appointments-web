import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client';
import { toPromise, type RequestOptions } from './to-promise';
import type {
  LoginRequest,
  LogoutRequest,
  MoveStaffBody,
  CreateStaffBody,
  ProfileResponse,
  RefreshRequest,
  RegisterRequest,
  RegisterResponse,
  StaffAccount,
  StaffPage,
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

  /** `GET /api/auth/staff`, oldest first; the filters are left out when not given. */
  listStaff(
    query: { branchId?: string; isActive?: boolean; page: number; pageSize: number },
    options: RequestOptions = {},
  ): Promise<StaffPage> {
    const params: Record<string, string | number | boolean> = {
      page: query.page,
      pageSize: query.pageSize,
    };
    if (query.branchId !== undefined) params['branchId'] = query.branchId;
    if (query.isActive !== undefined) params['isActive'] = query.isActive;
    return toPromise(this.api.get<StaffPage>('/api/auth/staff', { params }), options.signal);
  }

  getStaff(id: string): Observable<StaffAccount> {
    return this.api.get<StaffAccount>(`/api/auth/staff/${encodeURIComponent(id)}`);
  }

  createStaff(body: CreateStaffBody): Observable<StaffAccount> {
    return this.api.post<StaffAccount>('/api/auth/staff', body);
  }

  moveStaff(id: string, branchId: string): Observable<StaffAccount> {
    const body: MoveStaffBody = { branchId };
    return this.api.put<StaffAccount>(`/api/auth/staff/${encodeURIComponent(id)}/branch`, body);
  }

  setStaffActive(id: string, active: boolean): Observable<void> {
    const action = active ? 'activate' : 'deactivate';
    return this.api.post<void>(`/api/auth/staff/${encodeURIComponent(id)}/${action}`);
  }

  deleteStaff(id: string): Observable<void> {
    return this.api.delete<void>(`/api/auth/staff/${encodeURIComponent(id)}`);
  }
}
