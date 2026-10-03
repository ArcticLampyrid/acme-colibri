import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An error that is safe to show to API clients as `{ error: message }`. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}
