/**
 * The screens under Tools, in the order they are listed. The navigation (components/nav.ts)
 * and the Tools page are both drawn from this list: to add a tool, add an entry here and
 * a route in app.tsx. Keep one entry to one line group, so that two people adding tools
 * at once meet only here.
 */
import { BatteryCharging } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const toolScreens: SectionScreen[] = [
  {
    to: "/tools/power",
    label: "Power and batteries",
    icon: BatteryCharging,
    about: "How long a battery runs your equipment and how much solar it needs, with calculators for cable, generators and small circuits.",
  },
];
