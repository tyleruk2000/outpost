/**
 * Errors that are safe to show to a person. Anything else that reaches the HTTP layer
 * is logged and reported as a generic 500 without internal detail.
 */
export type ErrorCode =
  | "bad_request"
  | "forbidden"
  /** A change from a device not unlocked with the household PIN (modules/access). */
  | "locked"
  | "not_found"
  | "conflict"
  | "too_large"
  /** Too many requests from one address in a short time. */
  | "too_many"
  | "unsupported"
  | "storage_unavailable"
  | "insufficient_space"
  | "offline"
  | "upstream"
  | "internal";

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  locked: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  too_many: 429,
  unsupported: 415,
  storage_unavailable: 503,
  insufficient_space: 507,
  offline: 503,
  upstream: 502,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = statusByCode[code];
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError("bad_request", message, details);
export const notFound = (what: string) => new AppError("not_found", `${what} was not found.`);
export const conflict = (message: string, details?: Record<string, unknown>) => new AppError("conflict", message, details);
export const forbidden = (message = "You do not have permission to do that.") => new AppError("forbidden", message);

/** Network failures that mean "no route to the internet", across Node and undici. */
const offlineCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNREFUSED",
  "ENETDOWN",
  "UND_ERR_CONNECT_TIMEOUT",
]);

const transientCodes = new Set(["ECONNRESET", "ETIMEDOUT", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

function errorCodeOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export type NetworkFailure = "offline" | "transient" | "other";

/** Sorts a thrown network error into "you are offline", "try again" or "something else". */
export function classifyNetworkError(error: unknown): NetworkFailure {
  const code = errorCodeOf(error);
  if (code && offlineCodes.has(code)) return "offline";
  if (code && transientCodes.has(code)) return "transient";
  return "other";
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
