/**
 * Offline maps (/maps/data): the one place offline map data is managed. One row per place (a
 * country, a part of one, an area drawn on the map, the world's basics), each saying where its
 * Map, Routes, Nearby places and Walk/cycle stand; a line for anything downloading; a line for
 * what is over a year old; one button, "Add a place". Everything else that offers map data
 * (Road route, Reach, the map's first card, Storage, quick search) leads here.
 */
import type { Bbox, MapDataBundleKind, MapDataPlace, MapDataResponse } from "@outpost/shared";
import { ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Disclosure, EmptyState, ErrorState, Page, PageHeader, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useDownloads } from "@/features/downloads/use-downloads";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { ON_THIS_DEVICE } from "@/features/kept/device";
import { keepingSupported, useKept } from "@/features/kept/store";
import { useCatalogue } from "@/features/layers/data";
import { GetDialog, ImportDialog } from "@/features/layers/dataset-manager";
import { useActiveJobs } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { useMapOverview } from "../data";
import { AddMapData, type AddStart, bundlesOfKinds, startOfPlace } from "./add-map-data";
import { isUnderWay, touchSize } from "./pattern";
import { downloadOf, KeptHereRow, PlaceHeader, PlaceRow, type RowContext } from "./place-row";
import { RemovePlaceDialog } from "./remove-dialog";
import { StreetsBuildDialog } from "./streets-build";
import { PlaceUpdatesDialog } from "./update-dialog";
import { useMapData } from "./use-map-data";
import { BUNDLE_NAMES, bundleStateText, offlineSummary, placesIn, stalePlacesLine } from "./words";

const link = "text-primary underline decoration-1 underline-offset-2";

/** The title of the screen: the one place offline map data is managed. */
export const OFFLINE_MAPS = "Offline maps";

function RowsSkeleton() {
  return (
    <div className="grid gap-1" aria-busy>
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2 border-b border-border py-3">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function Sources() {
  const catalogue = useCatalogue();
  return (
    <Disclosure summary="Sources and licences">
      <ul className="grid max-w-[70ch] gap-2 text-ink-muted">
        <li>Maps: Protomaps, drawn from OpenStreetMap, © OpenStreetMap contributors, under the Open Database Licence (ODbL).</li>
        <li>Hills and heights: Mapterhorn, from public elevation data; each source is credited on the map.</li>
        <li>
          Towns by name: GeoNames, under CC BY 4.0; for Great Britain, Ordnance Survey's OS Open Names, under the Open Government Licence.
        </li>
        <li>
          Routes, nearby places and source files: OpenStreetMap, © OpenStreetMap contributors (ODbL), in extracts made by Geofabrik GmbH.
        </li>
        <li>Borders and airports: Natural Earth (public domain) and OurAirports (public domain).</li>
        <li>Satellite pictures: each set says its publisher, its licence and the day it was taken, wherever it is shown.</li>
      </ul>
      {(catalogue.data?.linked ?? []).length > 0 ? (
        <div className="grid gap-1">
          <p className="font-medium text-ink">Sources that are linked, not downloaded</p>
          <ul className="grid gap-1.5">
            {catalogue.data!.linked.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer" className={link}>
                  {source.name}
                </a>
                <span className="text-ink-muted">: {source.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Disclosure>
  );
}

/** The top line while anything is on its way: "United Kingdom routes: 1.0 of 2.3 GB, 19 min ›". */
function UnderWay({ places, context }: { places: MapDataPlace[]; context: RowContext }) {
  const moving = places.flatMap((place) =>
    place.bundles.filter(isUnderWay).map((bundle) => ({ place, bundle, download: downloadOf(place, bundle, context.downloads) })),
  );
  // One download for two bundles (routes and nearby places from one file) is said once.
  const seen = new Set<string>();
  const lines = moving.filter(({ download, place, bundle }) => {
    const key = download?.id ?? `${place.key}:${bundle.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (lines.length === 0) return null;
  const [first, ...rest] = lines;
  const to = first!.download ? `/downloads/${first!.download.id}` : "/downloads";
  const what = `${first!.place.name} ${BUNDLE_NAMES[first!.bundle.kind].toLowerCase()}`;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
      <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-lamp" />
      <Link to={to} className="inline-flex min-h-11 items-center gap-1 text-ink hover:underline md:min-h-6">
        <span className="tabular">
          {what}: {bundleStateText(first!.bundle, first!.download).replace(/^Downloading /, "")}
        </span>
        <ChevronRight aria-hidden className="size-4 text-ink-muted" />
      </Link>
      {rest.length > 0 ? (
        <Link to="/downloads" className={`${link} inline-flex min-h-11 items-center md:min-h-6`}>
          and {plural(rest.length, "more")}
        </Link>
      ) : null}
    </p>
  );
}

function KeptHere() {
  const kept = useKept();
  if (!keepingSupported() || !kept) return null;
  const areas = kept.filter((item) => item.kind === "area");
  if (areas.length === 0) return null;
  const bytes = areas.reduce((sum, item) => sum + item.bytes, 0);
  return <KeptHereRow name={ON_THIS_DEVICE} line={`${plural(areas.length, "map area")} kept in this browser`} bytes={bytes} />;
}

export default function MapDataPage() {
  const data = useMapData();
  const overview = useMapOverview();
  const downloads = useDownloads();
  const jobs = useActiveJobs();
  const home = useHomeCountry();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState<AddStart | null>(null);
  const [getting, setGetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [streetsFor, setStreetsFor] = useState<{ country: string | null } | null>(null);
  const [updating, setUpdating] = useState<{ places: MapDataPlace[]; review: boolean } | null>(null);
  const [removing, setRemoving] = useState<MapDataPlace | null>(null);

  // Arriving to do something: ?add=1 (with &countries=FR,CH or &country=GB, &kinds=roads, or an area
  // drawn: &bbox=w,s,e,n&name=…), ?get=places, ?names=1, ?streets=1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each arrival
  useEffect(() => {
    const kinds = (params.get("kinds") ?? "").split(",").filter(Boolean);
    const bundles = bundlesOfKinds(kinds);
    const countries = (params.get("countries") ?? params.get("country") ?? "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code));
    const bbox = (params.get("bbox") ?? "").split(",").map(Number);
    if (params.get("add") || params.get("names")) {
      const area =
        bbox.length === 4 && bbox.every(Number.isFinite)
          ? { name: (params.get("name") ?? "").trim() || "My area", bbox: bbox as Bbox }
          : undefined;
      setAdding({
        ...(countries.length > 0 ? { countries } : {}),
        ...(params.get("names") ? { bundles: ["map"] as MapDataBundleKind[] } : bundles.length > 0 ? { bundles } : {}),
        ...(area ? { area } : {}),
        ...(params.get("world") ? { world: true } : {}),
      });
    }
    if (params.get("get")) setGetting(true);
    if (params.get("streets")) setStreetsFor({ country: params.get("country") });
    if (params.get("add") || params.get("get") || params.get("names") || params.get("streets")) setParams({}, { replace: true });
  }, [params.toString()]);

  const answer: MapDataResponse | undefined = data.data;
  const places = useMemo(() => (answer ? placesIn(answer) : []), [answer]);
  const streets = answer?.streetsInstalled ?? false;
  const columns = useMemo<MapDataBundleKind[]>(() => ["map", "routes", "nearby", ...(streets ? (["walk"] as const) : [])], [streets]);
  const context: RowContext = useMemo(
    () => ({
      downloads: downloads.data ?? [],
      jobs: jobs.data ?? [],
      regions: overview.data?.regions ?? [],
      home: home?.code ?? null,
      columns,
      onAdd: (place, bundle) => {
        if (bundle === "walk") setStreetsFor({ country: place.country });
        else setAdding(startOfPlace(place, bundle));
      },
      onUpdate: (place) => setUpdating({ places: [place], review: false }),
      onRemove: (place) => setRemoving(place),
    }),
    [downloads.data, jobs.data, overview.data, home?.code, columns],
  );
  const stale = places.filter((place) => place.stale > 0);
  const added = (place: { code: string | null }) => {
    if (!place.code) return;
    window.setTimeout(() => document.querySelector(`[data-place="country:${place.code}"]`)?.scrollIntoView({ block: "nearest" }), 300);
  };

  return (
    <Page>
      <PageHeader
        title={OFFLINE_MAPS}
        description={
          answer ? (
            <>
              {offlineSummary(answer.summary)}
              {answer.summary.locations
                .filter((location) => !location.available)
                .map((location) => (
                  <span key={location.locationId ?? "own"} className="block text-warning">
                    Storage not connected: {location.name}. What is on it waits until it is back.
                  </span>
                ))}
            </>
          ) : data.isPending ? (
            <span aria-hidden className="skeleton inline-block h-5 w-64 max-w-full align-middle" />
          ) : null
        }
        actions={
          <Button variant="primary" onClick={() => setAdding({})} disabled={!answer}>
            <Plus /> Add a place
          </Button>
        }
      />

      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !answer ? (
        <RowsSkeleton />
      ) : (
        <div className="grid gap-6">
          {answer.summary.active > 0 || stale.length > 0 ? (
            <div className="grid gap-1 border-b border-border pb-3">
              <UnderWay places={places} context={context} />
              {stale.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-small text-ink">{stalePlacesLine(stale.length)}</p>
                  <Button size="sm" className={touchSize} onClick={() => setUpdating({ places: stale, review: true })}>
                    Check for updates
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {places.length === 0 ? (
            <EmptyState
              title="No offline maps yet"
              level={2}
              compact
              action={
                <Button variant="primary" onClick={() => setAdding({})}>
                  <Plus /> Add a place
                </Button>
              }
            >
              Add a country, a part of one, or an area you draw. Its map, routes and nearby places then work with no connection.
            </EmptyState>
          ) : (
            <div>
              <PlaceHeader columns={columns} />
              <Rows aria-label="Places" className="border-t-0">
                {places.map((place) => (
                  <PlaceRow key={place.key} place={place} context={context} />
                ))}
                <KeptHere />
              </Rows>
            </div>
          )}

          <div className="grid gap-3 text-small">
            {answer.streetsInstalled === false ? (
              <p className="text-ink-muted">
                Walking and cycling: not set up ·{" "}
                <Link to="/help/deployment#h-street-routes" className={link}>
                  How to add it
                </Link>
              </p>
            ) : null}
            <p>
              <Link to="/kept" className={`${link} inline-flex min-h-11 items-center gap-1 md:min-h-6`}>
                {ON_THIS_DEVICE} <ChevronRight aria-hidden className="size-4" />
              </Link>
            </p>
            <Sources />
          </div>
        </div>
      )}

      {answer ? (
        <AddMapData
          open={adding !== null}
          onOpenChange={(open) => !open && setAdding(null)}
          data={answer}
          start={adding}
          onAdded={added}
          onImport={() => setImporting(true)}
          onOtherSources={() => {
            setAdding(null);
            setGetting(true);
          }}
        />
      ) : null}
      <GetDialog open={getting} onOpenChange={setGetting} engine={null} initial={null} />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      {answer ? (
        <PlaceUpdatesDialog
          places={updating?.places ?? []}
          review={updating?.review ?? false}
          data={answer}
          open={updating !== null}
          onOpenChange={(open) => !open && setUpdating(null)}
        />
      ) : null}
      <RemovePlaceDialog place={removing} open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)} />
      {answer?.streetsInstalled ? (
        <StreetsBuildDialog
          open={streetsFor !== null}
          onOpenChange={(open) => !open && setStreetsFor(null)}
          country={streetsFor?.country ?? null}
          onKeepFile={(country) => setAdding({ ...(country ? { countries: [country] } : {}), bundles: ["routes"] })}
        />
      ) : null}
    </Page>
  );
}
