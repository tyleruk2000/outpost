/**
 * The household book: what the household answered, what Outpost holds and what published
 * sources say, made into the pages of one PDF. A front part (the cover, what changed since
 * the last book, what the book cannot know, the contents), then each chosen section on
 * pages of its own, then the sources with the dates they were read.
 *
 * Every piece of advice is a source's words: the official guidance the emergency plan
 * templates carry (paraphrased under the Open Government Licence, as there), the NHS
 * website's first aid pages (unchanged, credited as its terms ask), the CDC's, EPA's and
 * WHO's words on water (as Tools › Water quotes them). Outpost's own words say only what a
 * thing is, where it is, how a figure was worked out and what is not known.
 *
 * Pure: what Outpost holds in, pages out. Nothing touches the page or the network.
 */
import {
  BOOK_SECTIONS,
  type BookAnswers,
  type BookFacts,
  type BookJourney,
  type BookMade,
  type BookPlaceGroup,
  type BookSectionId,
  bookChanges,
  bookSectionLabel,
  type CommsResponse,
  type ContactDto,
  compassPoint,
  daysWords,
  EMERGENCY_NUMBERS,
  type EmergencyPlanResponse,
  energyTableOf,
  energyTableSource,
  FLOOD_ZONE_WORDS,
  FNNE_SOURCE,
  FOOD_WORDS,
  type FrequencyEntry,
  filterFrequencies,
  formatDecimal,
  type Household,
  MEDICAL_CAVEAT,
  MONTH_NAMES,
  medicineLeft,
  memberNeeds,
  metresWords,
  NO_HOME_PLACE,
  PLAN_PHASES,
  type PlanSource,
  placeName,
  RECEIVER_PROFILES,
  REFERENCE_LAYER_INFO,
  type ReferenceLayerId,
  type ResolvedContact,
  type ShoppingSuggestion,
  type SupplyOutlook,
  sourceById,
  type TemplateStep,
  templateById,
  templateStep,
  termsOf,
  toMaidenhead,
  WALK_PACES,
  WATER_FIGURES,
  withinDegrees,
} from "@outpost/shared";
import { readableOf } from "@/features/emergency-plans/printable";
import { frequencyBlocks } from "@/features/frequencies/document";
import { commsBlocks } from "@/features/household-papers/comms-words";
import type { PaperPerson } from "@/features/household-papers/household-data";
import type { OpenedSheet } from "@/features/household-papers/medical-crypto";
import { type ContactsNow, medicalBlocks, recordOf } from "@/features/household-papers/medical-words";
import { PAPERS } from "@/features/maps/print/paper";
import { INK, MUTED, type Sheet, type SheetItem } from "@/features/maps/print/sheet";
import { type Block, toSheets } from "@/features/propagation/plans/document";
import { PLANNING_FIGURES, WATER_SOURCES } from "@/features/tools/water/guidance";
import { purificationBlocks } from "@/features/tools/water/purification-sheet";
import { CDC_HYGIENE, FIRST_AID_PAGES, FIRST_AID_POINTERS, KIT_FROM_PAGES, NHS_CREDIT, NHS_READ } from "./first-aid";
import { routeDrawing } from "./route-drawing";

export interface BookInputs {
  answers: BookAnswers;
  facts: BookFacts;
  household: Household | null;
  outlook: SupplyOutlook | null;
  /** What Supplies would buy to reach the days wanted. */
  missing: ShoppingSuggestion[];
  people: PaperPerson[];
  opened: ReadonlyMap<string, OpenedSheet>;
  /** The contacts the medical sheets link to, as they are now. */
  medicalContacts: ContactsNow;
  plans: EmergencyPlanResponse[];
  emergencyContacts: ContactDto[];
  comms: CommsResponse | null;
  markers: Array<{ id: string; name: string; lat: number; lon: number }>;
  /** The contacts the places the household would go to link to. */
  destinationContacts: Record<string, ResolvedContact | null | undefined>;
  entries: readonly FrequencyEntry[];
  /** When the book is made: printed on it. */
  made: Date;
  today: string;
  previous: BookMade | null;
}

export interface MadeBook {
  pages: Sheet[];
  sections: BookSectionId[];
  contents: Array<{ label: string; page: number }>;
  /** A few lines a section, for the next book to compare itself with. */
  summary: Record<string, string[]>;
}

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const box = "[ ]";
const direction = (degrees: number) => `${compassPoint(degrees)} (${Math.round(degrees) % 360}°)`;
const at4 = (lat: number, lon: number) => formatDecimal(lat, lon, 4);

/** The words of official sources a section used, so that the sources page lists them and the credits go with them. */
class Used {
  plan = new Set<string>();
  nhs = new Set<string>();
  cdc = false;
  water = false;
  nasa = false;
  tobler = false;
  layers = new Set<ReferenceLayerId>();
}

/** The number for the emergency services where home is: the household's answer, or the published one for home's country. */
export function emergencyNumberFor(answers: BookAnswers, country: string | null, plans: EmergencyPlanResponse[]): string {
  if (answers.emergencyNumber.trim()) return answers.emergencyNumber.trim();
  const published = country ? EMERGENCY_NUMBERS.find((entry) => entry.regions.includes(country)) : undefined;
  return published?.number ?? plans[0]?.plan.emergencyNumber ?? "";
}

/** A template's lines, by id, as the book prints them; each one's source is noted as used. */
function steps(ids: string[], used: Used): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const found = templateStep(id);
    if (!found) continue;
    used.plan.add(found.step.source);
    out.push(found.step.text);
  }
  return out;
}

function supplyLines(
  ids: string[],
  used: Used,
): Array<{ name: string; quantity: number | null; unit: string; perPerson: boolean; perDay: boolean }> {
  const out = [];
  for (const template of ["shelter-at-home", "power-cut", "evacuate", "flooding", "cold", "heat", "comms-failure"]) {
    for (const supply of templateById(template)?.supplies ?? []) {
      if (!ids.includes(supply.id)) continue;
      used.plan.add(supply.source);
      out.push(supply);
    }
  }
  return out;
}

/** The note a section ends with when it carries the UK government's words and home is elsewhere. */
function ukWordsNote(country: string | null, number: string): Block[] {
  if (country === "GB") return [];
  return [
    {
      kind: "para",
      text: `These are the words of UK official guidance, the official guidance Outpost holds. Where they say 999, call ${number || "your emergency number"}${
        country ? ` in ${placeName(country)}` : ""
      }, and follow your own country's emergency services where they say something different.`,
    },
  ];
}

// ── Sections ────────────────────────────────────────────────────────────────

interface Context extends BookInputs {
  number: string;
  country: string | null;
  used: Used;
  summary: Record<string, string[]>;
  /** The licence statements the words used need, once each. */
  attributions: Set<string>;
}

function firstMinutes(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "The first few minutes" }];
  blocks.push({
    kind: "table",
    head: ["If", "Do this"],
    rows: [
      ["anyone is in danger now", `Call ${c.number || "the emergency services"}.`],
      ...steps(["evacuate.during.3", "evacuate.during.4"], c.used).map((line) => ["there is a fire inside", line]),
      ...steps(
        ["shelter-at-home.during.1", "shelter-at-home.during.2", "shelter-at-home.during.3", "shelter-at-home.during.4"],
        c.used,
      ).map((line) => ["the emergency is outside", line]),
      ...steps(["evacuate.during.1", "evacuate.during.5"], c.used).map((line) => ["you are told to leave", line]),
      ...steps(["evacuate.after.4"], c.used).map((line) => ["you are safe", line]),
    ],
  });
  const near = c.answers.meetingPoints.filter((point) => point.role === "near");
  const away = c.answers.meetingPoints.filter((point) => point.role === "away");
  const named = (ids: typeof near) => ids.map((point) => c.markers.find((marker) => marker.id === point.markerId)?.name).filter(Boolean);
  const lines: string[] = [];
  if (named(near).length > 0) lines.push(`Meet near home at: ${named(near).join(", then ")}.`);
  if (named(away).length > 0) lines.push(`Meet outside the area at: ${named(away).join(", then ")}.`);
  if (c.comms?.plan.checkIns.trim()) lines.push(`Check in: ${c.comms.plan.checkIns.trim()}.`);
  const firstContact = c.emergencyContacts[0];
  if (firstContact) lines.push(`Tell: ${firstContact.displayName}${firstContact.phones[0] ? `, ${firstContact.phones[0].value}` : ""}.`);
  if (lines.length > 0) blocks.push({ kind: "heading", text: "Our own plan" }, { kind: "list", items: lines });
  else
    blocks.push({
      kind: "para",
      text: "No meeting point or contact was given in the questions. Add them, and make the book again, so this page says where to go and who to tell.",
    });
  blocks.push(...ukWordsNote(c.country, c.number));
  c.summary["first-minutes"] = [`Emergency number ${c.number}`, ...lines];
  return blocks;
}

function people(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Our household" }];
  const members = c.household?.members ?? [];
  const persons = members.filter((member) => member.kind === "person");
  const pets = members.filter((member) => member.kind === "pet");
  const summary: string[] = [];
  if (persons.length === 0) {
    blocks.push({
      kind: "para",
      text: "No people are listed in Supplies. Add them in the questions or under Supplies, and make the book again.",
    });
  } else {
    blocks.push({
      kind: "table",
      head: ["Name", "Age", "Needs", "Carries"],
      rows: persons.map((member) => {
        const extra = c.answers.people.find((person) => person.memberId === member.id);
        summary.push([member.name, extra?.needs].filter(Boolean).join(": "));
        return [
          member.name || "Unnamed",
          member.band ? (bandLabel(member.band) ?? "") : "",
          extra?.needs.trim() || member.note.trim(),
          extra?.carries.trim() ?? "",
        ];
      }),
    });
  }
  if (pets.length > 0) {
    blocks.push(
      { kind: "heading", text: "Pets" },
      { kind: "table", head: ["Name", "Note"], rows: pets.map((pet) => [pet.name, pet.note]) },
    );
    summary.push(...pets.map((pet) => `Pet: ${pet.name}`));
  }

  const readable = c.people
    .map((person) => ({ person, record: person.sheet ? recordOf(person.sheet, c.opened) : null }))
    .filter((entry): entry is { person: PaperPerson; record: NonNullable<typeof entry.record> } => entry.record !== null);
  const locked = c.people.filter((person) => person.sheet?.encrypted && !c.opened.has(person.sheet.id)).length;
  const medicines = readable.flatMap(({ person, record }) =>
    record.medicines.map((line) => {
      const left = medicineLeft(line, c.today);
      return [
        person.name,
        line.name,
        [line.dose, line.when].filter(Boolean).join(", "),
        line.keptWhere,
        left ? `about ${Math.floor(left.days)} days (to ${longDate.format(new Date(`${left.runsOut}T00:00:00`))})` : "",
      ];
    }),
  );
  if (medicines.length > 0) {
    blocks.push(
      { kind: "heading", text: "Medicines" },
      { kind: "table", head: ["Who", "Medicine", "Dose and when", "Kept", "Lasts"], rows: medicines },
      {
        kind: "para",
        text: "How long a medicine lasts is the count typed on its medical sheet, less a day's use for each day since it was counted.",
      },
    );
    summary.push(...medicines.map((row) => `${row[0]}: ${row[1]}`));
  }
  const allergies = readable.flatMap(({ person, record }) => record.allergies.map((line) => [person.name, line.what, line.reaction]));
  if (allergies.length > 0)
    blocks.push({ kind: "heading", text: "Allergies" }, { kind: "table", head: ["Who", "Allergic to", "What happens"], rows: allergies });
  if (locked > 0)
    blocks.push({
      kind: "para",
      text: `${locked === 1 ? "One medical sheet is" : `${locked} medical sheets are`} encrypted and not open on the device this book was made on, so ${locked === 1 ? "it is" : "they are"} not in it.`,
    });
  if (c.answers.medicalInFull)
    for (const { person, record } of readable)
      blocks.push(...medicalBlocks(person.sheet?.name ?? person.name, record, c.medicalContacts, c.today, false));
  if (readable.length > 0) blocks.push({ kind: "para", text: MEDICAL_CAVEAT });
  c.summary.people = summary;
  return blocks;
}

function bandLabel(band: string): string | null {
  const labels: Record<string, string> = {
    "under-1": "Under 1",
    "1": "1",
    "2-3": "2 to 3",
    "4-6": "4 to 6",
    "7-10": "7 to 10",
    "11-14": "11 to 14",
    "15-18": "15 to 18",
    "19-64": "19 to 64",
    "65-74": "65 to 74",
    "75+": "75 and over",
  };
  return labels[band] ?? null;
}

function keepingInTouch(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Keeping in touch and meeting" }];
  const summary: string[] = [];
  blocks.push({ kind: "para", text: `Emergency services: ${c.number || "not given"}.` });
  const pointRows = c.answers.meetingPoints.map((point) => {
    const marker = c.markers.find((each) => each.id === point.markerId);
    summary.push(`Meet: ${marker?.name ?? "a place no longer saved"}`);
    return [
      point.role === "near" ? "Near home" : "Outside the area",
      marker?.name ?? "No longer on the map",
      marker ? `${at4(marker.lat, marker.lon)}  ${toMaidenhead(marker.lat, marker.lon, 6) ?? ""}` : "",
      point.note,
    ];
  });
  if (pointRows.length > 0)
    blocks.push(
      { kind: "heading", text: "Where we meet" },
      { kind: "table", head: ["When", "Where", "Position and locator", "Note"], rows: pointRows },
    );
  const home = c.facts.home;
  const destinations = c.answers.destinations.map((destination) => {
    const contact = destination.contactId ? c.destinationContacts[destination.contactId] : null;
    const journey = c.facts.journeys.find((each) => each.destinationId === destination.id);
    summary.push(`Go to: ${destination.name}`);
    return [
      destination.name,
      contact ? `${contact.displayName}${contact.phones[0] ? `, ${contact.phones[0].value}` : ""}` : "",
      journey && home ? `${metresWords(journey.distanceMeters)} ${compassPoint(journey.bearingDegrees)}` : "",
      destination.note,
    ];
  });
  if (destinations.length > 0)
    blocks.push(
      { kind: "heading", text: "The people we would go to" },
      { kind: "table", head: ["Who", "Contact", "From home", "Note"], rows: destinations },
    );
  if (c.emergencyContacts.length > 0) {
    blocks.push(
      { kind: "heading", text: "Contacts marked for emergencies" },
      {
        kind: "table",
        head: ["Name", "Phone", "Note"],
        rows: c.emergencyContacts.map((contact) => [
          contact.displayName,
          contact.phones.map((phone) => phone.value).join(", "),
          contact.emergencyNote,
        ]),
      },
    );
    summary.push(...c.emergencyContacts.map((contact) => `Contact: ${contact.displayName}`));
  }
  if (c.comms?.plan.updatedAt) {
    blocks.push(...commsBlocks(c.comms.plan, c.comms.resolved, null, c.entries, { checkIn: false, title: false }));
    summary.push(...c.comms.plan.situations.map((situation) => `Situation: ${situation.name}`));
  } else {
    blocks.push({
      kind: "para",
      text: "No communication plan is kept. Make one under Preparedness › Keeping in touch: what to try first and next when phones are down, and when to check in.",
    });
  }
  c.summary["keeping-in-touch"] = summary;
  return blocks;
}

function firstAid(c: Context): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "First aid" },
    {
      kind: "para",
      text: `Lines quoted unchanged from the NHS website's pages, read on ${NHS_READ}. They are written for the UK: where they say 999 or NHS 111, ${c.country === "GB" ? "that is the number to call" : `call ${c.number || "your emergency number"}`}. A course teaches what words cannot.`,
    },
  ];
  for (const page of FIRST_AID_PAGES) {
    blocks.push({ kind: "heading", text: page.title });
    for (const part of page.parts) {
      if (part.heading) blocks.push({ kind: "para", text: part.heading });
      blocks.push({ kind: "list", items: part.lines });
    }
    blocks.push({ kind: "para", text: `${NHS_CREDIT} ${page.url} (page last reviewed ${page.reviewed}).` });
    c.used.nhs.add(page.id);
  }
  blocks.push(
    { kind: "heading", text: "What this section cannot hold" },
    {
      kind: "para",
      text: "The NHS website no longer has its own pages on CPR for an adult, the recovery position, choking or severe bleeding: it sends readers to St John Ambulance. Those, and the British Red Cross's and Resuscitation Council UK's, may not be reprinted, so they are not here. Learn them on a course, keep a first aid manual with this book, and keep a first aid collection in Outpost's library (Explore › Medicine and first aid).",
    },
    { kind: "list", items: FIRST_AID_POINTERS.map((pointer) => `${pointer.what}: ${pointer.who}, ${pointer.url}`) },
  );
  c.summary["first-aid"] = FIRST_AID_PAGES.map((page) => `${page.title} (reviewed ${page.reviewed})`);
  return blocks;
}

function placesTable(group: BookPlaceGroup, wind: number | null): Block {
  return {
    kind: "table",
    head: ["Name", "What", "Distance", "Direction", "Position", ...(wind !== null ? ["Upwind"] : [])],
    rows: group.places.map((place) => [
      place.name || "No name mapped",
      place.kindLabel,
      metresWords(place.distanceMeters),
      direction(place.bearingDegrees),
      at4(place.lat, place.lon),
      ...(wind !== null ? [withinDegrees(place.bearingDegrees, wind) ? "Yes" : ""] : []),
    ]),
  };
}

function notHeld(group: BookPlaceGroup, country: string | null): string {
  const layer = REFERENCE_LAYER_INFO[group.layer as ReferenceLayerId];
  return `Not held: no ${layer?.label.toLowerCase() ?? group.layer} layer is installed. Add one under Maps › Layers, from a reference pack for ${
    country ? placeName(country) : "where home is"
  } (it needs the internet once), and make the book again.`;
}

function helpNearHome(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Help near home" }];
  if (!c.facts.home) return [...blocks, { kind: "para", text: NO_HOME_PLACE }];
  blocks.push({
    kind: "para",
    text: `Measured in a straight line from ${c.facts.home.name} (${at4(c.facts.home.lat, c.facts.home.lon)}), from the reference layers installed on this Outpost. ${FOOD_WORDS.emergency} A place listed may have closed or moved: check before you need it.`,
  });
  const summary: string[] = [];
  for (const group of c.facts.help) {
    blocks.push({ kind: "heading", text: group.label });
    c.used.layers.add(group.layer as ReferenceLayerId);
    if (!group.held) blocks.push({ kind: "para", text: notHeld(group, c.country) });
    else if (group.places.length === 0) blocks.push({ kind: "para", text: "None near home in the layer held." });
    else {
      blocks.push(placesTable(group, null));
      summary.push(...group.places.map((place) => `${group.label}: ${place.name}`));
    }
    if (group.id === "shelters" && group.held) blocks.push({ kind: "para", text: REFERENCE_LAYER_INFO.shelters.about });
  }
  blocks.push({ kind: "para", text: FOOD_WORDS.coverage });
  c.summary["help-near-home"] = summary;
  return blocks;
}

function keepAway(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Places to keep away from" }];
  if (!c.facts.home) return [...blocks, { kind: "para", text: NO_HOME_PLACE }];
  const wind = c.facts.climate?.wind ?? null;
  const summary: string[] = [];
  if (wind) {
    c.used.nasa = true;
    blocks.push(
      { kind: "heading", text: "The wind at home" },
      {
        kind: "para",
        text: `NASA POWER gives the average direction the wind comes from at ${c.facts.climate!.placeName} as ${direction(wind.fromDegrees)}, over ${wind.period}. A site below within 45° of that direction is marked upwind: with the wind from there, air from it comes towards home. An average says nothing about any one day, when the wind can come from any side: listen for official warnings, and go in, stay in and tune in if told to.`,
      },
      {
        kind: "table",
        head: [...MONTH_NAMES],
        rows: [wind.months.map((value) => (value === null ? "" : compassPoint(value)))],
      },
    );
    summary.push(`Wind from ${compassPoint(wind.fromDegrees)}`);
  } else if (c.facts.climate) {
    blocks.push({
      kind: "para",
      text: "The climate averages kept for home were fetched before Outpost asked for the wind's direction. Fetch them again under Weather and hazards › Climate, and make the book again, for which way the wind usually blows.",
    });
  } else {
    blocks.push({
      kind: "para",
      text: "Outpost holds no climate averages for home, so the book cannot say which way the wind usually blows. Fetch them under Weather and hazards › Climate (it needs the internet once), and make the book again.",
    });
  }
  for (const group of c.facts.keepAway) {
    blocks.push({ kind: "heading", text: group.label });
    c.used.layers.add(group.layer as ReferenceLayerId);
    if (!group.held) blocks.push({ kind: "para", text: notHeld(group, c.country) });
    else if (group.places.length === 0) blocks.push({ kind: "para", text: "None near home in the layer held." });
    else {
      blocks.push(placesTable(group, wind?.fromDegrees ?? null));
      summary.push(...group.places.map((place) => `${group.label}: ${place.name}`));
    }
  }
  blocks.push(
    { kind: "heading", text: "What is not here" },
    {
      kind: "list",
      items: [
        "Power stations other than nuclear ones, chemical works, fuel depots and other industrial sites: Outpost's reference layers do not hold them.",
        "Major hazard sites (in Great Britain, those under the COMAH regulations) and the public information zones round them: Outpost has no openly licensed copy it can fetch. Your local authority publishes them.",
        `Emergency planning zones round nuclear sites: ${
          c.facts.planningZones === null
            ? "none is held. Where your authority publishes them as a file, it can be brought in under Maps › Layers."
            : c.facts.planningZones.length > 0
              ? `home is in ${c.facts.planningZones.map((zone) => zone.name).join(", ")}.`
              : "home is in none of the zones held."
        }`,
      ],
    },
  );
  c.summary["keep-away"] = summary;
  return blocks;
}

function situations(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "What to do, by situation" }];
  const summary: string[] = [];
  if (c.answers.hazards.length === 0) blocks.push({ kind: "para", text: "No hazard was chosen in the questions." });
  for (const hazard of c.answers.hazards) {
    const template = templateById(hazard);
    if (!template) continue;
    const own = c.plans.find((data) => data.plan.templateId === hazard);
    blocks.push({ kind: "heading", text: template.name });
    summary.push(template.name);
    if (own) {
      const readable = readableOf(own.plan, own.resolved);
      blocks.push({ kind: "para", text: `From your emergency plan “${own.plan.name}”, as it is now.` });
      for (const phase of PLAN_PHASES) {
        const lines = readable.steps.filter((step) => step.phase === phase.id).map((step) => step.text);
        if (lines.length > 0) blocks.push({ kind: "para", text: phase.label }, { kind: "list", items: lines });
      }
      for (const origin of own.plan.body.steps.map((step) => step.origin))
        if (origin) {
          const found = templateStep(origin);
          if (found) c.used.plan.add(found.step.source);
        }
      for (const attribution of readable.attributions) c.attributions.add(attribution);
    } else {
      for (const phase of PLAN_PHASES) {
        const lines = template.steps.filter((step: TemplateStep) => step.phase === phase.id);
        for (const step of lines) c.used.plan.add(step.source);
        if (lines.length > 0) blocks.push({ kind: "para", text: phase.label }, { kind: "list", items: lines.map((step) => step.text) });
      }
    }
  }
  blocks.push(...ukWordsNote(c.country, c.number));
  c.summary.situations = summary;
  return blocks;
}

/** Each person's and pet's daily water and energy, from Supplies' household. */
function needs(c: Context) {
  const list = c.household ? memberNeeds(c.household) : [];
  const days = c.answers.days;
  const drinking = list.reduce((total, need) => total + (need.drinking ?? 0), 0);
  const allUses = list.reduce((total, need) => total + (need.allUses ?? 0), 0);
  const kcal = list.reduce((total, need) => total + (need.kind === "person" ? (need.kcal ?? 0) : 0), 0);
  const petKcal = list.reduce((total, need) => total + (need.kind === "pet" ? (need.kcal ?? 0) : 0), 0);
  return { list, days, drinking, allUses, kcal, petKcal };
}

function water(c: Context): Block[] {
  const n = needs(c);
  c.used.water = true;
  const blocks: Block[] = [{ kind: "title", text: "Water" }];
  if (n.list.length > 0) {
    blocks.push(
      { kind: "heading", text: `How much, for ${n.days} days` },
      {
        kind: "table",
        head: ["Who", "Drinking, a day", "All uses, a day"],
        right: [1, 2],
        rows: [
          ...n.list.map((need) => [
            need.name || "Unnamed",
            need.drinking === null ? "" : `${need.drinking} l`,
            need.allUses === null ? "" : `${need.allUses} l`,
          ]),
          ["Everyone", `${round1(n.drinking)} l`, `${round1(n.allUses)} l`],
          [`For ${n.days} days`, `${Math.ceil(n.drinking * n.days)} l`, `${Math.ceil(n.allUses * n.days)} l`],
        ],
      },
      {
        kind: "para",
        text: `Drinking: ${WATER_FIGURES.drinking.litres} litres a person a day, from ${WATER_FIGURES.drinking.source}. All uses: ${WATER_FIGURES.allUses.litres} litres, the low end of ${WATER_FIGURES.allUses.source}. A figure set on a person in Supplies is used in place of these.`,
      },
    );
  } else blocks.push({ kind: "para", text: "No people are listed in Supplies, so how much water is needed is not worked out." });
  if (c.outlook && c.outlook.water.days !== null)
    blocks.push({ kind: "para", text: `The water kept, as entered in Supplies, lasts the household ${daysWords(c.outlook.water.days)}.` });
  blocks.push(
    { kind: "heading", text: "What official bodies plan for" },
    {
      kind: "table",
      head: ["Who", "Litres a person a day", "Covers", "Keep for"],
      rows: PLANNING_FIGURES.map((figure) => [
        figure.who,
        figure.litres[0] === figure.litres[1] ? round1(figure.litres[0]).toString() : `${figure.litres[0]} to ${figure.litres[1]}`,
        figure.covers,
        figure.days,
      ]),
    },
  );
  blocks.push({ kind: "list", items: steps(["shelter-at-home.during.11", "flooding.after.11", "shelter-at-home.after.2"], c.used) });
  for (const block of purificationBlocks()) {
    if (block.kind === "title") blocks.push({ kind: "heading", text: block.text });
    else blocks.push(block);
  }
  const points = c.facts.help.find((group) => group.id === "water");
  blocks.push({ kind: "heading", text: "Drinking water near home" });
  if (!c.facts.home) blocks.push({ kind: "para", text: NO_HOME_PLACE });
  else if (!points?.held) blocks.push({ kind: "para", text: points ? notHeld(points, c.country) : "Not held." });
  else if (points.places.length === 0)
    blocks.push({ kind: "para", text: "No drinking water point is mapped near home in the layer held." });
  else {
    blocks.push(placesTable(points, null));
    blocks.push({
      kind: "para",
      text: `${FOOD_WORDS.osm} ${FOOD_WORDS.emergency} Water from anywhere but a working tap is made safe as above.`,
    });
  }
  c.summary.water = [`${Math.ceil(n.drinking * n.days)} litres to drink for ${n.days} days`];
  return blocks;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function foodHygiene(c: Context): Block[] {
  const n = needs(c);
  const blocks: Block[] = [
    { kind: "title", text: "Food, toilet and hygiene" },
    { kind: "heading", text: "Food" },
  ];
  if (n.kcal > 0)
    blocks.push({
      kind: "para",
      text: `The household needs about ${Math.round(n.kcal).toLocaleString("en-GB")} kcal a day, ${Math.round(n.kcal * n.days).toLocaleString("en-GB")} kcal for ${n.days} days${n.petKcal > 0 ? `, and the pets ${Math.round(n.petKcal * n.days).toLocaleString("en-GB")} kcal` : ""}: from the energy figures in Supplies (a person's own figure where one is set). Planning figures, not dietary advice.${
        c.outlook?.food.days !== null && c.outlook ? ` The food kept lasts ${daysWords(c.outlook.food.days)}.` : ""
      }`,
    });
  blocks.push({
    kind: "list",
    items: steps(["power-cut.during.8", "flooding.after.8", "flooding.after.9", "flooding.after.10"], c.used),
  });
  blocks.push(
    { kind: "heading", text: "Keeping clean with little water" },
    { kind: "list", items: [...CDC_HYGIENE.lines] },
    {
      kind: "para",
      text: `Quoted unchanged from ${CDC_HYGIENE.title}, ${CDC_HYGIENE.url}, read ${CDC_HYGIENE.read}. US spelling as written.`,
    },
    { kind: "list", items: steps(["shelter-at-home.during.11"], c.used) },
    { kind: "heading", text: "The toilet" },
    {
      kind: "para",
      text: "Not covered: Outpost holds no published guidance it may reprint on using a toilet when the water or the sewers are off. Your water company or local authority may publish some; ask them now, and write it on a notes page at the back.",
    },
  );
  c.used.cdc = true;
  c.summary["food-hygiene"] = [`${Math.round(n.kcal)} kcal a day`];
  return blocks;
}

function warmthRadio(c: Context): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Warmth, light and the radio" },
    { kind: "heading", text: "Warmth" },
    {
      kind: "list",
      items: steps(
        ["power-cut.during.10", "power-cut.during.11", "cold.during.1", "cold.during.2", "cold.during.3", "cold.before.2"],
        c.used,
      ),
    },
    {
      kind: "para",
      text: "Carbon monoxide: see “Carbon monoxide poisoning” under First aid, from the NHS website, before using any stove, heater or generator indoors.",
    },
    { kind: "heading", text: "Light" },
    { kind: "list", items: steps(["power-cut.before.1", "power-cut.during.16"], c.used) },
    { kind: "heading", text: "The radio" },
    { kind: "list", items: steps(["power-cut.before.2", "power-cut.before.3", "power-cut.during.13"], c.used) },
  ];
  const sets = RECEIVER_PROFILES.filter((profile) => c.answers.receivers.includes(profile.id));
  const summary: string[] = [];
  if (sets.length === 0) {
    blocks.push({
      kind: "para",
      text: "No radio sets were named in the questions, so no stations are listed. Name them, and make the book again.",
    });
  } else if (!c.country) {
    blocks.push({
      kind: "para",
      text: "Which country home is in is not known (no home is marked, or no reference layers are installed), so no stations are listed.",
    });
  } else {
    const kinds = ["emergency", "broadcasters", "weather", "licence-free"] as const;
    const seen = new Set<string>();
    const entries: FrequencyEntry[] = [];
    for (const profile of sets)
      for (const kind of kinds)
        for (const entry of filterFrequencies(c.entries, { kind, place: c.country, receiver: profile.id }))
          if (!seen.has(entry.id) && entry.status !== "closed") {
            seen.add(entry.id);
            entries.push(entry);
          }
    blocks.push({ kind: "para", text: `Our sets: ${sets.map((profile) => profile.label).join(", ")}.` });
    if (entries.length === 0)
      blocks.push({ kind: "para", text: `Outpost's list holds nothing for ${placeName(c.country)} that these sets can receive.` });
    else
      for (const block of frequencyBlocks({
        entries,
        chosen: `What our sets can receive, for ${placeName(c.country)}`,
        today: c.today,
        written: c.made,
      }))
        blocks.push(block.kind === "title" ? { kind: "heading", text: block.text } : block);
    summary.push(...entries.map((entry) => entry.name));
  }
  c.summary["warmth-radio"] = summary;
  return blocks;
}

function journeys(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Journeys" }];
  const summary: string[] = [];
  if (!c.facts.home) return [...blocks, { kind: "para", text: NO_HOME_PLACE }];
  if (c.answers.destinations.length === 0) {
    blocks.push({ kind: "para", text: "No place to go to was given in the questions." });
    return blocks;
  }
  c.used.tobler = true;
  blocks.push({
    kind: "para",
    text: `Each journey is the straight line from home: Outpost has no road routing, so it cannot follow the roads, and the way on the ground is longer. The time on foot is worked out along that line with Tobler's hiking function (5 km/h on level ground, slower up and down the slopes of the ground along the line, from the terrain installed), for a fit adult with no load, and at half that pace, Outpost's allowance for someone hurt, tired, unused to hills, or with small children. ${c.answers.walkHoursPerDay} hours of walking a day is your own figure from the questions.`,
  });
  for (const journey of c.facts.journeys) blocks.push(...journeyBlocks(c, journey, summary));
  for (const missing of c.facts.notMeasured)
    blocks.push({ kind: "heading", text: missing.name }, { kind: "para", text: `Not worked out. ${missing.why}` });
  c.summary.journeys = summary;
  return blocks;
}

function journeyBlocks(c: Context, journey: BookJourney, summary: string[]): Block[] {
  const home = c.facts.home!;
  const blocks: Block[] = [{ kind: "heading", text: `To ${journey.name}` }];
  summary.push(`${journey.name}: ${metresWords(journey.distanceMeters)}`);
  const ground = journey.ground;
  blocks.push({
    kind: "para",
    text: `${metresWords(journey.distanceMeters)} in a straight line, setting out ${direction(journey.bearingDegrees)}. ${
      ground
        ? `Along the line the ground climbs ${ground.climbMeters} m and falls ${ground.descentMeters} m in all, between ${ground.lowestMeters} m and ${ground.highestMeters} m${ground.coverage === "partial" ? " where terrain is installed (not the whole way: the rest is taken as level)" : ""}.`
        : c.facts.terrain
          ? "The installed terrain does not cover the line (or it is longer than 1,000 km), so it is taken as level, which it will not be."
          : "No terrain is installed, so the line is taken as level, which it will not be."
    }`,
  });
  blocks.push({
    kind: "table",
    head: ["Pace", "Hours walking", `Days at ${c.answers.walkHoursPerDay} h a day`],
    right: [1, 2],
    rows: journey.walks.map((walk) => [
      WALK_PACES.find((pace) => pace.id === walk.pace)?.name ?? walk.pace,
      walk.hours.toFixed(1),
      String(walk.days),
    ]),
  });
  const fit = journey.walks.find((walk) => walk.pace === "standard");
  if (fit && fit.stops.length > 0)
    blocks.push(
      { kind: "para", text: "Where each day's walking ends, at the fit pace (numbered on the drawing):" },
      {
        kind: "table",
        head: ["Night", "Along the line", "Near", "Position"],
        rows: fit.stops.map((stop) => [
          String(stop.day),
          metresWords(stop.alongMeters),
          stop.near ? `${stop.near} (${metresWords(stop.nearMeters ?? 0)} away)` : "No town in the layers near",
          at4(stop.lat, stop.lon),
        ]),
      },
    );
  blocks.push({
    kind: "drawing",
    height: 300,
    draw: (x, y, width) => routeDrawing({ home, journey, stops: fit?.stops ?? [] }, { x, y, width, height: 300 }),
    words: `A drawing of the straight line from home to ${journey.name}, with the night stops and towns near it.`,
  });
  const cars = c.answers.vehicles.map((vehicle) => {
    if (vehicle.rangeKm === null) return `${vehicle.name}: its range was not given.`;
    const short = vehicle.rangeKm * 1000 < journey.distanceMeters;
    return `${vehicle.name}: about ${vehicle.rangeKm} km on a full tank or charge, as you gave it${short ? ", less than the straight line: it cannot get there on one" : ""}.`;
  });
  blocks.push(
    {
      kind: "para",
      text: "By car: the roads are not known to Outpost. Keep a paper road map with this book, and agree a route and a second one.",
    },
    ...(cars.length > 0 ? [{ kind: "list" as const, items: cars }] : []),
  );
  return blocks;
}

/** One checklist table: what, how much, and boxes to tick. */
const checklist = (rows: string[][], amount = "How much"): Block => ({
  kind: "table",
  head: ["What", amount, "Got", "To get"],
  rows: rows.map((row) => [...row, box, box]),
});

function checklists(c: Context): Block[] {
  const n = needs(c);
  const people = (c.household?.members ?? []).filter((member) => member.kind === "person").length;
  const blocks: Block[] = [
    { kind: "title", text: "Checklists" },
    {
      kind: "para",
      text: `Worked out for ${people} ${people === 1 ? "person" : "people"}${n.list.length > people ? ` and ${n.list.length - people} ${n.list.length - people === 1 ? "pet" : "pets"}` : ""}, for ${n.days} days.`,
    },
    { kind: "heading", text: "Shopping list for home" },
  ];
  const rows: string[][] = [];
  if (n.drinking > 0) rows.push(["Drinking water", `${Math.ceil(n.drinking * n.days)} litres`]);
  if (n.kcal > 0) rows.push(["Food that needs no cooking", `${Math.round(n.kcal * n.days).toLocaleString("en-GB")} kcal`]);
  if (n.petKcal > 0) rows.push(["Pet food", `${Math.round(n.petKcal * n.days).toLocaleString("en-GB")} kcal`]);
  for (const supply of supplyLines(
    [
      "shelter-at-home.supply.2",
      "shelter-at-home.supply.3",
      "shelter-at-home.supply.4",
      "shelter-at-home.supply.5",
      "shelter-at-home.supply.6",
      "shelter-at-home.supply.7",
      "shelter-at-home.supply.8",
      "shelter-at-home.supply.9",
      "shelter-at-home.supply.10",
      "shelter-at-home.supply.11",
    ],
    c.used,
  ))
    rows.push([supply.name, supply.quantity === null ? "" : `${supply.quantity} ${supply.unit}`]);
  const babies = (c.household?.members ?? []).some((member) => member.band === "under-1" || member.band === "1");
  if (babies) for (const supply of supplyLines(["shelter-at-home.supply.12"], c.used)) rows.push([supply.name, ""]);
  if (n.list.length > people) for (const supply of supplyLines(["shelter-at-home.supply.13"], c.used)) rows.push([supply.name, ""]);
  blocks.push(checklist(rows));
  if (c.missing.length > 0)
    blocks.push(
      { kind: "para", text: "What Supplies works out to buy, from what is kept now:" },
      checklist(c.missing.map((line) => [line.name, line.quantity === null ? line.note : `${line.quantity} ${line.unit}`.trim()])),
    );
  blocks.push({ kind: "list", items: steps(["shelter-at-home.before.3", "shelter-at-home.before.4"], c.used) });

  blocks.push({ kind: "heading", text: "Grab bag" });
  const grab = supplyLines(
    [
      "evacuate.supply.10",
      "evacuate.supply.11",
      "evacuate.supply.12",
      "evacuate.supply.13",
      "evacuate.supply.14",
      "evacuate.supply.7",
      "evacuate.supply.8",
    ],
    c.used,
  ).map((supply) => [supply.name, ""]);
  const pets = (c.household?.members ?? []).filter((member) => member.kind === "pet");
  if (pets.length > 0)
    grab.push(...supplyLines(["evacuate.supply.9"], c.used).map((supply) => [supply.name, pets.map((pet) => pet.name).join(", ")]));
  grab.push(["This book, or a copy of it", ""]);
  blocks.push(checklist(grab), { kind: "list", items: steps(["evacuate.before.1", "evacuate.before.2"], c.used) });

  blocks.push(
    { kind: "heading", text: "First aid kit" },
    {
      kind: "para",
      text: "What the NHS pages quoted under First aid name to use, and nothing else. A pharmacist can say what else to keep.",
    },
    checklist(
      KIT_FROM_PAGES.map((line) => [line.item, line.page]),
      "Named on",
    ),
  );

  blocks.push({
    kind: "heading",
    text: c.answers.vehicles.length > 0 ? `The car: ${c.answers.vehicles.map((vehicle) => vehicle.name).join(", ")}` : "The car",
  });
  blocks.push(
    checklist(
      [...supplyLines(["cold.supply.9", "cold.supply.10", "cold.supply.11", "cold.supply.12", "heat.supply.5"], c.used)].map((supply) => {
        const name = supply.name.replace(/^Car: /, "");
        return [name.charAt(0).toUpperCase() + name.slice(1), ""];
      }),
    ),
  );
  c.summary.checklists = rows.map((row) => `${row[0]}: ${row[1]}`);
  return blocks;
}

function localRisks(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Local risks" }];
  if (!c.facts.home) return [...blocks, { kind: "para", text: NO_HOME_PLACE }];
  const summary: string[] = [];
  blocks.push({ kind: "heading", text: "Flood zones" });
  if (c.facts.floodZones === null)
    blocks.push({
      kind: "para",
      text: "No flood zone layer is held. Outpost's flood zones are the Environment Agency's, for England only; elsewhere your national or local authority publishes flood maps.",
    });
  else if (c.facts.floodZones.length === 0)
    blocks.push({ kind: "para", text: `Home is in none of the flood zones held. ${FLOOD_ZONE_WORDS.caveat}` });
  else {
    blocks.push(
      { kind: "list", items: c.facts.floodZones.map((zone) => `${zone.kindLabel}: ${zone.name}`) },
      { kind: "list", items: [FLOOD_ZONE_WORDS.zone3, FLOOD_ZONE_WORDS.zone2] },
      { kind: "para", text: `${FLOOD_ZONE_WORDS.caveat} ${FLOOD_ZONE_WORDS.notForecast} ${FLOOD_ZONE_WORDS.attribution}` },
    );
    summary.push(...c.facts.floodZones.map((zone) => zone.kindLabel));
  }
  blocks.push({ kind: "heading", text: "The climate at home" });
  const climate = c.facts.climate;
  if (!climate)
    blocks.push({
      kind: "para",
      text: "Outpost holds no climate averages for home. Fetch them under Weather and hazards › Climate (it needs the internet once), and make the book again.",
    });
  else {
    c.used.nasa = true;
    const months = climate.months;
    const pick = (value: (month: (typeof months)[number]) => number | null, most: boolean) => {
      let best: { index: number; value: number } | null = null;
      months.forEach((month, index) => {
        const figure = value(month);
        if (figure === null) return;
        if (!best || (most ? figure > best.value : figure < best.value)) best = { index, value: figure };
      });
      return best as { index: number; value: number } | null;
    };
    const coldest = pick((month) => month.meanC, false);
    const warmest = pick((month) => month.meanC, true);
    const wettest = pick((month) => month.precipMmMonth, true);
    const windiest = pick((month) => month.windMs, true);
    const rows: string[][] = [];
    if (coldest) rows.push(["Coldest month", MONTH_NAMES[coldest.index]!, `${coldest.value.toFixed(1)} °C on average`]);
    if (warmest) rows.push(["Warmest month", MONTH_NAMES[warmest.index]!, `${warmest.value.toFixed(1)} °C on average`]);
    if (wettest) rows.push(["Wettest month", MONTH_NAMES[wettest.index]!, `${Math.round(wettest.value)} mm of rain`]);
    if (windiest) rows.push(["Windiest month", MONTH_NAMES[windiest.index]!, `${windiest.value.toFixed(1)} m/s at 10 m on average`]);
    blocks.push(
      { kind: "table", head: ["", "Month", "Average"], rows },
      {
        kind: "para",
        text: `Monthly averages over ${climate.period}, from NASA POWER, for ${climate.placeName}, fetched ${longDate.format(new Date(climate.fetchedAt))}. An average month hides its worst days: a cold snap or a heatwave goes well past these.`,
      },
    );
    summary.push(...rows.map((row) => `${row[0]}: ${row[1]}`));
  }
  c.summary["local-risks"] = summary;
  return blocks;
}

function childCards(c: Context): Block[] {
  const blocks: Block[] = [{ kind: "title", text: "Cards for the children" }];
  const children = c.answers.people
    .filter((person) => person.childCard)
    .map((person) => c.household?.members.find((member) => member.id === person.memberId))
    .filter((member): member is NonNullable<typeof member> => !!member);
  const teach = steps(["shelter-at-home.before.6"], c.used);
  blocks.push({ kind: "para", text: `${teach.join(" ")} Cut each card out, talk it through, and keep it in a coat or bag.` });
  if (children.length === 0) {
    blocks.push({ kind: "para", text: "No one was given a card in the questions (People and pets: “A card of their own”)." });
    c.summary.children = [];
    return blocks;
  }
  const meet = c.answers.meetingPoints
    .map((point) => ({ point, marker: c.markers.find((marker) => marker.id === point.markerId) }))
    .filter((entry) => entry.marker);
  const grownUps = c.emergencyContacts
    .filter((contact) => contact.phones[0])
    .slice(0, 3)
    .map((contact) => `${contact.displayName}: ${contact.phones[0]!.value}`);
  for (const child of children) {
    const lines = [
      `My name is ${child.name}.`,
      c.facts.home ? `I live at ${c.facts.home.name}.` : "",
      `If I am lost or someone is hurt, I call ${c.number || "the emergency number"}.`,
      ...(grownUps.length > 0 ? ["My grown-ups:", ...grownUps] : []),
      ...meet.map((entry) => `${entry.point.role === "near" ? "We meet at" : "Or we meet at"}: ${entry.marker!.name}`),
    ].filter(Boolean);
    blocks.push({
      kind: "drawing",
      height: 26 + lines.length * 16,
      draw: (x, y, width) => cardDrawing(lines, x, y, Math.min(width, 300)),
      words: lines.join(" "),
    });
  }
  c.summary.children = children.map((child) => child.name);
  return blocks;
}

function cardDrawing(lines: string[], x: number, y: number, width: number): SheetItem[] {
  const items: SheetItem[] = [{ kind: "rect", x, y, width, height: 18 + lines.length * 16, stroke: MUTED, lineWidth: 0.8, dash: [4, 3] }];
  lines.forEach((line, index) => {
    items.push({
      kind: "text",
      x: x + 10,
      y: y + 20 + index * 16,
      text: line,
      size: index === 0 ? 12 : 10.5,
      bold: index === 0,
      color: INK,
      fit: width - 20,
    });
  });
  return items;
}

function notesPages(count: number, paper: "a4" | "letter"): Sheet[] {
  const { width, height } = PAPERS[paper];
  const margin = 42;
  return Array.from({ length: count }, () => {
    const items: SheetItem[] = [{ kind: "text", x: margin, y: margin + 14, text: "Notes", size: 17, bold: true, color: INK }];
    for (let y = margin + 50; y < height - margin - 24; y += 24)
      items.push({ kind: "line", x1: margin, y1: y, x2: width - margin, y2: y, color: [0.75, 0.78, 0.79], width: 0.5 });
    return { width, height, items };
  });
}

function sourcesBlocks(c: Context): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Sources" },
    {
      kind: "para",
      text: "Where every piece of advice in this book comes from, with the date it was read. Pages change: these are as they stood then.",
    },
  ];
  const plan = [...c.used.plan].map((id) => sourceById(id)).filter((source): source is PlanSource => !!source);
  if (plan.length > 0) {
    blocks.push({ kind: "heading", text: "Official guidance" });
    blocks.push({
      kind: "list",
      items: plan.map((source) => `${source.publisher}, “${source.title}”, ${source.url}. ${source.pageDate}; read ${source.checked}.`),
    });
    for (const source of plan) {
      const attribution = termsOf(source)?.attribution;
      if (attribution) c.attributions.add(attribution);
    }
  }
  if (c.used.nhs.size > 0) {
    blocks.push({ kind: "heading", text: "First aid" });
    blocks.push({
      kind: "list",
      items: FIRST_AID_PAGES.filter((page) => c.used.nhs.has(page.id)).map(
        (page) => `NHS website, “${page.title}”, ${page.url}. Page last reviewed ${page.reviewed}; read ${NHS_READ}.`,
      ),
    });
    blocks.push({ kind: "para", text: `${NHS_CREDIT} Lines are quoted unchanged.` });
  }
  if (c.used.cdc) blocks.push({ kind: "list", items: [`${CDC_HYGIENE.title}, ${CDC_HYGIENE.url}; read ${CDC_HYGIENE.read}.`] });
  if (c.used.water) {
    blocks.push({ kind: "heading", text: "Water" });
    blocks.push({
      kind: "list",
      items: Object.values(WATER_SOURCES)
        .filter((source): source is { name: string; url: string; read: string } => "url" in source && "read" in source)
        .map((source) => `${source.name}, ${source.url}; read ${source.read}.`),
    });
  }
  const figures: string[] = [];
  if (c.used.tobler)
    figures.push(
      "Walking pace: W. Tobler, “Three presentations on geographical analysis and modeling”, NCGIA Technical Report 93-1 (1993), the hiking function W = 6 exp(-3.5 |S + 0.05|) km/h.",
    );
  if (c.used.nasa)
    figures.push(
      "Climate and the wind's direction: The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.",
    );
  if (c.used.layers.size > 0)
    figures.push(
      `Places near home: the reference layers installed on this Outpost (${[...c.used.layers]
        .map((id) => REFERENCE_LAYER_INFO[id]?.label)
        .filter(Boolean)
        .join(
          ", ",
        )}); each layer's publisher and licence is listed under Maps › Layers. OpenStreetMap data © OpenStreetMap contributors, Open Database Licence.`,
    );
  figures.push(`Energy needs: ${c.household ? energyTableSource(energyTableOf(c.household)) : FNNE_SOURCE}, as Supplies uses them.`);
  blocks.push({ kind: "heading", text: "Figures and places" }, { kind: "list", items: figures });
  if (c.attributions.size > 0) blocks.push({ kind: "heading", text: "Licences" }, { kind: "list", items: [...c.attributions] });
  return blocks;
}

// ── The book ────────────────────────────────────────────────────────────────

const SECTION_MAKERS: Record<Exclude<BookSectionId, "notes">, (c: Context) => Block[]> = {
  "first-minutes": firstMinutes,
  people,
  "keeping-in-touch": keepingInTouch,
  "first-aid": firstAid,
  "help-near-home": helpNearHome,
  "keep-away": keepAway,
  situations,
  water,
  "food-hygiene": foodHygiene,
  "warmth-radio": warmthRadio,
  journeys,
  checklists,
  "local-risks": localRisks,
  children: childCards,
};

/**
 * A web address longer than a line has nowhere to break, and runs off the page: it is
 * broken after a slash, with a space, so that it wraps. The reader types it in anyway.
 */
export function breakLong(text: string, longest = 60): string {
  return text.replace(/\S{61,}/g, (word) => {
    if (word.length <= longest) return word;
    let out = "";
    let run = 0;
    for (const character of word) {
      out += character;
      run += 1;
      if (run >= 40 && (character === "/" || character === "-" || character === "_")) {
        out += " ";
        run = 0;
      }
    }
    return out;
  });
}

const wrapLong = (blocks: Block[]): Block[] =>
  blocks.map((block) =>
    block.kind === "para"
      ? { ...block, text: breakLong(block.text) }
      : block.kind === "list"
        ? { ...block, items: block.items.map((item) => breakLong(item)) }
        : block,
  );

/** Takes the "Page n of m" toSheets writes off a page, so that the book can number its pages from the cover. */
function withoutPageNumber(sheet: Sheet): Sheet {
  return {
    ...sheet,
    items: sheet.items.filter((item) => !(item.kind === "text" && item.anchor === "end" && /^Page \d+ of \d+$/.test(item.text))),
  };
}

function numbered(pages: Sheet[], margin = 42): Sheet[] {
  return pages.map((page, index) => ({
    ...page,
    items: [
      ...page.items,
      { kind: "text", x: page.width - margin, y: page.height - margin + 8, text: `${index + 1}`, size: 7.5, color: MUTED, anchor: "end" },
    ],
  }));
}

function frontBlocks(c: Context, contents: Array<{ label: string; page: number }>): Block[] {
  const name = c.answers.householdName.trim();
  const blocks: Block[] = [
    { kind: "title", text: name ? `${name}: household book` : "Our household book" },
    { kind: "para", text: `Made on ${longDate.format(c.made)} from what Outpost held then.` },
    {
      kind: "table",
      head: ["In an emergency", ""],
      rows: [
        ["Call", c.number || "not given"],
        ...(c.facts.home ? [["Home", `${c.facts.home.name}, ${at4(c.facts.home.lat, c.facts.home.lon)}`]] : []),
      ],
    },
  ];
  const changes = bookChanges(c.previous?.summary ?? null, c.summary);
  blocks.push({
    kind: "heading",
    text: c.previous ? `Changed since the book of ${longDate.format(new Date(c.previous.madeAt))}` : "The first book",
  });
  if (!c.previous) blocks.push({ kind: "para", text: "This is the first book made. The next one will say what changed since." });
  else if (changes.length === 0)
    blocks.push({ kind: "para", text: "Nothing the book compares has changed. Replace the old copy anyway: this one is dated." });
  else
    blocks.push({
      kind: "list",
      items: changes
        .slice(0, 14)
        .map((change) =>
          [
            `${bookSectionLabel(change.section)}:`,
            change.added.length > 0
              ? `new ${change.added.slice(0, 4).join("; ")}${change.added.length > 4 ? ` and ${change.added.length - 4} more` : ""}.`
              : "",
            change.removed.length > 0
              ? `gone ${change.removed.slice(0, 4).join("; ")}${change.removed.length > 4 ? ` and ${change.removed.length - 4} more` : ""}.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        ),
    });
  blocks.push(
    { kind: "heading", text: "What this book cannot know" },
    {
      kind: "list",
      items: [
        "Whether a place listed is open, stocked or still there: it is what the reference layers held.",
        "The roads: each journey is a straight line, and the way on the ground is longer.",
        "What your emergency services will say on the day. Follow them, and official warnings, over anything here.",
        "Anything that changed after it was made. Make it again when the household, its plans or its places change.",
        "Medical advice of its own: it quotes the NHS website and records what you typed, and checks no dose.",
        ...(c.country !== "GB"
          ? ["Much of the official guidance in it is the UK government's, the guidance Outpost holds. Your own country's may differ."]
          : []),
      ],
    },
    ...steps(["shelter-at-home.before.1", "shelter-at-home.before.2"], c.used).map((line) => ({ kind: "para" as const, text: line })),
    { kind: "heading", text: "Contents" },
    { kind: "table", head: ["", "Page"], right: [1], rows: contents.map((entry) => [entry.label, String(entry.page)]) },
  );
  return blocks;
}

/** The whole book. */
export function makeBook(inputs: BookInputs): MadeBook {
  const country = inputs.facts.home?.country ?? null;
  const c: Context = {
    ...inputs,
    number: emergencyNumberFor(inputs.answers, country, inputs.plans),
    country,
    used: new Used(),
    summary: {},
    attributions: new Set(),
  };
  const paper = inputs.answers.paper;
  const footer = `${inputs.answers.householdName.trim() || "Household"} book, ${longDate.format(inputs.made)}`;
  const parts: Array<{ id: BookSectionId | "sources"; label: string; pages: Sheet[] }> = [];
  for (const section of BOOK_SECTIONS) {
    if (!inputs.answers.sections.includes(section.id)) continue;
    if (section.id === "notes") continue;
    const blocks = SECTION_MAKERS[section.id](c);
    parts.push({
      id: section.id,
      label: section.label,
      pages: toSheets(wrapLong(blocks), `${footer} · ${section.label}`, paper).map(withoutPageNumber),
    });
  }
  parts.push({
    id: "sources",
    label: "Sources",
    pages: toSheets(wrapLong(sourcesBlocks(c)), `${footer} · Sources`, paper).map(withoutPageNumber),
  });
  if (inputs.answers.sections.includes("notes") && inputs.answers.notesPages > 0)
    parts.push({ id: "notes", label: "Pages for notes", pages: notesPages(inputs.answers.notesPages, paper) });

  // The front part's length decides the page numbers in its own contents: laid out until it stops changing.
  let frontLength = 1;
  let front: Sheet[] = [];
  let contents: Array<{ label: string; page: number }> = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let page = frontLength + 1;
    contents = parts.map((part) => {
      const entry = { label: part.label, page };
      page += part.pages.length;
      return entry;
    });
    front = toSheets(frontBlocks(c, contents), footer, paper).map(withoutPageNumber);
    if (front.length === frontLength) break;
    frontLength = front.length;
  }
  const pages = numbered([...front, ...parts.flatMap((part) => part.pages)]);
  return {
    pages,
    sections: parts.map((part) => part.id).filter((id): id is BookSectionId => id !== "sources"),
    contents,
    summary: c.summary,
  };
}
