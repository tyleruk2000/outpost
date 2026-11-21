/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import { BookCopy, ClipboardList, CloudSun, HeartPulse, IdCard, Package, RadioTower, Radius } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const prepareScreens: SectionScreen[] = [
  {
    to: "/prepare/plans",
    label: "Emergency plans",
    icon: ClipboardList,
    keywords: "emergency plan grab bag go bag meeting point power cut blackout evacuation flood print cards what to do",
    about:
      "What your household will do in a power cut, a flood, severe weather or with no phone: steps from official guidance, contacts, places to meet, supplies, and cards to print.",
  },
  {
    to: "/prepare/supplies",
    label: "Supplies",
    icon: Package,
    keywords: "food water stock pantry stockpile cupboard tins kit barcode shopping list how long days calories kcal energy",
    about:
      "Food, water and kit kept at home: how many days they last for your household, what to use first, and what to buy. Scan barcodes to find things.",
  },
  {
    to: "/prepare/weather",
    label: "Weather and hazards",
    icon: CloudSun,
    keywords: "weather forecast rain wind warnings flood river sea levels tide storm barometer climate",
    about:
      "Forecasts, severe-weather and flood warnings, river levels and climate averages for your places, fetched when you press and kept for when there is no connection, each with its age. A barometer log of your own readings.",
  },
  {
    to: "/prepare/nuclear",
    label: "Nuclear preparedness",
    icon: Radius,
    keywords: "nuclear bomb fallout blast shelter radiation detonation",
    about:
      "An offline map workspace with an educational effects simulator: what a published model says a detonation of a stated size does at a distance, for an idealised case.",
  },
  // The household's papers (features/household-papers), one entry each.
  {
    to: "/prepare/medical",
    label: "Medical sheets",
    icon: HeartPulse,
    keywords: "medical medicines medication allergies allergy conditions blood group gp doctor next of kin paramedic prescription",
    about:
      "For each person: medicines with dose and where they are kept, allergies, conditions, blood group, GP, pharmacy and next of kin. Can be kept encrypted. Records only, no medical advice.",
  },
  {
    to: "/prepare/keeping-in-touch",
    label: "Keeping in touch",
    icon: RadioTower,
    keywords: "communication plan pace primary alternate contingency emergency check in comms phones down walkie talkie pmr446 mesh",
    about:
      "The household's communication plan: for each situation, what to try first and what next, when to check in and who to contact. A page for each person.",
  },
  {
    to: "/prepare/grab-cards",
    label: "Grab cards",
    icon: IdCard,
    keywords: "grab card wallet card a6 ice in case of emergency card id card print",
    about:
      "A card for each person to carry, wallet size or A6: medical needs, who to contact, where to meet, and where home is in several grid formats.",
  },
  {
    to: "/prepare/binder",
    label: "Household binder",
    icon: BookCopy,
    keywords: "binder folder print everything pdf paper copy household binder",
    about: "Everything that matters on paper, as one PDF with a contents page. Home says when it is older than what is in it.",
  },
];
