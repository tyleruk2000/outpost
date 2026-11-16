/**
 * The screens under Tools, in the order they are listed. The navigation (components/nav.ts)
 * and the Tools page are both drawn from this list: to add a tool, add an entry here and
 * a route in app.tsx. Keep one entry to one line group, so that two people adding tools
 * at once meet only here.
 */
import { MonitorSmartphone, QrCode } from "lucide-react";
import type { SectionScreen } from "@/components/section";

export const toolScreens: SectionScreen[] = [
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
