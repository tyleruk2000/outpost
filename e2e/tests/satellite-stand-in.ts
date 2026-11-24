/**
 * The Satellites screen's answer stood in for in the page: three satellites with CelesTrak's
 * elements of 22 November 2026 (FUNcube-1, the ISS and the geostationary Es'hail 2) and
 * FUNcube-1's three transmitters from SatNOGS DB. Nothing is fetched from either.
 */
import type { Page } from "@playwright/test";

const omm = (noradId: number, name: string, id: string, epoch: string, values: Record<string, number>) => ({
  noradId,
  name,
  designator: id,
  epoch: Date.parse(`${epoch}Z`),
  groups: ["amateur"],
  elements: {
    OBJECT_NAME: name,
    OBJECT_ID: id,
    EPOCH: epoch,
    CLASSIFICATION_TYPE: "U",
    EPHEMERIS_TYPE: 0,
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: 999,
    MEAN_MOTION_DDOT: 0,
    ...values,
  },
});

export const SATELLITES = [
  omm(39444, "FUNCUBE-1 (AO-73)", "2013-066AE", "2026-11-22T04:31:48.939168", {
    MEAN_MOTION: 15.11455703,
    ECCENTRICITY: 0.00357672,
    INCLINATION: 97.8472,
    RA_OF_ASC_NODE: 301.3416,
    ARG_OF_PERICENTER: 28.4133,
    MEAN_ANOMALY: 331.9037,
    REV_AT_EPOCH: 70351,
    BSTAR: 0.00033440855,
    MEAN_MOTION_DOT: 5.672e-5,
  }),
  omm(25544, "ISS (ZARYA)", "1998-067A", "2026-11-22T04:07:11.627040", {
    MEAN_MOTION: 15.49546258,
    ECCENTRICITY: 0.00073933,
    INCLINATION: 51.6321,
    RA_OF_ASC_NODE: 238.2738,
    ARG_OF_PERICENTER: 52.3454,
    MEAN_ANOMALY: 307.8204,
    REV_AT_EPOCH: 59624,
    BSTAR: 0.00018757194,
    MEAN_MOTION_DOT: 0.00010101,
  }),
  omm(43700, "ES'HAIL 2", "2018-090A", "2026-11-22T07:29:56.831712", {
    MEAN_MOTION: 1.00271489,
    ECCENTRICITY: 0.0001953,
    INCLINATION: 0.0131,
    RA_OF_ASC_NODE: 6.2008,
    ARG_OF_PERICENTER: 270.5599,
    MEAN_ANOMALY: 282.8372,
    REV_AT_EPOCH: 2926,
    BSTAR: 0,
    MEAN_MOTION_DOT: 1.68e-6,
  }),
];

const transmitter = (
  id: string,
  description: string,
  type: string,
  mode: string,
  down: number,
  up: number | null,
  high: number | null,
) => ({
  id,
  noradId: 39444,
  description,
  alive: true,
  status: "active",
  type,
  mode,
  uplinkLowHz: up,
  uplinkHighHz: up && high ? up + 20_000 : null,
  downlinkLowHz: down,
  downlinkHighHz: high,
  invert: type === "Transponder",
  baud: null,
  updatedAt: null,
});

export const TRANSMITTERS = [
  transmitter("b", "CW Beacon", "Transmitter", "CW", 145_815_000, null, null),
  transmitter("t", "Mode U/V Linear", "Transponder", "USB", 145_950_000, 435_130_000, 145_970_000),
  transmitter("p", "BPSK Telemetry", "Transmitter", "BPSK", 145_935_000, null, null),
];

export async function standInSatellites(page: Page): Promise<void> {
  const now = Date.now();
  const source = (id: string, label: string) => ({ id, label, url: "", fetchedAt: now, count: 3, error: null, triedAt: now });
  await page.route("**/api/satellites", (route) =>
    route.fulfill({
      json: {
        satellites: SATELLITES,
        transmitters: TRANSMITTERS,
        about: [],
        wikipedia: [],
        sources: [source("celestrak", "CelesTrak"), source("satnogs", "SatNOGS DB"), source("satnogs-satellites", "SatNOGS DB satellites")],
        fetching: false,
        now,
      },
    }),
  );
}

/** Seen from London, typed in. */
export const LONDON = "51.5074, -0.1278";
