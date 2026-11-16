/**
 * What a request about propagation may hold: the shapes the routes check a body
 * against, shared by single predictions, coverage maps and communication plans.
 */
import { HF_MAX_MHZ, HF_MIN_MHZ, type ModeId, type ModeLine, type PredictionRequest } from "@outpost/shared";
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

export const antenna = z
  .object({
    kind: z.enum(["isotropic", "horizontal-dipole", "inverted-v", "end-fed-half-wave", "vertical-monopole"]),
    heightM: z.number().min(0).max(200),
    ground: z.enum(["poor", "average", "good", "sea"]),
    broadsideDeg: z.number().min(0).max(360).nullable(),
    gainDb: z.number().min(-40).max(30),
    feedlineLossDb: z.number().min(0).max(40),
  })
  .refine((value) => value.kind === "isotropic" || value.kind === "vertical-monopole" || value.heightM >= 0.5, {
    message: "Give the height of a horizontal antenna above the ground: at least 0.5 m.",
    path: ["heightM"],
  });

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
