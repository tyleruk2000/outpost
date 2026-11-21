/**
 * The kinds of land a settlement can be founded in, and what each one means.
 *
 * Each land is drawn from a real place, and its sun, wind and cold are that place's,
 * from the European Commission's PVGIS (PVGIS © European Communities, 2001-2026), read
 * once on 21 November 2026 with its API v5.3 and kept here as numbers:
 *
 * - `solarKwhPerKwp`: PVcalc's E_d, the average energy a day from 1 kWp of crystalline
 *   silicon panels at the optimal fixed slope, with the 14% system loss Tools → Power
 *   takes from PVWatts (14.08% there), for each month.
 * - `daylightHours`, `meanC`, `windMs`: from PVGIS's typical meteorological year for the
 *   place (hourly; ERA5 for temperature and wind, 10 m above the ground): the hours a day
 *   with any sun on the ground, the mean air temperature and the mean wind speed.
 * - `turbineKwh`: the energy a day of a Bergey Excel 10 (ICC-SWCC certified power curve,
 *   summary report SWCC-10-12) with its hub at 10 m, where PVGIS gives the wind, worked
 *   out hour by hour over that typical year. A real tower is taller and windier, so this
 *   is an underestimate.
 * - `heatingDegreeDays` (base 15.5 °C) and `growingDegreeDays` (base 5 °C): summed over
 *   the same typical year.
 *
 * What the game does with those (how heat need, harvests and water follow from them, and
 * what grows on each land's map) is the game's own rule, and says so where it is shown.
 */

export const LAND_IDS = ["valley", "mountains", "snow", "desert", "coast", "forest"] as const;
export type LandId = (typeof LAND_IDS)[number];

export interface Land {
  name: string;
  /** One sentence: what it is like to settle. */
  about: string;
  /** The real place its sun, wind and cold come from. */
  place: string;
  latitude: number;
  longitude: number;
  /** What the open buildable ground is called there. */
  ground: string;
  solarKwhPerKwp: readonly number[];
  daylightHours: readonly number[];
  meanC: readonly number[];
  windMs: readonly number[];
  turbineKwh: readonly number[];
  heatingDegreeDays: number;
  growingDegreeDays: number;
  /** Litres a well draws in a day (made up for the game; less where the ground is dry). */
  wellLitres: number;
  /** Fields must stand within this many squares of water, or null for anywhere (the game's rule for dry land). */
  fieldsNearWater: number | null;
  /** Extra bricks a house needs, for thicker walls in the cold (made up for the game). */
  houseExtraBricks: number;
  /** How the map is drawn up: shares and thresholds for the generator. */
  map: LandMap;
}

export interface LandMap {
  /** Elevation above which the ground is fell (unbuildable hill). */
  hill: number;
  /** Moisture above which there are woods. */
  woods: number;
  /** Elevation below which there is a lake. */
  lake: number;
  /** The share of the map's west that is sea, 0 for none. */
  sea: number;
  /** Whether a river runs from north to south. */
  river: boolean;
  /** Thresholds (0 to 1) for deposits: higher is rarer; 1 for none. */
  rock: number;
  clay: number;
  coal: number;
  ore: number;
}

/** Ashgill's land: the temperate river valley every heat, harvest and water figure is measured against. */
const VALLEY_HDD = 2925;
const VALLEY_GDD = 1447;

export const LANDS: Record<LandId, Land> = {
  valley: {
    name: "River valley",
    about: "Temperate and green, with a river, woods, rock and clay banks. No ore: it comes by barge.",
    place: "Keswick, Cumbria, England",
    latitude: 54.6,
    longitude: -3.13,
    ground: "meadow",
    solarKwhPerKwp: [0.67, 1.35, 2.15, 3.37, 3.61, 3.47, 3.33, 2.84, 2.34, 1.38, 0.87, 0.54],
    daylightHours: [7.3, 9.0, 11.4, 13.5, 15.3, 17.0, 16.1, 14.2, 12.3, 10.0, 7.9, 7.0],
    meanC: [0.8, 0.7, 3.9, 8.3, 8.7, 12.6, 14.4, 13.3, 13.4, 7.3, 6.3, 1.8],
    windMs: [3.16, 3.44, 4.19, 2.97, 2.76, 2.39, 3.23, 3.18, 3.36, 4.47, 4.83, 3.06],
    turbineKwh: [8.8, 10.7, 22.3, 6.8, 7.0, 4.1, 8.6, 8.1, 10.9, 24.8, 28.6, 12.0],
    heatingDegreeDays: VALLEY_HDD,
    growingDegreeDays: VALLEY_GDD,
    wellLitres: 1_000,
    fieldsNearWater: null,
    houseExtraBricks: 0,
    map: { hill: 0.74, woods: 0.6, lake: 0.12, sea: 0, river: true, rock: 0.78, clay: 0.55, coal: 0.86, ore: 1 },
  },
  mountains: {
    name: "Mountains",
    about: "A high valley among fells: strong winter sun, deep cold, almost no wind, and rock, coal and ore close by. Grain grows slowly.",
    place: "Davos, Graubünden, Switzerland (1,551 m)",
    latitude: 46.8,
    longitude: 9.84,
    ground: "alpine meadow",
    solarKwhPerKwp: [0.74, 3.0, 4.52, 5.01, 4.35, 4.25, 4.11, 3.9, 3.66, 3.3, 1.37, 0.49],
    daylightHours: [8.3, 9.8, 11.4, 12.9, 14.8, 14.9, 14.9, 13.5, 12.2, 10.6, 9.0, 8.3],
    meanC: [-10.6, -10.6, -3.1, 0.0, 3.1, 5.5, 8.0, 9.1, 7.9, 3.1, -6.6, -12.6],
    windMs: [0.72, 0.88, 0.9, 0.85, 1.07, 1.15, 0.89, 0.93, 0.9, 1.05, 0.77, 0.82],
    turbineKwh: [0, 0, 0, 0, 0.1, 0.1, 0, 0, 0, 0, 0, 0],
    heatingDegreeDays: 5851,
    growingDegreeDays: 453,
    wellLitres: 1_000,
    fieldsNearWater: null,
    houseExtraBricks: 8,
    map: { hill: 0.56, woods: 0.62, lake: 0.08, sea: 0, river: true, rock: 0.71, clay: 0.75, coal: 0.78, ore: 0.8 },
  },
  snow: {
    name: "Snow and tundra",
    about: "Far north among lakes: midnight sun in summer, none in December, a long hard cold, few trees, and ore in the rock.",
    place: "Kiruna, Lapland, Sweden",
    latitude: 67.86,
    longitude: 20.23,
    ground: "tundra",
    solarKwhPerKwp: [0.08, 1.24, 3.37, 4.44, 4.44, 3.96, 3.49, 2.96, 2.2, 1.32, 0.22, 0],
    daylightHours: [2.5, 7.4, 11.5, 15.5, 19.7, 24.0, 21.8, 16.9, 12.9, 8.9, 4.3, 0.1],
    meanC: [-14.4, -9.9, -6.6, -1.7, 4.3, 7.7, 14.2, 12.6, 6.5, -0.7, -5.2, -13.3],
    windMs: [1.91, 2.36, 2.67, 1.71, 2.08, 2.79, 1.85, 1.7, 2.31, 2.4, 1.94, 2.07],
    turbineKwh: [2.0, 2.4, 3.7, 0.7, 1.5, 5.4, 1.3, 0.7, 2.5, 3.5, 0.7, 1.5],
    heatingDegreeDays: 5882,
    growingDegreeDays: 759,
    wellLitres: 1_000,
    fieldsNearWater: null,
    houseExtraBricks: 10,
    map: { hill: 0.72, woods: 0.72, lake: 0.24, sea: 0, river: false, rock: 0.78, clay: 0.8, coal: 1, ore: 0.78 },
  },
  desert: {
    name: "Desert",
    about: "Sun every month and little cold, but dry: wells draw less, fields need water beside them, and trees grow only by the river.",
    place: "Ouarzazate, Morocco",
    latitude: 30.93,
    longitude: -6.91,
    ground: "sand",
    solarKwhPerKwp: [5.25, 5.43, 5.67, 5.65, 5.26, 5.08, 4.84, 4.84, 5.0, 5.0, 4.97, 5.03],
    daylightHours: [10.0, 10.3, 12.0, 12.4, 13.2, 14.0, 14.0, 12.8, 11.8, 11.0, 10.6, 10.0],
    meanC: [9.0, 11.3, 13.7, 14.7, 22.8, 25.2, 29.5, 28.1, 22.2, 20.1, 12.5, 8.4],
    windMs: [2.16, 1.98, 2.45, 3.34, 3.07, 2.39, 2.61, 2.42, 2.53, 2.1, 1.82, 1.45],
    turbineKwh: [6.6, 3.8, 5.3, 13.1, 11.1, 3.9, 7.3, 5.7, 7.4, 4.2, 2.2, 1.1],
    heatingDegreeDays: 937,
    growingDegreeDays: 4862,
    wellLitres: 400,
    fieldsNearWater: 2,
    houseExtraBricks: 0,
    map: { hill: 0.7, woods: 2, lake: 0, sea: 0, river: true, rock: 0.73, clay: 0.6, coal: 1, ore: 0.72 },
  },
  coast: {
    name: "Coast",
    about: "An Atlantic shore: mild, wet and very windy, with the sea along the west, good fields and clay, and little rock.",
    place: "Belmullet, County Mayo, Ireland",
    latitude: 54.23,
    longitude: -9.99,
    ground: "machair",
    solarKwhPerKwp: [0.92, 1.74, 2.68, 3.76, 4.13, 3.92, 3.53, 3.41, 2.65, 1.92, 1.13, 0.74],
    daylightHours: [7.3, 9.1, 11.3, 13.5, 14.0, 16.0, 16.0, 14.2, 12.3, 10.0, 8.0, 6.1],
    meanC: [6.4, 6.1, 5.6, 7.7, 13.0, 13.9, 15.7, 13.5, 13.7, 11.4, 8.7, 7.6],
    windMs: [9.58, 8.43, 6.12, 6.1, 4.88, 4.79, 3.55, 4.74, 5.49, 5.19, 8.06, 8.22],
    turbineKwh: [154.7, 123.1, 59.1, 58.8, 29.4, 29.3, 10.9, 30.3, 48.4, 42.6, 112.8, 111.9],
    heatingDegreeDays: 1951,
    growingDegreeDays: 1981,
    wellLitres: 1_000,
    fieldsNearWater: null,
    houseExtraBricks: 0,
    map: { hill: 0.8, woods: 0.66, lake: 0.06, sea: 0.22, river: true, rock: 0.86, clay: 0.48, coal: 0.9, ore: 1 },
  },
  forest: {
    name: "Forest",
    about: "Deep woods on rolling hills: timber everywhere, warm summers, cold winters, sheltered from the wind, and some ore.",
    place: "Freudenstadt, Black Forest, Germany",
    latitude: 48.46,
    longitude: 8.41,
    ground: "clearing",
    solarKwhPerKwp: [1.43, 2.34, 3.28, 3.9, 3.9, 4.22, 4.18, 3.94, 3.61, 2.64, 1.73, 1.38],
    daylightHours: [8.0, 9.8, 11.4, 13.2, 13.3, 15.6, 15.0, 13.6, 12.1, 10.4, 9.0, 8.0],
    meanC: [-1.2, -4.0, 2.4, 11.1, 13.8, 16.4, 16.9, 17.2, 13.1, 8.4, 6.2, 1.6],
    windMs: [2.53, 2.32, 2.35, 2.11, 2.13, 1.89, 2.22, 1.54, 2.14, 2.14, 2.73, 2.39],
    turbineKwh: [4.8, 3.4, 2.7, 2.7, 1.8, 1.2, 2.6, 0.4, 2.9, 3.1, 7.6, 4.3],
    heatingDegreeDays: 2848,
    growingDegreeDays: 2058,
    wellLitres: 1_000,
    fieldsNearWater: null,
    houseExtraBricks: 4,
    map: { hill: 0.78, woods: 0.42, lake: 0.08, sea: 0, river: true, rock: 0.84, clay: 0.62, coal: 1, ore: 0.84 },
  },
};

/**
 * How much of a household's heat follows the cold (the game's rule): two thirds of it
 * goes up and down with the heating degree days against Ashgill's; the other third,
 * for hot water and cooking, is the same everywhere.
 */
export const heatFactor = (land: LandId) => 1 / 3 + (2 / 3) * (LANDS[land].heatingDegreeDays / VALLEY_HDD);

/** A field's harvest against Ashgill's (the game's rule): with the growing degree days, from a quarter to one and a half. */
export const harvestFactor = (land: LandId) => Math.min(1.5, Math.max(0.25, LANDS[land].growingDegreeDays / VALLEY_GDD));

export const LAND_SOURCES = [
  {
    what: "Sun, wind and cold",
    says: "Each land's sun, wind and temperatures are a real place's: monthly solar output from PVGIS's PVcalc (optimal slope, 14% losses) and the hourly typical meteorological year (ERA5).",
    from: "European Commission Joint Research Centre, PVGIS API v5.3 (PVGIS © European Communities, 2001-2026), read 21 Nov 2026",
  },
  {
    what: "Wind turbine",
    says: "A Bergey Excel 10: 8.9 kW at 11 m/s, up to 12.6 kW, cut in at 2.5 m/s, 7 m rotor; its power curve worked out against each hour of the typical year with the hub at 10 m.",
    from: "ICC-SWCC, Summary Report SWCC-10-12 (2022); Bergey Excel 10 specification sheet",
  },
  {
    what: "Batteries",
    says: "Lead acid 2.0 V a cell, 80% round trip, 50% usable; LiFePO4 3.2 V a cell, 92% round trip, 80% usable. Each way counts the square root of the round trip.",
    from: "The figures Tools → Power uses: Battery University BU-201, BU-216, BU-303; Victron Energy data sheets; HOMER Pro manual",
  },
  {
    what: "Generator",
    says: "Fuel use is a straight line: a no-load part for its size plus a part for each kWh, scaled from HOMER's worked example (50 kW: 1.655 L/h at no load, 15.3 L/h at full load).",
    from: "UL Solutions, HOMER Pro manual, Generator fuel curve intercept coefficient (as Tools → Power)",
  },
] as const;
