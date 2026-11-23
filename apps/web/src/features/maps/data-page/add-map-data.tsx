/**
 * "Add map data": which place, then what for it, with every size after one press, then (for
 * roads and places) what happens to the country file, then where to keep it, then Download.
 * The home country comes first. On a wide screen the choices after the place are one view; on
 * a phone the dialog is a sheet with one step to a view. Nothing reaches out until "Check
 * sizes" (which names the hosts it asks) or Download is pressed.
 */
import {
  formatBytes,
  type MapDataAddKind,
  type MapDataAddRequest,
  type MapDataResponse,
  type MapRegionPresetStatus,
  type ReferenceRegionDto,
} from "@outpost/shared";
import { ArrowLeft, ChevronRight, CircleAlert, House, Search, SquareDashedMousePointer } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox, Progress, Skeleton } from "@/components/ui/misc";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { useCatalogue, useReadRegions, useRegions } from "@/features/layers/data";
import { StepLine } from "@/features/storage/parts";
import { errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useMapRegions } from "../data";
import { fold } from "../lib/search";
import { detailLabel } from "../panels/add-region";
import { DestinationPicker, useDestination } from "../panels/destination";
import { CountryFileChoice, suggestedFileLocation } from "./country-file-choice";
import { countryRegion, type Sizes, useAddMapData, useCheckSizes } from "./use-map-data";
import { askedLine, KIND_NAMES } from "./words";

const PHONE = "(max-width: 47.99rem)";
const MAX_FOUND = 30;
/** A road network kept is 1 to 2% of the country file it is read from (30 MB of Great Britain's 2.2 GB). */
const ROADS_SHARE = 0.02;

/** A place to add map data for: a country, or a part of one from Geofabrik's list. */
export interface Place {
  /** Two letters; null for a part of the world Geofabrik gives no country for. */
  code: string | null;
  name: string;
  /** Geofabrik's region, where known; found when sizes are checked otherwise. */
  regionId: string | null;
  /** The country it is part of, for a part of one. */
  partOf: string | null;
}

/** Where the add was asked from: a country's row, Road route, or the screen's own button. */
export interface AddStart {
  country?: string | null;
  regionId?: string | null;
  kinds?: MapDataAddKind[];
}

type Kind = "map" | "terrain" | "names" | "roads" | "places";
const KINDS: Kind[] = ["map", "terrain", "names", "roads", "places"];
const FROM_FILE = new Set<MapDataAddKind>(["roads", "places", "extract"]);

const DETAILS: Record<Kind, string> = {
  map: "Roads, paths, buildings and names, drawn",
  terrain: "Hill shading, contour lines and heights",
  names: "Towns, villages, hills and lakes found by name, from GeoNames",
  roads: "To plan a drive. Read from the country file",
  places: "Hospitals, emergency services, shelters, food and supplies. Read from the country file",
};

function KindChoice({
  kind,
  checked,
  onChange,
  detail,
  trailing,
  disabled,
}: {
  kind: Kind;
  checked: boolean;
  onChange: (checked: boolean) => void;
  detail: React.ReactNode;
  trailing: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <li className="flex items-start gap-3 py-2.5 max-md:py-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} disabled={disabled} className="mt-0.5" />
      <label
        htmlFor={id}
        className={cn(
          "flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span className="min-w-0">
          <span className={cn("block text-small font-medium", disabled ? "text-ink-muted" : "text-ink")}>{KIND_NAMES[kind]}</span>
          <span className="block text-small text-ink-muted">{detail}</span>
        </span>
        {trailing ? <span className="tabular shrink-0 text-small text-ink-muted">{trailing}</span> : null}
      </label>
    </li>
  );
}

function PlaceButton({ name, note, onChoose, icon }: { name: string; note?: string | null; onChoose: () => void; icon?: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        className="flex min-h-11 w-full items-center gap-3 px-2 py-2 text-left text-small transition-colors duration-(--duration-fast) hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3 md:pointer-coarse:py-3"
      >
        {icon ? <span className="shrink-0 text-ink-muted [&_svg]:size-4">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{name}</span>
          {note ? <span className="block text-micro text-ink-muted">{note}</span> : null}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
      </button>
    </li>
  );
}

/** Step 1: home first, the places already listed, then search; or draw an area on the map. */
function ChoosePlace({ data, onChoose, onDraw }: { data: MapDataResponse; onChoose: (place: Place) => void; onDraw: () => void }) {
  const home = useHomeCountry();
  const catalogue = useCatalogue();
  const regions = useRegions(null);
  const read = useReadRegions();
  const [text, setText] = useState("");
  const typed = fold(text);
  const list = regions.data?.held ? regions.data.regions : [];
  const byId = useMemo(() => new Map(list.map((region) => [region.id, region])), [list]);
  const countries = catalogue.data?.countries ?? [];
  const countryPlace = (code: string, name: string): Place => ({
    code,
    name,
    regionId: countryRegion(list, code)?.id ?? data.countries.find((country) => country.country === code)?.regionId ?? null,
    partOf: null,
  });
  const regionPlace = (region: ReferenceRegionDto): Place => ({
    code: region.country,
    name:
      region.depth === 0
        ? region.name
        : region.name.replace(/^[a-z]{2}\//, "").replace(/(^|-)([a-z])/g, (_, a, b) => `${a ? " " : ""}${b.toUpperCase()}`),
    regionId: region.id,
    partOf: region.parent ? (byId.get(region.parent)?.name ?? null) : null,
  });
  const found = useMemo(() => {
    if (!typed) return [];
    const match = (name: string) => fold(name).includes(typed);
    const first = (name: string) => (fold(name).startsWith(typed) ? 0 : 1);
    const fromCountries = countries
      .filter((country) => match(country.name))
      .map((country) => ({ key: `c:${country.code}`, name: country.name }));
    const parts = list
      .filter((region) => region.depth > 0 && match(region.name))
      .map((region) => ({ key: `r:${region.id}`, name: region.name }));
    return [...fromCountries, ...parts]
      .sort((a, b) => first(a.name) - first(b.name) || a.name.localeCompare(b.name, "en"))
      .slice(0, MAX_FOUND);
  }, [typed, countries, list]);
  const listed = data.countries.filter((country) => country.country !== home?.code);

  return (
    <div className="grid gap-4">
      <h3 className="font-title text-lead text-ink">Which place?</h3>
      <ul className="-mx-2 divide-y divide-border" aria-label="Your places">
        {home ? (
          <PlaceButton name={home.name} note="Your home" icon={<House />} onChoose={() => onChoose(countryPlace(home.code, home.name))} />
        ) : null}
        {listed.map((country) => (
          <PlaceButton
            key={country.country}
            name={country.name}
            note="Has map data"
            onChoose={() =>
              onChoose({
                ...countryPlace(country.country, country.name),
                regionId: country.regionId ?? countryRegion(list, country.country)?.id ?? null,
              })
            }
          />
        ))}
      </ul>
      <div className="grid gap-2">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
          <Input
            type="search"
            aria-label="Find a country or region"
            placeholder="Find a country or region"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="pl-8"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        {typed ? (
          found.length === 0 ? (
            <p className="text-small text-ink-muted">No country or region is called that. Try its name in English.</p>
          ) : (
            <ul aria-label="Places found" className="-mx-2 divide-y divide-border">
              {found.map((entry) => {
                const code = entry.key.startsWith("c:") ? entry.key.slice(2) : null;
                const region = code ? null : byId.get(entry.key.slice(2));
                return (
                  <PlaceButton
                    key={entry.key}
                    name={region ? regionPlace(region).name : entry.name}
                    note={region ? (region.parent ? `Part of ${byId.get(region.parent)?.name ?? region.parent}` : null) : null}
                    onChoose={() => onChoose(region ? regionPlace(region) : countryPlace(code!, entry.name))}
                  />
                );
              })}
            </ul>
          )
        ) : null}
        {regions.data && !regions.data.held ? (
          <div className="grid gap-2 text-small text-ink-muted">
            <p>
              Parts of a country (a state, a county) are listed once Geofabrik's list of regions is read: one file of about 500 kB from
              download.geofabrik.de.
            </p>
            <div>
              <Button size="sm" onClick={() => read.mutate()} loading={read.isPending}>
                Read the list of regions
              </Button>
            </div>
            {read.isError ? <p className="text-danger">{errorMessage(read.error)}</p> : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-1 border-t border-border pt-4">
        <div>
          <Button onClick={onDraw}>
            <SquareDashedMousePointer /> Draw my own area
          </Button>
        </div>
        <p className="text-small text-ink-muted">On the map, for a valley, an island or the way you are going.</p>
      </div>
    </div>
  );
}

/** The flow, in a dialog (a sheet from the foot of a phone). */
export function AddMapData({
  open,
  onOpenChange,
  data,
  start,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MapDataResponse;
  start: AddStart | null;
  /** After Download: the country it was for, to bring into view. */
  onAdded?: (country: string | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add map data" size="lg" className="max-md:h-[calc(100dvh-2rem)]">
        {open ? <Flow data={data} start={start} onClose={() => onOpenChange(false)} onAdded={onAdded} /> : null}
      </DialogContent>
    </Dialog>
  );
}

type Step = "place" | "what" | "file" | "where";

function Flow({
  data,
  start,
  onClose,
  onAdded,
}: {
  data: MapDataResponse;
  start: AddStart | null;
  onClose: () => void;
  onAdded?: (country: string | null) => void;
}) {
  const phone = useMediaQuery(PHONE);
  const navigate = useNavigate();
  const catalogue = useCatalogue();
  const home = useHomeCountry();
  const presets = useMapRegions(true);
  const check = useCheckSizes();
  const add = useAddMapData();
  const [place, setPlace] = useState<Place | null>(null);
  const [step, setStep] = useState<Step>("place");
  const [kinds, setKinds] = useState<Set<MapDataAddKind>>(new Set());
  const [sizes, setSizes] = useState<{ map: Record<string, Sizes["map"]>; file: Record<string, Sizes["file"]> }>({ map: {}, file: {} });
  const [hosts, setHosts] = useState<string[]>([]);
  const [keep, setKeep] = useState<boolean | undefined>(data.countryFileChoice.keep ?? undefined);
  const firstTime = data.countryFileChoice.keep === null;
  const heading = useRef<HTMLHeadingElement>(null);

  // Arriving with a place (a country's row, Road route): straight to what to add for it.
  const [startApplied, setStartApplied] = useState(false);
  useEffect(() => {
    if (startApplied || !start || presets.isPending) return;
    const code = start.country ?? (start.regionId ? null : home?.code) ?? null;
    const name = code ? (catalogue.data?.countries.find((country) => country.code === code)?.name ?? null) : null;
    if (!start.regionId && (!code || !name)) {
      if (catalogue.isSuccess || catalogue.isError) setStartApplied(true);
      return;
    }
    setStartApplied(true);
    choose(
      {
        code,
        name: name ?? start.regionId ?? "",
        regionId: start.regionId ?? data.countries.find((country) => country.country === code)?.regionId ?? null,
        partOf: null,
      },
      start.kinds,
    );
  });

  const preset: MapRegionPresetStatus | null = useMemo(() => {
    if (!place) return null;
    const all = (presets.data?.groups ?? []).flatMap((group) => group.regions);
    return all.find((entry) => fold(entry.name) === fold(place.name)) ?? null;
  }, [place, presets.data]);
  const held = place?.code ? data.countries.find((country) => country.country === place.code) : undefined;
  const present = (kind: MapDataAddKind) =>
    held?.rows.find((row) => row.kind === kind)?.items.some((item) => item.state === "ready" || item.state === "location-offline") ?? false;
  const regionId = place?.regionId ?? null;
  const keptFile =
    data.countryFiles.find((file) => file.state === "ready" && regionId !== null && file.regionId === regionId) ??
    (regionId === null && place?.code
      ? held?.rows.find((row) => row.kind === "extract")?.items.find((item) => item.state === "ready")
      : undefined);

  function choose(next: Place, asked?: MapDataAddKind[]) {
    setPlace(next);
    const all = (presets.data?.groups ?? []).flatMap((group) => group.regions);
    const hasMap = all.some((entry) => fold(entry.name) === fold(next.name));
    const country = next.code ? data.countries.find((each) => each.country === next.code) : undefined;
    const has = (kind: MapDataAddKind) =>
      country?.rows.find((row) => row.kind === kind)?.items.some((item) => item.state === "ready") ?? false;
    const wanted = asked
      ? asked
      : (["map", "terrain", "names"] as const).filter((kind) => (kind === "names" ? next.code !== null : hasMap) && !has(kind));
    setKinds(new Set(wanted));
    setStep("what");
  }

  // Each step's heading has the keyboard, so the step is read from its start (WCAG 2.4.3).
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each step
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  const fromFile = [...kinds].filter((kind) => FROM_FILE.has(kind));
  const rest = [...kinds].filter((kind) => !FROM_FILE.has(kind)) as Kind[];
  const needsMap = (kinds.has("map") || kinds.has("terrain")) && preset !== null;
  const mapKey = preset ? `${preset.id}:${preset.recommendedMaxZoom}:${kinds.has("terrain")}` : "";
  const fileKey = regionId ?? place?.code ?? "";
  const mapSize = needsMap ? sizes.map[mapKey] : null;
  const fileSize = fromFile.length > 0 ? sizes.file[fileKey] : null;
  const missingSizes = (needsMap && mapSize === undefined) || (fromFile.length > 0 && !keptFile && fileSize === undefined);
  const fileBytes = fileSize?.bytes ?? null;
  const resolvedRegion = regionId ?? fileSize?.regionId ?? null;

  const restBytes = mapSize ? mapSize.totalBytes : null;
  const restDestination = useDestination(restBytes, "maps");
  const fileDestination = useDestination(fileBytes);
  const [suggested, setSuggested] = useState(false);
  useEffect(() => {
    if (suggested || fileDestination.locations.length === 0) return;
    setSuggested(true);
    const id = suggestedFileLocation(fileDestination.locations, data.countryFileChoice.locationId);
    if (id) fileDestination.choose(id);
  }, [suggested, fileDestination, data.countryFileChoice.locationId]);

  const toggle = (kind: MapDataAddKind, on: boolean) =>
    setKinds((current) => {
      const next = new Set(current);
      if (on) next.add(kind);
      else next.delete(kind);
      // Hills and heights come with a map of the same area.
      if (kind === "map" && !on) next.delete("terrain");
      if (kind === "terrain" && on) next.add("map");
      return next;
    });

  const checkSizes = () =>
    check.mutate(
      {
        map:
          needsMap && mapSize === undefined
            ? { bbox: preset!.bbox, maxZoom: preset!.recommendedMaxZoom, terrain: kinds.has("terrain") }
            : null,
        file: fromFile.length > 0 && !keptFile && fileSize === undefined ? { regionId, country: place?.code ?? null, kept: false } : null,
      },
      {
        onSuccess: (result) => {
          setSizes((current) => ({
            map: result.map ? { ...current.map, [mapKey]: result.map } : current.map,
            file: result.file ? { ...current.file, [fileKey]: result.file } : current.file,
          }));
          setHosts((current) => [...new Set([...current, ...result.hosts])]);
        },
      },
    );

  const fileChoiceNeeded = fromFile.length > 0 && !keptFile && !kinds.has("extract");
  const keepNow = keptFile ? true : kinds.has("extract") ? true : keep;
  const problems = [
    kinds.size === 0 ? "Choose what to add." : null,
    missingSizes ? "Check sizes first." : null,
    fileChoiceNeeded && keep === undefined ? "Choose what happens to the country file." : null,
    keepNow && fromFile.length > 0 && !keptFile && !fileDestination.locationId ? "Choose where to keep the country file." : null,
    rest.length > 0 && !restDestination.locationId ? "Choose where to keep it." : null,
  ].filter(Boolean) as string[];

  const download = async () => {
    if (!place || problems.length > 0) return;
    const requests: MapDataAddRequest[] = [];
    if (fromFile.length > 0 && resolvedRegion)
      requests.push({
        regionId: resolvedRegion,
        kinds: fromFile,
        keep: keepNow ?? false,
        ...(keepNow && !keptFile && fileDestination.locationId ? { locationId: fileDestination.locationId } : {}),
      });
    if (rest.length > 0)
      requests.push({
        kinds: rest,
        ...(restDestination.locationId ? { locationId: restDestination.locationId } : {}),
        ...((kinds.has("map") || kinds.has("terrain")) && preset
          ? { map: { name: preset.name, regionId: preset.id, bbox: preset.bbox, maxZoom: preset.recommendedMaxZoom } }
          : {}),
        ...(kinds.has("names") && place.code ? { country: place.code } : {}),
      });
    try {
      for (const request of requests) await add.mutateAsync(request);
      restDestination.remember();
      toast.success(
        keptFile && rest.length === 0
          ? `Reading the kept country file for ${place.name}. Progress is shown on this screen.`
          : `Downloading map data for ${place.name}. Progress is shown on this screen and under Downloads and tasks.`,
      );
      onAdded?.(place.code);
      onClose();
    } catch {
      // Said under the buttons (add.error).
    }
  };

  // ── Views ──
  const phoneSteps: Step[] = [
    "place",
    "what",
    ...(fileChoiceNeeded || (keptFile && fromFile.length > 0) ? (["file"] as const) : []),
    // Where to keep it is a step of its own only when there is a choice to make.
    ...(rest.length > 0 && restDestination.locations.length > 1 ? (["where"] as const) : []),
  ];
  const stepNames: Record<Step, string> = {
    place: "Which place",
    what: "What to add",
    file: "The country file",
    where: "Where to keep it",
  };
  const at = phoneSteps.indexOf(step);
  const last = phone ? at === phoneSteps.length - 1 : step === "what";
  const showWhat = step === "what";
  const showFile = phone ? step === "file" : step === "what";
  const showWhere = phone ? step === "where" : step === "what";

  const sizeOf = (kind: Kind): React.ReactNode => {
    if (kind === "map") return mapSize ? formatBytes(mapSize.map.sizeBytes) : null;
    if (kind === "terrain") return mapSize?.terrain ? formatBytes(mapSize.terrain.sizeBytes) : null;
    if (kind === "names") return null;
    if (keptFile) return "No download";
    if (!fileBytes) return null;
    return kind === "roads" ? `${formatBytes(fileBytes * ROADS_SHARE)} or less kept` : "From the same file";
  };
  const detailOf = (kind: Kind): React.ReactNode => {
    const already = present(kind) ? " Already added: adding it again replaces it with the newest." : "";
    if (kind === "map") {
      if (!preset) return <>No ready-made map of {place?.name}. Draw your own area on the map instead.</>;
      return `${detailLabel(preset.recommendedMaxZoom)}, to zoom ${preset.recommendedMaxZoom}.${already}`;
    }
    if (kind === "terrain")
      return preset ? `${DETAILS.terrain}. Comes with the map of the same area.${already}` : "Comes with a map of the same area.";
    if (kind === "names") {
      if (!place?.code) return "Not offered for this region.";
      const country = catalogue.data?.countries.find((each) => each.code === place.code)?.name;
      return `${DETAILS.names}${place.partOf && country ? `, for the whole of ${country}` : ""}. Size given when it starts.${already}`;
    }
    return `${DETAILS[kind]}.${already}`;
  };
  const fileTotal = fromFile.length > 0 && !keptFile ? fileBytes : 0;
  const total = (mapSize?.totalBytes ?? 0) + (fileTotal ?? 0);

  const body = (
    <DialogBody className="grid content-start gap-6">
      {step === "place" ? (
        presets.isPending ? (
          <div className="grid gap-2" aria-busy>
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
        ) : (
          <ChoosePlace
            data={data}
            onChoose={(next) => choose(next)}
            onDraw={() => {
              onClose();
              navigate("/maps?offline=draw");
            }}
          />
        )
      ) : null}
      {showWhat && place ? (
        <section className="grid gap-3" aria-labelledby="add-what">
          <h3 id="add-what" ref={heading} tabIndex={-1} className="font-title text-lead text-ink focus:outline-none">
            What do you want for {place.name}?
          </h3>
          {place.partOf ? <p className="-mt-2 text-small text-ink-muted">Part of {place.partOf}</p> : null}
          <ul className="divide-y divide-border border-y border-border" aria-label={`What to add for ${place.name}`}>
            {KINDS.map((kind) => (
              <KindChoice
                key={kind}
                kind={kind}
                checked={kinds.has(kind)}
                onChange={(on) => toggle(kind, on)}
                disabled={(kind === "map" || kind === "terrain") && !preset ? true : kind === "names" && !place.code}
                detail={detailOf(kind)}
                trailing={sizeOf(kind)}
              />
            ))}
          </ul>
          {!preset ? (
            <p className="text-small">
              <Link to="/maps?offline=draw" className="text-primary underline decoration-1 underline-offset-2" onClick={onClose}>
                Draw an area on the map
              </Link>
            </p>
          ) : null}
          <div className="grid gap-2" aria-live="polite">
            {check.isPending ? (
              <div role="status" className="grid gap-2">
                <Progress label="Checking the sizes" tone="lamp" />
                <p className="text-small text-ink-muted">Asking how large each is. It needs a connection and takes a few seconds.</p>
              </div>
            ) : check.isError ? (
              <Notice tone="danger" icon={<CircleAlert />} title="The sizes could not be checked">
                {errorMessage(check.error)}
              </Notice>
            ) : null}
            {missingSizes && !check.isPending ? (
              <>
                <p className="max-w-[60ch] text-small text-ink-muted">
                  {askedLine([
                    needsMap ? "the map source" : null,
                    needsMap && kinds.has("terrain") ? "the terrain source" : null,
                    fromFile.length > 0 && !keptFile ? "Geofabrik (download.geofabrik.de)" : null,
                  ])}
                </p>
                <div>
                  <Button onClick={checkSizes} loading={check.isPending}>
                    {check.isError ? "Check sizes again" : "Check sizes"}
                  </Button>
                </div>
              </>
            ) : !check.isPending && (mapSize || fileSize) ? (
              <p className="text-small text-ink">
                <span className="tabular font-semibold">About {formatBytes(total)} to download</span>
                {kinds.has("names") ? ", and the place names" : ""}.
                {hosts.length > 0 ? <span className="block text-ink-muted">Sizes from {hosts.join(", ")}.</span> : null}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      {showFile && place && fromFile.length > 0 && (phone || step === "what") ? (
        <CountryFileChoice
          size={fileBytes}
          kept={keptFile ? { dataDate: keptFile.dataDate, locationName: keptFile.locationName } : null}
          value={kinds.has("extract") ? true : keep}
          onChange={setKeep}
          firstTime={firstTime}
          destination={fileDestination}
        />
      ) : null}
      {showWhere && place && rest.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="add-where">
          <h3 id="add-where" className="text-small font-semibold text-ink">
            {fromFile.length > 0 ? "Where to keep the rest" : "Where to keep it"}
          </h3>
          <DestinationPicker destination={restDestination} />
        </section>
      ) : null}
      {add.isError ? (
        <Notice tone="danger" icon={<CircleAlert />} title="The download did not start">
          {errorMessage(add.error)}
        </Notice>
      ) : null}
      {presets.isError ? <ErrorState error={presets.error} onRetry={() => presets.refetch()} /> : null}
    </DialogBody>
  );

  const stepLine = phone ? (
    <StepLine
      step={Math.max(at, 0) + 1}
      of={step === "place" ? Math.max(phoneSteps.length, 3) : phoneSteps.length}
      label={stepNames[step]}
    />
  ) : null;
  if (step === "place")
    return (
      <>
        {stepLine}
        {body}
      </>
    );

  const back = () => {
    if (phone && at > 1) setStep(phoneSteps[at - 1]!);
    else setStep("place");
  };
  const next = () => setStep(phoneSteps[at + 1]!);
  const blocking = phone
    ? step === "what"
      ? problems.filter((problem) => problem === "Choose what to add." || problem === "Check sizes first.")
      : step === "file"
        ? problems.filter((problem) => problem.includes("country file"))
        : problems
    : problems;
  const onlyReading = keptFile && rest.length === 0;

  return (
    <>
      {stepLine}
      {body}
      <DialogFooter>
        {blocking[0] ? <span className="mr-auto text-small text-ink-muted">{blocking[0]}</span> : null}
        <Button onClick={back}>
          <ArrowLeft /> {at > 1 && phone ? "Back" : "Another place"}
        </Button>
        {last ? (
          <Button variant="primary" onClick={download} loading={add.isPending} disabled={problems.length > 0}>
            {onlyReading ? (fromFile.includes("roads") ? "Build roads" : "Read the kept file") : "Download"}
          </Button>
        ) : (
          <Button variant="primary" onClick={next} disabled={blocking.length > 0}>
            Next
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
