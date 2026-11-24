/**
 * Alerts beyond the UK: GDACS's disasters and the USGS's earthquakes worldwide, and the
 * national warnings for the country Home is in, or the one a person chooses near a
 * border (MeteoAlarm in Europe, the US National Weather Service, Environment and Climate
 * Change Canada, MetService in New Zealand, the Japan Meteorological Agency). Fetched on
 * this view's own press, kept, and shown with their age and each publisher's words as
 * written.
 */
import {
  ALERT_COUNTRIES,
  type AlertsPlan,
  GDACS_TYPES,
  haversineMeters,
  homeLabel,
  type JmaLevel,
  type KeptCopy,
  METEOALARM_DISCLAIMER,
  meteoalarmNotCurrent,
  meteoalarmServices,
  NATIONAL_SERVICE_NAMES,
  namesInWords,
  type WeatherKind,
  type WeatherSourceInfo,
  WORLD_KINDS,
} from "@outpost/shared";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Select } from "@/components/ui/misc";
import { NoHome } from "@/features/households/home";
import { formatDateTime, formatNumber, plural } from "@/lib/utils";
import { AgeLine, Credit } from "./age-line";
import { useSetAlertCountry } from "./data";

/** How near an earthquake must be to Home to be listed first, km. Outpost's choice. */
const NEAR_KM = 1000;
const LEVEL_TONE = { Green: "neutral", Orange: "warning", Red: "danger", yellow: "warning", orange: "warning", red: "danger" } as const;
const JMA_TONE: Record<JmaLevel, "danger" | "warning" | "neutral"> = {
  特別警報: "danger",
  危険警報: "danger",
  警報: "warning",
  注意報: "neutral",
  解除: "neutral",
};

const title = (words: string) => words[0]!.toUpperCase() + words.slice(1);

export function AlertsView({
  plan,
  copyOf,
  sources,
  now,
  fetching,
  onFetch,
  part = "all",
}: {
  /** "national": the country's own warnings alone (the Warnings tab outside the UK); "world": GDACS and the USGS alone; "all": both. */
  part?: "national" | "world" | "all";
  plan: AlertsPlan;
  copyOf: <K extends WeatherKind>(kind: K) => KeptCopy<K> | null;
  sources: WeatherSourceInfo[];
  now: number;
  fetching: boolean;
  onFetch: (kinds: WeatherKind[]) => void;
}) {
  const source = (kind: WeatherKind) => sources.find((candidate) => candidate.kind === kind);
  const national = part !== "world";
  const world = part !== "national";
  const kinds: WeatherKind[] = [...(world ? WORLD_KINDS : []), ...(national && plan.national ? [plan.national] : [])];
  const nationalName = plan.national ? NATIONAL_SERVICE_NAMES[plan.national] : null;
  // Whose home: "Home", or the current household's name when there are several; a moving home says how old its position is.
  const who = plan.household ?? "Home";
  const homeName = plan.home ? homeLabel({ name: plan.home.name, at: plan.home.at ?? null }, now) : "";
  const kept = plan.national ? copyOf(plan.national) : null;
  const movedSince = plan.home?.at != null && kept !== null && kept.fetchedAt < plan.home.at;

  return (
    <div className="grid gap-10">
      <div className="grid max-w-[70ch] gap-3">
        <p className="text-body text-ink">
          {plan.home
            ? plan.homeCountryName
              ? `${who} (${homeName}) is taken to be in ${plan.homeCountryName}, from its position on the map. `
              : `Outpost cannot tell which country ${who} (${homeName}) is in. `
            : ""}
          {national && plan.chosenCountry ? `National warnings are fetched for ${plan.countryName}, as chosen below. ` : ""}
          {part === "national"
            ? nationalName
              ? `Update now and Fetch warnings ask ${nationalName} for ${plan.countryName}. Disasters and earthquakes worldwide are under Worldwide.`
              : plan.country
                ? `Outpost knows no open national warning feed for ${plan.countryName}. Follow your national weather service's warnings; disasters and earthquakes worldwide are under Worldwide.`
                : "Outpost does not know which country's warnings to fetch. Mark home on the map, or choose a country below."
            : part === "world"
              ? "Fetch alerts asks GDACS and the USGS for the whole world. Your country's own warnings are under Warnings."
              : nationalName
                ? `Fetch alerts asks GDACS and the USGS for the whole world, and ${nationalName} for ${plan.countryName}.`
                : plan.country
                  ? `Outpost knows no open national warning feed for ${plan.countryName}, so Fetch alerts asks GDACS and the USGS for the whole world.`
                  : "Fetch alerts asks GDACS and the USGS for the whole world."}
        </p>
        {plan.home ? null : <NoHome />}
        {national && movedSince ? (
          <p className="text-small text-ink-muted">
            The {nationalName} copy kept was fetched before {plan.household ?? "the household"} last moved, so it is for the earlier place.
            Press Fetch alerts for where it is now.
          </p>
        ) : null}
        {national ? <CountryChoice plan={plan} /> : null}
        {kinds.length > 0 ? (
          <div>
            <Button variant="secondary" loading={fetching} onClick={() => onFetch(kinds)}>
              <RefreshCw />
              {part === "national" ? "Fetch warnings" : "Fetch alerts"}
            </Button>
          </div>
        ) : null}
        <p className="text-small text-ink-muted">
          These are copies, fetched when you press. Nothing here replaces the warnings of the authorities where you are.
        </p>
      </div>

      {national && plan.national === "meteoalarm" ? (
        <MeteoalarmSection copy={copyOf("meteoalarm")} source={source("meteoalarm")} now={now} />
      ) : null}
      {national && plan.national === "nws" ? <NwsSection copy={copyOf("nws")} source={source("nws")} now={now} /> : null}
      {national && plan.national === "eccc" ? <EcccSection copy={copyOf("eccc")} source={source("eccc")} now={now} /> : null}
      {national && plan.national === "metservice" ? (
        <MetserviceSection copy={copyOf("metservice")} source={source("metservice")} now={now} />
      ) : null}
      {national && plan.national === "jma" ? <JmaSection copy={copyOf("jma")} source={source("jma")} now={now} /> : null}
      {world ? <GdacsSection copy={copyOf("gdacs")} source={source("gdacs")} now={now} /> : null}
      {world ? <QuakesSection copy={copyOf("quakes")} source={source("quakes")} now={now} home={plan.home} /> : null}
    </div>
  );
}

/** Near a border, Home's position can fall in the wrong country's box, or the household may want the neighbour's warnings. */
function CountryChoice({ plan }: { plan: AlertsPlan }) {
  const set = useSetAlertCountry();
  return (
    <div className="grid max-w-sm gap-1.5">
      <span className="text-small font-medium text-ink">Country for national warnings</span>
      <Select
        aria-label="Country for national warnings"
        value={plan.chosenCountry ?? "home"}
        onChange={(code) => set.mutate(code === "home" ? "" : code)}
        disabled={set.isPending}
        options={[
          { value: "home", label: plan.homeCountryName ? `Home's country (${plan.homeCountryName})` : "Home's country" },
          ...ALERT_COUNTRIES.map((country) => ({ value: country.code, label: title(country.name.replace(/^the /, "")) })),
        ]}
      />
      <span className="text-small text-ink-muted">Choose one near a border, where Home's position may be read as the wrong country.</span>
    </div>
  );
}

function NotFetched({ what }: { what: string }) {
  return (
    <p className="mt-1 text-body text-ink-muted">
      {what} have not been fetched yet. Press Fetch alerts or Update now when there is a connection.
    </p>
  );
}

function EcccSection({ copy, source, now }: { copy: KeptCopy<"eccc"> | null; source: WeatherSourceInfo | undefined; now: number }) {
  const alerts = copy?.data.alerts ?? [];
  const inForce = alerts.filter((alert) => alert.status !== "ended");
  const ended = alerts.filter((alert) => alert.status === "ended");
  return (
    <section aria-labelledby="eccc-heading">
      <h3 id="eccc-heading" className="text-lead font-semibold text-ink">
        Alerts for the area that holds Home
      </h3>
      {!copy ? (
        <NotFetched what="Environment and Climate Change Canada's alerts" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          {inForce.length === 0 ? (
            <p className="text-body text-ink">No warning, watch, advisory or statement was in force at Home when this was fetched.</p>
          ) : (
            <EcccList alerts={inForce} />
          )}
          {ended.length > 0 ? (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
                Ended ({formatNumber(ended.length)})
              </summary>
              <EcccList alerts={ended} />
            </details>
          ) : null}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}

function EcccList({ alerts }: { alerts: NonNullable<KeptCopy<"eccc">["data"]>["alerts"] }) {
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {alerts.map((alert) => (
        <li key={alert.id} className="py-3">
          <div className="flex flex-wrap gap-2">
            {alert.colour === "red" || alert.colour === "orange" || alert.colour === "yellow" ? (
              <Badge tone={LEVEL_TONE[alert.colour]}>{title(alert.colour)}</Badge>
            ) : null}
            <Badge tone="neutral">{alert.status ? title(alert.status) : "Status not given"}</Badge>
          </div>
          <p className="mt-1.5 font-semibold text-ink">{title(alert.name || alert.type || "Alert")}</p>
          <p className="mt-1 text-body whitespace-pre-line text-ink">{alert.text}</p>
          <p className="mt-1 text-small text-ink-muted">
            {alert.area}
            {alert.province ? `, ${alert.province}` : ""}.{alert.coversHome === false ? " Its area is next to Home's, not over it." : ""}{" "}
            Issued {alert.published ? formatDateTime(alert.published) : "at a time not given"}
            {alert.eventEnd ? `; expected to end ${formatDateTime(alert.eventEnd)}` : ""}.
          </p>
        </li>
      ))}
    </ul>
  );
}

function MetserviceSection({
  copy,
  source,
  now,
}: {
  copy: KeptCopy<"metservice"> | null;
  source: WeatherSourceInfo | undefined;
  now: number;
}) {
  const alerts = copy?.data.alerts ?? [];
  const here = alerts.filter((alert) => alert.coversHome === true);
  const rest = alerts.filter((alert) => alert.coversHome !== true);
  return (
    <section aria-labelledby="metservice-heading">
      <h3 id="metservice-heading" className="text-lead font-semibold text-ink">
        National warnings for New Zealand
      </h3>
      {!copy ? (
        <NotFetched what="MetService's warnings" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          {copy.data.unread > 0 ? (
            <p className="mb-3 text-small text-warning">
              {plural(copy.data.unread, "alert")} could not be read in full, so {copy.data.unread === 1 ? "it is" : "they are"} shown from
              the feed's words only, and whether {copy.data.unread === 1 ? "it covers" : "they cover"} Home is not known.
            </p>
          ) : null}
          {alerts.length === 0 ? (
            <p className="text-body text-ink">No outlook, watch or warning was in MetService's feed when it was fetched.</p>
          ) : (
            <>
              {here.length > 0 ? (
                <>
                  <h4 className="mt-2 text-body font-semibold text-ink">Covering Home ({here.length})</h4>
                  <CapList alerts={here} />
                </>
              ) : (
                <p className="text-body text-ink">No alert in the feed draws an area that holds Home. Check the areas named below.</p>
              )}
              {rest.length > 0 ? (
                <details className="mt-4" open={here.length === 0}>
                  <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
                    Elsewhere in New Zealand ({formatNumber(rest.length)})
                  </summary>
                  <CapList alerts={rest} />
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

function CapList({ alerts }: { alerts: NonNullable<KeptCopy<"metservice">["data"]>["alerts"] }) {
  const tone = (colour: string | null) => {
    const word = colour?.toLowerCase();
    return word === "red" ? "danger" : word === "orange" || word === "yellow" ? "warning" : "neutral";
  };
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {alerts.map((alert) => (
        <li key={alert.id} className="py-3">
          {alert.colour ? <Badge tone={tone(alert.colour)}>{alert.colour}</Badge> : null}
          <p className="mt-1.5 font-semibold text-ink">{alert.headline || alert.title}</p>
          {alert.description ? <p className="mt-1 text-body whitespace-pre-line text-ink">{alert.description}</p> : null}
          {alert.instruction ? <p className="mt-1 text-body whitespace-pre-line text-ink">{alert.instruction}</p> : null}
          <p className="mt-1 text-small text-ink-muted">
            {alert.area ? `${alert.area}. ` : ""}
            {alert.onset ? `From ${formatDateTime(alert.onset)}` : ""}
            {alert.expires ? ` until ${formatDateTime(alert.expires)}` : ""}
            {alert.onset || alert.expires ? ". " : ""}Issued {alert.sent ? formatDateTime(alert.sent) : "at a time not given"}.
          </p>
        </li>
      ))}
    </ul>
  );
}

function JmaSection({ copy, source, now }: { copy: KeptCopy<"jma"> | null; source: WeatherSourceInfo | undefined; now: number }) {
  const entries = copy?.data.entries ?? [];
  const inForce = entries.filter((entry) => entry.level !== "解除");
  const lifted = entries.filter((entry) => entry.level === "解除");
  return (
    <section aria-labelledby="jma-heading">
      <h3 id="jma-heading" className="text-lead font-semibold text-ink">
        Weather warnings and advisories in Japan
      </h3>
      {!copy ? (
        <NotFetched what="The Japan Meteorological Agency's warnings" />
      ) : (
        <>
          <AgeLine copy={copy} source={source} now={now} />
          <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
            The latest headline from each local office, in Japanese as JMA wrote it, highest level first. Outpost cannot tell which
            prefecture Home is in: find its office below. 特別警報 is an emergency warning, 警報 a warning, 注意報 an advisory, 解除 lifted.
          </p>
          {inForce.length === 0 ? (
            <p className="text-body text-ink">No office's latest message had a warning or advisory in force when this was fetched.</p>
          ) : (
            <JmaList entries={inForce} />
          )}
          {lifted.length > 0 ? (
            <details className="mt-4">
              <summary className="min-h-11 cursor-pointer py-2 text-small font-medium text-primary">
                Lifted ({formatNumber(lifted.length)})
              </summary>
              <JmaList entries={lifted} />
            </details>
          ) : null}
          <Credit source={source} />
        </>
      )}
    </section>
  );
}

function JmaList({ entries }: { entries: NonNullable<KeptCopy<"jma">["data"]>["entries"] }) {
  return (
    <ul className="mt-1 divide-y divide-border border-y border-border">
      {entries.map((entry) => (
        <li key={entry.id} className="py-3" lang="ja">
          {entry.level ? <Badge tone={JMA_TONE[entry.level]}>{entry.level}</Badge> : null}
          <p className="mt-1.5 text-body text-ink">{entry.headline}</p>
          <p className="mt-1 text-small text-ink-muted">
            {entry.office}. <span lang="en-GB">Issued {entry.updated ? formatDateTime(entry.updated) : "at a time not given"}.</span>
          </p>
        </li>
      ))}
    </ul>
  );
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
  const services = copy ? namesInWords(meteoalarmServices(copy.data)) : "";
  return (
    <section aria-labelledby="meteoalarm-heading">
      <h3 id="meteoalarm-heading" className="text-lead font-semibold text-ink">
        National warnings{copy ? ` for ${copy.data.countryName}` : ""}
      </h3>
      {!copy ? (
        <NotFetched what="MeteoAlarm's warnings" />
      ) : (
        <>
          {meteoalarmNotCurrent(copy, now) ? <NotCurrent fetchedAt={copy.fetchedAt} /> : null}
          <AgeLine copy={copy} source={source} now={now} />
          {services ? (
            <p className="mb-2 max-w-[70ch] text-small text-ink">Warnings issued by {services}, as published through MeteoAlarm.</p>
          ) : null}
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
          {source ? (
            <p className="mt-4 text-micro text-ink-muted">
              {services ? `${services}, through ` : ""}EUMETNET – MeteoAlarm. www.meteoalarm.org.{" "}
              <a className="text-primary underline underline-offset-2" href={source.liveUrl} target="_blank" rel="noreferrer">
                {source.publisher}, live
              </a>
              .
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * MeteoAlarm's terms ask redistributed warnings to be never more than ten minutes behind. A
 * kept copy older than that is still shown, for use offline, but not as live warnings.
 */
function NotCurrent({ fetchedAt }: { fetchedAt: number }) {
  return (
    <p data-meteoalarm="not-current" className="mb-3 flex items-start gap-2 rounded-panel bg-warning-soft px-3 py-2 text-small text-ink">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>
        <strong className="font-semibold">Not current: for reference only.</strong> Fetched {formatDateTime(fetchedAt)}, more than ten
        minutes ago. Fetch alerts again, or see meteoalarm.org, for the warnings in force now.
      </span>
    </p>
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
            {item.sent ? formatDateTime(item.sent) : "at a time not given"}
            {item.sender ? ` by ${item.sender}` : ""}.
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
