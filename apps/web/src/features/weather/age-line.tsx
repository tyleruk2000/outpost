/**
 * What every fetched thing on this screen carries: who it is from, when it was fetched,
 * the period it covers, and what may be said about it now. A copy that is old or has run
 * out says so in words, and its figures are not shown as current.
 */
import { freshness, type KeptCopy, type WeatherSourceInfo } from "@outpost/shared";
import { CircleAlert, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export function AgeLine({ copy, source, now }: { copy: KeptCopy; source: WeatherSourceInfo | undefined; now: number }) {
  const fresh = freshness(copy, now);
  const stale = fresh.state === "old" || fresh.state === "ran-out";
  return (
    <div data-freshness={fresh.state} className="mb-4 grid gap-1 text-small">
      <p className={stale ? "flex items-start gap-1.5 font-semibold text-warning" : "flex items-start gap-1.5 text-ink-muted"}>
        {stale ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <span>{fresh.sentence}</span>
      </p>
      <p className="text-ink-muted">
        From {source?.publisher ?? copy.source}, fetched {formatDateTime(copy.fetchedAt)}
        {copy.validFrom !== null && copy.validUntil !== null
          ? `; covers ${formatDateTime(copy.validFrom)} to ${formatDateTime(copy.validUntil)}`
          : ""}
        .
      </p>
    </div>
  );
}

/** The publisher's credit, with a link to its own live page, as its terms ask. */
export function Credit({ source }: { source: WeatherSourceInfo | undefined }) {
  if (!source) return null;
  return (
    <p className="mt-4 text-micro text-ink-muted">
      {source.attribution}.{" "}
      <a className="text-primary underline underline-offset-2" href={source.liveUrl} target="_blank" rel="noreferrer">
        {source.publisher}, live
      </a>
      .
    </p>
  );
}
