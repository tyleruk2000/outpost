/**
 * The screens under Tools, in the order they are listed. The navigation (components/nav.ts)
 * and the Tools page are both drawn from this list: to add a tool, add an entry here and
 * a route in app.tsx. Keep one entry to one line group, so that two people adding tools
 * at once meet only here.
 */
import {
  BatteryCharging,
  CookingPot,
  Droplets,
  Hammer,
  MonitorSmartphone,
  Mountain,
  Navigation,
  QrCode,
  RadioTower,
  Sprout,
  SunMedium,
  Waves,
} from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const toolScreens: SectionScreen[] = [
  // The calculators (features/tools/water, outdoors, radio, building, cooking), built on the shared kit in features/tools/kit.
  {
    to: "/tools/water",
    label: "Water",
    icon: Droplets,
    keywords: "safe drinking purify purification treatment boil rainwater filter storage tank",
    about: "Water to store for a household, rain from a roof, filter life, and making water safe to drink, from official guidance.",
  },
  {
    to: "/tools/outdoors",
    label: "Outdoors",
    icon: Mountain,
    keywords: "hiking walking hill naismith gradient distance bearing sunrise sunset daylight wind chill cold heat index",
    about:
      "Walking time by Naismith's rule, gradients, distance and bearing, the sun's day, wind chill, heat index, and water and food for a walk.",
  },
  {
    to: "/tools/radio",
    label: "Radio calculators",
    icon: RadioTower,
    keywords: "antenna aerial dipole path loss horizon coax cable dbm s-meter duty cycle",
    about:
      "Antenna lengths, free-space path loss, the radio horizon, cable loss, watts, dBm and S-units, and battery life on a duty cycle.",
  },
  {
    to: "/tools/building",
    label: "Building",
    icon: Hammer,
    keywords: "concrete mortar diy roof pitch timber wood insulation u-value plasterboard heat loss",
    about: "Concrete and mortar, area and volume, roof pitch, a cutting list, U-values and heat loss, and sheets and fixings.",
  },
  {
    to: "/tools/cooking",
    label: "Cooking",
    icon: CookingPot,
    keywords: "kitchen roast turkey oven gas mark temperature recipe timer weights measures conversions",
    about:
      "Roasting times and safe temperatures from UK food-safety guidance, a timer, boiling at altitude, conversions and scaling a recipe.",
  },
  {
    to: "/tools/power",
    label: "Power and batteries",
    icon: BatteryCharging,
    keywords: "battery solar panel inverter generator off-grid electricity watts amps cable power cut",
    about: "How long a battery runs your equipment and how much solar it needs, with calculators for cable, generators and small circuits.",
  },
  {
    to: "/tools/qr",
    label: "QR codes",
    icon: QrCode,
    keywords: "qr code barcode wifi wi-fi password vcard",
    about:
      "Make a code a phone can read: text, a web address, a contact, or a Wi-Fi network and its password. Made on this device; nothing typed is sent anywhere.",
  },
  {
    to: "/tools/network",
    label: "Devices on this network",
    icon: MonitorSmartphone,
    keywords: "network wifi lan scan ip address router nas printer",
    about:
      "See what answers on the network the computer running Outpost is on: a NAS, a printer, a Raspberry Pi whose address you have forgotten.",
  },
  {
    to: "/tools/solar-clock",
    label: "Solar clock",
    icon: SunMedium,
    keywords: "sundial shadow time clock nocturnal sun position sunrise",
    about:
      "The sun's place now, setting your clocks from a shadow after a power cut, and how to make a sundial and a nocturnal. Works with no internet.",
  },
  {
    to: "/tools/compass",
    label: "Compass",
    icon: Navigation,
    about:
      "Magnetic north and the map's grid north at a place, what to add or subtract between map and compass, and the phone's own compass corrected by them.",
    keywords: "bearing north direction declination magnetic variation grid magnetic angle",
  },
  {
    to: "/tools/tides",
    label: "Tide times",
    icon: Waves,
    keywords: "tide tides high water low water sea coast harbour beach fishing",
    about: "High and low water at the tide stations near a place, days or weeks ahead, worked out with no internet. US coasts for now.",
  },
  {
    to: "/tools/garden",
    label: "Garden",
    icon: Sprout,
    keywords: "vegetables veg grow your own sow sowing seeds plant out harvest frost rhs calendar",
    about:
      "What to sow, plant out and harvest this month in the UK, from the RHS calendar, kept back for your last frost, and a record of what you sowed.",
  },
];
