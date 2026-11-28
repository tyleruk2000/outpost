/**
 * Official guidance on water, quoted word for word from the publishers' own pages, with
 * the date each was read and the date the page gives itself. Nothing here is worked out:
 * where bodies differ, each is quoted and the screen says whose figure it uses. US pages
 * keep their US spelling inside quotation marks.
 */
import { isUkRegion } from "@/lib/region";
import type { Source } from "../kit";

const READ = "2026-11-16";

export const WATER_SOURCES = {
  epa: {
    name: "US Environmental Protection Agency, “Emergency Disinfection of Drinking Water” (last updated 24 February 2026)",
    url: "https://www.epa.gov/ground-water-and-drinking-water/emergency-disinfection-drinking-water",
    read: READ,
  },
  cdcEmergency: {
    name: "US Centers for Disease Control and Prevention, “How to Make Water Safe in an Emergency” (19 September 2024)",
    url: "https://www.cdc.gov/water-emergency/about/index.html",
    read: READ,
  },
  cdcBackcountry: {
    name: "CDC, “A Guide to Drinking Water Treatment and Sanitation for Backcountry and Travel Use” (chart CS341852-A, July 2023)",
    url: "https://www.cdc.gov/healthywater/pdf/drinking/Backcountry_Water_Treatment-508.pdf",
    read: READ,
  },
  cdcHiking: {
    name: "CDC, “Water Treatment Options When Hiking, Camping, or Traveling” (30 January 2025)",
    url: "https://www.cdc.gov/drinking-water/prevention/water-treatment-hiking-camping-traveling.html",
    read: READ,
  },
  cdcYellowBook: {
    name: "CDC Yellow Book, “Water Disinfection” (last updated 23 April 2025)",
    url: "https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/water-disinfection-for-travelers.html",
    read: READ,
  },
  cdcStorage: {
    name: "CDC, “How to Create and Store an Emergency Water Supply” (27 June 2025)",
    url: "https://www.cdc.gov/water-emergency/about/how-to-create-and-store-an-emergency-water-supply.html",
    read: READ,
  },
  who: {
    name: "World Health Organization, “Boil water”, technical brief WHO/FWC/WSH/15.02 (14 January 2015)",
    url: "https://www.who.int/publications/i/item/WHO-FWC-WSH-15.02",
    read: READ,
  },
  whoTn9: {
    name: "WHO, Technical note 9, “How much water is needed in emergencies” (updated July 2013), table 9.1, adapted from Sphere",
    url: "https://cdn.who.int/media/docs/default-source/wash-documents/who-tn-09-how-much-water-is-needed.pdf",
    read: READ,
  },
  dwi: {
    name: "Drinking Water Inspectorate (UK), “Receiving a Boil Water Notice” (modified 16 May 2024)",
    url: "https://www.dwi.gov.uk/receiving-a-boil-water-notice/",
    read: READ,
  },
  ukBeReady: {
    name: "UK Government, “Be ready for emergencies”",
    url: "https://beready.campaign.gov.uk/be-ready-for-emergencies/",
    read: READ,
  },
  readyGov: {
    name: "Ready.gov (FEMA), “Water” (last updated 22 February 2021)",
    url: "https://www.ready.gov/water",
    read: READ,
  },
  bs8515: {
    name: "BS 8515, Rainwater harvesting systems: code of practice, draft for public comment (BSI, 30 June 2008), annex A, table A.1, and the yield formula",
  },
  ciria: {
    name: "CIRIA C753 The SuDS Manual, table 11.4, as quoted by UNDA's rainwater harvesting calculator",
    url: "https://www.unda.co.uk/drainage-calculators/rainwater-harvesting-calculator/",
    read: READ,
  },
  label: { name: "Your filter's own label or instructions" },
} satisfies Record<string, Source>;

// ── Planning figures for stored water ───────────────────────────────────────

export interface PlanningFigure {
  id: string;
  /** Whose figure, in a few words. */
  who: string;
  /** Litres a person a day: one figure, or the ends of a range. */
  litres: readonly [number, number];
  /** What the figure covers. */
  covers: string;
  /** The days the body recommends storing for, if it says. */
  days: string;
  quote: string;
  source: Source;
}

/** A US gallon in litres (NIST Handbook 44). */
const US_GALLON = 3.785411784;

export const PLANNING_FIGURES: readonly PlanningFigure[] = [
  {
    id: "uk",
    who: "UK Government",
    litres: [3, 3],
    covers: "drinking only",
    days: "3 days",
    quote:
      "“Bottled water for 3 days”; “3 litres per person per day for drinking. More would be needed for other tasks such as cooking and washing.”",
    source: WATER_SOURCES.ukBeReady,
  },
  {
    id: "cdc",
    who: "CDC (US)",
    litres: [US_GALLON, US_GALLON],
    covers: "drinking, cooking, brushing teeth and other uses",
    days: "3 days; 2 weeks if possible",
    quote:
      "“Store at least 1 gallon of water per person, per day for 3 days. You can use this water during an emergency for drinking, cooking, brushing teeth, and other uses. Try to store a 2-week supply if possible.”",
    source: WATER_SOURCES.cdcStorage,
  },
  {
    id: "fema",
    who: "FEMA, Ready.gov (US)",
    litres: [US_GALLON, US_GALLON],
    covers: "drinking and sanitation",
    days: "several days",
    quote:
      "“Store at least one gallon of water per person per day for several days, for drinking and sanitation.” … “In very hot temperatures, water needs can double.”",
    source: WATER_SOURCES.readyGov,
  },
  {
    id: "who-survival",
    who: "WHO, survival",
    litres: [2.5, 3],
    covers: "drinking and food",
    days: "not stated",
    quote: "“Survival (drinking and food) 2.5 to 3 lpd Depends on climate and individual physiology”",
    source: WATER_SOURCES.whoTn9,
  },
  {
    id: "who-basic",
    who: "WHO, basic needs",
    litres: [7.5, 15],
    covers: "drinking and food, basic hygiene and basic cooking",
    days: "not stated",
    quote:
      "“Survival (drinking and food) 2.5 to 3 lpd … Basic hygiene practices 2 to 6 lpd … Basic cooking needs 3 to 6 lpd … Total 7.5 to 15 lpd”",
    source: WATER_SOURCES.whoTn9,
  },
];

/** The United States and its territories, where the CDC's and FEMA's guidance is the government's own. */
const US_REGIONS = new Set(["US", "PR", "GU", "VI", "AS", "MP"]);

/**
 * The planning figure the calculator starts on, by Home's country (else the device's
 * region): the UK government's in the UK and the Crown Dependencies, the CDC's in the
 * United States, and elsewhere, where Outpost has read no government's own figure, the
 * WHO's figure for survival, the one for many countries. Only a first choice: the person
 * can choose any, and what they choose is kept.
 */
export function startingFigure(region: string | null | undefined): PlanningFigure["id"] {
  const code = region?.toUpperCase() ?? null;
  if (isUkRegion(code)) return "uk";
  if (code && US_REGIONS.has(code)) return "cdc";
  return "who-survival";
}

// ── Rain run-off ────────────────────────────────────────────────────────────

/** Run-off coefficients: the share of rain on a surface that reaches the gutter. */
export const RUNOFF = [
  { id: "tiles", label: "Pitched roof, tiles", bs8515: 0.8, ciria: 0.9 },
  { id: "metal", label: "Pitched roof, profiled metal", bs8515: 0.9, ciria: 0.95 },
  { id: "flat", label: "Flat roof without gravel", bs8515: 0.8, ciria: 0.8 },
  { id: "gravel", label: "Flat roof with gravel", bs8515: 0.8, ciria: 0.6 },
  { id: "green-ext", label: "Green roof, extensive", bs8515: 0.7, ciria: 0.5 },
  { id: "green-int", label: "Green roof, intensive", bs8515: 0.5, ciria: 0.3 },
] as const;

/** The filter efficiency the draft BS 8515 says is “commonly quoted and used”. */
export const FILTER_EFFICIENCY = 0.9;

// ── Treating water ──────────────────────────────────────────────────────────

/** One row of an official bleach table, as written. */
export interface BleachRow {
  water: string;
  dose: string;
}

export interface BleachTable {
  id: string;
  /** "Unscented household bleach, 6%". */
  title: string;
  rows: readonly BleachRow[];
  source: Source;
}

/** EPA's table, exactly as published: "Bleach may contain 6 or 8.25% sodium hypochlorite." */
export const BLEACH_TABLES: readonly BleachTable[] = [
  {
    id: "epa-6",
    title: "6% bleach (EPA)",
    rows: [
      { water: "1 quart/liter", dose: "2 drops" },
      { water: "1 gallon", dose: "8 drops" },
      { water: "2 gallons", dose: "16 drops (1/4 tsp)" },
      { water: "4 gallons", dose: "1/3 teaspoon" },
      { water: "8 gallons", dose: "2/3 teaspoon" },
    ],
    source: WATER_SOURCES.epa,
  },
  {
    id: "epa-8",
    title: "8.25% bleach (EPA)",
    rows: [
      { water: "1 quart/liter", dose: "2 drops" },
      { water: "1 gallon", dose: "6 drops" },
      { water: "2 gallons", dose: "12 drops (1/8 teaspoon)" },
      { water: "4 gallons", dose: "1/4 teaspoon" },
      { water: "8 gallons", dose: "1/2 teaspoon" },
    ],
    source: WATER_SOURCES.epa,
  },
  {
    id: "cdc-5-9",
    title: "5% to 9% bleach (CDC)",
    rows: [
      { water: "1 quart or liter", dose: "Add 2 drops of bleach / Add 0.1 mL of bleach / Add a tiny amount (too small to measure)" },
      { water: "1 gallon", dose: "Add 8 drops of bleach / Add ½ mL of bleach / Add a little less than 1/8 teaspoon" },
      { water: "5 gallons", dose: "Add 40 drops of bleach / Add 2½ mL of bleach / Add ½ teaspoon of bleach" },
    ],
    source: WATER_SOURCES.cdcEmergency,
  },
  {
    id: "cdc-1",
    title: "1% bleach (CDC)",
    rows: [
      { water: "1 quart/liter", dose: "10 drops / ½ mL / 1/8 teaspoon" },
      { water: "1 gallon", dose: "40 drops / 2½ mL / ½ teaspoon" },
      { water: "5 gallons", dose: "200 drops / 12½ mL / 2½ teaspoons" },
    ],
    source: WATER_SOURCES.cdcEmergency,
  },
];

/** What the EPA and the CDC say goes with a bleach dose, word for word. */
export const BLEACH_STEPS: readonly { text: string; who: string }[] = [
  {
    text: "Only use regular, unscented chlorine bleach products … Do not use scented, color safe, or bleaches with added cleaners.",
    who: "EPA",
  },
  {
    text: "Locate a fresh liquid chlorine bleach or liquid chlorine bleach that is stored at room temperatures for less than one year.",
    who: "EPA",
  },
  { text: "Double the amount of bleach if the water is cloudy, colored, or very cold.", who: "EPA" },
  {
    text: "Stir and let stand for 30 minutes. The water should have a slight chlorine odor. If it doesn't, repeat the dosage and let stand for another 15 minutes before use.",
    who: "EPA",
  },
  {
    text: "If the chlorine taste is too strong, pour the water from one clean container to another and let it stand for a few hours before use.",
    who: "EPA",
  },
  { text: "Let the water stand for at least 30 minutes before you drink it.", who: "CDC" },
];

export type Effect = "Effective" | "Somewhat effective" | "Not effective";

export interface Method {
  id: string;
  name: string;
  /** The CDC backcountry chart's verdict against each kind of germ, word for word. */
  bacteria: string;
  viruses: string;
  giardia: string;
  cryptosporidium: string;
  /** What the method is, and its limits, quoted. */
  quotes: readonly { text: string; who: string }[];
}

/** The CDC's chart of treatments against germs (CS341852-A), cell for cell, with what the CDC and others say of each. */
export const METHODS: readonly Method[] = [
  {
    id: "boil",
    name: "Boiling",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Effective",
    cryptosporidium: "Effective",
    quotes: [
      { text: "Bring clear water to a rolling boil for 1 minute (at elevations above 6,500 feet, boil for 3 minutes).", who: "CDC" },
      {
        text: "Bring water to a rolling boil for at least one minute. At altitudes above 5,000 feet (1,000 meters), boil water for three minutes.",
        who: "EPA",
      },
      {
        text: "the process of heating water to a rolling boil … is sufficient to inactivate pathogenic bacteria, viruses and protozoa. After the water has reached a rolling boil, it should be removed from the heat, allowed to cool naturally, without the addition of ice, and protected from post-treatment recontamination during storage.",
        who: "WHO",
      },
      {
        text: "You should boil your water until it reaches a rolling ball [sic: boil]. Remove the water from the heat and allow it to cool naturally. The water should be stored in a clean container, in the fridge and should be discarded if not used within 24 hours.",
        who: "Drinking Water Inspectorate (UK)",
      },
    ],
  },
  {
    id: "filter",
    name: "Filter",
    bacteria: "Effective, 0.3 micron or smaller filter",
    viruses: "Not effective",
    giardia: "Effective, filter certified for “cyst” and “oocyst” reduction",
    cryptosporidium: "Effective, filter certified for “cyst” and “oocyst” reduction",
    quotes: [
      {
        text: "A filter labeled with either of the following will remove parasites, but not viruses or all bacteria: Absolute pore (hole) size of 1 micron or smaller; Certified for NSF standards 53 or 58 for cyst reduction or removal.",
        who: "CDC",
      },
      {
        text: "A filter with an absolute pore (hole) size of 0.3 micron or smaller will remove bacteria and parasites, but not viruses.",
        who: "CDC",
      },
      {
        text: "After filtering, add a chemical disinfectant—such as iodine, chlorine, or chlorine dioxide—to the filtered water.",
        who: "CDC",
      },
    ],
  },
  {
    id: "purifier",
    name: "Purifier",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Effective",
    cryptosporidium: "Effective",
    quotes: [{ text: "Reverse osmosis filters remove parasites, bacteria, and viruses. They also remove salt from water.", who: "CDC" }],
  },
  {
    id: "chlorine",
    name: "Chlorine (bleach or tablets)",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Somewhat effective",
    cryptosporidium: "Not effective",
    quotes: [
      {
        text: "Follow the instructions on the label or package of chlorine dioxide, chlorine, or iodine tablets or drops. Chemical disinfectants are made to disinfect specific amounts of water.",
        who: "CDC",
      },
      {
        text: "disinfectants do not work as well as boiling for killing some germs, including the parasites Cryptosporidium and Giardia.",
        who: "CDC",
      },
    ],
  },
  {
    id: "iodine",
    name: "Iodine",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Somewhat effective",
    cryptosporidium: "Not effective",
    quotes: [
      {
        text: "If you are pregnant, have thyroid problems, or have a hypersensitivity to iodine, avoid drinking water disinfected with iodine. Additionally, no one should drink water disinfected with iodine for more than a few weeks at a time.",
        who: "CDC",
      },
    ],
  },
  {
    id: "chlorine-dioxide",
    name: "Chlorine dioxide",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Effective",
    cryptosporidium: "Somewhat effective",
    quotes: [
      {
        text: "Chlorine dioxide tablets can kill the parasite Giardia and are somewhat effective at killing Cryptosporidium.",
        who: "CDC (hiking page)",
      },
      {
        text: "Chlorine dioxide tablets will kill Cryptosporidium as long as you follow the instructions correctly.",
        who: "CDC (emergency page)",
      },
    ],
  },
  {
    id: "filter-plus",
    name: "Filter, then disinfectant",
    bacteria: "Effective, 0.3 micron or smaller filter, plus disinfectant",
    viruses: "Effective",
    giardia: "Effective, filter certified for “cyst” and “oocyst” reduction, plus chlorine dioxide",
    cryptosporidium: "Effective, filter certified for “cyst” and “oocyst” reduction, plus chlorine dioxide",
    quotes: [],
  },
  {
    id: "uv",
    name: "UV light, in clear water",
    bacteria: "Effective",
    viruses: "Effective",
    giardia: "Effective",
    cryptosporidium: "Effective",
    quotes: [
      {
        text: "Portable units that deliver ultraviolet (UV) light can kill germs in small amounts of clear water. UV light does not work well in cloudy water because small particles can block germs from the light.",
        who: "CDC",
      },
      {
        text: "Lay the bottles down on their side and in the sun for 6 hours (if sunny) or 2 days (if cloudy).",
        who: "CDC, on solar disinfection in clear plastic bottles",
      },
    ],
  },
];

/** What no method on the list makes safe, quoted. */
export const WHAT_NONE_REMOVE: readonly { text: string; who: string }[] = [
  {
    text: "You cannot make water containing fuel, toxic chemicals, or radioactive materials safe by boiling or disinfecting it. If you know or suspect your water contains fuel or toxic chemicals: 1) Use bottled water or a different source of water 2) Contact your health department for specific advice.",
    who: "CDC",
  },
  {
    text: "However, boiling or disinfection will not destroy other contaminants, such as heavy metals, salts, and most other chemicals.",
    who: "EPA",
  },
];

/** The words of the CDC chart's legend. */
export const EFFECT_LEGEND =
  "EFFECTIVE—will remove or kill this type of germ. SOMEWHAT EFFECTIVE—may remove some germs of this type, but water could still be unsafe. NOT EFFECTIVE—will not remove or kill this type of germ.";
