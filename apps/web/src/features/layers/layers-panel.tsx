/**
 * The Layers panel: each installed reference layer with its switch and its mark, the
 * legend of where things come from, population with its scale, filters that fit what is
 * installed, and a search of the records in the layers shown.
 */
import {
  type FeatureProvenance,
  PROVENANCE_INFO,
  REFERENCE_LAYER_INFO,
  type ReferenceLayerId,
  type ReferenceLayersResponse,
} from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { Layers, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, Skeleton, Switch } from "@/components/ui/misc";
import type { LatLon } from "@/features/maps/lib/geo";
import { formatNumber } from "@/lib/utils";
import { useLayerSearch } from "./data";
import { AreaMark, ProvenanceMark } from "./marks";
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
}: {
  layer: ReferenceLayerId;
  count: number;
  on: boolean;
  colour: string;
  onChange: (on: boolean) => void;
}) {
  const id = useId();
  const info = REFERENCE_LAYER_INFO[layer];
  return (
    <li className="flex items-start gap-3 py-2.5">
      {info.areas && (layer === "boundaries" || layer === "regions" || layer === "planning-zones") ? (
        <AreaMark colour={colour} />
      ) : (
        <ProvenanceMark provenance={layer === "historical" ? "historical" : "public-infrastructure"} colour={colour} />
      )}
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-small font-medium text-ink">
          {info.label}
        </label>
        <p className="tabular text-small text-ink-muted">{formatNumber(count)} held</p>
      </div>
      <Switch id={id} checked={on} onCheckedChange={onChange} className="mt-0.5 max-md:my-[10px]" />
    </li>
  );
}

export function LayersPanel({
  summary,
  choice,
  onChoice,
  colours,
  shades,
  onManage,
  onOpen,
}: {
  summary: UseQueryResult<ReferenceLayersResponse>;
  choice: LayerChoice;
  onChoice: (next: LayerChoice | ((current: LayerChoice) => LayerChoice)) => void;
  colours: Record<ReferenceLayerId, string>;
  shades: string[];
  onManage: () => void;
  onOpen: (id: number, layer: ReferenceLayerId, at: LatLon | null) => void;
}) {
  const [text, setText] = useState("");
  const layers = useMemo(() => [...(summary.data?.layers ?? [])].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)), [summary.data]);
  // Every installed layer is searched; opening what is found switches its layer on.
  const found = useLayerSearch(text, { layers: layers.map((layer) => layer.id) });
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
      <div className="px-4 py-5">
        <h3 className="font-title text-lead text-ink">No reference data on this device yet</h3>
        <p className="mt-1.5 text-small text-ink-muted">
          Layers of published data for the map: country and regional boundaries, airports, publicly mapped military sites, nuclear
          facilities, hospitals, emergency services, shelters, population, and historical records you import. Each is downloaded when you
          ask, by country, with its size shown first.
        </p>
        <Button variant="primary" className="mt-4" onClick={onManage}>
          <Layers /> Get reference data
        </Button>
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
              <ul className="mt-1 divide-y divide-border" aria-label="Found in the reference layers">
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
                      <span className="min-w-0 flex-1 truncate">{hit.name || hit.kindLabel}</span>
                      <span className="shrink-0 text-ink-muted">{hit.kindLabel}</span>
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

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <Button onClick={onManage}>
          <Layers /> Manage reference data
        </Button>
        <span className="tabular text-small text-ink-muted">
          {formatNumber(layers.reduce((sum, layer) => sum + layer.count, 0))} records
          {population.length > 0 ? `, ${population.length} population ${population.length === 1 ? "grid" : "grids"}` : ""}
        </span>
      </div>
    </div>
  );
}
