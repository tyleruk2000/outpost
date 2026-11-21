/**
 * Alerts beyond the UK: GDACS's disasters and the USGS's earthquakes worldwide, and the
 * national warnings for the country Home is in (MeteoAlarm in Europe, the National
 * Weather Service in the US). Fetched on this view's own press, kept, and shown with their
 * age and each publisher's words as written.
 */
import {
  type AlertsPlan,
  GDACS_TYPES,
  haversineMeters,
  type KeptCopy,
  METEOALARM_DISCLAIMER,
  type WeatherKind,
  type WeatherSourceInfo,
  WORLD_KINDS,
} from "@outpost/shared";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { formatDateTime, formatNumber, plural } from "@/lib/utils";
import { AgeLine, Credit } from "./age-line";

/** How near an earthquake must be to Home to be listed first, km. Outpost's choice. */
const NEAR_KM = 1000;
const LEVEL_TONE = { Green: "neutral", Orange: "warning", Red: "danger", yellow: "warning", orange: "warning", red: "danger" } as const;

const title = (words: string) => words[0]!.toUpperCase() + words.slice(1);

export function AlertsView({
  plan,
  copyOf,
  sources,
  now,
  fetching,
  onFetch,
}: {
  plan: AlertsPlan;
  copyOf: <K extends WeatherKind>(kind: K) => KeptCopy<K> | null;
  sources: WeatherSourceInfo[];
  now: number;
  fetching: boolean;
  onFetch: (kinds: WeatherKind[]) => void;
}) {
  const source = (kind: WeatherKind) => sources.find((candidate) => candidate.kind === kind);
  const kinds: WeatherKind[] = plan.national ? [...WORLD_KINDS, plan.national] : WORLD_KINDS;
  const nationalName = plan.national === "meteoalarm" ? "MeteoAlarm" : plan.national === "nws" ? "the US National Weather Service" : null;

  return (
    <div className="grid gap-10">
      <div className="grid max-w-[70ch] gap-3">
        <p className="text-body text-ink">
          {plan.home
            ? plan.countryName
              ? `Home (${plan.home.name}) is taken to be in ${plan.countryName}, from its position on the map. `
              : `Outpost cannot tell which country Home (${plan.home.name}) is in. `
            : "No saved place has the home icon, so only the worldwide feeds are fetched. "}
          {nationalName
            ? `Fetch alerts asks GDACS and the USGS for the whole world, and ${nationalName} for ${plan.countryName}.`
            : plan.home
              ? `Outpost knows no open national warning feed for ${plan.countryName ?? "it"}, so Fetch alerts asks GDACS and the USGS for the whole world.`
              : "Fetch alerts asks GDACS and the USGS for the whole world."}{" "}
          {plan.home ? null : (
            <Link className="text-primary underline underline-offset-2" to="/maps">
              Mark Home on the map
            </Link>
          )}
        </p>
        <div>
          <Button variant="secondary" loading={fetching} onClick={() => onFetch(kinds)}>
            <RefreshCw />
            Fetch alerts
          </Button>
        </div>
        <p className="text-small text-ink-muted">
          These are copies, fetched when you press. Nothing here replaces the warnings of the authorities where you are.
        </p>
      </div>

      {plan.national === "meteoalarm" ? <MeteoalarmSection copy={copyOf("meteoalarm")} source={source("meteoalarm")} now={now} /> : null}
      {plan.national === "nws" ? <NwsSection copy={copyOf("nws")} source={source("nws")} now={now} /> : null}
      <GdacsSection copy={copyOf("gdacs")} source={source("gdacs")} now={now} />
      <QuakesSection copy={copyOf("quakes")} source={source("quakes")} now={now} home={plan.home} />
    </div>
  );
}

function NotFetched({ what }: { what: string }) {
  return <p className="mt-1 text-body text-ink-muted">{what} have not been fetched yet. Press Fetch alerts when there is a connection.</p>;
}

function MeteoalarmSection({
  copy,
  source,
  now,
}: {
  copy: KeptCopy<"meteoalarm"> | null;
  source: WeatherSourceInfo | undefined;
  now: number;
}) {
  const items = copy?.data.items ?? [];
  const here = items.filter((item) => item.coversHome === true);
  const rest = items.filter((item) => item.coversHome !== true);
  return (
    <section aria-labelledby="meteoalarm-heading">
      <h3 id="meteoalarm-heading" className="text-lead font-semibold text-ink">
        National warnings{copy ? ` for ${copy.data.countryName}` : ""}
      </h3>
      {!copy ? (
        <NotFetched what="MeteoAlarm's warnings" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          <p className="mb-3 max-w-[70ch] text-small text-ink">{METEOALARM_DISCLAIMER}</p>
          {items.length === 0 ? (
            <p className="text-body text-ink">No warning was in the feed for {copy.data.countryName} when it was fetched.</p>
          ) : (
            <>
              {here.length > 0 ? (
                <>
                  <h4 className="mt-2 text-body font-semibold text-ink">Covering Home ({here.length})</h4>
                  <MeteoalarmList items={here} />
                </>
              ) : (
                <p className="text-body text-ink">
                  No warning in the feed gives an area that holds Home. Some areas are named only, not drawn, so check the names below.
                </p>
              )}
              {rest.length > 0 ? (
                <details className="mt-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
                    Other warnings in {copy.data.countryName} ({formatNumber(rest.length)})
                  </summary>
                  <MeteoalarmList items={rest.slice(0, 300)} />
                  {rest.length > 300 ? <p className="mt-1 text-small text-ink-muted">The first 300 are listed.</p> : null}
                </details>
              ) : null}
            </>
          )}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}

function MeteoalarmList({ items }: { items: NonNullable<KeptCopy<"meteoalarm">["data"]>["items"] }) {
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={`${item.id}-${item.area}`} className="py-3">
          {item.level ? <Badge tone={LEVEL_TONE[item.level]}>{title(item.level)}</Badge> : null}
          <p className="mt-1.5 font-semibold text-ink">{item.title || item.event}</p>
          <p className="text-small text-ink-muted">
            {item.area}. {item.onset ? `From ${formatDateTime(item.onset)}` : ""}
            {item.expires ? ` until ${formatDateTime(item.expires)}` : ""}. Issued{" "}
            {item.sent ? formatDateTime(item.sent) : "at a time not given"}.
          </p>
          {item.link ? (
            <a
              className="inline-block min-h-11 py-2 text-small text-primary underline underline-offset-2 md:min-h-0 md:py-0"
              href={item.link}
              target="_blank"
              rel="noreferrer"
            >
              On meteoalarm.org
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function NwsSection({ copy, source, now }: { copy: KeptCopy<"nws"> | null; source: WeatherSourceInfo | undefined; now: number }) {
  return (
    <section aria-labelledby="nws-heading">
      <h3 id="nws-heading" className="text-lead font-semibold text-ink">
        Alerts in force at Home
      </h3>
      {!copy ? (
        <NotFetched what="The National Weather Service's alerts" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          {copy.data.alerts.length === 0 ? (
            <p className="text-body text-ink">No watch, warning or advisory was in force at Home when this was fetched.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {copy.data.alerts.map((alert) => (
                <li key={alert.id} className="py-3">
                  <Badge tone={alert.severity === "Extreme" || alert.severity === "Severe" ? "danger" : "warning"}>
                    {alert.severity || "Severity not given"}
                  </Badge>
                  <p className="mt-1.5 font-semibold text-ink">{alert.event}</p>
                  <p className="text-body text-ink">{alert.headline}</p>
                  <p className="mt-1 text-body whitespace-pre-line text-ink">{alert.description}</p>
                  {alert.instruction ? <p className="mt-1 text-body whitespace-pre-line text-ink">{alert.instruction}</p> : null}
                  <p className="mt-1 text-small text-ink-muted">
                    {alert.sender}. {alert.area}.
                    {alert.ends
                      ? ` Until ${formatDateTime(alert.ends)}.`
                      : alert.expires
                        ? ` Expires ${formatDateTime(alert.expires)}.`
                        : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}

function GdacsSection({ copy, source, now }: { copy: KeptCopy<"gdacs"> | null; source: WeatherSourceInfo | undefined; now: number }) {
  const order = { Red: 0, Orange: 1, Green: 2 } as const;
  const events = [...(copy?.data.events ?? [])].sort((a, b) => (a.level ? order[a.level] : 3) - (b.level ? order[b.level] : 3));
  const serious = events.filter((event) => event.level === "Red" || event.level === "Orange");
  const green = events.filter((event) => event.level !== "Red" && event.level !== "Orange");
  return (
    <section aria-labelledby="gdacs-heading">
      <h3 id="gdacs-heading" className="text-lead font-semibold text-ink">
        Disasters worldwide
      </h3>
      {!copy ? (
        <NotFetched what="GDACS's disasters" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
            GDACS's alerts are worked out automatically, and it says they are "not meant to substitute nor to override any official
            information or alert message from local or national disaster management authorities".
          </p>
          {serious.length === 0 ? (
            <p className="text-body text-ink">No orange or red alert was current when this was fetched.</p>
          ) : (
            <GdacsList events={serious} />
          )}
          {green.length > 0 ? (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
                Green alerts ({formatNumber(green.length)})
              </summary>
              <GdacsList events={green} />
            </details>
          ) : null}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}

function GdacsList({ events }: { events: NonNullable<KeptCopy<"gdacs">["data"]>["events"] }) {
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {events.map((event) => (
        <li key={event.id} className="py-3">
          <div className="flex flex-wrap gap-2">
            {event.level ? <Badge tone={LEVEL_TONE[event.level]}>{event.level}</Badge> : null}
            <Badge tone="neutral">{GDACS_TYPES[event.type] ?? event.type}</Badge>
          </div>
          <p className="mt-1.5 text-body text-ink">{event.title}</p>
          {event.link ? (
            <a
              className="inline-block min-h-11 py-2 text-small text-primary underline underline-offset-2 md:min-h-0 md:py-0"
              href={event.link}
              target="_blank"
              rel="noreferrer"
            >
              GDACS's report
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function QuakesSection({
  copy,
  source,
  now,
  home,
}: {
  copy: KeptCopy<"quakes"> | null;
  source: WeatherSourceInfo | undefined;
  now: number;
  home: AlertsPlan["home"];
}) {
  const quakes = (copy?.data.quakes ?? []).map((quake) => ({
    ...quake,
    km: home ? haversineMeters(home.lat, home.lon, quake.lat, quake.lon) / 1000 : null,
  }));
  const near = quakes.filter((quake) => quake.km !== null && quake.km <= NEAR_KM);
  return (
    <section aria-labelledby="quakes-heading">
      <h3 id="quakes-heading" className="text-lead font-semibold text-ink">
        Earthquakes of magnitude 4.5 and over, past week
      </h3>
      {!copy ? (
        <NotFetched what="The USGS's earthquakes" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          {home ? (
            <p className="mb-3 text-body text-ink">
              {near.length === 0
                ? `None within ${formatNumber(NEAR_KM)} km of Home.`
                : `${plural(near.length, "earthquake")} within ${formatNumber(NEAR_KM)} km of Home, listed first.`}
            </p>
          ) : null}
          {quakes.length === 0 ? (
            <p className="text-body text-ink">None in the feed.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {[...near, ...quakes.filter((quake) => !near.includes(quake))].slice(0, 60).map((quake) => (
                <li key={quake.id} className="py-2.5">
                  <p className="text-body text-ink">
                    <span className="tabular font-semibold">M {quake.mag?.toFixed(1) ?? "?"}</span> {quake.place}
                    {quake.km !== null ? (
                      <span className="tabular text-ink-muted">, {formatNumber(Math.round(quake.km))} km from Home</span>
                    ) : null}
                  </p>
                  <p className="text-small text-ink-muted">
                    {formatDateTime(quake.time)}
                    {quake.pager ? `. PAGER alert ${quake.pager}` : ""}
                    {quake.tsunami ? ". The USGS has set its tsunami flag; it is not a tsunami warning" : ""}.{" "}
                    {quake.url ? (
                      <a className="text-primary underline underline-offset-2" href={quake.url} target="_blank" rel="noreferrer">
                        The USGS's page
                      </a>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {quakes.length > 60 ? <p className="mt-1 text-small text-ink-muted">60 of {formatNumber(quakes.length)} are listed.</p> : null}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}
