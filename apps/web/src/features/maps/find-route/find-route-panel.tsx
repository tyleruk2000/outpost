/**
 * "Find a route" in the Routes tab: look a known route up in a route source (a server
 * that answers from OpenStreetMap), see it on the map, and add it to your own routes.
 *
 * Nothing here contacts anyone until Search is pressed, and the view says which server
 * the search goes to before it is. One question is in flight at a time; leaving the
 * view drops it.
 */
import {
  type Bbox,
  pickRouteSource,
  type RoutePreview,
  type RouteSearchResult,
  type RouteSourceDto,
  type TrackDto,
  type TrackWithGeometryDto,
} from "@outpost/shared";
import { ArrowLeft, CircleAlert, Plus, Scan, Search, WifiOff } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Segmented, Select, Skeleton, Spinner } from "@/components/ui/misc";
import { ApiError, errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { useStoredState } from "../hooks";
import { formatDistance, formatDistanceWithMiles, type LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { terrainCover } from "../panels/route-editor";
import { Fact } from "../ui";
import { useAddFoundRoute, useRoutePreview, useRouteSearch, useRouteSources } from "./data";
import {
  continuity,
  continuityNote,
  dayOf,
  elementLabel,
  isStale,
  kindLabel,
  previewTrack,
  resultSummary,
  type SearchScope,
  searchBlocker,
  viewSearchable,
} from "./words";

/** The server searched last time, remembered in this browser like the other map preferences. */
const SOURCE_KEY = "outpost.maps.routeSource";
const isString = (value: unknown): value is string => typeof value === "string";

export type FindRouteMap = Pick<MapEngine, "getBounds" | "getCenter" | "fitBounds" | "on">;

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** A failed question: no connection is a normal state and is said as one; anything else is a failure with its reason. */
function Failure({ error, onRetry, onChangeServer }: { error: unknown; onRetry?: () => void; onChangeServer?: () => void }) {
  const offline = error instanceof ApiError && (error.code === "offline" || error.isUnreachable);
  return (
    <Notice
      tone={offline ? "warning" : "danger"}
      icon={offline ? <WifiOff /> : <CircleAlert />}
      title={offline ? "No connection" : "The search did not work"}
    >
      {errorMessage(error)}
      {onRetry || onChangeServer ? (
        <span className="mt-2 flex flex-wrap gap-2">
          {onRetry ? (
            <Button size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {onChangeServer ? (
            <Button size="sm" onClick={onChangeServer}>
              Ask another server
            </Button>
          ) : null}
        </span>
      ) : null}
    </Notice>
  );
}

function ResultRow({ result, centre, onOpen }: { result: RouteSearchResult; centre: LatLon | null; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3"
      >
        <span className="min-w-0">
          <span className="block text-small font-medium text-ink">{result.name}</span>
          {result.otherNames.length > 0 ? (
            <span className="block truncate text-small text-ink-muted">Also {result.otherNames.join(", ")}</span>
          ) : null}
          <span className="block text-small text-ink-muted">{resultSummary(result, centre)}</span>
        </span>
        {result.lengthMeters !== null ? (
          <span className="tabular shrink-0 text-small text-ink">{formatDistance(result.lengthMeters)}</span>
        ) : null}
      </button>
    </li>
  );
}

export function FindRoutePanel({
  engine,
  terrain,
  onClose,
  onPreview,
  onAdded,
  onNeedMap,
}: {
  engine: FindRouteMap | null;
  /** The box installed terrain covers; null when there is none. */
  terrain: Bbox | null;
  onClose: () => void;
  /** Draws a previewed route on the map, or takes it off again. */
  onPreview: (track: TrackWithGeometryDto | null) => void;
  onAdded: (track: TrackDto) => void;
  /** On a phone the panel is a sheet over the map: this lowers it so a preview can be seen. */
  onNeedMap: () => void;
}) {
  const sources = useRouteSources();
  const search = useRouteSearch();
  const preview = useRoutePreview();
  const add = useAddFoundRoute();
  const alternativesId = useId();
  const noteId = useId();
  const nameInput = useRef<HTMLInputElement>(null);

  const [storedSource, setStoredSource] = useStoredState(SOURCE_KEY, isString, "");
  const [text, setText] = useState("");
  const [view, setView] = useState<Bbox | null>(() => engine?.getBounds() ?? null);
  const [chosenScope, setChosenScope] = useState<SearchScope | null>(null);
  /** The results being looked at belong to this search, whatever the form says now. */
  const [asked, setAsked] = useState<{ text: string; scope: SearchScope } | null>(null);
  /** The trail of routes opened: a result, then perhaps a section of it. */
  const [trail, setTrail] = useState<RouteSearchResult[]>([]);
  const [withAlternatives, setWithAlternatives] = useState(false);
  /** The list of servers is one step away: most people never need it. */
  const [choosing, setChoosing] = useState(false);
  /**
   * Previews fetched while this view is open, by result. Going back from a section to
   * the route it belongs to shows what was fetched before instead of asking again.
   * They live only as long as the view does. The server holds every one of them for
   * the same quarter of an hour, up to a bound on memory far above what a person steps
   * through; if it has let one go all the same, "Add" fetches it again and says so.
   */
  const [fetched, setFetched] = useState<Record<string, RoutePreview>>({});

  const declared = sources.data?.sources ?? [];
  const centre = engine?.getCenter() ?? null;
  // The server the person chose; failing that, the one for this part of the map.
  const source: RouteSourceDto | null =
    declared.find((item) => item.id === storedSource) ?? pickRouteSource(declared, sources.data?.defaultId ?? null, centre);
  const scope: SearchScope = chosenScope ?? (view && viewSearchable(view) ? "view" : "anywhere");
  const blocker = searchBlocker(text, scope, view);
  const opened = trail.at(-1) ?? null;

  useEffect(() => {
    if (!engine) return;
    setView(engine.getBounds());
    return engine.on("moveend", () => setView(engine.getBounds()));
  }, [engine]);

  useEffect(() => nameInput.current?.focus(), []);

  // Leaving the view takes the preview off the map and drops any question still in flight.
  const leave = useRef({ search: search.cancel, preview: preview.cancel, onPreview });
  leave.current = { search: search.cancel, preview: preview.cancel, onPreview };
  useEffect(
    () => () => {
      leave.current.search();
      leave.current.preview();
      leave.current.onPreview(null);
    },
    [],
  );

  const shown: RoutePreview | undefined = opened ? fetched[opened.key] : undefined;
  useEffect(() => {
    leave.current.onPreview(shown && shown.lines.length > 0 ? previewTrack(shown, withAlternatives) : null);
  }, [shown, withAlternatives]);

  const runSearch = (event?: FormEvent) => {
    event?.preventDefault();
    if (!source || blocker) return;
    const wanted = text.trim();
    setAsked({ text: wanted, scope });
    search.mutate({
      sourceId: source.id,
      ...(wanted ? { text: wanted } : {}),
      // Five decimal places is a metre: more would say nothing more about the view.
      ...(scope === "view" && view ? { bbox: view.map((edge) => Math.round(edge * 1e5) / 1e5) as Bbox } : {}),
    });
  };

  const open = (result: RouteSearchResult, from: RouteSearchResult[], options: { afresh?: boolean } = {}) => {
    if (!source) return;
    setTrail([...from, result]);
    setWithAlternatives(false);
    add.reset();
    const show = (data: RoutePreview) => {
      engine?.fitBounds(data.bounds);
      if (data.lines.length > 0) onNeedMap();
    };
    const already = options.afresh ? undefined : fetched[result.key];
    // A preview is held by the server for a quarter of an hour; an older one is fetched afresh.
    if (already && already.expiresAt > Date.now() + 60_000) return show(already);
    preview.mutate(
      { sourceId: source.id, ref: result.ref },
      {
        onSuccess: (data) => {
          setFetched((current) => ({ ...current, [result.key]: data }));
          show(data);
        },
      },
    );
  };

  const back = () => {
    preview.cancel();
    add.reset();
    setTrail(trail.slice(0, -1));
  };

  const header = (label: string, onBack: () => void) => (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft /> {label}
      </Button>
    </div>
  );

  // ── One route, previewed ──

  if (opened && source) {
    const ends = shown ? shown.lines.flatMap((line) => [line[0]!, line.at(-1)!]).map(([lon, lat]) => ({ lat, lon })) : [];
    const cover = terrainCover(ends, terrain);
    const note = shown ? continuityNote(shown) : null;
    const asOf = dayOf(shown?.dataAsOf ?? null);
    return (
      // Keyed, so the results list's scroll position is not carried into the route's own view.
      <div key="route" className="flex min-h-0 flex-1 flex-col">
        {header(trail.length > 1 ? trail.at(-2)!.name : "Results", back)}
        <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="font-title text-lead text-ink">{shown?.name ?? opened.name}</h3>
            <p className="text-small text-ink-muted">
              {kindLabel(shown?.kind ?? opened.kind)}
              {(shown?.otherNames ?? opened.otherNames).length > 0 ? `, also ${(shown?.otherNames ?? opened.otherNames).join(", ")}` : ""}
            </p>
          </div>

          {shown ? null : preview.isPending ? (
            <div className="grid gap-3" aria-busy>
              <p className="flex items-center gap-2.5 text-small text-ink-muted" role="status">
                <Spinner label="Fetching" /> Fetching the route from {source.host}
              </p>
              <Skeleton className="h-28" />
              <Button className="justify-self-start" onClick={back}>
                Cancel
              </Button>
            </div>
          ) : preview.isError ? (
            <Failure error={preview.error} onRetry={() => open(opened, trail.slice(0, -1))} />
          ) : null}
          {shown ? (
            <>
              {shown.lines.length > 0 ? (
                <>
                  <dl>
                    <Fact label="Distance">{formatDistanceWithMiles(shown.lengthMeters)}</Fact>
                    <Fact label="Line">{continuity(shown)}</Fact>
                    <Fact label="Made of">
                      {plural(shown.wayCount, "way")}, {plural(shown.pointCount, "point")}
                    </Fact>
                    <Fact label="Source">
                      {shown.credit.url ? (
                        <a href={shown.credit.url} target="_blank" rel="noopener noreferrer" className={link}>
                          {elementLabel(shown.credit)}
                        </a>
                      ) : (
                        elementLabel(shown.credit)
                      )}
                      {asOf ? <span className="block text-ink-muted">as the map was on {asOf}</span> : null}
                    </Fact>
                  </dl>

                  {shown.alternatives.lines.length > 0 ? (
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={alternativesId}
                        checked={withAlternatives}
                        onCheckedChange={(checked) => setWithAlternatives(checked === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor={alternativesId} className="text-small text-ink">
                        Also add {shown.alternatives.lines.length === 1 ? "its alternative leg" : "its alternative legs"}
                        <span className="tabular block text-ink-muted">
                          {plural(shown.alternatives.lines.length, "line")} marked as an alternative or an excursion,{" "}
                          {formatDistance(shown.alternatives.lengthMeters)} more
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {add.isError ? <Failure error={add.error} /> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      loading={add.isPending}
                      onClick={() =>
                        add.mutate(
                          { token: shown.token, includeAlternatives: withAlternatives },
                          {
                            onError: (error) => {
                              // The server no longer holds the preview: a quarter of an hour passed, it made room for
                              // newer ones, it was restarted, or the route made from it has been removed. Fetch it again.
                              if (!(error instanceof ApiError) || error.code !== "conflict") return;
                              setFetched(({ [opened.key]: _expired, ...rest }) => rest);
                              open(opened, trail.slice(0, -1), { afresh: true });
                              toast(
                                "Outpost was no longer holding that preview, so the route is being fetched again. Add it once it is back.",
                              );
                            },
                            onSuccess: ({ track, elevation }) => {
                              toast.success(
                                elevation === "none"
                                  ? `Added “${track.name}” to your routes, without heights.`
                                  : `Added “${track.name}” to your routes.`,
                              );
                              onAdded(track);
                            },
                          },
                        )
                      }
                    >
                      <Plus /> Add to my routes
                    </Button>
                    <Button onClick={() => engine?.fitBounds(shown.bounds)} disabled={!engine}>
                      <Scan /> Fit to view
                    </Button>
                  </div>

                  {note ? <p className="text-small text-ink-muted">{note}</p> : null}
                  {shown.skipped.points > 0 || shown.skipped.unusableWays > 0 ? (
                    <p className="text-small text-ink-muted">
                      Left out because the source sent nothing usable for them:{" "}
                      {[
                        shown.skipped.unusableWays > 0 ? plural(shown.skipped.unusableWays, "way") : "",
                        shown.skipped.points > 0 ? plural(shown.skipped.points, "point") : "",
                      ]
                        .filter(Boolean)
                        .join(" and ")}
                      .
                    </p>
                  ) : null}
                  {isStale(shown.dataAsOf) ? (
                    <Notice tone="warning" icon={<CircleAlert />}>
                      {source.host} is answering from a copy of OpenStreetMap made on {asOf}. Changes to the map since then are not in it.
                    </Notice>
                  ) : null}

                  <p className="text-small text-ink-muted">
                    {cover === "all"
                      ? "Heights will be read from the terrain installed here, for the ascent and an elevation profile."
                      : cover === "some"
                        ? "Terrain is installed for only part of this route, so its ascent and elevation profile will cover that part only."
                        : "No terrain is installed where this route runs, so it will have no ascent or elevation profile. They can be filled in later, once terrain is installed."}
                  </p>
                  <p className="text-small text-ink-muted">
                    OpenStreetMap is made by volunteers and can be wrong or out of date. Check a route against the ground and a proper map
                    before relying on it.
                  </p>
                </>
              ) : null}

              {shown.sections.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-small text-ink">
                    {shown.lines.length > 0
                      ? `OpenStreetMap also keeps ${plural(shown.sections.length, "section")} inside this route. Each can be looked at and added by itself.`
                      : `OpenStreetMap keeps this route as ${plural(shown.sections.length, "section")}, not as one line. Choose a section to look at; each is added by itself.`}
                  </p>
                  <ul className="-mx-4 divide-y divide-border border-y border-border">
                    {shown.sections.map((section) => (
                      <ResultRow key={section.key} result={section} centre={null} onOpen={() => open(section, trail)} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // ── The search ──

  const results = search.data?.results ?? [];
  const answeredBy = declared.find((item) => item.id === search.data?.source.id);
  const searchedDay = dayOf(search.data?.dataAsOf ?? null);
  return (
    <div key="search" className="flex min-h-0 flex-1 flex-col">
      {header("Routes", onClose)}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 px-4 py-4">
          <h3 className="font-title text-lead text-ink">Find a route</h3>

          {sources.isPending ? (
            <div className="grid gap-3" aria-busy>
              <Skeleton className="h-9" />
              <Skeleton className="h-16" />
            </div>
          ) : sources.isError ? (
            <ErrorState error={sources.error} onRetry={() => sources.refetch()} />
          ) : !source ? (
            <Notice tone="warning" icon={<CircleAlert />} title="Nowhere to search">
              No route source is declared for this Outpost. One can be added in the data directory, in catalog/routes/route-sources.json.
              You can still draw a route or import a GPX file.
            </Notice>
          ) : (
            <form className="grid gap-3" onSubmit={runSearch}>
              <Field
                label="Name of the route" optional
                hint="A waymarked walk, a cycle route or a named path, such as Llanberis Path. Leave it empty to list the routes in the map view."
              >
                {(ids) => (
                  <div className="flex gap-2">
                    <Input
                      {...ids}
                      ref={nameInput}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      maxLength={80}
                      autoComplete="off"
                      spellCheck={false}
                      enterKeyHint="search"
                      className="min-w-0 flex-1"
                    />
                    <Button type="submit" variant="primary" disabled={Boolean(blocker) || search.isPending} aria-describedby={noteId}>
                      <Search /> Search
                    </Button>
                  </div>
                )}
              </Field>

              <Segmented<SearchScope>
                label="Where to look"
                value={scope}
                onChange={setChosenScope}
                options={[
                  { value: "view", label: "This map view" },
                  { value: "anywhere", label: "Anywhere" },
                ]}
                className="justify-self-start"
              />

              {blocker ? (
                <p className="text-small text-ink" role="status">
                  {blocker}
                </p>
              ) : null}

              <p id={noteId} className="text-small text-ink-muted">
                Search sends {scope === "view" ? "this name and the edges of the map view" : "this name"} to{" "}
                <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">{source.host}</span> ({source.operator}),
                which answers from {source.data.name}. {source.bbox ? `It knows: ${source.coverage}. ` : ""}
                {sources.data?.clientName ? (
                  <>
                    With it goes the name the server's operator asks programs to give,{" "}
                    <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">{sources.data.clientName}</span>: the
                    same for every copy of Outpost, and nothing about you or this installation.{" "}
                  </>
                ) : null}
                It needs the internet. A route you add is kept here and works offline.{" "}
                <a href={source.termsUrl} target="_blank" rel="noopener noreferrer" className={link}>
                  The server's terms
                </a>
                {declared.length > 1 && !choosing ? (
                  <>
                    {" · "}
                    <button type="button" className={link} onClick={() => setChoosing(true)}>
                      Change server
                    </button>
                  </>
                ) : null}
              </p>

              {declared.length > 1 && choosing ? (
                <Field label="Server to ask">
                  {(ids) => (
                    <Select
                      {...ids}
                      value={source.id}
                      onChange={setStoredSource}
                      options={declared.map((item) => ({
                        value: item.id,
                        label: item.name,
                        description: `${item.coverage}. ${item.host}`,
                      }))}
                    />
                  )}
                </Field>
              ) : null}
            </form>
          )}
        </div>

        {search.isPending && source ? (
          <div className="grid gap-3 border-t border-border px-4 py-4" aria-busy>
            <p className="flex items-center gap-2.5 text-small text-ink-muted" role="status">
              <Spinner label="Searching" /> Asking {source.host}. This can take half a minute.
            </p>
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Button className="justify-self-start" onClick={search.cancel}>
              Cancel
            </Button>
          </div>
        ) : search.isError ? (
          <div className="border-t border-border px-4 py-4">
            <Failure
              error={search.error}
              onRetry={blocker ? undefined : () => runSearch()}
              onChangeServer={declared.length > 1 && !choosing ? () => setChoosing(true) : undefined}
            />
          </div>
        ) : search.data && asked ? (
          results.length === 0 ? (
            <div className="grid gap-2 border-t border-border px-4 py-4">
              <p className="text-small text-ink">
                {asked.text
                  ? `Nothing called “${asked.text}” was found ${asked.scope === "view" ? "in this map view" : `by ${search.data.source.host}`}.`
                  : "No walking or cycling routes are mapped in this view."}
              </p>
              <p className="text-small text-ink-muted">
                {answeredBy?.bbox ? `${answeredBy.host} knows: ${answeredBy.coverage}. ` : ""}
                {asked.scope === "view"
                  ? "Names are matched as OpenStreetMap writes them, so part of the name often does better than all of it. The path may also lie outside the view."
                  : "Searching anywhere finds routes only. A path that nobody has mapped as a route is found by moving the map to it and searching the view."}
              </p>
              {asked.scope === "view" && asked.text ? (
                <Button
                  className="justify-self-start"
                  onClick={() => {
                    setChosenScope("anywhere");
                    setAsked({ text: asked.text, scope: "anywhere" });
                    search.mutate({ sourceId: search.data.source.id, text: asked.text });
                  }}
                >
                  Search anywhere for it
                </Button>
              ) : null}
              {declared.length > 1 && !choosing ? (
                <Button className="justify-self-start" onClick={() => setChoosing(true)}>
                  Ask another server
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <p className="tabular border-t border-border px-4 pt-3 pb-2 text-micro text-ink-muted">
                {plural(results.length, "result")}
                {search.data.truncated ? ", and more that are not listed: add more of the name, or zoom in" : ""}
                {searchedDay ? `. OpenStreetMap as it was on ${searchedDay}` : ""}
              </p>
              {isStale(search.data.dataAsOf) ? (
                <div className="px-4 pb-3">
                  <Notice tone="warning" icon={<CircleAlert />}>
                    {search.data.source.host} is answering from a copy of OpenStreetMap made on {searchedDay}. Changes to the map since then
                    are not in it.
                  </Notice>
                </div>
              ) : null}
              <ul className="divide-y divide-border border-y border-border">
                {results.map((result) => (
                  <ResultRow key={result.key} result={result} centre={centre} onOpen={() => open(result, [])} />
                ))}
              </ul>
              <p className="px-4 py-3 text-small text-ink-muted">
                {search.data.includedPaths
                  ? "Routes first, then paths that only share a name. Choose one to see it on the map."
                  : "Choose one to see it on the map. Nothing is saved until you add it."}
              </p>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
