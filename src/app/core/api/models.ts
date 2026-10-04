import type { components } from './generated/auth';

/*
 * Temporary extensions of the generated types (Req 1.6). Checked against the gateway's
 * Development OpenAPI documents on the day of `pnpm gen:api`: the Auth document has no
 * refresh or logout endpoint, and no response schema at all (every response is typed as
 * "no content"), because the backend features `auth-refresh-tokens` and the typed responses
 * are not merged into the checkout F1 was generated from. Each type below is removed in
 * the commit that regenerates the types with the real schemas.
 */

export type RegisterRequest = components['schemas']['RegisterCustomerRequest'];
export type LoginRequest = components['schemas']['UserLoginRequest'];

/** Missing from the generated Auth document: no response schemas, refresh or logout yet. */
export interface RefreshRequest {
  refreshToken: string;
}
export type LogoutRequest = RefreshRequest;

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  /**
   * Missing from the generated schema until the backend ships `accessTokenExpiresAtUtc`
   * (auth-refresh-tokens). Optional so the session derives the expiry from the token's `exp`.
   */
  accessTokenExpiresAtUtc?: string;
}

export interface RegisterResponse {
  userId: string;
  email: string;
  role: 'Customer';
}

export interface ProfileResponse {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
}
