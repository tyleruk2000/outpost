/**
 * The offline drill: what this household has actually kept, against what Outpost
 * promises for a day with no internet. Each line reads only what Outpost holds (the
 * modules that own each thing answer); nothing is fetched. The drill itself, a list of
 * steps followed with the internet off, is ticked on a phone and its result kept here.
 *
 * Overlaps the status screen (modules/device), which is about the machine; this is about
 * the household's content. The backup line is the status screen's own rule.
 *
 * Home is the current household's (`households.home()`): its saved place, or where a
 * portable household last said it was, with how long ago that was.
 */
import {
  DRILL_STEPS,
  type DrillLine,
  type DrillRun,
  type DrillRunInput,
  type HouseholdDto,
  type HouseholdHome,
  homeAgeMs,
  localDay,
  pastUseBy,
} from "@outpost/shared";
import { count, desc, eq, max } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { AppContext } from "../../core/context.ts";
import { badRequest } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { heardReceivers, heardReports, offlineDrills } from "../../db/schema.ts";
import { lastDownloadedBackup } from "../backup/index.ts";
import { cleanBody, cleanName } from "../board/service.ts";
import { backupCheck } from "../device/status.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

const contains = (bounds: [number, number, number, number], lat: number, lon: number) =>
  lon >= bounds[0] && lon <= bounds[2] && lat >= bounds[1] && lat <= bounds[3];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

export interface OfflineDrillService {
  lines(request: FastifyRequest): Promise<DrillLine[]>;
  lastRun(): DrillRun | null;
  record(input: DrillRunInput): DrillRun;
  count(): number;
  eraseAll(): number;
}

/** Runs one line's reading; a module that cannot answer gives a line that says so rather than failing the page. */
function safely(id: string, title: string, read: () => DrillLine): DrillLine {
  try {
    return read();
  } catch {
    return { id, title, state: "untried", summary: "Outpost could not read this just now. Try again in a moment.", link: null };
  }
}

export function createOfflineDrillService(ctx: AppContext, changed: () => void): OfflineDrillService {
  const { db } = ctx;
  const runDto = (row: typeof offlineDrills.$inferSelect): DrillRun => ({
    id: row.id,
    by: row.by,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    answers: row.answers,
    notes: row.notes,
  });

  return {
    async lines(request) {
      const now = Date.now();
      const s = ctx.services;
      const { household, several } = (() => {
        try {
          return { household: s.households.current() as HouseholdDto | null, several: s.households.list().length > 1 };
        } catch {
          return { household: null, several: false };
        }
      })();
      const home: HouseholdHome | null = household?.home ?? null;
      const overview = (() => {
        try {
          return s.maps.overview();
        } catch {
          return null;
        }
      })();
      const lines: DrillLine[] = [];

      lines.push(safely("home", "Home on the map", () => homeLine(household, home, several, now)));

      for (const [id, type, title, what] of [
        ["map", "vector", "A map of home", "map"],
        ["terrain", "terrain", "Terrain for home", "terrain"],
      ] as const) {
        lines.push(
          safely(id, title, () => {
            const regions = (overview?.regions ?? []).filter((region) => region.tileType === type);
            const link = { to: "/maps?tab=offline", label: "Maps, Offline maps" };
            const covering = home ? regions.filter((region) => contains(region.bounds, home.lat, home.lon)) : regions;
            if (covering.length === 0)
              return {
                id,
                title,
                state: "missing",
                summary: home
                  ? `No ${what} that is installed covers ${home.name}.${regions.length > 0 ? ` ${plural(regions.length, "region")} of ${what} cover${regions.length === 1 ? "s" : ""} elsewhere.` : ""}`
                  : `No ${what} is installed.`,
                link,
              };
            const ready = covering.filter((region) => region.status === "installed" && region.available);
            if (ready.length === 0)
              return {
                id,
                title,
                state: "stale",
                summary: `${covering[0]!.name} covers it, but is not readable now: its drive is not connected or the file is damaged.`,
                link: { to: "/storage", label: "Storage" },
              };
            return {
              id,
              title,
              state: "held",
              summary: `${ready.map((region) => region.name).join(", ")}${home ? ` covers ${home.name}` : ""}.`,
              link,
            };
          }),
        );
      }

      lines.push(
        safely("places", "Place names", () => {
          const places = overview?.places ?? [];
          return places.length > 0
            ? {
                id: "places",
                title: "Place names",
                state: "held",
                summary: `${places.map((set) => set.name).join(", ")}: ${plural(
                  places.reduce((sum, set) => sum + set.count, 0),
                  "name",
                )} to search the map by.`,
                link: { to: "/maps?tab=offline", label: "Maps, Offline maps" },
              }
            : {
                id: "places",
                title: "Place names",
                state: "missing",
                summary: "No place names are installed: the map can be searched only by your own saved places.",
                link: { to: "/maps?tab=offline", label: "Maps, Offline maps" },
              };
        }),
      );

      lines.push(
        safely("plan", "An emergency plan", () => {
          const plans = s.emergencyPlans.list();
          const link = { to: "/prepare/plans", label: "Emergency plans" };
          if (plans.length === 0)
            return { id: "plan", title: "An emergency plan", state: "missing", summary: "No emergency plan has been made.", link };
          const due = plans.filter((plan) => plan.reviewEveryDays !== null && plan.reviewedAt + plan.reviewEveryDays * DAY_MS < now);
          return due.length > 0
            ? {
                id: "plan",
                title: "An emergency plan",
                state: "stale",
                summary: `${plural(plans.length, "plan")}; ${due.map((plan) => plan.name).join(", ")} ${due.length === 1 ? "is" : "are"} due to be read through again.`,
                link,
              }
            : {
                id: "plan",
                title: "An emergency plan",
                state: "held",
                summary: `${plural(plans.length, "plan")}: ${plans.map((plan) => plan.name).join(", ")}.`,
                link,
              };
        }),
      );

      lines.push(
        safely("contacts", "Contacts, with an emergency list", () => {
          const all = s.contacts.count();
          const emergency = s.contacts.emergency().length;
          const link = { to: "/contacts", label: "Contacts" };
          if (all === 0)
            return { id: "contacts", title: "Contacts, with an emergency list", state: "missing", summary: "No contacts are kept.", link };
          return emergency > 0
            ? {
                id: "contacts",
                title: "Contacts, with an emergency list",
                state: "held",
                summary: `${plural(all, "contact")}, ${emergency} on the emergency list.`,
                link,
              }
            : {
                id: "contacts",
                title: "Contacts, with an emergency list",
                state: "missing",
                summary: `${plural(all, "contact")}, but none is marked for an emergency.`,
                link,
              };
        }),
      );

      lines.push(
        safely("supplies", "Supplies entered", () => {
          const items = s.supplies.items();
          const link = { to: "/prepare/supplies", label: "Supplies" };
          if (items.length === 0)
            return { id: "supplies", title: "Supplies entered", state: "missing", summary: "Nothing is entered under Supplies.", link };
          const today = localDay();
          const past = items.filter((item) => item.quantity > 0 && pastUseBy(item, today)).length;
          return past > 0
            ? {
                id: "supplies",
                title: "Supplies entered",
                state: "stale",
                summary: `${plural(items.length, "item")}; ${past} past ${past === 1 ? "its" : "their"} use-by date.`,
                link,
              }
            : { id: "supplies", title: "Supplies entered", state: "held", summary: `${plural(items.length, "item")}.`, link };
        }),
      );

      const database = await s.database.status(request).catch(() => null);
      lines.push(
        safely("backup", "A backup, and its age", () => {
          if (!database) throw new Error("no status");
          const check = backupCheck(database.backup, lastDownloadedBackup(ctx)?.at ?? null, now);
          const state =
            check.state === "good" ? "held" : database.backup.lastAt === null && !lastDownloadedBackup(ctx) ? "missing" : "stale";
          return { id: "backup", title: "A backup, and its age", state, summary: check.summary, link: check.link };
        }),
      );

      lines.push(
        safely("https", "HTTPS, for phones to keep things", () => {
          const https = s.https.status();
          const link = { to: "/settings#https", label: "Settings, HTTPS on your network" };
          if (https.unavailable)
            return {
              id: "https",
              title: "HTTPS, for phones to keep things",
              state: "missing",
              summary: "Not offered on a portable drive.",
              link: null,
            };
          return https.listening
            ? {
                id: "https",
                title: "HTTPS, for phones to keep things",
                state: "held",
                summary: "On. A phone that trusts Outpost can keep pages, map areas and plans to open with the server out of reach.",
                link,
              }
            : {
                id: "https",
                title: "HTTPS, for phones to keep things",
                state: "missing",
                summary: https.problem ?? "Off. Without it a phone keeps nothing, and every screen needs the server.",
                link,
              };
        }),
      );

      lines.push({
        id: "phones",
        title: "What each phone holds",
        state: "untried",
        summary: "Outpost cannot see inside a phone. Open this screen on each phone to see what that phone keeps.",
        link: { to: "/kept", label: "On this device" },
      });

      lines.push(
        safely("frequencies", "Frequencies", () => {
          const { plan } = s.householdPapers.comms.get();
          const channels = plan.situations.flatMap((situation) =>
            situation.steps.filter((step) => step.frequency !== null || step.meshChannel !== null || step.repeaterId !== null),
          ).length;
          return {
            id: "frequencies",
            title: "Frequencies",
            state: channels > 0 ? "held" : "missing",
            summary:
              channels > 0
                ? `The list of frequencies to listen to comes with Outpost, and Keeping in touch names ${plural(channels, "radio channel")} of your own.`
                : "The list of frequencies to listen to comes with Outpost. Keeping in touch names no radio channel of your own.",
            link: { to: "/prepare/keeping-in-touch", label: "Keeping in touch" },
          };
        }),
      );

      lines.push(
        safely("downloads", "Anything half-downloaded", () => {
          const unfinished = s.downloads.unfinished().filter((row) => row.state !== "cancelled");
          const link = { to: "/downloads", label: "Downloads" };
          return unfinished.length > 0
            ? {
                id: "downloads",
                title: "Anything half-downloaded",
                state: "stale",
                summary: `${plural(unfinished.length, "download")} not finished: ${unfinished
                  .slice(0, 3)
                  .map((row) => row.title)
                  .join(", ")}${unfinished.length > 3 ? " and more" : ""}. Without the internet they stay as they are.`,
                link,
              }
            : { id: "downloads", title: "Anything half-downloaded", state: "held", summary: "Nothing is part of the way through.", link };
        }),
      );

      // The household's own receivers (Heard on the radio): whether one is set up and when it last heard
      // anything. Whether it keeps going with the mains off is for the drill to find out; Outpost cannot tell.
      {
        const link = { to: "/radio/heard", label: "Heard on the radio" };
        const title = "The radio receiver is heard with the power off";
        const set = db.select({ n: count() }).from(heardReceivers).where(eq(heardReceivers.enabled, true)).get()?.n ?? 0;
        const last =
          db
            .select({ at: max(heardReports.at) })
            .from(heardReports)
            .get()?.at ?? null;
        lines.push(
          set === 0
            ? {
                id: "radio-mains",
                title,
                state: "untried",
                summary:
                  "No receiver is set up. Without one, listen on a battery or wind-up radio in the drill. A receiver for APRS, aircraft or ships can be added under Heard on the radio.",
                link,
              }
            : {
                id: "radio-mains",
                title,
                state: "untried",
                summary: `${plural(set, "receiver")} set up${
                  last === null ? ", nothing heard yet" : `, last heard ${agoWords(Date.now() - last)}`
                }. In the drill, switch the power off at the main switch and see whether reports still arrive: the Pi, the receiver and the Wi-Fi the phones use all need power.`,
                link,
              },
        );
      }

      return lines;
    },

    lastRun() {
      const row = db.select().from(offlineDrills).orderBy(desc(offlineDrills.finishedAt)).limit(1).get();
      return row ? runDto(row) : null;
    },

    record(input) {
      const by = cleanName(input.by);
      if (!by) throw badRequest("Choose the name you write under first.");
      const known = new Set(DRILL_STEPS.map((step) => step.id));
      const answers: Record<string, "worked" | "failed"> = {};
      for (const [id, answer] of Object.entries(input.answers)) if (known.has(id)) answers[id] = answer;
      if (Object.keys(answers).length === 0) throw badRequest("Answer at least one step before keeping the drill.");
      const now = Date.now();
      const row = {
        id: newId(),
        by,
        startedAt: Math.min(input.startedAt, now),
        finishedAt: now,
        answers,
        notes: cleanBody(input.notes ?? "").slice(0, 4000),
      };
      db.insert(offlineDrills).values(row).run();
      changed();
      return runDto(row);
    },

    count: () => db.select({ n: count() }).from(offlineDrills).get()?.n ?? 0,
    eraseAll() {
      const n = db.select({ n: count() }).from(offlineDrills).get()?.n ?? 0;
      db.delete(offlineDrills).run();
      if (n > 0) changed();
      return n;
    },
  };
}

/**
 * The drill's first line: the current household's home. With one fixed household it reads
 * as it always has; with several it names the household; a portable one says how long
 * ago it was last placed, and asks for it to be set when it never was.
 */
function homeLine(household: HouseholdDto | null, home: HouseholdHome | null, several: boolean, now: number): DrillLine {
  const title = "Home on the map";
  const households = { to: "/prepare/households", label: "Households" };
  if (household?.kind === "portable") {
    if (!home)
      return {
        id: "home",
        title,
        state: "missing",
        summary: `Nobody has said where ${household.name} is now, so nothing below can be checked against where it is.`,
        link: households,
      };
    const age = homeAgeMs(home, now);
    return {
      id: "home",
      title,
      state: age !== null && age > 7 * DAY_MS ? "stale" : "held",
      summary: `${home.name}, as of ${age === null ? "an unknown time" : agoWords(age)}.`,
      link: households,
    };
  }
  if (home)
    return {
      id: "home",
      title,
      state: "held",
      summary: several ? `${home.name} is the home place of ${household?.name ?? "this household"}.` : `${home.name} is the home place.`,
      link: { to: "/maps", label: "Maps" },
    };
  return several && household
    ? {
        id: "home",
        title,
        state: "missing",
        summary: `${household.name} has no home place chosen, so nothing below can be checked against where it is.`,
        link: households,
      }
    : {
        id: "home",
        title,
        state: "missing",
        summary: "No saved place has the home icon, so nothing below can be checked against where you live.",
        link: { to: "/maps", label: "Maps" },
      };
}

/** How long ago, in words: "12 minutes ago", "5 hours ago", "3 days ago". The server's clock zone does not matter. */
function agoWords(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.round(hours / 24), "day")} ago`;
}
