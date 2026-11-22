/**
 * The locale the server writes a date in for the person reading it: English as written
 * in the region of the browser that asked, the same rule as the web app's `appLocale`
 * ("en-US" from a browser in the United States writes "Nov 21, 2026"; "en-GB",
 * "en-DE" and "en-IN" write "21 Nov 2026"). Words stay in English.
 *
 * The region is the first one named in the request's Accept-Language header, which the
 * browser sends from the device's language settings. Each request runs with its own
 * (`registerReaderLocale`), and so does anything it starts: a job, a reply being written.
 * Work no request started (a schedule, the server's own start), and a request whose
 * language names no region, writes British English, as the web app does.
 *
 * Only dates follow it. Numbers keep the full stop for the decimal point everywhere, and
 * machine formats (ISO dates, UTC log stamps) stay fixed.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";

export const FALLBACK_LOCALE = "en-GB";

const reader = new AsyncLocalStorage<string>();
const known = new Map<string, string>();

/** "en-US" from "en-US,en;q=0.9", "en-DE" from "de-DE", British English from "en" or nothing. */
export function localeFromLanguages(header: string | undefined): string {
  const first = (header ?? "").split(",")[0]?.split(";")[0]?.trim() ?? "";
  const match = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?:[-_]|$)/.exec(first);
  if (!match) return FALLBACK_LOCALE;
  const wanted = `en-${match[1]!.toUpperCase()}`;
  const cached = known.get(wanted);
  if (cached) return cached;
  let locale = FALLBACK_LOCALE;
  try {
    if (Intl.DateTimeFormat.supportedLocalesOf([wanted]).length > 0) locale = wanted;
  } catch {
    locale = FALLBACK_LOCALE;
  }
  if (known.size < 500) known.set(wanted, locale);
  return locale;
}

/** The locale of the person this work is for (see the top of this file). */
export function readerLocale(): string {
  return reader.getStore() ?? FALLBACK_LOCALE;
}

/** Runs `work` as if asked by a browser in this locale: for tests, and for work handed on to later. */
export function withReaderLocale<T>(locale: string, work: () => T): T {
  return reader.run(locale, work);
}

/** A day in words in the reader's locale: "21 Nov 2026", or "Nov 21, 2026" in the United States. */
export function dateInWords(time: number | Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(readerLocale(), { day: "numeric", month: "short", year: "numeric", ...options }).format(time);
}

/** Every request, and everything it starts, runs with the locale its browser asked in. */
export function registerReaderLocale(app: FastifyInstance): void {
  app.addHook("onRequest", (request, _reply, done) => {
    const header = request.headers["accept-language"];
    reader.run(localeFromLanguages(Array.isArray(header) ? header[0] : header), done);
  });
}
