/**
 * The places of the binder's page of home and meeting points, numbered as the map
 * (binder-map.ts) and the list under it number them.
 */
import { homePlaceOf } from "@outpost/shared";
import { readableOf } from "@/features/emergency-plans/printable";
import type { BinderSources } from "./binder";

/** One place on the page: home, or a plan's meeting point that is a saved place on the map. */
export interface BinderPlace {
  /** Its number on the map and in the list. */
  number: number;
  role: string;
  name: string;
  lat: number;
  lon: number;
  note: string;
}

/** A plan's place that is only described, with no saved place behind it: listed, but not on the map. */
export interface DescribedPlace {
  role: string;
  name: string;
  note: string;
}

/** Home first, then each plan's places once each, in the plans' order. */
export function binderPlaces(sources: Pick<BinderSources, "markers" | "plans">): { mapped: BinderPlace[]; described: DescribedPlace[] } {
  const mapped: BinderPlace[] = [];
  const described: DescribedPlace[] = [];
  const home = homePlaceOf(sources.markers);
  if (home) mapped.push({ number: 1, role: "Home", name: home.name || "Home", lat: home.lat, lon: home.lon, note: "" });
  const seen = new Set<string>();
  for (const data of sources.plans) {
    for (const place of readableOf(data.plan, data.resolved).places) {
      const key = `${place.name}|${place.coords}`;
      if (seen.has(key) || place.missing) continue;
      seen.add(key);
      const marker = data.plan.body.places.find((each) => each.name === place.name)?.markerId;
      const now = marker ? data.resolved.places[marker] : null;
      if (now) mapped.push({ number: mapped.length + 1, role: place.role, name: place.name, lat: now.lat, lon: now.lon, note: place.note });
      else described.push({ role: place.role, name: place.name, note: place.note });
    }
  }
  return { mapped, described };
}
