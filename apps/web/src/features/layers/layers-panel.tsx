/**
 * The Layers panel: each installed reference layer with its switch and its mark, the
 * legend of where things come from, population with its scale, filters that fit what is
 * installed, and a search of the records in the layers shown. Nothing is downloaded or
 * removed here: a layer with nothing held offers "Add hospitals for United Kingdom", which
 * opens Add a place on Offline maps with it ticked, where all map data is managed.
 */
import {
  type FeatureProvenance,
  LINE_LAYER_ZOOM,
  type MapDataWhereResponse,
  PROVENANCE_INFO,
  REFERENCE_LAYER_INFO,
  type ReferenceLayerId,
  type ReferenceLayersResponse,
} from "@outpost/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Search } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorState } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Select, Skeleton, Switch } from "@/components/ui/misc";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { useHome } from "@/features/households/home";
import { addLayerLink, addLayerText, COUNTRY_LAYERS, WORLD_LAYERS } from "@/features/maps/data-page/nearby-kinds";
import { formatDistance, type LatLon } from "@/features/maps/lib/geo";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useLayerSearch } from "./data";
import { FloodZonesLegend } from "./flood-legend";
import { FoodSection } from "./food-panel";
import { FoodMark } from "./food-symbols";
import { AreaMark, LineMark, ProvenanceMark } from "./marks";
import type { LayerChoice } from "./use-reference-layers";

const ORDER = Object.keys(REFERENCE_LAYER_INFO) as ReferenceLayerId[];
const LEGEND: FeatureProvenance[] = ["public-infrastructure", "historical", "unverified", "user"];
const ALL = "__all";

/** A country's English name from its code, as the browser knows it. */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Labels for the population scale, from the server's class edges. */
export function populationClasses(edges: number[]): string[] {
  return edges.map((edge, index) => {
    const next = edges[index + 1];
    return next === undefined ? `${formatNumber(edge)} or more` : `${formatNumber(edge)} to ${formatNumber(next)}`;
  });
}

function LayerRow({
  layer,
  count,
  on,
  colour,
  onChange,
  below,
}: {
  layer: ReferenceLayerId;
  count: number;
  on: boolean;
  colour: string;
  onChange: (on: boolean) => void;
  /** Anything that belongs under the row: a layer's own legend. */
  below?: ReactNode;
}) {
  const id = useId();
  const info = REFERENCE_LAYER_INFO[layer];
  return (
    <li className="py-2.5">
      {/* The whole row switches the layer: the switch alone was 40 × 24 and the name 18 px tall. */}
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 max-md:min-h-11 md:pointer-coarse:min-h-11">
        {info.areas && (layer === "boundaries" || layer === "regions" || layer === "planning-zones" || layer === "flood-zones") ? (
          <AreaMark colour={colour} />
        ) : layer === "routes" || layer === "rights-of-way" ? (
          <LineMark colour={colour} dashed={layer === "rights-of-way"} />
        ) : layer === "food" ? (
          <FoodMark kind="food:supermarket" colour={colour} className="-m-0.5 size-[22px] shrink-0" />
        ) : (
          <ProvenanceMark provenance={layer === "historical" ? "historical" : "public-infrastructure"} colour={colour} />
        )}
        <span className="min-w-0 flex-1">
          <span id={`${id}-name`} className="block text-small font-medium text-ink">
            {info.label}
          </span>
          <span id={`${id}-held`} className="tabular block text-small text-ink-muted">
            {formatNumber(count)} held
          </span>
        </span>
        <Switch
          id={id}
          checked={on}
          onCheckedChange={onChange}
          aria-labelledby={`${id}-name`}
          aria-describedby={`${id}-held`}
          className="mt-0.5 max-md:my-[10px]"
        />
      </label>
      {below}
    </li>
  );
}

export function LayersPanel({
  summary,
  choice,
  onChoice,
  colours,
  shades,
  onOpen,
  floodZones,
  lines,
  centre = null,
  roughly = null,
}: {
  summary: UseQueryResult<ReferenceLayersResponse>;
  choice: LayerChoice;
  onChoice: (next: LayerChoice | ((current: LayerChoice) => LayerChoice)) => void;
  colours: Record<ReferenceLayerId, string>;
  shades: string[];
  onOpen: (id: number, layer: ReferenceLayerId, at: LatLon | null) => void;
  /** Why flood zones are not drawn in this view, when they are not. */
  floodZones?: "zoom-in" | "too-many" | null;
  /** Why routes or rights of way are not all drawn in this view, when they are not. */
  lines?: "zoom-in" | "too-many" | null;
  /** The middle of the map, for the nearest list. */
  centre?: LatLon | null;
  /** Roughly where the map is, drawn or not: the country a layer with nothing held is offered for. */
  roughly?: LatLon | null;
}) {
  const [text, setText] = useState("");
  const layers = useMemo(() => [...(summary.data?.layers ?? [])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)), [summary.data]);
  // Every installed layer is searched; opening what is found switches its layer on. Nearest home first, with how far and the
  // town: rows that each said "Pharmacy · Pharmacy" in no order were no use for finding the one down the road.
  const { home } = useHome();
  const from = home ? { lat: home.lat, lon: home.lon } : centre;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once per search, so the list does not reshuffle as the map moves
  const near = useMemo(() => from, [text, home?.lat, home?.lon]);
  const found = useLayerSearch(text, { layers: layers.map((layer) => layer.id) }, near);
  const shown = layers.filter((layer) => choice.layers.includes(layer.id));
  const countries = [...new Set(shown.flatMap((layer) => layer.countries))].sort();
  const providers = new Map(shown.flatMap((layer) => layer.providers.map((provider) => [provider.id, provider.name] as const)));
  const kinds = new Map(shown.flatMap((layer) => layer.kinds.map((kind) => [kind.kind, kind.label] as const)));

  if (summary.isPending) {
    return (
      <div className="grid gap-3 p-4" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (summary.isError) {
    return (
      <div className="p-4">
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      </div>
    );
  }
  const population = summary.data.population;
  if (layers.length === 0 && population.length === 0) {
    return (
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
        <h3 className="font-title text-lead text-ink">No layer data on this device yet</h3>
        <p className="mt-1.5 text-small text-ink-muted">
          Hospitals, shelters, food and supplies and more for a country, and borders and airports for the world, drawn on the map. Each is
          added on Offline maps, with its size shown first.
        </p>
        <NotHeld summary={summary.data} centre={roughly ?? centre} />
      </div>
    );
  }

  const set = (patch: Partial<LayerChoice>) => onChoice((current) => ({ ...current, ...patch }));
  const toggle = (layer: ReferenceLayerId, on: boolean) =>
    onChoice((current) => ({
      ...current,
      layers: on ? [...new Set([...current.layers, layer])] : current.layers.filter((entry) => entry !== layer),
    }));
  const select = (value: string) => (value === ALL ? null : value);

  return (
    <div className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="px-4 pt-3">
        <p className="text-small text-ink-muted">
          Published data you downloaded or imported. Each mark says where it comes from; press one for its source.
        </p>
      </div>

      {layers.length > 0 ? (
        <div className="px-4 pt-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Find in the reference layers"
              aria-label="Find in the reference layers"
              className="pl-8"
            />
          </div>
          {text.trim().length >= 2 ? (
            found.isError ? (
              <p className="mt-2 text-small text-danger">The search could not be made.</p>
            ) : found.data && found.data.hits.length === 0 ? (
              <p className="mt-2 text-small text-ink-muted">Nothing by that name in the reference layers.</p>
            ) : (
              <ul
                className="mt-1 divide-y divide-border"
                aria-label={
                  near
                    ? `Found in the reference layers, nearest ${home ? "home" : "the middle of the map"} first`
                    : "Found in the reference layers"
                }
              >
                {(found.data?.hits ?? []).map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 py-1.5 text-left text-small text-ink hover:text-primary"
                      onClick={() =>
                        onOpen(hit.id, hit.layer, hit.lat !== null && hit.lon !== null ? { lat: hit.lat, lon: hit.lon } : null)
                      }
                    >
                      <ProvenanceMark provenance={hit.provenance} colour={colours[hit.layer]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{hit.name || hit.kindLabel}</span>
                        <span className="block truncate text-micro text-ink-muted">
                          {[hit.name ? hit.kindLabel : null, hit.place ? `near ${hit.place}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {typeof hit.distanceMeters === "number" ? (
                        <span className="tabular shrink-0 text-micro text-ink-muted">
                          {formatDistance(hit.distanceMeters)}
                          <span className="sr-only">{home ? " from home" : " from the middle of the map"}</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      <section className="px-4 pt-3" aria-label="Layers">
        <h3 className="text-body font-semibold text-ink">Layers</h3>
        <ul className="divide-y divide-border">
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer.id}
              count={layer.count}
              on={choice.layers.includes(layer.id)}
              colour={colours[layer.id]}
              onChange={(on) => toggle(layer.id, on)}
              below={
                layer.id === "flood-zones" && choice.layers.includes("flood-zones") ? (
                  <FloodZonesLegend colour={colours["flood-zones"]} status={floodZones} />
                ) : (layer.id === "routes" || layer.id === "rights-of-way") && choice.layers.includes(layer.id) ? (
                  <LinesNote layer={layer.id} status={lines} />
                ) : layer.id === "food" && choice.layers.includes("food") ? (
                  <FoodSection
                    summary={layer}
                    colour={colours.food}
                    kind={choice.kind}
                    onKind={(kind) => set({ kind })}
                    centre={centre}
                    onOpen={(id, at) => onOpen(id, "food", at)}
                  />
                ) : null
              }
            />
          ))}
          {population.length > 0 ? (
            <li className="py-2.5">
              <div className="flex items-start gap-3">
                <AreaMark colour={shades[3] ?? "#3a8e9e"} />
                <div className="min-w-0 flex-1">
                  <label htmlFor="reference-population" className="text-small font-medium text-ink">
                    Population density
                  </label>
                  <p className="text-small text-ink-muted">
                    WorldPop, {population[0]!.year}: {population.map((set) => set.country).join(", ")}
                  </p>
                </div>
                <Switch
                  id="reference-population"
                  checked={choice.population}
                  onCheckedChange={(on) => set({ population: on })}
                  className="mt-0.5 max-md:my-[10px]"
                />
              </div>
              {choice.population ? (
                <div className="mt-2 pl-[30px]">
                  <p className="text-small text-ink-muted">People per square kilometre</p>
                  <ul className="mt-1 grid gap-1" aria-label="Population scale">
                    {populationClasses([1, 10, 100, 500, 2000]).map((label, index) => (
                      <li key={label} className="tabular flex items-center gap-2 text-small text-ink">
                        <span aria-hidden className="h-3 w-6 rounded-[2px]" style={{ background: shades[index] }} />
                        {label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-micro text-ink-muted">
                    Modelled estimates of where people lived, not a census count. Fewer than one a square kilometre is left clear.
                  </p>
                </div>
              ) : null}
            </li>
          ) : null}
        </ul>
      </section>

      {shown.length > 0 ? (
        <section className="grid gap-2 px-4 pt-3" aria-label="Filters">
          <h3 className="text-body font-semibold text-ink">Show only</h3>
          <Select
            aria-label="Country"
            value={choice.country ?? ALL}
            onChange={(value) => set({ country: select(value) })}
            options={[{ value: ALL, label: "Every country" }, ...countries.map((code) => ({ value: code, label: countryName(code) }))]}
          />
          <Select
            aria-label="Source"
            value={choice.provider ?? ALL}
            onChange={(value) => set({ provider: select(value) })}
            options={[{ value: ALL, label: "Every source" }, ...[...providers].map(([value, label]) => ({ value, label }))]}
          />
          <Select
            aria-label="Kind"
            value={choice.kind ?? ALL}
            onChange={(value) => set({ kind: select(value) })}
            options={[{ value: ALL, label: "Every kind" }, ...[...kinds].map(([value, label]) => ({ value, label }))]}
          />
        </section>
      ) : null}

      <section className="px-4 pt-4" aria-label="Where things come from">
        <h3 className="text-body font-semibold text-ink">Where things come from</h3>
        <ul className="mt-1 divide-y divide-border">
          {LEGEND.map((provenance) => (
            <li key={provenance} className="flex items-start gap-3 py-2">
              <ProvenanceMark provenance={provenance} />
              <div className="min-w-0">
                <p className="text-small font-medium text-ink">
                  {PROVENANCE_INFO[provenance].label}: {PROVENANCE_INFO[provenance].shape}
                </p>
                <p className="text-small text-ink-muted">
                  {provenance === "user" ? "Your saved places and routes, drawn as they always are." : PROVENANCE_INFO[provenance].about}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-small text-ink-muted">
          Nothing here marks a place as a likely target or ranks places. Mapped infrastructure is what a public dataset lists, as it lists
          it.
        </p>
      </section>

      <div className="px-4 pt-2">
        <NotHeld summary={summary.data} centre={roughly ?? centre} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-2">
        <span className="tabular text-small text-ink-muted">
          {formatNumber(layers.reduce((sum, layer) => sum + layer.count, 0))} records
          {population.length > 0 ? `, ${population.length} population ${population.length === 1 ? "grid" : "grids"}` : ""}
        </span>
        <Link
          to="/maps/data"
          className="inline-flex min-h-11 items-center gap-1 text-small text-primary underline decoration-1 underline-offset-2 md:min-h-8"
        >
          Update or remove on Offline maps <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/** The country in the middle of the map, found on this device, else home: where a layer is offered for. */
function useSuggestedCountry(centre: LatLon | null): { code: string; name: string } | null {
  const home = useHomeCountry();
  // To a tenth of a degree: the question is asked again only when the map has moved some way.
  const lat = centre ? Math.round(centre.lat * 10) / 10 : null;
  const lon = centre ? Math.round(centre.lon * 10) / 10 : null;
  const here = useQuery({
    queryKey: ["maps", "data", "where", "layers", lat, lon],
    queryFn: () => api.get<MapDataWhereResponse>(`/api/maps/data/where?lat=${lat}&lon=${lon}`),
    enabled: lat !== null && lon !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const found = here.data?.results[0];
  return found ? { code: found.country, name: found.countryName } : home;
}

/**
 * Layers with nothing held, each as the step that adds it: a country's from its source file (for
 * the country in view, or home), the worldwide sets for the world. Each opens Add a place with
 * that kind ticked.
 */
function NotHeld({ summary, centre }: { summary: ReferenceLayersResponse; centre: LatLon | null }) {
  const country = useSuggestedCountry(centre);
  const held = new Set(summary.layers.map((layer) => layer.id));
  const rows: Array<{ label: string; to: string }> = [];
  for (const layer of COUNTRY_LAYERS.filter((each) => !held.has(each))) {
    const label = layer === "routes" ? "Waymarked routes" : REFERENCE_LAYER_INFO[layer].label;
    rows.push(
      country
        ? { label: addLayerText(label, country.name), to: addLayerLink(layer, { country: country.code }) }
        : { label: addLayerText(label, "a country"), to: `/maps/data?get=places&layers=${layer}` },
    );
  }
  if (summary.population.length === 0)
    rows.push(
      country
        ? { label: addLayerText("Population density", country.name), to: addLayerLink("population", { country: country.code }) }
        : { label: addLayerText("Population density", "a country"), to: "/maps/data?get=places&layers=population" },
    );
  for (const layer of WORLD_LAYERS.filter((each) => !held.has(each)))
    rows.push({ label: addLayerText(REFERENCE_LAYER_INFO[layer].label, "the whole world"), to: addLayerLink(layer, { world: true }) });
  if (rows.length === 0) return null;
  return (
    <section className="mt-3" aria-labelledby="layers-not-held">
      <h3 id="layers-not-held" className="text-body font-semibold text-ink">
        Not on this device yet
      </h3>
      <ul className="mt-1 divide-y divide-border" aria-label="Layers to add">
        {rows.map((row) => (
          <li key={row.to}>
            <Link
              to={row.to}
              className="flex min-h-11 items-center gap-2 py-1.5 text-small text-ink transition-colors duration-(--duration-fast) hover:text-primary md:min-h-9"
            >
              <Plus aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">{row.label}</span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Under Routes or Rights of way: from how close in they are drawn, and what a line does not say. */
function LinesNote({ layer, status }: { layer: "routes" | "rights-of-way"; status: "zoom-in" | "too-many" | null | undefined }) {
  const zoom = LINE_LAYER_ZOOM[layer] ?? 9;
  return (
    <div className="mt-1.5 grid gap-1 pl-[30px] text-small">
      {status === "too-many" ? (
        <p className="text-ink">There are too many lines in this view to draw. Zoom in.</p>
      ) : status === "zoom-in" ? (
        <p className="text-ink">
          Drawn from zoom {zoom} in{layer === "rights-of-way" ? ", about a village across" : ", about a county across"}.
        </p>
      ) : null}
      <p className="text-ink-muted">
        {layer === "routes"
          ? "A solid line. Press a line for the route's name, network and length where they are mapped."
          : "A broken line. Only paths whose right of way is tagged in OpenStreetMap; the council's definitive map is the legal record."}
      </p>
    </div>
  );
}
