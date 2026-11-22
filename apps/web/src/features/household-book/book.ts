/**
 * The household book: what the household answered, what Outpost holds and what published
 * sources say, made into one printed document. A cover, a page with the contents, what
 * changed since the last book and what the book cannot know, then each chosen section
 * under its own number, then the sources with the dates they were read.
 *
 * Every piece of advice is a source's words: the official guidance the emergency plan
 * templates carry (paraphrased under the Open Government Licence, as there), the NHS
 * website's first aid pages (unchanged, credited as its terms ask), FEMA's words on the
 * recovery position, the CDC's, EPA's, WHO's and the US Army's words on water (quoted).
 * The household's own emergency plans go in as they wrote them, as their plan. Outpost's
 * own words say only what a thing is, where it is, how a figure was worked out and what
 * is not known. The drawings show what the words beside them say and no more.
 *
 * Laid out with the print kit (features/print-kit). Pure: what Outpost holds in, a
 * document out. Nothing touches the page or the network; render.ts makes the PDF.
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
  bookPlanIds,
  bookSectionLabel,
  type CommsResponse,
  type ContactDto,
  categoryLabel,
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
  GRID_FORMATS,
  type Household,
  licenceLine,
  type MarkerDto,
  MEDICAL_CAVEAT,
  MONTH_NAMES,
  medicineLeft,
  memberNeeds,
  metresWords,
  NO_HOME_PLACE,
  NO_RADIO_LICENCE,
  PLAN_PHASES,
  type PlanSource,
  placeName,
  type RadioUse,
  RECEIVER_PROFILES,
  REFERENCE_LAYER_INFO,
  type ReferenceLayerId,
  type RepeaterDto,
  type ResolvedContact,
  type ShoppingSuggestion,
  type SuppliesResponse,
  type SupplyOutlook,
  sourceById,
  type TemplateStep,
  templateById,
  templateStep,
  termsOf,
  WALK_PACES,
  WATER_FIGURES,
  withinDegrees,
} from "@outpost/shared";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { readableOf } from "@/features/emergency-plans/printable";
import { frequencyBlocks, frequencyLine } from "@/features/frequencies/document";
import { binderPlaces } from "@/features/household-papers/binder-places";
import { commsBlocks, usedEntries } from "@/features/household-papers/comms-words";
import { type GrabHousehold, type GrabPerson, gridLines } from "@/features/household-papers/grab-cards";
import type { PaperPerson } from "@/features/household-papers/household-data";
import type { OpenedSheet } from "@/features/household-papers/medical-crypto";
import { type ContactsNow, medicalBlocks, recordOf } from "@/features/household-papers/medical-words";
import type { PdfPicture } from "@/features/maps/print/pdf";
import {
  blocksToContent,
  boiling,
  bottleFilter,
  bullets,
  type CalloutKind,
  type ChecklistGroup,
  callout,
  card,
  checklist,
  chestCompressions,
  contents as contentsTable,
  cover,
  dataTable,
  figure,
  heading,
  label,
  measureOf,
  note,
  notesPage,
  PRINT_COLOURS,
  PRINT_MARGINS,
  PRINT_PAPERS,
  PRINT_SPACE,
  type PrintPart,
  para,
  printDocument,
  quote,
  rainCatch,
  recoveryPosition,
  sectionHeader,
  sheetItemsToSvg,
  steps as stepList,
  twoColumns,
} from "@/features/print-kit";
import type { Block } from "@/features/propagation/plans/document";
import { BLEACH_STEPS, METHODS, PLANNING_FIGURES, WATER_SOURCES } from "@/features/tools/water/guidance";
import { purificationBlocks } from "@/features/tools/water/purification-sheet";
import { CDC_HYGIENE, FIRST_AID_PAGES, FIRST_AID_POINTERS, KIT_FROM_PAGES, NHS_CREDIT, NHS_READ, RECOVERY_POSITION } from "./first-aid";
import { routeDrawing } from "./route-drawing";
import { CDC_SAFE_WATER, FM_21_76 } from "./water-words";

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
  markers: MarkerDto[];
  /** The contacts the places the household would go to link to. */
  destinationContacts: Record<string, ResolvedContact | null | undefined>;
  entries: readonly FrequencyEntry[];
  /** When the book is made: printed on it. */
  made: Date;
  today: string;
  previous: BookMade | null;
  /** What is kept, from Supplies. */
  supplies: SuppliesResponse | null;
  /** Each person's grab card and what every card carries; null when not worked out. */
  grab: { people: GrabPerson[]; household: GrabHousehold } | null;
  /** Repeaters near home from Outpost's list, nearest first; null when the list could not be read. */
  repeaters: RepeaterDto[] | null;
  /** The map of home and the meeting points, drawn from the offline map before the book is made; absent, there is none. */
  placesMap?: { block: Block; pictures: ReadonlyMap<string, PdfPicture> } | null;
}

export interface MadeBook {
  /** The document, for `renderPdf`. */
  document: TDocumentDefinitions;
  sections: BookSectionId[];
  /** Each numbered part, in order, with the id its first page is found by. */
  contents: Array<{ number: number; label: string; id: string }>;
  /** A few lines a section, for the next book to compare itself with. */
  summary: Record<string, string[]>;
}

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
  fema = false;
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

// ── Sections ────────────────────────────────────────────────────────────────

interface Context extends BookInputs {
  number: string;
  country: string | null;
  used: Used;
  summary: Record<string, string[]>;
  /** The licence statements the words used need, once each. */
  attributions: Set<string>;
  /** The width of the page's text, and of one of two columns. */
  measure: number;
  half: number;
}

interface Section {
  /** The grey line under the section's title. */
  subtitle: string;
  content: Content[];
}

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

/** Blocks from another paper (a medical sheet, the communication plan, the frequencies), in the book's look. */
const fromBlocks = (c: Context, blocks: Block[], width = c.measure): Content[] => blocksToContent(wrapLong(blocks), width);

/** The note a section ends with when it carries the UK government's words and home is elsewhere. */
function ukWordsNote(country: string | null, number: string): Content[] {
  if (country === "GB") return [];
  return [
    note(
      `These are the words of UK official guidance, the official guidance Outpost holds. Where they say 999, call ${number || "your emergency number"}${
        country ? ` in ${placeName(country)}` : ""
      }, and follow your own country's emergency services where they say something different.`,
    ),
  ];
}

function firstMinutes(c: Context): Section {
  const content: Content[] = [
    callout("act", "If anyone is in danger now", para(`Call **${c.number || "the emergency services"}**.`, 0), { keep: true }),
  ];
  const group = (title: string, lines: string[]): Content[] => (lines.length > 0 ? [label(title), stepList(lines)] : []);
  content.push(
    twoColumns(
      [
        ...group("If there is a fire inside", steps(["evacuate.during.3", "evacuate.during.4"], c.used)),
        ...group("If you are told to leave", steps(["evacuate.during.1", "evacuate.during.5"], c.used)),
        ...group("When you are safe", steps(["evacuate.after.4"], c.used)),
      ],
      [
        ...group(
          "If the emergency is outside",
          steps(["shelter-at-home.during.1", "shelter-at-home.during.2", "shelter-at-home.during.3", "shelter-at-home.during.4"], c.used),
        ),
      ],
    ),
  );
  const near = c.answers.meetingPoints.filter((point) => point.role === "near");
  const away = c.answers.meetingPoints.filter((point) => point.role === "away");
  const named = (ids: typeof near) => ids.map((point) => c.markers.find((marker) => marker.id === point.markerId)?.name).filter(Boolean);
  const lines: string[] = [];
  if (named(near).length > 0) lines.push(`**Meet near home at:** ${named(near).join(", then ")}.`);
  if (named(away).length > 0) lines.push(`**Meet outside the area at:** ${named(away).join(", then ")}.`);
  if (c.comms?.plan.checkIns.trim()) lines.push(`**Check in:** ${c.comms.plan.checkIns.trim()}.`);
  const firstContact = c.emergencyContacts[0];
  if (firstContact)
    lines.push(`**Tell:** ${firstContact.displayName}${firstContact.phones[0] ? `, ${firstContact.phones[0].value}` : ""}.`);
  if (lines.length > 0) content.push(callout("know", "Our own plan", bullets(lines), { keep: true }));
  else
    content.push(
      callout(
        "warn",
        "Our own plan is not written yet",
        para(
          "No meeting point or contact was given in the questions. Add them, and make the book again, so this page says where to go and who to tell.",
          0,
        ),
      ),
    );
  content.push(...ukWordsNote(c.country, c.number));
  c.summary["first-minutes"] = [`Emergency number ${c.number}`, ...lines.map((line) => line.replace(/\*\*/g, ""))];
  return { subtitle: "What to do at once. Keep this page where everyone can find it.", content };
}

function people(c: Context): Section {
  const content: Content[] = [];
  const members = c.household?.members ?? [];
  const persons = members.filter((member) => member.kind === "person");
  const pets = members.filter((member) => member.kind === "pet");
  const summary: string[] = [];
  if (persons.length === 0) {
    content.push(para("No people are listed in Supplies. Add them in the questions or under Supplies, and make the book again."));
  } else {
    content.push(
      dataTable(
        ["Name", "Age", "Needs", "Carries"],
        persons.map((member) => {
          const extra = c.answers.people.find((person) => person.memberId === member.id);
          summary.push([member.name, extra?.needs].filter(Boolean).join(": "));
          return [
            member.name || "Unnamed",
            member.band ? (bandLabel(member.band) ?? "") : "",
            extra?.needs.trim() || member.note.trim(),
            extra?.carries.trim() ?? "",
          ];
        }),
        { bold: [0] },
      ),
    );
  }
  if (pets.length > 0) {
    content.push(
      heading("Pets"),
      dataTable(
        ["Name", "Note"],
        pets.map((pet) => [pet.name, pet.note]),
        { bold: [0] },
      ),
    );
    summary.push(...pets.map((pet) => `Pet: ${pet.name}`));
  }

  const readable = c.people
    .map((person) => ({ person, record: person.sheet ? recordOf(person.sheet, c.opened) : null }))
    .filter((entry): entry is { person: PaperPerson; record: NonNullable<typeof entry.record> } => entry.record !== null);
  const locked = c.people.filter((person) => person.sheet?.encrypted && !c.opened.has(person.sheet.id)).length;
  const allergies = readable.flatMap(({ person, record }) => record.allergies.map((line) => [person.name, line.what, line.reaction]));
  if (allergies.length > 0)
    content.push(callout("warn", "Allergies", dataTable(["Who", "Allergic to", "What happens"], allergies, { bold: [0] }), { keep: true }));
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
    content.push(
      heading("Medicines"),
      dataTable(["Who", "Medicine", "Dose and when", "Kept", "Lasts"], medicines, { bold: [0, 1] }),
      note("How long a medicine lasts is the count typed on its medical sheet, less a day's use for each day since it was counted."),
    );
    summary.push(...medicines.map((row) => `${row[0]}: ${row[1]}`));
  }
  if (locked > 0)
    content.push(
      note(
        `${locked === 1 ? "One medical sheet is" : `${locked} medical sheets are`} encrypted and not open on the device this book was made on, so ${locked === 1 ? "it is" : "they are"} not in it.`,
      ),
    );
  if (c.answers.medicalInFull)
    for (const { person, record } of readable)
      content.push(...fromBlocks(c, medicalBlocks(person.sheet?.name ?? person.name, record, c.medicalContacts, c.today, false)));
  if (readable.length > 0) content.push(note(MEDICAL_CAVEAT));
  c.summary.people = summary;
  return { subtitle: "Who lives here, what each person needs, and their medicines.", content };
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

/** The plans that go in the book, by the answers. */
const bookPlans = (c: Context) => {
  const included = new Set(
    bookPlanIds(
      c.answers,
      c.plans.map((each) => each.plan),
    ),
  );
  return c.plans.filter((each) => included.has(each.plan.id));
};

/** One page for each plan, to put on the fridge: the number, what to do, who to call, where to meet. */
function fridgeSheets(c: Context): Section {
  const plans = bookPlans(c);
  const content: Content[] = [];
  plans.forEach((own, index) => {
    const readable = readableOf(own.plan, own.resolved);
    const during = readable.steps.filter((step) => step.phase === "during").map((step) => step.text);
    const shown = during.length > 0 ? during : readable.steps.map((step) => step.text);
    content.push(
      {
        stack: [
          { text: `Fridge sheet · ${readable.kind}`, fontSize: 8, bold: true, color: PRINT_COLOURS.accent, characterSpacing: 0.4 },
          { text: readable.name, fontSize: 22, bold: true, margin: [0, 2, 0, 8] },
        ],
        pageBreak: index > 0 ? "before" : undefined,
        headlineLevel: 2,
      } as Content,
      callout(
        "act",
        "In an emergency, call",
        { text: readable.emergencyNumber || c.number || "not given", fontSize: 26, bold: true, color: PRINT_COLOURS.act },
        { keep: true },
      ),
      twoColumns(
        [
          label(during.length > 0 ? "What we do" : "Our steps"),
          stepList(shown.slice(0, 14)),
          ...(shown.length > 14
            ? [note(`And ${shown.length - 14} more steps: the plan in full is under “What to do, by situation”.`)]
            : []),
        ],
        [
          ...(readable.contacts.length > 0
            ? [
                callout(
                  "know",
                  "Who to call",
                  bullets(
                    readable.contacts.map(
                      (contact) =>
                        `**${contact.name}**${contact.outOfArea ? " (out of the area)" : ""}: ${contact.numbers.map((number) => number.value).join(", ") || "no number"}`,
                    ),
                  ),
                ),
              ]
            : []),
          ...(readable.places.length > 0
            ? [
                callout(
                  "know",
                  "Where we meet",
                  bullets(readable.places.map((place) => `**${place.role}:** ${place.name}${place.coords ? ` (${place.coords})` : ""}`)),
                ),
              ]
            : []),
          ...(readable.comms.length > 0 ? [callout("know", "Keeping in touch", bullets(readable.comms))] : []),
        ],
      ),
      note("Our household's own plan, made in advance. In a real emergency, follow the emergency services and official warnings."),
    );
  });
  if (plans.length === 0) content.push(para("No emergency plan is in the book. Make one under Preparedness › Emergency plans."));
  c.summary["fridge-sheets"] = plans.map((own) => own.plan.name);
  return { subtitle: "One page for each emergency plan. Cut it out and put it where everyone will see it.", content };
}

function keepingInTouch(c: Context): Section {
  const content: Content[] = [];
  const summary: string[] = [];
  content.push(callout("act", "Emergency services", para(`Call **${c.number || "not given"}**.`, 0), { keep: true }));
  if (c.emergencyContacts.length > 0) {
    content.push(
      heading("Contacts marked for emergencies"),
      dataTable(
        ["Name", "Phone", "Callsign", "Note"],
        c.emergencyContacts.map((contact) => [
          `**${contact.displayName}**`,
          contact.phones.map((phone) => `${phone.value}${phone.label ? ` (${phone.label})` : ""}`).join("\n"),
          contact.callsign,
          contact.emergencyNote,
        ]),
      ),
    );
    summary.push(...c.emergencyContacts.map((contact) => `Contact: ${contact.displayName}`));
  } else content.push(note("No contact is marked for emergencies. Mark them under Contacts, and make the book again."));
  if (c.comms?.plan.updatedAt) {
    const { plan, resolved } = c.comms;
    content.push(heading("When the phones are down"));
    content.push(...fromBlocks(c, commsBlocks(plan, resolved, null, c.entries, { checkIn: false, title: false })));
    // A page for each person, with their own part of the plan, as the binder had.
    const people = c.people
      .map((person) => plan.people.find((entry) => entry.memberId === person.memberId && person.memberId) ?? null)
      .filter((person): person is NonNullable<typeof person> => person !== null);
    for (const person of people)
      content.push(
        { ...(heading(`For ${person.name}`) as object), pageBreak: "before" } as Content,
        ...fromBlocks(c, commsBlocks(plan, resolved, person, c.entries, { checkIn: false, title: false })),
      );
    summary.push(...plan.situations.map((situation) => `Situation: ${situation.name}`));
  } else {
    content.push(
      callout(
        "know",
        "No communication plan yet",
        para("Make one under Preparedness › Keeping in touch: what to try first and next when phones are down, and when to check in.", 0),
      ),
    );
  }
  c.summary["keeping-in-touch"] = summary;
  return { subtitle: "Who to call, and what to try when the phones are down.", content };
}

/** A place's position in every grid format Outpost writes, one to a line; a grid that does not reach it is left out. */
const positions = (lat: number, lon: number) =>
  gridLines(
    lat,
    lon,
    GRID_FORMATS.map((format) => format.id),
  ).join("\n");

function places(c: Context): Section {
  const content: Content[] = [];
  const summary: string[] = [];
  const { mapped, described } = binderPlaces({ markers: c.markers, plans: bookPlans(c) });
  if (c.placesMap) {
    const block = c.placesMap.block;
    if (block.kind === "drawing") {
      const pictures = new Map([...c.placesMap.pictures].map(([id, picture]) => [id, `data:image/jpeg;base64,${base64Of(picture.jpeg)}`]));
      const items = block.draw(0, 0, c.measure);
      content.push(
        figure(sheetItemsToSvg(items, { x: 0, y: 0, width: c.measure, height: block.height }, pictures), {
          width: c.measure,
          caption: block.words ?? "A map of home and the meeting points, numbered as in the list below.",
        }),
      );
    }
  } else if (mapped.length > 0)
    content.push(
      note("The map of these places is drawn from the offline map on the device the book is made on; none was drawn for this one."),
    );
  if (mapped.length > 0)
    content.push(
      heading("Where each place is"),
      dataTable(
        ["", "What for", "Where", "Position", "Note"],
        mapped.map((place) => [String(place.number), place.role, `**${place.name}**`, positions(place.lat, place.lon), place.note]),
      ),
    );
  summary.push(...mapped.map((place) => `${place.role}: ${place.name}`));
  const pointRows = c.answers.meetingPoints.map((point) => {
    const marker = c.markers.find((each) => each.id === point.markerId);
    summary.push(`Meet: ${marker?.name ?? "a place no longer saved"}`);
    return [
      point.role === "near" ? "Near home" : "Outside the area",
      `**${marker?.name ?? "No longer on the map"}**`,
      marker ? positions(marker.lat, marker.lon) : "",
      point.note,
    ];
  });
  if (pointRows.length > 0) content.push(heading("Where we meet"), dataTable(["When", "Where", "Position", "Note"], pointRows));
  if (described.length > 0)
    content.push(
      label("Described in a plan, not on the map"),
      bullets(described.map((place) => `**${place.role}: ${place.name}.** ${place.note || "Described only: no saved place on the map."}`)),
    );
  const home = c.facts.home;
  const destinations = c.answers.destinations.map((destination) => {
    const contact = destination.contactId ? c.destinationContacts[destination.contactId] : null;
    const journey = c.facts.journeys.find((each) => each.destinationId === destination.id);
    summary.push(`Go to: ${destination.name}`);
    return [
      `**${destination.name}**`,
      contact ? `${contact.displayName}${contact.phones[0] ? `, ${contact.phones[0].value}` : ""}` : "",
      journey && home ? `${metresWords(journey.distanceMeters)} ${compassPoint(journey.bearingDegrees)}` : "",
      destination.note,
    ];
  });
  if (destinations.length > 0)
    content.push(heading("The people we would go to"), dataTable(["Who", "Contact", "From home", "Note"], destinations));
  if (content.length === 0)
    content.push(
      para("No home or meeting point is saved yet. Mark home on the map, and add meeting points in the questions or in a plan."),
    );
  c.summary.places = summary;
  return { subtitle: "Where home and every meeting point is, in several grid formats, and who you would go to.", content };
}

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/**
 * Whether a frequency needs a licence, in the one plain line every radio screen uses
 * (`licenceLine`, from the regulators' statements listed under Help › What needs a radio
 * licence), with what Outpost's list says of listening to it where it says anything.
 */
function licenceWords(entry: FrequencyEntry): string {
  const use: RadioUse =
    entry.kind === "licence-free"
      ? "licence-free"
      : entry.kind === "amateur"
        ? "listen-and-transmit"
        : entry.kind === "distress"
          ? "listen-restricted"
          : "listen";
  return [licenceLine(use, NO_RADIO_LICENCE)?.text, entry.listening].filter(Boolean).join(" ");
}

const frequencyRow = (entry: FrequencyEntry, first = false) => [
  `${first ? "Our plan: " : ""}**${entry.name}**`,
  entry.frequencies.length > 6
    ? `${entry.frequencies
        .slice(0, 4)
        .map((frequency) => frequencyLine(frequency))
        .join("; ")}; and ${entry.frequencies.length - 4} more, all under Radio › Frequencies in Outpost`
    : entry.frequencies.map((frequency) => frequencyLine(frequency)).join("; "),
  licenceWords(entry),
];

function frequencies(c: Context): Section {
  const content: Content[] = [];
  const summary: string[] = [];
  const planned = c.comms?.plan.updatedAt ? usedEntries(c.comms.plan, c.entries) : [];
  if (planned.length > 0) {
    content.push(
      callout("act", "Our communication plan's channels", [
        dataTable(
          ["Channel", "Frequency", "Licence"],
          planned.map((entry) => frequencyRow(entry, true)),
        ),
        note("Marked “Our plan” wherever they appear below."),
      ]),
    );
    summary.push(...planned.map((entry) => `Plan: ${entry.name}`));
  }
  const ours = new Set(planned.map((entry) => entry.id));
  if (!c.country)
    content.push(
      note(
        "Which country home is in is not known (no home is marked, or no reference layers are installed), so only the plan's channels are listed.",
      ),
    );
  else {
    const groups: Array<{ kind: "licence-free" | "emergency" | "distress" | "broadcasters" | "weather"; title: string }> = [
      { kind: "licence-free", title: "Licence-free channels" },
      { kind: "emergency", title: "Emergency broadcasting" },
      { kind: "distress", title: "Distress and calling" },
      { kind: "broadcasters", title: "Broadcasters to listen to" },
      { kind: "weather", title: "Weather" },
    ];
    for (const group of groups) {
      // Broadcasts are the ones the household's own sets can receive, where it named them.
      const listen = group.kind === "broadcasters" || group.kind === "weather";
      const receivers = listen ? c.answers.receivers : [];
      const seen = new Set<string>();
      const entries = (receivers.length > 0 ? receivers : [undefined])
        .flatMap((receiver) => filterFrequencies(c.entries, { kind: group.kind, place: c.country ?? undefined, receiver }))
        .filter((entry) => entry.status !== "closed" && !seen.has(entry.id) && seen.add(entry.id) !== undefined);
      if (entries.length === 0) continue;
      content.push(
        label(group.title),
        dataTable(
          ["Name", "Frequency", "Licence"],
          entries.map((entry) => frequencyRow(entry, ours.has(entry.id))),
        ),
      );
      summary.push(...entries.map((entry) => entry.name));
    }
    content.push(
      note(`From Outpost's list of frequencies for ${placeName(c.country)}. Check a set's own rules before talking on anything.`),
    );
  }
  content.push(heading("Repeaters near home"));
  if (!c.facts.home) content.push(note(NO_HOME_PLACE));
  else if (c.repeaters === null) content.push(note("Outpost's repeater list could not be read when the book was made."));
  else if (c.repeaters.length === 0)
    content.push(note("No repeater in Outpost's repeater list is near home. Bring a list in under Radio › Repeaters."));
  else {
    content.push(
      dataTable(
        ["Callsign", "Listen on", "Talk on", "Tone", "Where", "From home"],
        c.repeaters.map((repeater) => [
          `**${repeater.callsign}**`,
          `${(repeater.outputHz / 1e6).toFixed(4)} MHz`,
          repeater.inputHz === null ? "" : `${(repeater.inputHz / 1e6).toFixed(4)} MHz`,
          repeater.ctcssHz ? `${repeater.ctcssHz} Hz` : repeater.dcsCode ? `DCS ${repeater.dcsCode}` : "",
          repeater.place,
          repeater.distanceMeters !== undefined
            ? `${metresWords(repeater.distanceMeters)}${repeater.bearingDegrees !== undefined ? ` ${compassPoint(repeater.bearingDegrees)}` : ""}`
            : "",
        ]),
        { right: [1, 2] },
      ),
      note(
        `Amateur radio repeaters. ${licenceLine("listen-and-transmit", NO_RADIO_LICENCE)?.text ?? ""} From Outpost's repeater list, as brought in.`,
      ),
    );
    summary.push(...c.repeaters.map((repeater) => `Repeater: ${repeater.callsign}`));
  }
  c.summary.frequencies = summary;
  return {
    subtitle: "The communication plan's channels first, then what home's country has, each with whether it needs a licence.",
    content,
  };
}

function supplies(c: Context): Section {
  const items = c.supplies?.items ?? [];
  const content: Content[] = [];
  if (c.outlook)
    content.push(
      callout(
        "know",
        "How long it lasts",
        para(
          `Food for ${daysWords(c.outlook.food.days)}, water for ${daysWords(c.outlook.water.days)}, for the household as set in Supplies. Planning figures, not dietary advice.`,
          0,
        ),
        { keep: true },
      ),
    );
  if (items.length === 0) content.push(para("Nothing is kept in Supplies yet."));
  else
    content.push(
      dataTable(
        ["What", "How much", "Where", "Date"],
        [...items]
          .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
          .map((item) => [
            `**${item.name}** (${categoryLabel(item.category)})`,
            `${item.quantity} ${item.unit}`.trim(),
            item.location,
            item.date ?? "",
          ]),
      ),
    );
  c.summary.supplies = items.map((item) => item.name);
  return { subtitle: "What is kept, where and until when.", content };
}

function grabCards(c: Context): Section {
  const content: Content[] = [];
  const people = c.grab?.people ?? [];
  const household = c.grab?.household;
  if (!household || people.length === 0) {
    c.summary["grab-cards"] = [];
    return {
      subtitle: "A card for each person to carry.",
      content: [para("No people are listed yet. Add them in the questions or under Supplies.")],
    };
  }
  const width = c.half - 24;
  const small = (text: string): Content => ({ text, fontSize: 7.5, color: PRINT_COLOURS.muted, margin: [0, 3, 0, 1] });
  const cards = people.map((person) => {
    const lines: Content[] = [
      { text: "In an emergency", fontSize: 8, bold: true, color: PRINT_COLOURS.act },
      { text: person.name || "Name not given", fontSize: 13, bold: true, margin: [0, 1, 0, 2] },
      {
        text: [`Call `, { text: household.emergencyNumber || c.number || "the emergency services", bold: true, color: PRINT_COLOURS.act }],
        fontSize: 10.5,
      },
    ];
    if (person.sheetLocked) lines.push(small("Medical sheet kept encrypted: not on this card."));
    else {
      lines.push({ text: `Blood group: ${person.bloodGroup || "not known"}`, fontSize: 9, margin: [0, 2, 0, 0] });
      if (person.allergies.length > 0) lines.push(small("Allergies"), { text: person.allergies.join("; "), bold: true, fontSize: 9 });
      if (person.needs.length > 0) lines.push(small("Medical"), { text: person.needs.join("; "), fontSize: 9 });
      if (person.medicines.length > 0) lines.push(small("Medicines"), { text: person.medicines.join("; "), fontSize: 9 });
    }
    const calls = [...person.contacts, ...household.contacts].filter((entry) => entry.phone).slice(0, 4);
    if (calls.length > 0)
      lines.push(
        small("Who to contact"),
        ...calls.map((entry) => ({ text: [`${entry.label}: `, { text: entry.phone, bold: true }], fontSize: 9 }) as Content),
      );
    if (household.places.length > 0)
      lines.push(small("Where we meet"), ...household.places.slice(0, 3).map((place) => ({ text: place, fontSize: 9 }) as Content));
    if (household.comms.length > 0)
      lines.push(small("Keeping in touch"), ...household.comms.slice(0, 2).map((line) => ({ text: line, fontSize: 9 }) as Content));
    if (household.home)
      lines.push(small(`Home: ${household.home.name}`), {
        text: gridLines(household.home.lat, household.home.lon, ["decimal", "osgb", "maidenhead"]).join("\n"),
        fontSize: 8.5,
      });
    lines.push({
      text: `Made ${longDate.format(c.made)} in Outpost. Our own plan: follow official warnings.`,
      fontSize: 6.5,
      color: PRINT_COLOURS.muted,
      margin: [0, 4, 0, 0],
    });
    return card(lines, width);
  });
  for (let index = 0; index < cards.length; index += 2)
    content.push(twoColumns([cards[index]!], cards[index + 1] ? [cards[index + 1]!] : []));
  content.push(
    note(
      "A card holds medical lines from each person's medical sheet; a sheet kept encrypted and not open on this device leaves them off.",
    ),
  );
  c.summary["grab-cards"] = people.map((person) => person.name);
  return { subtitle: "A card for each person to carry. Cut along the broken line and fold.", content };
}

/** How each NHS page is set: those that say to call at once in red, those that warn in amber, the rest in blue. */
const FIRST_AID_KIND: Record<string, CalloutKind> = {
  "child-cpr": "act",
  "heart-attack": "act",
  stroke: "act",
  anaphylaxis: "act",
  "carbon-monoxide": "warn",
  poisoning: "warn",
};

function firstAidPage(c: Context, page: (typeof FIRST_AID_PAGES)[number]): Content {
  const body: Content[] = [];
  for (const part of page.parts) {
    if (part.heading) body.push({ text: part.heading, bold: true, margin: [0, 2, 0, 1] });
    body.push(bullets(part.lines));
  }
  body.push(note(`${NHS_CREDIT} ${breakLong(page.url)} (page last reviewed ${page.reviewed}).`));
  c.used.nhs.add(page.id);
  return callout(FIRST_AID_KIND[page.id] ?? "know", page.title, body, { keep: page.id !== "child-cpr" });
}

function firstAid(c: Context): Section {
  const content: Content[] = [
    note(
      `Lines quoted unchanged from the NHS website's pages, read on ${NHS_READ}. They are written for the UK: where they say 999 or NHS 111, ${
        c.country === "GB" ? "that is the number to call" : `call ${c.number || "your emergency number"}`
      }. A course teaches what words cannot.`,
    ),
  ];
  const [cpr, ...rest] = FIRST_AID_PAGES;
  if (cpr) {
    content.push(firstAidPage(c, cpr));
    content.push(
      figure(chestCompressions().svg, {
        title: "Where to press, from the lines above",
        width: Math.min(c.measure, 424),
        caption: "Outpost's drawing of the lines above on chest compressions. It adds nothing to them.",
      }),
    );
  }
  // The rest in two columns, each page kept whole, the columns about as long as each other.
  const size = (page: (typeof FIRST_AID_PAGES)[number]) =>
    page.parts.reduce((total, part) => total + part.lines.join(" ").length + 60, 120);
  const left: Content[] = [];
  const right: Content[] = [];
  let leftSize = 0;
  let rightSize = 0;
  for (const page of rest) {
    if (leftSize <= rightSize) {
      left.push(firstAidPage(c, page));
      leftSize += size(page);
    } else {
      right.push(firstAidPage(c, page));
      rightSize += size(page);
    }
  }
  content.push(twoColumns(left, right));

  c.used.fema = true;
  content.push(
    heading("The recovery position"),
    figure(recoveryPosition().svg, {
      width: Math.min(c.measure, 400),
      caption:
        "Outpost's drawing of FEMA's words below, each part labelled with them. It shows the position, not how to roll someone into it, as the words do.",
    }),
    twoColumns(
      [
        callout("know", "The recovery position, in FEMA's words", [
          bullets(RECOVERY_POSITION.parts.map((part) => `“${part}”`)),
          note(`${RECOVERY_POSITION.title}. ${RECOVERY_POSITION.terms}`),
        ]),
      ],
      [
        callout("warn", "Moving someone", [
          para(`“${RECOVERY_POSITION.caution[0]}”`),
          bullets(RECOVERY_POSITION.caution.slice(1).map((line) => `“${line}”`)),
        ]),
      ],
    ),
  );
  content.push(
    callout("warn", "What this section cannot hold", [
      para(
        "The NHS website no longer has its own pages on CPR for an adult, the recovery position, choking or severe bleeding: it sends readers to St John Ambulance. Those, and the British Red Cross's and Resuscitation Council UK's, may not be reprinted, so they are not here. Learn them on a course, keep a first aid manual with this book, and keep a first aid collection in Outpost's library (Explore › Medicine and first aid).",
      ),
      bullets(FIRST_AID_POINTERS.map((pointer) => `**${pointer.what}:** ${pointer.who}, ${pointer.url}`)),
    ]),
  );
  c.summary["first-aid"] = FIRST_AID_PAGES.map((page) => `${page.title} (reviewed ${page.reviewed})`);
  return { subtitle: `Call ${c.number || "the emergency services"} first if you can. Then the words below, quoted unchanged.`, content };
}

function placesTable(group: BookPlaceGroup, wind: number | null): Content {
  return dataTable(
    ["Name", "What", "Distance", "Direction", "Position", ...(wind !== null ? ["Upwind"] : [])],
    group.places.map((place) => [
      place.name || "No name mapped",
      place.kindLabel,
      metresWords(place.distanceMeters),
      direction(place.bearingDegrees),
      at4(place.lat, place.lon),
      ...(wind !== null ? [withinDegrees(place.bearingDegrees, wind) ? "**Yes**" : ""] : []),
    ]),
    { bold: [0], right: [2] },
  );
}

function notHeld(group: BookPlaceGroup, country: string | null): string {
  const layer = REFERENCE_LAYER_INFO[group.layer as ReferenceLayerId];
  return `Not held: no ${layer?.label.toLowerCase() ?? group.layer} layer is installed. Add one under Maps › Layers, from a reference pack for ${
    country ? placeName(country) : "where home is"
  } (it needs the internet once), and make the book again.`;
}

function helpNearHome(c: Context): Section {
  const subtitle = "Hospitals, pharmacies and other help, measured in a straight line from home.";
  if (!c.facts.home) return { subtitle, content: [para(NO_HOME_PLACE)] };
  const content: Content[] = [
    note(
      `Measured in a straight line from ${c.facts.home.name} (${at4(c.facts.home.lat, c.facts.home.lon)}), from the reference layers installed on this Outpost. ${FOOD_WORDS.emergency} A place listed may have closed or moved: check before you need it.`,
    ),
  ];
  const summary: string[] = [];
  for (const group of c.facts.help) {
    content.push(label(group.label));
    c.used.layers.add(group.layer as ReferenceLayerId);
    if (!group.held) content.push(note(notHeld(group, c.country)));
    else if (group.places.length === 0) content.push(note("None near home in the layer held."));
    else {
      content.push(placesTable(group, null));
      summary.push(...group.places.map((place) => `${group.label}: ${place.name}`));
    }
    if (group.id === "shelters" && group.held) content.push(note(REFERENCE_LAYER_INFO.shelters.about));
  }
  content.push(note(FOOD_WORDS.coverage));
  c.summary["help-near-home"] = summary;
  return { subtitle, content };
}

function keepAway(c: Context): Section {
  const subtitle = "Sites near home to keep away from, and which way the wind usually blows.";
  if (!c.facts.home) return { subtitle, content: [para(NO_HOME_PLACE)] };
  const content: Content[] = [];
  const wind = c.facts.climate?.wind ?? null;
  const summary: string[] = [];
  if (wind) {
    c.used.nasa = true;
    content.push(
      callout("know", `The wind at home: usually from the ${direction(wind.fromDegrees)}`, [
        para(
          `NASA POWER gives the average direction the wind comes from at ${c.facts.climate!.placeName} as ${direction(wind.fromDegrees)}, over ${wind.period}. A site below within 45° of that direction is marked upwind: with the wind from there, air from it comes towards home. An average says nothing about any one day, when the wind can come from any side: listen for official warnings, and go in, stay in and tune in if told to.`,
        ),
        dataTable([...MONTH_NAMES], [wind.months.map((value) => (value === null ? "" : compassPoint(value)))]),
      ]),
    );
    summary.push(`Wind from ${compassPoint(wind.fromDegrees)}`);
  } else if (c.facts.climate) {
    content.push(
      note(
        "The climate averages kept for home were fetched before Outpost asked for the wind's direction. Fetch them again under Weather and hazards › Climate, and make the book again, for which way the wind usually blows.",
      ),
    );
  } else {
    content.push(
      note(
        "Outpost holds no climate averages for home, so the book cannot say which way the wind usually blows. Fetch them under Weather and hazards › Climate (it needs the internet once), and make the book again.",
      ),
    );
  }
  for (const group of c.facts.keepAway) {
    content.push(label(group.label));
    c.used.layers.add(group.layer as ReferenceLayerId);
    if (!group.held) content.push(note(notHeld(group, c.country)));
    else if (group.places.length === 0) content.push(note("None near home in the layer held."));
    else {
      content.push(placesTable(group, wind?.fromDegrees ?? null));
      summary.push(...group.places.map((place) => `${group.label}: ${place.name}`));
    }
  }
  content.push(
    callout(
      "warn",
      "What is not here",
      bullets([
        "Power stations other than nuclear ones, chemical works, fuel depots and other industrial sites: Outpost's reference layers do not hold them.",
        "Major hazard sites (in Great Britain, those under the COMAH regulations) and the public information zones round them: Outpost has no openly licensed copy it can fetch. Your local authority publishes them.",
        `Emergency planning zones round nuclear sites: ${
          c.facts.planningZones === null
            ? "none is held. Where your authority publishes them as a file, it can be brought in under Maps › Layers."
            : c.facts.planningZones.length > 0
              ? `home is in ${c.facts.planningZones.map((zone) => zone.name).join(", ")}.`
              : "home is in none of the zones held."
        }`,
      ]),
    ),
  );
  c.summary["keep-away"] = summary;
  return { subtitle, content };
}

/** One of the household's emergency plans, in full and as written: their plan, with what it links to as it is now. */
function planContent(c: Context, own: EmergencyPlanResponse, first: boolean): Content[] {
  const readable = readableOf(own.plan, own.resolved);
  const content: Content[] = [
    {
      stack: [
        { text: "Your plan", fontSize: 8, bold: true, color: PRINT_COLOURS.accent, characterSpacing: 0.4 },
        { text: readable.name, fontSize: 15, bold: true, margin: [0, 1, 0, 1] },
        {
          text: [
            readable.kind,
            readable.emergencyNumber && readable.emergencyNumber !== c.number ? `Emergency number in it: ${readable.emergencyNumber}` : "",
          ]
            .filter(Boolean)
            .join(". "),
          fontSize: 8.5,
          color: PRINT_COLOURS.muted,
        },
      ],
      margin: [0, first ? 0 : 6, 0, 8],
      headlineLevel: 2,
      pageBreak: first ? undefined : "before",
    } as Content,
  ];
  for (const phase of PLAN_PHASES) {
    const lines = readable.steps.filter((step) => step.phase === phase.id).map((step) => step.text);
    if (lines.length > 0) content.push(label(phase.label), stepList(lines));
  }
  if (readable.steps.length === 0) content.push(note("This plan has no steps yet."));
  for (const step of own.plan.body.steps)
    if (step.origin) {
      const found = templateStep(step.origin);
      if (found) c.used.plan.add(found.step.source);
    }
  for (const line of [...own.plan.body.supplies, ...own.plan.body.where])
    if (line.origin) {
      const source = sourceOfLine(line.origin);
      if (source) c.used.plan.add(source);
    }
  for (const attribution of readable.attributions) c.attributions.add(attribution);

  if (readable.contacts.length > 0)
    content.push(
      label("Who to contact"),
      dataTable(
        ["Who", "Numbers", "Note"],
        readable.contacts.map((contact) => [
          `${contact.name}${contact.outOfArea ? " (out of the area)" : ""}${contact.missing ? " (deleted from Contacts since)" : ""}`,
          contact.numbers.map((number) => `${number.value} (${number.label})`).join(", "),
          contact.note,
        ]),
        { bold: [0] },
      ),
    );
  if (readable.places.length > 0)
    content.push(
      label("Places"),
      dataTable(
        ["What for", "Where", "Position", "Note"],
        readable.places.map((place) => [
          place.role,
          `${place.name}${place.missing ? " (no longer on the map)" : ""}`,
          place.coords ?? "",
          place.note,
        ]),
        { bold: [1] },
      ),
    );
  if (readable.people.length > 0)
    content.push(
      label("People"),
      dataTable(
        ["Who", "Remember", "Medical", "Numbers"],
        readable.people.map((person) => [
          `${person.name}${person.missing ? " (deleted from Contacts since)" : ""}`,
          person.remember,
          person.medical,
          person.numbers.map((number) => number.value).join(", "),
        ]),
        { bold: [0] },
      ),
    );
  if (readable.comms.length > 0) content.push(label("Keeping in touch"), bullets(readable.comms));
  if (readable.where.length > 0)
    content.push(
      label("Where things are"),
      dataTable(
        ["What", "Where"],
        readable.where.map((item) => [item.what, item.where]),
        { bold: [0] },
      ),
    );
  if (readable.supplies.length > 0)
    content.push(
      label("Supplies"),
      checklist([{ heading: readable.name, rows: readable.supplies.map((supply) => ({ what: supply.name, amount: supply.amount })) }], {
        amount: "How much",
      }),
    );
  if (own.resolved.powerPlan) content.push(note(`Power plan: ${own.resolved.powerPlan.name}, in Outpost under Power.`));
  if (own.plan.body.notes.trim()) content.push(label("Notes"), para(own.plan.body.notes.trim()));
  if (own.plan.body.links.length > 0)
    content.push(
      note(
        `Also linked in Outpost: ${own.plan.body.links.length} ${own.plan.body.links.length === 1 ? "thing" : "things"}. Open the plan to see them.`,
      ),
    );
  return content;
}

/** The source of a template's supply or "where" line, by its id. */
function sourceOfLine(origin: string): string | null {
  const template = templateById(origin.split(".")[0] ?? "");
  const line = [...(template?.supplies ?? []), ...(template?.where ?? [])].find((each) => each.id === origin);
  return line?.source ?? null;
}

function situations(c: Context): Section {
  const content: Content[] = [];
  const summary: string[] = [];
  const included = new Set(
    bookPlanIds(
      c.answers,
      c.plans.map((each) => each.plan),
    ),
  );
  const plans = c.plans.filter((each) => included.has(each.plan.id));
  plans.forEach((own, index) => {
    content.push(...planContent(c, own, index === 0));
    summary.push(`Plan: ${own.plan.name}`);
  });
  // A hazard whose plan is in the book gets the plan; one with no plan in the book gets general advice.
  const planned = new Set(plans.map((each) => each.plan.templateId).filter(Boolean));
  const general = c.answers.hazards.filter((hazard) => !planned.has(hazard));
  if (plans.length === 0 && general.length === 0)
    content.push(para("No emergency plan is in the book, and no hazard was chosen in the questions."));
  general.forEach((hazard, index) => {
    const template = templateById(hazard);
    if (!template) return;
    content.push({
      stack: [
        { text: "General advice", fontSize: 8, bold: true, color: PRINT_COLOURS.muted, characterSpacing: 0.4 },
        { text: template.name, fontSize: 15, bold: true, margin: [0, 1, 0, 4] },
      ],
      margin: [0, 6, 0, 4],
      headlineLevel: 2,
      pageBreak: index === 0 && plans.length > 0 ? "before" : undefined,
    } as Content);
    content.push(
      callout(
        "know",
        "General advice; you have no plan for this yet",
        para(
          "Official guidance from the plan template for this hazard. Make a plan of your own from it under Preparedness › Emergency plans, and it goes in the book in place of this.",
          0,
        ),
        { keep: true },
      ),
    );
    for (const phase of PLAN_PHASES) {
      const lines = template.steps.filter((step: TemplateStep) => step.phase === phase.id);
      for (const step of lines) c.used.plan.add(step.source);
      if (lines.length > 0) content.push(label(phase.label), stepList(lines.map((step) => step.text)));
    }
    summary.push(`General: ${template.name}`);
  });
  content.push(...ukWordsNote(c.country, c.number));
  c.summary.situations = summary;
  return {
    subtitle:
      plans.length > 0
        ? `Your ${plans.length === 1 ? "plan" : `${plans.length} plans`} in full, as you wrote ${plans.length === 1 ? "it" : "them"}${general.length > 0 ? ", then general advice for the hazards with no plan yet" : ""}.`
        : "General advice for each hazard chosen. You have no plan of your own in the book yet.",
    content,
  };
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

const methodQuotes = (id: string) => METHODS.find((method) => method.id === id)?.quotes ?? [];

function water(c: Context): Section {
  const n = needs(c);
  c.used.water = true;
  const content: Content[] = [];
  // The rule over everything else on the page: what none of the methods makes safe.
  content.push(
    callout("act", "Water from anywhere but a working tap", [
      quote(CDC_SAFE_WATER.cloudy[0], "CDC"),
      quote(methodQuotes("boil")[0]?.text ?? "", "CDC"),
    ]),
  );

  // Clear it, then kill the germs; beside it, the filter and the bottle method.
  const boil = methodQuotes("boil");
  const chlorine = methodQuotes("chlorine");
  const uv = methodQuotes("uv");
  content.push(
    twoColumns(
      [
        label("Step 1: clear it", PRINT_COLOURS.act),
        stepList(
          [
            {
              text: [
                { text: "Filter it. ", bold: true },
                `“${CDC_SAFE_WATER.cloudy[0]}” `,
                { text: "CDC", color: PRINT_COLOURS.muted, fontSize: 7.5 },
              ],
            },
            {
              text: [
                { text: "Or let it settle. ", bold: true },
                `“${CDC_SAFE_WATER.cloudy[1]} ${CDC_SAFE_WATER.cloudy[2]}” `,
                { text: "CDC", color: PRINT_COLOURS.muted, fontSize: 7.5 },
              ],
            },
            { text: [{ text: "Very muddy? ", bold: true }, "A layered filter (right) clears it. It does not make it safe."] },
          ],
          { mark: "letter", colour: PRINT_COLOURS.act },
        ),
        label("Step 2: kill the germs", PRINT_COLOURS.know),
        stepList(
          [
            {
              text: [
                { text: "Boil it. ", bold: true },
                `“${boil[0]?.text ?? ""}” `,
                { text: boil[0]?.who ?? "", color: PRINT_COLOURS.muted, fontSize: 7.5 },
              ],
            },
            {
              text: [
                { text: "Or tablets or drops. ", bold: true },
                `“${chlorine[0]?.text ?? ""}” `,
                { text: chlorine[0]?.who ?? "", color: PRINT_COLOURS.muted, fontSize: 7.5 },
              ],
            },
            {
              text: [
                { text: "Or bleach, ", bold: true },
                "by the tables at the end of this section, then: ",
                `“${BLEACH_STEPS.find((step) => step.who === "CDC")?.text ?? ""}” `,
                { text: "CDC", color: PRINT_COLOURS.muted, fontSize: 7.5 },
              ],
            },
          ],
          { colour: PRINT_COLOURS.know },
        ),
        note(`“${chlorine[1]?.text ?? ""}” (${chlorine[1]?.who ?? ""})`),
      ],
      [
        figure(bottleFilter().svg, {
          title: "A layered filter",
          width: c.half * 0.82,
          caption: `“${FM_21_76.filter[0]}” “${FM_21_76.filter[1]}” (${FM_21_76.short}). It names no order and no bottle: the drawing puts them in one.`,
        }),
        callout("warn", "Sunny days only: the bottle method", [
          quote(uv[1]?.text ?? "", uv[1]?.who ?? "CDC"),
          quote(uv[0]?.text ?? "", uv[0]?.who ?? "CDC"),
        ]),
      ],
    ),
  );

  // Boiling and catching rain, drawn, with the words they draw.
  content.push(
    twoColumns(
      [
        figure(boiling().svg, {
          title: "Boiling",
          width: c.half,
          caption: "Outpost's drawing of the words on boiling quoted on this page.",
        }),
      ],
      [figure(rainCatch().svg, { title: "Catching rain", width: c.half * 0.9, caption: `“${FM_21_76.rain}” (${FM_21_76.short})` })],
    ),
    label("Boiling, in their words"),
    twoColumns(
      boil.slice(1, 2).map((line) => quote(line.text, line.who)),
      boil.slice(2).map((line) => quote(line.text, line.who)),
    ),
  );

  if (n.list.length > 0) {
    content.push(
      heading(`How much, for ${n.days} days`),
      twoColumns(
        [
          dataTable(
            ["Who", "Drinking, a day", "All uses, a day"],
            [
              ...n.list.map((need) => [
                need.name || "Unnamed",
                need.drinking === null ? "" : `${need.drinking} l`,
                need.allUses === null ? "" : `${need.allUses} l`,
              ]),
              ["**Everyone**", `**${round1(n.drinking)} l**`, `**${round1(n.allUses)} l**`],
              [`**For ${n.days} days**`, `**${Math.ceil(n.drinking * n.days)} l**`, `**${Math.ceil(n.allUses * n.days)} l**`],
            ],
            { right: [1, 2] },
          ),
        ],
        [
          note(
            `Drinking: ${WATER_FIGURES.drinking.litres} litres a person a day, from ${WATER_FIGURES.drinking.source}. All uses: ${WATER_FIGURES.allUses.litres} litres, the low end of ${WATER_FIGURES.allUses.source}. A figure set on a person in Supplies is used in place of these.`,
          ),
          ...(c.outlook && c.outlook.water.days !== null
            ? [
                callout(
                  "know",
                  "What is kept",
                  para(`The water kept, as entered in Supplies, lasts the household ${daysWords(c.outlook.water.days)}.`, 0),
                ),
              ]
            : []),
        ],
      ),
    );
  } else content.push(note("No people are listed in Supplies, so how much water is needed is not worked out."));
  content.push(
    label("What official bodies plan for"),
    dataTable(
      ["Who", "Litres a person a day", "Covers", "Keep for"],
      PLANNING_FIGURES.map((figure) => [
        figure.who,
        figure.litres[0] === figure.litres[1] ? round1(figure.litres[0]).toString() : `${figure.litres[0]} to ${figure.litres[1]}`,
        figure.covers,
        figure.days,
      ]),
      { bold: [0] },
    ),
  );
  content.push(bullets(steps(["shelter-at-home.during.11", "flooding.after.11", "shelter-at-home.after.2"], c.used)));
  content.push(...fromBlocks(c, purificationBlocks()));
  const points = c.facts.help.find((group) => group.id === "water");
  content.push(heading("Drinking water near home"));
  if (!c.facts.home) content.push(note(NO_HOME_PLACE));
  else if (!points?.held) content.push(note(points ? notHeld(points, c.country) : "Not held."));
  else if (points.places.length === 0) content.push(note("No drinking water point is mapped near home in the layer held."));
  else {
    content.push(placesTable(points, null));
    content.push(note(`${FOOD_WORDS.osm} ${FOOD_WORDS.emergency} Water from anywhere but a working tap is made safe as above.`));
  }
  c.summary.water = [`${Math.ceil(n.drinking * n.days)} litres to drink for ${n.days} days`];
  return { subtitle: "How much to keep, and making water safe to drink with no tap and no power.", content };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function foodHygiene(c: Context): Section {
  const n = needs(c);
  const left: Content[] = [label("Food")];
  if (n.kcal > 0)
    left.push(
      para(
        `The household needs about **${Math.round(n.kcal).toLocaleString("en-GB")} kcal a day**, ${Math.round(n.kcal * n.days).toLocaleString("en-GB")} kcal for ${n.days} days${n.petKcal > 0 ? `, and the pets ${Math.round(n.petKcal * n.days).toLocaleString("en-GB")} kcal` : ""}: from the energy figures in Supplies (a person's own figure where one is set). Planning figures, not dietary advice.${
          c.outlook?.food.days !== null && c.outlook ? ` The food kept lasts ${daysWords(c.outlook.food.days)}.` : ""
        }`,
      ),
    );
  left.push(stepList(steps(["power-cut.during.8", "flooding.after.8", "flooding.after.9", "flooding.after.10"], c.used)));
  const right: Content[] = [
    label("Keeping clean with little water"),
    bullets([...CDC_HYGIENE.lines]),
    note(`Quoted unchanged from ${CDC_HYGIENE.title}, ${breakLong(CDC_HYGIENE.url)}, read ${CDC_HYGIENE.read}. US spelling as written.`),
    bullets(steps(["shelter-at-home.during.11"], c.used)),
    callout(
      "warn",
      "The toilet: not covered",
      para(
        "Outpost holds no published guidance it may reprint on using a toilet when the water or the sewers are off. Your water company or local authority may publish some; ask them now, and write it on a notes page at the back.",
        0,
      ),
    ),
  ];
  c.used.cdc = true;
  c.summary["food-hygiene"] = [`${Math.round(n.kcal)} kcal a day`];
  return { subtitle: "Food in a power cut or a flood, and keeping clean with little water.", content: [twoColumns(left, right)] };
}

function warmthRadio(c: Context): Section {
  const content: Content[] = [
    twoColumns(
      [
        label("Warmth"),
        bullets(
          steps(["power-cut.during.10", "power-cut.during.11", "cold.during.1", "cold.during.2", "cold.during.3", "cold.before.2"], c.used),
        ),
        callout(
          "warn",
          "Carbon monoxide",
          para(
            "See “Carbon monoxide poisoning” under First aid, from the NHS website, before using any stove, heater or generator indoors.",
            0,
          ),
        ),
      ],
      [
        label("Light"),
        bullets(steps(["power-cut.before.1", "power-cut.during.16"], c.used)),
        label("The radio"),
        bullets(steps(["power-cut.before.2", "power-cut.before.3", "power-cut.during.13"], c.used)),
      ],
    ),
  ];
  const sets = RECEIVER_PROFILES.filter((profile) => c.answers.receivers.includes(profile.id));
  const summary: string[] = [];
  if (c.answers.sections.includes("frequencies")) {
    content.push(note("The stations to listen to, and every other frequency, are under Radio frequencies."));
  } else if (sets.length === 0) {
    content.push(note("No radio sets were named in the questions, so no stations are listed. Name them, and make the book again."));
  } else if (!c.country) {
    content.push(
      note("Which country home is in is not known (no home is marked, or no reference layers are installed), so no stations are listed."),
    );
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
    content.push(heading("What our radios can hear"), para(`Our sets: ${sets.map((profile) => profile.label).join(", ")}.`));
    if (entries.length === 0) content.push(note(`Outpost's list holds nothing for ${placeName(c.country)} that these sets can receive.`));
    else
      content.push(
        ...fromBlocks(
          c,
          frequencyBlocks({
            entries,
            chosen: `What our sets can receive, for ${placeName(c.country)}`,
            today: c.today,
            written: c.made,
          }).map((block) => (block.kind === "title" ? { kind: "heading" as const, text: block.text } : block)),
        ),
      );
    summary.push(...entries.map((entry) => entry.name));
  }
  c.summary["warmth-radio"] = summary;
  return { subtitle: "Keeping warm and lit, and the stations your radios can hear.", content };
}

function journeys(c: Context): Section {
  const subtitle = "To each place you would go: on foot, a stop for each day, and by car.";
  const content: Content[] = [];
  const summary: string[] = [];
  if (!c.facts.home) return { subtitle, content: [para(NO_HOME_PLACE)] };
  if (c.answers.destinations.length === 0) return { subtitle, content: [para("No place to go to was given in the questions.")] };
  c.used.tobler = true;
  content.push(
    callout(
      "know",
      "How these are worked out",
      para(
        `Each journey is the straight line from home: Outpost has no road routing, so it cannot follow the roads, and the way on the ground is longer. The time on foot is worked out along that line with Tobler's hiking function (5 km/h on level ground, slower up and down the slopes of the ground along the line, from the terrain installed), for a fit adult with no load, and at half that pace, Outpost's allowance for someone hurt, tired, unused to hills, or with small children. ${c.answers.walkHoursPerDay} hours of walking a day is your own figure from the questions.`,
        0,
      ),
    ),
  );
  c.facts.journeys.forEach((journey, index) => {
    content.push(...journeyContent(c, journey, summary, index > 0));
  });
  for (const missing of c.facts.notMeasured) content.push(heading(missing.name), note(`Not worked out. ${missing.why}`));
  c.summary.journeys = summary;
  return { subtitle, content };
}

function journeyContent(c: Context, journey: BookJourney, summary: string[], newPage: boolean): Content[] {
  const home = c.facts.home!;
  summary.push(`${journey.name}: ${metresWords(journey.distanceMeters)}`);
  const ground = journey.ground;
  const content: Content[] = [
    { ...(heading(`To ${journey.name}`) as object), pageBreak: newPage ? "before" : undefined } as Content,
    para(
      `**${metresWords(journey.distanceMeters)}** in a straight line, setting out **${direction(journey.bearingDegrees)}**. ${
        ground
          ? `Along the line the ground climbs ${ground.climbMeters} m and falls ${ground.descentMeters} m in all, between ${ground.lowestMeters} m and ${ground.highestMeters} m${ground.coverage === "partial" ? " where terrain is installed (not the whole way: the rest is taken as level)" : ""}.`
          : c.facts.terrain
            ? "The installed terrain does not cover the line (or it is longer than 1,000 km), so it is taken as level, which it will not be."
            : "No terrain is installed, so the line is taken as level, which it will not be."
      }`,
    ),
  ];
  const fit = journey.walks.find((walk) => walk.pace === "standard");
  content.push(
    twoColumns(
      [
        label("On foot"),
        dataTable(
          ["Pace", "Hours walking", `Days at ${c.answers.walkHoursPerDay} h a day`],
          journey.walks.map((walk) => [
            WALK_PACES.find((pace) => pace.id === walk.pace)?.name ?? walk.pace,
            walk.hours.toFixed(1),
            String(walk.days),
          ]),
          { right: [1, 2] },
        ),
      ],
      fit && fit.stops.length > 0
        ? [
            label("Where each day's walking ends"),
            dataTable(
              ["Night", "Along the line", "Near"],
              fit.stops.map((stop) => [
                String(stop.day),
                metresWords(stop.alongMeters),
                stop.near ? `${stop.near} (${metresWords(stop.nearMeters ?? 0)} away)` : "No town in the layers near",
              ]),
              { right: [1] },
            ),
            note("At the fit pace, numbered on the drawing. Positions are on the drawing's list below."),
          ]
        : [],
    ),
  );
  const height = 300;
  // Drawn a little inside the frame, so that a name at either end has room.
  const items = routeDrawing({ home, journey, stops: fit?.stops ?? [] }, { x: 24, y: 8, width: c.measure - 48, height: height - 16 });
  content.push(
    figure(sheetItemsToSvg(items, { x: 0, y: 0, width: c.measure, height }), {
      width: c.measure,
      caption: `A drawing of the straight line from home to ${journey.name}, with the night stops and towns near it.${
        fit && fit.stops.length > 0 ? ` Night stops: ${fit.stops.map((stop) => `${stop.day}, ${at4(stop.lat, stop.lon)}`).join("; ")}.` : ""
      }`,
    }),
  );
  const cars = c.answers.vehicles.map((vehicle) => {
    if (vehicle.rangeKm === null) return `${vehicle.name}: its range was not given.`;
    const short = vehicle.rangeKm * 1000 < journey.distanceMeters;
    return `${vehicle.name}: about ${vehicle.rangeKm} km on a full tank or charge, as you gave it${short ? ", less than the straight line: it cannot get there on one" : ""}.`;
  });
  content.push(
    label("By car"),
    para("The roads are not known to Outpost. Keep a paper road map with this book, and agree a route and a second one."),
    ...(cars.length > 0 ? [bullets(cars)] : []),
  );
  return content;
}

function checklists(c: Context): Section {
  const n = needs(c);
  const people = (c.household?.members ?? []).filter((member) => member.kind === "person").length;
  const pets = (c.household?.members ?? []).filter((member) => member.kind === "pet");
  const content: Content[] = [];
  const subtitle = `Worked out for ${people} ${people === 1 ? "person" : "people"}${pets.length > 0 ? ` and ${pets.length} ${pets.length === 1 ? "pet" : "pets"}` : ""}, for ${n.days} days. Tick what you have.`;
  const food: ChecklistGroup = { heading: "Water and food", rows: [] };
  if (n.drinking > 0) food.rows.push({ what: "Drinking water", amount: `**${Math.ceil(n.drinking * n.days)} litres**` });
  if (n.kcal > 0)
    food.rows.push({ what: "Food that needs no cooking", amount: `**${Math.round(n.kcal * n.days).toLocaleString("en-GB")} kcal**` });
  if (n.petKcal > 0) food.rows.push({ what: "Pet food", amount: `${Math.round(n.petKcal * n.days).toLocaleString("en-GB")} kcal` });
  const house: ChecklistGroup = {
    heading: "Around the house",
    rows: supplyLines(
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
    ).map((supply) => ({ what: supply.name, amount: supply.quantity === null ? "" : `${supply.quantity} ${supply.unit}` })),
  };
  const babies = (c.household?.members ?? []).some((member) => member.band === "under-1" || member.band === "1");
  const extras: ChecklistGroup = { heading: "Babies and pets", rows: [] };
  if (babies) for (const supply of supplyLines(["shelter-at-home.supply.12"], c.used)) extras.rows.push({ what: supply.name });
  if (pets.length > 0) for (const supply of supplyLines(["shelter-at-home.supply.13"], c.used)) extras.rows.push({ what: supply.name });
  const buy: ChecklistGroup = {
    heading: "What Supplies works out to buy, from what is kept now",
    rows: c.missing.map((line) => ({
      what: line.name,
      amount: line.quantity === null ? line.note : `${line.quantity} ${line.unit}`.trim(),
    })),
  };
  content.push(heading("Shopping list for home"), checklist([food, house, extras, buy]));
  content.push(bullets(steps(["shelter-at-home.before.3", "shelter-at-home.before.4"], c.used)));

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
  ).map((supply) => ({ what: supply.name, amount: "" }));
  if (pets.length > 0)
    grab.push(
      ...supplyLines(["evacuate.supply.9"], c.used).map((supply) => ({
        what: supply.name,
        amount: pets.map((pet) => pet.name).join(", "),
      })),
    );
  grab.push({ what: "This book, or a copy of it", amount: "" });
  const car = supplyLines(["cold.supply.9", "cold.supply.10", "cold.supply.11", "cold.supply.12", "heat.supply.5"], c.used).map(
    (supply) => {
      const name = supply.name.replace(/^Car: /, "");
      return { what: name.charAt(0).toUpperCase() + name.slice(1), amount: "" };
    },
  );
  content.push(
    heading("To take"),
    checklist([
      { heading: "Grab bag", rows: grab },
      {
        heading: c.answers.vehicles.length > 0 ? `The car: ${c.answers.vehicles.map((vehicle) => vehicle.name).join(", ")}` : "The car",
        rows: car,
      },
    ]),
    bullets(steps(["evacuate.before.1", "evacuate.before.2"], c.used)),
    heading("First aid kit"),
    note("What the NHS pages quoted under First aid name to use, and nothing else. A pharmacist can say what else to keep."),
    checklist([{ heading: "Named on the NHS pages", rows: KIT_FROM_PAGES.map((line) => ({ what: line.item, amount: line.page })) }], {
      amount: "Named on",
    }),
  );
  c.summary.checklists = food.rows.concat(house.rows).map((row) => `${row.what}: ${(row.amount ?? "").replace(/\*\*/g, "")}`);
  return { subtitle, content };
}

function localRisks(c: Context): Section {
  const subtitle = "Flood zones at home where a layer is held, and the climate's extremes.";
  if (!c.facts.home) return { subtitle, content: [para(NO_HOME_PLACE)] };
  const content: Content[] = [];
  const summary: string[] = [];
  content.push(heading("Flood zones"));
  if (c.facts.floodZones === null)
    content.push(
      note(
        "No flood zone layer is held. Outpost's flood zones are the Environment Agency's, for England only; elsewhere your national or local authority publishes flood maps.",
      ),
    );
  else if (c.facts.floodZones.length === 0) content.push(para(`Home is in none of the flood zones held. ${FLOOD_ZONE_WORDS.caveat}`));
  else {
    content.push(
      callout("warn", "Home is in a flood zone", [
        bullets(c.facts.floodZones.map((zone) => `**${zone.kindLabel}:** ${zone.name}`)),
        bullets([FLOOD_ZONE_WORDS.zone3, FLOOD_ZONE_WORDS.zone2]),
        note(`${FLOOD_ZONE_WORDS.caveat} ${FLOOD_ZONE_WORDS.notForecast} ${FLOOD_ZONE_WORDS.attribution}`),
      ]),
    );
    summary.push(...c.facts.floodZones.map((zone) => zone.kindLabel));
  }
  content.push(heading("The climate at home"));
  const climate = c.facts.climate;
  if (!climate)
    content.push(
      note(
        "Outpost holds no climate averages for home. Fetch them under Weather and hazards › Climate (it needs the internet once), and make the book again.",
      ),
    );
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
    content.push(
      dataTable(["", "Month", "Average"], rows, { bold: [0] }),
      note(
        `Monthly averages over ${climate.period}, from NASA POWER, for ${climate.placeName}, fetched ${longDate.format(new Date(climate.fetchedAt))}. An average month hides its worst days: a cold snap or a heatwave goes well past these.`,
      ),
    );
    summary.push(...rows.map((row) => `${row[0]}: ${row[1]}`));
  }
  c.summary["local-risks"] = summary;
  return { subtitle, content };
}

function childCards(c: Context): Section {
  const subtitle = "A card for each child to carry. Cut along the broken line.";
  const content: Content[] = [];
  const children = c.answers.people
    .filter((person) => person.childCard)
    .map((person) => c.household?.members.find((member) => member.id === person.memberId))
    .filter((member): member is NonNullable<typeof member> => !!member);
  const teach = steps(["shelter-at-home.before.6"], c.used);
  content.push(para(`${teach.join(" ")} Cut each card out, talk it through, and keep it in a coat or bag.`));
  if (children.length === 0) {
    content.push(note("No one was given a card in the questions (People and pets: “A card of their own”)."));
    c.summary.children = [];
    return { subtitle, content };
  }
  const meet = c.answers.meetingPoints
    .map((point) => ({ point, marker: c.markers.find((marker) => marker.id === point.markerId) }))
    .filter((entry) => entry.marker);
  const grownUps = c.emergencyContacts
    .filter((contact) => contact.phones[0])
    .slice(0, 3)
    .map((contact) => `${contact.displayName}: ${contact.phones[0]!.value}`);
  const cards = children.map((child) => {
    const lines: Content[] = [
      `My name is ${child.name}.`,
      ...(c.facts.home ? [`I live at ${c.facts.home.name}.`] : []),
      {
        text: [
          `If I am lost or someone is hurt, I call `,
          { text: c.number || "the emergency number", bold: true, color: PRINT_COLOURS.act },
          ".",
        ],
        fontSize: 10.5,
        margin: [0, 0, 0, 3],
      },
      ...(grownUps.length > 0 ? [{ text: "My grown-ups:", bold: true, fontSize: 10.5, margin: [0, 2, 0, 1] } as Content, ...grownUps] : []),
      ...meet.map((entry) => `${entry.point.role === "near" ? "We meet at" : "Or we meet at"}: ${entry.marker!.name}`),
    ];
    return card(lines, c.half - 24);
  });
  for (let index = 0; index < cards.length; index += 2)
    content.push(twoColumns([cards[index]!], cards[index + 1] ? [cards[index + 1]!] : []));
  c.summary.children = children.map((child) => child.name);
  return { subtitle, content };
}

function sourcesSection(c: Context): Section {
  const content: Content[] = [];
  const plan = [...c.used.plan].map((id) => sourceById(id)).filter((source): source is PlanSource => !!source);
  if (plan.length > 0) {
    content.push(label("Official guidance"));
    content.push(
      bullets(
        plan.map((source) =>
          breakLong(`${source.publisher}, “${source.title}”, ${source.url}. ${source.pageDate}; read ${source.checked}.`),
        ),
      ),
    );
    for (const source of plan) {
      const attribution = termsOf(source)?.attribution;
      if (attribution) c.attributions.add(attribution);
    }
  }
  if (c.used.nhs.size > 0 || c.used.fema) {
    content.push(label("First aid"));
    content.push(
      bullets([
        ...FIRST_AID_PAGES.filter((page) => c.used.nhs.has(page.id)).map((page) =>
          breakLong(`NHS website, “${page.title}”, ${page.url}. Page last reviewed ${page.reviewed}; read ${NHS_READ}.`),
        ),
        ...(c.used.fema
          ? [breakLong(`${RECOVERY_POSITION.title}, ${RECOVERY_POSITION.url}; read ${RECOVERY_POSITION.read}. ${RECOVERY_POSITION.terms}`)]
          : []),
      ]),
    );
    if (c.used.nhs.size > 0) content.push(note(`${NHS_CREDIT} Lines are quoted unchanged.`));
  }
  if (c.used.cdc) content.push(bullets([breakLong(`${CDC_HYGIENE.title}, ${CDC_HYGIENE.url}; read ${CDC_HYGIENE.read}.`)]));
  if (c.used.water) {
    content.push(label("Water"));
    content.push(
      bullets([
        ...Object.values(WATER_SOURCES)
          .filter((source): source is { name: string; url: string; read: string } => "url" in source && "read" in source)
          .map((source) => breakLong(`${source.name}, ${source.url}; read ${source.read}.`)),
        breakLong(
          `${CDC_SAFE_WATER.name}, ${CDC_SAFE_WATER.url}; read ${CDC_SAFE_WATER.read}. Source: CDC; the CDC does not endorse this book.`,
        ),
        breakLong(`${FM_21_76.name}, a US federal work with no copyright, read from a reprint, ${FM_21_76.url}; read ${FM_21_76.read}.`),
      ]),
    );
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
  figures.push("The drawings are Outpost's own, each of the words printed beside it.");
  content.push(label("Figures, places and drawings"), bullets(figures));
  if (c.attributions.size > 0) content.push(label("Licences"), bullets([...c.attributions]));
  content.push(note("The typeface is Atkinson Hyperlegible Next, by the Braille Institute of America, under the SIL Open Font License."));
  return {
    subtitle: "Where every piece of advice in this book comes from, with the date it was read. Pages change: these are as they stood then.",
    content,
  };
}

// ── The book ────────────────────────────────────────────────────────────────

const SECTION_MAKERS: Record<Exclude<BookSectionId, "notes">, (c: Context) => Section> = {
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
  "fridge-sheets": fridgeSheets,
  places,
  frequencies,
  supplies,
  "grab-cards": grabCards,
};

function frontContent(c: Context): Content[] {
  const changes = bookChanges(c.previous?.summary ?? null, c.summary);
  const changed: Content[] = !c.previous
    ? [para("This is the first book made. The next one will say what changed since.", 0)]
    : changes.length === 0
      ? [para("Nothing the book compares has changed. Replace the old copy anyway: this one is dated.", 0)]
      : [
          bullets(
            changes
              .slice(0, 14)
              .map((change) =>
                [
                  `**${bookSectionLabel(change.section)}:**`,
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
          ),
        ];
  return [
    twoColumns(
      [
        callout(
          "know",
          c.previous ? `Changed since the book of ${longDate.format(new Date(c.previous.madeAt))}` : "The first book",
          changed,
        ),
        callout("know", "Keep it where you can find it", stepList(steps(["shelter-at-home.before.1", "shelter-at-home.before.2"], c.used))),
      ],
      [
        callout("warn", "What this book cannot know", [
          bullets([
            "Whether a place listed is open, stocked or still there: it is what the reference layers held.",
            "The roads: each journey is a straight line, and the way on the ground is longer.",
            "What your emergency services will say on the day. Follow them, and official warnings, over anything here.",
            "Anything that changed after it was made. Make it again when the household, its plans or its places change.",
            "Medical advice of its own: it quotes the NHS website and FEMA, records what you typed, and checks no dose.",
            ...(c.country !== "GB"
              ? ["Much of the official guidance in it is the UK government's, the guidance Outpost holds. Your own country's may differ."]
              : []),
          ]),
        ]),
      ],
    ),
  ];
}

function contentsPage(_c: Context, entries: Array<{ number: number; label: string; id: string; about?: string }>): Content[] {
  return [{ text: "Contents", fontSize: 19, bold: true, margin: [0, 0, 0, 10] } as Content, contentsTable(entries)];
}

/** The whole book. */
export function makeBook(inputs: BookInputs): MadeBook {
  const country = inputs.facts.home?.country ?? null;
  const paper = inputs.answers.paper;
  const measure = measureOf(paper);
  const c: Context = {
    ...inputs,
    number: emergencyNumberFor(inputs.answers, country, inputs.plans),
    country,
    used: new Used(),
    summary: {},
    attributions: new Set(),
    measure,
    half: (measure - PRINT_SPACE.gutter) / 2,
  };
  const name = inputs.answers.householdName.trim();
  const parts: PrintPart[] = [];
  const entries: Array<{ number: number; label: string; id: string; about?: string }> = [];
  const sections: BookSectionId[] = [];
  const numbered = (id: string, title: string, about: string, made: Section) => {
    const number = entries.length + 1;
    entries.push({ number, label: title, id: `section-${id}`, about });
    parts.push({
      kind: "section",
      running: `${number} · ${title}`,
      content: [sectionHeader({ number, title, subtitle: made.subtitle, id: `section-${id}` }, measure), ...made.content],
    });
  };
  for (const section of BOOK_SECTIONS) {
    if (!inputs.answers.sections.includes(section.id) || section.id === "notes") continue;
    numbered(section.id, section.label, section.about, SECTION_MAKERS[section.id](c));
    sections.push(section.id);
  }
  numbered("sources", "Sources", "Every source, with the date it was read.", sourcesSection(c));
  if (inputs.answers.sections.includes("notes") && inputs.answers.notesPages > 0) {
    sections.push("notes");
    const height = PRINT_PAPERS[paper].height - PRINT_MARGINS[1] - PRINT_MARGINS[3] - 60;
    const pages = Array.from({ length: inputs.answers.notesPages }, (_, index) => [
      ...(index > 0 ? [{ text: "", pageBreak: "before" } as Content] : []),
      ...notesPage(measure, height),
    ]);
    entries.push({ number: entries.length + 1, label: "Pages for notes", id: "section-notes" });
    parts.push({
      kind: "plain",
      content: [{ text: "", id: "section-notes" } as Content, ...pages.flat()],
    });
  }

  const title = name ? `${name}: household book` : "Our household book";
  const made = longDate.format(inputs.made);
  const front: PrintPart[] = [
    {
      kind: "cover",
      content: [
        ...cover({
          kicker: "Household book",
          title,
          subtitle: `Made on ${made} from what Outpost held then.`,
          call: {
            label: "In an emergency, call",
            number: c.number || "not given",
            note: inputs.answers.sections.includes("first-minutes") ? "Then turn to section 1, The first few minutes." : undefined,
          },
          facts: [
            ...(inputs.facts.home
              ? ([["Home", `${inputs.facts.home.name}, ${at4(inputs.facts.home.lat, inputs.facts.home.lon)}`]] as Array<[string, string]>)
              : []),
            ["Made", made],
            ["In it", `${entries.length} sections; contents overleaf`],
          ],
          measure,
        }),
        ...frontContent(c),
      ],
    },
    { kind: "plain", content: contentsPage(c, entries) },
  ];
  const document = printDocument({
    paper,
    title,
    subject: "Household book made in Outpost",
    made: inputs.made,
    footerName: title,
    footerRight: `Made ${made}`,
    parts: [...front, ...parts],
  });
  return {
    document,
    sections,
    contents: entries.map(({ number, label: words, id }) => ({ number, label: words, id })),
    summary: c.summary,
  };
}
