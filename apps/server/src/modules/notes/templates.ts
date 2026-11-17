/**
 * The page templates Outpost ships. They are ordinary content documents kept in code,
 * so they need no storage, cannot be deleted by accident and are sanitised like any
 * other content when a page is made from one.
 */
import type { NoteCalloutVariant, NoteTemplate } from "@outpost/shared";
import type { PMNode } from "./content/schema.ts";

export interface BuiltinTemplate extends NoteTemplate {
  content: PMNode;
}

export const BUILTIN_PREFIX = "builtin:";

const text = (value: string): PMNode => ({ type: "text", text: value });
const bold = (value: string): PMNode => ({ type: "text", text: value, marks: [{ type: "bold" }] });
const p = (...content: Array<PMNode | string>): PMNode =>
  content.length > 0
    ? { type: "paragraph", content: content.map((part) => (typeof part === "string" ? text(part) : part)) }
    : { type: "paragraph" };
const h = (level: 1 | 2 | 3, value: string): PMNode => ({ type: "heading", attrs: { level }, content: [text(value)] });
const bullets = (...items: string[]): PMNode => ({
  type: "bulletList",
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});
const numbered = (...items: string[]): PMNode => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((item) => ({ type: "listItem", content: [p(item)] })),
});
const tasks = (...items: string[]): PMNode => ({
  type: "taskList",
  content: items.map((item) => ({ type: "taskItem", attrs: { checked: false }, content: [item ? p(item) : p()] })),
});
const callout = (variant: NoteCalloutVariant, ...content: PMNode[]): PMNode => ({ type: "callout", attrs: { variant }, content });
const table = (header: string[], ...rows: string[][]): PMNode => ({
  type: "table",
  content: [header, ...rows].map((cells, rowIndex) => ({
    type: "tableRow",
    content: cells.map((cell) => ({ type: rowIndex === 0 ? "tableHeader" : "tableCell", content: [cell ? p(cell) : p()] })),
  })),
});
const doc = (...content: PMNode[]): PMNode => ({ type: "doc", content });

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: `${BUILTIN_PREFIX}meeting-notes`,
    title: "Meeting notes",
    icon: null,
    description: "Who was there, what was discussed, what was decided and who does what next.",
    builtin: true,
    content: doc(
      p(bold("Date: "), " "),
      p(bold("Present: "), " "),
      h(2, "Agenda"),
      numbered("First topic", "Second topic"),
      h(2, "Notes"),
      p(),
      h(2, "Decisions"),
      bullets("What was agreed, in one line each"),
      h(2, "Actions"),
      tasks("Who does what, by when", ""),
      h(2, "Next meeting"),
      p("Date, place and what to prepare."),
    ),
  },
  {
    id: `${BUILTIN_PREFIX}trip-plan`,
    title: "Trip plan",
    icon: null,
    description: "Route, timings, bail-out points and who to tell, for a day out or a longer journey.",
    builtin: true,
    content: doc(
      callout("info", p(bold("Where and when: "), "destination, dates, who is going.")),
      h(2, "Route"),
      table(["Leg", "From → to", "Distance", "Time", "Notes"], ["1", "", "", "", ""], ["2", "", "", "", ""], ["3", "", "", "", ""]),
      h(2, "Key times"),
      bullets("Set off:", "Turn-around time (head back by this time, wherever you are):", "Expected back:"),
      h(2, "If things change"),
      callout(
        "warning",
        p(
          bold("Bail-out points and alternatives. "),
          "Where can the route be cut short? What is the plan in bad weather, or if someone is hurt?",
        ),
      ),
      h(2, "Who knows the plan"),
      p("Name and phone number of the person who has this plan, and when they should raise the alarm."),
      h(2, "Before leaving"),
      tasks(
        "Check the weather forecast and daylight hours",
        "Download maps for the area and check they open offline",
        "Charge phone, torch and power bank",
        "Pack food and water for the day, plus spare",
        "Leave the plan with someone at home",
      ),
      h(2, "Useful to have with you"),
      p("Link the map, kit list and any documents here so they open offline."),
    ),
  },
  {
    id: `${BUILTIN_PREFIX}kit-list`,
    title: "Kit list",
    icon: null,
    description: "A packing checklist by category. Tick items off as they go in the bag; untick to reuse.",
    builtin: true,
    content: doc(
      p("Tick each item as it goes in the bag. Add, remove and reorder lines to suit the trip."),
      h(2, "Clothing"),
      tasks("Waterproof jacket and trousers", "Warm layer", "Hat and gloves", "Spare socks", "Sturdy footwear"),
      h(2, "Shelter and sleep"),
      tasks("Tent or bivvy bag", "Sleeping bag", "Sleeping mat"),
      h(2, "Food and water"),
      tasks(
        "Water bottles (full)",
        "Water filter or purification tablets",
        "Stove, fuel and lighter",
        "Pan, mug and spoon",
        "Meals and snacks, plus one spare day",
      ),
      h(2, "Navigation and light"),
      tasks("Map and compass", "Phone with offline maps", "Head torch and spare batteries", "Power bank and cable"),
      h(2, "First aid and safety"),
      tasks("First aid kit", "Personal medication", "Whistle", "Survival blanket", "Knife or multi-tool"),
      h(2, "Paperwork and money"),
      tasks("ID", "Cash and card", "Emergency contact details"),
    ),
  },
  {
    id: `${BUILTIN_PREFIX}reference-card`,
    title: "Reference card",
    icon: null,
    description: "One page for a procedure or a piece of equipment: key facts, steps, warnings and a quick table.",
    builtin: true,
    content: doc(
      callout("info", p(bold("In one sentence: "), "what this card is for and when to reach for it.")),
      h(2, "Key facts"),
      table(["What", "Value", "Notes"], ["", "", ""], ["", "", ""], ["", "", ""]),
      h(2, "Steps"),
      numbered("First step", "Second step", "Third step"),
      callout("warning", p(bold("Watch out: "), "the mistake people most often make, and how to avoid it.")),
      callout("danger", p(bold("Stop if: "), "the signs that mean stop and get help.")),
      callout("success", p(bold("Done when: "), "how to tell it worked.")),
      h(2, "Sources"),
      p("Where this came from: link the document or page so it can be checked."),
    ),
  },
  {
    id: `${BUILTIN_PREFIX}daily-log`,
    title: "Daily log",
    icon: null,
    description: "A dated entry: conditions, what happened, what was used up and what is next.",
    builtin: true,
    content: doc(
      p(bold("Date: "), " "),
      p(bold("Place: "), " "),
      h(2, "Conditions"),
      p("Weather, temperature, anything unusual."),
      h(2, "What happened"),
      bullets("Morning:", "Afternoon:", "Evening:"),
      h(2, "Supplies"),
      table(["Item", "Used", "Left"], ["Water", "", ""], ["Food", "", ""], ["Fuel", "", ""]),
      h(2, "Problems and fixes"),
      p(),
      h(2, "Tomorrow"),
      tasks("", ""),
    ),
  },
];

export function findBuiltinTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}
