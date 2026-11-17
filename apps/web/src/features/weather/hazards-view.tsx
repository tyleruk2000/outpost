/**
 * Warnings and flood warnings as they were when fetched. Warnings are safety information:
 * the publisher's words are shown as they were written, with its own level, the period
 * it states, when Outpost fetched them, and where the live source is.
 */
import {
  type FloodData,
  type KeptCopy,
  regionName,
  type WarningItem,
  type WarningsData,
  type WeatherPlace,
  type WeatherSourceInfo,
  warningState,
} from "@outpost/shared";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Badge } from "@/components/ui/misc";
import { formatDateTime, plural } from "@/lib/utils";
import { AgeLine, Credit } from "./age-line";

const LEVEL_TONE = { yellow: "warning", amber: "warning", red: "danger" } as const;
const STATE_WORDS = { ahead: "Not yet begun", "in-force": "In force", ended: "Its period has ended", unknown: "Period as stated" } as const;

function CopyMayBeOld({ source }: { source: WeatherSourceInfo | undefined }) {
  return (
    <p className="mb-4 text-small text-ink">
      This is Outpost's copy, and it may be out of date. {source?.publisher ?? "The publisher"}'s live page is{" "}
      <a className="text-primary underline underline-offset-2" href={source?.liveUrl} target="_blank" rel="noreferrer">
        {source?.liveUrl.replace(/^https:\/\//, "").replace(/\/$/, "")}
      </a>
      .
    </p>
  );
}

function WarningRow({ item, now }: { item: WarningItem; now: number }) {
  const state = warningState(item, now);
  return (
    <li className="py-3" data-warning-state={state}>
      <div className="flex flex-wrap items-center gap-2">
        {item.level ? <Badge tone={LEVEL_TONE[item.level]}>{item.level[0]!.toUpperCase() + item.level.slice(1)}</Badge> : null}
        <Badge tone={state === "in-force" ? "primary" : "neutral"}>{STATE_WORDS[state]}</Badge>
      </div>
      <p className="mt-1.5 font-semibold text-ink">{item.title}</p>
      <p className="mt-0.5 text-body text-ink">{item.description}</p>
      {item.link ? (
        <a
          className="mt-1 inline-block min-h-11 py-2 text-small text-primary underline underline-offset-2 md:min-h-0 md:py-0"
          href={item.link}
          target="_blank"
          rel="noreferrer"
        >
          The full warning on the Met Office website
        </a>
      ) : null}
    </li>
  );
}

export function WarningsView({
  copy,
  place,
  source,
  now,
}: {
  copy: KeptCopy<"warnings"> | null;
  place: WeatherPlace | null;
  source: WeatherSourceInfo | undefined;
  now: number;
}) {
  if (!copy) {
    return <p className="text-body text-ink-muted">Warnings have not been fetched yet. Press Update now when there is a connection.</p>;
  }
  const data = copy.data as WarningsData;
  const region = place ? regionName(place.region) : null;
  const here = region ? data.items.filter((item) => item.region === region) : [];
  const elsewhere = region ? data.items.filter((item) => item.region !== region) : data.items;
  return (
    <div>
      <AgeLine copy={copy} source={source} now={now} />
      <CopyMayBeOld source={source} />
      {region ? (
        <section aria-label={`Warnings for ${region}`}>
          <h3 className="text-body font-semibold text-ink">{region}</h3>
          {here.length === 0 ? (
            <p className="mt-1 text-body text-ink">No Met Office warning for {region} was in the feed when it was fetched.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border border-y border-border">
              {here.map((item) => (
                <WarningRow key={item.id} item={item} now={now} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        <Notice tone="info" className="mb-4">
          Choose this place's Met Office warning region (under Places) to see the warnings for it first. Outpost cannot tell the region from
          a position.
        </Notice>
      )}
      <details className="mt-6" open={!region}>
        <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
          {elsewhere.length === 0 ? "No warnings elsewhere in the UK" : `Warnings elsewhere in the UK (${elsewhere.length})`}
        </summary>
        <ul className="divide-y divide-border border-y border-border">
          {elsewhere.map((item) => (
            <WarningRow key={item.id} item={item} now={now} />
          ))}
        </ul>
      </details>
      <Credit source={source} />
    </div>
  );
}

export function FloodView({ copy, source, now }: { copy: KeptCopy<"flood"> | null; source: WeatherSourceInfo | undefined; now: number }) {
  if (!copy) {
    return <p className="text-body text-ink-muted">Flood warnings and river levels have not been fetched for this place yet.</p>;
  }
  const data = copy.data as FloodData;
  const inForce = data.warnings.filter((warning) => warning.severityLevel <= 3);
  const ended = data.warnings.filter((warning) => warning.severityLevel > 3);
  return (
    <div>
      <AgeLine copy={copy} source={source} now={now} />
      <CopyMayBeOld source={source} />
      <p className="mb-4 text-small text-ink-muted">
        The Environment Agency covers England only, and says its data "should not be relied upon for safety critical applications. They do
        not replace the existing channels by which the Agency notifies members of the public".
      </p>
      <h3 className="text-body font-semibold text-ink">Flood warnings within {data.warningsWithinKm} km</h3>
      {inForce.length === 0 ? (
        <p className="mt-1 text-body text-ink">None was in force within {data.warningsWithinKm} km when this was fetched.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border border-y border-border">
          {inForce.map((warning) => (
            <li key={warning.id} className="py-3">
              <Badge tone={warning.severityLevel <= 2 ? "danger" : "warning"}>{warning.severity}</Badge>
              <p className="mt-1.5 font-semibold text-ink">
                {warning.area}
                {warning.county ? `, ${warning.county}` : ""}
              </p>
              <p className="mt-0.5 text-body whitespace-pre-line text-ink">{warning.message.trim()}</p>
              {warning.changedAt ? (
                <p className="mt-1 text-small text-ink-muted">Message last changed {formatDateTime(warning.changedAt)}.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {ended.length > 0 ? (
        <p className="mt-2 text-small text-ink-muted">{plural(ended.length, "nearby warning")} no longer in force.</p>
      ) : null}

      <p className="mt-8 text-body text-ink">
        River and sea levels near this place are under{" "}
        <Link className="text-primary underline underline-offset-2" to="?view=rivers">
          River and sea levels
        </Link>
        .
      </p>
      <Credit source={source} />
    </div>
  );
}
