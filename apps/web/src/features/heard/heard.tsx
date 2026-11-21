/**
 * "Heard on the radio": the one group in the map's Layers panel for everything a receiver
 * of the household has heard, kept apart from the reference layers (outpost-ywbh.10). Each
 * source (mesh radios now; APRS, aircraft and ships later) is one row with its switch and a
 * count, and may put its own list under it. Every mark fades with age in the steps stated
 * here, and its label always gives the age in words: opacity is never the only signal.
 *
 * A source joins by giving a `HeardSource` row and drawing its marks into `HEARD_SOURCE` with
 * `heardFeature`, so that every source reads the same on the map.
 */
import type { ReactNode } from "react";
import { useId } from "react";
import { Switch } from "@/components/ui/misc";
import type { MapTheme } from "@/features/maps/lib/style";
import { MAP_FONTS } from "@/features/maps/lib/style";
import type { LayerSpecification } from "@/features/maps/lib/style-types";
import type { FeatureCollection } from "@/features/maps/map/overlays";
import { timeAgo } from "@/lib/utils";

export const HEARD_SOURCE = "o-heard";

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
  input: { source: string; id: string; name: string; at: number; lat: number; lon: number },
  now = Date.now(),
): HeardFeature {
  return {
    type: "Feature",
    properties: {
      source: input.source,
      id: input.id,
      label: `${input.name}\n${timeAgo(input.at)}`,
      fade: ageOpacity(Math.max(0, now - input.at)),
    },
    geometry: { type: "Point", coordinates: [input.lon, input.lat] },
  };
}

/** Above the reference layers and under saved places: a ring in the primary colour, faded by age, with its name and age. */
export function heardLayers(theme: MapTheme): LayerSpecification[] {
  return [
    {
      id: "o-heard-point",
      type: "circle",
      source: HEARD_SOURCE,
      paint: {
        "circle-radius": 6,
        "circle-color": theme.primary,
        "circle-opacity": ["get", "fade"],
        "circle-stroke-color": theme.page,
        "circle-stroke-width": 2,
        "circle-stroke-opacity": ["get", "fade"],
      },
    },
    {
      id: "o-heard-label",
      type: "symbol",
      source: HEARD_SOURCE,
      layout: {
        "text-font": [MAP_FONTS.medium] as string[],
        "text-field": ["get", "label"],
        "text-size": 12,
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-allow-overlap": false,
      },
      paint: { "text-color": theme.ink, "text-halo-color": theme.page, "text-halo-width": 1.5 },
    },
  ];
}

export interface HeardSource {
  id: string;
  label: string;
  /** How many marks it has to show; null while it is not known. */
  count: number | null;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Its own list or words, under the row. */
  below?: ReactNode;
}

function SourceRow({ source }: { source: HeardSource }) {
  const id = useId();
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
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

export function HeardGroup({ sources }: { sources: HeardSource[] }) {
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
            <span aria-hidden className="size-3 shrink-0 rounded-full bg-primary" style={{ opacity: step.opacity }} />
            {step.words}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-small text-ink-muted">Each mark's label gives its age in words as well.</p>
    </section>
  );
}
