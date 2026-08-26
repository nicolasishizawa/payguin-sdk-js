/**
 * PayGuin API error — thrown when the PayGuin HTTP API returns a non-2xx response.
 *
 * Carries the HTTP status code and, when available, the PayGuin error code/message
 * from the response body.
 */
export class PayGuinApiError extends Error {
  public readonly kind = "PayGuinApiError" as const;

  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly errorCode?: string,
    public readonly errorMessage?: string,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = "PayGuinApiError";
  }
}
