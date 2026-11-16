import { Link } from "react-router";
import { parseMadeSource } from "./made-pdf";

/**
 * Under a document's Source field, when the source says Outpost made the file: the way
 * back to what it was made from. The source is a field anyone can type in, so the
 * address is followed only if it is one inside Outpost (see `parseMadeSource`), and it
 * is followed by the app's own router, which cannot leave Outpost.
 */
export function MadeInOutpostLine({ source }: { source: string | null }) {
  const from = parseMadeSource(source);
  if (!from?.path) return null;
  return (
    <p className="-mt-2 text-small text-ink-muted">
      Outpost made this file.{" "}
      <Link to={from.path} className="font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
        Open {from.what}
      </Link>{" "}
      as it is now, which may not be as it was when the file was made.
    </p>
  );
}
