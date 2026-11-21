/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import {
  BookCopy,
  BookOpen,
  CalendarClock,
  ClipboardList,
  CloudSun,
  HeartPulse,
  IdCard,
  NotebookTabs,
  Package,
  RadioTower,
  Radius,
  UsersRound,
  WifiOff,
} from "lucide-react";
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
  // The household book (features/household-book), on its own lines.
  {
    to: "/prepare/book",
    label: "Household book",
    icon: BookOpen,
    keywords: "household book emergency book wizard questions printable pack family plan walk home pdf",
    about:
      "A few questions about your household, and a printable book made from the answers and from what Outpost holds: first minutes, people, help near home, first aid, water, journeys on foot, checklists.",
  },
  // Readiness (features/readiness), one entry each.
  {
    to: "/prepare/check-in",
    label: "Check-in and roll call",
    icon: UsersRound,
    keywords: "check in im ok i am safe need help roll call is everyone ok who has checked in household",
    about:
      "“I'm safe” or “I need help” with one press, and the roll call: everyone's latest check-in, who has not checked in since a time, and a way to ask everyone.",
  },
  {
    to: "/prepare/log",
    label: "Log of events",
    icon: NotebookTabs,
    keywords: "log diary timeline what happened when incident insurance insurer record power went off",
    about: "What happened when, one line at a time, stamped with the time and who wrote it. Prints, and writes to a page of Notes.",
  },
  {
    to: "/prepare/checks",
    label: "Routine checks",
    icon: CalendarClock,
    keywords: "routine checks maintenance rotate stored water overdue reminder upkeep",
    about:
      "Rotate the water, test the torches, run the generator: each check with how often and when it was last done. Home shows what is overdue.",
  },
  {
    to: "/prepare/offline-drill",
    label: "Offline drill",
    icon: WifiOff,
    keywords: "offline drill internet down without internet test what works no connection practice",
    about:
      "What would stop working if the internet went off now, from what Outpost holds, and a drill to follow with the router unplugged.",
  },
];
