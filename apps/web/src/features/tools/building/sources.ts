import type { Source } from "../kit";

/** Where the building calculators' figures come from. Read 2026-11-16. */
export const BUILDING_SOURCES = {
  geometry: { name: "Geometry: no published constant is used" },
  ffd: { name: "First fit decreasing, a standard method for packing lengths into bins; no published constant is used" },
  hanson: {
    name: "Hanson (Heidelberg Materials UK), General Purpose Cement technical data sheet (February 2020): mixes by volume, mortar designations, 25 kg bags",
    url: "https://www.packedproducts.heidelbergmaterials.co.uk/sites/default/files/assets/document/6a/98/technical-data-sheet-general-purpose-cement_0.pdf",
    read: "2026-11-16",
  },
  iso6946: {
    name: "BS EN ISO 6946, as set out in BRE BR 443, Conventions for U-value calculations (2019 edition): U = 1 / Rtot, and the surface resistances",
    url: "https://www.cibse.org/media/wzrjrf3l/conventions-for-u-value-calculations.pdf",
    read: "2026-11-16",
  },
  heatLoss: { name: "Heat flow through an element: U-value × area × temperature difference, which follows from the U-value's unit, W/m²K" },
  adl: {
    name: "Approved Document L, volume 1: dwellings (2021 edition incorporating 2023 amendments), tables 4.1 to 4.3",
    url: "https://www.gov.uk/government/publications/conservation-of-fuel-and-power-approved-document-l",
    read: "2026-11-16",
  },
  rdsap: {
    name: "BRE, RdSAP 10 Specification (version 3.0, 9 June 2025), tables 6, 13 and 24",
    url: "https://bregroup.com/documents/d/bre-group/rdsap-10-specification-10-06-2025",
    read: "2026-11-16",
  },
  knauf: {
    name: "Knauf Insulation, Loft Roll 40 and 44 data sheet",
    url: "https://pim.knaufinsulation.com/files/download/kine1508dat_loft_roll_40_and_44-datasheet.pdf",
    read: "2026-11-16",
  },
  kingspan: {
    name: "Kingspan, Thermawall TW50 brochure (15th issue, April 2026)",
    url: "https://www.kingspan.com/content/dam/kingspan/kil/products/thermawall-tw50-gb-and-ireland/kingspan-thermawall-tw50-brochure-en-ie.pdf",
    read: "2026-11-16",
  },
} satisfies Record<string, Source>;

/**
 * U-values, in W/m²K, published by a UK body, to fill in rather than type. The limiting
 * values are the most a new element may have under Approved Document L; the RdSAP values
 * are what an energy assessment assumes for an existing home when nothing is measured.
 */
export const TYPICAL_U_VALUES = [
  {
    id: "adl-wall-new",
    name: "Wall, new dwelling (limit)",
    value: 0.26,
    source: "Approved Document L, table 4.1",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "adl-roof-new",
    name: "Roof, new dwelling (limit)",
    value: 0.16,
    source: "Approved Document L, table 4.1",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "adl-floor-new",
    name: "Floor, new dwelling (limit)",
    value: 0.18,
    source: "Approved Document L, table 4.1",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "adl-window-new",
    name: "Window, new dwelling (limit)",
    value: 1.6,
    source: "Approved Document L, table 4.1",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "adl-wall-ext",
    name: "New wall in an existing home (limit)",
    value: 0.18,
    source: "Approved Document L, table 4.2",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "adl-window-ext",
    name: "New window in an existing home (limit)",
    value: 1.4,
    source: "Approved Document L, table 4.2",
    sourceRef: BUILDING_SOURCES.adl,
  },
  {
    id: "rdsap-cavity",
    name: "Cavity wall as built, before 1976 (England)",
    value: 1.5,
    source: "RdSAP 10, table 6, age bands A to E",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
  {
    id: "rdsap-solid-thin",
    name: "Solid brick wall up to 200 mm",
    value: 2.5,
    source: "RdSAP 10, table 13",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
  {
    id: "rdsap-solid-mid",
    name: "Solid brick wall 200 to 280 mm",
    value: 1.7,
    source: "RdSAP 10, table 13",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
  {
    id: "rdsap-single",
    name: "Single glazing, wood or PVC frame",
    value: 4.8,
    source: "RdSAP 10, table 24",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
  {
    id: "rdsap-double-old",
    name: "Double glazing before 2002, 12 mm gap",
    value: 2.8,
    source: "RdSAP 10, table 24",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
  {
    id: "rdsap-double-2002",
    name: "Double or triple glazing from 2002",
    value: 2.0,
    source: "RdSAP 10, table 24",
    sourceRef: BUILDING_SOURCES.rdsap,
  },
] as const;

/** Thermal conductivities a maker or BR 443 publishes, for the layers of a build-up. */
export const TYPICAL_CONDUCTIVITY = [
  { name: "Glass mineral wool loft roll", value: "0.040 to 0.044", source: "Knauf Loft Roll 40 and 44" },
  { name: "PIR insulation board", value: "0.022", source: "Kingspan Thermawall TW50" },
  { name: "Softwood, plywood, OSB", value: "0.13", source: "BR 443" },
] as const;
