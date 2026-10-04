import type { components } from './generated/auth';

export type RegisterRequest = components['schemas']['RegisterCustomerRequest'];
export type LoginRequest = components['schemas']['UserLoginRequest'];
export type RefreshRequest = components['schemas']['RefreshTokenRequest'];
export type LogoutRequest = components['schemas']['LogoutRequest'];
export type TokenResponse = components['schemas']['TokenResponse'];

/*
 * Temporary extensions (Req 1.6): the generated Auth document declares no response body for
 * `register` and `me` (both are typed as "no content"). Remove each type in the commit that
 * regenerates the types once the backend documents the response.
 */
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
