/**
 * "Add a place": the one way offline map data is added, from everywhere that offers it.
 *
 * Step 1, "Where?": a country, a part of one or a town typed in ("Chamonix is in France:
 * Rhône-Alpes (smaller) or all of France"), a country tapped on a small map of the world, or a
 * suggestion: where the map is now, home, the whole world, an area drawn on the map, a file.
 * Nothing is chosen for the person: Outpost is used anywhere.
 *
 * Step 2, "What for France?": Map (the map, its hills and its place names), Routes and Nearby
 * places, ticked; More choices for the detail, the hills, where it is kept and the source file.
 * The first time Routes or Nearby places are added, the source file is a two-line choice, then
 * remembered. One button changes as it goes: "Check size" (which asks the map sources and, the
 * first time, reads Geofabrik's list of regions) and then "Download · 4.1 GB".
 *
 * Arriving with countries (/maps/data?add=1&countries=FR,CH, from a route that needs them) opens
 * at step 2 with Routes ticked for each.
 */
import {
  type Bbox,
  formatBytes,
  type MapDataAddRequest,
  type MapDataBundleKind,
  type MapDataPlace,
  type MapDataResponse,
  type MapDataWhereResponse,
  type MapDataWhereResult,
  type MapRegionPresetStatus,
  type OsNamesCheck,
  type ReferenceEstimate,
  type ReferenceRegionDto,
  type ReferenceRegionsResponse,
} from "@outpost/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, CircleAlert, FileUp, Globe, House, LocateFixed, Search, SquareDashedMousePointer } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Disclosure, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Progress, Segmented, Spinner } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { estimateRegion, type RegionEstimate, useMapRegions, useStartPlaces } from "../data";
import { detailChoices, detailLabel } from "../lib/detail";
import { countTiles } from "../lib/geo";
import { fold } from "../lib/search";
import { isCameraView, readStored, STORAGE_KEYS } from "../lib/view";
import { DestinationPicker, useDestination } from "../panels/destination";
import { suggestedFileLocation } from "./country-file-choice";
import { touchSize } from "./pattern";
import { mapDataKeys, useAddMapData } from "./use-map-data";
import { BUNDLE_DETAILS, BUNDLE_NAMES, keptFileFor, namesText, placesIn } from "./words";
import { WorldPick } from "./world-pick";

/** A road network kept is 1 to 2% of the source file it is read from (30 MB of Great Britain's 2.2 GB). */
const ROADS_SHARE = 0.02;
/** The server refuses a map of more tiles than this. */
const MAX_TILES = 20_000_000;

/** A place chosen in step 1. */
export interface Chosen {
  type: "country" | "area" | "world";
  /** Two letters, for a country or a part of one. */
  code: string | null;
  /** "France", "Rhône-Alpes", "Chamonix valley", "The whole world". */
  name: string;
  /** For a part: its country's name. */
  countryName: string | null;
  /** Geofabrik's region for the whole country, where its list has been read. */
  regionId: string | null;
  /** A part of the country, chosen instead of all of it: routes and nearby places for it only. */
  part: { regionId: string; name: string } | null;
  bbox: Bbox | null;
}

/** What a link or a row asked for. */
export interface AddStart {
  /** One country, two letters. */
  country?: string | null;
  /** Several countries (?countries=FR,CH, from a route that needs them). */
  countries?: string[];
  /** What to tick: the bundles, or the older kinds (?kinds=roads). */
  bundles?: MapDataBundleKind[];
  /** An area drawn on the map (?bbox=w,s,e,n&name=…). */
  area?: { name: string; bbox: Bbox };
  /** The whole world's basics. */
  world?: boolean;
}

/** The older kinds a link may still give, as the bundles they are part of. */
export function bundlesOfKinds(kinds: string[]): MapDataBundleKind[] {
  const out = new Set<MapDataBundleKind>();
  for (const kind of kinds) {
    if (kind === "map" || kind === "terrain" || kind === "names") out.add("map");
    if (kind === "roads") out.add("routes");
    if (kind === "places") out.add("nearby");
    if (kind === "streets") out.add("walk");
  }
  return [...out];
}

type Choosable = "map" | "routes" | "nearby";

/** A where-result as a place to add for. */
function chosenOf(result: MapDataWhereResult, part: boolean): Chosen {
  return {
    type: "country",
    code: result.country,
    name: part && result.part ? result.part.name : result.countryName,
    countryName: part && result.part ? result.countryName : null,
    regionId: result.regionId,
    part: part ? result.part : null,
    bbox: result.bbox,
  };
}

const WORLD: Chosen = {
  type: "world",
  code: null,
  name: "The whole world",
  countryName: null,
  regionId: null,
  part: null,
  bbox: [-180, -85, 180, 85],
};

/** The ready-made map of a country (`country-fr`), or of anything of the same name. */
export function presetFor(place: Chosen, presets: MapRegionPresetStatus[]): MapRegionPresetStatus | null {
  if (place.type === "world") return presets.find((preset) => preset.id === "world") ?? null;
  if (place.type === "area") return null;
  const code = place.code?.toLowerCase();
  const name = fold(place.countryName ?? place.name);
  return presets.find((preset) => preset.id === `country-${code}`) ?? presets.find((preset) => fold(preset.name) === name) ?? null;
}

/** The deepest detail a box can have and stay a sensible download. */
export function defaultZoom(bbox: Bbox, preset: MapRegionPresetStatus | null): number {
  if (preset) return preset.recommendedMaxZoom;
  return [14, 12, 10, 8, 6].find((zoom) => countTiles(bbox, 0, zoom) <= 1_000_000) ?? 6;
}

function SuggestionButton({ icon, title, note, onChoose }: { icon: ReactNode; title: ReactNode; note?: ReactNode; onChoose: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-2 text-left text-small transition-colors duration-(--duration-fast) hover:bg-surface active:bg-surface-strong focus-visible:-outline-offset-2"
      >
        <span className="shrink-0 text-ink-muted [&_svg]:size-4">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{title}</span>
          {note ? <span className="block text-micro text-ink-muted">{note}</span> : null}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </button>
    </li>
  );
}

/** Asks the server, offline, where a text, a point or a list of countries is. */
async function whereIs(query: string): Promise<MapDataWhereResponse> {
  return api.get<MapDataWhereResponse>(`/api/maps/data/where?${query}`);
}

function useTyped(text: string) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(text), 150);
    return () => window.clearTimeout(timer);
  }, [text]);
  return settled;
}

/** Step 1: Where? */
function Where({
  data,
  onChoose,
  onDraw,
  onImport,
  heading,
}: {
  data: MapDataResponse;
  onChoose: (places: Chosen[]) => void;
  onDraw: () => void;
  onImport: () => void;
  heading: React.RefObject<HTMLHeadingElement | null>;
}) {
  const home = useHomeCountry();
  const [text, setText] = useState("");
  const typed = useTyped(text.trim());
  const fieldId = useId();
  const found = useQuery({
    queryKey: [...mapDataKeys.all, "where", typed],
    queryFn: () => whereIs(`q=${encodeURIComponent(typed)}`),
    enabled: typed.length >= 2,
    placeholderData: keepPreviousData,
  });
  // Where the map was last left, in this browser: the first suggestion.
  const view = useMemo(() => readStored(STORAGE_KEYS.view, isCameraView, null), []);
  const here = useQuery({
    queryKey: [...mapDataKeys.all, "where", "view", view?.lat, view?.lon],
    queryFn: () => whereIs(`lat=${view!.lat.toFixed(4)}&lon=${view!.lon.toFixed(4)}`),
    enabled: view !== null && (view?.zoom ?? 0) >= 3,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [picking, setPicking] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);
  const pick = async (point: { lat: number; lon: number }) => {
    setPicking(true);
    setPickFailed(false);
    try {
      const answer = await whereIs(`lat=${point.lat.toFixed(4)}&lon=${point.lon.toFixed(4)}`);
      const first = answer.results[0];
      if (first) onChoose([chosenOf(first, false)]);
      else setPickFailed(true);
    } finally {
      setPicking(false);
    }
  };
  const nowAt = here.data?.results[0] ?? null;
  const world = placesIn(data).find((place) => place.type === "world");
  const results = typed.length >= 2 ? (found.data?.results ?? []) : [];

  return (
    <div className="grid gap-5">
      <h3 ref={heading} tabIndex={-1} className="font-title text-lead text-ink focus:outline-none">
        Where?
      </h3>
      <div className="grid gap-1.5">
        <label htmlFor={fieldId} className="text-small font-medium text-ink">
          Country, region or town
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            id={fieldId}
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="pl-8"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="France, Bavaria, Chamonix"
          />
          {found.isFetching ? <Spinner delay className="absolute top-1/2 right-2.5 -translate-y-1/2" label="Looking" /> : null}
        </div>
        <p className="text-micro text-ink-muted">Found on this device: nothing is looked up elsewhere.</p>
      </div>

      {typed.length >= 2 ? (
        results.length === 0 && !found.isFetching ? (
          <p className="text-small text-ink-muted">
            Nothing is called that. Try a country's name in English, or tap it on the map.
            {found.data && !found.data.regionsListed ? " Regions are found once Geofabrik's list is read, at the first Check size." : ""}
          </p>
        ) : (
          <ul aria-label="Places found" className="-mx-2 grid gap-0.5">
            {results.map((result) =>
              result.type === "town" ? (
                <li key={`town-${result.name}-${result.lat}`} className="grid gap-1 px-2 py-2">
                  <p className="text-small text-ink">
                    <span className="font-medium">{result.name}</span> is in {result.countryName}
                    {result.part ? `: ${result.part.name} (smaller) or all of ${result.countryName}` : ""}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.part ? (
                      <Button size="sm" className={touchSize} onClick={() => onChoose([chosenOf(result, true)])}>
                        {result.part.name}
                      </Button>
                    ) : null}
                    <Button size="sm" className={touchSize} onClick={() => onChoose([chosenOf(result, false)])}>
                      {result.part ? `All of ${result.countryName}` : result.countryName}
                    </Button>
                  </div>
                </li>
              ) : (
                <SuggestionButton
                  key={`${result.type}-${result.part?.regionId ?? result.country}`}
                  icon={<Globe />}
                  title={result.name}
                  note={result.type === "part" ? `Part of ${result.countryName}` : null}
                  onChoose={() => onChoose([chosenOf(result, result.type === "part")])}
                />
              ),
            )}
          </ul>
        )
      ) : null}

      <div className="grid gap-1.5">
        <p className="text-small text-ink-muted" id={`${fieldId}-map`}>
          Or tap a country.
        </p>
        <div className="relative">
          <WorldPick onPick={pick} className={cn(picking && "opacity-60")} />
          {picking ? <Spinner delay className="absolute top-2 right-2" label="Finding the country" /> : null}
        </div>
        {pickFailed ? <p className="text-small text-ink-muted">No country there. Tap on land.</p> : null}
      </div>

      <ul aria-label="Suggestions" className="-mx-2 grid gap-0.5 border-t border-border pt-3">
        {nowAt ? (
          <SuggestionButton
            icon={<LocateFixed />}
            title={`Where the map is now: ${nowAt.countryName}`}
            onChoose={() => onChoose([chosenOf(nowAt, false)])}
          />
        ) : null}
        {home ? (
          <SuggestionButton
            icon={<House />}
            title={`Home: ${home.name}`}
            onChoose={() =>
              void whereIs(`countries=${home.code}`).then((answer) => answer.results[0] && onChoose([chosenOf(answer.results[0], false)]))
            }
          />
        ) : null}
        {!world || world.bundles.some((bundle) => bundle.kind === "map" && bundle.state === "none") ? (
          <SuggestionButton
            icon={<Globe />}
            title="The whole world"
            note="Countries, cities and main roads everywhere, at less detail"
            onChoose={() => onChoose([WORLD])}
          />
        ) : null}
        <SuggestionButton
          icon={<SquareDashedMousePointer />}
          title="Draw an area on the map"
          note="A valley, an island, the way you are going"
          onChoose={onDraw}
        />
        <SuggestionButton icon={<FileUp />} title="Import a file" note="GeoJSON, KML, GPX or a CSV of places" onChoose={onImport} />
      </ul>
    </div>
  );
}

/** One tick of step 2. */
function Tick({
  name,
  detail,
  checked,
  onChange,
  trailing,
  disabled,
}: {
  name: string;
  detail: ReactNode;
  checked: boolean;
  onChange: (on: boolean) => void;
  trailing?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <li className="flex items-start gap-3 py-3">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next === true)} className="mt-0.5" />
      <label
        htmlFor={id}
        className={cn(
          "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span className="min-w-0">
          <span className={cn("block text-small font-medium", disabled ? "text-ink-muted" : "text-ink")}>{name}</span>
          <span className="block text-small text-ink-muted">{detail}</span>
        </span>
        {trailing ? <span className="tabular shrink-0 text-small text-ink-muted">{trailing}</span> : null}
      </label>
    </li>
  );
}

/** What Check size found. */
interface Sizes {
  /** By place key. */
  map: Record<string, RegionEstimate>;
  /** Source files by region: bytes, or null where one is kept and nothing is downloaded. */
  file: Record<string, number | null>;
  names: OsNamesCheck | null;
  hosts: string[];
  /** Geofabrik's list, read on the press where it was not held. */
  regions: ReferenceRegionDto[];
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const placeKey = (place: Chosen) =>
  place.type === "area" ? `area:${place.bbox?.join(",")}` : `${place.type}:${place.code ?? ""}:${place.part?.regionId ?? ""}`;

/** The dialog: a sheet from the foot of a phone. */
export function AddMapData({
  open,
  onOpenChange,
  data,
  start,
  onAdded,
  onImport,
  onOtherSources,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MapDataResponse;
  start: AddStart | null;
  onAdded?: (place: Chosen) => void;
  onImport: () => void;
  /** Nearby places from other sources (Natural Earth, airports, national lists): the layers' own choices. */
  onOtherSources: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add a place" size="lg" className="max-md:h-[calc(100dvh-2rem)]">
        {open ? (
          <Flow
            data={data}
            start={start}
            onClose={() => onOpenChange(false)}
            onAdded={onAdded}
            onImport={() => {
              onOpenChange(false);
              onImport();
            }}
            onOtherSources={onOtherSources}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Flow({
  data,
  start,
  onClose,
  onAdded,
  onImport,
  onOtherSources,
}: {
  data: MapDataResponse;
  start: AddStart | null;
  onClose: () => void;
  onAdded?: ((place: Chosen) => void) | undefined;
  onImport: () => void;
  onOtherSources: () => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const presets = useMapRegions(true);
  const add = useAddMapData();
  const startPlaces = useStartPlaces();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<"where" | "what">("where");
  const [places, setPlaces] = useState<Chosen[]>([]);
  const [ticks, setTicks] = useState<Set<Choosable>>(new Set());
  const [hills, setHills] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null);
  const [keep, setKeep] = useState<boolean | undefined>(data.countryFileChoice.keep ?? undefined);
  const firstTime = data.countryFileChoice.keep === null;
  /** Parts left out, by country: none left out means the whole country's one file. */
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  const [sizes, setSizes] = useState<{ key: string; sizes: Sizes } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const regionsHeld = useQuery({
    queryKey: ["layers", "regions", ""],
    queryFn: () => api.get<ReferenceRegionsResponse>("/api/reference/regions"),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const allPresets = useMemo(() => (presets.data?.groups ?? []).flatMap((group) => group.regions), [presets.data]);
  const known = placesIn(data);

  function choose(next: Chosen[], asked?: MapDataBundleKind[]) {
    setPlaces(next);
    const held = (bundle: MapDataBundleKind) =>
      next.every((place) => {
        const have =
          known.find((each) => place.code && each.key === `country:${place.code}`) ??
          (place.type === "world" ? known.find((each) => each.type === "world") : undefined);
        return have?.bundles.some((each) => each.kind === bundle && each.state !== "none") ?? false;
      });
    const wanted: Choosable[] = asked
      ? (asked.filter((each) => each === "map" || each === "routes" || each === "nearby") as Choosable[])
      : next[0]?.type === "country"
        ? (["map", "routes"] as const).filter((each) => !held(each))
        : ["map"];
    setTicks(new Set(wanted.length > 0 ? wanted : next[0]?.type === "country" ? ["routes"] : ["map"]));
    setZoom(null);
    setLeftOut(new Set());
    setSizes(null);
    setCheckError(null);
    setStep("what");
  }

  // Arriving with a place: straight to what to add for it.
  const [applied, setApplied] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the place is known
  useEffect(() => {
    if (applied || !start) return;
    const codes = start.countries?.length ? start.countries : start.country ? [start.country] : [];
    setApplied(true);
    if (start.world) return choose([WORLD], start.bundles);
    if (start.area)
      return choose(
        [{ type: "area", code: null, name: start.area.name, countryName: null, regionId: null, part: null, bbox: start.area.bbox }],
        ["map"],
      );
    if (codes.length === 0) return;
    void whereIs(`countries=${codes.join(",")}`).then((answer) => {
      if (answer.results.length === 0) return;
      // Several countries came from a route that needs them: their routes are what is asked for.
      choose(
        answer.results.map((result) => chosenOf(result, false)),
        start.bundles ?? (codes.length > 1 ? ["routes"] : undefined),
      );
    });
  }, [start]);

  // Each step's heading has the keyboard, so the step is read from its start (WCAG 2.4.3).
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each step
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const countries = places.filter((place) => place.type === "country");
  const fromFile = ticks.has("routes") || ticks.has("nearby");
  const regionList = sizes?.sizes.regions.length ? sizes.sizes.regions : regionsHeld.data?.held ? regionsHeld.data.regions : [];
  const wholeRegion = (place: Chosen) =>
    place.regionId ?? regionList.find((region) => region.depth === 0 && region.country === place.code)?.id ?? null;
  const partsOf = (place: Chosen) => {
    const whole = wholeRegion(place);
    return place.part || !whole ? [] : regionList.filter((region) => region.parent === whole && region.depth === 1);
  };
  /** The source files to read for a place: a part, all its parts' one whole file, or the parts left ticked. */
  const filesOf = (place: Chosen): string[] => {
    if (place.part) return [place.part.regionId];
    const whole = wholeRegion(place);
    const parts = partsOf(place);
    const ticked = parts.filter((part) => !leftOut.has(part.id));
    if (parts.length > 0 && ticked.length < parts.length) return ticked.map((part) => part.id);
    return whole ? [whole] : [];
  };
  const keptFor = (regionId: string) => keptFileFor(data, regionId);

  const presetOf = (place: Chosen) => presetFor(place, allPresets);
  const boxOf = (place: Chosen) => presetOf(place)?.bbox ?? place.bbox;
  const zoomOf = (place: Chosen) => zoom ?? (boxOf(place) ? defaultZoom(boxOf(place)!, presetOf(place)) : 10);
  const wantsOsNames = ticks.has("map") && countries.some((place) => place.code === "GB");

  const signature = JSON.stringify({
    places: places.map(placeKey),
    ticks: [...ticks].sort(),
    hills,
    zoom,
    leftOut: [...leftOut].sort(),
  });
  const found = sizes?.key === signature ? sizes.sizes : null;

  const checkSize = async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const hosts: string[] = [];
      let regions = regionsHeld.data?.held ? regionsHeld.data.regions : [];
      // Geofabrik's list is read on this press the first time: the press is the person's.
      if (fromFile && countries.length > 0 && regions.length === 0) {
        const list = await api.post<ReferenceRegionsResponse>("/api/reference/regions", {});
        hosts.push(hostOf(list.source));
        regions = list.regions;
        void client.invalidateQueries({ queryKey: ["layers", "regions"] });
        void client.invalidateQueries({ queryKey: mapDataKeys.all });
      }
      const result: Sizes = { map: {}, file: {}, names: null, hosts, regions };
      if (fromFile) {
        const ids: string[] = [];
        for (const place of countries) {
          const whole = place.regionId ?? regions.find((region) => region.depth === 0 && region.country === place.code)?.id ?? null;
          const resolved = { ...place, regionId: whole };
          const parts = place.part || !whole ? [] : regions.filter((region) => region.parent === whole && region.depth === 1);
          const ticked = parts.filter((part) => !leftOut.has(part.id));
          const files = place.part
            ? [place.part.regionId]
            : parts.length > 0 && ticked.length < parts.length
              ? ticked.map((p) => p.id)
              : whole
                ? [whole]
                : [];
          if (files.length === 0)
            throw new Error(`Geofabrik has no file for ${resolved.name}. Draw an area instead, or choose one of its parts.`);
          for (const id of files) {
            if (keptFor(id)) result.file[id] = null;
            else ids.push(id);
          }
        }
        if (ids.length > 0) {
          const estimate = await api.post<ReferenceEstimate>("/api/reference/estimate", {
            provider: "osm-extract",
            scope: { regions: ids },
          });
          estimate.items.forEach((item, index) => {
            if (item.host) hosts.push(item.host);
            result.file[ids[index] ?? item.key] = item.bytes || null;
          });
        }
      }
      if (ticks.has("map")) {
        for (const place of places) {
          const box = boxOf(place);
          if (!box) continue;
          const zoomHere = zoomOf(place);
          if (countTiles(box, 0, zoomHere) > MAX_TILES)
            throw new Error(`${place.name} is too large at this detail. Choose less detail under More choices.`);
          const estimate = await estimateRegion({ bbox: box, maxZoom: zoomHere, includeTerrain: hills });
          hosts.push(hostOf(estimate.map.sourceUrl));
          if (estimate.terrain) hosts.push(hostOf(estimate.terrain.sourceUrl));
          result.map[placeKey(place)] = estimate;
        }
        if (wantsOsNames) {
          try {
            result.names = await api.post<OsNamesCheck>("/api/maps/places/os-names/check", {});
            hosts.push(result.names.host);
          } catch {
            // OS out of reach: GeoNames' list for the country is downloaded instead, its size said when it starts.
            result.names = null;
          }
        }
      }
      setSizes({ key: signature, sizes: { ...result, hosts: [...new Set(hosts)] } });
    } catch (error) {
      setCheckError(error);
    } finally {
      setChecking(false);
    }
  };

  const fileBytes = found ? Object.values(found.file).reduce<number>((sum, bytes) => sum + (bytes ?? 0), 0) : 0;
  const mapBytes = found ? Object.values(found.map).reduce((sum, estimate) => sum + estimate.totalBytes, 0) : 0;
  const namesBytes = found?.names && !found.names.installed ? found.names.sizeBytes : 0;
  const total = fileBytes + mapBytes + namesBytes;
  const allKept = fromFile && found !== null && Object.values(found.file).every((bytes) => bytes === null);

  const mapDestination = useDestination(found ? mapBytes + namesBytes : null, "maps");
  const fileDestination = useDestination(found && fileBytes > 0 ? fileBytes : null);
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    if (suggested || fileDestination.locations.length === 0) return;
    setSuggested(true);
    const id = suggestedFileLocation(fileDestination.locations, data.countryFileChoice.locationId);
    if (id) fileDestination.choose(id);
  }, [suggested, fileDestination, data.countryFileChoice.locationId]);

  const askFile = fromFile && countries.length > 0 && !allKept;
  const problems = [
    ticks.size === 0 ? "Choose what to add." : null,
    askFile && keep === undefined ? "Choose what happens to the source file." : null,
    askFile && keep && fileBytes > 0 && !fileDestination.locationId ? "Choose where to keep the source file." : null,
    ticks.has("map") && found && !mapDestination.locationId ? "Choose where to keep the map." : null,
  ].filter((each): each is string => each !== null);

  const download = async () => {
    if (!found || problems.length > 0) return;
    setSending(true);
    try {
      for (const place of places) {
        const requests: MapDataAddRequest[] = [];
        if (place.type === "country" && fromFile) {
          for (const regionId of filesOf({ ...place, regionId: wholeRegion(place) })) {
            const kept = keptFor(regionId);
            requests.push({
              regionId,
              kinds: [...(ticks.has("routes") ? (["roads"] as const) : []), ...(ticks.has("nearby") ? (["places"] as const) : [])],
              keep: kept ? true : (keep ?? false),
              ...(kept
                ? { locationId: kept.locationId ?? undefined }
                : keep && fileDestination.locationId
                  ? { locationId: fileDestination.locationId }
                  : {}),
            });
          }
        }
        const box = boxOf(place);
        if (ticks.has("map") && box) {
          const preset = presetOf(place);
          const name = place.type === "country" ? (place.countryName ?? place.name) : (preset?.name ?? place.name);
          requests.push({
            kinds: ["map", ...(hills ? (["terrain"] as const) : []), ...(place.code ? (["names"] as const) : [])],
            map: {
              name,
              regionId: preset?.id ?? (place.code ? `country-${place.code.toLowerCase()}` : undefined),
              bbox: box,
              maxZoom: zoomOf(place),
            },
            ...(place.code ? { country: place.code } : {}),
            ...(mapDestination.locationId ? { locationId: mapDestination.locationId } : {}),
          });
        }
        for (const request of requests) await add.mutateAsync(request);
        // The world's towns, to find any town by name: with the world's map.
        if (place.type === "world" && ticks.has("map"))
          await startPlaces.mutateAsync({
            dataset: "cities500",
            ...(mapDestination.locationId ? { locationId: mapDestination.locationId } : {}),
          });
      }
      mapDestination.remember();
      toast.success(`Adding ${namesText(places.map((place) => place.name))}. Progress is shown on Offline maps.`);
      onAdded?.(places[0]!);
      onClose();
    } catch (error) {
      setCheckError(error);
    } finally {
      setSending(false);
    }
  };

  if (step === "where") {
    return (
      <DialogBody className="grid content-start gap-6">
        <Where
          data={data}
          heading={heading}
          onChoose={(next) => choose(next)}
          onDraw={() => {
            onClose();
            navigate("/maps?offline=draw");
          }}
          onImport={onImport}
        />
      </DialogBody>
    );
  }

  const title = namesText(places.map((place) => place.name));
  const first = places[0];
  const sizeOf = (bundle: Choosable): ReactNode => {
    if (!found) return null;
    if (bundle === "map") return mapBytes > 0 ? formatBytes(mapBytes + namesBytes) : null;
    if (allKept) return "No download";
    if (bundle === "routes") return fileBytes > 0 ? `about ${formatBytes(fileBytes * ROADS_SHARE)} kept` : null;
    return ticks.has("routes") ? "Read from the same file" : null;
  };
  const offered: Choosable[] = first?.type === "country" ? ["map", "routes", "nearby"] : ["map"];
  const partsNote = countries.length === 1 && !countries[0]!.part ? partsOf(countries[0]!) : [];
  const wholeSize = found && countries.length === 1 ? found.file[wholeRegion(countries[0]!) ?? ""] : undefined;

  const fileChoice = (
    <div className="grid gap-2">
      <ChoiceList
        label="The source file"
        value={keep === undefined ? undefined : keep ? "keep" : "delete"}
        onChange={(next) => setKeep(next === "keep")}
        choices={[
          {
            value: "keep",
            title: `Keep the source file${fileBytes > 0 ? ` (${formatBytes(fileBytes)})` : ""}`,
            detail: "Rebuild routes and places later with no download",
          },
          {
            value: "delete",
            title: "Delete it after reading",
            detail: `${fileBytes > 0 ? `Saves ${formatBytes(fileBytes)}` : "Saves its room"}; updates download it again`,
          },
        ]}
      />
      {keep && fileBytes > 0 ? <DestinationPicker destination={fileDestination} label="Where to keep the source file" /> : null}
    </div>
  );

  return (
    <>
      <DialogBody className="grid content-start gap-5">
        <section className="grid gap-3" aria-labelledby="add-what">
          <div>
            <h3 id="add-what" ref={heading} tabIndex={-1} className="font-title text-lead text-ink focus:outline-none">
              What for {title}?
            </h3>
            {first?.countryName ? <p className="text-small text-ink-muted">Part of {first.countryName}</p> : null}
          </div>
          {first?.type === "area" ? (
            <Field label="Name" hint="How it is listed, such as “Chamonix valley”.">
              {(ids) => (
                <Input
                  {...ids}
                  value={first.name}
                  maxLength={120}
                  enterKeyHint="done"
                  onChange={(event) => setPlaces([{ ...first, name: event.target.value }])}
                />
              )}
            </Field>
          ) : null}
          <ul aria-label={`What to add for ${title}`} className="divide-y divide-border border-y border-border">
            {offered.map((bundle) => (
              <Tick
                key={bundle}
                name={BUNDLE_NAMES[bundle]}
                detail={
                  bundle === "map" && first?.type === "world"
                    ? "Countries, cities and main roads everywhere, and the world's towns by name"
                    : bundle === "map" && first?.countryName
                      ? `${BUNDLE_DETAILS.map}: all of ${first.countryName}`
                      : BUNDLE_DETAILS[bundle]
                }
                checked={ticks.has(bundle)}
                onChange={(on) =>
                  setTicks((current) => {
                    const next = new Set(current);
                    if (on) next.add(bundle);
                    else next.delete(bundle);
                    return next;
                  })
                }
                trailing={sizeOf(bundle)}
              />
            ))}
          </ul>
          {fromFile && partsNote.length > 0 ? (
            <div className="grid gap-1.5 text-small">
              <p className="text-ink">
                {countries[0]!.name} comes in {partsNote.length} parts
                {wholeSize ? `, ${formatBytes(wholeSize)} together` : ""}.{" "}
                {leftOut.size === 0 ? "All are ticked." : `${partsNote.length - leftOut.size} are ticked.`}
              </p>
              <Disclosure summary="Choose parts">
                <ul aria-label={`Parts of ${countries[0]!.name}`} className="grid gap-0.5">
                  {partsNote.map((part) => (
                    <PartTick
                      key={part.id}
                      name={part.name}
                      checked={!leftOut.has(part.id)}
                      onChange={(on) =>
                        setLeftOut((current) => {
                          const next = new Set(current);
                          if (on) next.delete(part.id);
                          else next.add(part.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </ul>
              </Disclosure>
            </div>
          ) : null}
        </section>

        {askFile && firstTime ? (
          <section className="grid gap-2" aria-labelledby="add-file">
            <h4 id="add-file" className="text-small font-semibold text-ink">
              The source file
            </h4>
            <p className="max-w-[60ch] text-small text-ink-muted">
              Routes and nearby places are read from the country's whole OpenStreetMap record.
            </p>
            {fileChoice}
          </section>
        ) : null}

        <Disclosure summary="More choices">
          <div className="grid gap-5">
            {ticks.has("map") && first ? (
              <div className="grid gap-2">
                <h4 className="text-small font-semibold text-ink">Detail</h4>
                <Segmented
                  label="Detail"
                  value={String(zoomOf(first))}
                  onChange={(value) => setZoom(Number(value))}
                  options={detailChoices(presetOf(first)?.recommendedMaxZoom).map((each) => ({
                    value: String(each),
                    label: detailLabel(each),
                  }))}
                />
                <label htmlFor="add-hills" className="mt-1 flex cursor-pointer items-start gap-3 text-small text-ink">
                  <Checkbox id="add-hills" checked={hills} onCheckedChange={(on) => setHills(on === true)} className="mt-0.5" />
                  <span>
                    Hills and heights
                    <span className="block text-ink-muted">Hill shading, contour lines and heights, with the map</span>
                  </span>
                </label>
              </div>
            ) : null}
            {ticks.has("map") ? (
              <div className="grid gap-2">
                <h4 className="text-small font-semibold text-ink">Where the map is kept</h4>
                <DestinationPicker destination={mapDestination} label="Where the map is kept" />
              </div>
            ) : null}
            {askFile && !firstTime ? (
              <div className="grid gap-2">
                <h4 className="text-small font-semibold text-ink">The source file</h4>
                {fileChoice}
              </div>
            ) : null}
            {ticks.has("nearby") || first?.type === "world" ? (
              <p className="text-small">
                <button type="button" onClick={onOtherSources} className="text-primary underline decoration-1 underline-offset-2">
                  Nearby places from other sources
                </button>
                <span className="text-ink-muted">: borders, airports, national lists</span>
              </p>
            ) : null}
          </div>
        </Disclosure>

        <div aria-live="polite" className="grid gap-2">
          {checking ? (
            <div role="status" className="grid gap-2">
              <Progress label="Checking the size" tone="lamp" />
              <p className="text-small text-ink-muted">Checking size. It needs a connection and takes a few seconds.</p>
            </div>
          ) : checkError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Failed">
              {errorMessage(checkError)} Try again.
            </Notice>
          ) : found ? (
            <p className="text-small text-ink">
              <span className="tabular font-semibold">
                {allKept && mapBytes === 0 ? "No download: read from the kept file" : `${formatBytes(total)} to download`}
              </span>
              {fromFile && !allKept && keep === false ? ", the source file deleted once read" : ""}.
              {found.hosts.length > 0 ? <span className="block text-ink-muted">Sizes from {namesText(found.hosts)}.</span> : null}
            </p>
          ) : (
            <p className="max-w-[60ch] text-small text-ink-muted">
              Asks the map sources how large it is. Nothing is downloaded yet.
              {fromFile && countries.length > 0 && !regionsHeld.data?.held
                ? " The first time, Geofabrik's list of regions is read too (download.geofabrik.de)."
                : ""}
            </p>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        {found && problems[0] ? <span className="mr-auto text-small text-ink-muted">{problems[0]}</span> : null}
        <Button onClick={() => setStep("where")}>
          <ArrowLeft /> Another place
        </Button>
        {found ? (
          <Button variant="primary" onClick={download} loading={sending} disabled={problems.length > 0}>
            {allKept && mapBytes === 0 ? "Build from the kept file" : `Download · ${formatBytes(total)}`}
          </Button>
        ) : (
          <Button variant="primary" onClick={checkSize} loading={checking} disabled={ticks.size === 0}>
            {checkError ? "Check size again" : "Check size"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function PartTick({ name, checked, onChange }: { name: string; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId();
  return (
    <li className="flex min-h-11 items-center gap-3 md:min-h-8 md:pointer-coarse:min-h-11">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <label htmlFor={id} className="cursor-pointer text-small text-ink">
        {name}
      </label>
    </li>
  );
}

/** The place a row stands for, as Add a place starts from it. */
export function startOfPlace(place: MapDataPlace, bundle: MapDataBundleKind): AddStart {
  if (place.type === "world") return { world: true, bundles: [bundle] };
  if (place.country) return { country: place.country, bundles: [bundle] };
  return { bundles: [bundle] };
}
