/**
 * The screens under Preparedness, in the order they are listed. The navigation
 * (components/nav.ts) and the Preparedness page are both drawn from this list: to add a
 * screen, add an entry here and a route in app.tsx. Keep one entry to one line group, so
 * that two people adding screens at once meet only here.
 */
import { Radius } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const prepareScreens: SectionScreen[] = [
  {
    to: "/prepare/nuclear",
    label: "Nuclear preparedness",
    icon: Radius,
    about:
      "An offline map workspace with an educational effects simulator: what a published model says a detonation of a stated size does at a distance, for an idealised case.",
  },
];
