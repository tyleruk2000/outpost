/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import { CloudSun, Package } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const prepareScreens: SectionScreen[] = [
  {
    to: "/prepare/supplies",
    label: "Supplies",
    icon: Package,
    about:
      "Food, water and kit kept at home: how many days they last for your household, what to use first, and what to buy. Scan barcodes to find things.",
  },
  {
    to: "/prepare/weather",
    label: "Weather and hazards",
    icon: CloudSun,
    about:
      "Forecasts, severe-weather and flood warnings, river levels and climate averages for your places, fetched when you press and kept for when there is no connection, each with its age. A barometer log of your own readings.",
  },
];
