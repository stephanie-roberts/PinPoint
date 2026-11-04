/**
 * Typed error hierarchy for PinPoint client/server boundaries.
 *
 * Consumers can `instanceof`-check or read `code` / `retryable` instead of
 * pattern-matching error messages. Designed to be additive on top of the
 * existing store errors (`StoreNotFoundError`, `StoreDuplicateError`) which
 * remain the canonical signals for server-side store implementations.
 *
 * Usage on the widget side (api-client.ts):
 *   - fetch failures / aborts / timeouts → `PinPointNetworkError` (retryable)
 *   - HTTP 4xx (except 401/403)         → `PinPointValidationError` (not retryable)
 *   - HTTP 401 / 403                    → `PinPointAuthError` (not retryable)
 *   - everything else                   → `PinPointError` generic
 *
 * Store mode (store-client.ts): a `createFeedback` that does not settle in
 * time → `PinPointError` with code `"TIMEOUT"` (retryable).
 *
 * `retryable` is meta information surfaced to host apps that want to wire
 * their own retry/queue/backoff strategy — the widget already retries
 * network failures via its built-in retry queue.
 */

/**
 * Discriminant string carried by every `PinPointError`. Subclasses pin a
 * literal value; the base class accepts a wider string so userland can
 * extend the hierarchy without colliding with built-ins.
 */
export type PinPointErrorCode = "NETWORK" | "VALIDATION" | "AUTH" | "SERVER" | "TIMEOUT" | (string & {});

export class PinPointError<TCode extends PinPointErrorCode = PinPointErrorCode> extends Error {
  readonly code: TCode;
  readonly retryable: boolean;

  constructor(message: string, code: TCode, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "PinPointError";
  }
}

/** Network-level failure: connection refused, DNS, CORS, timeout, abort. Retryable. */
export class PinPointNetworkError extends PinPointError<"NETWORK"> {
  constructor(message: string) {
    super(message, "NETWORK", true);
    this.name = "PinPointNetworkError";
  }
}

/**
 * Server rejected the request (4xx, not auth). Validation problem on the
 * client side. `status` is the HTTP status when a response said so: a 404
 * (the target is gone) and a 409 (a full thread) call for other answers
 * than a 400.
 */
export class PinPointValidationError extends PinPointError<"VALIDATION"> {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message, "VALIDATION", false);
    this.name = "PinPointValidationError";
    this.status = status;
  }
}

/** Server rejected auth (401 or 403). Not retryable without fresh credentials. */
export class PinPointAuthError extends PinPointError<"AUTH"> {
  /**
   * `401`: the credentials are missing or no longer work — drop a dead token
   * on this one. `403`: they work, and the server's policy refuses this request.
   */
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message, "AUTH", false);
    this.name = "PinPointAuthError";
    this.status = status;
  }
}
