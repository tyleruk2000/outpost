import type { SavedFrom } from "@outpost/shared";
import { formatDate } from "@/lib/utils";

/** An address the server has already checked, checked again: only a web address becomes a link. */
export function webAddress(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Where a saved web page came from and when, above its text. The address leads back to
 * the page as it is now, which needs a connection; the copy below does not.
 */
export function SavedFromLine({ savedFrom }: { savedFrom: SavedFrom }) {
  const href = webAddress(savedFrom.url);
  return (
    <>
      Saved from{" "}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] [overflow-wrap:anywhere] hover:decoration-2"
        >
          {savedFrom.url}
        </a>
      ) : (
        <span className="[overflow-wrap:anywhere]">{savedFrom.url}</span>
      )}{" "}
      on <time dateTime={new Date(savedFrom.savedAt).toISOString()}>{formatDate(savedFrom.savedAt)}</time>. This is a copy kept for reading
      offline; the page belongs to whoever published it, and may have changed since.
    </>
  );
}
