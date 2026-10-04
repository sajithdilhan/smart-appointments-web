/** Derive request and response types from a generated `paths` map instead of repeating them. */
export type JsonBody<P, Path extends keyof P, M extends keyof P[Path]> = P[Path][M] extends {
  requestBody: { content: { 'application/json': infer B } };
}
  ? B
  : never;

export type JsonResponse<
  P,
  Path extends keyof P,
  M extends keyof P[Path],
  S extends number,
> = P[Path][M] extends { responses: Record<S, { content: { 'application/json': infer R } }> }
  ? R
  : never;
