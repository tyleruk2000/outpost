/**
 * The style specification's types, taken from MapLibre's own signatures: the package
 * that declares them is a dependency of MapLibre, not of this app.
 */
import type { MapOptions } from "maplibre-gl";

export type StyleSpecification = Exclude<NonNullable<MapOptions["style"]>, string>;
export type LayerSpecification = StyleSpecification["layers"][number];
export type SourceSpecification = StyleSpecification["sources"][string];
