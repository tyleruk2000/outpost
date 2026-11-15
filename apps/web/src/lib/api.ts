/**
 * The one place the web app talks to the server. Every request is same-origin; the
 * `X-Outpost-Request` header is what the server's cross-site request check looks for.
 */
import type { ApiErrorBody } from "@outpost/shared";

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
    if (response.status === 401) window.dispatchEvent(new CustomEvent("outpost:unauthenticated"));
    throw new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  }
  throw new ApiError(response.status, "http", `The server answered with an error (${response.status}).`);
}

async function request<T>(method: string, path: string, options: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Outpost-Request": "1" };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(withQuery(path, options.query), {
      method,
      headers,
      body,
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
  }
  return parse<T>(response);
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>("POST", path, { body: body ?? {}, query }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
  upload: <T>(path: string, form: FormData, query?: Query) => request<T>("POST", path, { body: form, query }),
};

/**
 * Upload with progress, which `fetch` cannot report. Resolves with the parsed JSON body.
 */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
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
