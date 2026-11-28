/**
 * The household's radio plans (Radio › Plans) in the book: for each one, its stations,
 * when to listen and call (in local time and UTC), the bands in order of preference for
 * each pair of stations, a drawing of the day's schedule and the plan's own grid of hours.
 *
 * The words and tables are the plan's own (plans/document.ts) and the grid is the plan
 * paper's (`pairGrid`), so the book says what the plan's PDF says. A plan with no matrix
 * worked out has no recommendation: the book gives its bands in the order the plan lists
 * them and says how to work it out. Pure: plans in, content out.
 */
import {
  type CommunicationPlan,
  type ContactDto,
  type EmergencyPlanResponse,
  HF_BANDS,
  hourRanges,
  licenceLine,
  NO_RADIO_LICENCE,
  OPERATING_MODES,
  type PlanChoice,
  type PlanResult,
  type PlanStation,
  planBandLabel,
  planHours,
  planRecommendation,
  toMaidenhead,
  utcLabel,
} from "@outpost/shared";
import type { Content } from "pdfmake/interfaces";
import { PRINT_COLOURS as C, callout, dataTable, drawing, figure, heading, label, note, para, round, svgText } from "@/features/print-kit";
import { planDocument } from "@/features/propagation/plans/document";
import { pairGrid } from "@/features/propagation/print/plan-print";
import { groupsOf } from "@/features/propagation/print/prediction-print";

/** A radio plan with the matrix last worked out for it as it stands; null when none is kept. */
export interface BookRadioPlan {
  plan: CommunicationPlan;
  result: PlanResult | null;
}

export interface RadioPlansInput {
  plans: BookRadioPlan[];
  /** The household's emergency plans in the book, to say which of them name a radio plan. */
  emergencyPlans: EmergencyPlanResponse[];
  /** Contacts whose call sign may be a station's. */
  contacts: ContactDto[];
  /** The time zone local times are given in: the device's the book is made on. */
  timeZone: string;
  made: Date;
  measure: number;
}

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** The moment an hour of the plan's day is, UTC: hour 24 is midnight at the end of it. */
const instantOf = (date: string, hour: number) => Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000;

/** "09:00" in the time zone, at that hour of the plan's day. */
export function localClock(date: string, hour: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(
    new Date(instantOf(date, hour)),
  );
}

/** The zone's short name on the plan's day: "GMT", "CET", "GMT+1". */
export function zoneName(date: string, hour: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone }).formatToParts(new Date(instantOf(date, hour)));
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/** Runs of hours, as `hourRanges` gives them in UTC, in local time: "09:00 to 21:00". */
export function localRanges(date: string, hours: number[], timeZone: string): string {
  const runs: Array<[number, number]> = [];
  for (const hour of hours) {
    const last = runs[runs.length - 1];
    if (last && (hour === last[1] + 1 || (last[1] === 24 && hour === 1))) last[1] = hour;
    else runs.push([hour, hour]);
  }
  return runs
    .map(([from, to]) =>
      from === to ? localClock(date, from, timeZone) : `${localClock(date, from, timeZone)} to ${localClock(date, to, timeZone)}`,
    )
    .join(", ");
}

const bandWords = (bandId: string) => {
  const band = HF_BANDS.find((each) => each.id === bandId);
  return band ? `${band.label} (${band.mhz} MHz)` : bandId;
};

const modeOf = (plan: CommunicationPlan, result: PlanResult | null) =>
  result?.mode.label ?? OPERATING_MODES.find((mode) => mode.id === plan.mode)?.label ?? plan.mode;

/**
 * A station's call sign: its own, given in the radio plan; else, for a station saved
 * without one, a contact's, where the station is named by it or after the contact.
 */
function callSignOf(station: Pick<PlanStation, "name" | "callsign">, contacts: ContactDto[]): string {
  const own = (station.callsign ?? "").trim();
  if (own) return own.toUpperCase();
  const key = station.name.trim().toLocaleLowerCase();
  const contact = contacts.find(
    (each) =>
      each.callsign.trim() && (each.callsign.trim().toLocaleLowerCase() === key || each.displayName.trim().toLocaleLowerCase() === key),
  );
  return contact?.callsign.trim().toUpperCase() ?? "";
}

// ── The day's schedule, drawn ───────────────────────────────────────────────

export interface ScheduleRow {
  label: string;
  /** Hours (1 to 24) of the first and second choice; the second is drawn lighter. */
  first: { hours: number[]; words: string } | null;
  second: { hours: number[]; words: string } | null;
}

/**
 * The plan's day as 24 hour cells: the plan's window, then for each pair the hours its
 * first and second band serve, with UTC over the cells and local time under them. An
 * hour's cell is the one its column is labelled with, as in the plan's grid of hours.
 */
export function scheduleDrawing(
  width: number,
  input: { date: string; window: number[]; rows: ScheduleRow[]; timeZone: string; zone: string },
) {
  const left = 64;
  const cell = (width - left - 4) / 24;
  const top = 22;
  const rowHeight = 13;
  // Each pair: its name on a line of its own, then its first and second band.
  const pairHeight = 12 + 2 * rowHeight + 6;
  const height = top + 16 + input.rows.length * pairHeight + 30;
  const column = (hour: number) => hour % 24;
  const x = (hour: number) => left + column(hour) * cell;
  let body = "";
  // UTC over the cells.
  body += svgText(left - 6, 12, "UTC", { anchor: "end", bold: true, size: 6.5, fill: C.muted });
  for (let hour = 0; hour < 24; hour += 1)
    body += svgText(left + hour * cell + cell / 2, 12, String(hour).padStart(2, "0"), { anchor: "middle", size: 6.5 });
  // The window.
  const windowY = top;
  body += svgText(left - 6, windowY + 9, "The window", { anchor: "end", size: 7, bold: true });
  for (let hour = 0; hour < 24; hour += 1)
    body += `<rect x="${round(left + hour * cell)}" y="${windowY}" width="${round(cell)}" height="11" fill="#ffffff" stroke="${C.rule}" stroke-width="0.5"/>`;
  for (const hour of input.window)
    body += `<rect x="${round(x(hour))}" y="${windowY}" width="${round(cell)}" height="11" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="0.5"/>`;
  // Each pair: the first band dark, the second pale with a border, each run labelled with its band.
  const run = (hours: number[], y: number, words: string, strong: boolean) => {
    let out = "";
    for (const hour of hours)
      out += `<rect x="${round(x(hour) + 0.4)}" y="${y}" width="${round(cell - 0.8)}" height="10" fill="${strong ? C.accent : "#ffffff"}" stroke="${C.accent}" stroke-width="${strong ? 0 : 0.8}"${strong ? "" : ' stroke-dasharray="2 1.2"'}/>`;
    const sorted = [...hours].sort((a, b) => column(a) - column(b));
    const start = sorted[0];
    if (start !== undefined) {
      // The band's name at the start of its longest stretch, in the cells if it fits, else after them.
      const cells = sorted.length;
      const fits = cells * cell > words.length * 3.6 + 6;
      out += fits
        ? svgText(x(start) + 2.5, y + 7.6, words, { size: 6.5, bold: true, fill: strong ? "#ffffff" : C.ink })
        : svgText(Math.min(width - 2, x(sorted[sorted.length - 1]!) + cell + 2), y + 7.6, words, {
            size: 6.5,
            bold: strong,
            fill: C.ink,
            anchor: x(sorted[sorted.length - 1]!) + cell + 40 > width ? "end" : "start",
          });
    }
    return out;
  };
  input.rows.forEach((row, index) => {
    const named = top + 16 + index * pairHeight;
    body += `<path d="M0,${named - 3} L${width},${named - 3}" stroke="${C.rule}" stroke-width="0.4"/>`;
    body += svgText(0, named + 8, row.label, { size: 7.5, bold: true });
    const y = named + 12;
    body += svgText(left - 6, y + 8, "first band", { anchor: "end", size: 6.5, fill: C.muted });
    body += svgText(left - 6, y + rowHeight + 8, "second band", { anchor: "end", size: 6.5, fill: C.muted });
    if (row.first) body += run(row.first.hours, y + 1, row.first.words, true);
    else body += svgText(left + 2, y + 8, "No band reaches the plan's floor", { size: 6.5, fill: C.muted });
    if (row.second) body += run(row.second.hours, y + rowHeight + 1, row.second.words, false);
  });
  // Local time under the cells.
  const localY = top + 16 + input.rows.length * pairHeight + 6;
  body += svgText(left - 6, localY, input.zone, { anchor: "end", bold: true, size: 6.5, fill: C.muted });
  for (let hour = 0; hour < 24; hour += 1) {
    const clock = localClock(input.date, hour === 0 ? 24 : hour, input.timeZone);
    const words = clock.endsWith(":00") ? clock.slice(0, 2) : clock;
    body += svgText(left + hour * cell + cell / 2, localY, words, { anchor: "middle", size: words.length > 2 ? 5 : 6.5 });
  }
  // A key.
  const keyY = localY + 16;
  body += `<rect x="${left}" y="${keyY - 7}" width="12" height="8" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="0.5"/>`;
  body += svgText(left + 16, keyY, "the plan's window", { size: 6.5 });
  body += `<rect x="${left + 96}" y="${keyY - 7}" width="12" height="8" fill="${C.accent}"/>`;
  body += svgText(left + 112, keyY, "first band", { size: 6.5 });
  body += `<rect x="${left + 170}" y="${keyY - 7}" width="12" height="8" fill="#ffffff" stroke="${C.accent}" stroke-width="0.8" stroke-dasharray="2 1.2"/>`;
  body += svgText(left + 186, keyY, "second band", { size: 6.5 });
  return drawing(width, height, body);
}

// ── One plan ────────────────────────────────────────────────────────────────

/** The table of a block group, by its heading in the plan's document. */
const tableOf = (groups: Map<string, ReturnType<typeof planDocument>>, name: string) => {
  const found = groups.get(name)?.find((block) => block.kind === "table");
  return found?.kind === "table" ? found : null;
};

function planContent(own: BookRadioPlan, input: RadioPlansInput, first: boolean, summary: string[]): Content[] {
  const { plan, result } = own;
  const { timeZone, measure } = input;
  const window = planHours(plan.fromUtc, plan.toUtc);
  const zone = zoneName(plan.date, plan.fromUtc, timeZone);
  const name = (id: string) => plan.stations.find((station) => station.id === id)?.name ?? id;
  const mode = modeOf(plan, result);
  const byRatio = result ? result.mode.requiredSnrDbHz === null : false;
  const content: Content[] = [
    {
      stack: [
        { text: "Radio plan", fontSize: 8, bold: true, color: C.accent, characterSpacing: 0.4 },
        { text: plan.name, fontSize: 15, bold: true, margin: [0, 1, 0, 1] },
        {
          text: `For any day of ${monthYear.format(new Date(`${plan.date}T00:00:00Z`))}. Mode: ${mode}. ${plan.stations.length} ${plan.stations.length === 1 ? "station" : "stations"}.`,
          fontSize: 8.5,
          color: C.muted,
        },
      ],
      margin: [0, first ? 0 : 6, 0, 8],
      headlineLevel: 2,
      pageBreak: first ? undefined : "before",
    } as Content,
  ];
  summary.push(`Plan: ${plan.name}, ${utcLabel(plan.fromUtc)} to ${utcLabel(plan.toUtc)} UTC`);

  // When to listen and call, and on what: the first thing a person needs.
  const blocks = result ? planDocument(plan, result, input.made) : null;
  const groups = blocks ? groupsOf(blocks) : null;
  const chosen = result ? result.pairs.map((pair) => ({ pair, pick: planRecommendation(pair, window, byRatio) })) : [];
  const when: string[][] = [
    [
      "**The plan's window**",
      `${utcLabel(plan.fromUtc)} to ${utcLabel(plan.toUtc)} UTC`,
      `${localClock(plan.date, plan.fromUtc, timeZone)} to ${localClock(plan.date, plan.toUtc, timeZone)} ${zone}`,
    ],
  ];
  const choiceRow = (between: string, rank: string, choice: PlanChoice) => [
    `**${between}**, ${rank}`,
    `${bandWords(choice.bandId)}, ${hourRanges(choice.hours)} UTC`,
    `${localRanges(plan.date, choice.hours, timeZone)} ${zone}`,
  ];
  for (const { pair, pick } of chosen) {
    const between = `${name(pair.a)} and ${name(pair.b)}`;
    if (pick.primary) when.push(choiceRow(between, "first", pick.primary));
    if (pick.alternate) when.push(choiceRow(between, "second", pick.alternate));
    if (!pick.primary) when.push([`**${between}**`, "No band recommended", pick.none ?? ""]);
    if (pick.primary) summary.push(`${plan.name}: ${between} on ${planBandLabel(pick.primary.bandId)}`);
  }
  content.push(
    callout(
      "act",
      "When to listen and call",
      [
        dataTable(["", "UTC", `Local time (${zone})`], when, { widths: ["34%", "33%", "33%"] }),
        note(
          `Local time is ${timeZone}'s, the time on the device the book was made on, for ${monthYear.format(new Date(`${plan.date}T00:00:00Z`))}. Check the clock is right: a contact needs both ends on the same hour.`,
        ),
      ],
      { keep: true },
    ),
  );

  // The day, drawn.
  if (result && chosen.length > 0) {
    const rows: ScheduleRow[] = chosen.slice(0, 8).map(({ pair, pick }) => ({
      label: `${name(pair.a)} and ${name(pair.b)}`,
      first: pick.primary ? { hours: pick.primary.hours, words: planBandLabel(pick.primary.bandId) } : null,
      second: pick.alternate ? { hours: pick.alternate.hours, words: planBandLabel(pick.alternate.bandId) } : null,
    }));
    content.push(
      figure(scheduleDrawing(measure, { date: plan.date, window, rows, timeZone, zone }).svg, {
        title: "The plan's day",
        width: measure,
        caption: `Each cell is an hour, as in the plan's grid below. ${chosen.length > 8 ? `The first 8 of ${chosen.length} pairs are drawn; every pair is in the table above. ` : ""}A band's hours are those the plan's rule picks for it; outside them it may still work.`,
      }),
    );
  }

  // The bands in order of preference.
  content.push(heading("Bands, in order of preference"));
  if (result && groups) {
    const which = tableOf(groups, "Which band for each pair");
    if (which) content.push(dataTable(which.head, which.rows, { right: which.right, bold: [0, 2] }));
    const rest = (used: string[]) => plan.bands.filter((band) => !used.includes(band));
    const others = chosen
      .map(({ pair, pick }) => ({
        between: `${name(pair.a)} and ${name(pair.b)}`,
        rest: rest([pick.primary?.bandId, pick.alternate?.bandId].filter((id): id is string => !!id)),
      }))
      .filter((each) => each.rest.length > 0);
    if (others.length > 0)
      content.push(
        note(
          `Then the plan's other bands, as it lists them: ${[...new Set(others.flatMap((each) => each.rest))].map(bandWords).join(", ")}.`,
        ),
      );
  } else {
    content.push(
      para(`In the order the plan lists them: ${plan.bands.map(bandWords).join(", ")}. Mode: ${mode}.`),
      callout(
        "know",
        "Not worked out yet",
        para(
          "No prediction is kept for this plan as it stands, so the book cannot say which band suits each pair at which hour. Open it under Radio › Plans, press Work out the plan, and make the book again.",
          0,
        ),
      ),
    );
  }

  // The stations, with a call sign where a contact has one.
  const stationTable = groups ? tableOf(groups, "Stations") : null;
  const head = stationTable?.head ?? ["Station", "Position", "Locator", "Power", "Antenna"];
  const rows =
    stationTable?.rows ??
    plan.stations.map((station) => [
      station.name,
      `${station.lat.toFixed(2)}, ${station.lon.toFixed(2)}`,
      toMaidenhead(station.lat, station.lon, 6) ?? "",
      `${station.powerWatts} W`,
      station.antennaName || "Not named",
    ]);
  const signs = plan.stations.map((station) => callSignOf(station, input.contacts));
  const withSigns = signs.some(Boolean);
  content.push({
    stack: [
      label("Stations"),
      dataTable(
        withSigns ? [head[0]!, "Call sign", ...head.slice(1)] : head,
        rows.map((row, index) => (withSigns ? [row[0]!, signs[index] ?? "", ...row.slice(1)] : row)),
        { bold: [0] },
      ),
      ...(withSigns
        ? []
        : [
            note(
              "Give a station its call sign in the radio plan and it is printed here; without one, a contact with the station's name or call sign gives it.",
            ),
          ]),
    ],
    unbreakable: true,
  } as Content);
  summary.push(...plan.stations.map((station) => `${plan.name}: station ${station.name}`));

  // Each pair's hours on every band: the plan paper's own grid.
  if (result && blocks && groups) {
    for (const { pair } of chosen) {
      const between = `${name(pair.a)} and ${name(pair.b)}`;
      const table = groups.get(between)?.find((block) => block.kind === "table");
      if (table?.kind !== "table") continue;
      content.push({
        stack: [label(`${between}: each band by the hour`), ...pairGrid(table, pair, window, byRatio, measure)],
        unbreakable: true,
      } as Content);
    }
    const opening = groups.get("") ?? [];
    if (opening[2]?.kind === "para") content.push(note(opening[2].text));
  }

  const naming = input.emergencyPlans.filter((each) => each.plan.body.comms.commPlanId === plan.id);
  if (naming.length > 0)
    content.push(
      note(`Named in our emergency ${naming.length === 1 ? "plan" : "plans"}: ${naming.map((each) => each.plan.name).join(", ")}.`),
    );
  if (plan.notes.trim())
    content.push(
      label("The plan's notes"),
      ...plan.notes
        .split(/\n\s*\n/)
        .filter((each) => each.trim())
        .map((each) => para(each.trim())),
    );
  return content;
}

/** Every radio plan chosen, one after another. */
export function radioPlansContent(input: RadioPlansInput): { content: Content[]; summary: string[] } {
  const summary: string[] = [];
  if (input.plans.length === 0)
    return {
      content: [
        para(
          "No radio plan is in the book. Make one under Radio › Plans: the stations you would talk between, the hours, and the bands to try, then make the book again.",
        ),
      ],
      summary,
    };
  const content = input.plans.flatMap((own, index) => planContent(own, input, index === 0, summary));
  content.push(
    note(
      `Each plan's figures are a prediction from monthly medians, worked out on this Outpost, not a reading of the day. These are amateur bands. ${licenceLine("listen-and-transmit", NO_RADIO_LICENCE)?.text ?? ""} The regulators' words are under Help › What needs a radio licence.`,
    ),
  );
  return { content, summary };
}
