/**
 * The parts of "Take everything out": for each, how much there is, and how it is
 * written into the zip. Each part reuses the single export its own screen offers
 * (notes as Markdown, contacts as vCard, places as GPX, supplies and the barometer log
 * as CSV) so that the files are the ones a person already knows.
 */
import fs from "node:fs";
import path from "node:path";
import { type ExportSection, type ExportSectionEstimate, FIRST_HOUSEHOLD_ID } from "@outpost/shared";
import type { ZipArchive } from "archiver";
import type { AppContext } from "../../core/context.ts";
import { safeFileName } from "../../core/fs-safe.ts";
import { VERSION } from "../../core/version.ts";
import { addEntry } from "../notes/export.ts";
import { toCsv as suppliesCsv } from "../supplies/csv.ts";
import { writeReadingsCsv } from "../weather/csv.ts";
import { placesGeoJson } from "../weather/places-file.ts";
import { type LogRow, writeAdif } from "./adif.ts";
import { planFile } from "./plan-file.ts";

export interface Written {
  count: number;
  leftOut: string[];
}

export interface Section {
  id: ExportSection;
  label: string;
  format: string;
  /** What the README says this folder holds. */
  readme: string;
  estimate(ctx: AppContext): Promise<Omit<ExportSectionEstimate, "id" | "label" | "format">>;
  write(ctx: AppContext, archive: ZipArchive, folder: string, now: number, signal: AbortSignal): Promise<Written>;
}

const bytesOf = (text: string) => Buffer.byteLength(text, "utf8");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const scalar = <T>(ctx: AppContext, sql: string, ...params: unknown[]) =>
  ctx.sqlite
    .prepare(sql)
    .pluck()
    .get(...params) as T;

/** A CSV cell: quoted when it must be, and never starting a formula in a spreadsheet. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d.]+$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
const csvLine = (values: Array<string | number | null | undefined>) => values.map(cell).join(",");
const iso = (at: number | null | undefined) => (at ? new Date(at).toISOString() : "");

/** Names that are unique within one folder. */
function namer() {
  const used = new Set<string>();
  return (wanted: string, extension: string) => {
    const base = safeFileName(wanted, "untitled").slice(0, 80);
    let name = `${base}${extension}`;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base} (${n})${extension}`;
    used.add(name.toLowerCase());
    return name;
  };
}

/**
 * The households, each with a folder of its own name when there are several. With one (as
 * most Outposts have) its things are at the top of the section's folder, as they always were.
 */
function householdFolders(ctx: AppContext): Array<{ id: string; prefix: string }> {
  const list = ctx.services.households.list();
  if (list.length <= 1) return [{ id: list[0]?.id ?? FIRST_HOUSEHOLD_ID, prefix: "" }];
  const name = namer();
  return list.map((household) => ({ id: household.id, prefix: `${name(household.name, "")}/` }));
}

/** A medical sheet as its file: the armoured message of a locked one, else JSON. */
function sheetFile(sheet: SheetRow, name: string): { name: string; text: string } {
  return sheet.armor
    ? { name: `${name}.asc`, text: sheet.armor }
    : {
        name: `${name}.json`,
        text: json({
          name: sheet.name,
          created: iso(sheet.createdAt),
          updated: iso(sheet.updatedAt),
          sheet: JSON.parse(sheet.record ?? "{}"),
        }),
      };
}

interface SheetRow {
  name: string;
  record: string | null;
  armor: string | null;
  memberId: string | null;
  householdId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A section made of a few text files, worked out in full both to estimate and to write. */
function textSection(
  id: ExportSection,
  label: string,
  format: string,
  readme: string,
  files: (ctx: AppContext, now: number) => { count: number; files: Array<{ name: string; text: string }>; leftOut?: string[] },
): Section {
  return {
    id,
    label,
    format,
    readme,
    async estimate(ctx) {
      const made = files(ctx, Date.now());
      return { count: made.count, bytes: made.files.reduce((sum, file) => sum + bytesOf(file.text), 0), leftOut: made.leftOut ?? [] };
    },
    async write(ctx, archive, folder, now) {
      const made = files(ctx, now);
      if (made.count === 0) return { count: 0, leftOut: made.leftOut ?? [] };
      for (const file of made.files) await addEntry(archive, file.text, `${folder}/${file.name}`, new Date(now));
      return { count: made.count, leftOut: made.leftOut ?? [] };
    },
  };
}

// ── Notes ──

const notes: Section = {
  id: "notes",
  label: "Notes",
  format: "Markdown, with attachments",
  readme:
    "Every page as a Markdown (.md) file, in folders as the pages are nested. Links between pages and pictures are relative, so the folder works in any Markdown editor. Attachments are in `_attachments/`. Pages in the bin are left out.",
  async estimate(ctx) {
    const pages = scalar<number>(ctx, "SELECT count(*) FROM notes WHERE trashed_at IS NULL");
    const text = scalar<number | null>(ctx, "SELECT sum(length(content)) FROM notes WHERE trashed_at IS NULL") ?? 0;
    const files = scalar<number | null>(
      ctx,
      "SELECT sum(size_bytes) FROM attachments WHERE note_id IN (SELECT id FROM notes WHERE trashed_at IS NULL)",
    );
    // The stored page is JSON; its Markdown is about half as long.
    return { count: pages, bytes: Math.round(text / 2) + (files ?? 0), leftOut: [] };
  },
  async write(ctx, archive, folder) {
    const done = await ctx.services.notesExport.into(archive, folder);
    return { count: done.pages, leftOut: [] };
  },
};

// ── Contacts ──

const contacts = textSection(
  "contacts",
  "Contacts",
  "vCard",
  "Every contact in one vCard 4.0 file (`contacts.vcf`), which phones' and computers' contacts apps open.",
  (ctx) => {
    const count = ctx.services.contacts.count();
    if (count === 0) return { count, files: [] };
    return { count, files: [{ name: "contacts.vcf", text: ctx.services.contacts.exportCards({}, "4.0").body }] };
  },
);

// ── Places and routes ──

interface Feature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
}

const places = textSection(
  "places",
  "Places and routes",
  "GPX and GeoJSON",
  "Your map markers and saved routes and tracks: `places.gpx` for GPS devices and mapping apps, and `places.geojson` (GeoJSON, WGS 84 longitude and latitude) for GIS programs.",
  (ctx) => {
    const { annotations } = ctx.services.maps;
    const markers = annotations.listMarkers();
    const tracks = annotations.listTracks();
    const count = markers.length + tracks.length;
    if (count === 0) return { count, files: [] };
    const gpx = annotations.exportSelection({ markers: markers.length > 0, trackIds: tracks.map((track) => track.id) }).gpx;
    const features: Feature[] = markers.map((marker) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [marker.lon, marker.lat] },
      properties: { kind: "marker", name: marker.name, note: marker.note, favourite: marker.isFavorite, created: iso(marker.createdAt) },
    }));
    for (const track of tracks) {
      const collection = annotations.getTrack(track.id).geojson as unknown as { features?: Feature[] };
      for (const feature of collection.features ?? []) {
        features.push({ ...feature, properties: { ...feature.properties, kind: "route", route: track.name } });
      }
    }
    return {
      count,
      files: [
        { name: "places.gpx", text: gpx },
        { name: "places.geojson", text: json({ type: "FeatureCollection", features }) },
      ],
    };
  },
);

// ── Supplies ──

const supplies = textSection(
  "supplies",
  "Supplies",
  "CSV",
  "The supplies list as `supplies.csv`, the same columns Supplies reads back in. Opens in any spreadsheet. With several households, each has a folder of its own name.",
  (ctx) => {
    const items = ctx.services.supplies.items();
    // Which household each row is kept for; the rows themselves are read through Supplies' own service.
    const owner = new Map(
      (
        ctx.sqlite.prepare("SELECT id, household_id AS householdId FROM supply_items").all() as Array<{ id: string; householdId: string }>
      ).map((row) => [row.id, row.householdId]),
    );
    const files: Array<{ name: string; text: string }> = [];
    for (const folder of householdFolders(ctx)) {
      const own = items.filter((item) => (owner.get(item.id) ?? FIRST_HOUSEHOLD_ID) === folder.id);
      if (own.length > 0) files.push({ name: `${folder.prefix}supplies.csv`, text: suppliesCsv(own) });
    }
    return { count: items.length, files };
  },
);

// ── Barometer ──

const barometer = textSection(
  "barometer",
  "Barometer readings",
  "CSV",
  "The barometer log as `barometer-readings.csv`, the same file Weather reads back in.",
  (ctx) => {
    const readings = ctx.services.weather.readings();
    return { count: readings.length, files: readings.length ? [{ name: "barometer-readings.csv", text: writeReadingsCsv(readings) }] : [] };
  },
);

// ── Radio contact log ──

const LOG_COLUMNS = [
  "time_utc",
  "outcome",
  "frequency_mhz",
  "band",
  "mode",
  "sent_by",
  "sender_lat",
  "sender_lon",
  "received_by",
  "receiver_lat",
  "receiver_lon",
  "power_watts",
  "antenna",
  "report_sent",
  "report_received",
  "propagation",
  "notes",
];

const radioLog = textSection(
  "radio-log",
  "Radio contact log",
  "ADIF and CSV",
  "The contact log as `contact-log.adi` (ADIF 3.1.8), which logging programs import: contacts made and stations heard. `contact-log.csv` has every entry, attempts that failed included.",
  (ctx, now) => {
    const rows = ctx.sqlite
      .prepare(
        `SELECT at, frequency_mhz AS frequencyMhz, band, mode, outcome, tx_call AS txCall, tx_lat AS txLat, tx_lon AS txLon,
          rx_call AS rxCall, rx_lat AS rxLat, rx_lon AS rxLon, power_watts AS powerWatts, antenna,
          report_sent AS reportSent, report_received AS reportReceived, notes, prop_mode AS propMode
         FROM radio_observations ORDER BY at, id`,
      )
      .all() as LogRow[];
    if (rows.length === 0) return { count: 0, files: [] };
    const csv = [
      LOG_COLUMNS.join(","),
      ...rows.map((row) =>
        csvLine([
          iso(row.at),
          row.outcome,
          row.frequencyMhz,
          row.band,
          row.mode,
          row.txCall,
          row.txLat,
          row.txLon,
          row.rxCall,
          row.rxLat,
          row.rxLon,
          row.powerWatts,
          row.antenna,
          row.reportSent,
          row.reportReceived,
          row.propMode,
          row.notes,
        ]),
      ),
    ].join("\r\n");
    return {
      count: rows.length,
      files: [
        { name: "contact-log.adi", text: writeAdif(rows, now, VERSION) },
        { name: "contact-log.csv", text: `${csv}\r\n` },
      ],
    };
  },
);

// ── Emergency plans ──

const plans = textSection(
  "plans",
  "Emergency plans",
  "JSON",
  "Each emergency plan as a JSON file: its steps, people, places and contacts as you wrote them, and how far through it you were. JSON opens in any text editor.",
  (ctx) => {
    const rows = ctx.sqlite
      .prepare(
        `SELECT name, kind, kind_text AS kindText, emergency_number AS emergencyNumber, review_every_days AS reviewEveryDays,
          reviewed_at AS reviewedAt, body, use, created_at AS createdAt, updated_at AS updatedAt FROM emergency_plans ORDER BY name`,
      )
      .all() as Array<Record<string, unknown> & { name: string; body: string; use: string }>;
    const name = namer();
    return {
      count: rows.length,
      files: rows.map((row) => ({
        name: name(row.name, ".json"),
        text: json({
          name: row.name,
          kind: row.kindText || row.kind,
          emergencyNumber: row.emergencyNumber,
          reviewEveryDays: row.reviewEveryDays,
          reviewed: iso(row.reviewedAt as number),
          created: iso(row.createdAt as number),
          updated: iso(row.updatedAt as number),
          plan: JSON.parse(row.body),
          inUse: JSON.parse(row.use),
        }),
      })),
    };
  },
);

// ── Weather places ──

const weatherPlaces = textSection(
  "weather-places",
  "Weather places",
  "GeoJSON",
  "The places Weather and hazards keeps forecasts for, as `weather-places.geojson` (GeoJSON points, WGS 84 longitude and latitude, each with its name and Met Office region). Weather and hazards reads it back in, as do GIS programs.",
  (ctx) => {
    const places = ctx.services.weather.places();
    return { count: places.length, files: places.length ? [{ name: "weather-places.geojson", text: placesGeoJson(places) }] : [] };
  },
);

// ── Communication plans ──

const radioPlans = textSection(
  "radio-plans",
  "Communication plans",
  "JSON",
  "Each communication plan (Radio, Communication plans) as a JSON file: its stations, hours, bands, mode and notes. Communication plans reads each one back in. The worked-out matrix is not included: it is worked out again from the plan.",
  (ctx, now) => {
    const name = namer();
    const plans = ctx.services.propagation.plans.list();
    return {
      count: plans.length,
      files: plans.map(({ id: _id, createdAt: _created, updatedAt: _updated, linked: _linked, workedOut: _worked, ...plan }) => ({
        name: name(plan.name, ".json"),
        text: json(planFile("radio", plan, now)),
      })),
    };
  },
);

// ── Power plans ──

const powerPlans = textSection(
  "power-plans",
  "Power plans",
  "JSON",
  "Each power plan (Tools, Power and batteries) as a JSON file: the battery, the loads, the solar and the charger as typed in. Power and batteries reads each one back in.",
  (ctx, now) => {
    const name = namer();
    const plans = ctx.services.power.list();
    return {
      count: plans.length,
      files: plans.map(({ id: _id, createdAt: _created, updatedAt: _updated, ...plan }) => ({
        name: name(plan.name, ".json"),
        text: json(planFile("power", plan, now)),
      })),
    };
  },
);

// ── Household papers ──

const papers = textSection(
  "papers",
  "Medical sheets and keeping in touch",
  "JSON, and OpenPGP for locked sheets",
  "Medical sheets as JSON, one file each; a sheet locked with a passphrase stays locked, as the armoured OpenPGP message (`.asc`) it is kept as, and opens with that passphrase in any OpenPGP program. `keeping-in-touch.json` is the household's communication plan. With several households, each has a folder of its own name with its people's sheets (someone in two households is in both) and its own plan; a sheet of someone in no household is at the top.",
  (ctx) => {
    const sheets = ctx.sqlite
      .prepare(
        "SELECT name, record, armor, member_id AS memberId, household_id AS householdId, created_at AS createdAt, updated_at AS updatedAt FROM medical_sheets ORDER BY name",
      )
      .all() as SheetRow[];
    const folders = householdFolders(ctx);
    const files: Array<{ name: string; text: string }> = [];
    const written = new Set<SheetRow>();
    for (const folder of folders) {
      const people = new Set(ctx.services.households.personIds(folder.id));
      // A household's sheets: its people's, and its own for nobody in particular. With one household, every sheet.
      const own =
        folders.length === 1
          ? sheets
          : sheets.filter((sheet) => (sheet.memberId ? people.has(sheet.memberId) : sheet.householdId === folder.id));
      const name = namer();
      for (const sheet of own) {
        written.add(sheet);
        files.push(sheetFile(sheet, `${folder.prefix}${name(`Medical sheet - ${sheet.name}`, "")}`));
      }
      const comms = ctx.sqlite.prepare("SELECT body FROM comms_plans WHERE id = ?").pluck().get(folder.id) as string | undefined;
      if (comms) files.push({ name: `${folder.prefix}keeping-in-touch.json`, text: json(JSON.parse(comms)) });
    }
    // A sheet of someone in no household is not left out.
    const name = namer();
    for (const sheet of sheets.filter((entry) => !written.has(entry)))
      files.push(sheetFile(sheet, name(`Medical sheet - ${sheet.name}`, "")));
    return { count: files.length, files };
  },
);

// ── Households and people ──

const households = textSection(
  "households",
  "Households and people",
  "JSON",
  "`households.json`: each household, whether it stays put or moves, its home or where it was last, its country, and who is in it. `people.json`: everyone on the People list with their needs (age, energy and water a day) and the households they are in. `household-book.json` holds the household book's answers; with several households there is one for each, named after it.",
  (ctx) => {
    const service = ctx.services.households;
    const list = service.list();
    const people = service.people.list();
    const nameOf = new Map(list.map((household) => [household.id, household.name]));
    const personName = new Map(people.map((person) => [person.id, person.name]));
    const files: Array<{ name: string; text: string }> = [];
    // The one household Outpost always has, with nobody in it, is nothing of a person's own.
    if (people.length > 0 || list.length > 1) {
      files.push({
        name: "households.json",
        text: json(
          list.map((household) => ({
            name: household.name,
            kind: household.kind,
            home: household.home
              ? {
                  name: household.home.name,
                  lat: household.home.lat,
                  lon: household.home.lon,
                  asOf: household.home.at ? iso(household.home.at) : null,
                }
              : null,
            country: household.country,
            people: household.personIds.map((id) => personName.get(id) ?? ""),
          })),
        ),
      });
      files.push({
        name: "people.json",
        text: json(
          people.map((person) => ({
            name: person.name,
            kind: person.kind,
            ageBand: person.band,
            sex: person.sex,
            kcalPerDay: person.kcalPerDay,
            drinkingLitres: person.drinkingLitres,
            allUsesLitres: person.allUsesLitres,
            note: person.note,
            households: person.householdIds.map((id) => nameOf.get(id) ?? id),
          })),
        ),
      });
    }
    const books = ctx.sqlite.prepare("SELECT id, answers FROM household_book ORDER BY id").all() as Array<{ id: string; answers: string }>;
    const name = namer();
    for (const book of books) {
      const named = list.length > 1 && nameOf.has(book.id) ? `household-book - ${nameOf.get(book.id)}` : "household-book";
      files.push({ name: name(named, ".json"), text: json(JSON.parse(book.answers)) });
    }
    return { count: files.length === 0 ? 0 : list.length + people.length + books.length, files };
  },
);

// ── The household board ──

interface BoardRow {
  createdAt: number;
  channel: string;
  kind: string;
  author: string;
  body: string;
  status: string | null;
  place: string | null;
  lat: number | null;
  lon: number | null;
  fileId: string | null;
  editedAt: number | null;
}

const BOARD_SQL = `SELECT created_at AS createdAt, channel, kind, author, body, status, place, lat, lon, file_id AS fileId, edited_at AS editedAt
  FROM board_messages WHERE removed_at IS NULL ORDER BY channel, created_at, id`;

const board: Section = {
  id: "board",
  label: "Message board",
  format: "Plain text, with the files sent",
  readme:
    "The household board as plain text, one file per channel, oldest message first, with check-ins and where they were sent from. Files sent on the board are in `files/`. Messages that were removed are left out.",
  async estimate(ctx) {
    const count = scalar<number>(ctx, "SELECT count(*) FROM board_messages WHERE removed_at IS NULL");
    const text = scalar<number | null>(ctx, "SELECT sum(length(body) + length(author) + 40) FROM board_messages WHERE removed_at IS NULL");
    const files = scalar<number | null>(ctx, "SELECT sum(size_bytes) FROM board_files WHERE gone_at IS NULL");
    return { count, bytes: (text ?? 0) + (files ?? 0), leftOut: [] };
  },
  async write(ctx, archive, folder, now, signal) {
    const rows = ctx.sqlite.prepare(BOARD_SQL).all() as BoardRow[];
    if (rows.length === 0) return { count: 0, leftOut: [] };
    const fileName = namer();
    const leftOut: string[] = [];
    const byChannel = new Map<string, string[]>();
    for (const row of rows) {
      signal.throwIfAborted();
      let line = `${iso(row.createdAt).slice(0, 16).replace("T", " ")} UTC  ${row.author}`;
      if (row.kind === "checkin") line += ` checked in: ${row.status === "safe" ? "safe" : row.status === "help" ? "needs help" : "other"}`;
      line += row.editedAt ? " (edited)" : "";
      line += "\n";
      if (row.body) line += `${row.body.replace(/^/gm, "    ")}\n`;
      if (row.place || row.lat !== null)
        line += `    Where: ${[row.place, row.lat !== null ? `${row.lat}, ${row.lon}` : null].filter(Boolean).join(", ")}\n`;
      if (row.fileId) {
        try {
          const file = ctx.services.board.fileOf(row.fileId);
          if (file.row.goneAt === null && fs.existsSync(file.path)) {
            const name = fileName(path.parse(file.row.filename).name, path.extname(file.row.filename));
            await addEntry(archive, fs.createReadStream(file.path), `${folder}/files/${name}`, new Date(row.createdAt));
            line += `    File: files/${name}\n`;
          } else {
            line += `    File: ${file.row.filename} (no longer kept)\n`;
          }
        } catch {
          leftOut.push("A file sent on the board could not be read.");
        }
      }
      const lines = byChannel.get(row.channel) ?? [];
      lines.push(line);
      byChannel.set(row.channel, lines);
    }
    const name = namer();
    for (const [channel, lines] of byChannel) {
      await addEntry(
        archive,
        `${lines.join("\n")}`,
        `${folder}/${name(channel === "board" ? "household board" : channel, ".txt")}`,
        new Date(now),
      );
    }
    return { count: rows.length, leftOut };
  },
};

// ── Documents ──

interface DocumentRow {
  title: string;
  originalName: string;
  ext: string;
  sizeBytes: number;
  locationId: string | null;
  relPath: string;
  category: string | null;
  createdAt: number;
}

function documentRows(ctx: AppContext): DocumentRow[] {
  return ctx.sqlite
    .prepare(
      `SELECT title, original_name AS originalName, ext, size_bytes AS sizeBytes, location_id AS locationId, rel_path AS relPath,
        category, created_at AS createdAt FROM documents ORDER BY category, title`,
    )
    .all() as DocumentRow[];
}

/** Which documents can be read now, and words for the ones that cannot. */
function documentPlan(ctx: AppContext): { readable: DocumentRow[]; leftOut: string[] } {
  const locations = new Map(ctx.services.storage.list().map((row) => [row.id, row]));
  const away = new Map<string, number>();
  const readable: DocumentRow[] = [];
  for (const row of documentRows(ctx)) {
    const location = row.locationId ? locations.get(row.locationId) : undefined;
    if (location?.status === "available") readable.push(row);
    else {
      const name = location?.name ?? "a storage location that has been removed";
      away.set(name, (away.get(name) ?? 0) + 1);
    }
  }
  const leftOut = [...away].map(
    ([name, count]) =>
      `${count} document${count === 1 ? "" : "s"} on "${name}", which is not connected. Connect it and export again to include ${count === 1 ? "it" : "them"}.`,
  );
  return { readable, leftOut };
}

const documents: Section = {
  id: "documents",
  label: "Documents",
  format: "The original files",
  readme:
    "Every document in the library as the file that was added (PDF, EPUB, Word and so on), in a folder per category. `documents.csv` lists each with its title and category.",
  async estimate(ctx) {
    const { readable, leftOut } = documentPlan(ctx);
    return { count: readable.length, bytes: readable.reduce((sum, row) => sum + row.sizeBytes, 0), leftOut };
  },
  async write(ctx, archive, folder, _now, signal) {
    const { readable, leftOut } = documentPlan(ctx);
    if (readable.length === 0) return { count: 0, leftOut };
    const names = new Map<string, ReturnType<typeof namer>>();
    const listed = [csvLine(["file", "title", "category", "added"])];
    let count = 0;
    let missing = 0;
    for (const row of readable) {
      signal.throwIfAborted();
      const file = ctx.services.storage.resolve(row.locationId!, row.relPath);
      if (!fs.existsSync(file)) {
        missing += 1;
        continue;
      }
      const category = row.category ? safeFileName(row.category, "Other") : "Uncategorised";
      const name = names.get(category) ?? namer();
      names.set(category, name);
      const extension = row.ext ? `.${row.ext.replace(/^\./, "")}` : path.extname(row.originalName);
      const entry = `${category}/${name(path.parse(row.originalName).name || row.title, extension)}`;
      await addEntry(archive, fs.createReadStream(file), `${folder}/${entry}`, new Date(row.createdAt));
      listed.push(csvLine([entry, row.title, row.category, iso(row.createdAt)]));
      count += 1;
    }
    await addEntry(archive, `${listed.join("\r\n")}\r\n`, `${folder}/documents.csv`, new Date());
    if (missing > 0)
      leftOut.push(
        `${missing} document${missing === 1 ? " whose file is" : "s whose files are"} missing from where ${missing === 1 ? "it was" : "they were"} kept.`,
      );
    return { count, leftOut };
  },
};

export const SECTIONS: Section[] = [
  notes,
  contacts,
  places,
  supplies,
  barometer,
  radioLog,
  plans,
  weatherPlaces,
  radioPlans,
  powerPlans,
  papers,
  households,
  board,
  documents,
];
