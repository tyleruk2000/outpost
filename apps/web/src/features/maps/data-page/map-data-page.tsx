/**
 * Map data: everything Outpost keeps for the map, by place and by what it is for, in one
 * screen. A sentence says how much there is and where; each country has six rows (the map to
 * look at, hills and heights, place names, roads for routes, places to find, the country file),
 * each saying where it stands; then the whole world, other areas, the kept country files and
 * what is kept on this device. "Add map data" adds for a place in a few presses.
 */
import type { MapDataAddKind, MapDataCountry, MapDataItem, MapDataResponse, ReferenceEstimateRequest } from "@outpost/shared";
import { formatBytes } from "@outpost/shared";
import { Ellipsis, FileUp, Layers, MapPin, Plus, SquareDashedMousePointer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { Disclosure, ErrorState, JumpLinks, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
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
import { fold } from "../lib/search";
import { AddMapData, type AddStart } from "./add-map-data";
import { DataRow, type RowContext } from "./data-row";
import { PlaceNamesDialog } from "./place-names";
import { UpdatesDialog } from "./update-dialog";
import { useMapData } from "./use-map-data";
import { activeLine, NOT_ADDED, notKeptLine, olderFiles, staleItems, staleLine, statusSentence } from "./words";

const link = "text-primary underline decoration-1 underline-offset-2";
const COUNTRY_KINDS = ["map", "terrain", "names", "roads", "places"] as const;

/** What a row's Add asks for: hills and heights come with a map of the same area. */
const ADD_KINDS: Record<(typeof COUNTRY_KINDS)[number] | "extract", MapDataAddKind[]> = {
  map: ["map"],
  terrain: ["map", "terrain"],
  names: ["names"],
  roads: ["roads"],
  places: ["places"],
  extract: ["extract"],
};

function emptyCountry(code: string, name: string): MapDataCountry {
  return {
    country: code,
    name,
    regionId: null,
    rows: (["map", "terrain", "names", "roads", "places", "extract"] as const).map((kind) => ({ kind, items: [] })),
    lastRead: null,
  };
}

/** An item's own name is shown where it is not just the country's: a part of it, or a terrain set named its own way. */
const ownName = (country: string) => (item: MapDataItem) => {
  const title = fold(item.title);
  return title !== fold(country) && title !== fold(`${country} (terrain)`);
};

function CountryGroup({ country, context, onAdd }: { country: MapDataCountry; context: RowContext; onAdd: (start: AddStart) => void }) {
  const rows = new Map(country.rows.map((row) => [row.kind, row.items]));
  const titled = ownName(country.name);
  const start = (kinds: MapDataAddKind[]) => onAdd({ country: country.country, regionId: country.regionId, kinds });
  return (
    <section id={`country-${country.country}`} aria-labelledby={`country-${country.country}-name`} className="scroll-mt-6">
      <h3 id={`country-${country.country}-name`} className="mb-2 font-title text-lead text-ink">
        {country.name}
      </h3>
      <Rows aria-label={`Map data for ${country.name}`}>
        {COUNTRY_KINDS.map((kind) => (
          <DataRow
            key={kind}
            kind={kind}
            items={rows.get(kind) ?? []}
            empty={NOT_ADDED[kind]}
            onAdd={() => start(ADD_KINDS[kind])}
            titled={titled}
            context={context}
          />
        ))}
        <DataRow
          kind="extract"
          items={rows.get("extract") ?? []}
          empty={notKeptLine(country.lastRead)}
          onAdd={() => start(ADD_KINDS.extract)}
          addLabel="Keep one"
          titled={titled}
          context={context}
        />
      </Rows>
    </section>
  );
}

function RowsSkeleton() {
  return (
    <div className="grid gap-3" aria-busy>
      <Skeleton className="h-6 w-48" />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className="grid gap-2 border-b border-border py-3 md:grid-cols-[11rem_minmax(0,1fr)]">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function OnThisDevice() {
  const kept = useKept();
  const supported = keepingSupported();
  const areas = (kept ?? []).filter((item) => item.kind === "area");
  const bytes = areas.reduce((sum, item) => sum + item.bytes, 0);
  return (
    <Section id="on-this-device" title={ON_THIS_DEVICE} description="Map areas kept in this browser, for when the server is out of reach.">
      <p className="text-small text-ink">
        {!supported
          ? "Keeping map areas here needs Outpost opened at an HTTPS address."
          : kept === undefined
            ? "Reading what is kept…"
            : areas.length === 0
              ? "No map areas are kept here yet."
              : `${plural(areas.length, "map area")} kept, ${formatBytes(bytes)}.`}{" "}
        <Link to="/kept" className={link}>
          {ON_THIS_DEVICE}
        </Link>{" "}
        lists them. To keep the view on the map, use <span className="font-medium">Keep this view</span> under Maps, Offline.
      </p>
    </Section>
  );
}

function Sources() {
  const catalogue = useCatalogue();
  return (
    <Disclosure summary="Sources and licences" className="mt-10">
      <ul className="grid max-w-[70ch] gap-2 text-ink-muted">
        <li>Maps to look at: Protomaps, drawn from OpenStreetMap, © OpenStreetMap contributors, under the Open Database Licence (ODbL).</li>
        <li>Hills and heights: Mapterhorn, from public elevation data; each source is credited on the map.</li>
        <li>
          Place names: GeoNames, under CC BY 4.0; for Great Britain, Ordnance Survey's OS Open Names, under the Open Government Licence.
        </li>
        <li>
          Roads for routes, places to find and country files: OpenStreetMap, © OpenStreetMap contributors (ODbL), in extracts made by
          Geofabrik GmbH.
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

function WholeWorld({
  world,
  context,
  onNames,
  onGet,
}: {
  world: MapDataItem[];
  context: RowContext;
  onNames: () => void;
  onGet: () => void;
}) {
  const navigate = useNavigate();
  const of = (kind: MapDataItem["kind"]) => world.filter((item) => item.kind === kind);
  const layers = of("places");
  return (
    <Section
      id="whole-world"
      title="Whole world"
      description="For anywhere, at less detail: a backdrop, and what search and the layers need everywhere."
    >
      <Rows aria-label="Map data for the whole world">
        <DataRow
          kind="map"
          name="World overview"
          items={of("map")}
          empty="Not added. Countries, cities and main roads everywhere, to zoom 6: a backdrop for the detailed places."
          onAdd={() => navigate("/maps?offline=region&preset=world")}
          titled={(item) => item.title !== "World overview"}
          context={context}
        />
        <DataRow
          kind="names"
          name="World towns"
          items={of("names")}
          empty="Not added. Finds the world's towns and cities by name."
          onAdd={onNames}
          titled={() => true}
          context={context}
        />
        {layers.length > 0 ? (
          <li className="py-3">
            <Disclosure summary={`Borders, airports and other layers (${layers.length})`}>
              <Rows>
                {layers.map((item) => (
                  <DataRow key={item.key} kind="places" name="Places to find" items={[item]} titled={() => true} context={context} />
                ))}
              </Rows>
            </Disclosure>
          </li>
        ) : (
          <DataRow
            kind="places"
            name="Borders and airports"
            items={[]}
            empty="Not added. Country borders, regions and airports, from Natural Earth and OurAirports."
            onAdd={onGet}
            context={context}
          />
        )}
        <DataRow
          kind="imagery"
          name="Satellite pictures"
          items={of("imagery")}
          empty="Not added. Chosen on the map, under Offline."
          onAdd={() => navigate("/maps?offline=imagery")}
          addLabel="Choose"
          titled={() => true}
          context={context}
        />
      </Rows>
    </Section>
  );
}

export default function MapDataPage() {
  const data = useMapData();
  const overview = useMapOverview();
  const downloads = useDownloads();
  const jobs = useActiveJobs();
  const home = useHomeCountry();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState<AddStart | null>(null);
  const [getting, setGetting] = useState<{ initial: ReferenceEstimateRequest | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [names, setNames] = useState(false);
  // Review updates ("review"), or Update for one thing from its row's menu.
  const [reviewing, setReviewing] = useState<"review" | MapDataItem | null>(null);

  // Arriving to do something: /maps/data?add=1&country=GB&kinds=roads, ?get=places, ?names=1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each arrival
  useEffect(() => {
    if (params.get("add")) {
      const kinds = (params.get("kinds") ?? "").split(",").filter(Boolean) as MapDataAddKind[];
      setAdding({ country: params.get("country"), ...(kinds.length > 0 ? { kinds } : {}) });
    }
    if (params.get("get")) setGetting({ initial: null });
    if (params.get("names")) setNames(true);
    if (params.get("add") || params.get("get") || params.get("names")) setParams({}, { replace: true });
  }, [params.toString()]);

  const context: RowContext = useMemo(
    () => ({
      downloads: downloads.data ?? [],
      jobs: jobs.data ?? [],
      regions: overview.data?.regions ?? [],
      onUpdatePlaces: (initial) => setGetting({ initial }),
      data: data.data,
      older: olderFiles(data.data?.countryFiles ?? []),
      onUpdate: (item) => setReviewing(item),
    }),
    [downloads.data, jobs.data, overview.data, data.data],
  );

  const countries = useMemo(() => {
    const list = data.data?.countries ?? [];
    if (!home || list.some((country) => country.country === home.code)) return list;
    // The home country is offered first even with nothing yet, each row saying what it is for.
    return [emptyCountry(home.code, home.name), ...list];
  }, [data.data, home]);

  const add = (start: AddStart) => setAdding(start);
  const added = (country: string | null) => {
    if (!country) return;
    window.setTimeout(() => document.getElementById(`country-${country}`)?.scrollIntoView({ block: "start" }), 300);
  };

  const answer: MapDataResponse | undefined = data.data;
  const stale = useMemo(() => (answer ? staleItems(answer) : []), [answer]);
  // Arriving at a part of the screen (/maps/data#country-files, from Storage): there once it is drawn.
  const { hash } = useLocation();
  const drawn = answer !== undefined;
  useEffect(() => {
    if (drawn && hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [drawn, hash]);
  const other = answer?.other ?? [];
  const jumps = [
    { id: "your-places", label: "Your places" },
    ...(other.length > 0 ? [{ id: "other-areas", label: "Other areas" }] : []),
    { id: "whole-world", label: "Whole world" },
    { id: "country-files", label: "Country files" },
    { id: "on-this-device", label: ON_THIS_DEVICE },
  ];

  return (
    <Page>
      <PageHeader
        title="Map data"
        description={
          answer ? (
            <>
              {statusSentence(answer.summary)}{" "}
              {answer.summary.active > 0 ? (
                <Link to="/downloads" className="inline-flex items-center gap-1.5 text-ink underline decoration-1 underline-offset-2">
                  <span aria-hidden className="inline-block size-2 rounded-full bg-lamp" />
                  {activeLine(answer.summary.active)}
                </Link>
              ) : (
                activeLine(0)
              )}
              {answer.summary.locations
                .filter((location) => !location.available)
                .map((location) => (
                  <span key={location.locationId ?? "own"} className="block text-warning">
                    {location.name} is not connected: what is on it waits until it is back.
                  </span>
                ))}
            </>
          ) : data.isPending ? (
            <span aria-hidden className="skeleton inline-block h-5 w-80 max-w-full align-middle" />
          ) : null
        }
        actions={
          <>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon" aria-label="More ways to add" className="max-md:size-11 md:pointer-coarse:size-11">
                  <Ellipsis />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => setNames(true)}>
                  <MapPin /> Place names
                </MenuItem>
                <MenuItem onSelect={() => setGetting({ initial: null })}>
                  <Layers /> Other places to find
                </MenuItem>
                <MenuItem onSelect={() => setImporting(true)}>
                  <FileUp /> Import a file
                </MenuItem>
                <MenuItem onSelect={() => navigate("/maps?offline=draw")}>
                  <SquareDashedMousePointer /> Draw an area on the map
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button variant="primary" onClick={() => add({})} disabled={!answer}>
              <Plus /> Add map data
            </Button>
          </>
        }
      />
      {stale.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-border py-3">
          <p className="text-small text-ink">
            {staleLine(stale.length)} <span className="text-ink-muted">Nothing is checked or downloaded until you ask.</span>
          </p>
          <Button size="sm" onClick={() => setReviewing("review")} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
            Review updates
          </Button>
        </div>
      ) : null}
      <JumpLinks label="Parts of this screen" items={jumps} />

      {data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : !answer ? (
        <RowsSkeleton />
      ) : (
        <>
          <Section id="your-places" title="Your places" description="What each country has, and what each kind of data is for.">
            {countries.length === 0 ? (
              <div className="grid gap-3">
                <p className="text-small text-ink-muted">
                  Nothing for a country yet. Outpost draws coastlines and borders until a map is added.
                </p>
                <div>
                  <Button variant="primary" onClick={() => add({})}>
                    <Plus /> Add map data
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-8">
                {countries.map((country) => (
                  <CountryGroup key={country.country} country={country} context={context} onAdd={add} />
                ))}
              </div>
            )}
          </Section>

          {other.length > 0 ? (
            <Section
              id="other-areas"
              title="Other areas"
              description="Areas drawn by hand, maps of your own and satellite pictures of an area."
            >
              <Rows aria-label="Other areas">
                {other.map((item) => (
                  <DataRow key={item.key} kind={item.kind} items={[item]} titled={() => true} context={context} />
                ))}
              </Rows>
            </Section>
          ) : null}

          <WholeWorld world={answer.world} context={context} onNames={() => setNames(true)} onGet={() => setGetting({ initial: null })} />

          <Section id="country-files" title="Country files">
            <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
              A country file is OpenStreetMap's whole record of a country, from Geofabrik. Roads for routes and places to find are read from
              it; the map you look at is a separate drawing. A kept file lets them be rebuilt with no download; one not kept is deleted once
              read.
            </p>
            {answer.countryFiles.length === 0 ? (
              <p className="text-small text-ink">No country file is kept.</p>
            ) : (
              <Rows aria-label="Kept country files">
                {answer.countryFiles.map((item) => (
                  <DataRow key={item.key} kind="extract" name={item.title} items={[item]} context={context} />
                ))}
              </Rows>
            )}
          </Section>

          <OnThisDevice />
        </>
      )}
      <Sources />

      {answer ? (
        <AddMapData open={adding !== null} onOpenChange={(open) => !open && setAdding(null)} data={answer} start={adding} onAdded={added} />
      ) : null}
      <GetDialog
        open={getting !== null}
        onOpenChange={(open) => !open && setGetting(null)}
        engine={null}
        initial={getting?.initial ?? null}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} />
      {answer ? (
        <UpdatesDialog
          review={reviewing === "review"}
          items={reviewing === "review" || reviewing === null ? stale : [reviewing]}
          data={answer}
          open={reviewing !== null}
          onOpenChange={(open) => !open && setReviewing(null)}
          onUpdatePlaces={(initial) => {
            setReviewing(null);
            setGetting({ initial });
          }}
        />
      ) : null}
      <PlaceNamesDialog open={names} onOpenChange={setNames} />
    </Page>
  );
}
