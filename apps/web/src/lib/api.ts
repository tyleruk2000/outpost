/**
 * The one place the web app talks to the server. Every request is same-origin; the
 * `X-Outpost-Request` header is what the server's cross-site request check looks for.
 */
import { type ApiErrorBody, LOCKED_CODE } from "@outpost/shared";

/** Sent on `window` when the server refused a change because this device is not unlocked with the household PIN. */
export const LOCKED_EVENT = "outpost:locked";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The server could not be reached at all (stopped, restarting, or the device left the network). */
  get isUnreachable(): boolean {
    return this.code === "unreachable";
  }

  /** A GET had no answer in time (`GET_TIMEOUT_MS`): asked again only when the person says so. */
  get isTimeout(): boolean {
    return this.code === "timeout";
  }
}

type Query = Record<string, string | number | boolean | null | undefined | string[]>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

async function parse<T>(response: Response): Promise<T> {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (response.ok) return (isJson ? await response.json() : await response.text()) as T;
  if (isJson) {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error.code === LOCKED_CODE && typeof window !== "undefined") window.dispatchEvent(new Event(LOCKED_EVENT));
    throw new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  }
  throw new ApiError(response.status, "http", `The server answered with an error (${response.status}).`);
}

/** Browsers refuse a keepalive request with a larger body than this. */
const KEEPALIVE_LIMIT = 60_000;

interface RequestOptions {
  /**
   * Lets the request finish after the page has gone: for the save made as a page is hidden
   * or closed. A body too large for keepalive is sent the ordinary way, and may be cut off.
   */
  keepalive?: boolean;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Query; body?: unknown; signal?: AbortSignal; timeoutMs?: number } & RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Outpost-Request": "1" };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const keepalive = options.keepalive === true && typeof body === "string" && body.length <= KEEPALIVE_LIMIT;
  // A GET that has had no answer in 15 s is given up, so a screen says so and offers Try again rather than waiting
  // for ever. A change (POST, PATCH, PUT, DELETE) is left to finish: planning a route or adding files takes longer.
  const timeout = method === "GET" ? timeoutSignal(options.timeoutMs ?? GET_TIMEOUT_MS, options.signal) : null;
  try {
    let response: Response;
    try {
      response = await fetch(withQuery(path, options.query), {
        method,
        headers,
        body,
        signal: timeout?.signal ?? options.signal,
        credentials: "same-origin",
        ...(keepalive ? { keepalive } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && !timeout?.timedOut()) throw error;
      // Heard by the line that says the server cannot be reached (components/connection-notice.tsx).
      window.dispatchEvent(new Event(UNREACHABLE_EVENT));
      if (timeout?.timedOut()) throw new ApiError(0, "timeout", TIMEOUT_MESSAGE);
      throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
    }
    try {
      return await parse<T>(response);
    } catch (error) {
      // The answer began but did not finish in time.
      if (timeout?.timedOut()) throw new ApiError(0, "timeout", TIMEOUT_MESSAGE);
      throw error;
    }
  } finally {
    timeout?.done();
  }
}

/** Sent on `window` when a request had no answer at all: the server is stopped, unplugged or stuck. */
export const UNREACHABLE_EVENT = "outpost:unreachable";

/** How long a GET waits for its answer before it is given up. */
export const GET_TIMEOUT_MS = 15_000;

const TIMEOUT_MESSAGE =
  "The Outpost server took too long to answer. It may be busy, or this browser may have many Outpost tabs open: close the ones not in use and try again.";

/**
 * A signal that aborts after `ms`, or when `outer` does, and can say which it was. The browser's own timeout where it
 * has one (Safari 17.4 and later): no timer of the page's is held for each request.
 */
function timeoutSignal(ms: number, outer: AbortSignal | undefined) {
  if (typeof AbortSignal.timeout === "function" && typeof AbortSignal.any === "function") {
    const timer = AbortSignal.timeout(ms);
    return { signal: outer ? AbortSignal.any([outer, timer]) : timer, timedOut: () => timer.aborted, done: () => {} };
  }
  const controller = new AbortController();
  let timedOut = false;
  const onOuter = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  else outer?.addEventListener("abort", onOuter, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The request took too long.", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

/**
 * A POST whose answer arrives a piece at a time (an answer being written). Resolves
 * with the response once it has started; a refusal is thrown as an `ApiError` exactly
 * as for any other request, and the caller reads `response.body` as it comes.
 */
async function stream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { Accept: "text/event-stream, application/json", "Content-Type": "application/json", "X-Outpost-Request": "1" },
      body: JSON.stringify(body),
      signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
  }
  if (!response.ok) await parse(response);
  return response;
}

/**
 * A GET whose answer arrives a line of JSON at a time (search inside reference
 * collections). Calls `onLine` for each line as it comes and resolves when the answer
 * has ended. Aborting the signal closes the connection, which is how the server knows
 * to stop.
 */
async function lines<T>(path: string, query: Query, onLine: (line: T) => void, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(withQuery(path, query), {
      headers: { Accept: "application/x-ndjson, application/json", "X-Outpost-Request": "1" },
      signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
  }
  if (!response.ok || !response.body) {
    await parse(response);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const take = (text: string) => {
    buffer += text;
    for (let at = buffer.indexOf("\n"); at !== -1; at = buffer.indexOf("\n")) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (line) onLine(JSON.parse(line) as T);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      take(decoder.decode(value, { stream: true }));
    }
    take(`${decoder.decode()}\n`);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    throw new ApiError(0, "unreachable", "The connection to the Outpost server was lost.");
  }
}

export const api = {
  /** `timeoutMs` for the few answers that are worked out at length (a whole disk measured): 15 s otherwise. */
  get: <T>(path: string, query?: Query, signal?: AbortSignal, options?: { timeoutMs?: number }) =>
    request<T>("GET", path, { query, signal, ...options }),
  post: <T>(path: string, body?: unknown, query?: Query, signal?: AbortSignal) =>
    request<T>("POST", path, { body: body ?? {}, query, signal }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>("PATCH", path, { body, ...options }),
  put: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>("PUT", path, { body, ...options }),
  delete: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
  upload: <T>(path: string, form: FormData, query?: Query) => request<T>("POST", path, { body: form, query }),
  stream,
  lines,
};

/**
 * Upload with progress, which `fetch` cannot report. Resolves with the parsed JSON body.
 */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.setRequestHeader("X-Outpost-Request", "1");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T);
      const error = (body as ApiErrorBody | undefined)?.error;
      reject(new ApiError(xhr.status, error?.code ?? "http", error?.message ?? `The upload failed (${xhr.status}).`, error?.details));
    };
    xhr.onerror = () => reject(new ApiError(0, "unreachable", "The upload was interrupted. Check that the server is running."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
