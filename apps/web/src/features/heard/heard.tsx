/**
 * "Heard on the radio" on the map (outpost-ywbh.10): the one group in the Layers panel for
 * everything a receiver of the household heard, kept apart from the reference layers.
 * Each source (mesh radios, APRS, aircraft, ships) is a row with its switch and a count,
 * and may put its own list under it.
 *
 * One way of drawing for all of them, so that four live sources read as one map:
 * - each source in its own hue (the chart tokens, in the same order everywhere), and
 *   each mark labelled with its name and its age in words;
 * - every mark faded with age in the steps stated here and in the legend: opacity is
 *   never the only signal of age, nor colour of the source;
 * - zoomed out, each source gathers into counts of its own ("40 aircraft"), so an airport
 *   or a port does not bury the household's radios; the household's own stations, pinned,
 *   are never gathered and are drawn on top under the name given them;
 * - the trail of the one opened, under the marks.
 *
 * A source joins by drawing `heardFeature`s into its own source here (`HEARD_SOURCES`).
 */
import type { HeardSourceId } from "@outpost/shared";
import type { ReactNode } from "react";
import { useId } from "react";
import { Switch } from "@/components/ui/misc";
import type { MapTheme } from "@/features/maps/lib/style";
import { MAP_FONTS } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection, OverlaySource } from "@/features/maps/map/overlays";
import { cn, timeAgo } from "@/lib/utils";

export const HEARD_SOURCES: Record<HeardSourceId, OverlaySource> = {
  mesh: "o-heard-mesh",
  aprs: "o-heard-aprs",
  adsb: "o-heard-adsb",
  ais: "o-heard-ais",
};
export const HEARD_PINNED: OverlaySource = "o-heard-pinned";
export const HEARD_TRAIL: OverlaySource = "o-heard-trail";
/** The range view: the outline of where a receiver heard from, and each position it heard. */
export const HEARD_RANGE: OverlaySource = "o-heard-range";

/** The sources MapLibre gathers into counts, and how. Above zoom 11 every mark is drawn on its own. */
export const HEARD_CLUSTERED: ReadonlySet<string> = new Set(Object.values(HEARD_SOURCES));
export const HEARD_CLUSTER = { cluster: true, clusterRadius: 44, clusterMaxZoom: 11 } as const;

/** What a gathered count says: "12 aircraft". */
const COUNT_WORDS: Record<HeardSourceId, [string, string]> = {
  mesh: ["radio", "radios"],
  aprs: ["station", "stations"],
  adsb: ["aircraft", "aircraft"],
  ais: ["ship", "ships"],
};

/** The steps a mark fades in, newest first; the legend says them in words. */
export const AGE_STEPS = [
  { underMs: 60 * 60_000, opacity: 1, words: "Heard in the last hour" },
  { underMs: 6 * 60 * 60_000, opacity: 0.7, words: "1 to 6 hours ago" },
  { underMs: Number.POSITIVE_INFINITY, opacity: 0.45, words: "Longer ago" },
] as const;

export const ageOpacity = (ageMs: number) => AGE_STEPS.find((step) => ageMs < step.underMs)?.opacity ?? 0.45;

export type HeardFeature = FeatureCollection["features"][number];

/** One mark: a source ("mesh"), a name, and when it was heard; the label carries the age in words. */
export function heardFeature(
  input: { source: HeardSourceId; id: string; name: string; at: number; lat: number; lon: number; pinned?: boolean },
  now = Date.now(),
): HeardFeature {
  return {
    type: "Feature",
    properties: {
      source: input.source,
      id: input.id,
      label: `${input.name}\n${timeAgo(input.at)}`,
      fade: ageOpacity(Math.max(0, now - input.at)),
      pinned: Boolean(input.pinned),
    },
    geometry: { type: "Point", coordinates: [input.lon, input.lat] },
  };
}

/** Each source's hue on the map, from the chart tokens (as the map theme read them), in the order every screen uses. */
export function heardHues(theme: MapTheme): Record<HeardSourceId, string> {
  return theme.heard ?? { mesh: theme.primary, aprs: theme.lamp, adsb: theme.primary, ais: theme.primary };
}

const label = (theme: MapTheme, size: number) => ({
  layout: {
    "text-font": [MAP_FONTS.medium] as string[],
    "text-field": ["get", "label"] as ["get", string],
    "text-size": size,
    "text-anchor": "top" as const,
    "text-offset": [0, 0.8] as [number, number],
    "text-allow-overlap": false,
  },
  paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
});

/** Above the reference layers and under saved places. */
export function heardLayers(theme: MapTheme): LayerSpecification[] {
  const hues = heardHues(theme);
  const layers: LayerSpecification[] = [
    {
      id: "o-heard-trail-line",
      type: "line",
      source: HEARD_TRAIL,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": theme.ink, "line-width": 2, "line-opacity": 0.55, "line-dasharray": [2, 1.5] },
    },
    {
      id: "o-heard-trail-point",
      type: "circle",
      source: HEARD_TRAIL,
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 3, "circle-color": theme.ink, "circle-opacity": 0.6 },
    },
    // The range view: the outline solid (a second test, compared, dashed); positions heard directly filled, those through
    // a digipeater or other radios hollow, so that the difference is in the shape and not only the colour.
    {
      id: "o-heard-range-line",
      type: "line",
      source: HEARD_RANGE,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": theme.primary, "line-width": 2.5 },
    },
    {
      id: "o-heard-range-compare",
      type: "line",
      source: HEARD_RANGE,
      filter: ["==", ["geometry-type"], "MultiLineString"],
      paint: { "line-color": theme.ink, "line-width": 2, "line-dasharray": [3, 2] },
    },
    {
      id: "o-heard-range-point",
      type: "circle",
      source: HEARD_RANGE,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 4,
        "circle-color": theme.primary,
        "circle-opacity": ["case", ["get", "direct"], 0.9, 0],
        "circle-stroke-color": theme.primary,
        "circle-stroke-width": ["case", ["get", "direct"], 1, 1.5],
      },
    },
  ];
  for (const source of Object.keys(HEARD_SOURCES) as HeardSourceId[]) {
    const id = HEARD_SOURCES[source];
    const [one, many] = COUNT_WORDS[source];
    layers.push(
      {
        id: `${id}-count`,
        type: "circle",
        source: id,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": hues[source],
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 22],
          "circle-stroke-color": theme.page,
          "circle-stroke-width": 2,
        },
      },
      {
        id: `${id}-count-label`,
        type: "symbol",
        source: id,
        filter: ["has", "point_count"],
        layout: {
          "text-font": [MAP_FONTS.medium] as string[],
          "text-field": ["concat", ["get", "point_count_abbreviated"], " ", ["case", ["==", ["get", "point_count"], 1], one, many]],
          "text-size": 12,
          "text-anchor": "top",
          "text-offset": [0, 1.6],
          "text-allow-overlap": true,
        },
        paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.6 },
      },
      {
        id: `${id}-point`,
        type: "circle",
        source: id,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": hues[source],
          "circle-opacity": ["get", "fade"],
          "circle-stroke-color": theme.page,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": ["get", "fade"],
        },
      },
      { id: `${id}-label`, type: "symbol", source: id, filter: ["!", ["has", "point_count"]], ...label(theme, 12) },
    );
  }
  // The household's own, on top: a larger mark ringed in ink, in its source's hue.
  layers.push(
    {
      id: "o-heard-pinned-point",
      type: "circle",
      source: HEARD_PINNED,
      paint: {
        "circle-radius": 8,
        "circle-color": ["match", ["get", "source"], "aprs", hues.aprs, "adsb", hues.adsb, "ais", hues.ais, hues.mesh],
        "circle-opacity": ["get", "fade"],
        "circle-stroke-color": theme.ink,
        "circle-stroke-width": 2.5,
      },
    },
    { id: "o-heard-pinned-label", type: "symbol", source: HEARD_PINNED, ...label(theme, 13) },
  );
  return layers;
}

/** The layers a press on the map opens a mark from, and gathers counts from. */
export const HEARD_POINT_LAYERS = [...Object.values(HEARD_SOURCES).map((id) => `${id}-point`), "o-heard-pinned-point"];
export const HEARD_COUNT_LAYERS = Object.values(HEARD_SOURCES).map((id) => `${id}-count`);

// ── What is on the map now, for a printed page ──

const shown = new Map<OverlaySource, FeatureCollection>();
let shownAt = 0;

/** Kept by each source as it draws, so that "Print or save as PDF" can put the same marks on the page. */
export function rememberHeard(source: OverlaySource, data: FeatureCollection): void {
  if (data.features.length === 0) shown.delete(source);
  else shown.set(source, data);
  shownAt = Date.now();
}

export function heardSnapshot(): { data: Map<OverlaySource, FeatureCollection>; at: number; count: number } {
  let count = 0;
  for (const data of shown.values()) count += data.features.length;
  return { data: new Map(shown), at: shownAt, count };
}

// ── The group in the Layers panel ──

export interface HeardSource {
  id: HeardSourceId;
  label: string;
  /** How many marks it has to show; null while it is not known. */
  count: number | null;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Its own list or words, under the row. */
  below?: ReactNode;
}

/** The swatch of a source's hue, as the map draws it: the chart tokens, in the same order. */
const SWATCH: Record<HeardSourceId, string> = {
  mesh: "bg-chart-1",
  aprs: "bg-chart-2",
  adsb: "bg-chart-3",
  ais: "bg-chart-4",
};

function SourceRow({ source }: { source: HeardSource }) {
  const id = useId();
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn("size-3 shrink-0 rounded-full", SWATCH[source.id])} />
        <label htmlFor={id} className="min-w-0 flex-1 text-small font-medium text-ink">
          {source.label}
          {source.count !== null ? <span className="ml-1.5 font-normal text-ink-muted tabular">{source.count}</span> : null}
        </label>
        <Switch id={id} checked={source.on} onCheckedChange={source.onChange} />
      </div>
      {source.below ? <div className="mt-2">{source.below}</div> : null}
    </li>
  );
}

export function HeardGroup({ sources, footer }: { sources: HeardSource[]; footer?: ReactNode }) {
  if (sources.length === 0) return null;
  return (
    <section className="px-4 pt-3" aria-label="Heard on the radio">
      <h3 className="text-body font-semibold text-ink">Heard on the radio</h3>
      <ul className="mt-1 divide-y divide-border">
        {sources.map((source) => (
          <SourceRow key={source.id} source={source} />
        ))}
      </ul>
      <ul aria-label="How old a mark is" className="mt-1 grid gap-1 text-small text-ink-muted">
        {AGE_STEPS.map((step) => (
          <li key={step.words} className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-full bg-ink-muted" style={{ opacity: step.opacity }} />
            {step.words}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-small text-ink-muted">
        Each mark's label gives its age in words as well. Zoomed out, marks gather into counts for each source; your own stations, pinned,
        stay on top.
      </p>
      {footer}
    </section>
  );
}
