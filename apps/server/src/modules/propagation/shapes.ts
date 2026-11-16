/**
 * What a request about propagation may hold: the shapes the routes check a body
 * against, shared by single predictions, coverage maps and communication plans.
 */
import {
  ANTENNA_KINDS,
  type AntennaSpec,
  HF_MAX_MHZ,
  HF_MIN_MHZ,
  hasStatedLength,
  isHorizontalAntenna,
  type ModeId,
  type ModeLine,
  notModelledOn,
  type PredictionRequest,
  WIRE_MAX_M,
  WIRE_MIN_M,
} from "@outpost/shared";
import { z } from "zod";
import { badRequest } from "../../core/errors.ts";
import { modeLine } from "./service.ts";

export const site = z.object({
  name: z.string().max(60).default(""),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export const noise = z.enum(["city", "residential", "rural", "remote"]);
export const modes = z.enum(["ssb", "cw", "ft8", "js8", "digital"]);
export const power = z.number().min(0.1, "The engine works in tenths of a watt: give at least 0.1 W.").max(500_000);

const WIRE_LENGTH = `Give the length of the wire in metres, between ${WIRE_MIN_M} and ${WIRE_MAX_M}: the lengths that are a half-wave somewhere between ${HF_MIN_MHZ} and ${HF_MAX_MHZ} MHz.`;

export const antenna = z
  .object({
    kind: z.enum(ANTENNA_KINDS),
    heightM: z.number().min(0).max(200),
    ground: z.enum(["poor", "average", "good", "sea"]),
    broadsideDeg: z.number().min(0).max(360).nullable(),
    gainDb: z.number().min(-40).max(30),
    feedlineLossDb: z.number().min(0).max(40),
    lengthM: z.number().min(WIRE_MIN_M, WIRE_LENGTH).max(WIRE_MAX_M, WIRE_LENGTH).optional(),
  })
  .superRefine((value, issue) => {
    if (isHorizontalAntenna(value.kind) && value.heightM < 0.5)
      issue.addIssue({
        code: "custom",
        message: "Give the height of a horizontal antenna above the ground: at least 0.5 m.",
        path: ["heightM"],
      });
    if (hasStatedLength(value.kind) && value.lengthM === undefined) issue.addIssue({ code: "custom", message: WIRE_LENGTH, path: ["lengthM"] });
    // An antenna of any other kind has no length of its own (it follows the frequency), and one sent with it is a mistake, not a hint.
    if (!hasStatedLength(value.kind) && value.lengthM !== undefined)
      issue.addIssue({
        code: "custom",
        message: "Only an end-fed wire of a stated length has a wire length. Leave it out for this kind of antenna.",
        path: ["lengthM"],
      });
  });

/**
 * Refuses a question about one frequency when an antenna is a wire the engine's model
 * does not describe there. For a question that has only that one frequency to answer (a
 * coverage map); a prediction for a path answers for every band and says which it cannot.
 */
export function checkedModelled(request: { txAntenna: AntennaSpec; rxAntenna: AntennaSpec; frequencyMhz: number }): void {
  const why = notModelledOn(request.txAntenna, request.rxAntenna, request.frequencyMhz);
  if (why) throw badRequest(`No figure can be given on ${request.frequencyMhz} MHz. ${why}`, { reason: "antenna-not-modelled" });
}

export const isDate = (value: string) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD.")
  .refine(isDate, "That date does not exist.")
  .refine((value) => value >= "1950-01-01" && value <= "2100-12-31", "Give a date between 1950 and 2100.");

export const frequency = z
  .number()
  .min(HF_MIN_MHZ, `The engine covers ${HF_MIN_MHZ} to ${HF_MAX_MHZ} MHz. Give a frequency in that range.`)
  .max(HF_MAX_MHZ, `The engine covers ${HF_MIN_MHZ} to ${HF_MAX_MHZ} MHz. Give a frequency in that range.`);

export const prediction = z.object({
  tx: site,
  rx: site,
  date,
  powerWatts: power,
  txAntenna: antenna,
  rxAntenna: antenna,
  noise,
  frequencyMhz: frequency,
  mode: modes,
  requiredSnrDb: z.number().min(-60).max(99).optional(),
  referenceBandwidthHz: z.number().min(1).max(100_000).optional(),
  solar: z.discriminatedUnion("source", [
    z.object({ source: z.literal("table") }),
    z.object({ source: z.literal("manual"), ssn: z.number().min(0).max(300) }),
    z.object({ source: z.literal("fof2"), fof2Mhz: z.number().min(0.5).max(25), utcHour: z.number().int().min(1).max(24) }),
  ]),
  reply: z.object({ powerWatts: power, noise }).optional(),
});

/** The engine's card takes the requirement as a figure between -30 and 99.9 dB in 1 Hz. */
export function checkedMode(request: { mode: ModeId; requiredSnrDb?: number; referenceBandwidthHz?: number }): ModeLine {
  const line = modeLine(request.mode, request.requiredSnrDb, request.referenceBandwidthHz);
  if (line.requiredSnrDbHz !== null && (line.requiredSnrDbHz < -30 || line.requiredSnrDbHz > 99.9)) {
    throw badRequest(
      `That requirement is ${line.requiredSnrDbHz} dB in a 1 Hz bandwidth, which is outside what the engine takes (-30 to 99.9). Check the signal-to-noise ratio and its bandwidth.`,
    );
  }
  return line;
}

export function checked(body: unknown): PredictionRequest {
  const request = prediction.parse(body) as PredictionRequest;
  checkedMode(request);
  return request;
}
