/**
 * Today's HF conditions, beside the planner's monthly median: the solar flux, the
 * sunspot number, the K and A indices and NOAA's radio blackout, radiation storm and
 * geomagnetic storm scales, fetched from NOAA's Space Weather Prediction Center on a
 * press and kept with their age like the weather. Shown in words against the
 * prediction. Never passed to the engine: the prediction is worked out from the sunspot
 * number chosen in the form, and nothing here changes it.
 */
import { freshness, hfConditionsWords, type KeptCopy, type SpaceWeatherData } from "@outpost/shared";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { AgeLine, Credit } from "../weather/age-line";
import { useUpdate, useWeather } from "../weather/data";

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className="tabular text-body text-ink">{children}</dd>
    </div>
  );
}

const scale = (letter: string, value: { level: number; text: string } | null) =>
  value ? `${letter}${value.level} (${value.text})` : "not given";

export function TodayConditions() {
  const weather = useWeather();
  const update = useUpdate();
  const copy = (weather.data?.kept.find((candidate) => candidate.kind === "space-weather") ?? null) as KeptCopy<"space-weather"> | null;
  const source = weather.data?.sources.find((candidate) => candidate.kind === "space-weather");
  const now = Date.now();

  const fetch = () =>
    update.mutate(
      { kinds: ["space-weather"] },
      {
        onSuccess: ({ outcomes }) => {
          const failed = outcomes.find((outcome) => !outcome.ok);
          if (failed) notify.error(failed.message ?? "Today's conditions could not be fetched.");
          else toast.success("Today's conditions fetched.");
        },
        onError: (error) => notify.error(errorMessage(error)),
      },
    );

  return (
    <Section title="Today's conditions">
      <p className="max-w-[70ch] text-small text-ink">
        The prediction is a monthly median. These are today's figures for the whole Earth, from NOAA's Space Weather Prediction Center, set
        beside it in words. They are not passed to the prediction: it uses the sunspot number chosen above.
      </p>
      <div className="mt-3">
        <Button variant="secondary" loading={update.isPending} onClick={fetch} disabled={!weather.data}>
          <RefreshCw />
          {copy ? "Fetch today's conditions again" : "Fetch today's conditions"}
        </Button>
      </div>
      {weather.isPending ? (
        <Skeleton className="mt-4 h-24" />
      ) : weather.isError ? (
        <p className="mt-3 text-small text-danger">{errorMessage(weather.error)}</p>
      ) : !copy ? (
        <p className="mt-3 text-body text-ink-muted">
          Not fetched yet. Press the button when there is a connection; five small files are asked for.
        </p>
      ) : (
        <TodayFigures copy={copy} data={copy.data} source={source} now={now} />
      )}
    </Section>
  );
}

function TodayFigures({
  copy,
  data,
  source,
  now,
}: {
  copy: KeptCopy<"space-weather">;
  data: SpaceWeatherData;
  source: Parameters<typeof AgeLine>[0]["source"];
  now: number;
}) {
  const old = freshness(copy, now).state !== "fresh";
  return (
    <div className="mt-4" data-testid="today-conditions">
      <AgeLine copy={copy} source={source} now={now} />
      <ul className="grid max-w-[70ch] gap-2 text-body text-ink">
        {hfConditionsWords(data).map((line) => (
          <li key={line}>{old ? `When fetched: ${line[0]!.toLowerCase()}${line.slice(1)}` : line}</li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        <Figure label="Solar flux, 10.7 cm">{data.flux ? `${data.flux.value} sfu, ${formatDateTime(data.flux.at)}` : "not fetched"}</Figure>
        <Figure label="Sunspot number (SESC)">{data.sunspots ? `${data.sunspots.value}, on ${data.sunspots.day}` : "not fetched"}</Figure>
        <Figure label="Planetary K index">{data.kp ? `${data.kp.value.toFixed(2)}, ${formatDateTime(data.kp.at)}` : "not fetched"}</Figure>
        <Figure label="Running a index">{data.kp?.a ?? "not fetched"}</Figure>
        <Figure label="Radio blackouts">{scale("R", data.scales.r)}</Figure>
        <Figure label="Radiation storms">{scale("S", data.scales.s)}</Figure>
        <Figure label="Geomagnetic storms">{scale("G", data.scales.g)}</Figure>
      </dl>
      {data.wwv ? (
        <details className="mt-3 max-w-[70ch] text-small">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
            The geophysical alert message{data.wwv.issuedAt ? `, issued ${formatDateTime(data.wwv.issuedAt)}` : ""}
          </summary>
          <p className="whitespace-pre-line text-ink">{data.wwv.text}</p>
        </details>
      ) : null}
      <p className="mt-3 max-w-[70ch] text-small text-ink-muted">
        The sunspot number here is one day's count. The prediction's sunspot number is a smoothed monthly figure, a different measure: the
        two are not to be compared one for one.
      </p>
      <Credit source={source} />
    </div>
  );
}
