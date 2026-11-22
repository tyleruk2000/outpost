/** Made-up people for the household papers' tests: nobody here is real. */
import { type CommsPlan, type CommsResolved, type EventLogLine, emptyMedicalRecord, type MedicalRecord } from "@outpost/shared";
import type { GrabHousehold } from "./grab-cards";

export const MADE = new Date(2026, 10, 20, 9, 30);
export const TODAY = "2026-11-21";

export const record = (over: Partial<MedicalRecord> = {}): MedicalRecord => ({
  ...emptyMedicalRecord(),
  born: "1988-04-12",
  bloodGroup: "O+",
  allergies: [
    { id: "a", what: "Penicillin", reaction: "Hives and swelling of the face" },
    { id: "b", what: "Peanuts", reaction: "Anaphylaxis: adrenaline pen in the bag" },
  ],
  conditions: [
    { id: "c", what: "Asthma", note: "Worse in cold air" },
    { id: "d", what: "Underactive thyroid", note: "" },
  ],
  medicines: [
    {
      id: "m",
      name: "Salbutamol",
      dose: "Two puffs",
      when: "When needed",
      keptWhere: "Coat pocket",
      held: null,
      unit: "",
      perDay: null,
      countedOn: null,
    },
    {
      id: "n",
      name: "Levothyroxine",
      dose: "50 mcg",
      when: "Morning",
      keptWhere: "Kitchen cupboard",
      held: 28,
      unit: "tablets",
      perDay: 1,
      countedOn: "2026-11-01",
    },
  ],
  gp: { contactId: null, name: "Fell Surgery", phone: "01632 960 000" },
  pharmacy: { contactId: null, name: "High Street Pharmacy", phone: "01632 960 222" },
  nextOfKin: [{ id: "k", contactId: null, name: "Ana Silva", phone: "+44 7700 900123", relation: "Mother" }],
  notes: "Wears glasses. Keeps a spare inhaler in the car.",
  ...over,
});

export const household: GrabHousehold = {
  emergencyNumber: "999",
  contacts: [{ label: "Grandma (out of area)", phone: "+44 1632 960 111" }],
  places: ["If the home cannot be used: Number 12's porch", "If the area must be left: Village hall"],
  comms: ["Phones down: Phone call, then Mesh radio message", "Check in: every day at 12:00"],
  home: { name: "Home", lat: 54.3, lon: -2.2 },
};

export const comms: CommsPlan = {
  checkIns: "Every day at 12:00",
  people: [
    { id: "p", memberId: "m1", name: "Sam", note: "Wait at the school office" },
    { id: "q", memberId: "m2", name: "Ελένη Παπαδοπούλου", note: "" },
  ],
  notes: "Keep the handheld radios charged.",
  updatedAt: 1,
  situations: [
    {
      id: "s",
      name: "Phones down",
      checkIn: "On the hour",
      contactIds: ["k1", "gone"],
      steps: [
        {
          id: "3",
          level: "contingency",
          means: "radio",
          contactId: null,
          frequency: { entryId: "lf-pmr446-analogue", channel: "3" },
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "on the hour",
          text: "",
        },
        {
          id: "1",
          level: "primary",
          means: "phone",
          contactId: "k1",
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "",
          text: "",
        },
        {
          id: "2",
          level: "alternate",
          means: "text",
          contactId: "k1",
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "",
          text: "",
        },
        {
          id: "4",
          level: "emergency",
          means: "meet",
          contactId: null,
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: "gone-place",
          when: "noon",
          text: "",
        },
      ],
    },
    {
      id: "t",
      name: "Flood warning",
      checkIn: "",
      contactIds: ["k1"],
      steps: [
        {
          id: "5",
          level: "primary",
          means: "phone",
          contactId: "k1",
          frequency: null,
          repeaterId: null,
          meshChannel: null,
          markerId: null,
          when: "",
          text: "",
        },
      ],
    },
  ],
};

export const resolvedComms: CommsResolved = {
  contacts: { k1: { displayName: "Ana Silva", phones: [{ value: "+44 7700 900123", label: "" }], callsign: "" }, gone: null },
  places: { "gone-place": null },
  repeaters: {},
  mesh: {},
};

const DAY = 24 * 60 * 60 * 1000;
const AT = new Date(2026, 10, 21, 14, 10).getTime();
const line = (over: Partial<EventLogLine>): EventLogLine => ({
  kind: "entry",
  id: String(Math.random()),
  at: AT,
  author: "Ana",
  text: "",
  planId: null,
  planName: null,
  createdAt: 1,
  updatedAt: 1,
  edited: null,
  ...over,
});

export const logLines: EventLogLine[] = [
  line({ id: "a", at: AT - DAY, text: "Power went off" }),
  line({ id: "b", at: AT - DAY + 20 * 60 * 1000, text: "Called the network operator: about four hours, they said", planName: "Power cut" }),
  line({
    id: "c",
    kind: "tick",
    at: AT - DAY + 25 * 60 * 1000,
    author: "",
    text: "Done: Switch off the oven",
    planId: "p",
    planName: "Power cut",
  }),
  line({ id: "d", kind: "checkin", at: AT - DAY + 60 * 60 * 1000, author: "Sam", text: "Checked in: OK, at school" }),
  line({ id: "e", at: AT - 2 * 60 * 60 * 1000, author: "王小明", text: "River at the bottom step" }),
  line({ id: "f", at: AT, author: "Ana", text: "Moved the car to the village hall" }),
];
