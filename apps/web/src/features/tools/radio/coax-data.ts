/**
 * Published attenuation of a few common coaxial cables, as each maker's data sheet gives
 * it: [MHz, dB per 100 m]. Where a sheet gives dB per 100 ft only, the figure is
 * converted (× 3.2808) and said so. Read 2026-11-16. Other makers' cables sold under the
 * same type name (RG-58, RG-213) can differ; their own sheet is the one to use.
 */
import type { Source } from "../kit";
import type { AttenuationTable } from "./formulas";

export type CableId = "lmr400" | "lmr240" | "ecoflex10" | "belden8267" | "belden9258" | "belden8240";

export interface Cable {
  id: CableId;
  name: string;
  table: AttenuationTable;
  source: Source;
  note?: string;
}

const FEET_PER_100M = 3.280839895;
const fromPer100ft = (rows: ReadonlyArray<readonly [number, number]>): AttenuationTable =>
  rows.map(([mhz, db]) => [mhz, Math.round(db * FEET_PER_100M * 100) / 100] as const);

export const CABLES: readonly Cable[] = [
  {
    id: "lmr400",
    name: "LMR-400 (Times Microwave)",
    table: [
      [30, 2.2],
      [50, 2.9],
      [150, 5.0],
      [220, 6.1],
      [450, 8.9],
      [900, 12.8],
      [1500, 16.8],
      [1800, 18.6],
      [2000, 19.6],
      [2500, 22.2],
      [5800, 35.5],
      [8000, 42.7],
    ],
    source: {
      name: "Times Microwave Systems, LMR-400 data sheet (typical attenuation at 25 °C, VSWR 1.0)",
      url: "https://static.datasheets.com/doc/22568792-times-microwave-lmr-400-db-ds.pdf",
      read: "2026-11-16",
    },
    note: "The maker's own server refused the request; the sheet was read from a copy, and agrees with Fairview Microwave's LMR-400 sheet.",
  },
  {
    id: "lmr240",
    name: "LMR-240 (Times Microwave)",
    table: [
      [30, 4.4],
      [50, 5.7],
      [150, 9.9],
      [220, 12.0],
      [450, 17.3],
      [900, 24.8],
      [1500, 32.4],
      [1800, 35.6],
      [2000, 37.7],
      [2500, 42.4],
      [5800, 66.8],
    ],
    source: {
      name: "Times Microwave Systems, LMR-240 data sheet (typical attenuation at 25 °C), as hosted by Farnell",
      url: "https://www.farnell.com/datasheets/3980318.pdf",
      read: "2026-11-16",
    },
  },
  {
    id: "ecoflex10",
    name: "Ecoflex 10 (SSB-Electronic)",
    table: [
      [5, 0.76],
      [10, 1.14],
      [50, 2.66],
      [100, 3.8],
      [144, 4.66],
      [200, 5.51],
      [300, 6.94],
      [432, 8.46],
      [500, 9.12],
      [800, 11.88],
      [1000, 13.49],
      [1296, 15.68],
      [1500, 17.01],
      [1800, 18.91],
      [2000, 20.14],
      [2400, 22.42],
      [3000, 25.37],
      [4000, 29.55],
      [5000, 33.44],
      [6000, 37.05],
    ],
    source: {
      name: "SSB-Electronic, Ecoflex 10 data sheet (typical attenuation at 20 °C)",
      url: "https://www.ssb.de/media/6080_de.pdf",
      read: "2026-11-16",
    },
    note: "An older SSB sheet gives 14.2 dB at 1 GHz: figures change between revisions of a sheet.",
  },
  {
    id: "belden8267",
    name: "RG-213/U (Belden 8267)",
    table: fromPer100ft([
      [1, 0.27],
      [10, 0.55],
      [50, 1.3],
      [100, 1.9],
      [200, 2.7],
      [400, 4.1],
      [700, 6.5],
      [900, 7.6],
      [1000, 8.0],
      [4000, 21.5],
    ]),
    source: {
      name: "Belden, 8267 technical data, revision 0.281 (22 August 2019), nominal insertion loss in dB per 100 ft, converted",
      url: "https://bsai.com.mx/cdn/shop/files/8267_techdata.pdf",
      read: "2026-11-16",
    },
    note: "Given by Belden in dB per 100 ft and converted here; read from a copy, as Belden's own site refused the request.",
  },
  {
    id: "belden9258",
    name: "RG-8X (Belden 9258)",
    table: [
      [1, 0.98],
      [10, 2.95],
      [50, 6.89],
      [100, 10.17],
      [200, 14.76],
      [400, 21.65],
      [700, 29.86],
      [900, 35.11],
      [1000, 36.75],
    ],
    source: {
      name: "Belden, 9258 product data, revision 1 (20 September 2012), in dB per 100 m, as hosted by Farnell",
      url: "https://www.farnell.com/datasheets/1769869.pdf",
      read: "2026-11-16",
    },
  },
  {
    id: "belden8240",
    name: "RG-58A/U type (Belden 8240)",
    table: fromPer100ft([
      [1, 0.3],
      [10, 1.1],
      [50, 2.5],
      [100, 3.8],
      [200, 5.6],
      [400, 8.4],
      [700, 11.7],
      [900, 13.7],
      [1000, 14.5],
    ]),
    source: {
      name: "Belden, 8240 technical data, revision 0.291 (28 April 2020), in dB per 100 ft, converted",
      url: "https://media.e-sonic.com/productfiles/mf-bl/8240_techdata.pdf",
      read: "2026-11-16",
    },
    note: "Given by Belden in dB per 100 ft and converted here.",
  },
];
