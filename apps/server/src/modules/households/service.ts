/**
 * Households and people: which households there are, who is in each, where each one's
 * home is, and which is current for the whole Outpost. See docs/development/households.md.
 *
 * People are the rows of `supply_members` (global); `household_people` says who is in
 * which household. The first household is id "household", which is what every table
 * keyed by household held before there were several. With no household stored (a new
 * install, after Erase everything) every read sees that first one, unsaved; the first
 * change stores it (`ensure`), so that a GET never writes.
 */
import {
  countryAt,
  FIRST_HOUSEHOLD_ID,
  FIRST_HOUSEHOLD_NAME,
  type HereSource,
  HOUSEHOLD_LIMITS,
  type HouseholdCreateInput,
  type HouseholdDto,
  type HouseholdHereInput,
  type HouseholdHolds,
  type HouseholdHome,
  type HouseholdKind,
  type HouseholdPosition,
  type HouseholdsChangedData,
  type HouseholdUpdateInput,
  homePlaceOf,
  type PersonCreateInput,
  type PersonDto,
  type PersonHolds,
  type PersonInput,
} from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { badRequest, conflict, notFound } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { COUNTRIES } from "../layers/countries.ts";

/** The settings row that says which household is current (not one of the Settings screen's). */
export const CURRENT_SETTING = "households.current";

/** Tables with a `household_id` column whose rows belong to one household and go with it. */
export const HOUSEHOLD_ROW_TABLES = [
  "supply_items",
  "supply_shopping",
  "emergency_plans",
  "event_log",
  "routine_checks",
  "garden_sowings",
  "power_plans",
] as const;

/** One-row tables keyed by household id (the row's `id` is the household's id). */
export const HOUSEHOLD_SINGLETON_TABLES = [
  "supply_household",
  "comms_plans",
  "household_book",
  "household_binder",
  "garden_settings",
] as const;

export interface HouseholdsKept {
  households: number;
  positions: number;
}

export interface HouseholdsService {
  /** Every household, in order. Never empty. */
  list(): HouseholdDto[];
  get(id: string): HouseholdDto;
  /** The current household for the whole Outpost; the first, if the one chosen is gone. */
  current(): HouseholdDto;
  currentId(): string;
  setCurrent(id: string): HouseholdDto;
  /** The first household by position: the one the mesh root topic and the allotment game take. */
  first(): HouseholdDto;
  /** Where a household is (default: the current one), or null. */
  home(id?: string): HouseholdHome | null;
  /** The country a household's country users take (default: the current one): its override, else its home's. */
  country(id?: string): string | null;
  /** Ids of the people in a household (default: the current one), in order. */
  personIds(id?: string): string[];
  /** Stores the first household if none is stored. Call before writing a row keyed to a household. */
  ensure(): void;
  create(input: HouseholdCreateInput): HouseholdDto;
  update(id: string, input: HouseholdUpdateInput): HouseholdDto;
  /** What would go with a household. */
  holds(id: string): HouseholdHolds;
  /** Removes a household and what it holds; refuses the last, and without `confirm` refuses with `holds`. */
  remove(id: string, options: { confirm: boolean }): void;
  setPeople(id: string, personIds: string[]): HouseholdDto;
  setHere(id: string, input: HouseholdHereInput): HouseholdDto;
  positions(id: string): HouseholdPosition[];
  people: {
    list(): PersonDto[];
    get(id: string): PersonDto;
    create(input: PersonCreateInput): PersonDto;
    update(id: string, input: PersonInput): PersonDto;
    /** Removes a person from every household; refuses with `PersonHolds` when they have medical sheets and `confirm` is not set. */
    remove(id: string, options: { confirm: boolean }): void;
  };
  /** Called by supplies after it rewrote the people of the current household: puts them in it, in order. */
  syncMembers(personIds: string[]): void;
  kept: { count(): HouseholdsKept; eraseAll(): HouseholdsKept };
}

interface HouseholdRow {
  id: string;
  name: string;
  position: number;
  kind: string;
  home_marker_id: string | null;
  base_marker_id: string | null;
  country: string | null;
  here_lat: number | null;
  here_lon: number | null;
  here_name: string | null;
  here_at: number | null;
  here_source: string | null;
  created_at: number;
  updated_at: number;
}

interface MarkerRow {
  id: string;
  name: string;
  lat: number;
  lon: number;
  icon: string;
  createdAt: number;
}

interface MemberRow {
  id: string;
  position: number;
  kind: string;
  name: string;
  band: string | null;
  sex: string | null;
  kcal_per_day: number | null;
  drinking_litres: number | null;
  all_uses_litres: number | null;
  note: string;
  created_at: number;
  updated_at: number;
}

const unsavedFirst = (): HouseholdRow => ({
  id: FIRST_HOUSEHOLD_ID,
  name: FIRST_HOUSEHOLD_NAME,
  position: 0,
  kind: "fixed",
  home_marker_id: null,
  base_marker_id: null,
  country: null,
  here_lat: null,
  here_lon: null,
  here_name: null,
  here_at: null,
  here_source: null,
  created_at: 0,
  updated_at: 0,
});

export function createHouseholdsService(ctx: AppContext): HouseholdsService {
  const { sqlite } = ctx;
  const changed = (data: HouseholdsChangedData = {}) => ctx.events.publish({ type: "households.changed", data });

  const rows = (): HouseholdRow[] => {
    const stored = sqlite.prepare("SELECT * FROM households ORDER BY position, created_at, id").all() as HouseholdRow[];
    return stored.length > 0 ? stored : [unsavedFirst()];
  };
  const rowOf = (id: string): HouseholdRow => {
    const row = rows().find((candidate) => candidate.id === id);
    if (!row) throw notFound("That household");
    return row;
  };
  const markers = (): MarkerRow[] =>
    sqlite.prepare("SELECT id, name, lat, lon, icon, created_at AS createdAt FROM markers").all() as MarkerRow[];
  const markerExists = (id: string) => Boolean(sqlite.prepare("SELECT 1 FROM markers WHERE id = ?").get(id));
  const personIdsOf = (id: string): string[] =>
    sqlite
      .prepare(
        "SELECT hp.person_id FROM household_people hp JOIN supply_members m ON m.id = hp.person_id WHERE hp.household_id = ? ORDER BY hp.position, m.position, m.id",
      )
      .pluck()
      .all(id) as string[];
  const storedCurrent = (): string | null => {
    const value = sqlite.prepare("SELECT value FROM settings WHERE key = ?").pluck().get(CURRENT_SETTING) as string | undefined;
    if (value === undefined) return null;
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  };

  const hereOf = (row: HouseholdRow): HouseholdPosition | null =>
    row.here_lat === null || row.here_lon === null || row.here_at === null
      ? null
      : {
          id: `${row.id}-here`,
          lat: row.here_lat,
          lon: row.here_lon,
          name: row.here_name,
          at: row.here_at,
          source: (row.here_source as HereSource | null) ?? "map",
        };

  const homeOf = (row: HouseholdRow, all: HouseholdRow[], list: MarkerRow[]): HouseholdHome | null => {
    if (row.kind === "portable") {
      const here = hereOf(row);
      if (!here) return null;
      return {
        kind: "here",
        id: null,
        name: here.name || `Where ${row.name} is now`,
        lat: here.lat,
        lon: here.lon,
        country: countryAt(here, COUNTRIES),
        at: here.at,
        source: here.source,
      };
    }
    let marker = row.home_marker_id ? (list.find((candidate) => candidate.id === row.home_marker_id) ?? null) : null;
    // The first household keeps what home always was: the first saved place with the home icon.
    if (!marker && row.id === all[0]?.id) marker = homePlaceOf(list);
    if (!marker) return null;
    return {
      kind: "place",
      id: marker.id,
      name: marker.name || "Home",
      lat: marker.lat,
      lon: marker.lon,
      country: countryAt(marker, COUNTRIES),
      at: null,
      source: null,
    };
  };

  const toDto = (row: HouseholdRow, all: HouseholdRow[], list: MarkerRow[]): HouseholdDto => {
    const home = homeOf(row, all, list);
    return {
      id: row.id,
      name: row.name,
      position: row.position,
      kind: row.kind === "portable" ? "portable" : "fixed",
      homePlaceId: row.home_marker_id,
      basePlaceId: row.base_marker_id,
      home,
      countryOverride: row.country,
      country: row.country ?? home?.country ?? null,
      here: hereOf(row),
      personIds: personIdsOf(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const dtoOf = (id: string): HouseholdDto => {
    const all = rows();
    const row = all.find((candidate) => candidate.id === id);
    if (!row) throw notFound("That household");
    return toDto(row, all, markers());
  };

  const currentIdOf = (): string => {
    const all = rows();
    const chosen = storedCurrent();
    return all.some((row) => row.id === chosen) ? (chosen as string) : all[0]!.id;
  };

  const ensure = () => {
    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO households (id, name, position, kind, created_at, updated_at) SELECT ?, ?, 0, 'fixed', ?, ? WHERE NOT EXISTS (SELECT 1 FROM households)",
      )
      .run(FIRST_HOUSEHOLD_ID, FIRST_HOUSEHOLD_NAME, now, now);
  };

  const checkPlace = (id: string | null | undefined, what: string) => {
    if (id && !markerExists(id)) throw badRequest(`${what} is not a saved place any more. Choose another on the Maps screen.`);
  };
  const checkName = (name: string, exceptId: string | null) => {
    const clash = rows().find((row) => row.id !== exceptId && row.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (clash) throw conflict(`There is already a household called "${clash.name}". Give this one another name.`);
  };
  const checkPeople = (personIds: string[]) => {
    if (new Set(personIds).size !== personIds.length) throw badRequest("Someone is in the list twice.");
    if (personIds.length > HOUSEHOLD_LIMITS.peoplePerHousehold)
      throw badRequest(`A household holds at most ${HOUSEHOLD_LIMITS.peoplePerHousehold} people and pets.`);
    const known = new Set(sqlite.prepare("SELECT id FROM supply_members").pluck().all() as string[]);
    if (personIds.some((id) => !known.has(id))) throw badRequest("Someone in the list is no longer on the People list. Look at it again.");
  };
  const writePeople = (householdId: string, personIds: string[]) => {
    sqlite.prepare("DELETE FROM household_people WHERE household_id = ?").run(householdId);
    const insert = sqlite.prepare("INSERT INTO household_people (household_id, person_id, position) VALUES (?, ?, ?)");
    for (const [position, personId] of personIds.entries()) insert.run(householdId, personId, position);
  };
  const touch = (id: string, now = Date.now()) => sqlite.prepare("UPDATE households SET updated_at = ? WHERE id = ?").run(now, id);

  const count = (sql: string, ...params: unknown[]) =>
    (sqlite
      .prepare(sql)
      .pluck()
      .get(...params) as number | undefined) ?? 0;

  const toPerson = (row: MemberRow, memberships: Map<string, string[]>, sheets: Map<string, number>): PersonDto => ({
    id: row.id,
    kind: row.kind as PersonDto["kind"],
    name: row.name,
    band: row.band as PersonDto["band"],
    sex: row.sex as PersonDto["sex"],
    kcalPerDay: row.kcal_per_day,
    drinkingLitres: row.drinking_litres,
    allUsesLitres: row.all_uses_litres,
    note: row.note,
    householdIds: memberships.get(row.id) ?? [],
    medicalSheets: sheets.get(row.id) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  const peopleList = (): PersonDto[] => {
    const order = new Map(rows().map((row, index) => [row.id, index]));
    const memberships = new Map<string, string[]>();
    for (const link of sqlite.prepare("SELECT household_id, person_id FROM household_people").all() as Array<{
      household_id: string;
      person_id: string;
    }>) {
      if (!order.has(link.household_id)) continue;
      const list = memberships.get(link.person_id) ?? [];
      list.push(link.household_id);
      memberships.set(link.person_id, list);
    }
    for (const list of memberships.values()) list.sort((a, b) => order.get(a)! - order.get(b)!);
    const sheets = new Map(
      (
        sqlite
          .prepare("SELECT member_id, count(*) AS n FROM medical_sheets WHERE member_id IS NOT NULL GROUP BY member_id")
          .all() as Array<{
          member_id: string;
          n: number;
        }>
      ).map((row) => [row.member_id, row.n]),
    );
    return (sqlite.prepare("SELECT * FROM supply_members ORDER BY position, created_at, id").all() as MemberRow[]).map((row) =>
      toPerson(row, memberships, sheets),
    );
  };
  const personOf = (id: string): PersonDto => {
    const person = peopleList().find((candidate) => candidate.id === id);
    if (!person) throw notFound("That person");
    return person;
  };
  const personColumns = (input: PersonInput) => ({
    kind: input.kind,
    name: input.name.trim(),
    band: input.kind === "person" ? input.band : null,
    sex: input.kind === "person" ? input.sex : null,
    kcal_per_day: input.kcalPerDay,
    drinking_litres: input.drinkingLitres,
    all_uses_litres: input.allUsesLitres,
    note: input.note.trim(),
  });

  const service: HouseholdsService = {
    list() {
      const all = rows();
      const list = markers();
      return all.map((row) => toDto(row, all, list));
    },
    get: dtoOf,
    current: () => dtoOf(currentIdOf()),
    currentId: currentIdOf,
    setCurrent(id) {
      rowOf(id);
      const before = currentIdOf();
      const now = Date.now();
      sqlite.transaction(() => {
        ensure();
        sqlite
          .prepare(
            "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          )
          .run(CURRENT_SETTING, JSON.stringify(id), now);
      })();
      changed({ currentChanged: before !== id });
      return dtoOf(id);
    },
    first: () => dtoOf(rows()[0]!.id),
    home(id) {
      const all = rows();
      const row = all.find((candidate) => candidate.id === (id ?? currentIdOf()));
      if (!row) throw notFound("That household");
      return homeOf(row, all, markers());
    },
    country(id) {
      const row = rowOf(id ?? currentIdOf());
      return row.country ?? service.home(row.id)?.country ?? null;
    },
    personIds: (id) => personIdsOf(id ?? currentIdOf()),
    ensure,

    create(input) {
      const name = input.name.trim();
      if (!name) throw badRequest("Give the household a name.");
      const stored = rows();
      if (stored.length >= HOUSEHOLD_LIMITS.households)
        throw badRequest(`Outpost keeps at most ${HOUSEHOLD_LIMITS.households} households.`);
      checkName(name, null);
      checkPlace(input.homePlaceId, "That home");
      checkPlace(input.basePlaceId, "That base");
      if (input.copyPeopleFrom) rowOf(input.copyPeopleFrom);
      const copyFrom = input.copyPeopleFrom ? personIdsOf(input.copyPeopleFrom) : [];
      const id = newId();
      const now = Date.now();
      sqlite.transaction(() => {
        ensure();
        const position = count("SELECT coalesce(max(position), -1) + 1 FROM households");
        sqlite
          .prepare(
            "INSERT INTO households (id, name, position, kind, home_marker_id, base_marker_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(id, name, position, input.kind ?? "fixed", input.homePlaceId ?? null, input.basePlaceId ?? null, now, now);
        writePeople(id, copyFrom);
      })();
      changed();
      return dtoOf(id);
    },

    update(id, input) {
      const row = rowOf(id);
      const name = input.name === undefined ? row.name : input.name.trim();
      if (!name) throw badRequest("Give the household a name.");
      if (input.name !== undefined) checkName(name, id);
      if (input.homePlaceId !== undefined && input.homePlaceId !== row.home_marker_id) checkPlace(input.homePlaceId, "That home");
      if (input.basePlaceId !== undefined && input.basePlaceId !== row.base_marker_id) checkPlace(input.basePlaceId, "That base");
      const kind: HouseholdKind = input.kind ?? (row.kind as HouseholdKind);
      const now = Date.now();
      sqlite.transaction(() => {
        ensure();
        sqlite
          .prepare(
            "UPDATE households SET name = ?, kind = ?, home_marker_id = ?, base_marker_id = ?, country = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            name,
            kind,
            input.homePlaceId === undefined ? row.home_marker_id : input.homePlaceId,
            input.basePlaceId === undefined ? row.base_marker_id : input.basePlaceId,
            input.countryOverride === undefined ? row.country : input.countryOverride,
            now,
            id,
          );
      })();
      changed();
      return dtoOf(id);
    },

    holds(id) {
      rowOf(id);
      const people = personIdsOf(id);
      const onlyHere = people.filter(
        (personId) => count("SELECT count(*) FROM household_people WHERE person_id = ? AND household_id <> ?", personId, id) === 0,
      );
      const sheetsOf = (ids: string[]) =>
        ids.length === 0 ? 0 : count(`SELECT count(*) FROM medical_sheets WHERE member_id IN (${ids.map(() => "?").join(", ")})`, ...ids);
      const rowsIn = (table: string) => count(`SELECT count(*) FROM ${table} WHERE household_id = ?`, id);
      return {
        supplies: rowsIn("supply_items"),
        shoppingLines: rowsIn("supply_shopping"),
        emergencyPlans: rowsIn("emergency_plans"),
        logEntries: rowsIn("event_log"),
        routineChecks: rowsIn("routine_checks"),
        sowings: rowsIn("garden_sowings"),
        powerPlans: rowsIn("power_plans"),
        medicalSheets: count("SELECT count(*) FROM medical_sheets WHERE household_id = ? AND member_id IS NULL", id),
        papers: HOUSEHOLD_SINGLETON_TABLES.reduce((sum, table) => sum + count(`SELECT count(*) FROM ${table} WHERE id = ?`, id), 0),
        positions: rowsIn("household_positions"),
        people: people.length,
        peopleOnlyHere: onlyHere.length,
        theirMedicalSheets: sheetsOf(onlyHere),
      };
    },

    remove(id, { confirm }) {
      rowOf(id);
      if (rows().length <= 1) throw conflict("This is the only household. Outpost always keeps one; rename it instead.");
      const holds = service.holds(id);
      if (!confirm) {
        throw conflict(
          "Removing this household removes its supplies, plans, log, checks and papers. Nobody is removed from the People list. Say again to remove it.",
          { holds },
        );
      }
      sqlite.transaction(() => {
        for (const table of HOUSEHOLD_ROW_TABLES) sqlite.prepare(`DELETE FROM ${table} WHERE household_id = ?`).run(id);
        for (const table of HOUSEHOLD_SINGLETON_TABLES) sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        // Sheets of nobody in particular kept with this household go with it; a person's sheets stay with the person.
        sqlite.prepare("DELETE FROM medical_sheets WHERE household_id = ? AND member_id IS NULL").run(id);
        sqlite.prepare("UPDATE medical_sheets SET household_id = NULL WHERE household_id = ?").run(id);
        sqlite.prepare("DELETE FROM household_people WHERE household_id = ?").run(id);
        sqlite.prepare("DELETE FROM household_positions WHERE household_id = ?").run(id);
        sqlite.prepare("DELETE FROM households WHERE id = ?").run(id);
      })();
      const wasCurrent = storedCurrent() === id;
      if (wasCurrent) sqlite.prepare("DELETE FROM settings WHERE key = ?").run(CURRENT_SETTING);
      changed({ currentChanged: wasCurrent });
      for (const type of [
        "supplies.changed",
        "emergency-plans.changed",
        "readiness.changed",
        "garden.changed",
        "power.changed",
        "household-papers.changed",
      ])
        ctx.events.publish({ type });
    },

    setPeople(id, personIds) {
      rowOf(id);
      checkPeople(personIds);
      sqlite.transaction(() => {
        ensure();
        writePeople(id, personIds);
        touch(id);
      })();
      changed();
      ctx.events.publish({ type: "supplies.changed" });
      return dtoOf(id);
    },

    setHere(id, input) {
      const row = rowOf(id);
      if (row.kind !== "portable") throw badRequest("Only a household that moves has a position. Make it portable first.");
      const now = Date.now();
      const name = input.name?.trim() || null;
      sqlite.transaction(() => {
        ensure();
        sqlite
          .prepare(
            "UPDATE households SET here_lat = ?, here_lon = ?, here_name = ?, here_at = ?, here_source = ?, updated_at = ? WHERE id = ?",
          )
          .run(input.lat, input.lon, name, now, input.source, now, id);
        sqlite
          .prepare("INSERT INTO household_positions (id, household_id, lat, lon, name, at, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(newId(), id, input.lat, input.lon, name, now, input.source);
        sqlite
          .prepare(
            "DELETE FROM household_positions WHERE household_id = ? AND id NOT IN (SELECT id FROM household_positions WHERE household_id = ? ORDER BY at DESC, id DESC LIMIT ?)",
          )
          .run(id, id, HOUSEHOLD_LIMITS.positions);
      })();
      changed();
      return dtoOf(id);
    },

    positions(id) {
      rowOf(id);
      return (
        sqlite
          .prepare("SELECT id, lat, lon, name, at, source FROM household_positions WHERE household_id = ? ORDER BY at DESC, id DESC")
          .all(id) as HouseholdPosition[]
      ).map((row) => ({ ...row, source: row.source as HereSource }));
    },

    people: {
      list: peopleList,
      get: personOf,
      create(input) {
        if (count("SELECT count(*) FROM supply_members") >= HOUSEHOLD_LIMITS.people)
          throw badRequest(`Outpost keeps at most ${HOUSEHOLD_LIMITS.people} people and pets.`);
        const householdIds = input.householdIds ?? [currentIdOf()];
        for (const householdId of householdIds) {
          rowOf(householdId);
          if (personIdsOf(householdId).length >= HOUSEHOLD_LIMITS.peoplePerHousehold)
            throw badRequest(`A household holds at most ${HOUSEHOLD_LIMITS.peoplePerHousehold} people and pets.`);
        }
        const id = newId();
        const now = Date.now();
        const columns = personColumns(input);
        sqlite.transaction(() => {
          ensure();
          const position = count("SELECT coalesce(max(position), -1) + 1 FROM supply_members");
          sqlite
            .prepare(
              "INSERT INTO supply_members (id, position, kind, name, band, sex, kcal_per_day, drinking_litres, all_uses_litres, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              id,
              position,
              columns.kind,
              columns.name,
              columns.band,
              columns.sex,
              columns.kcal_per_day,
              columns.drinking_litres,
              columns.all_uses_litres,
              columns.note,
              now,
              now,
            );
          for (const householdId of new Set(householdIds)) {
            const at = count("SELECT coalesce(max(position), -1) + 1 FROM household_people WHERE household_id = ?", householdId);
            sqlite.prepare("INSERT INTO household_people (household_id, person_id, position) VALUES (?, ?, ?)").run(householdId, id, at);
          }
        })();
        changed();
        ctx.events.publish({ type: "supplies.changed" });
        return personOf(id);
      },
      update(id, input) {
        personOf(id);
        const columns = personColumns(input);
        sqlite
          .prepare(
            "UPDATE supply_members SET kind = ?, name = ?, band = ?, sex = ?, kcal_per_day = ?, drinking_litres = ?, all_uses_litres = ?, note = ?, updated_at = ? WHERE id = ?",
          )
          .run(
            columns.kind,
            columns.name,
            columns.band,
            columns.sex,
            columns.kcal_per_day,
            columns.drinking_litres,
            columns.all_uses_litres,
            columns.note,
            Date.now(),
            id,
          );
        changed();
        ctx.events.publish({ type: "supplies.changed" });
        return personOf(id);
      },
      remove(id, { confirm }) {
        const person = personOf(id);
        if (person.medicalSheets > 0 && !confirm) {
          const details: PersonHolds = { householdIds: person.householdIds, medicalSheets: person.medicalSheets };
          throw conflict(
            `${person.name || "This person"} has ${person.medicalSheets === 1 ? "a medical sheet" : `${person.medicalSheets} medical sheets`}. The ${person.medicalSheets === 1 ? "sheet is" : "sheets are"} kept, linked to nobody. Say again to remove them from the People list.`,
            { ...details },
          );
        }
        const keepWith = person.householdIds[0] ?? currentIdOf();
        sqlite.transaction(() => {
          // A person's sheets are never removed with them: they stay, for nobody in particular, with their first household.
          sqlite.prepare("UPDATE medical_sheets SET member_id = NULL, household_id = ? WHERE member_id = ?").run(keepWith, id);
          sqlite.prepare("DELETE FROM household_people WHERE person_id = ?").run(id);
          sqlite.prepare("DELETE FROM supply_members WHERE id = ?").run(id);
        })();
        changed();
        ctx.events.publish({ type: "supplies.changed" });
        if (person.medicalSheets > 0) ctx.events.publish({ type: "household-papers.changed" });
      },
    },

    syncMembers(personIds) {
      const householdId = currentIdOf();
      sqlite.transaction(() => {
        ensure();
        writePeople(householdId, personIds);
      })();
      changed();
    },

    kept: {
      count: () => ({ households: count("SELECT count(*) FROM households"), positions: count("SELECT count(*) FROM household_positions") }),
      eraseAll() {
        const before = service.kept.count();
        sqlite.transaction(() => {
          sqlite.prepare("DELETE FROM household_positions").run();
          sqlite.prepare("DELETE FROM household_people").run();
          sqlite.prepare("DELETE FROM households").run();
          sqlite.prepare("DELETE FROM settings WHERE key = ?").run(CURRENT_SETTING);
        })();
        changed({ currentChanged: true });
        return before;
      },
    },
  };
  return service;
}
