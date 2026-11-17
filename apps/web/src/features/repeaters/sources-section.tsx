/**
 * Where a list of repeaters can be had, country by country.
 *
 * Each source says one of three things: Outpost can get the list (its publisher offers
 * a file and nothing in its terms forbids an application fetching it), the list is to
 * be downloaded by hand (with the publisher's page and the steps), or there is nothing
 * usable. The reason and the terms as they were read are beside each one.
 *
 * Nothing here contacts anybody until "Get the list" is pressed. Then the server
 * fetches that one file, and what it holds is shown in the import dialog before
 * anything is kept. The publisher's page is a plain link: the browser opens it, Outpost
 * does not.
 */
import type { RepeaterFetchResponse, RepeaterListDto, RepeaterSourceDto, RepeaterSourceRegion } from "@outpost/shared";
import { ChevronRight, CircleAlert, Download, ExternalLink, FileUp, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useMarkers } from "@/features/maps/data";
import { ApiError, errorMessage } from "@/lib/api";
import { formatDate, plural } from "@/lib/utils";
import { fetchSource, type LatLon, useRepeaterSources } from "./data";
import { ImportDialog } from "./import-dialog";
import { lastMapCentre } from "./origin";
import { dayText } from "./words";

const inside = (bbox: [number, number, number, number], point: LatLon) => {
  const [west, south, east, north] = bbox;
  const eastWest = west <= east ? point.lon >= west && point.lon <= east : point.lon >= west || point.lon <= east;
  return point.lat >= south && point.lat <= north && eastWest;
};
const areaOf = ([west, south, east, north]: [number, number, number, number]) =>
  (north - south) * (west <= east ? east - west : 360 - west + east);

/**
 * The regions in the order they are shown: those the person is likely in first (the
 * smallest that holds the middle of the map as it was last left; failing a map, those
 * holding the most saved places), then the whole world, then the rest by name. No
 * location is asked for.
 */
export function orderRegions(
  regions: RepeaterSourceRegion[],
  centre: LatLon | null,
  places: LatLon[],
): { likely: RepeaterSourceRegion[]; rest: RepeaterSourceRegion[] } {
  const boxed = regions.filter(
    (region): region is RepeaterSourceRegion & { bbox: [number, number, number, number] } => region.bbox !== null,
  );
  let likely: RepeaterSourceRegion[] = [];
  if (centre) likely = boxed.filter((region) => inside(region.bbox, centre)).sort((a, b) => areaOf(a.bbox) - areaOf(b.bbox));
  else if (places.length > 0) {
    const counted = boxed
      .map((region) => ({ region, count: places.filter((place) => inside(region.bbox, place)).length }))
      .filter((item) => item.count > 0);
    likely = counted.sort((a, b) => b.count - a.count || areaOf(a.region.bbox) - areaOf(b.region.bbox)).map((item) => item.region);
  }
  const taken = new Set(likely.map((region) => region.id));
  const world = regions.filter((region) => region.bbox === null);
  const others = boxed.filter((region) => !taken.has(region.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { likely, rest: [...world, ...others] };
}

const hostOf = (address: string) => {
  try {
    return new URL(address).host.replace(/^www\./, "");
  } catch {
    return address;
  }
};

export interface GetList {
  /** The source being fetched now. */
  busyId: string | null;
  /** What went wrong the last time each source was asked. */
  problems: Record<string, { message: string; wait: boolean }>;
  start(source: RepeaterSourceDto, options?: { aloud?: boolean }): void;
  /** The fetched list waiting to be looked at. */
  waiting: { response: RepeaterFetchResponse; source: RepeaterSourceDto } | null;
  done(): void;
}

/** Fetching a source's list: one at a time, with what went wrong kept beside the source it happened to. */
export function useGetList(): GetList {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problems, setProblems] = useState<GetList["problems"]>({});
  const [waiting, setWaiting] = useState<GetList["waiting"]>(null);
  const start = useCallback<GetList["start"]>(
    (source, options) => {
      if (busyId) return;
      setBusyId(source.id);
      setProblems(({ [source.id]: _gone, ...others }) => others);
      fetchSource(source.id)
        .then((response) => setWaiting({ response, source }))
        .catch((error: unknown) => {
          const message = errorMessage(error);
          setProblems((current) => ({ ...current, [source.id]: { message, wait: error instanceof ApiError && error.status === 409 } }));
          if (options?.aloud) toast.error(message);
        })
        .finally(() => setBusyId(null));
    },
    [busyId],
  );
  return { busyId, problems, start, waiting, done: useCallback(() => setWaiting(null), []) };
}

function SourceRow({
  source,
  getList,
  onImport,
}: {
  source: RepeaterSourceDto;
  getList: GetList;
  onImport: (source: RepeaterSourceDto) => void;
}) {
  const busy = getList.busyId === source.id;
  const problem = getList.problems[source.id];
  const host = hostOf(source.pageUrl);
  return (
    <li className="grid gap-2 py-3.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <p className="text-body font-semibold text-ink">{source.name}</p>
          <p className="text-small text-ink-muted">
            {source.publisher}. {source.covers}
          </p>
          <p className="mt-1 text-small text-ink">
            {source.kind === "fetch" ? (
              <>
                Outpost can get this list.{" "}
                {source.held ? (
                  <span className="tabular">
                    Held as “{source.held.name}”: {plural(source.held.count, "repeater")}, data of {formatDate(source.held.dataDate)},
                    fetched {formatDate(source.held.fetchedAt)}.
                  </span>
                ) : (
                  "Not held yet."
                )}
              </>
            ) : source.kind === "link" ? (
              "To be downloaded by hand: Outpost does not fetch this one."
            ) : (
              "Nothing usable here."
            )}
          </p>
        </div>
        {source.kind === "fetch" ? (
          <Button size="sm" onClick={() => getList.start(source)} loading={busy} disabled={getList.busyId !== null && !busy}>
            {source.held ? <RefreshCw /> : <Download />} {source.held ? "Get it again" : "Get the list"}
          </Button>
        ) : source.kind === "link" ? (
          <Button asChild size="sm" className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal max-md:h-auto max-md:min-h-10">
            <a href={source.pageUrl} target="_blank" rel="noreferrer noopener">
              <ExternalLink /> Open {host}
            </a>
          </Button>
        ) : null}
      </div>

      {busy ? (
        <p className="text-small text-ink" role="status">
          Asking {source.fetch?.host ?? host} for the file. A large list can take a minute.
        </p>
      ) : null}
      {problem ? (
        <Notice
          tone={problem.wait ? "warning" : "danger"}
          icon={<CircleAlert />}
          title={problem.wait ? "Not yet" : "The list was not fetched"}
        >
          {problem.message}
        </Notice>
      ) : null}

      {source.kind === "link" ? (
        <div className="grid gap-2">
          <ol className="ml-5 grid max-w-[68ch] list-decimal gap-1 text-small text-ink marker:text-ink-muted">
            {source.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onImport(source)}
              className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal max-md:h-auto max-md:min-h-10"
            >
              <FileUp /> Import the file from {source.publisher.replace(/\s*\(.*\)$/, "")}
            </Button>
          </div>
        </div>
      ) : null}

      <details className="group">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-small text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-90" />
          Why, and its terms as read
        </summary>
        <div className="mt-1 ml-5.5 grid max-w-[68ch] gap-1.5 text-small text-ink">
          <p>{source.why}</p>
          <p className="text-ink-muted">{source.termsNote}</p>
          <p className="text-ink-muted">
            Read on {dayText(source.termsRead)}.{" "}
            <a href={source.termsUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
              Where it was read
            </a>
            {source.kind === "fetch" && source.fetch ? (
              <>
                {" "}
                The file comes from <span className="font-mono text-[0.8125rem] break-all">{source.fetch.host}</span>, and Outpost leaves{" "}
                {source.fetch.waitSeconds} seconds between two requests to it.
              </>
            ) : null}
          </p>
        </div>
      </details>
    </li>
  );
}

const kindsLine = (sources: RepeaterSourceDto[]) => {
  const count = (kind: RepeaterSourceDto["kind"]) => sources.filter((source) => source.kind === kind).length;
  return [
    count("fetch") > 0 ? `${count("fetch")} Outpost can get` : "",
    count("link") > 0 ? `${count("link")} by hand` : "",
    count("none") > 0 ? `${count("none")} with nothing usable` : "",
  ]
    .filter(Boolean)
    .join(", ");
};

export function SourcesSection({ lists, getList, className }: { lists: RepeaterListDto[]; getList: GetList; className?: string }) {
  const sources = useRepeaterSources();
  const markers = useMarkers();
  const [importing, setImporting] = useState<RepeaterSourceDto | null>(null);
  const centre = useMemo(() => lastMapCentre(), []);
  const ordered = useMemo(
    () =>
      orderRegions(
        sources.data?.regions ?? [],
        centre,
        (markers.data ?? []).map((marker) => ({ lat: marker.lat, lon: marker.lon })),
      ),
    [sources.data, centre, markers.data],
  );
  const waiting = getList.waiting;
  const updating = waiting?.response.fetched.listId ? (lists.find((list) => list.id === waiting.response.fetched.listId) ?? null) : null;

  const group = (region: RepeaterSourceRegion, open: boolean) => {
    const mine = (sources.data?.sources ?? []).filter((source) => source.region === region.id);
    if (mine.length === 0) return null;
    return (
      <details key={region.id} aria-label={region.name} className="group/region border-b border-border" open={open}>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-baseline gap-x-3 py-2 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 self-center text-ink-muted transition-transform duration-150 group-open/region:rotate-90"
          />
          <span className="text-body font-semibold text-ink">{region.name}</span>
          <span className="tabular text-small text-ink-muted">{kindsLine(mine)}</span>
        </summary>
        <Rows aria-label={`Sources for ${region.name}`} className="mb-2 ml-1 border-b-0 sm:ml-6">
          {mine.map((source) => (
            <SourceRow key={source.id} source={source} getList={getList} onImport={setImporting} />
          ))}
        </Rows>
      </details>
    );
  };

  return (
    <Section
      className={className}
      title="Get a list"
      description="By country. Getting a list needs the internet for the moment it takes; nothing else on this screen does."
    >
      {sources.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-16 w-full" />
          <span className="sr-only">Loading the sources</span>
        </div>
      ) : sources.isError ? (
        <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
      ) : sources.data.sources.length === 0 ? (
        <p className="border-y border-border py-4 text-small text-ink-muted">
          No source of repeater lists is declared on this server. A list you have as a file can still be imported.
        </p>
      ) : (
        <>
          <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
            Outpost fetches a list itself only where its publisher offers a file and nothing in its terms forbids a program fetching it.
            Where a publisher forbids that, wants a sign-in or checks for a browser, Outpost does not try: it gives the page and the steps,
            and you import the file.{" "}
            {ordered.likely.length > 0
              ? centre
                ? "The sources for where your map was last looking come first."
                : "The sources for where your saved places are come first."
              : ""}
          </p>
          {sources.data.problems.map((problem) => (
            <Notice key={problem} tone="warning" icon={<CircleAlert />} className="mb-3">
              {problem}
            </Notice>
          ))}
          <div className="border-t border-border">
            {ordered.likely.map((region) => group(region, true))}
            {ordered.rest.map((region) => group(region, region.bbox === null || ordered.likely.length === 0))}
          </div>
        </>
      )}

      <ImportDialog open={importing !== null} from={importing} onClose={() => setImporting(null)} />
      <ImportDialog open={waiting !== null} fetched={waiting} list={updating} onClose={getList.done} />
    </Section>
  );
}
