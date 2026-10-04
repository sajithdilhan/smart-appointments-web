import { HttpClient, HttpContext, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_CONFIG } from '../config/app-config';

export interface ApiRequestOptions {
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  context?: HttpContext;
}

/**
 * The one place that builds API URLs: `apiBaseUrl` plus a path. It never sets
 * `Idempotency-Key` (the caller supplies it so a retry can reuse the key) and returns the body,
 * except `postFull`, which returns the whole response for `Location` / `X-Correlation-ID`.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  url(path: string): string {
    if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`);
    return new URL(path, this.config.apiBaseUrl).toString();
  }

  get<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path), this.init(options));
  }

  post<T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? null, this.init(options, body));
  }

  postFull<T>(
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {},
  ): Observable<HttpResponse<T>> {
    return this.http.post<T>(this.url(path), body ?? null, {
      ...this.init(options, body),
      observe: 'response',
    });
  }

  put<T>(path: string, body?: unknown, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? null, this.init(options, body));
  }

  delete<T>(path: string, options: ApiRequestOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path), this.init(options));
  }

  private init(options: ApiRequestOptions, body?: unknown) {
    const headers: Record<string, string> = { ...options.headers };
    const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
    if (body !== undefined && !hasType) headers['Content-Type'] = 'application/json';
    return { params: options.params, headers, context: options.context };
  }
}
