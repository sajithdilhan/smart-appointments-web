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

/*
 * Temporary extensions (Req 1.6): the generated Availability and Booking documents declare no
 * response bodies (every operation is "no content"), so these mirror the backend records
 * (`BranchResponse`, `ServiceTypeResponse`, `SlotResponse`, `AppointmentResponse`). Enums are
 * strings (`JsonStringEnumConverter`) and `DateOnly`/`TimeOnly` are `yyyy-MM-dd` / `HH:mm:ss`.
 * Remove each one in the commit that regenerates the types once the backend documents it.
 */
export interface WorkingHoursResponse {
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  opensAt: string;
  closesAt: string;
}

export interface BranchResponse {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  address: string;
  phoneNumber: string;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
  /** Absent, null or blank for a branch with no schedule. */
  timeZoneId?: string | null;
  workingHours?: WorkingHoursResponse[] | null;
}

export interface ServiceTypeResponse {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  isActive: boolean;
  createdAtUtc: string;
  updatedAtUtc?: string | null;
}

export interface SlotResponse {
  id: string;
  branchId: string;
  serviceTypeId: string;
  /** Branch-local calendar date, `yyyy-MM-dd`. */
  date: string;
  startAtUtc: string;
  endAtUtc: string;
  /** Branch-local time, `HH:mm:ss`. */
  localStartTime: string;
  localEndTime: string;
  capacity: number;
  availableCapacity: number;
}

export interface AppointmentResponse {
  id: string;
  customerId: string;
  slotId: string;
  branchId: string;
  serviceTypeId: string;
  startUtc: string;
  endUtc: string;
  status: 'Booked' | 'Cancelled';
  createdAtUtc: string;
  updatedAtUtc: string;
  cancelledAtUtc?: string | null;
}

export interface SlotSearchParams {
  branchId: string;
  serviceId: string;
  /** Branch-zone calendar date, `yyyy-MM-dd`. */
  date: string;
}
