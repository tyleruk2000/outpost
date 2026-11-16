/**
 * What devices say about themselves: the services they announce on the local network
 * with multicast DNS (Bonjour, mDNS). Outpost asks the system's own service for what
 * it has heard, as the network-share screen does to find a NAS
 * (`modules/storage/shares/commands.ts`):
 *
 *  - macOS: `dns-sd`, which talks to the system's mDNSResponder. First the kinds of
 *    service announced (`_services._dns-sd._udp`), then the devices announcing each,
 *    then where each one is.
 *  - Linux: `avahi-browse --all --resolve --parsable --terminate`, when Avahi is
 *    installed (Raspberry Pi OS has it; a slim container does not).
 *
 * Both only send the standard questions every phone and computer on the network sends
 * to find a printer. Nothing is sent to a device itself.
 */
import { type NetworkAdvert, ownValue } from "@outpost/shared";

export interface Announcement {
  /** "_smb._tcp". */
  type: string;
  /** The name the service is announced under, as announced. */
  name: string;
  /** The host name it gave ("workshop-nas.local"), when resolved. */
  host: string | null;
  /** Its address, when known. */
  address: string | null;
  port: number | null;
}

/** Service kinds in plain words. Anything else is shown as announced. */
const LABELS: Record<string, string> = {
  _smb: "File sharing",
  _afpovertcp: "File sharing (AFP)",
  _nfs: "File sharing (NFS)",
  _webdav: "File sharing (WebDAV)",
  _adisk: "Time Machine backups",
  _ipp: "Printer",
  _ipps: "Printer",
  _printer: "Printer",
  "_pdl-datastream": "Printer",
  _scanner: "Scanner",
  _uscan: "Scanner",
  _uscans: "Scanner",
  _airplay: "AirPlay",
  _raop: "AirPlay audio",
  _googlecast: "Chromecast",
  "_spotify-connect": "Spotify Connect",
  _sonos: "Sonos speaker",
  _daap: "Music sharing",
  _http: "Web page",
  _https: "Web page",
  _ssh: "Remote login (SSH)",
  "_sftp-ssh": "File transfer (SFTP)",
  _rfb: "Screen sharing",
  _workstation: "Computer",
  "_device-info": "Device information",
  "_companion-link": "Apple device",
  _hap: "HomeKit accessory",
  _homekit: "HomeKit accessory",
  _matter: "Matter accessory",
  _matterc: "Matter accessory",
  _mqtt: "MQTT messages",
  "_home-assistant": "Home Assistant",
  _esphomelib: "ESPHome device",
  _octoprint: "OctoPrint",
  _hue: "Philips Hue bridge",
  _rdlink: "Apple device",
  _sleep_proxy: "Sleep proxy",
};

export function serviceLabel(type: string): string {
  const head = type.split(".")[0] ?? type;
  return ownValue(LABELS, head.toLowerCase()) ?? type;
}

/** Text from the network, made safe to keep and show: no control characters, no more than 80 characters. */
export function cleanName(text: string, length = 80): string {
  const visible = [...text].filter((char) => char.charCodeAt(0) >= 0x20 && char !== "\u007f").join("");
  return visible.replace(/\s+/g, " ").trim().slice(0, length);
}

export function toAdvert(entry: Announcement): NetworkAdvert {
  return { type: entry.type, label: serviceLabel(entry.type), name: cleanName(entry.name), port: entry.port };
}

const TYPE = /^_[A-Za-z0-9-]{1,40}\._(tcp|udp)$/;

/**
 * Kinds of service from `dns-sd -B _services._dns-sd._udp local.`: each line names one,
 * split across two columns ("_tcp.local." and "_smb").
 */
export function parseServiceTypes(output: string): string[] {
  const types = new Set<string>();
  for (const line of output.split("\n")) {
    const match = /^\S+\s+Add\s+\d+\s+\d+\s+\S+\s+(_tcp|_udp)\.\S*\s+(_\S+)\s*$/.exec(line);
    if (!match) continue;
    const type = `${match[2]}.${match[1]}`;
    if (TYPE.test(type)) types.add(type);
  }
  return [...types];
}

/**
 * A name a device announced, as it may be handed to a command as one of its arguments. A device chooses its
 * own name, and one starting with a hyphen would be read by the command as an option, not a name: such a
 * name is left out (the device is still found by its address; only what it announces is not asked about).
 */
export function usableAsArgument(name: string): boolean {
  if (name.length === 0 || name.length > 255 || name.startsWith("-")) return false;
  // No control characters either: a line break inside an argument has no business in a name.
  return [...name].every((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  });
}

/** Instances of one kind from `dns-sd -B _smb._tcp local.`: "… Add 2 14 local. _smb._tcp. Workshop NAS". */
export function parseInstances(output: string, type: string): string[] {
  const names = new Set<string>();
  const escaped = type.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const pattern = new RegExp(`^\\S+\\s+Add\\s+\\d+\\s+\\d+\\s+\\S+\\s+${escaped}\\.\\s+(.+?)\\s*$`);
  for (const line of output.split("\n")) {
    const match = pattern.exec(line);
    if (match && usableAsArgument(match[1]!)) names.add(match[1]!);
  }
  return [...names];
}

/** `\032` (a space) and the other decimal escapes Avahi writes in names. */
function avahiUnescape(text: string): string {
  return text.replace(/\\(\d{3})/g, (_match, code: string) => String.fromCharCode(Number(code))).replace(/\\(.)/g, "$1");
}

/**
 * Resolved services from `avahi-browse -a -r -p -t`: lines starting "=", fields split by
 * ";": interface, protocol, name, type, domain, host, address, port, text.
 */
export function parseAvahi(output: string): Announcement[] {
  const found: Announcement[] = [];
  for (const line of output.split("\n")) {
    if (!line.startsWith("=;")) continue;
    // A field holds a ";" only escaped, and the last (the TXT record) is not used.
    const fields = line.split(/(?<!\\);/);
    const [, , , name, type, , host, address, port] = fields;
    if (!name || !type || !TYPE.test(type)) continue;
    const portNumber = Number(port);
    found.push({
      type,
      name: avahiUnescape(name),
      host: host ? host.toLowerCase() : null,
      address: address ? address.split("%")[0]!.toLowerCase() : null,
      port: Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536 ? portNumber : null,
    });
  }
  return found;
}
