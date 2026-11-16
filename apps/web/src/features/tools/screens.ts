/**
 * The screens under Tools, in the order they are listed. The navigation (components/nav.ts)
 * and the Tools page are both drawn from this list: to add a tool, add an entry here and
 * a route in app.tsx. Keep one entry to one line group, so that two people adding tools
 * at once meet only here.
 */
import { BatteryCharging, CookingPot, Droplets, Hammer, MonitorSmartphone, Mountain, QrCode, RadioTower } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const toolScreens: SectionScreen[] = [
  // The calculators (features/tools/water, outdoors, radio, building, cooking), built on the shared kit in features/tools/kit.
  {
    to: "/tools/water",
    label: "Water",
    icon: Droplets,
    about: "Water to store for a household, rain from a roof, filter life, and making water safe to drink, from official guidance.",
  },
  {
    to: "/tools/outdoors",
    label: "Outdoors",
    icon: Mountain,
    about:
      "Walking time by Naismith's rule, gradients, distance and bearing, the sun's day, wind chill, heat index, and water and food for a walk.",
  },
  {
    to: "/tools/radio",
    label: "Radio calculators",
    icon: RadioTower,
    about:
      "Antenna lengths, free-space path loss, the radio horizon, cable loss, watts, dBm and S-units, and battery life on a duty cycle.",
  },
  {
    to: "/tools/building",
    label: "Building",
    icon: Hammer,
    about: "Concrete and mortar, area and volume, roof pitch, a cutting list, U-values and heat loss, and sheets and fixings.",
  },
  {
    to: "/tools/cooking",
    label: "Cooking",
    icon: CookingPot,
    about:
      "Roasting times and safe temperatures from UK food-safety guidance, a timer, boiling at altitude, conversions and scaling a recipe.",
  },
  {
    to: "/tools/power",
    label: "Power and batteries",
    icon: BatteryCharging,
    about: "How long a battery runs your equipment and how much solar it needs, with calculators for cable, generators and small circuits.",
  },
  {
    to: "/tools/qr",
    label: "QR codes",
    icon: QrCode,
    about:
      "Make a code a phone can read: text, a web address, a contact, or a Wi-Fi network and its password. Made on this device; nothing typed is sent anywhere.",
  },
  {
    to: "/tools/network",
    label: "Devices on this network",
    icon: MonitorSmartphone,
    about:
      "See what answers on the network the computer running Outpost is on: a NAS, a printer, a Raspberry Pi whose address you have forgotten.",
  },
];
