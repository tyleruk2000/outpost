/** What each stored `kind` is called on screen. Kinds are the sources' own codes; these are their names. */
import { osmKindLabel } from "./adapters/osm-tags.ts";

const LABELS: Record<string, string> = {
  large_airport: "Large airport",
  medium_airport: "Medium airport",
  small_airport: "Small airport",
  heliport: "Heliport",
  seaplane_base: "Seaplane base",
  balloonport: "Balloon port",
  closed: "Closed airport",
  "wikidata:nuclear-power-plant": "Nuclear power station",
  "wikidata:research-reactor": "Research reactor",
  "ne:country": "Country",
  "ne:region": "Region",
  "ne:populated-place": "Populated place",
  "ne:capital": "Capital",
  "babs:meeting-point": "Emergency meeting point (official)",
  "ea:flood-zone-3": "Flood Zone 3 (Environment Agency)",
  "ea:flood-zone-2": "Flood Zone 2 (Environment Agency)",
};

export function kindLabel(kind: string): string {
  if (LABELS[kind]) return LABELS[kind];
  if (kind.includes("=")) return osmKindLabel(kind);
  if (kind.startsWith("ne:region:")) return kind.slice("ne:region:".length) || "Region";
  if (kind.startsWith("import:")) return kind.slice("import:".length);
  return kind || "Feature";
}
