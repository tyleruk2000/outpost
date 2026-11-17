/**
 * Radio: frequencies to listen to, repeaters held near a place, and propagation
 * predictions already saved.
 *
 * Frequencies are the set bundled with Outpost, filtered by the shared rule the
 * Frequencies screen uses (`filterFrequencies`); a place becomes a country the way that
 * screen chooses one from the home place (`countryAt`). Repeaters come from the
 * Repeaters screen's own list (`ctx.services.repeaters.list`), which works out distance
 * and bearing. Saved predictions are read from where the HF propagation screen keeps
 * them; working one out is a job for the engine, and is never started here.
 */
import {
  bandById,
  bandName,
  entryChecked,
  FREQUENCY_BANDS,
  FREQUENCY_KINDS,
  type FrequencyKindId,
  filterFrequencies,
  formatAge,
  formatFrequency,
  formatMHz,
  formatShift,
  formatTone,
  kindLabel,
  modeLabel,
  modeName,
  type PredictionRequest,
  parseBand,
  placeName,
  placesIn,
  REPEATER_STATUS_NAMES,
  repeaterDataAge,
} from "@outpost/shared";
import { RADIO_FREQUENCIES } from "@outpost/shared/radio-frequencies-data";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { propagationSaved } from "../../db/schema.ts";
import { dayOf, defineTool, pageOf, type ToolDefinition } from "./types.ts";
import { homePlace, resolveNear, unknownPlace, type Where } from "./where.ts";

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Places the set names, by code and by name; "UK" is what most people call GB. */
function placeOf(ctx: AppContext, text: string): { code: string; how: string } | { unknown: true } {
  const places = placesIn(RADIO_FREQUENCIES);
  const upper = text.trim().toUpperCase();
  const code = upper === "UK" ? "GB" : upper;
  const byCode = places.find((place) => place.code.toUpperCase() === code);
  if (byCode) return { code: byCode.code, how: byCode.name };
  const byName = places.find((place) => fold(place.name) === fold(text));
  if (byName) return { code: byName.code, how: byName.name };
  const where = resolveNear(ctx, text);
  if (!where) return { unknown: true };
  return where.country ? { code: where.country, how: `${placeName(where.country)}, where ${where.name} is` } : { unknown: true };
}

export const radioFrequencies = defineTool({
  name: "radio_frequencies",
  title: "frequencies to listen to",
  area: "radio",
  description:
    "Radio frequencies to listen to from the set bundled with Outpost: emergency broadcasts, news, weather, time signals, distress, amateur and licence-free channels. Filter by kind, by near (a country or place) and by band.",
  input: z.object({
    kind: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("emergency, broadcasters, weather, time signals, distress, amateur, licence-free, bands, or words to look for."),
    near: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe('A country (GB, "United Kingdom") or a place. Default: the home place\'s country.'),
    band: z.string().trim().min(1).max(40).optional().describe("A band, e.g. HF, VHF, medium wave, 2 m."),
    page: z.number().int().min(1).max(50).optional().describe("Which page, from 1."),
  }),
  run({ kind, near, band, page }, { ctx }) {
    let kindId: FrequencyKindId | null = null;
    let text = "";
    if (kind) {
      const asked = fold(kind).replace(/[-_]/g, " ");
      const found = FREQUENCY_KINDS.find(
        (entry) =>
          entry.id.replace(/-/g, " ") === asked || fold(entry.label).includes(asked) || asked.includes(entry.id.replace(/-/g, " ")),
      );
      if (found) kindId = found.id;
      else text = kind;
    }
    let place: { code: string; how: string } | null = null;
    if (near) {
      const found = placeOf(ctx, near);
      if ("unknown" in found) return { held: false, text: unknownPlace(near), url: "/radio/frequencies" };
      place = found;
    } else {
      const home = homePlace(ctx);
      if (home?.country) place = { code: home.country, how: `${placeName(home.country)}, where the home place is` };
    }
    let bandId: string | null = null;
    if (band) {
      const asked = fold(band);
      const found =
        FREQUENCY_BANDS.find((entry) => entry.id === asked || fold(entry.name) === asked) ??
        FREQUENCY_BANDS.find((entry) => fold(entry.name).startsWith(asked) || fold(entry.name).includes(asked));
      if (!found) return { held: false, text: `"${band}" is not a band Outpost knows. Try HF, VHF, UHF, medium wave, long wave or 2 m.` };
      bandId = found.id;
    }
    const entries = filterFrequencies(RADIO_FREQUENCIES, { kind: kindId, place: place?.code ?? null, band: bandId, text });
    const asked = [
      kindId ? kindLabel(kindId) : null,
      text ? `"${text}"` : null,
      place ? `for ${place.how}` : null,
      bandId ? `on ${bandById(bandId)?.name}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const url = `/radio/frequencies${kindId || place ? `?${new URLSearchParams({ ...(kindId ? { kind: kindId } : {}), ...(place ? { place: place.code } : {}) })}` : ""}`;
    if (entries.length === 0) {
      return { held: false, url, text: `No frequency in the bundled set matches ${asked || "that"}. Ask with fewer filters.` };
    }
    const { shown, line } = pageOf(entries, page ?? 1, 8);
    const lines = shown.map((entry) => {
      const frequencies = entry.frequencies
        .slice(0, 4)
        .map((frequency) => `${frequency.channel ? `ch ${frequency.channel} ` : ""}${formatFrequency(frequency)}`)
        .join(", ");
      const more = entry.frequencies.length > 4 ? ` and ${entry.frequencies.length - 4} more` : "";
      const status =
        entry.status === "on-air"
          ? ""
          : ` (${entry.status === "closed" ? `closed${entry.closed ? ` ${entry.closed}` : ""}` : entry.status})`;
      return `- ${entry.name}${status}: ${frequencies}${more}, ${entry.modes.map(modeLabel).join("/")}${entry.hours ? `; ${entry.hours}` : ""}. Checked ${entryChecked(entry)} against ${entry.sources[0]?.publisher ?? "its source"}.`;
    });
    return {
      held: true,
      label: asked || "all kinds",
      url,
      text: [`Frequencies to listen to${asked ? ` (${asked})` : ""}, from the set bundled with Outpost:`, ...lines, line]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const repeatersNear = defineTool({
  name: "repeaters_near",
  title: "repeaters near a place",
  area: "radio",
  description:
    "Amateur radio repeaters held in Outpost's repeater lists near a place, nearest first, with frequency, shift, tone and distance. Give near, and band (2m, 70cm) to narrow.",
  input: z.object({
    near: z.string().trim().min(1).max(120).describe('A place name, a postcode, a locator, "home", or "lat,lon".'),
    band: z.string().trim().min(1).max(20).optional().describe("A band, e.g. 2m, 70cm."),
    page: z.number().int().min(1).max(20).optional().describe("Which page, from 1."),
  }),
  run({ near, band, page }, { ctx, now }) {
    const service = ctx.services.repeaters;
    const overview = service.overview();
    if (overview.total === 0) {
      return { held: false, url: "/radio/repeaters", text: "No repeater lists are held. Import or fetch one under Radio → Repeaters." };
    }
    const where: Where | null = resolveNear(ctx, near);
    if (!where) return { held: false, text: unknownPlace(near), url: "/radio/repeaters" };
    const bandId = band ? parseBand(band) : undefined;
    if (band && !bandId) return { held: false, text: `"${band}" is not a repeater band. Try 10m, 6m, 4m, 2m, 70cm or 23cm.` };
    const withinKm = 50;
    const size = 10;
    const at = page ?? 1;
    const found = service.list({ near: where, withinKm, band: bandId ?? undefined, limit: size, offset: (at - 1) * size });
    if (found.total === 0) {
      return {
        held: false,
        url: "/radio/repeaters",
        text: `No repeaters${bandId ? ` on ${bandName(bandId)}` : ""} are held within ${withinKm} km of ${where.name}. ${overview.total} are held elsewhere; more lists are added under Radio → Repeaters.`,
      };
    }
    const lists = new Map(overview.lists.map((list) => [list.id, list]));
    const used = new Set<string>();
    const lines = found.repeaters.map((repeater) => {
      const list = repeater.listId ? lists.get(repeater.listId) : undefined;
      if (list) used.add(`${list.name} (${list.source || "list"}, data ${formatAge(repeaterDataAge(list.dataDate, now).days)})`);
      const access = [
        repeater.ctcssHz !== null ? `tone ${formatTone(repeater.ctcssHz)}` : null,
        repeater.dcsCode ? `DCS ${repeater.dcsCode}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const km = repeater.distanceMeters !== undefined ? `${(repeater.distanceMeters / 1000).toFixed(1)} km` : "distance not known";
      const bearing = repeater.bearingDegrees !== undefined ? ` bearing ${Math.round(repeater.bearingDegrees)}°` : "";
      return `- ${repeater.callsign} ${formatMHz(repeater.outputHz)} MHz, shift ${formatShift(repeater.outputHz, repeater.inputHz)}${access ? `, ${access}` : ""}, ${repeater.modes.map(modeName).join("/") || "mode not listed"}, ${repeater.place || "place not listed"}: ${km}${bearing}. ${REPEATER_STATUS_NAMES[repeater.status]}.`;
    });
    const pages = Math.ceil(found.total / size);
    const more =
      at < pages
        ? `Showing ${(at - 1) * size + 1} to ${(at - 1) * size + found.repeaters.length} of ${found.total}. Ask again with page ${at + 1} for more.`
        : `${found.total} in all.`;
    return {
      held: true,
      label: [...used].join("; ") || "repeaters held",
      url: "/radio/repeaters",
      text: [
        `Repeaters within ${withinKm} km of ${where.name} (${where.how}), nearest first:`,
        ...lines,
        more,
        used.size > 0 ? `From: ${[...used].join("; ")}. Status is what the list said on its date.` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const savedPredictions = defineTool({
  name: "saved_predictions",
  title: "saved propagation predictions",
  area: "radio",
  description:
    "HF propagation predictions already saved under Radio → HF propagation: which path, date, frequency and mode. This tool never works out a new prediction.",
  input: z.object({
    page: z.number().int().min(1).max(20).optional().describe("Which page, from 1."),
  }),
  run({ page }, { ctx }) {
    const rows = ctx.db
      .select()
      .from(propagationSaved)
      .where(eq(propagationSaved.kind, "point"))
      .orderBy(desc(propagationSaved.updatedAt))
      .all();
    const howToMake = "A new prediction is worked out on the Radio screen under HF propagation, and saved there.";
    if (rows.length === 0) return { held: false, url: "/radio/propagation", text: `No propagation predictions are saved. ${howToMake}` };
    const { shown, line } = pageOf(rows, page ?? 1);
    const lines = shown.map((row) => {
      const request = row.request as unknown as PredictionRequest;
      const kept = row.resultKey ? ctx.services.propagation.internals.has(row.resultKey) : false;
      return `- ${row.name}: ${request.tx?.name || "transmitter"} to ${request.rx?.name || "receiver"}, ${request.date}, ${request.frequencyMhz} MHz ${request.mode}, ${request.powerWatts} W. Saved ${dayOf(row.createdAt)}.${kept ? "" : " Its figures are no longer kept; opening it works them out again."}`;
    });
    return {
      held: true,
      label: `${rows.length} saved`,
      url: "/radio/propagation",
      text: ["Saved HF propagation predictions:", ...lines, line, `Open one on the Radio screen to see its hours and bands. ${howToMake}`]
        .filter(Boolean)
        .join("\n"),
    };
  },
});

export const RADIO_TOOLS: ToolDefinition[] = [radioFrequencies, repeatersNear, savedPredictions];
