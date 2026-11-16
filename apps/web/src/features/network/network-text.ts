/** The words the Devices screen uses, kept apart so they can be tested on their own. */
import type { NetworkAbilities, NetworkDevice, NetworkScanSummary, NetworkStatus } from "@outpost/shared";
import { formatDateTime, plural } from "@/lib/utils";

/** The registry's size when it was last looked at, 16 November 2026: what "Fetch" says before it is pressed. */
export const MAKERS_BYTES_SEEN = 3_876_189;

/** What a device is called: the person's own name, else the one it gave, else its first address. */
export function deviceTitle(device: NetworkDevice): string {
  return device.label || device.name || device.addresses[0] || "A device";
}

/** "File sharing, Web page": what it announces, each kind once. */
export function servicesWords(device: NetworkDevice): string {
  return [...new Set(device.services.map((service) => service.label))].join(", ");
}

export function makerWords(device: NetworkDevice, makersPresent: boolean): string | null {
  if (device.privateMac) return "Private hardware address (the device made it up), so the maker is not known";
  if (device.maker) return device.maker;
  if (device.mac && makersPresent) return "Maker not in the registry";
  return null;
}

export function seenWords(device: NetworkDevice): string {
  if (device.firstSeenAt === device.lastSeenAt) return `Seen ${formatDateTime(device.lastSeenAt)}`;
  return `First seen ${formatDateTime(device.firstSeenAt)}; last seen ${formatDateTime(device.lastSeenAt)}`;
}

/** "Last looked on 16 Nov 2026, 14:03: 12 devices, 9 with a name; 754 probes in 38 seconds." */
export function scanWords(scan: NetworkScanSummary): string {
  const seconds = Math.max(1, Math.round((scan.finishedAt - scan.startedAt) / 1000));
  const changes =
    scan.newDevices > 0 || scan.goneDevices > 0
      ? ` Since the time before: ${plural(scan.newDevices, "new device")}, ${plural(scan.goneDevices, "device")} not seen.`
      : "";
  return `Last looked ${formatDateTime(scan.finishedAt)}: ${plural(scan.found, "device")}, ${scan.named} with a name; ${plural(scan.packets, "probe")} sent in ${plural(seconds, "second")}.${changes}`;
}

/** What this computer has not got, in a sentence each, so the screen can say what a scan here leaves out. */
export function missingWords(abilities: NetworkAbilities, os: NetworkStatus["os"]): string[] {
  const missing: string[] = [];
  if (!abilities.ping)
    missing.push(
      "Ping cannot be used here without special rights, so each address is asked only by the connection attempts. Devices that ignore those can still be found through the neighbour table.",
    );
  if (!abilities.neighbourTable)
    missing.push("The neighbour table cannot be read here, so hardware addresses and devices that ignore every probe are not found.");
  if (!abilities.announcements)
    missing.push(
      os === "linux"
        ? "Nothing here lists what devices announce (Avahi is not installed: on Debian or Raspberry Pi OS it is the avahi-utils package), so services such as file sharing and printers are not shown."
        : "Nothing here lists what devices announce, so services such as file sharing and printers are not shown.",
    );
  if (!abilities.router) missing.push("This computer's router could not be read, so it is not marked.");
  return missing;
}

/** The list as plain text, for "Copy the list". */
export function listText(devices: NetworkDevice[], makersPresent: boolean): string {
  return devices
    .map((device) => {
      const lines = [deviceTitle(device)];
      if (device.label && device.name) lines.push(`  Calls itself: ${device.name}`);
      lines.push(`  Addresses: ${device.addresses.join(", ")}`);
      if (device.mac) lines.push(`  Hardware address: ${device.mac}`);
      const maker = makerWords(device, makersPresent);
      if (maker) lines.push(`  Maker: ${maker}`);
      const services = servicesWords(device);
      if (services) lines.push(`  Announces: ${services}`);
      if (device.webUrl) lines.push(`  Web page: ${device.webUrl}`);
      if (device.isSelf) lines.push("  This computer");
      if (device.isRouter) lines.push("  Your router");
      lines.push(`  ${seenWords(device)}`);
      if (device.note) lines.push(`  Note: ${device.note.replace(/\s+/g, " ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
}
