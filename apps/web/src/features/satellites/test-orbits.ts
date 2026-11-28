/**
 * CelesTrak's published elements for three satellites, 22 November 2026, for tests: a
 * low polar orbit (FUNcube-1), the ISS, and a geostationary one (Es'hail 2).
 */
import type { SatelliteTransmitter } from "@outpost/shared";
import type { Orbit } from "./engine";

const omm = (noradId: number, name: string, id: string, epoch: string, values: Record<string, number>): Orbit => ({
  noradId,
  epoch: Date.parse(`${epoch}Z`),
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
  } as unknown as Extract<Orbit, { elements: unknown }>["elements"],
});

export const FUNCUBE = omm(39444, "FUNCUBE-1 (AO-73)", "2013-066AE", "2026-11-22T04:31:48.939168", {
  MEAN_MOTION: 15.11455703,
  ECCENTRICITY: 0.00357672,
  INCLINATION: 97.8472,
  RA_OF_ASC_NODE: 301.3416,
  ARG_OF_PERICENTER: 28.4133,
  MEAN_ANOMALY: 331.9037,
  REV_AT_EPOCH: 70351,
  BSTAR: 0.00033440855,
  MEAN_MOTION_DOT: 5.672e-5,
});

export const ISS_ORBIT = omm(25544, "ISS (ZARYA)", "1998-067A", "2026-11-22T04:07:11.627040", {
  MEAN_MOTION: 15.49546258,
  ECCENTRICITY: 0.00073933,
  INCLINATION: 51.6321,
  RA_OF_ASC_NODE: 238.2738,
  ARG_OF_PERICENTER: 52.3454,
  MEAN_ANOMALY: 307.8204,
  REV_AT_EPOCH: 59624,
  BSTAR: 0.00018757194,
  MEAN_MOTION_DOT: 0.00010101,
});

export const ESHAIL = omm(43700, "ES'HAIL 2", "2018-090A", "2026-11-22T07:29:56.831712", {
  MEAN_MOTION: 1.00271489,
  ECCENTRICITY: 0.0001953,
  INCLINATION: 0.0131,
  RA_OF_ASC_NODE: 6.2008,
  ARG_OF_PERICENTER: 270.5599,
  MEAN_ANOMALY: 282.8372,
  REV_AT_EPOCH: 2926,
  BSTAR: 0,
  MEAN_MOTION_DOT: 1.68e-6,
});

const tx = (index: number, patch: Partial<SatelliteTransmitter>): SatelliteTransmitter => ({
  id: `iss-${index}`,
  noradId: 25544,
  description: "Telemetry",
  alive: true,
  status: "active",
  type: "Transmitter",
  mode: "BPSK",
  uplinkLowHz: null,
  uplinkHighHz: null,
  downlinkLowHz: 437_800_000,
  downlinkHighHz: null,
  invert: false,
  baud: 1200,
  updatedAt: null,
  ...patch,
});

/**
 * Transmitters like the ISS's 41 in SatNOGS DB: two to work through, two to listen to, an uplink alone, and a long
 * tail of telemetry, six of them listed twice.
 */
export const ISS_LIKE: SatelliteTransmitter[] = [
  tx(1, { description: "Mode V/U FM - Voice", type: "Transceiver", mode: "FM", uplinkLowHz: 145_990_000, downlinkLowHz: 437_800_000 }),
  tx(2, {
    description: "APRS digipeater",
    type: "Transceiver",
    mode: "APRS (AFSK 1k2)",
    uplinkLowHz: 145_825_000,
    downlinkLowHz: 145_825_000,
  }),
  tx(3, { description: "SSTV", mode: "FM", downlinkLowHz: 145_800_000, baud: null }),
  tx(4, { description: "FM voice downlink", mode: "FM", downlinkLowHz: 145_800_000, baud: null }),
  tx(5, { description: "Uplink for school contacts", mode: "FM", uplinkLowHz: 144_490_000, downlinkLowHz: null }),
  ...Array.from({ length: 36 }, (_, index) =>
    tx(6 + index, {
      description: `Telemetry of docked craft ${(index % 30) + 1}`,
      downlinkLowHz: 2_200_000_000 + (index % 30) * 1_000_000,
    }),
  ),
];
