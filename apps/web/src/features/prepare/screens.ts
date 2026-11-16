/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import { Package, Radius } from "lucide-react";
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
    to: "/prepare/nuclear",
    label: "Nuclear preparedness",
    icon: Radius,
    about:
      "An offline map workspace with an educational effects simulator: what a published model says a detonation of a stated size does at a distance, for an idealised case.",
  },
];
