/**
 * The household binder: the printables a household chose, as one PDF with a contents
 * page and the date it was made from. Each part is the same pages its own screen prints
 * (the plans' fridge sheets, the contacts' emergency sheet, the grab cards ...), so the
 * binder never says anything its parts do not.
 *
 * Nothing here touches the page or the network: what Outpost holds in, pages out.
 */
import {
  BINDER_PARTS,
  type BinderPart,
  type CommsResponse,
  type ContactDto,
  categoryLabel,
  daysWords,
  type EmergencyPlanResponse,
  type FrequencyEntry,
  GRID_FORMATS,
  homePlaceOf,
  type MarkerDto,
  type SuppliesResponse,
  type SupplyOutlook,
} from "@outpost/shared";
import { emergencySheets } from "@/features/contacts/emergency-document";
import { type CardPaper, fridgeSheets } from "@/features/emergency-plans/cards";
import { readableOf } from "@/features/emergency-plans/printable";
import { frequencyBlocks } from "@/features/frequencies/document";
import { PAPERS } from "@/features/maps/print/paper";
import { INK, MUTED, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import type { ClockStyle } from "@/lib/clock";
import { appLocale } from "@/lib/region";
import { commsBlocks, usedEntries } from "./comms-words";
import { type GrabHousehold, type GrabPerson, grabSheets, gridLines } from "./grab-cards";
import type { PaperPerson } from "./household-data";
import type { OpenedSheet } from "./medical-crypto";
import { type ContactsNow, medicalBlocks, recordOf } from "./medical-words";

export interface BinderSources {
  plans: EmergencyPlanResponse[];
  emergencyContacts: ContactDto[];
  comms: CommsResponse | null;
  people: PaperPerson[];
  opened: ReadonlyMap<string, OpenedSheet>;
  contacts: ContactsNow;
  grabPeople: GrabPerson[];
  household: GrabHousehold;
  entries: readonly FrequencyEntry[];
  markers: MarkerDto[];
  supplies: SuppliesResponse | null;
  outlook: SupplyOutlook | null;
}

export interface BinderOptions {
  paper: CardPaper;
  made: Date;
  today: string;
  style: ClockStyle;
}

const longDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "long", year: "numeric" });

/** What a part holds now, in a few words; null when there is nothing to put in it. */
export function partHolds(part: BinderPart, sources: BinderSources): string | null {
  switch (part) {
    case "plans":
      return sources.plans.length > 0 ? `${sources.plans.length} ${sources.plans.length === 1 ? "plan" : "plans"}` : null;
    case "contacts":
      return sources.emergencyContacts.length > 0 ? `${sources.emergencyContacts.length} marked for emergencies` : null;
    case "comms":
      return sources.comms?.plan.updatedAt ? `${sources.comms.plan.situations.length} situations` : null;
    case "grab-cards":
      return sources.grabPeople.length > 0 ? `${sources.grabPeople.length} cards` : null;
    case "medical": {
      const readable = sources.people.filter((person) => person.sheet && recordOf(person.sheet, sources.opened));
      return readable.length > 0 ? `${readable.length} ${readable.length === 1 ? "sheet" : "sheets"}` : null;
    }
    case "frequencies": {
      const used = sources.comms ? usedEntries(sources.comms.plan, sources.entries).length : 0;
      return used > 0 ? `${used} from the communication plan` : null;
    }
    case "places":
      return homePlaceOf(sources.markers) || sources.household.places.length > 0 ? "home and the meeting points" : null;
    case "supplies":
      return sources.supplies && sources.supplies.items.length > 0 ? `${sources.supplies.items.length} items` : null;
  }
}

function placesBlocks(sources: BinderSources): Block[] {
  const formats = GRID_FORMATS.map((format) => format.id);
  const blocks: Block[] = [{ kind: "title", text: "Home and meeting points" }];
  const home = homePlaceOf(sources.markers);
  if (home) {
    blocks.push({ kind: "heading", text: `Home: ${home.name || "Home"}` });
    blocks.push({ kind: "list", items: gridLines(home.lat, home.lon, formats) });
  }
  const seen = new Set<string>();
  for (const data of sources.plans) {
    for (const place of readableOf(data.plan, data.resolved).places) {
      const key = `${place.name}|${place.coords}`;
      if (seen.has(key) || place.missing) continue;
      seen.add(key);
      blocks.push({ kind: "heading", text: `${place.role}: ${place.name}` });
      const marker = data.plan.body.places.find((each) => each.name === place.name)?.markerId;
      const now = marker ? data.resolved.places[marker] : null;
      blocks.push(
        now
          ? { kind: "list", items: [...gridLines(now.lat, now.lon, formats), place.note].filter(Boolean) }
          : { kind: "para", text: place.note || "Described only: no saved place on the map." },
      );
    }
  }
  blocks.push({ kind: "para", text: "A map page of the area is printed on Maps, with Print or save as PDF." });
  return blocks;
}

function suppliesBlocks(sources: BinderSources): Block[] {
  const items = sources.supplies?.items ?? [];
  const blocks: Block[] = [{ kind: "title", text: "Supplies" }];
  if (sources.outlook)
    blocks.push({
      kind: "para",
      text: `Food for ${daysWords(sources.outlook.food.days)}, water for ${daysWords(sources.outlook.water.days)}, for the household as set in Supplies. Planning figures, not dietary advice.`,
    });
  blocks.push({
    kind: "table",
    head: ["What", "How much", "Where", "Date"],
    rows: [...items]
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((item) => [
        `${item.name} (${categoryLabel(item.category)})`,
        `${item.quantity} ${item.unit}`.trim(),
        item.location,
        item.date ?? "",
      ]),
  });
  return blocks;
}

/** One part's pages. */
export function partPages(part: BinderPart, sources: BinderSources, options: BinderOptions): Sheet[] {
  const footer = `Household binder, ${longDate.format(options.made)} · Outpost`;
  const paper = options.paper;
  switch (part) {
    case "plans":
      return sources.plans.flatMap((data) => fridgeSheets(readableOf(data.plan, data.resolved), { made: options.made, paper }));
    case "contacts":
      return emergencySheets(sources.emergencyContacts, { made: options.made, style: options.style, paper });
    case "comms": {
      if (!sources.comms) return [];
      const { plan, resolved } = sources.comms;
      const people = sources.people.map(
        (person) =>
          plan.people.find((entry) => entry.memberId === person.memberId && person.memberId) ?? {
            id: person.name,
            memberId: person.memberId,
            name: person.name,
            note: "",
          },
      );
      const of = (person: (typeof people)[number] | null) => toSheets(commsBlocks(plan, resolved, person, sources.entries), footer, paper);
      return people.length > 0 ? people.flatMap(of) : of(null);
    }
    case "grab-cards":
      return grabSheets(sources.grabPeople, sources.household, {
        size: "wallet",
        formats: ["decimal", "osgb", "maidenhead"],
        made: options.made,
        paper,
      }).pages;
    case "medical":
      return sources.people.flatMap((person) => {
        const record = person.sheet ? recordOf(person.sheet, sources.opened) : null;
        return record
          ? toSheets(medicalBlocks(person.sheet?.name ?? person.name, record, sources.contacts, options.today), footer, paper)
          : [];
      });
    case "frequencies": {
      const entries = sources.comms ? usedEntries(sources.comms.plan, sources.entries) : [];
      return entries.length > 0
        ? toSheets(
            frequencyBlocks({ entries, chosen: "The channels of the communication plan", today: options.today, written: options.made }),
            footer,
            paper,
          )
        : [];
    }
    case "places":
      return toSheets(placesBlocks(sources), footer, paper);
    case "supplies":
      return toSheets(suppliesBlocks(sources), footer, paper);
  }
}

/** The whole binder: a contents page, then each chosen part that has something in it, in the contents' order. */
export function binderPages(
  chosen: readonly BinderPart[],
  sources: BinderSources,
  options: BinderOptions,
): { pages: Sheet[]; parts: BinderPart[] } {
  const parts: Array<{ part: BinderPart; label: string; pages: Sheet[] }> = [];
  for (const { id, label } of BINDER_PARTS) {
    if (!chosen.includes(id) || partHolds(id, sources) === null) continue;
    const pages = partPages(id, sources, options);
    if (pages.length > 0) parts.push({ part: id, label, pages });
  }
  const { width, height } = PAPERS[options.paper];
  const margin = 56;
  const items: SheetItem[] = [
    { kind: "text", x: margin, y: margin + 10, text: "Household binder", size: 22, bold: true, color: INK },
    {
      kind: "text",
      x: margin,
      y: margin + 34,
      text: `Made on ${longDate.format(options.made)} from what Outpost held then.`,
      size: 10,
      color: MUTED,
    },
    { kind: "text", x: margin, y: margin + 76, text: "Contents", size: 13, bold: true, color: INK },
  ];
  let page = 2;
  let y = margin + 100;
  for (const part of parts) {
    items.push({ kind: "text", x: margin, y, text: part.label, size: 11, color: INK });
    items.push({ kind: "text", x: width - margin, y, text: `page ${page}`, size: 11, color: INK, anchor: "end" });
    y += 20;
    page += part.pages.length;
  }
  items.push({
    kind: "text",
    x: margin,
    y: height - margin,
    text: "Our household's own plans, made in advance. In a real emergency, follow the emergency services and official warnings.",
    size: 8,
    color: MUTED,
    fit: width - 2 * margin,
  });
  items.push({
    kind: "text",
    x: margin,
    y: height - margin - 14,
    text: "A printed binder does not change when Outpost does. Home says when this one is older than what is in it.",
    size: 8,
    color: MUTED,
    fit: width - 2 * margin,
  });
  return { pages: [{ width, height, items }, ...parts.flatMap((part) => part.pages)], parts: parts.map((part) => part.part) };
}
