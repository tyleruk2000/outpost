/** What is kept on the server from each publisher, with its size, and the publishers themselves: what is sent to each, and their terms. */
import { formatBytes, freshness, type KeptCopy, type WeatherPlace, type WeatherSourceInfo } from "@outpost/shared";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { useRemoveCopy } from "./data";

const KIND_WORDS = {
  forecast: "Forecast",
  warnings: "UK warnings",
  flood: "Flood warnings",
  rivers: "River and sea levels",
  "river-readings": "River and sea levels, stations' last days",
  climate: "Climate averages",
  solar: "Sunshine on a panel",
};

export function KeptView({
  kept,
  places,
  sources,
  now,
}: {
  kept: KeptCopy[];
  places: WeatherPlace[];
  sources: WeatherSourceInfo[];
  now: number;
}) {
  const remove = useRemoveCopy();
  const total = kept.reduce((sum, copy) => sum + copy.bytes, 0);
  return (
    <div className="grid gap-10">
      <section aria-labelledby="kept-heading">
        <h3 id="kept-heading" className="text-body font-semibold text-ink">
          Kept on this server
        </h3>
        <p className="mb-2 text-small text-ink-muted">
          Every device on your network sees these same copies.{" "}
          {kept.length > 0 ? `${formatBytes(total)} arrived from the publishers for them.` : ""} They are also listed, and can all be
          cleared at once, under Storage → Manage and clean up → Leftovers.
        </p>
        {kept.length === 0 ? (
          <p className="text-body text-ink">Nothing has been fetched yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {kept.map((copy) => {
              const what = `${KIND_WORDS[copy.kind]}${copy.placeId ? `, ${places.find((place) => place.id === copy.placeId)?.name ?? "a place no longer listed"}` : ""}`;
              return (
                <li key={copy.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink">{what}</p>
                    <p className="tabular text-small text-ink-muted">
                      {formatBytes(copy.bytes)}, fetched {formatDateTime(copy.fetchedAt)} ({freshness(copy, now).age}). Sent to {copy.sent}.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove the kept copy: ${what}`} onClick={() => remove.mutate(copy.id)}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="sources-heading">
        <h3 id="sources-heading" className="text-body font-semibold text-ink">
          Where it comes from
        </h3>
        <p className="mb-2 text-small text-ink-muted">
          Outpost asks these publishers only when you press a button here, or open this screen with "also update when I open this screen"
          ticked. Their terms were read on the date given; docs/sources.md quotes them.
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {sources.map((source) => (
            <li key={source.id} className="py-3 text-small">
              <p className="text-body font-semibold text-ink">
                {source.publisher}: {source.name}
              </p>
              <p className="text-ink">Covers: {source.covers}</p>
              <p className="text-ink">
                Sends to <span className="font-mono">{source.host}</span>: {source.sends}
              </p>
              <p className="text-ink-muted">
                {source.licence}.{" "}
                <a className="text-primary underline underline-offset-2" href={source.termsUrl} target="_blank" rel="noreferrer">
                  Terms
                </a>
                , read {source.termsRead}.
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
          Not used: the Met Office's DataHub (it needs an account and a key), MeteoAlarm (its terms ask redistributors to stay within ten
          minutes of it), and the Met Office's Fire Severity Index (published as maps only). Wildfire risk for England and Wales is at{" "}
          <a
            className="text-primary underline underline-offset-2"
            href="https://openaccess.naturalengland.org.uk/"
            target="_blank"
            rel="noreferrer"
          >
            Natural England's Open Access site
          </a>
          ; Scotland's river levels at{" "}
          <a className="text-primary underline underline-offset-2" href="https://www.sepa.org.uk/" target="_blank" rel="noreferrer">
            SEPA
          </a>
          , Wales's at{" "}
          <a
            className="text-primary underline underline-offset-2"
            href="https://naturalresources.wales/flooding"
            target="_blank"
            rel="noreferrer"
          >
            Natural Resources Wales
          </a>
          .
        </p>
      </section>
    </div>
  );
}
