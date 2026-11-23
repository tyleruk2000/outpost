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
  bookRadioPlanIds,
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
  formatFrequency,
  GRID_FORMATS,
  type Household,
  licenceLine,
  type MarkerDto,
  MEDICAL_CAVEAT,
  MONTH_NAMES,
  medicineLeft,
  memberNeeds,
  metresWords,
  modeName,
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
  type RepeaterListDto,
  type ResolvedContact,
  type ShoppingSuggestion,
  type SuppliesResponse,
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
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { CARD_HEIGHT, CARD_WIDTH } from "@/features/emergency-plans/cards";
import { readableOf } from "@/features/emergency-plans/printable";
import { frequencyBlocks } from "@/features/frequencies/document";
import { binderPlaces } from "@/features/household-papers/binder-places";
import { commsBlocks, usedEntries } from "@/features/household-papers/comms-words";
import { type GrabHousehold, type GrabPerson, gridLines } from "@/features/household-papers/grab-cards";
import type { PaperPerson } from "@/features/household-papers/household-data";
import type { OpenedSheet } from "@/features/household-papers/medical-crypto";
import { type ContactsNow, medicalBlocks, recordOf } from "@/features/household-papers/medical-words";
import { ageWords, type PaperHousehold, paperHomePlace, whereWasWords } from "@/features/household-papers/paper-household";
import type { PdfPicture } from "@/features/maps/print/pdf";
import {
  blocksToContent,
  boiling,
  bookCover,
  bottleFilter,
  bullets,
  type CalloutKind,
  type ChecklistGroup,
  COVER_BAND,
  callout,
  card,
  checklist,
  chestCompressions,
  contents as contentsTable,
  contourArt,
  cutCard,
  dataTable,
  figure,
  heading,
  type LicenceStatusKind,
  label,
  licenceKey,
  licenceStatus,
  measureOf,
  NoteList,
  note,
  notesPage,
  PRINT_COLOURS,
  PRINT_MARGINS,
  PRINT_PAPERS,
  PRINT_SPACE,
  PRINT_TYPE,
  type PrintPart,
  para,
  printable,
  printDocument,
  quote,
  rainCatch,
  recoveryPosition,
  rich,
  sectionHeader,
  seedOf,
  sheetItemsToSvg,
  steps as stepList,
  twoColumns,
} from "@/features/print-kit";
import type { Block } from "@/features/propagation/plans/document";
import { BLEACH_STEPS, METHODS, PLANNING_FIGURES, WATER_SOURCES } from "@/features/tools/water/guidance";
import { purificationBlocks } from "@/features/tools/water/purification-sheet";
import type { GoRow, LastingRow } from "./book-figures";
import { goFlow, lastingDrawing, powerCutTimeline, safeWaterFlow, waterNeedsDrawing } from "./book-figures";
import { type BookRadioPlan, radioPlansContent } from "./book-radio";
import {
  type BookRepeaterRange,
  type ChosenRepeater,
  chooseRepeaters,
  horizonRange,
  mappedGroups,
  placeLabel,
  type RepeaterGroup,
  repeaterLocations,
  SEARCH_WORDS,
} from "./book-repeaters";
import { CDC_HYGIENE, FIRST_AID_PAGES, FIRST_AID_POINTERS, KIT_FROM_PAGES, NHS_CREDIT, NHS_READ, RECOVERY_POSITION } from "./first-aid";
import { type BookRepeaterMap, repeaterFigure } from "./repeater-figure";
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
  /**
   * Repeaters from Outpost's list round every place the book covers (`repeaterQueries`), in any order: the book
   * chooses from them (`chooseRepeaters`). Null when the list could not be read.
   */
  repeaters: RepeaterDto[] | null;
  /** The lists the repeaters came from, for their names and dates. */
  repeaterLists?: RepeaterListDto[];
  /** Each chosen repeater's likely range by its id, from the terrain installed; one not here is drawn at its radio horizon. */
  repeaterRanges?: Record<string, BookRepeaterRange>;
  /** The offline map under each place's repeaters, by the place's key; one not here is drawn on a plain grid. */
  repeaterMaps?: Record<string, BookRepeaterMap>;
  /** Why no offline map is under the repeaters' maps, when none could be drawn. */
  repeaterMapsMissing?: string | null;
  /** The map of home and the meeting points, drawn from the offline map before the book is made; absent, there is none. */
  placesMap?: { block: Block; pictures: ReadonlyMap<string, PdfPicture>; missing?: string | null } | null;
  /** The radio plans under Radio › Plans (everyone's), each with its kept matrix; the answers choose which go in. Absent: none. */
  radioPlans?: BookRadioPlan[];
  /** The time zone the radio plans' local times are given in; the device's when absent. */
  timeZone?: string;
  /** The household the book is for: named on the cover and in the footer when there are several. Absent: the only one. */
  which?: Pick<PaperHousehold, "name" | "kind" | "several"> | null;
  /** A portable household's people and kit, printed on the cover in place of an address. */
  travel?: { people: string[]; kit: string | null };
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
  /** The engines the radio plans in the book were worked out with. */
  radio = new Set<string>();
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
  /** How home is named in a sentence: "Cottage", or "where The van was on 20 November 2026" for a household that moves. */
  homeWords: string;
  /** What to say when there is no home to measure from. */
  noHome: string;
}

interface Section {
  /** The grey line under the section's title. */
  subtitle: string;
  content: Content[];
  /** Laid across the page: A6 grab cards, two to a sheet. */
  orientation?: "landscape";
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
    content.push(
      para("No people are listed for the household. Add them in the questions or under Prepare, Households, and make the book again."),
    );
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

/**
 * The places on the map of home and the meeting points, numbered as the map numbers them:
 * home, then the meeting points from the questions, then each plan's places once each.
 */
export function bookMapPlaces(
  answers: Pick<BookAnswers, "meetingPoints">,
  markers: MarkerDto[],
  plans: EmergencyPlanResponse[],
  /** Home, or where a portable household was (`paperHomePlace`): the first place. */
  first: { role: string; name: string; lat: number; lon: number } | null,
): ReturnType<typeof binderPlaces> {
  const { mapped, described } = binderPlaces({ plans, home: first });
  const [home, ...fromPlans] = first ? mapped : [undefined, ...mapped];
  const meeting = answers.meetingPoints
    .map((point) => ({ point, marker: markers.find((marker) => marker.id === point.markerId) }))
    .filter((entry) => entry.marker)
    .map((entry) => ({
      number: 0,
      role: entry.point.role === "near" ? "Meet near home" : "Meet outside the area",
      name: entry.marker!.name,
      lat: entry.marker!.lat,
      lon: entry.marker!.lon,
      note: entry.point.note,
    }));
  const seen = new Set<string>();
  const all = [...(home ? [home] : []), ...meeting, ...fromPlans].filter((place): place is NonNullable<typeof place> => {
    if (!place) return false;
    const key = `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { mapped: all.map((place, index) => ({ ...place, number: index + 1 })), described };
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

/** The radio plans that go in the book, by the answers, with their matrices. */
const bookRadioPlans = (c: Pick<BookInputs, "answers" | "radioPlans">): BookRadioPlan[] => {
  const all = c.radioPlans ?? [];
  const included = new Set(
    bookRadioPlanIds(
      c.answers,
      all.map((each) => each.plan),
    ),
  );
  return all.filter((each) => included.has(each.plan.id));
};

/**
 * What an emergency plan says about keeping in touch, each part named: its words, the
 * frequency, when, and the radio plan it names, with where that is in the book.
 */
function planCommsLines(c: Context, own: EmergencyPlanResponse): string[] {
  const comms = own.plan.body.comms;
  const out: string[] = [];
  if (comms.text.trim()) out.push(comms.text.trim());
  if (comms.frequency.trim()) out.push(`**On:** ${comms.frequency.trim()}`);
  if (comms.schedule.trim()) out.push(`**When:** ${comms.schedule.trim()}`);
  const radio = own.resolved.commPlan;
  if (comms.commPlanId && radio === null) out.push("**Radio plan:** one no longer in Outpost");
  else if (radio) {
    const inBook =
      c.answers.sections.includes("radio-plans") && bookRadioPlans(c).some((each) => each.plan.id === radio.id)
        ? "under Radio plans in this book"
        : "in Outpost under Radio › Plans";
    out.push(`**Radio plan:** ${radio.name}, ${inBook}`);
  }
  return out;
}

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
          ...(planCommsLines(c, own).length > 0 ? [callout("know", "Keeping in touch", bullets(planCommsLines(c, own)))] : []),
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
  const { mapped, described } = bookMapPlaces(c.answers, c.markers, bookPlans(c), paperHomePlace(c.which ?? null, c.facts.home));
  if (c.placesMap) {
    const block = c.placesMap.block;
    if (block.kind === "drawing") {
      const pictures = new Map([...c.placesMap.pictures].map(([id, picture]) => [id, `data:image/jpeg;base64,${base64Of(picture.jpeg)}`]));
      const items = block.draw(0, 0, c.measure);
      content.push(
        figure(sheetItemsToSvg(items, { x: 0, y: 0, width: c.measure, height: block.height }, pictures), {
          // The drawing's own captions already say when no map is under it: not twice.
          width: c.measure,
        }),
      );
    }
  } else if (mapped.length > 0)
    content.push(
      note("The map of these places is drawn from the offline map on the device the book is made on; none was drawn for this one."),
    );
  const flow = goRows(c, mapped);
  if (flow.length > 0)
    content.push(
      figure(goFlow(c.measure, flow).svg, {
        title: "Where we go",
        width: c.measure,
        caption:
          "Our meeting points and the people we would go to, from the questions. Numbers are the map's. Go to the first; if it cannot be reached, the next.",
      }),
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

/** The meeting points and the people the household would go to, as the drawing "Where we go" has them. */
function goRows(c: Context, mapped: Array<{ number: number; name: string; lat: number; lon: number }>): GoRow[] {
  const numberOf = (marker: MarkerDto | undefined) =>
    marker
      ? (mapped.find((place) => Math.abs(place.lat - marker.lat) < 1e-5 && Math.abs(place.lon - marker.lon) < 1e-5)?.number ?? null)
      : null;
  const points = (role: "near" | "away") =>
    c.answers.meetingPoints
      .filter((point) => point.role === role)
      .map((point) => c.markers.find((marker) => marker.id === point.markerId))
      .filter((marker): marker is MarkerDto => !!marker)
      .map((marker) => ({ name: marker.name, number: numberOf(marker) }));
  const rows: GoRow[] = [];
  const near = points("near");
  if (near.length > 0) rows.push({ kind: "near", when: "If we cannot get home, or must leave home", places: near });
  const away = points("away");
  if (away.length > 0) rows.push({ kind: "away", when: "If the area round home is closed", places: away });
  const stay = c.answers.destinations.map((destination) => {
    const contact = destination.contactId ? c.destinationContacts[destination.contactId] : null;
    const marker = destination.markerId ? c.markers.find((each) => each.id === destination.markerId) : undefined;
    return {
      name: destination.name,
      number: numberOf(marker),
      also: contact ? [contact.displayName, contact.phones[0]?.value].filter(Boolean).join(", ") : undefined,
    };
  });
  if (stay.length > 0) rows.push({ kind: "stay", when: "To stay with someone", places: stay });
  return rows;
}

function base64Of(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** What each kind of frequency needs, as the radio screens' own licence lines say (`licenceLine`). */
function radioUseOf(entry: FrequencyEntry): RadioUse {
  return entry.kind === "licence-free"
    ? "licence-free"
    : entry.kind === "amateur"
      ? "listen-and-transmit"
      : entry.kind === "distress"
        ? "listen-restricted"
        : "listen";
}

const STATUS_OF: Record<RadioUse, LicenceStatusKind> = {
  "licence-free": "free",
  listen: "listen",
  "listen-restricted": "listen",
  transmit: "licence",
  "listen-and-transmit": "licence",
};

/**
 * A frequency's values, run together: values that share a note are listed together
 * with the note once ("92 to 95 MHz, 103 to 105 MHz: BBC Radio 4 on FM"). A long note goes
 * to the section's notes and is cited by its number.
 */
function frequencyCell(entry: FrequencyEntry, notes: NoteList): Content {
  const groups: Array<{ note: string; values: string[] }> = [];
  for (const frequency of entry.frequencies) {
    const value = [formatFrequency(frequency), frequency.channel ? `ch ${frequency.channel}` : ""].filter(Boolean).join(" ");
    const about = [frequency.power, frequency.hours, frequency.note].filter(Boolean).join(", ");
    const group = groups.find((each) => each.note === about);
    if (group) group.values.push(value);
    else groups.push({ note: about, values: [value] });
  }
  const runs: Content[] = [];
  groups.forEach((group, index) => {
    const values = group.values.length > 8 ? [...group.values.slice(0, 6), `and ${group.values.length - 6} more`] : group.values;
    if (index > 0) runs.push("; ");
    runs.push(values.join(", "));
    if (!group.note) return;
    if (group.note.length <= 28) runs.push(` (${group.note})`);
    else runs.push({ text: `${notes.cite(group.note)}`, sup: true, color: PRINT_COLOURS.muted });
  });
  return { text: runs, fontSize: PRINT_TYPE.table } as Content;
}

/** One row: the name, the frequencies, and whether it needs a licence, with the note that says why. */
function frequencyRow(entry: FrequencyEntry, notes: NoteList, ours: boolean): Content[] {
  const use = radioUseOf(entry);
  const cited = [notes.cite(licenceLine(use, NO_RADIO_LICENCE)?.text ?? ""), ...(entry.listening ? [notes.cite(entry.listening)] : [])];
  return [
    {
      text: [...(ours ? [{ text: "Our plan: ", color: PRINT_COLOURS.act }] : []), { text: printable(entry.name), bold: true }],
      fontSize: PRINT_TYPE.table,
    } as Content,
    frequencyCell(entry, notes),
    licenceStatus(STATUS_OF[use], cited),
  ];
}

function frequencies(c: Context): Section {
  const content: Content[] = [];
  const summary: string[] = [];
  const notes = new NoteList();
  const head = ["Name", "Frequency", "Licence"];
  const widths = ["30%", "48%", "22%"];
  const planned = c.comms?.plan.updatedAt ? usedEntries(c.comms.plan, c.entries) : [];
  if (planned.length > 0) {
    content.push(
      callout("act", "Our communication plan's channels", [
        dataTable(
          head,
          planned.map((entry) => frequencyRow(entry, notes, true)),
          { widths },
        ),
        note("Marked “Our plan” wherever they appear below."),
      ]),
    );
    summary.push(...planned.map((entry) => `Plan: ${entry.name}`));
  }
  const ours = new Set(planned.map((entry) => entry.id));
  content.push(licenceKey());
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
          head,
          entries.map((entry) => frequencyRow(entry, notes, ours.has(entry.id))),
          { widths },
        ),
      );
      summary.push(...entries.map((entry) => entry.name));
    }
  }
  content.push(...repeaterContent(c, notes, summary));
  content.push(
    label("Notes"),
    ...notes.content(),
    note(
      `From Outpost's list of frequencies${c.country ? ` for ${placeName(c.country)}` : ""}. The licence lines are the radio screens' own; the regulators' words behind them are under Help › What needs a radio licence. Check a set's own rules before talking on anything.`,
    ),
  );
  c.summary.frequencies = summary;
  return {
    subtitle:
      "The communication plan's channels first, then what home's country has, each with whether it needs a licence, and the repeaters near our places with maps of their range.",
    content,
  };
}

/** The places the book lists repeaters round, and the repeaters chosen for each. */
export function bookRepeaterGroups(
  inputs: Pick<BookInputs, "answers" | "markers" | "plans" | "facts" | "which" | "repeaters">,
): RepeaterGroup[] {
  const included = new Set(
    bookPlanIds(
      inputs.answers,
      inputs.plans.map((each) => each.plan),
    ),
  );
  const first = paperHomePlace(inputs.which ?? null, inputs.facts.home);
  const locations = repeaterLocations({
    answers: inputs.answers,
    markers: inputs.markers,
    mapped: bookMapPlaces(
      inputs.answers,
      inputs.markers,
      inputs.plans.filter((each) => included.has(each.plan.id)),
      first,
    ).mapped,
    first,
    journeys: inputs.facts.journeys,
  });
  return chooseRepeaters(locations, inputs.repeaters ?? []);
}

const mhz = (hz: number) => (hz / 1e6).toFixed(4);

/** The input, with the shift from the output: "145.1250 (−0.6)". */
function inputCell(repeater: RepeaterDto): string {
  if (repeater.inputHz === null) return "";
  if (repeater.inputHz === repeater.outputHz) return "Simplex";
  const shift = (repeater.inputHz - repeater.outputHz) / 1e6;
  return `${mhz(repeater.inputHz)} (${shift > 0 ? "+" : "−"}${formatDecimalShift(Math.abs(shift))})`;
}
const formatDecimalShift = (value: number) => String(Number(value.toFixed(4)));

function repeaterRow(c: Context, each: ChosenRepeater, journey: boolean): string[] {
  const { repeater } = each;
  const range = c.repeaterRanges?.[repeater.id] ?? horizonRange(repeater);
  const where = journey
    ? `${metresWords(each.distanceMeters)} ${compassPoint(each.bearingDegrees)} of the line, ${metresWords(each.alongMeters ?? 0)} along`
    : `${metresWords(each.distanceMeters)} ${compassPoint(each.bearingDegrees)}`;
  return [
    `**${repeater.callsign}**`,
    mhz(repeater.outputHz),
    inputCell(repeater),
    repeater.ctcssHz ? `${repeater.ctcssHz} Hz` : repeater.dcsCode ? `DCS ${repeater.dcsCode}` : "None listed",
    repeater.modes.length > 0 ? repeater.modes.map(modeName).join(", ") : "FM",
    repeater.place,
    where,
    `${metresWords(range.meters)}${range.basis === "terrain" ? " (terrain)" : ""}`,
  ];
}

/** What a repeater table's columns mean, printed under the first. */
export const REPEATER_KEY =
  "**Output:** the frequency you listen on (the repeater transmits, your radio receives). **Input:** the frequency you transmit on (your radio sends, the repeater listens). **Shift:** input minus output. **Tone (CTCSS):** the sub-audible tone your radio must send to open the repeater; DCS is a digital code used the same way. **Likely range:** the typical range for a handheld at head height.";

/** Repeaters round every place, grouped by place, with a map of each; the lists they came from and their dates. */
function repeaterContent(c: Context, notes: NoteList, summary: string[]): Content[] {
  const content: Content[] = [label("Repeaters near our places")];
  const groups = bookRepeaterGroups(c);
  if (groups.length === 0) return [...content, note(c.noHome)];
  if (c.repeaters === null) return [...content, note("Outpost's repeater list could not be read when the book was made.")];
  if (groups.every((group) => group.chosen.length === 0))
    return [
      ...content,
      note("No repeater in Outpost's repeater list is near any of the book's places. Bring a list in under Radio › Repeaters."),
    ];
  const cited = notes.cite(licenceLine("listen-and-transmit", NO_RADIO_LICENCE)?.text ?? "");
  content.push(
    para(`The nearest useful repeaters round each place in this book, each listed once, under the first place it is near. ${SEARCH_WORDS}`),
    {
      columns: [
        { text: "Talking on any of them:", fontSize: PRINT_TYPE.small, width: "auto", margin: [0, 1, 4, 0] },
        licenceStatus("licence", [cited]),
      ],
      margin: [0, 0, 0, 4],
    } as Content,
  );
  let keyed = false;
  for (const group of groups) {
    const journey = Boolean(group.location.to);
    const title = placeLabel(group.location);
    content.push(heading(title));
    if (group.chosen.length > 0) {
      content.push(
        dataTable(
          ["Callsign", "Output", "Input (shift)", "Tone", "Mode", "Where", journey ? "From the line" : "From here", "Likely range"],
          group.chosen.map((each) => repeaterRow(c, each, journey)),
          { right: [1, 2] },
        ),
      );
      // What the columns mean, once, under the first table.
      if (!keyed) content.push({ text: rich(REPEATER_KEY) as never, fontSize: PRINT_TYPE.small, margin: [0, 0, 0, 6] } as Content);
      keyed = true;
    }
    if (group.also.length > 0) {
      // Grouped by the place each is listed under: "Also near: GB3AA 4 km N, GB3BB 7 km E (listed under Home)."
      const under = [...new Set(group.also.map((each) => each.listedUnder))];
      const runs = under.map(
        (place) =>
          `${group.also
            .filter((each) => each.listedUnder === place)
            .map(
              (each) =>
                `${each.repeater.callsign} ${metresWords(each.distanceMeters)} ${compassPoint(each.bearingDegrees)}${journey ? ` of the line, ${metresWords(each.alongMeters ?? 0)} along` : ""}`,
            )
            .join(", ")} (listed under ${place})`,
      );
      content.push(note(`${group.chosen.length > 0 ? "Also near" : "Near"}: ${runs.join("; ")}.`));
    }
    if (group.chosen.length === 0 && group.also.length === 0) content.push(note("No repeater in the list is near it."));
    summary.push(...group.chosen.map((each) => `Repeater: ${each.repeater.callsign}`));
  }
  // Where the repeaters come from, and how old the list is.
  const used = new Set(groups.flatMap((group) => group.chosen.map((each) => each.repeater.listId)));
  const lists = (c.repeaterLists ?? []).filter((list) => used.has(list.id));
  const from = [
    ...lists.map((list) => `${list.name}${list.source ? ` (${list.source})` : ""}, data of ${longDate.format(new Date(list.dataDate))}`),
    ...(used.has(null) ? ["entries made by hand on this Outpost"] : []),
  ];
  content.push(
    note(
      `Amateur radio repeaters from Outpost's repeater list${from.length > 0 ? `: ${from.join("; ")}` : ""}. A list says what was listed on its date, not what is on the air now.`,
    ),
  );
  for (const group of mappedGroups(groups))
    content.push(
      repeaterFigure({
        group,
        locations: groups.map((each) => each.location),
        ranges: c.repeaterRanges ?? {},
        map: c.repeaterMaps?.[group.location.key] ?? null,
        missing: c.repeaterMapsMissing ?? null,
        measure: c.measure,
      }),
    );
  return content;
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
  if (c.outlook && items.length > 0) {
    const outlook = c.outlook;
    const rows: LastingRow[] = [
      { label: "Food", days: outlook.food.days, why: "no one to feed, or no food counted" },
      { label: "Water to drink", days: outlook.water.daysDrinking, why: "no water counted" },
      { label: "Water for all uses", days: outlook.water.daysAllUses, why: "no water counted" },
      ...(outlook.petFood ? [{ label: "Pet food", days: outlook.petFood.days, why: "no pet food counted" }] : []),
    ];
    content.push(
      figure(lastingDrawing(c.measure, rows, outlook.daysWanted).svg, {
        title: "How long it lasts, against the days we want",
        width: c.measure,
        caption:
          "As Supplies works it out from what is entered there, eaten and drunk in date order; what passes its use-by first is not counted.",
      }),
    );
  }
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

/** A6, in points: 105 by 148 mm. */
const A6 = { width: (105 / 25.4) * 72, height: (148 / 25.4) * 72 };

/**
 * A card for each person, at its real size, with marks to cut along: wallet size (front
 * and back, folded along the broken line) two across, or A6 two to a sheet laid across.
 */
function grabCards(c: Context): Section {
  const content: Content[] = [];
  const people = c.grab?.people ?? [];
  const household = c.grab?.household;
  const a6 = c.answers.grabCardSize === "a6";
  if (!household || people.length === 0) {
    c.summary["grab-cards"] = [];
    return {
      subtitle: "A card for each person to carry.",
      content: [para("No people are listed yet. Add them in the questions or under Prepare, Households.")],
    };
  }
  const size = a6 ? 1 : 0.9;
  const small = (text: string): Content => ({ text, fontSize: 6.5 * size + 0.5, color: PRINT_COLOURS.muted, margin: [0, 2.5, 0, 0.5] });
  const line = (text: Content, bold = false): Content => ({ text: text as never, fontSize: 8 * size, bold, lineHeight: 1.1 });
  const cards = people.map((person) => {
    const front: Content[] = [
      { text: "In an emergency", fontSize: 7.5, bold: true, color: PRINT_COLOURS.act },
      { text: printable(person.name || "Name not given"), fontSize: 11 * size + 1, bold: true, margin: [0, 0.5, 0, 1] },
      {
        text: ["Call ", { text: household.emergencyNumber || c.number || "the emergency services", bold: true, color: PRINT_COLOURS.act }],
        fontSize: 10 * size,
      },
    ];
    if (person.sheetLocked) front.push(small("Medical sheet kept encrypted: not on this card."));
    else {
      front.push(line(`Blood group: ${person.bloodGroup || "not known"}`));
      if (person.allergies.length > 0) front.push(small("Allergies"), line(printable(person.allergies.join("; ")), true));
      if (person.needs.length > 0) front.push(small("Medical"), line(printable(person.needs.join("; "))));
      if (person.medicines.length > 0) front.push(small("Medicines"), line(printable(person.medicines.join("; "))));
    }
    const back: Content[] = [];
    const calls = [...person.contacts, ...household.contacts].filter((entry) => entry.phone).slice(0, 4);
    if (calls.length > 0)
      back.push(small("Who to contact"), ...calls.map((entry) => line([`${printable(entry.label)}: `, { text: entry.phone, bold: true }])));
    if (household.places.length > 0)
      back.push(small("Where we meet"), ...household.places.slice(0, 3).map((place) => line(printable(place))));
    if (household.comms.length > 0)
      back.push(small("Keeping in touch"), ...household.comms.slice(0, 2).map((text) => line(printable(text))));
    if (household.home)
      back.push(
        small(`Home: ${printable(household.home.name)}`),
        line(printable(gridLines(household.home.lat, household.home.lon, ["decimal", "osgb", "maidenhead"]).join("\n"))),
      );
    back.push({
      text: `Made ${longDate.format(c.made)} in Outpost. Our own plan: follow official warnings.`,
      fontSize: 6,
      color: PRINT_COLOURS.muted,
      margin: [0, 3, 0, 0],
    });
    return a6
      ? cutCard([[...front, ...back]], { width: A6.width, height: A6.height, inset: 12 })
      : cutCard([front, back], { width: CARD_WIDTH, height: CARD_HEIGHT, inset: 8 });
  });
  for (let index = 0; index < cards.length; index += 2)
    content.push({ columns: [cards[index]!, cards[index + 1] ?? { text: "" }], columnGap: 20 } as Content);
  content.push(
    note(
      `${a6 ? "A6, 105 by 148 mm, two to a sheet laid across" : "Wallet size, 85.6 by 54 mm: fold along the broken line, front and back"}. Print at actual size (100%) and cut along the corner marks. A card holds medical lines from each person's medical sheet; a sheet kept encrypted and not open on this device leaves them off.`,
    ),
  );
  c.summary["grab-cards"] = people.map((person) => person.name);
  return {
    subtitle: "A card for each person to carry, at its real size. Cut along the corner marks.",
    content,
    ...(a6 ? { orientation: "landscape" as const } : {}),
  };
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

type FirstAidPart = (typeof FIRST_AID_PAGES)[number]["parts"][number];

/**
 * A callout of an NHS page's lines, under the page's own headings, with the credit its
 * terms ask for; the page's address is a numbered note at the end of the section.
 */
function firstAidCallout(
  c: Context,
  page: (typeof FIRST_AID_PAGES)[number],
  title: string,
  parts: readonly FirstAidPart[],
  notes: NoteList,
): Content {
  const body: Content[] = [];
  for (const part of parts) {
    if (part.heading) body.push({ text: part.heading, bold: true, margin: [0, 2, 0, 1] });
    body.push(bullets(part.lines));
  }
  const cited = notes.cite(`${page.title}: ${page.url} (page last reviewed ${page.reviewed}).`);
  body.push({ text: [NHS_CREDIT, { text: ` ${cited}`, sup: true }], fontSize: PRINT_TYPE.small, color: PRINT_COLOURS.muted } as Content);
  c.used.nhs.add(page.id);
  return callout(FIRST_AID_KIND[page.id] ?? "know", title, body);
}

/** About how tall an NHS page's lines stand, to share them between two columns. */
const firstAidSize = (parts: readonly FirstAidPart[]) => parts.reduce((total, part) => total + part.lines.join(" ").length + 70, 140);

function firstAid(c: Context): Section {
  const notes = new NoteList();
  const content: Content[] = [
    note(
      `Lines quoted unchanged from the NHS website's pages, read on ${NHS_READ}, each under its page's own title and headings. They are written for the UK: where they say 999 or NHS 111, ${
        c.country === "GB" ? "that is the number to call" : `call ${c.number || "your emergency number"}`
      }. A course teaches what words cannot.`,
    ),
  ];
  const left: Content[] = [];
  const right: Content[] = [];
  let leftSize = 0;
  let rightSize = 0;
  const [cpr, ...rest] = FIRST_AID_PAGES;
  if (cpr) {
    // Resuscitation in two callouts, the second with the drawing of where to press beside it.
    const split = cpr.parts.findIndex((part) => part.heading.startsWith("7."));
    const before = split > 0 ? cpr.parts.slice(0, split) : cpr.parts;
    const after = split > 0 ? cpr.parts.slice(split) : [];
    left.push(firstAidCallout(c, cpr, cpr.title, before, notes));
    if (after.length > 0) left.push(firstAidCallout(c, cpr, `${cpr.title}: chest compressions`, after, notes));
    left.push(
      figure(chestCompressions({ narrow: true }).svg, {
        title: "Where to press",
        width: c.half,
        caption: "Outpost's drawing of the lines above on chest compressions. It adds nothing to them.",
      }),
    );
    leftSize += firstAidSize(cpr.parts) + 900;
  }
  // The recovery position, in FEMA's words, with its drawing.
  c.used.fema = true;
  const fema = notes.cite(`${RECOVERY_POSITION.title}, ${RECOVERY_POSITION.url}. ${RECOVERY_POSITION.terms}`);
  right.push(
    callout("know", "The recovery position", [
      bullets(RECOVERY_POSITION.parts.map((part) => `“${part}”`)),
      {
        text: ["FEMA's words, unchanged.", { text: ` ${fema}`, sup: true }],
        fontSize: PRINT_TYPE.small,
        color: PRINT_COLOURS.muted,
      } as Content,
    ]),
    figure(recoveryPosition({ narrow: true }).svg, {
      width: c.half,
      caption: "Outpost's drawing of FEMA's words, numbered as they are. It shows the position, not how to roll someone into it.",
    }),
    callout("warn", "Moving someone", [
      para(`“${RECOVERY_POSITION.caution[0]}”`),
      bullets(RECOVERY_POSITION.caution.slice(1).map((line) => `“${line}”`)),
    ]),
  );
  rightSize += 1500;
  // Every other page, one callout each, into the shorter column.
  for (const page of rest) {
    const made = firstAidCallout(c, page, page.title, page.parts, notes);
    if (leftSize <= rightSize) {
      left.push(made);
      leftSize += firstAidSize(page.parts);
    } else {
      right.push(made);
      rightSize += firstAidSize(page.parts);
    }
  }
  content.push(twoColumns(left, right));
  content.push(
    callout("warn", "What this section cannot hold", [
      para(
        "The NHS website no longer has its own pages on CPR for an adult, the recovery position, choking or severe bleeding: it sends readers to St John Ambulance. Those, and the British Red Cross's and Resuscitation Council UK's, may not be reprinted, so they are not here. Learn them on a course, keep a first aid manual with this book, and keep a first aid collection in Outpost's library (Explore › Medicine and first aid).",
      ),
      bullets(FIRST_AID_POINTERS.map((pointer) => `**${pointer.what}:** ${pointer.who}, ${pointer.url}`)),
    ]),
    label("Notes"),
    ...notes.content(),
  );
  c.summary["first-aid"] = FIRST_AID_PAGES.map((page) => `${page.title} (reviewed ${page.reviewed})`);
  return { subtitle: `Call ${c.number || "the emergency services"} first if you can. Then the words below, quoted unchanged.`, content };
}

function placesTable(group: BookPlaceGroup, wind: number | null): Content {
  // Most taps and many shelters carry no name on the map: with none named, the list leads with what each is.
  const named = group.places.some((place) => place.name.trim() !== "");
  return dataTable(
    [...(named ? ["Name"] : []), "What", "Distance", "Direction", "Position", ...(wind !== null ? ["Upwind"] : [])],
    group.places.map((place) => [
      ...(named ? [place.name.trim() || "–"] : []),
      place.kindLabel,
      metresWords(place.distanceMeters),
      direction(place.bearingDegrees),
      at4(place.lat, place.lon),
      ...(wind !== null ? [withinDegrees(place.bearingDegrees, wind) ? "**Yes**" : ""] : []),
    ]),
    { bold: [0], right: [named ? 2 : 1] },
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
  if (!c.facts.home) return { subtitle, content: [para(c.noHome)] };
  const content: Content[] = [
    note(
      `Measured in a straight line from ${c.homeWords} (${at4(c.facts.home.lat, c.facts.home.lon)}), from the reference layers installed on this Outpost. ${FOOD_WORDS.emergency} A place listed may have closed or moved: check before you need it.`,
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
  if (!c.facts.home) return { subtitle, content: [para(c.noHome)] };
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
  const comms = planCommsLines(c, own);
  if (comms.length > 0) content.push(label("Keeping in touch"), bullets(comms));
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

  // The steps in order, drawn; then each in words, quoted.
  content.push(
    figure(safeWaterFlow(c.measure).svg, {
      title: "Making water safe, in order",
      width: c.measure,
      caption: "The two steps below, as a path. Which way to clear it, and which way to kill the germs, is in the words under it.",
    }),
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
          figure(
            waterNeedsDrawing(
              c.half,
              n.list.map((need) => ({ name: need.name, drinking: need.drinking, allUses: need.allUses })),
            ).svg,
            {
              title: "Litres a day",
              width: c.half,
              caption: "The figures in the table, drawn to one scale.",
            },
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
  } else content.push(note("No people are listed for the household, so how much water is needed is not worked out."));
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
  if (!c.facts.home) content.push(note(c.noHome));
  else if (!points?.held) content.push(note(points ? notHeld(points, c.country) : "Not held."));
  else if (points.places.length === 0) content.push(note("No drinking water point is mapped near home in the layer held."));
  else {
    content.push(placesTable(points, null));
    content.push(note(`${FOOD_WORDS.osm} ${FOOD_WORDS.emergency} Water from anywhere but a working tap is made safe as above.`));
  }
  c.summary.water = [`${Math.ceil(n.drinking * n.days)} litres to drink for ${n.days} days`];
  return { subtitle: "How much to keep, and making water safe to drink with no tap and no power.", content };
}

/** The hours a step names ("over 4 hours"), or the figure given when it names none. */
const hoursIn = (words: string, otherwise: number) => Number(/(\d+) hours/.exec(words)?.[1] ?? otherwise);

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
  const [doors, fridge, freezer] = steps(["power-cut.during.8", "flooding.after.9", "flooding.after.10"], c.used);
  const timeline: Content[] =
    doors && fridge && freezer
      ? [
          figure(
            powerCutTimeline(c.measure, {
              doors: doors.replace(/\.$/, ""),
              fridge: "throw away fridge food if it was off longer",
              freezer: "throw away freezer food if it was off longer",
              fridgeHours: hoursIn(fridge, 4),
              freezerHours: hoursIn(freezer, 24),
            }).svg,
            {
              title: "Food in the fridge and freezer when the power is off",
              width: c.measure,
              caption: `The steps “${fridge.replace(/\.$/, "")}” and “${freezer.replace(/\.$/, "")}”, drawn as hours: GOV.UK's guidance for after a flood, listed at the back. Keeping the doors closed is its power cut page's.`,
            },
          ),
        ]
      : [];
  c.summary["food-hygiene"] = [`${Math.round(n.kcal)} kcal a day`];
  return {
    subtitle: "Food in a power cut or a flood, and keeping clean with little water.",
    content: [twoColumns(left, right), ...timeline],
  };
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

function radioPlans(c: Context): Section {
  const plans = bookRadioPlans(c);
  for (const each of plans) if (each.result) c.used.radio.add(`${each.result.engine.name} (${each.result.engine.model})`);
  const made = radioPlansContent({
    plans,
    emergencyPlans: bookPlans(c),
    contacts: c.emergencyContacts,
    timeZone: c.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    made: c.made,
    measure: c.measure,
  });
  c.summary["radio-plans"] = made.summary;
  return {
    subtitle:
      plans.length > 0
        ? `Our ${plans.length === 1 ? "radio plan" : `${plans.length} radio plans`}: when to listen and call, in local time and UTC, and the bands to try, best first.`
        : "Our radio plans from Radio › Plans: none is in the book yet.",
    content: made.content,
  };
}

function journeys(c: Context): Section {
  const subtitle = "To each place you would go: on foot, a stop for each day, and by car.";
  const content: Content[] = [];
  const summary: string[] = [];
  if (!c.facts.home) return { subtitle, content: [para(c.noHome)] };
  if (c.answers.destinations.length === 0) return { subtitle, content: [para("No place to go to was given in the questions.")] };
  c.used.tobler = true;
  content.push(
    callout(
      "know",
      "How these are worked out",
      para(
        `Each journey is the straight line from home, so the way on the ground is longer; for the roads to take, plan a road route under Maps › Routes and print its route card. The time on foot is worked out along that line with Tobler's hiking function (5 km/h on level ground, slower up and down the slopes of the ground along the line, from the terrain installed), for a fit adult with no load, and at half that pace, Outpost's allowance for someone hurt, tired, unused to hills, or with small children. ${c.answers.walkHoursPerDay} hours of walking a day is your own figure from the questions.`,
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
  if (!c.facts.home) return { subtitle, content: [para(c.noHome)] };
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
      ...(c.which?.kind === "portable"
        ? [`I am travelling with ${c.which.name}.`]
        : c.facts.home
          ? [`I live at ${c.facts.home.name}.`]
          : []),
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
  if (c.used.radio.size > 0)
    figures.push(
      `Radio plans: worked out on this Outpost with ${[...c.used.radio].join(", ")}, as each plan's own paper says. The rule that picks the bands is printed under Radio › Plans.`,
    );
  figures.push("The drawings are Outpost's own, each of the words printed beside it.");
  content.push(label("Figures, places and drawings"), bullets(figures));
  if (c.attributions.size > 0) content.push(label("Licences"), bullets([...c.attributions]));
  content.push(
    note(
      "The typeface is Atkinson Hyperlegible Next, by the Braille Institute of America, under the SIL Open Font License; letters it lacks are set in Noto Sans, by the Noto Project Authors, under the same licence.",
    ),
  );
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
  "radio-plans": radioPlans,
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

/** How home is named in a sentence, by the kind of household. */
function homeWordsOf(inputs: BookInputs): string {
  const home = inputs.facts.home;
  if (!home) return "home";
  if (inputs.which?.kind !== "portable") return home.name;
  const words = whereWasWords(inputs.which.name, { name: home.name, at: home.at ?? null });
  return words.charAt(0).toLowerCase() + words.slice(1);
}

/** What the book says when there is no home to measure from. */
function noHomeOf(which: BookInputs["which"] | null): string {
  if (which?.kind === "portable")
    return `Where ${which.name} is has not been set. Set it on the household's page under Preparedness › Households, and make the book again.`;
  if (which?.several)
    return `${which.name} has no home place. Choose one on the household's page under Preparedness › Households, and make the book again.`;
  return NO_HOME_PLACE;
}

/**
 * The cover's lines for a household that moves: where it was when the position was last
 * set and how old that was when the book was made, then its people and its kit. Never an
 * address: by the time the book is read the household may be somewhere else.
 */
function portableFacts(inputs: BookInputs): Array<[string, string]> {
  const which = inputs.which!;
  const home = inputs.facts.home;
  const lines: Array<[string, string]> = [];
  if (home) {
    const age = home.at == null ? null : ageWords(Math.max(0, inputs.made.getTime() - home.at));
    lines.push([
      "Last position",
      `**${whereWasWords(which.name, { name: home.name, at: home.at ?? null })}**\n${at4(home.lat, home.lon)}${age ? `\nSet ${age} before this book was made. It moves: this is not an address.` : ""}`,
    ]);
  } else lines.push(["Last position", "Not set when this book was made."]);
  const people = inputs.travel?.people ?? [];
  if (people.length > 0) lines.push(["People", people.join(", ")]);
  if (inputs.travel?.kit) lines.push(["Kit", inputs.travel.kit]);
  return lines;
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
    homeWords: homeWordsOf(inputs),
    noHome: noHomeOf(inputs.which ?? null),
  };
  const which = inputs.which ?? null;
  // With several households the book names the one it is for, as typed in the questions or as the household is called.
  const typed = inputs.answers.householdName.trim();
  const name = typed || (which?.several ? which.name : "");
  const alsoNamed = which?.several && typed && typed.toLocaleLowerCase() !== which.name.toLocaleLowerCase() ? which.name : null;
  const parts: PrintPart[] = [];
  const entries: Array<{ number: number; label: string; id: string; about?: string }> = [];
  const sections: BookSectionId[] = [];
  const numbered = (id: string, title: string, about: string, made: Section) => {
    const number = entries.length + 1;
    entries.push({ number, label: title, id: `section-${id}`, about });
    const across = made.orientation === "landscape";
    // Laid across, with narrower margins, so that two A6 cards fit side by side.
    const margins: [number, number, number, number] = [30, 34, 30, 40];
    const width = across ? PRINT_PAPERS[paper].height - margins[0] - margins[2] : measure;
    parts.push({
      kind: "section",
      running: `${number} · ${title}`,
      content: [sectionHeader({ number, title, subtitle: made.subtitle, id: `section-${id}` }, width), ...made.content],
      ...(across ? { orientation: "landscape" as const, margins } : {}),
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

  const title = name ? `${name}: household book${alsoNamed ? ` (${alsoNamed})` : ""}` : "Our household book";
  const made = longDate.format(inputs.made);
  const home = inputs.facts.home;
  // A small map of where home is, from the map of home and the meeting points when one was drawn.
  const placesBlock = inputs.placesMap?.block;
  const locator =
    placesBlock && placesBlock.kind === "drawing"
      ? {
          svg: sheetItemsToSvg(
            placesBlock.draw(0, 0, measure).filter((item) => item.kind !== "text"),
            { x: 0, y: 0, width: measure, height: placesBlock.height },
            new Map(
              [...(inputs.placesMap?.pictures ?? new Map())].map(([id, picture]) => [
                id,
                `data:image/jpeg;base64,${base64Of(picture.jpeg)}`,
              ]),
            ),
          ),
          caption: "Home and the meeting points. The full map is under Home and meeting points.",
        }
      : undefined;
  const moving = which?.kind === "portable";
  const coverPage = bookCover({
    kicker: alsoNamed ? `Household book · ${alsoNamed}` : "Household book",
    title: name || "Our household",
    subtitle: `Made on ${made} from what Outpost held then.`,
    call: {
      label: "In an emergency, call",
      number: c.number || "not given",
      note: inputs.answers.sections.includes("first-minutes") ? "Then turn to section 1, The first few minutes." : undefined,
    },
    facts: [
      ...(moving ? portableFacts(inputs) : []),
      ...(home && !moving
        ? ([
            [
              "Home",
              `**${home.name}**\n${at4(home.lat, home.lon)}${toMaidenhead(home.lat, home.lon, 6) ? `  ·  ${toMaidenhead(home.lat, home.lon, 6)}` : ""}`,
            ],
          ] as Array<[string, string]>)
        : []),
      ["Made", made],
      ["In it", `${entries.length} sections; contents overleaf`],
    ],
    art: contourArt(PRINT_PAPERS[paper].width, COVER_BAND, { seed: seedOf(name || "household"), colour: "#5f98a2" }).svg,
    locator,
    footnote: "Our household's own book, made in advance. In a real emergency, follow the emergency services and official warnings.",
    paper,
  });
  const front: PrintPart[] = [
    { kind: "cover", content: coverPage.content, background: coverPage.background },
    { kind: "plain", content: [...contentsPage(c, entries), ...frontContent(c)] },
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
