/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import { ClipboardList, CloudSun, Package, Radius } from "lucide-react";
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
];
